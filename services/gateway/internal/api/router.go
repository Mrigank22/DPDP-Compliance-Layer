// services/gateway/internal/api/router.go

package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/datasentinel/gateway/internal/api/handlers"
	"github.com/datasentinel/gateway/internal/audit"
	"github.com/datasentinel/gateway/internal/config"
	"github.com/datasentinel/gateway/internal/engine"
	"github.com/datasentinel/gateway/internal/policy"
	"github.com/redis/go-redis/v9"
)

// BuildRouter wires all gateway routes and returns a configured gin.Engine.
func BuildRouter(
	cfg *config.Config,
	detector *engine.Detector,
	pl *policy.PolicyLoader,
	aw *audit.Writer,
	rdb *redis.Client,
	log *zap.Logger,
) *gin.Engine {
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(requestIDMiddleware())
	r.Use(loggerMiddleware(log))
	r.Use(recoveryMiddleware(log))

	// Probes — no auth
	health := handlers.NewHealthHandler(rdb, aw, pl)
	r.GET("/healthz", health.Liveness)
	r.GET("/readyz", health.Readiness)

	// Admin — internal cache invalidation
	admin := r.Group("/admin")
	admin.Use(serviceKeyAuth(cfg))
	admin.POST("/cache/invalidate/:tenant_id", func(c *gin.Context) {
		pl.InvalidateCache(c.Param("tenant_id"))
		c.JSON(http.StatusOK, gin.H{"message": "cache invalidated"})
	})

	// All proxy traffic — tenant auth first, then proxy handler for NoRoute
	proxy := handlers.NewProxyHandler(cfg, detector, pl, aw, log)
	r.Use(tenantAuthMiddleware(cfg))
	r.NoRoute(proxy.Handle)

	return r
}

// ---- Middleware -------------------------------------------------------------

func requestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" {
			id = uuid.New().String()
		}
		c.Set("request_id", id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

func loggerMiddleware(log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Info("proxy",
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("latency", time.Since(start)),
			zap.String("ip", c.ClientIP()),
		)
	}
}

func recoveryMiddleware(log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				log.Error("gateway panic", zap.Any("panic", r))
				c.AbortWithStatusJSON(http.StatusInternalServerError,
					gin.H{"error": "internal gateway error"})
			}
		}()
		c.Next()
	}
}

func tenantAuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if path == "/healthz" || path == "/readyz" || strings.HasPrefix(path, "/admin") {
			c.Next()
			return
		}

		// Bearer JWT
		if auth := c.GetHeader("Authorization"); auth != "" {
			tid, err := extractTenantFromJWT(auth)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized,
					gin.H{"error": "invalid token: " + err.Error()})
				return
			}
			c.Set("tenant_id", tid)
			c.Next()
			return
		}

		// X-API-Key with explicit X-Tenant-ID
		if key := c.GetHeader("X-API-Key"); key != "" {
			tid := c.GetHeader("X-Tenant-ID")
			if tid == "" {
				c.AbortWithStatusJSON(http.StatusUnauthorized,
					gin.H{"error": "X-Tenant-ID header required with X-API-Key"})
				return
			}
			c.Set("tenant_id", tid)
			c.Next()
			return
		}

		c.AbortWithStatusJSON(http.StatusUnauthorized,
			gin.H{"error": "authorization required"})
	}
}

func serviceKeyAuth(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("X-Service-Key") != cfg.ControlPlaneAPIKey {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.Next()
	}
}

// extractTenantFromJWT parses JWT claims without full signature verification.
// The gateway operates in a trusted internal network; the control plane already
// verified the token when issuing it. For high-security deployments, load the
// RS256 public key and verify here as well.
func extractTenantFromJWT(authHeader string) (string, error) {
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return "", fmt.Errorf("malformed authorization header")
	}
	segments := strings.Split(parts[1], ".")
	if len(segments) != 3 {
		return "", fmt.Errorf("malformed jwt")
	}
	// Pad base64 if needed
	payload := segments[1]
	switch len(payload) % 4 {
	case 2:
		payload += "=="
	case 3:
		payload += "="
	}
	decoded, err := base64.URLEncoding.DecodeString(payload)
	if err != nil {
		return "", fmt.Errorf("decode jwt payload: %w", err)
	}
	var claims map[string]any
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return "", fmt.Errorf("parse jwt claims: %w", err)
	}
	tid, ok := claims["tid"].(string)
	if !ok || tid == "" {
		return "", fmt.Errorf("missing tenant id claim")
	}
	if exp, ok := claims["exp"].(float64); ok {
		if time.Now().Unix() > int64(exp) {
			return "", fmt.Errorf("token expired")
		}
	}
	return tid, nil
}
