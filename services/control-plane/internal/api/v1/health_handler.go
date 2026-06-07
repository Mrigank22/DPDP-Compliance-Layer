// services/control-plane/internal/api/v1/health_handler.go

package v1

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/uptrace/bun"

	"github.com/datasentinel/control-plane/internal/db"
)

// HealthHandler exposes liveness and readiness probe endpoints.
type HealthHandler struct {
	pg    *bun.DB
	rdb   *redis.Client
	ch    *db.ClickHouseClient
	start time.Time
}

// NewHealthHandler creates a HealthHandler.
func NewHealthHandler(pg *bun.DB, rdb *redis.Client, ch *db.ClickHouseClient) *HealthHandler {
	return &HealthHandler{pg: pg, rdb: rdb, ch: ch, start: time.Now()}
}

// Liveness godoc
// GET /healthz
func (h *HealthHandler) Liveness(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Readiness godoc
// GET /readyz
func (h *HealthHandler) Readiness(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	checks := map[string]string{}
	status := http.StatusOK

	// PostgreSQL
	if err := h.pg.PingContext(ctx); err != nil {
		checks["postgres"] = "unhealthy: " + err.Error()
		status = http.StatusServiceUnavailable
	} else {
		checks["postgres"] = "ok"
	}

	// Redis
	if err := h.rdb.Ping(ctx).Err(); err != nil {
		checks["redis"] = "unhealthy: " + err.Error()
		status = http.StatusServiceUnavailable
	} else {
		checks["redis"] = "ok"
	}

	// ClickHouse
	if err := h.ch.Ping(ctx); err != nil {
		checks["clickhouse"] = "degraded: " + err.Error()
		// ClickHouse is non-critical — don't fail readiness
	} else {
		checks["clickhouse"] = "ok"
	}

	c.JSON(status, gin.H{
		"status":   map[bool]string{true: "ok", false: "degraded"}[status == http.StatusOK],
		"checks":   checks,
		"uptime_s": time.Since(h.start).Seconds(),
	})
}
