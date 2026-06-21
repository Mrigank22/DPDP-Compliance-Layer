// services/gateway/internal/policy/loader.go

package policy

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/datasentinel/gateway/internal/config"
)

// RuleSet is a fully-resolved, enforcement-ready set of gateway rules for a tenant.
type RuleSet struct {
	TenantID string
	Rules    []*GatewayRule
	FetchedAt time.Time
}

// GatewayRule is the gateway's runtime representation of a rule.
// It mirrors the control-plane model but is pre-compiled for fast matching.
type GatewayRule struct {
	ID           string   `json:"id"`
	PolicyID     string   `json:"policy_id"`
	Name         string   `json:"name"`
	RoutePattern string   `json:"route_pattern"`
	HTTPMethods  []string `json:"http_methods"`
	Direction    string   `json:"direction"`
	Action       string   `json:"action"`
	PIITypes     []string `json:"pii_types"`
	MaskConfig   struct {
		Strategy     string `json:"strategy"`
		MaskChar     string `json:"mask_char"`
		PreserveFirst int   `json:"preserve_first"`
		PreserveLast  int   `json:"preserve_last"`
		RedactLabel  string `json:"redact_label"`
	} `json:"mask_config"`
	IsActive    bool   `json:"is_active"`
	EnforcementMode string `json:"enforcement_mode"`
}

// PolicyLoader fetches gateway rules from the control plane and caches them.
// A background goroutine refreshes the cache on a configurable interval.
type PolicyLoader struct {
	cfg       *config.Config
	rdb       *redis.Client
	log       *zap.Logger
	client    *http.Client
	mu        sync.RWMutex
	cache     map[string]*RuleSet // tenantID → RuleSet
	stopCh    chan struct{}
}

const redisPolicyCacheKey = "gateway:rules:"

// NewPolicyLoader creates a PolicyLoader and starts the background sync loop.
func NewPolicyLoader(cfg *config.Config, rdb *redis.Client, log *zap.Logger) *PolicyLoader {
	pl := &PolicyLoader{
		cfg:    cfg,
		rdb:    rdb,
		log:    log,
		cache:  make(map[string]*RuleSet),
		stopCh: make(chan struct{}),
		client: &http.Client{Timeout: 10 * time.Second},
	}
	go pl.syncLoop()
	return pl
}

// GetRules returns the cached rule set for a tenant. If no cache entry exists,
// it performs a synchronous fetch from the control plane.
func (pl *PolicyLoader) GetRules(ctx context.Context, tenantID string) (*RuleSet, error) {
	// Fast path: in-memory cache
	pl.mu.RLock()
	rs, ok := pl.cache[tenantID]
	pl.mu.RUnlock()
	if ok && time.Since(rs.FetchedAt) < pl.cfg.PolicySyncInterval*2 {
		return rs, nil
	}

	// Medium path: Redis cache (survives gateway restarts)
	redisKey := redisPolicyCacheKey + tenantID
	data, err := pl.rdb.Get(ctx, redisKey).Bytes()
	if err == nil {
		var rs RuleSet
		if jsonErr := json.Unmarshal(data, &rs); jsonErr == nil {
			pl.mu.Lock()
			pl.cache[tenantID] = &rs
			pl.mu.Unlock()
			return &rs, nil
		}
	}

	// Slow path: fetch from control plane
	return pl.fetchAndCache(ctx, tenantID)
}

// InvalidateCache removes the cached rules for a tenant, forcing a fresh fetch.
func (pl *PolicyLoader) InvalidateCache(tenantID string) {
	pl.mu.Lock()
	delete(pl.cache, tenantID)
	pl.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	pl.rdb.Del(ctx, redisPolicyCacheKey+tenantID)
}

// Stop shuts down the background sync goroutine.
func (pl *PolicyLoader) Stop() { close(pl.stopCh) }

// syncLoop runs on a ticker, refreshing all cached tenants in the background.
func (pl *PolicyLoader) syncLoop() {
	ticker := time.NewTicker(pl.cfg.PolicySyncInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			pl.mu.RLock()
			tenants := make([]string, 0, len(pl.cache))
			for tid := range pl.cache {
				tenants = append(tenants, tid)
			}
			pl.mu.RUnlock()

			for _, tid := range tenants {
				ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
				if _, err := pl.fetchAndCache(ctx, tid); err != nil {
					pl.log.Warn("policy sync failed",
						zap.String("tenant_id", tid),
						zap.Error(err),
					)
				}
				cancel()
			}
		case <-pl.stopCh:
			return
		}
	}
}

// fetchAndCache fetches rules from the control plane API and stores them.
func (pl *PolicyLoader) fetchAndCache(ctx context.Context, tenantID string) (*RuleSet, error) {
	url := fmt.Sprintf("%s/api/v1/gateway/rules", pl.cfg.ControlPlaneURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-API-Key", pl.cfg.ControlPlaneAPIKey)
	req.Header.Set("X-Tenant-ID", tenantID)
	req.Header.Set("Accept", "application/json")

	resp, err := pl.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch rules: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("control plane returned %d: %s", resp.StatusCode, string(body))
	}

	var apiResp struct {
		Data []*GatewayRule `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("decode rules response: %w", err)
	}

	// Filter to active rules only
	activeRules := make([]*GatewayRule, 0, len(apiResp.Data))
	for _, r := range apiResp.Data {
		if r.IsActive {
			activeRules = append(activeRules, r)
		}
	}

	rs := &RuleSet{
		TenantID:  tenantID,
		Rules:     activeRules,
		FetchedAt: time.Now(),
	}

	// Store in memory
	pl.mu.Lock()
	pl.cache[tenantID] = rs
	pl.mu.Unlock()

	// Store in Redis with TTL = 2× sync interval
	if b, err := json.Marshal(rs); err == nil {
		ctx2, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		pl.rdb.Set(ctx2, redisPolicyCacheKey+tenantID, b, pl.cfg.PolicySyncInterval*2)
	}

	pl.log.Debug("rules refreshed",
		zap.String("tenant_id", tenantID),
		zap.Int("rule_count", len(activeRules)),
	)
	return rs, nil
}

// MatchRules returns all active rules that match the given HTTP method, request
// path and upstream host. Each rule's route pattern is tested against the
// request path ("/v1/chat"), the destination host ("api.openai.com") and the
// combined host+path ("api.openai.com/v1/chat"), so a pattern can target either
// the API path or the destination service.
func (rs *RuleSet) MatchRules(method, path, host, direction string) []*GatewayRule {
	hostPath := path
	if host != "" {
		hostPath = host + path
	}
	var matched []*GatewayRule
	for _, rule := range rs.Rules {
		if !rule.IsActive {
			continue
		}
		if !matchesDirection(rule.Direction, direction) {
			continue
		}
		if !matchesMethod(rule.HTTPMethods, method) {
			continue
		}
		if matchesRoute(rule.RoutePattern, path) ||
			(host != "" && (matchesRoute(rule.RoutePattern, host) || matchesRoute(rule.RoutePattern, hostPath))) {
			matched = append(matched, rule)
		}
	}
	return matched
}

func matchesDirection(ruleDir, reqDir string) bool {
	return ruleDir == "both" || ruleDir == reqDir
}

func matchesMethod(methods []string, method string) bool {
	for _, m := range methods {
		if m == "*" || m == method {
			return true
		}
	}
	return false
}

// matchesRoute supports exact matches, prefix wildcards (/api/v1/*),
// and path-parameter patterns (/users/:id/profile).
func matchesRoute(pattern, path string) bool {
	if pattern == "*" || pattern == "/*" {
		return true
	}
	if pattern == path {
		return true
	}
	// Suffix wildcard: /api/v1/*
	if len(pattern) > 0 && pattern[len(pattern)-1] == '*' {
		prefix := pattern[:len(pattern)-1]
		return len(path) >= len(prefix) && path[:len(prefix)] == prefix
	}
	// Path parameter matching: /users/:id/profile
	patternParts := splitPath(pattern)
	pathParts := splitPath(path)
	if len(patternParts) != len(pathParts) {
		return false
	}
	for i, pp := range patternParts {
		if len(pp) > 0 && pp[0] == ':' {
			continue // wildcard segment
		}
		if pp != pathParts[i] {
			return false
		}
	}
	return true
}

func splitPath(p string) []string {
	parts := []string{}
	for _, s := range splitSlash(p) {
		if s != "" {
			parts = append(parts, s)
		}
	}
	return parts
}

func splitSlash(s string) []string {
	var parts []string
	start := 0
	for i, c := range s {
		if c == '/' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}
