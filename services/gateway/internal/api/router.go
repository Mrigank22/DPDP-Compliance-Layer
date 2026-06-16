// services/gateway/internal/api/router.go

package api

import (
	"crypto/subtle"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/datasentinel/gateway/internal/api/handlers"
	"github.com/datasentinel/gateway/internal/audit"
	"github.com/datasentinel/gateway/internal/auth"
	"github.com/datasentinel/gateway/internal/config"
	"github.com/datasentinel/gateway/internal/controlplane"
	"github.com/datasentinel/gateway/internal/engine"
	"github.com/datasentinel/gateway/internal/metrics"
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

	// Shared dependencies
	m := metrics.New()
	cp := controlplane.NewClient(cfg, log)

	// JWT verifier (RS256). Disabled when no public key is configured.
	verifier, err := auth.LoadVerifier(cfg.JWTPublicKeyPath)
	if err != nil {
		log.Warn("failed to load JWT public key — JWT auth disabled", zap.Error(err))
		verifier = &auth.Verifier{}
	}
	if !verifier.Enabled() {
		log.Warn("JWT verification is disabled (no JWT_PUBLIC_KEY_PATH); callers must use X-API-Key + X-Tenant-ID")
	}

	// Probes + metrics — no auth
	health := handlers.NewHealthHandler(rdb, aw, pl)
	r.GET("/healthz", health.Liveness)
	r.GET("/readyz", health.Readiness)
	r.GET("/metrics", gin.WrapH(m.Handler()))

	// Admin — internal cache invalidation
	admin := r.Group("/admin")
	admin.Use(serviceKeyAuth(cfg))
	admin.POST("/cache/invalidate/:tenant_id", func(c *gin.Context) {
		pl.InvalidateCache(c.Param("tenant_id"))
		c.JSON(http.StatusOK, gin.H{"message": "cache invalidated"})
	})

	// All proxy traffic — tenant auth first, then dispatch to the LLM handler for
	// known LLM destinations, or the generic proxy handler otherwise.
	proxy := handlers.NewProxyHandler(cfg, detector, pl, aw, cp, rdb, m, log)
	llm := handlers.NewLLMHandler(proxy, cfg, detector, pl, log)
	r.Use(tenantAuthMiddleware(cfg, verifier))
	r.NoRoute(func(c *gin.Context) {
		if handlers.IsLLMUpstream(c.GetHeader("X-Upstream-URL")) {
			llm.Handle(c)
			return
		}
		proxy.Handle(c)
	})

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

		status := c.Writer.Status()
		reqID, _ := c.Get("request_id")
		rid, _ := reqID.(string)
		tid, _ := c.Get("tenant_id")
		tenant, _ := tid.(string)

		fields := []zap.Field{
			zap.String("request_id", rid),
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", status),
			zap.Int64("latency_ms", time.Since(start).Milliseconds()),
			zap.String("ip", c.ClientIP()),
			zap.Int("resp_bytes", c.Writer.Size()),
		}
		if tenant != "" {
			fields = append(fields, zap.String("tenant_id", tenant))
		}
		if dest := c.GetHeader("X-Upstream-URL"); dest != "" {
			fields = append(fields, zap.String("upstream", dest))
		}

		switch {
		case status >= 500:
			log.Error("proxy", fields...)
		case status >= 400:
			log.Warn("proxy", fields...)
		default:
			log.Info("proxy", fields...)
		}
	}
}

func recoveryMiddleware(log *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				reqID, _ := c.Get("request_id")
				rid, _ := reqID.(string)
				tid, _ := c.Get("tenant_id")
				tenant, _ := tid.(string)
				log.Error("gateway panic recovered",
					zap.Any("panic", r),
					zap.String("request_id", rid),
					zap.String("tenant_id", tenant),
					zap.String("method", c.Request.Method),
					zap.String("path", c.Request.URL.Path),
					zap.String("ip", c.ClientIP()),
					zap.ByteString("stack", debug.Stack()),
				)
				if !c.Writer.Written() {
					c.AbortWithStatusJSON(http.StatusInternalServerError,
						gin.H{"error": "internal gateway error", "request_id": rid})
				}
			}
		}()
		c.Next()
	}
}

func tenantAuthMiddleware(cfg *config.Config, verifier *auth.Verifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if path == "/healthz" || path == "/readyz" || path == "/metrics" || strings.HasPrefix(path, "/admin") {
			c.Next()
			return
		}

		// X-API-Key with explicit X-Tenant-ID (primary path for SDK + internal
		// callers). The key is trusted at the network boundary; the control plane
		// validates it when policy rules are fetched.
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

		// Bearer JWT — signature is verified against the control plane's RS256
		// public key (when configured).
		if authz := c.GetHeader("Authorization"); authz != "" {
			tid, err := verifier.TenantFromBearer(authz)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized,
					gin.H{"error": "invalid token: " + err.Error()})
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
		if subtle.ConstantTimeCompare([]byte(c.GetHeader("X-Service-Key")), []byte(cfg.ControlPlaneAPIKey)) != 1 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.Next()
	}
}
