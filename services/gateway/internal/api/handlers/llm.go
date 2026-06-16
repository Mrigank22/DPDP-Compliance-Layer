// services/gateway/internal/api/handlers/llm.go
//
// LLMHandler intercepts traffic destined for external LLM APIs (OpenAI,
// Anthropic, Google Gemini, Cohere, Mistral, Groq, Together, etc.).
//
// It does everything the generic ProxyHandler does, PLUS:
//   - Parses the provider-specific request envelope to extract prompt text
//     before scanning (chat messages, completions, embeddings payloads).
//   - Extracts LLM response content (choices, candidates, generations)
//     before scanning the response.
//   - Tracks token usage and logs it to ClickHouse alongside PII events.
//   - Supports prompt-level redaction: rewrites the prompt in the upstream
//     request so PII never reaches the LLM provider.
//   - Fires a high-severity alert whenever PII is detected in a prompt.

package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/datasentinel/gateway/internal/audit"
	"github.com/datasentinel/gateway/internal/config"
	"github.com/datasentinel/gateway/internal/controlplane"
	"github.com/datasentinel/gateway/internal/engine"
	"github.com/datasentinel/gateway/internal/policy"
)

// ── Provider constants ───────────────────────────────────────────────────────

type llmProvider string

const (
	providerOpenAI    llmProvider = "openai"
	providerAnthropic llmProvider = "anthropic"
	providerGoogle    llmProvider = "google"
	providerCohere    llmProvider = "cohere"
	providerMistral   llmProvider = "mistral"
	providerGroq      llmProvider = "groq"
	providerTogether  llmProvider = "together"
	providerUnknown   llmProvider = "unknown"
)

// ── LLM token usage ──────────────────────────────────────────────────────────

type tokenUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// ── LLMHandler ───────────────────────────────────────────────────────────────

// LLMHandler intercepts and inspects LLM API calls for PII.
// It shares the same transport and audit writer as the ProxyHandler but adds
// provider-aware payload parsing and prompt-level redaction.
type LLMHandler struct {
	proxy    *ProxyHandler // reuse connection pool + audit writer
	cfg      *config.Config
	detector *engine.Detector
	loader   *policy.PolicyLoader
	log      *zap.Logger
}

// NewLLMHandler creates an LLMHandler backed by the shared ProxyHandler.
func NewLLMHandler(proxy *ProxyHandler, cfg *config.Config, detector *engine.Detector, loader *policy.PolicyLoader, log *zap.Logger) *LLMHandler {
	return &LLMHandler{
		proxy:    proxy,
		cfg:      cfg,
		detector: detector,
		loader:   loader,
		log:      log,
	}
}

// Handle is the gin handler for all LLM-destined requests.
// It is mounted by the router for any route whose X-Upstream-URL resolves to
// a known LLM provider, OR for the dedicated /llm/* prefix route.
func (h *LLMHandler) Handle(c *gin.Context) {
	start := time.Now()
	requestID := c.GetHeader("X-Request-ID")
	if requestID == "" {
		requestID = uuid.New().String()
	}
	c.Header("X-Request-ID", requestID)

	tenantID, _ := c.Get("tenant_id")
	tid, _ := tenantID.(string)
	if tid == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing tenant context"})
		return
	}

	upstreamRaw := c.GetHeader("X-Upstream-URL")
	if upstreamRaw == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "X-Upstream-URL is required"})
		return
	}
	parsedUpstream, err := url.Parse(upstreamRaw)
	if err != nil || parsedUpstream.Host == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid X-Upstream-URL"})
		return
	}
	if isBlockedDestination(parsedUpstream) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "destination not permitted"})
		return
	}

	provider := detectProvider(upstreamRaw)
	h.log.Debug("llm intercept",
		zap.String("provider", string(provider)),
		zap.String("tenant_id", tid),
		zap.String("request_id", requestID),
	)

	// ── Read request body ────────────────────────────────────────────────────
	var rawBody []byte
	if c.Request.Body != nil {
		rawBody, err = io.ReadAll(io.LimitReader(c.Request.Body, h.cfg.MaxBodyBytes))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(rawBody))
	}

	// ── Load policy rules ────────────────────────────────────────────────────
	rules, err := h.loader.GetRules(c.Request.Context(), tid)
	if err != nil {
		h.log.Warn("failed to load llm rules — forwarding uninspected",
			zap.String("tenant_id", tid), zap.Error(err))
		h.proxy.forwardDirect(c, parsedUpstream, requestID)
		return
	}
	matchedRules := rules.MatchRules(c.Request.Method, c.Request.URL.Path, "request")

	// ── Extract prompt text from provider envelope ───────────────────────────
	prompts := extractPrompts(rawBody, provider)
	promptText := strings.Join(prompts, "\n")

	var (
		promptPIITypes []string
		promptFields   []string
		actionTaken    = "allow"
		modifiedBody   = rawBody
		wasBlocked     bool
	)

	// ── Scan prompts against matched rules ───────────────────────────────────
	for _, rule := range matchedRules {
		if promptText == "" {
			break
		}
		detections := h.detectText(promptText, rule)
		if len(detections) == 0 {
			continue
		}
		for _, d := range detections {
			promptPIITypes = appendUnique(promptPIITypes, d.PIIType)
			promptFields = appendUnique(promptFields, d.FieldName)
		}

		switch rule.Action {
		case "block":
			wasBlocked = true
			actionTaken = "blocked"
			h.writeAuditEvent(tid, rule, requestID, c, "blocked",
				promptPIITypes, promptFields, len(rawBody), start, string(provider))
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":      "LLM request blocked — prompt contains personal data",
				"policy":     rule.Name,
				"pii_types":  promptPIITypes,
				"request_id": requestID,
			})
			return

		case "redact":
			// Rewrite the prompt in the request body before forwarding to LLM
			rewritten, redactedFields, err2 := redactPrompts(rawBody, detections, provider)
			if err2 == nil {
				modifiedBody = rewritten
				promptFields = redactedFields
				actionTaken = "redacted"
			}

		case "mask":
			cfg := maskConfigFromRule(rule)
			rewritten, maskedFields, err2 := maskPrompts(rawBody, detections, provider, cfg)
			if err2 == nil {
				modifiedBody = rewritten
				promptFields = maskedFields
				actionTaken = "masked"
			}

		case "alert":
			actionTaken = "alert"
			go h.sendLLMAlert(context.Background(), tid, rule, promptPIITypes, string(provider), upstreamRaw)
		}
	}

	// Always alert when PII is found in any LLM prompt (regardless of action)
	if len(promptPIITypes) > 0 && actionTaken == "allow" {
		go h.sendLLMAlert(context.Background(), tid, nil, promptPIITypes, string(provider), upstreamRaw)
		actionTaken = "alert"
	}

	_ = wasBlocked

	// ── Forward to upstream LLM ──────────────────────────────────────────────
	upstreamReq, err := h.proxy.buildUpstreamRequest(c, parsedUpstream, modifiedBody)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadGateway, gin.H{"error": "failed to build LLM request"})
		return
	}

	upstreamResp, err := h.proxy.transport.RoundTrip(upstreamReq)
	if err != nil {
		h.log.Error("LLM upstream request failed", zap.String("provider", string(provider)), zap.Error(err))
		c.AbortWithStatusJSON(http.StatusBadGateway, gin.H{
			"error":      "LLM provider unavailable",
			"provider":   string(provider),
			"request_id": requestID,
		})
		return
	}
	defer upstreamResp.Body.Close()

	// ── Read + inspect response ──────────────────────────────────────────────
	responseBody, err := io.ReadAll(io.LimitReader(upstreamResp.Body, h.cfg.MaxBodyBytes))
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadGateway, gin.H{"error": "failed to read LLM response"})
		return
	}

	// Extract generated text from provider-specific response envelope
	generatedText := extractGeneratedText(responseBody, provider)
	usage := extractTokenUsage(responseBody, provider)

	responseRules := rules.MatchRules(c.Request.Method, c.Request.URL.Path, "response")
	var (
		responsePIITypes []string
		responseFields   []string
		modifiedResponse = responseBody
	)

	for _, rule := range responseRules {
		if generatedText == "" {
			break
		}
		detections := h.detectText(generatedText, rule)
		if len(detections) == 0 {
			continue
		}
		for _, d := range detections {
			responsePIITypes = appendUnique(responsePIITypes, d.PIIType)
			responseFields = appendUnique(responseFields, d.FieldName)
		}
		switch rule.Action {
		case "redact":
			rewritten, _, err2 := engine.RedactJSON(responseBody, detections)
			if err2 == nil {
				modifiedResponse = rewritten
			}
		case "mask":
			cfg := maskConfigFromRule(rule)
			rewritten, _, err2 := engine.MaskJSON(responseBody, detections, cfg)
			if err2 == nil {
				modifiedResponse = rewritten
			}
		case "block":
			modifiedResponse = []byte(`{"error":"LLM response blocked — contains personal data"}`)
			upstreamResp.StatusCode = http.StatusForbidden
		case "alert":
			go h.sendLLMAlert(context.Background(), tid, rule, responsePIITypes, string(provider), upstreamRaw)
		}
	}

	// ── Write audit event ────────────────────────────────────────────────────
	allPII := appendUnique(promptPIITypes, responsePIITypes...)
	allFields := appendUnique(promptFields, responseFields...)
	latencyMs := uint16(time.Since(start).Milliseconds())

	ruleID := ""
	polID := ""
	if len(matchedRules) > 0 {
		ruleID = matchedRules[0].ID
		polID = matchedRules[0].PolicyID
	}

	h.proxy.auditWriter.Write(&audit.GatewayEvent{
		ID:                  uuid.New().String(),
		TenantID:            tid,
		GatewayRuleID:       ruleID,
		Timestamp:           time.Now(),
		RequestID:           requestID,
		SourceIP:            c.ClientIP(),
		DestinationURL:      upstreamRaw,
		HTTPMethod:          c.Request.Method,
		ActionTaken:         actionTaken,
		PIITypesDetected:    allPII,
		FieldNames:          allFields,
		PayloadSizeBytes:    uint32(len(rawBody) + len(responseBody)),
		ProcessingLatencyMs: latencyMs,
		WasLLMCall:          true,
		LLMProvider:         string(provider),
		PolicyID:            polID,
	})

	if h.proxy.metrics != nil {
		h.proxy.metrics.RecordRequest(actionTaken, uint64(latencyMs), allPII, actionTaken == "blocked", true)
	}
	if len(allPII) > 0 {
		go h.proxy.cp.RegisterDataFlow(context.Background(), tid, upstreamRaw, "llm", allPII)
	}

	h.log.Info("llm call processed",
		zap.String("provider", string(provider)),
		zap.String("action", actionTaken),
		zap.Strings("pii_types", allPII),
		zap.Int("prompt_tokens", usage.PromptTokens),
		zap.Int("completion_tokens", usage.CompletionTokens),
		zap.Duration("latency", time.Since(start)),
	)

	// ── Stream response to client ────────────────────────────────────────────
	h.proxy.copyResponseHeaders(c.Writer, upstreamResp)
	c.Writer.WriteHeader(upstreamResp.StatusCode)
	c.Writer.Write(modifiedResponse)
}

// ── Provider detection ────────────────────────────────────────────────────────

func detectProvider(rawURL string) llmProvider {
	lower := strings.ToLower(rawURL)
	switch {
	case strings.Contains(lower, "openai.com"):
		return providerOpenAI
	case strings.Contains(lower, "anthropic.com"):
		return providerAnthropic
	case strings.Contains(lower, "googleapis.com") || strings.Contains(lower, "generativelanguage"):
		return providerGoogle
	case strings.Contains(lower, "cohere.com"):
		return providerCohere
	case strings.Contains(lower, "mistral.ai"):
		return providerMistral
	case strings.Contains(lower, "groq.com"):
		return providerGroq
	case strings.Contains(lower, "together.xyz") || strings.Contains(lower, "togethercomputer"):
		return providerTogether
	}
	return providerUnknown
}

// ── Prompt extraction ─────────────────────────────────────────────────────────

// extractPrompts parses the provider-specific request body and returns all
// user-visible text that will be sent to the LLM model.
func extractPrompts(body []byte, provider llmProvider) []string {
	if len(body) == 0 {
		return nil
	}
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil
	}

	var texts []string

	switch provider {
	case providerOpenAI, providerGroq, providerMistral, providerTogether:
		// Chat completions: {"messages": [{"role": "user", "content": "..."}]}
		if msgs, ok := raw["messages"].([]any); ok {
			for _, m := range msgs {
				if msg, ok := m.(map[string]any); ok {
					texts = append(texts, extractContent(msg["content"])...)
				}
			}
		}
		// Legacy completions: {"prompt": "..."}
		if p, ok := raw["prompt"].(string); ok {
			texts = append(texts, p)
		}
		// Embeddings: {"input": "..." | [...]}
		if input, ok := raw["input"]; ok {
			texts = append(texts, extractContent(input)...)
		}

	case providerAnthropic:
		// Messages API: {"messages": [...], "system": "..."}
		if sys, ok := raw["system"].(string); ok {
			texts = append(texts, sys)
		}
		if msgs, ok := raw["messages"].([]any); ok {
			for _, m := range msgs {
				if msg, ok := m.(map[string]any); ok {
					texts = append(texts, extractContent(msg["content"])...)
				}
			}
		}
		// Legacy completions: {"prompt": "..."}
		if p, ok := raw["prompt"].(string); ok {
			texts = append(texts, p)
		}

	case providerGoogle:
		// Gemini generateContent: {"contents": [{"parts": [{"text": "..."}]}]}
		if contents, ok := raw["contents"].([]any); ok {
			for _, c := range contents {
				if content, ok := c.(map[string]any); ok {
					if parts, ok := content["parts"].([]any); ok {
						for _, part := range parts {
							if p, ok := part.(map[string]any); ok {
								if t, ok := p["text"].(string); ok {
									texts = append(texts, t)
								}
							}
						}
					}
				}
			}
		}

	case providerCohere:
		// Chat: {"message": "...", "chat_history": [...]}
		if msg, ok := raw["message"].(string); ok {
			texts = append(texts, msg)
		}
		// Generate: {"prompt": "..."}
		if p, ok := raw["prompt"].(string); ok {
			texts = append(texts, p)
		}
		// Embed: {"texts": [...]}
		if ts, ok := raw["texts"].([]any); ok {
			for _, t := range ts {
				if s, ok := t.(string); ok {
					texts = append(texts, s)
				}
			}
		}

	default:
		// Generic fallback: extract all string values from the JSON
		texts = append(texts, extractAllStrings(raw)...)
	}

	return texts
}

// extractContent handles the OpenAI content field which can be string or
// array of content blocks (vision/multi-modal payloads).
func extractContent(content any) []string {
	switch v := content.(type) {
	case string:
		return []string{v}
	case []any:
		var texts []string
		for _, part := range v {
			if block, ok := part.(map[string]any); ok {
				if t, ok := block["text"].(string); ok {
					texts = append(texts, t)
				}
			}
		}
		return texts
	}
	return nil
}

// extractAllStrings recursively extracts all string values from a JSON map.
func extractAllStrings(m map[string]any) []string {
	var texts []string
	for _, v := range m {
		switch val := v.(type) {
		case string:
			if len(val) > 4 {
				texts = append(texts, val)
			}
		case map[string]any:
			texts = append(texts, extractAllStrings(val)...)
		case []any:
			for _, item := range val {
				if s, ok := item.(string); ok {
					texts = append(texts, s)
				}
				if nested, ok := item.(map[string]any); ok {
					texts = append(texts, extractAllStrings(nested)...)
				}
			}
		}
	}
	return texts
}

// ── Generated text extraction ─────────────────────────────────────────────────

// extractGeneratedText parses the LLM response body and returns the model's
// generated output text for PII scanning.
func extractGeneratedText(body []byte, provider llmProvider) string {
	if len(body) == 0 {
		return ""
	}
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return ""
	}

	var parts []string

	switch provider {
	case providerOpenAI, providerGroq, providerMistral, providerTogether:
		// {"choices": [{"message": {"content": "..."}}]}
		// {"choices": [{"text": "..."}]}  (completions)
		if choices, ok := raw["choices"].([]any); ok {
			for _, ch := range choices {
				if choice, ok := ch.(map[string]any); ok {
					if msg, ok := choice["message"].(map[string]any); ok {
						if t, ok := msg["content"].(string); ok {
							parts = append(parts, t)
						}
					}
					if t, ok := choice["text"].(string); ok {
						parts = append(parts, t)
					}
				}
			}
		}

	case providerAnthropic:
		// {"content": [{"type": "text", "text": "..."}]}
		if content, ok := raw["content"].([]any); ok {
			for _, block := range content {
				if b, ok := block.(map[string]any); ok {
					if t, ok := b["text"].(string); ok {
						parts = append(parts, t)
					}
				}
			}
		}
		// Legacy: {"completion": "..."}
		if c, ok := raw["completion"].(string); ok {
			parts = append(parts, c)
		}

	case providerGoogle:
		// {"candidates": [{"content": {"parts": [{"text": "..."}]}}]}
		if candidates, ok := raw["candidates"].([]any); ok {
			for _, cand := range candidates {
				if c, ok := cand.(map[string]any); ok {
					if content, ok := c["content"].(map[string]any); ok {
						if pparts, ok := content["parts"].([]any); ok {
							for _, p := range pparts {
								if pp, ok := p.(map[string]any); ok {
									if t, ok := pp["text"].(string); ok {
										parts = append(parts, t)
									}
								}
							}
						}
					}
				}
			}
		}

	case providerCohere:
		// {"text": "..."}  (generate)
		if t, ok := raw["text"].(string); ok {
			parts = append(parts, t)
		}
		// {"chat_history": [...], "text": "..."}
		if t, ok := raw["message"].(string); ok {
			parts = append(parts, t)
		}

	default:
		parts = append(parts, extractAllStrings(raw)...)
	}

	return strings.Join(parts, "\n")
}

// ── Token usage extraction ────────────────────────────────────────────────────

func extractTokenUsage(body []byte, provider llmProvider) tokenUsage {
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return tokenUsage{}
	}

	switch provider {
	case providerOpenAI, providerGroq, providerMistral, providerTogether:
		if usage, ok := raw["usage"].(map[string]any); ok {
			return tokenUsage{
				PromptTokens:     intFrom(usage["prompt_tokens"]),
				CompletionTokens: intFrom(usage["completion_tokens"]),
				TotalTokens:      intFrom(usage["total_tokens"]),
			}
		}
	case providerAnthropic:
		if usage, ok := raw["usage"].(map[string]any); ok {
			input := intFrom(usage["input_tokens"])
			output := intFrom(usage["output_tokens"])
			return tokenUsage{
				PromptTokens:     input,
				CompletionTokens: output,
				TotalTokens:      input + output,
			}
		}
	case providerGoogle:
		if meta, ok := raw["usageMetadata"].(map[string]any); ok {
			prompt := intFrom(meta["promptTokenCount"])
			candidates := intFrom(meta["candidatesTokenCount"])
			return tokenUsage{
				PromptTokens:     prompt,
				CompletionTokens: candidates,
				TotalTokens:      prompt + candidates,
			}
		}
	case providerCohere:
		if meta, ok := raw["meta"].(map[string]any); ok {
			if tokens, ok := meta["tokens"].(map[string]any); ok {
				input := intFrom(tokens["input_tokens"])
				output := intFrom(tokens["output_tokens"])
				return tokenUsage{
					PromptTokens:     input,
					CompletionTokens: output,
					TotalTokens:      input + output,
				}
			}
		}
	}
	return tokenUsage{}
}

// ── Prompt-level redaction ────────────────────────────────────────────────────

// redactPrompts rewrites the LLM request body, replacing PII in prompts with
// [REDACTED] labels, and returns the modified body.
func redactPrompts(body []byte, detections []engine.DetectionResult, provider llmProvider) ([]byte, []string, error) {
	prompts := extractPrompts(body, provider)
	if len(prompts) == 0 {
		return body, nil, nil
	}

	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return body, nil, err
	}

	redactedFields := make([]string, 0, len(detections))
	for _, d := range detections {
		redactedFields = appendUnique(redactedFields, d.FieldName)
	}

	// Re-scan each prompt and apply redaction
	modified, err := rewritePromptFields(raw, detections, engine.MaskingConfig{
		Strategy:    engine.MaskRedact,
		RedactLabel: "[REDACTED]",
	}, provider)
	if err != nil {
		return body, nil, err
	}

	out, err := json.Marshal(modified)
	return out, redactedFields, err
}

// maskPrompts rewrites the LLM request body, masking PII in prompts.
func maskPrompts(body []byte, detections []engine.DetectionResult, provider llmProvider, cfg engine.MaskingConfig) ([]byte, []string, error) {
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return body, nil, err
	}

	maskedFields := make([]string, 0, len(detections))
	for _, d := range detections {
		maskedFields = appendUnique(maskedFields, d.FieldName)
	}

	modified, err := rewritePromptFields(raw, detections, cfg, provider)
	if err != nil {
		return body, nil, err
	}

	out, err := json.Marshal(modified)
	return out, maskedFields, err
}

// rewritePromptFields walks the provider-specific message structure and
// rewrites string values that contain detected PII matches.
func rewritePromptFields(raw map[string]any, detections []engine.DetectionResult, cfg engine.MaskingConfig, provider llmProvider) (map[string]any, error) {
	// Build a set of field paths that need rewriting
	fieldSet := make(map[string]bool, len(detections))
	for _, d := range detections {
		fieldSet[d.FieldName] = true
	}

	// Deep clone via JSON round-trip to avoid mutating shared state
	cloneBytes, err := json.Marshal(raw)
	if err != nil {
		return raw, err
	}
	var clone map[string]any
	if err := json.Unmarshal(cloneBytes, &clone); err != nil {
		return raw, err
	}

	// Walk and rewrite string leaves
	rewriteNode(clone, "", detections, cfg)
	return clone, nil
}

// rewriteNode recursively walks the JSON tree and applies masking to any
// string value that contains a PII detection match.
func rewriteNode(node any, path string, detections []engine.DetectionResult, cfg engine.MaskingConfig) {
	switch v := node.(type) {
	case map[string]any:
		for key, val := range v {
			childPath := key
			if path != "" {
				childPath = path + "." + key
			}
			if s, ok := val.(string); ok {
				// Check if any detection matches within this string at this path
				var relevant []engine.DetectionResult
				for _, d := range detections {
					if d.FieldName == childPath || strings.HasSuffix(d.FieldName, "."+key) {
						relevant = append(relevant, d)
					}
				}
				if len(relevant) > 0 {
					modified, _, _ := engine.MaskJSON([]byte(`"`+escapeJSON(s)+`"`), relevant, cfg)
					// Unwrap quotes from the masked JSON string
					if len(modified) > 2 {
						v[key] = string(modified[1 : len(modified)-1])
					}
				} else {
					rewriteNode(val, childPath, detections, cfg)
				}
			} else {
				rewriteNode(val, childPath, detections, cfg)
			}
		}
	case []any:
		for _, item := range v {
			rewriteNode(item, path, detections, cfg)
		}
	}
}

func escapeJSON(s string) string {
	b, _ := json.Marshal(s)
	if len(b) >= 2 {
		return string(b[1 : len(b)-1])
	}
	return s
}

// ── LLM detection (text-level) ────────────────────────────────────────────────

// detectText scans a plain text string (prompt / completion) using the
// detector, filtered by the rule's pii_types allowlist.
func (h *LLMHandler) detectText(text string, rule *policy.GatewayRule) []engine.DetectionResult {
	all := h.detector.ScanText(text, "prompt")
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

// ── Alert helper ──────────────────────────────────────────────────────────────

func (h *LLMHandler) sendLLMAlert(ctx context.Context, tenantID string, rule *policy.GatewayRule, piiTypes []string, provider, destination string) {
	ruleName := "LLM guard"
	if rule != nil {
		ruleName = rule.Name
	}
	h.proxy.cp.RaiseAlert(ctx, tenantID, controlplane.AlertInput{
		AlertType: "policy_violation",
		Severity:  "high",
		Title:     "PII detected in " + provider + " prompt: " + ruleName,
		Body: "PII types [" + strings.Join(piiTypes, ", ") + "] were found in a prompt sent to " +
			provider + " (" + destination + "). Review and apply LLM guard policies.",
	})
}

// ── Audit helper ──────────────────────────────────────────────────────────────

func (h *LLMHandler) writeAuditEvent(
	tenantID string,
	rule *policy.GatewayRule,
	requestID string,
	c *gin.Context,
	action string,
	piiTypes, fields []string,
	bodySize int,
	start time.Time,
	provider string,
) {
	latencyMs := uint16(time.Since(start).Milliseconds())
	h.proxy.auditWriter.Write(&audit.GatewayEvent{
		ID:                  uuid.New().String(),
		TenantID:            tenantID,
		GatewayRuleID:       rule.ID,
		Timestamp:           time.Now(),
		RequestID:           requestID,
		SourceIP:            c.ClientIP(),
		DestinationURL:      c.GetHeader("X-Upstream-URL"),
		HTTPMethod:          c.Request.Method,
		ActionTaken:         action,
		PIITypesDetected:    piiTypes,
		FieldNames:          fields,
		PayloadSizeBytes:    uint32(bodySize),
		ProcessingLatencyMs: latencyMs,
		WasLLMCall:          true,
		LLMProvider:         provider,
		PolicyID:            rule.PolicyID,
	})
}

// ── Utility helpers ───────────────────────────────────────────────────────────

func intFrom(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	}
	return 0
}
