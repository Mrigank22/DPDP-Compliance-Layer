// services/control-plane/internal/middleware/auth.go

package middleware

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// Context key constants for values stored in gin.Context.
const (
	CtxUserID    = "user_id"
	CtxTenantID  = "tenant_id"
	CtxUserRole  = "user_role"
	CtxUserObj   = "user_obj"
	CtxRequestID = "request_id"
	// CtxLogger holds the request-scoped *zap.Logger so that handlers and
	// helpers can emit structured, correlated error logs.
	CtxLogger = "logger"
)

// ServiceUserID is the sentinel user ID attributed to trusted internal service
// callers (gateway, workers) that authenticate with the internal API key.
const ServiceUserID = "00000000-0000-0000-0000-000000000002"

// RequireAuth is the primary authentication middleware.
// It accepts a Bearer JWT, a tenant API key, or the internal service key.
func RequireAuth(authSvc *services.AuthService, pg *bun.DB, internalKey string, log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try X-API-Key header first (for machine callers)
		if apiKey := c.GetHeader("X-API-Key"); apiKey != "" {
			// Internal service-to-service key: trusted identity scoped to the
			// tenant named in X-Tenant-ID. Used by the gateway and workers.
			if internalKey != "" && subtleConstEq(apiKey, internalKey) {
				if authenticateService(c, pg) {
					c.Next()
				}
				return
			}
			if authenticated := authenticateAPIKey(c, apiKey, pg, log); authenticated {
				c.Next()
				return
			}
			return // authenticateAPIKey already aborted
		}

		// Fall back to Bearer JWT
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			abortUnauthorized(c, "missing Authorization header")
			return
		}
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			abortUnauthorized(c, "invalid Authorization header format")
			return
		}

		claims, err := authSvc.ValidateAccessToken(parts[1])
		if err != nil {
			if ae, ok := err.(*services.AppError); ok {
				abortWithCode(c, http.StatusUnauthorized, ae.Code, ae.Message)
			} else {
				abortUnauthorized(c, "invalid token")
			}
			return
		}

		// Load user from DB to ensure account is still active
		user := &models.User{}
		err = pg.NewSelect().Model(user).
			Where("id = ? AND tenant_id = ?", claims.Subject, claims.TenantID).
			Scan(c.Request.Context())
		if err != nil {
			abortUnauthorized(c, "user not found")
			return
		}
		if !user.IsActive {
			abortUnauthorized(c, "account is disabled")
			return
		}

		// Set RLS context for all downstream DB calls
		_ = db.SetTenantContext(c.Request.Context(), pg, claims.TenantID)

		c.Set(CtxUserID, claims.Subject)
		c.Set(CtxTenantID, claims.TenantID)
		c.Set(CtxUserRole, claims.Role)
		c.Set(CtxUserObj, user)
		c.Next()
	}
}

// authenticateService establishes a trusted internal service identity from the
// X-Tenant-ID header. Caller must already be verified to hold the internal key.
func authenticateService(c *gin.Context, pg *bun.DB) bool {
	tid := strings.TrimSpace(c.GetHeader("X-Tenant-ID"))
	if tid == "" {
		abortWithCode(c, http.StatusUnauthorized, models.ErrCodeUnauthorized,
			"X-Tenant-ID header is required with the internal service key")
		return false
	}
	_ = db.SetTenantContext(c.Request.Context(), pg, tid)
	c.Set(CtxUserID, ServiceUserID)
	c.Set(CtxTenantID, tid)
	c.Set(CtxUserRole, models.RoleAdmin)
	c.Set("is_service", true)
	return true
}

// RequireServiceAuth authenticates ONLY the internal service key (gateway,
// workers). User JWTs and tenant API keys are rejected. Tenant scope comes from
// the X-Tenant-ID header. Used to guard /internal routes.
func RequireServiceAuth(internalKey string, pg *bun.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetHeader("X-API-Key")
		if internalKey == "" || key == "" || !subtleConstEq(key, internalKey) {
			abortWithCode(c, http.StatusForbidden, models.ErrCodeForbidden,
				"internal service authentication required")
			return
		}
		if !authenticateService(c, pg) {
			return
		}
		c.Next()
	}
}

// subtleConstEq compares two strings in constant time to avoid timing leaks.
func subtleConstEq(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func authenticateAPIKey(c *gin.Context, rawKey string, pg *bun.DB, log *zap.Logger) bool {
	hash := sha256Token(rawKey)

	apiKey := &models.APIKey{}
	err := pg.NewSelect().Model(apiKey).
		Where("key_hash = ? AND is_active = true", hash).
		Scan(c.Request.Context())
	if err != nil {
		if err == sql.ErrNoRows {
			abortUnauthorized(c, "invalid API key")
		} else {
			log.Error("api key lookup failed", zap.Error(err))
			abortUnauthorized(c, "authentication error")
		}
		return false
	}

	if apiKey.IsExpired() {
		abortWithCode(c, http.StatusUnauthorized, models.ErrCodeTokenExpired, "API key has expired")
		return false
	}

	// Non-blocking last-used update. Uses a background context so it survives the
	// end of the request, and logs failures instead of silently swallowing them.
	keyID := apiKey.ID
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := pg.NewUpdate().Model((*models.APIKey)(nil)).
			Set("last_used_at = ?", time.Now()).
			Where("id = ?", keyID).
			Exec(ctx); err != nil {
			log.Warn("api key last_used_at update failed",
				zap.String("api_key_id", keyID), zap.Error(err))
		}
	}()

	// Load the owning user
	user := &models.User{}
	if err := pg.NewSelect().Model(user).
		Where("id = ? AND is_active = true", apiKey.UserID).
		Scan(c.Request.Context()); err != nil {
		log.Warn("api key owner lookup failed",
			zap.String("api_key_id", apiKey.ID),
			zap.String("user_id", apiKey.UserID), zap.Error(err))
	}

	_ = db.SetTenantContext(c.Request.Context(), pg, apiKey.TenantID)

	c.Set(CtxUserID, apiKey.UserID)
	c.Set(CtxTenantID, apiKey.TenantID)
	c.Set(CtxUserRole, models.RoleViewer) // API keys default to viewer; scope checked separately
	c.Set(CtxUserObj, user)
	c.Set("api_key_scopes", apiKey.Scopes)
	return true
}

// RequireRole enforces a minimum role level for a route group.
// Roles: owner > admin > analyst > viewer
func RequireRole(minimum string) gin.HandlerFunc {
	hierarchy := map[string]int{
		models.RoleViewer:  1,
		models.RoleAnalyst: 2,
		models.RoleAdmin:   3,
		models.RoleOwner:   4,
	}
	return func(c *gin.Context) {
		role, _ := c.Get(CtxUserRole)
		userRank, ok := hierarchy[role.(string)]
		if !ok || userRank < hierarchy[minimum] {
			abortForbidden(c, "insufficient permissions")
			return
		}
		c.Next()
	}
}

// RequireScope checks that an API key has the needed scope (for machine callers).
func RequireScope(scope string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// JWT users pass all scope checks (scope is determined by role)
		if _, exists := c.Get("api_key_scopes"); !exists {
			c.Next()
			return
		}
		scopes, _ := c.Get("api_key_scopes")
		for _, s := range scopes.([]string) {
			if s == scope || s == models.ScopeAdmin {
				c.Next()
				return
			}
		}
		abortForbidden(c, "API key does not have the required scope: "+scope)
	}
}

// SuperAdminOnly rejects requests from non-super-admin accounts.
// Super-admins are identified by a special tenant_id (platform internal).
const superAdminTenantID = "00000000-0000-0000-0000-000000000000"

func SuperAdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID, _ := c.Get(CtxTenantID)
		if tenantID != superAdminTenantID {
			abortForbidden(c, "super-admin access required")
			return
		}
		c.Next()
	}
}

// ---- Helpers ----------------------------------------------------------------

func sha256Token(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func abortUnauthorized(c *gin.Context, msg string) {
	abortWithCode(c, http.StatusUnauthorized, models.ErrCodeUnauthorized, msg)
}

func abortForbidden(c *gin.Context, msg string) {
	abortWithCode(c, http.StatusForbidden, models.ErrCodeForbidden, msg)
}

func abortWithCode(c *gin.Context, status int, code, msg string) {
	requestID, _ := c.Get(CtxRequestID)
	ridStr, _ := requestID.(string)
	c.AbortWithStatusJSON(status, models.APIResponse{
		RequestID: ridStr,
		Error: &models.APIError{
			Code:    code,
			Message: msg,
		},
	})
}

// GetUserID extracts the current user ID from context.
func GetUserID(c *gin.Context) string {
	v, _ := c.Get(CtxUserID)
	s, _ := v.(string)
	return s
}

// GetTenantID extracts the current tenant ID from context.
func GetTenantID(c *gin.Context) string {
	v, _ := c.Get(CtxTenantID)
	s, _ := v.(string)
	return s
}

// GetUser extracts the full User object from context.
func GetUser(c *gin.Context) *models.User {
	v, _ := c.Get(CtxUserObj)
	if v == nil {
		return nil
	}
	return v.(*models.User)
}
