// services/gateway/internal/engine/tokenizer.go

package engine

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	tokenPrefix      = "DST_"
	tokenTTL         = 7 * 24 * time.Hour
	vaultKeyPrefix   = "vault:token:"
	reverseKeyPrefix = "vault:value:"
)

// TokenVault provides reversible tokenization backed by Redis.
type TokenVault struct {
	rdb      *redis.Client
	tenantID string
}

// NewTokenVault creates a TokenVault for a specific tenant.
func NewTokenVault(rdb *redis.Client, tenantID string) *TokenVault {
	return &TokenVault{rdb: rdb, tenantID: tenantID}
}

// Tokenize replaces a PII value with a stable, reversible token.
func (v *TokenVault) Tokenize(ctx context.Context, value, piiType string) (string, error) {
	if value == "" {
		return value, nil
	}
	reverseKey := v.reverseKey(value, piiType)
	existing, err := v.rdb.Get(ctx, reverseKey).Result()
	if err == nil && existing != "" {
		v.rdb.Expire(ctx, reverseKey, tokenTTL)
		v.rdb.Expire(ctx, v.tokenKey(existing), tokenTTL)
		return existing, nil
	}

	rawBytes := make([]byte, 16)
	if _, err := rand.Read(rawBytes); err != nil {
		return "", fmt.Errorf("generate token entropy: %w", err)
	}
	token := tokenPrefix + strings.ToUpper(piiType) + "_" + hex.EncodeToString(rawBytes)

	pipe := v.rdb.Pipeline()
	pipe.Set(ctx, v.tokenKey(token), value, tokenTTL)
	pipe.Set(ctx, reverseKey, token, tokenTTL)
	if _, err := pipe.Exec(ctx); err != nil {
		return "", fmt.Errorf("store token: %w", err)
	}
	return token, nil
}

// Detokenize resolves a token back to its original PII value.
func (v *TokenVault) Detokenize(ctx context.Context, token string) (string, error) {
	if !strings.HasPrefix(token, tokenPrefix) {
		return token, nil
	}
	value, err := v.rdb.Get(ctx, v.tokenKey(token)).Result()
	if err == redis.Nil {
		return "", ErrTokenNotFound{Token: token}
	}
	if err != nil {
		return "", fmt.Errorf("detokenize lookup: %w", err)
	}
	return value, nil
}

// TokenizeJSON replaces all detected PII values in a JSON document with tokens.
func (v *TokenVault) TokenizeJSON(ctx context.Context, data []byte, detections []DetectionResult) ([]byte, map[string]string, error) {
	if len(detections) == 0 {
		return data, nil, nil
	}
	tokenMap := make(map[string]string)
	modified := make([]byte, len(data))
	copy(modified, data)

	for _, det := range detections {
		original := extractRawMatch(data, det)
		if original == "" {
			continue
		}
		token, err := v.Tokenize(ctx, original, det.PIIType)
		if err != nil {
			return nil, nil, fmt.Errorf("tokenize field %s: %w", det.FieldName, err)
		}
		tokenMap[token] = original
		cfg := MaskingConfig{Strategy: MaskRedact, RedactLabel: token}
		modified, _, _ = MaskJSON(modified, []DetectionResult{det}, cfg)
	}
	return modified, tokenMap, nil
}

// DetokenizeJSON replaces all vault tokens in a JSON document with originals.
func (v *TokenVault) DetokenizeJSON(ctx context.Context, data []byte) ([]byte, error) {
	text := string(data)
	re := regexp.MustCompile(tokenPrefix + `[A-Z_]+_[0-9a-f]{32}`)
	tokens := re.FindAllString(text, -1)
	for _, token := range tokens {
		original, err := v.Detokenize(ctx, token)
		if err != nil {
			continue
		}
		text = strings.ReplaceAll(text, token, original)
	}
	return []byte(text), nil
}

func (v *TokenVault) tokenKey(token string) string {
	return vaultKeyPrefix + v.tenantID + ":" + token
}

func (v *TokenVault) reverseKey(value, piiType string) string {
	return reverseKeyPrefix + v.tenantID + ":" + piiType + ":" + shortHash(value)
}

func shortHash(s string) string {
	h := uint64(5381)
	for i := 0; i < len(s); i++ {
		h = ((h << 5) + h) + uint64(s[i])
	}
	return fmt.Sprintf("%016x", h)
}

func extractRawMatch(data []byte, det DetectionResult) string {
	if det.MatchStart < 0 || det.MatchEnd > len(data) || det.MatchStart >= det.MatchEnd {
		return ""
	}
	return string(data[det.MatchStart:det.MatchEnd])
}

// ErrTokenNotFound is returned when a vault token cannot be resolved.
type ErrTokenNotFound struct{ Token string }

func (e ErrTokenNotFound) Error() string {
	return fmt.Sprintf("vault token not found or expired: %s", e.Token)
}
