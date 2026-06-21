// services/gateway/internal/api/handlers/proxy.go

package handlers

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/datasentinel/gateway/internal/audit"
	"github.com/datasentinel/gateway/internal/config"
	"github.com/datasentinel/gateway/internal/controlplane"
	"github.com/datasentinel/gateway/internal/engine"
	"github.com/datasentinel/gateway/internal/metrics"
	"github.com/datasentinel/gateway/internal/policy"
)

// ProxyHandler is the main handler that intercepts, inspects, and forwards requests.
type ProxyHandler struct {
	cfg          *config.Config
	detector     *engine.Detector
	policyLoader *policy.PolicyLoader
	auditWriter  *audit.Writer
	cp           *controlplane.Client
	rdb          *redis.Client
	metrics      *metrics.Metrics
	transport    *http.Transport
	log          *zap.Logger
}

// NewProxyHandler creates a ProxyHandler with a shared connection pool.
func NewProxyHandler(
	cfg *config.Config,
	detector *engine.Detector,
	pl *policy.PolicyLoader,
	aw *audit.Writer,
	cp *controlplane.Client,
	rdb *redis.Client,
	m *metrics.Metrics,
	log *zap.Logger,
) *ProxyHandler {
	transport := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   cfg.UpstreamDialTimeout,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:          200,
		MaxIdleConnsPerHost:   20,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: cfg.UpstreamReadTimeout,
	}
	return &ProxyHandler{
		cfg:          cfg,
		detector:     detector,
		policyLoader: pl,
		auditWriter:  aw,
		cp:           cp,
		rdb:          rdb,
		metrics:      m,
		transport:    transport,
		log:          log,
	}
}

// Handle is the main gin handler: read request → inspect → enforce → forward → inspect response → return.
func (h *ProxyHandler) Handle(c *gin.Context) {
	start := time.Now()
	requestID := c.GetHeader("X-Request-ID")
	if requestID == "" {
		requestID = uuid.New().String()
	}
	c.Header("X-Request-ID", requestID)

	// Extract tenant from JWT claim injected by auth middleware
	tenantID, _ := c.Get("tenant_id")
	tid, _ := tenantID.(string)
	if tid == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing tenant context"})
		return
	}

	// Determine the upstream URL from the X-Upstream-URL header.
	// Callers must set this header; the gateway never guesses the destination.
	upstreamURL := c.GetHeader("X-Upstream-URL")
	if upstreamURL == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "X-Upstream-URL header is required"})
		return
	}
	parsedUpstream, err := url.Parse(upstreamURL)
	if err != nil || parsedUpstream.Host == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid X-Upstream-URL"})
		return
	}
	// SSRF guard: never proxy to cloud metadata / link-local endpoints. Normal
	// private ranges remain allowed so legitimate internal-API proxying works.
	if isBlockedDestination(parsedUpstream) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "destination not permitted"})
		return
	}

	// Load gateway rules for this tenant
	rules, err := h.policyLoader.GetRules(c.Request.Context(), tid)
	if err != nil {
		h.log.Warn("failed to load gateway rules — allowing request through",
			zap.String("tenant_id", tid), zap.Error(err))
		// Fail open: forward without inspection so legitimate traffic is not blocked
		h.forwardDirect(c, parsedUpstream, requestID)
		return
	}

	// ── Phase 1: Inspect request ─────────────────────────────────────────────
	var requestBody []byte
	if c.Request.Body != nil && c.Request.ContentLength != 0 {
		limited := io.LimitReader(c.Request.Body, h.cfg.MaxBodyBytes)
		requestBody, err = io.ReadAll(limited)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(requestBody))
	}

	// Find rules that match this request
	matchedRules := rules.MatchRules(c.Request.Method, c.Request.URL.Path, parsedUpstream.Host, "request")

	var (
		requestAction     = "allow"
		requestPIITypes   []string
		requestFieldNames []string
		modifiedRequest   = requestBody
	)

	for _, rule := range matchedRules {
		if len(requestBody) == 0 {
			break
		}
		detections := h.detectForRule(requestBody, rule)
		if len(detections) == 0 {
			continue
		}

		for _, d := range detections {
			requestPIITypes = appendUnique(requestPIITypes, d.PIIType)
			requestFieldNames = appendUnique(requestFieldNames, d.FieldName)
		}

		switch rule.Action {
		case "block":
			requestAction = "blocked"
			h.writeEvent(tid, rule, requestID, c, "blocked", requestPIITypes, requestFieldNames,
				len(requestBody), start, isLLMURL(upstreamURL))
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":      "request blocked by data privacy policy",
				"policy":     rule.Name,
				"request_id": requestID,
			})
			return

		case "mask":
			cfg := maskConfigFromRule(rule)
			modified, _, err := engine.MaskJSON(modifiedRequest, detections, cfg)
			if err == nil {
				modifiedRequest = modified
				requestAction = "masked"
			}

		case "redact":
			modified, _, err := engine.RedactJSON(modifiedRequest, detections)
			if err == nil {
				modifiedRequest = modified
				requestAction = "redacted"
			}

		case "tokenize":
			// Reversible, format-aware tokenization backed by the per-tenant
			// Redis vault. PII never leaves the estate in cleartext.
			vault := engine.NewTokenVault(h.rdb, tid)
			tokenized, _, terr := vault.TokenizeJSON(c.Request.Context(), modifiedRequest, detections)
			if terr != nil {
				h.log.Warn("tokenization failed — falling back to redaction",
					zap.String("tenant_id", tid), zap.Error(terr))
				if red, _, rerr := engine.RedactJSON(modifiedRequest, detections); rerr == nil {
					modifiedRequest = red
				}
				requestAction = "redacted"
			} else {
				modifiedRequest = tokenized
				requestAction = "tokenized"
			}

		case "encrypt":
			if enc, _, eerr := engine.EncryptJSON(modifiedRequest, detections, h.cfg.MasterEncryptionKey, tid); eerr == nil {
				modifiedRequest = enc
				requestAction = "encrypted"
			} else {
				h.log.Warn("encrypt action failed", zap.String("tenant_id", tid), zap.Error(eerr))
			}

		case "hash":
			if hashed, _, herr := engine.HashJSON(modifiedRequest, detections); herr == nil {
				modifiedRequest = hashed
				requestAction = "hashed"
			}

		case "alert":
			requestAction = "alert"
			go h.cp.RaiseAlert(context.Background(), tid, controlplane.AlertInput{
				AlertType: "policy_violation",
				Severity:  "high",
				Title:     "Gateway policy violation: " + rule.Name,
				Body:      "PII types detected in request to " + upstreamURL,
			})
		}
	}

	// ── Phase 2: Forward request upstream ───────────────────────────────────
	upstreamReq, err := h.buildUpstreamRequest(c, parsedUpstream, modifiedRequest)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadGateway, gin.H{"error": "failed to build upstream request"})
		return
	}

	upstreamResp, err := h.transport.RoundTrip(upstreamReq)
	if err != nil {
		h.log.Error("upstream request failed",
			zap.String("url", upstreamURL),
			zap.Error(err),
		)
		c.AbortWithStatusJSON(http.StatusBadGateway, gin.H{
			"error":      "upstream service unavailable",
			"request_id": requestID,
		})
		return
	}
	defer upstreamResp.Body.Close()

	// ── Phase 3: Inspect response ────────────────────────────────────────────
	responseBody, err := io.ReadAll(io.LimitReader(upstreamResp.Body, h.cfg.MaxBodyBytes))
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadGateway, gin.H{"error": "failed to read upstream response"})
		return
	}

	responseRules := rules.MatchRules(c.Request.Method, c.Request.URL.Path, parsedUpstream.Host, "response")
	var (
		responseAction    = "allow"
		responsePIITypes  []string
		responseFieldNames []string
		modifiedResponse  = responseBody
	)

	for _, rule := range responseRules {
		if len(responseBody) == 0 {
			break
		}
		detections := h.detectForRule(responseBody, rule)
		if len(detections) == 0 {
			continue
		}

		for _, d := range detections {
			responsePIITypes = appendUnique(responsePIITypes, d.PIIType)
			responseFieldNames = appendUnique(responseFieldNames, d.FieldName)
		}

		switch rule.Action {
		case "block":
			responseAction = "blocked"
			// For response blocking, return an empty body with the status
			modifiedResponse = []byte(`{"error":"response blocked by data privacy policy"}`)
			upstreamResp.StatusCode = http.StatusForbidden
			go h.cp.RaiseAlert(context.Background(), tid, controlplane.AlertInput{
				AlertType: "policy_violation", Severity: "high",
				Title: "Gateway blocked a response: " + rule.Name,
				Body:  "PII detected in response from " + upstreamURL,
			})

		case "mask":
			cfg := maskConfigFromRule(rule)
			modified, _, err := engine.MaskJSON(modifiedResponse, detections, cfg)
			if err == nil {
				modifiedResponse = modified
				responseAction = "masked"
			}

		case "redact":
			modified, _, err := engine.RedactJSON(modifiedResponse, detections)
			if err == nil {
				modifiedResponse = modified
				responseAction = "redacted"
			}

		case "tokenize":
			vault := engine.NewTokenVault(h.rdb, tid)
			if tokenized, _, terr := vault.TokenizeJSON(c.Request.Context(), modifiedResponse, detections); terr == nil {
				modifiedResponse = tokenized
				responseAction = "tokenized"
			}

		case "encrypt":
			if enc, _, eerr := engine.EncryptJSON(modifiedResponse, detections, h.cfg.MasterEncryptionKey, tid); eerr == nil {
				modifiedResponse = enc
				responseAction = "encrypted"
			}

		case "hash":
			if hashed, _, herr := engine.HashJSON(modifiedResponse, detections); herr == nil {
				modifiedResponse = hashed
				responseAction = "hashed"
			}

		case "alert":
			responseAction = "alert"
			go h.cp.RaiseAlert(context.Background(), tid, controlplane.AlertInput{
				AlertType: "policy_violation", Severity: "high",
				Title: "Gateway policy alert: " + rule.Name,
				Body:  "PII detected in response from " + upstreamURL,
			})
		}
	}

	// ── Phase 4: Write audit event ───────────────────────────────────────────
	latencyMs := uint16(time.Since(start).Milliseconds())
	if latencyMs > 65535 {
		latencyMs = 65535
	}

	allPIITypes := appendUnique(requestPIITypes, responsePIITypes...)
	allFields := appendUnique(requestFieldNames, responseFieldNames...)
	finalAction := responseAction
	if requestAction != "allow" {
		finalAction = requestAction
	}

	ruleID := ""
	policyID := ""
	if len(matchedRules) > 0 {
		ruleID = matchedRules[0].ID
		policyID = matchedRules[0].PolicyID
	}

	h.auditWriter.Write(&audit.GatewayEvent{
		ID:                  uuid.New().String(),
		TenantID:            tid,
		GatewayRuleID:       ruleID,
		Timestamp:           time.Now(),
		RequestID:           requestID,
		SourceIP:            c.ClientIP(),
		DestinationURL:      upstreamURL,
		HTTPMethod:          c.Request.Method,
		ActionTaken:         finalAction,
		PIITypesDetected:    allPIITypes,
		FieldNames:          allFields,
		PayloadSizeBytes:    uint32(len(requestBody) + len(responseBody)),
		ProcessingLatencyMs: latencyMs,
		WasLLMCall:          isLLMURL(upstreamURL),
		LLMProvider:         detectLLMProvider(upstreamURL),
		PolicyID:            policyID,
	})
	// Register the egress data flow so it surfaces on the data-flow map. Only
	// when actual PII was observed leaving toward an external destination.
	if len(allPIITypes) > 0 {
		destType := "external_api"
		if isLLMURL(upstreamURL) {
			destType = "llm"
		}
		go h.cp.RegisterDataFlow(context.Background(), tid, upstreamURL, destType, allPIITypes)
	}

	if h.metrics != nil {
		h.metrics.RecordRequest(finalAction, uint64(latencyMs), allPIITypes,
			finalAction == "blocked", isLLMURL(upstreamURL))
	}
	// ── Phase 5: Stream response to client ───────────────────────────────────
	h.copyResponseHeaders(c.Writer, upstreamResp)
	c.Writer.WriteHeader(upstreamResp.StatusCode)
	c.Writer.Write(modifiedResponse)
}

// ---- Helpers ----------------------------------------------------------------

// detectForRule scans a payload according to the rule's pii_types filter.
// If pii_types is empty, all PII types are checked. The filter is pushed down
// into the detector so irrelevant patterns are never evaluated.
func (h *ProxyHandler) detectForRule(data []byte, rule *policy.GatewayRule) []engine.DetectionResult {
	if len(rule.PIITypes) == 0 {
		return h.detector.ScanJSON(data)
	}
	filter := make(map[string]bool, len(rule.PIITypes))
	for _, pt := range rule.PIITypes {
		filter[pt] = true
	}
	return h.detector.ScanJSONFiltered(data, filter)
}

// buildUpstreamRequest constructs the outbound request to the upstream service.
func (h *ProxyHandler) buildUpstreamRequest(c *gin.Context, upstream *url.URL, body []byte) (*http.Request, error) {
	// Reconstruct target URL preserving path and query
	targetURL := *upstream
	if c.Request.URL.RawQuery != "" {
		targetURL.RawQuery = c.Request.URL.RawQuery
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), c.Request.Method, targetURL.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	// Copy headers, stripping hop-by-hop and gateway-internal headers
	hopByHop := map[string]bool{
		"Connection": true, "Keep-Alive": true, "Proxy-Authenticate": true,
		"Proxy-Authorization": true, "Te": true, "Trailers": true,
		"Transfer-Encoding": true, "Upgrade": true,
		"X-Upstream-Url": true, // strip our internal header
	}
	for key, vals := range c.Request.Header {
		if hopByHop[key] {
			continue
		}
		for _, v := range vals {
			req.Header.Add(key, v)
		}
	}

	// Fix Content-Length
	if len(body) > 0 {
		req.Header.Set("Content-Length", strconv.Itoa(len(body)))
		req.ContentLength = int64(len(body))
	}

	// Propagate client IP
	if clientIP := c.ClientIP(); clientIP != "" {
		req.Header.Set("X-Forwarded-For", clientIP)
		req.Header.Set("X-Real-IP", clientIP)
	}

	return req, nil
}

// forwardDirect proxies a request without inspection (fail-open path).
func (h *ProxyHandler) forwardDirect(c *gin.Context, upstream *url.URL, requestID string) {
	var body []byte
	if c.Request.Body != nil {
		body, _ = io.ReadAll(io.LimitReader(c.Request.Body, h.cfg.MaxBodyBytes))
	}
	req, err := h.buildUpstreamRequest(c, upstream, body)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadGateway, gin.H{"error": "proxy error"})
		return
	}
	resp, err := h.transport.RoundTrip(req)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadGateway, gin.H{"error": "upstream unavailable"})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, h.cfg.MaxBodyBytes))
	h.copyResponseHeaders(c.Writer, resp)
	c.Writer.WriteHeader(resp.StatusCode)
	c.Writer.Write(respBody)
}

// copyResponseHeaders copies upstream response headers to the client writer.
func (h *ProxyHandler) copyResponseHeaders(w gin.ResponseWriter, resp *http.Response) {
	skipHeaders := map[string]bool{
		"Transfer-Encoding": true,
		"Connection":        true,
	}
	for key, vals := range resp.Header {
		if skipHeaders[key] {
			continue
		}
		for _, v := range vals {
			w.Header().Add(key, v)
		}
	}
	// Add gateway identification header
	w.Header().Set("X-DataSentinel-Gateway", "1")
}

// writeEvent logs a blocking event to the audit writer.
func (h *ProxyHandler) writeEvent(tenantID string, rule *policy.GatewayRule, requestID string,
	c *gin.Context, action string, piiTypes, fields []string, bodySize int, start time.Time, isLLM bool) {
	latencyMs := uint16(time.Since(start).Milliseconds())
	if h.metrics != nil {
		h.metrics.RecordRequest(action, uint64(latencyMs), piiTypes, action == "blocked", isLLM)
	}
	h.auditWriter.Write(&audit.GatewayEvent{
		TenantID:            tenantID,
		GatewayRuleID:       rule.ID,
		RequestID:           requestID,
		SourceIP:            c.ClientIP(),
		DestinationURL:      c.GetHeader("X-Upstream-URL"),
		HTTPMethod:          c.Request.Method,
		ActionTaken:         action,
		PIITypesDetected:    piiTypes,
		FieldNames:          fields,
		PayloadSizeBytes:    uint32(bodySize),
		ProcessingLatencyMs: latencyMs,
		WasLLMCall:          isLLM,
		LLMProvider:         detectLLMProvider(c.GetHeader("X-Upstream-URL")),
		PolicyID:            rule.PolicyID,
	})
}

func maskConfigFromRule(rule *policy.GatewayRule) engine.MaskingConfig {
	mc := rule.MaskConfig
	strategy := engine.MaskingStrategy(mc.Strategy)
	if strategy == "" {
		strategy = engine.MaskPartial
	}
	maskChar := mc.MaskChar
	if maskChar == "" {
		maskChar = "*"
	}
	return engine.MaskingConfig{
		Strategy:      strategy,
		MaskChar:      maskChar,
		PreserveFirst: mc.PreserveFirst,
		PreserveLast:  mc.PreserveLast,
		RedactLabel:   mc.RedactLabel,
	}
}

func appendUnique(slice []string, items ...string) []string {
	seen := make(map[string]bool, len(slice))
	for _, s := range slice {
		seen[s] = true
	}
	for _, item := range items {
		if !seen[item] {
			seen[item] = true
			slice = append(slice, item)
		}
	}
	return slice
}

// llmHostMarkers are substrings that identify a known LLM provider endpoint.
// The gateway can already proxy ANY outbound API via X-Upstream-URL; matching
// here only decides whether to dispatch through the LLM-aware handler so that
// prompts/completions are inspected and redacted in the provider's wire format.
var llmHostMarkers = []string{
	// First-party model providers
	"api.openai.com",                    // OpenAI
	"api.anthropic.com",                 // Anthropic
	"generativelanguage.googleapis.com", // Google Gemini (AI Studio)
	"aiplatform.googleapis.com",         // Google Vertex AI
	"api.cohere.com", "api.cohere.ai",   // Cohere
	"api.mistral.ai",                    // Mistral
	"api.perplexity.ai",                 // Perplexity
	"api.x.ai",                          // xAI (Grok)
	"api.deepseek.com",                  // DeepSeek
	"api.ai21.com",                      // AI21
	"api.voyageai.com",                  // Voyage
	"integrate.api.nvidia.com",          // NVIDIA NIM
	"api.sambanova.ai",                  // SambaNova
	// Aggregators / inference platforms
	"openrouter.ai",                     // OpenRouter
	"api.groq.com",                      // Groq
	"api.together.xyz", "api.together.ai", // Together AI
	"api.fireworks.ai",                  // Fireworks AI
	"api.deepinfra.com",                 // DeepInfra
	"api.endpoints.anyscale.com",        // Anyscale
	"api.replicate.com",                 // Replicate
	"api-inference.huggingface.co",      // Hugging Face Inference API
	"gateway.ai.cloudflare.com",         // Cloudflare AI Gateway
	// Hyperscaler-hosted model endpoints
	"openai.azure.com",                  // Azure OpenAI
	"models.inference.ai.azure.com",     // Azure AI model inference
	"inference.ai.azure.com",            // Azure AI Foundry
	"bedrock-runtime.",                  // AWS Bedrock (bedrock-runtime.<region>.amazonaws.com)
}

func isLLMURL(u string) bool {
	lower := strings.ToLower(u)
	for _, marker := range llmHostMarkers {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

// IsLLMUpstream reports whether an upstream URL targets a known LLM provider.
// Exported for the router to dispatch LLM traffic to the LLM handler.
func IsLLMUpstream(u string) bool { return isLLMURL(u) }

// blockedMetadataHosts are SSRF-sensitive endpoints that must never be proxied.
var blockedMetadataHosts = map[string]bool{
	"169.254.169.254":          true, // AWS/GCP/Azure instance metadata (IMDS)
	"metadata.google.internal": true, // GCP metadata DNS name
	"100.100.100.200":          true, // Alibaba Cloud metadata
}

// isBlockedDestination reports whether a destination is an SSRF-sensitive host
// (cloud metadata or any link-local address). Standard private ranges are NOT
// blocked so the gateway can still front legitimate internal APIs.
func isBlockedDestination(parsed *url.URL) bool {
	host := strings.ToLower(parsed.Hostname())
	if blockedMetadataHosts[host] {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return true
		}
	}
	return false
}

func detectLLMProvider(u string) string {
	lower := strings.ToLower(u)
	switch {
	case strings.Contains(lower, "openai.azure.com"):
		return "azure_openai"
	case strings.Contains(lower, "inference.ai.azure.com"):
		return "azure_ai"
	case strings.Contains(lower, "bedrock-runtime."):
		return "aws_bedrock"
	case strings.Contains(lower, "aiplatform.googleapis.com"):
		return "google_vertex"
	case strings.Contains(lower, "generativelanguage.googleapis.com"):
		return "google"
	case strings.Contains(lower, "openai.com"):
		return "openai"
	case strings.Contains(lower, "anthropic.com"):
		return "anthropic"
	case strings.Contains(lower, "cohere."):
		return "cohere"
	case strings.Contains(lower, "mistral.ai"):
		return "mistral"
	case strings.Contains(lower, "perplexity.ai"):
		return "perplexity"
	case strings.Contains(lower, "x.ai"):
		return "xai"
	case strings.Contains(lower, "deepseek.com"):
		return "deepseek"
	case strings.Contains(lower, "ai21.com"):
		return "ai21"
	case strings.Contains(lower, "voyageai.com"):
		return "voyage"
	case strings.Contains(lower, "nvidia.com"):
		return "nvidia"
	case strings.Contains(lower, "sambanova.ai"):
		return "sambanova"
	case strings.Contains(lower, "groq.com"):
		return "groq"
	case strings.Contains(lower, "together."):
		return "together"
	case strings.Contains(lower, "fireworks.ai"):
		return "fireworks"
	case strings.Contains(lower, "deepinfra.com"):
		return "deepinfra"
	case strings.Contains(lower, "anyscale.com"):
		return "anyscale"
	case strings.Contains(lower, "replicate.com"):
		return "replicate"
	case strings.Contains(lower, "huggingface.co"):
		return "huggingface"
	case strings.Contains(lower, "openrouter.ai"):
		return "openrouter"
	case strings.Contains(lower, "cloudflare.com"):
		return "cloudflare"
	}
	return ""
}
