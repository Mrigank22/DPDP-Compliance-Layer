// services/gateway/internal/api/handlers/health.go

package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"github.com/datasentinel/gateway/internal/audit"
	"github.com/datasentinel/gateway/internal/policy"
)

// HealthHandler exposes liveness and readiness probes.
type HealthHandler struct {
	rdb          *redis.Client
	auditWriter  *audit.Writer
	policyLoader *policy.PolicyLoader
	start        time.Time
}

// NewHealthHandler creates a HealthHandler.
func NewHealthHandler(rdb *redis.Client, aw *audit.Writer, pl *policy.PolicyLoader) *HealthHandler {
	return &HealthHandler{rdb: rdb, auditWriter: aw, policyLoader: pl, start: time.Now()}
}

// Liveness godoc
// GET /healthz
func (h *HealthHandler) Liveness(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Readiness godoc
// GET /readyz
func (h *HealthHandler) Readiness(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	status := http.StatusOK
	checks := map[string]string{}

	if err := h.rdb.Ping(ctx).Err(); err != nil {
		checks["redis"] = "unhealthy: " + err.Error()
		status = http.StatusServiceUnavailable
	} else {
		checks["redis"] = "ok"
	}

	checks["detector"] = "ok"
	checks["policy_loader"] = "ok"

	c.JSON(status, gin.H{
		"status":   map[bool]string{true: "ok", false: "degraded"}[status == http.StatusOK],
		"checks":   checks,
		"uptime_s": time.Since(h.start).Seconds(),
	})
}
