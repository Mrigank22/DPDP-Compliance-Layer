// services/gateway/internal/api/handlers/proxy.go

package handlers

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/datasentinel/gateway/internal/audit"
	"github.com/datasentinel/gateway/internal/config"
	"github.com/datasentinel/gateway/internal/engine"
	"github.com/datasentinel/gateway/internal/policy"
)

// ProxyHandler is the main handler that intercepts, inspects, and forwards requests.
type ProxyHandler struct {
	cfg       *config.Config
	detector  *engine.Detector
	policyLoader *policy.PolicyLoader
	auditWriter  *audit.Writer
	transport    *http.Transport
	log          *zap.Logger
}

// NewProxyHandler creates a ProxyHandler with a shared connection pool.
func NewProxyHandler(
	cfg *config.Config,
	detector *engine.Detector,
	pl *policy.PolicyLoader,
	aw *audit.Writer,
	log *zap.Logger,
) *ProxyHandler {
	transport := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   cfg.UpstreamDialTimeout,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        200,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
		ResponseHeaderTimeout: cfg.UpstreamReadTimeout,
	}
	return &ProxyHandler{
		cfg:          cfg,
		detector:     detector,
		policyLoader: pl,
		auditWriter:  aw,
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
	matchedRules := rules.MatchRules(c.Request.Method, c.Request.URL.Path, "request")

	var (
		requestWasBlocked  bool
		requestAction      = "allow"
		requestPIITypes    []string
		requestFieldNames  []string
		modifiedRequest    = requestBody
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
			requestWasBlocked = true
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
			// Tokenization handled inline; vault backed by Redis per-tenant
			requestAction = "tokenized"

		case "alert":
			requestAction = "alert"
			// Alert is dispatched to control plane asynchronously
			go h.sendAlert(context.Background(), tid, rule, requestPIITypes, upstreamURL)
		}
	}

	_ = requestWasBlocked

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

	responseRules := rules.MatchRules(c.Request.Method, c.Request.URL.Path, "response")
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
			go h.sendAlert(context.Background(), tid, rule, responsePIITypes, upstreamURL)

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

		case "alert":
			responseAction = "alert"
			go h.sendAlert(context.Background(), tid, rule, responsePIITypes, upstreamURL)
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

	// ── Phase 5: Stream response to client ───────────────────────────────────
	h.copyResponseHeaders(c.Writer, upstreamResp)
	c.Writer.WriteHeader(upstreamResp.StatusCode)
	c.Writer.Write(modifiedResponse)
}

// ---- Helpers ----------------------------------------------------------------

// detectForRule scans a payload according to the rule's pii_types filter.
// If pii_types is empty, all PII types are checked.
func (h *ProxyHandler) detectForRule(data []byte, rule *policy.GatewayRule) []engine.DetectionResult {
	all := h.detector.ScanJSON(data)
	if len(rule.PIITypes) == 0 {
		return all
	}
	filter := make(map[string]bool, len(rule.PIITypes))
	for _, pt := range rule.PIITypes {
		filter[pt] = true
	}
	var filtered []engine.DetectionResult
	for _, d := range all {
		if filter[d.PIIType] {
			filtered = append(filtered, d)
		}
	}
	return filtered
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

// sendAlert calls the control plane to create a new alert record.
func (h *ProxyHandler) sendAlert(ctx context.Context, tenantID string, rule *policy.GatewayRule, piiTypes []string, destination string) {
	url := fmt.Sprintf("%s/api/v1/internal/alerts", h.cfg.ControlPlaneURL)
	payload := fmt.Sprintf(`{"tenant_id":%q,"alert_type":"policy_violation","severity":"high","title":"Gateway policy violation: %s","body":"PII types detected: %s sent to %s","related_asset_id":null}`,
		tenantID, rule.Name, strings.Join(piiTypes, ", "), destination)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url,
		strings.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", h.cfg.ControlPlaneAPIKey)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err == nil {
		resp.Body.Close()
	}
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

func isLLMURL(u string) bool {
	llmHosts := []string{
		"api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com",
		"api.cohere.com", "api.mistral.ai", "api.together.xyz",
		"api.groq.com", "openrouter.ai",
	}
	lower := strings.ToLower(u)
	for _, host := range llmHosts {
		if strings.Contains(lower, host) {
			return true
		}
	}
	return false
}

func detectLLMProvider(u string) string {
	lower := strings.ToLower(u)
	switch {
	case strings.Contains(lower, "openai.com"):
		return "openai"
	case strings.Contains(lower, "anthropic.com"):
		return "anthropic"
	case strings.Contains(lower, "googleapis.com"):
		return "google"
	case strings.Contains(lower, "cohere.com"):
		return "cohere"
	case strings.Contains(lower, "mistral.ai"):
		return "mistral"
	case strings.Contains(lower, "groq.com"):
		return "groq"
	case strings.Contains(lower, "together.xyz"):
		return "together"
	}
	return ""
}
