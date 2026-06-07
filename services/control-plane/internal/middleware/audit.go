// services/control-plane/internal/middleware/audit.go

package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// auditableMethod returns true for mutating HTTP methods that should always be
// logged. GET/HEAD/OPTIONS are skipped unless they hit sensitive paths.
func auditableMethod(method string) bool {
	switch method {
	case "POST", "PUT", "PATCH", "DELETE":
		return true
	}
	return false
}

// sensitiveReadPaths is a list of path prefixes whose GET requests are also
// logged (e.g., audit log access, API key listing).
var sensitiveReadPaths = []string{
	"/api/v1/apikeys",
	"/api/v1/audit-logs",
	"/api/v1/team",
}

func isSensitiveRead(method, path string) bool {
	if method != "GET" {
		return false
	}
	for _, prefix := range sensitiveReadPaths {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}

// inferAction derives an AuditLog action string from the HTTP method + path.
// For precise audit actions (e.g. "finding.resolved"), services call ch.WriteAuditLog
// directly. This middleware captures everything else at the HTTP layer.
func inferAction(method, path string) string {
	// Strip path parameters — simplify to resource + operation
	parts := strings.Split(strings.TrimPrefix(path, "/api/v1/"), "/")
	if len(parts) == 0 {
		return "api." + strings.ToLower(method)
	}
	resource := parts[0]
	switch method {
	case "POST":
		// Distinguish sub-actions (/activate, /scan, /resolve, etc.)
		if len(parts) >= 3 {
			return resource + "." + parts[2]
		}
		return resource + ".created"
	case "PATCH", "PUT":
		return resource + ".updated"
	case "DELETE":
		return resource + ".deleted"
	case "GET":
		return resource + ".read"
	}
	return resource + "." + strings.ToLower(method)
}

// bodyResponseWriter wraps gin.ResponseWriter to capture the response status.
type bodyResponseWriter struct {
	gin.ResponseWriter
	status int
}

func (w *bodyResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

// AuditLogger is a gin middleware that writes an audit log entry to ClickHouse
// for every mutating request and sensitive reads, after the handler completes.
// It is intentionally non-blocking: the ClickHouse write happens in a goroutine
// so it never adds latency to the request.
func AuditLogger(ch *db.ClickHouseClient, log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method
		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}

		// Skip non-auditable requests early
		if !auditableMethod(method) && !isSensitiveRead(method, path) {
			c.Next()
			return
		}

		// Capture request body for audit evidence (POST/PATCH only, max 4KB)
		var requestBodySnippet string
		if method == "POST" || method == "PATCH" || method == "PUT" {
			if c.Request.Body != nil {
				bodyBytes, _ := io.ReadAll(io.LimitReader(c.Request.Body, 4096))
				c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
				// Redact password fields before logging
				requestBodySnippet = redactSensitiveFields(string(bodyBytes))
			}
		}

		wrappedWriter := &bodyResponseWriter{ResponseWriter: c.Writer, status: 200}
		c.Writer = wrappedWriter

		start := time.Now()
		c.Next()

		// Only log after the handler has run so we have the response status
		status := wrappedWriter.status
		if status == 0 {
			status = c.Writer.Status()
		}

		// Extract identity from context (set by RequireAuth middleware)
		userID, _ := c.Get(CtxUserID)
		tenantID, _ := c.Get(CtxTenantID)
		requestID, _ := c.Get(CtxRequestID)

		uid, _ := userID.(string)
		tid, _ := tenantID.(string)
		rid, _ := requestID.(string)

		if uid == "" || tid == "" {
			return // unauthenticated request — skip audit
		}

		action := inferAction(method, path)

		// Build changes JSON: include request body snippet and response status
		changes, _ := json.Marshal(map[string]any{
			"method":      method,
			"path":        path,
			"status":      status,
			"latency_ms":  time.Since(start).Milliseconds(),
			"body":        requestBodySnippet,
		})

		entry := &models.AuditLog{
			ID:           uuid.New().String(),
			TenantID:     tid,
			UserID:       uid,
			Action:       action,
			ResourceType: resourceTypeFromPath(path),
			ResourceID:   resourceIDFromPath(path),
			IPAddress:    c.ClientIP(),
			UserAgent:    c.Request.UserAgent(),
			Changes:      string(changes),
			Timestamp:    time.Now(),
		}

		// Non-blocking write
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := ch.WriteAuditLog(ctx, entry); err != nil {
				log.Warn("audit log write failed",
					zap.String("request_id", rid),
					zap.String("action", action),
					zap.Error(err),
				)
			}
		}()
	}
}

// resourceTypeFromPath extracts the resource noun from a path like /api/v1/assets/abc-123.
func resourceTypeFromPath(path string) string {
	trimmed := strings.TrimPrefix(path, "/api/v1/")
	parts := strings.Split(trimmed, "/")
	if len(parts) > 0 {
		// Convert plural to singular for resource type
		r := parts[0]
		r = strings.TrimSuffix(r, "s") // naive singularisation; fine for audit log
		return r
	}
	return "unknown"
}

// resourceIDFromPath extracts the UUID resource ID from a path like /api/v1/assets/:id/scan.
func resourceIDFromPath(path string) string {
	trimmed := strings.TrimPrefix(path, "/api/v1/")
	parts := strings.Split(trimmed, "/")
	// The resource ID is conventionally the second segment: /resource/:id/...
	if len(parts) >= 2 {
		candidate := parts[1]
		// Basic UUID length check (avoid returning sub-actions like "summary")
		if len(candidate) == 36 || (len(candidate) > 20 && !strings.Contains(candidate, "-") == false) {
			return candidate
		}
	}
	return ""
}

// redactSensitiveFields removes known secret fields from a JSON body string
// before it is written to the audit log.
func redactSensitiveFields(body string) string {
	if body == "" {
		return ""
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(body), &m); err != nil {
		// Not JSON or too large — return a safe truncation
		if len(body) > 200 {
			return body[:200] + "...[truncated]"
		}
		return body
	}

	sensitive := []string{
		"password", "password_hash", "new_password", "current_password",
		"token", "refresh_token", "access_token", "secret", "mfa_secret",
		"key", "api_key", "connection_config", "credentials",
	}
	for _, field := range sensitive {
		if _, ok := m[field]; ok {
			m[field] = "[REDACTED]"
		}
	}

	out, _ := json.Marshal(m)
	return string(out)
}
