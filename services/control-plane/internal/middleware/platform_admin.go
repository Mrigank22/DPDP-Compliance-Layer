// services/control-plane/internal/middleware/platform_admin.go

package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// Context keys for the platform-admin identity.
const (
	CtxPlatformAdminID    = "platform_admin_id"
	CtxPlatformAdminEmail = "platform_admin_email"
	CtxPlatformAdminObj   = "platform_admin_obj"
)

// RequirePlatformAdmin authenticates a platform super-admin. It accepts ONLY a
// Bearer token carrying the "platform_admin" scope, then re-loads the admin from
// the database to confirm the account is still active (so disabling an admin
// revokes their access immediately, despite the token TTL).
func RequirePlatformAdmin(svc *services.PlatformAdminService, log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
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

		claims, err := svc.ValidatePlatformToken(parts[1])
		if err != nil {
			abortUnauthorized(c, "invalid or expired platform session")
			return
		}

		admin, err := svc.GetActiveByID(c.Request.Context(), claims.Subject)
		if err != nil {
			abortUnauthorized(c, "platform admin not found or disabled")
			return
		}

		c.Set(CtxPlatformAdminID, admin.ID)
		c.Set(CtxPlatformAdminEmail, admin.Email)
		c.Set(CtxPlatformAdminObj, admin)
		c.Next()
	}
}

// GetPlatformAdmin returns the authenticated platform admin from the context.
func GetPlatformAdmin(c *gin.Context) *models.PlatformAdmin {
	if v, ok := c.Get(CtxPlatformAdminObj); ok {
		if a, ok := v.(*models.PlatformAdmin); ok {
			return a
		}
	}
	return nil
}

// GetPlatformAdminID returns the authenticated platform admin's id.
func GetPlatformAdminID(c *gin.Context) string {
	if v, ok := c.Get(CtxPlatformAdminID); ok {
		if id, ok := v.(string); ok {
			return id
		}
	}
	return ""
}
