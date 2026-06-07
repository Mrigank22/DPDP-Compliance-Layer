// services/control-plane/internal/middleware/rate_limit.go

package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// RateLimit implements a fixed-window rate limiter backed by Redis.
// limitPerMinute is the maximum number of requests allowed per IP per minute.
func RateLimit(rdb *redis.Client, limitPerMinute int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		path := c.FullPath()
		key := db.RedisKeyRateLimit(ip, path)

		ctx := context.Background()

		// Increment counter with 1-minute TTL
		pipe := rdb.Pipeline()
		incrCmd := pipe.Incr(ctx, key)
		pipe.Expire(ctx, key, time.Minute)
		if _, err := pipe.Exec(ctx); err != nil {
			// On Redis failure, allow the request through (fail open)
			c.Next()
			return
		}

		count := incrCmd.Val()
		remaining := int64(limitPerMinute) - count
		if remaining < 0 {
			remaining = 0
		}

		// Set rate-limit headers
		c.Header("X-RateLimit-Limit", strconv.Itoa(limitPerMinute))
		c.Header("X-RateLimit-Remaining", strconv.FormatInt(remaining, 10))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(time.Minute).Unix()))

		if count > int64(limitPerMinute) {
			requestID, _ := c.Get(CtxRequestID)
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, models.APIResponse{
				RequestID: requestID.(string),
				Error: &models.APIError{
					Code:    models.ErrCodeRateLimited,
					Message: "rate limit exceeded — please slow down",
				},
			})
			return
		}

		c.Next()
	}
}

// TenantRateLimit applies per-tenant rate limiting (for authenticated routes).
func TenantRateLimit(rdb *redis.Client, limitPerMinute int) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID, exists := c.Get(CtxTenantID)
		if !exists {
			c.Next()
			return
		}

		key := db.RedisKey("tenant_rl", tenantID.(string), c.FullPath())
		ctx := context.Background()

		pipe := rdb.Pipeline()
		incrCmd := pipe.Incr(ctx, key)
		pipe.Expire(ctx, key, time.Minute)
		if _, err := pipe.Exec(ctx); err != nil {
			c.Next()
			return
		}

		if incrCmd.Val() > int64(limitPerMinute) {
			requestID, _ := c.Get(CtxRequestID)
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, models.APIResponse{
				RequestID: requestID.(string),
				Error: &models.APIError{
					Code:    models.ErrCodeRateLimited,
					Message: "tenant request rate limit exceeded",
				},
			})
			return
		}
		c.Next()
	}
}
