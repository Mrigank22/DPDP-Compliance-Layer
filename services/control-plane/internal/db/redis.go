// services/control-plane/internal/db/redis.go

package db

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/config"
)

// NewRedis creates and validates a Redis client.
func NewRedis(cfg *config.Config, log *zap.Logger) (*redis.Client, error) {
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("redis parse url: %w", err)
	}

	opts.DialTimeout  = 5 * time.Second
	opts.ReadTimeout  = 3 * time.Second
	opts.WriteTimeout = 3 * time.Second
	opts.PoolSize     = 20
	opts.MinIdleConns = 5

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}

	log.Info("redis connected")
	return client, nil
}

// RedisKey constructs a namespaced Redis key to avoid collisions.
func RedisKey(parts ...string) string {
	key := "ds"
	for _, p := range parts {
		key += ":" + p
	}
	return key
}

// RedisKeyRefreshToken returns the key for a stored refresh token family.
func RedisKeyRefreshToken(tokenFamily string) string {
	return RedisKey("rt", tokenFamily)
}

// RedisKeySession returns the key for a user session.
func RedisKeySession(userID string) string {
	return RedisKey("session", userID)
}

// RedisKeyRateLimit returns the rate-limit bucket key.
func RedisKeyRateLimit(ip, endpoint string) string {
	return RedisKey("rl", endpoint, ip)
}

// RedisKeyPasswordReset returns the key for a password reset token.
func RedisKeyPasswordReset(tokenHash string) string {
	return RedisKey("pw_reset", tokenHash)
}

// RedisKeyPolicyCache returns the key for the gateway policy cache for a tenant.
func RedisKeyPolicyCache(tenantID string) string {
	return RedisKey("policy_cache", tenantID)
}
