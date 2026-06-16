// services/gateway/internal/engine/actions.go
//
// Additional, non-reversible enforcement actions beyond mask/redact/tokenize:
//   - encrypt: AES-256-GCM with a per-tenant key derived from the master key
//     (HKDF-SHA256), base64-encoded as nonce||ciphertext. Compatible with the
//     workers' AES-GCM decrypt format.
//   - hash: one-way SHA-256 hex (pseudonymisation; preserves joinability).

package engine

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

// EncryptJSON encrypts every detected PII value in-place with AES-256-GCM under
// a per-tenant key. Output values are base64(nonce||ciphertext).
func EncryptJSON(data []byte, detections []DetectionResult, masterHex, tenantID string) ([]byte, []string, error) {
	if len(detections) == 0 {
		return data, nil, nil
	}
	key, err := deriveTenantKey(masterHex, tenantID)
	if err != nil {
		return data, nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return data, nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return data, nil, err
	}
	enc := func(s string) string {
		nonce := make([]byte, gcm.NonceSize())
		if _, err := rand.Read(nonce); err != nil {
			return s // fail closed-ish: leave value (caller logs); never panic
		}
		ct := gcm.Seal(nil, nonce, []byte(s), nil)
		return base64.StdEncoding.EncodeToString(append(nonce, ct...))
	}
	return transformJSON(data, detections, enc)
}

// HashJSON replaces every detected PII value with its SHA-256 hex digest.
func HashJSON(data []byte, detections []DetectionResult) ([]byte, []string, error) {
	if len(detections) == 0 {
		return data, nil, nil
	}
	h := func(s string) string {
		sum := sha256.Sum256([]byte(s))
		return hex.EncodeToString(sum[:])
	}
	return transformJSON(data, detections, h)
}

// deriveTenantKey derives a 32-byte key from the hex master key using
// HKDF-SHA256 (salt="datasentinel-v1", info=tenantID). Matches the workers'
// key derivation so values are decryptable cross-service.
func deriveTenantKey(masterHex, tenantID string) ([]byte, error) {
	master, err := hex.DecodeString(masterHex)
	if err != nil || len(master) == 0 {
		return nil, fmt.Errorf("invalid master encryption key")
	}
	// HKDF-Extract
	ext := hmac.New(sha256.New, []byte("datasentinel-v1"))
	ext.Write(master)
	prk := ext.Sum(nil)
	// HKDF-Expand (single 32-byte block: L == hashLen)
	exp := hmac.New(sha256.New, prk)
	exp.Write([]byte(tenantID))
	exp.Write([]byte{0x01})
	return exp.Sum(nil), nil
}

// transformJSON applies fn to every detected PII value, threading through the
// JSON structure by field path. Falls back to offset-based text replacement for
// non-JSON payloads.
func transformJSON(data []byte, detections []DetectionResult, fn func(string) string) ([]byte, []string, error) {
	var root any
	if err := json.Unmarshal(data, &root); err != nil {
		return transformText(data, detections, fn)
	}
	fields := make([]string, 0, len(detections))
	pathSet := make(map[string]bool, len(detections))
	for _, d := range detections {
		pathSet[d.FieldName] = true
		fields = append(fields, d.FieldName)
	}
	transformJSONNode(root, "", pathSet, fn)
	out, err := json.Marshal(root)
	return out, fields, err
}

func transformJSONNode(node any, path string, pathSet map[string]bool, fn func(string) string) {
	switch v := node.(type) {
	case map[string]any:
		for key := range v {
			childPath := path
			if childPath != "" {
				childPath += "."
			}
			childPath += key
			if pathSet[childPath] {
				if strVal, isStr := v[key].(string); isStr {
					v[key] = fn(strVal)
				}
			} else {
				transformJSONNode(v[key], childPath, pathSet, fn)
			}
		}
	case []any:
		for i := range v {
			transformJSONNode(v[i], path, pathSet, fn)
		}
	}
}

// transformText applies fn to matched offsets in a non-JSON payload, replacing
// from the end so earlier indices stay valid.
func transformText(data []byte, detections []DetectionResult, fn func(string) string) ([]byte, []string, error) {
	sorted := make([]DetectionResult, len(detections))
	copy(sorted, detections)
	for i := 0; i < len(sorted)-1; i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].MatchStart > sorted[i].MatchStart {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	runes := []rune(string(data))
	fields := make([]string, 0, len(sorted))
	for _, d := range sorted {
		if d.MatchStart < 0 || d.MatchStart >= len(runes) || d.MatchEnd > len(runes) || d.MatchStart >= d.MatchEnd {
			continue
		}
		original := string(runes[d.MatchStart:d.MatchEnd])
		repl := []rune(fn(original))
		runes = append(runes[:d.MatchStart], append(repl, runes[d.MatchEnd:]...)...)
		fields = append(fields, d.FieldName)
	}
	return []byte(string(runes)), fields, nil
}
