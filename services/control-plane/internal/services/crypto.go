// services/control-plane/internal/services/crypto.go

package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"

	"golang.org/x/crypto/hkdf"
)

// deriveTenantKey uses HKDF-SHA256 to derive a 32-byte AES key for a given
// tenant from the master key, ensuring each tenant's data uses a distinct key
// while requiring only one master secret to manage.
func deriveTenantKey(masterHex, tenantID string) ([]byte, error) {
	master, err := decodeHex32(masterHex)
	if err != nil {
		return nil, fmt.Errorf("decode master key: %w", err)
	}

	hk := hkdf.New(sha256.New, master, []byte("datasentinel-v1"), []byte(tenantID))
	derived := make([]byte, 32)
	if _, err := io.ReadFull(hk, derived); err != nil {
		return nil, fmt.Errorf("hkdf derive: %w", err)
	}
	return derived, nil
}

// encrypt encrypts plaintext using AES-256-GCM with a per-tenant derived key.
// Returns a base64-encoded string of the form: base64(nonce || ciphertext || tag).
func encrypt(plaintext, masterHex, tenantID string) (string, error) {
	key, err := deriveTenantKey(masterHex, tenantID)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("gcm init: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// decrypt reverses encrypt. Accepts *string so callers can pass nullable model fields directly.
func decrypt(ciphertextB64 *string, masterHex, tenantID string) (string, error) {
	if ciphertextB64 == nil {
		return "", fmt.Errorf("ciphertext is nil")
	}
	data, err := base64.StdEncoding.DecodeString(*ciphertextB64)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}
	key, err := deriveTenantKey(masterHex, tenantID)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("gcm init: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ct := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("gcm decrypt: %w", err)
	}
	return string(plaintext), nil
}

// decodeHex32 decodes a 64-character hex string into a 32-byte slice.
func decodeHex32(h string) ([]byte, error) {
	if len(h) != 64 {
		return nil, fmt.Errorf("expected 64 hex characters (32 bytes), got %d", len(h))
	}
	b := make([]byte, 32)
	for i := 0; i < 32; i++ {
		hi := hexVal(h[i*2])
		lo := hexVal(h[i*2+1])
		if hi < 0 || lo < 0 {
			return nil, fmt.Errorf("invalid hex character at position %d", i*2)
		}
		b[i] = byte(hi<<4 | lo)
	}
	return b, nil
}

func hexVal(c byte) int {
	switch {
	case c >= '0' && c <= '9':
		return int(c - '0')
	case c >= 'a' && c <= 'f':
		return int(c-'a') + 10
	case c >= 'A' && c <= 'F':
		return int(c-'A') + 10
	}
	return -1
}

// EncryptConnectionConfig serialises a map[string]any to JSON then AES-256-GCM encrypts it.
func EncryptConnectionConfig(config map[string]any, masterHex, tenantID string) (string, error) {
	if len(config) == 0 {
		return "", nil
	}
	b, err := json.Marshal(config)
	if err != nil {
		return "", fmt.Errorf("marshal connection config: %w", err)
	}
	return encrypt(string(b), masterHex, tenantID)
}

// DecryptConnectionConfig is the inverse of EncryptConnectionConfig.
func DecryptConnectionConfig(ciphertextB64 *string, masterHex, tenantID string) (map[string]any, error) {
	if ciphertextB64 == nil || *ciphertextB64 == "" {
		return nil, nil
	}
	plaintext, err := decrypt(ciphertextB64, masterHex, tenantID)
	if err != nil {
		return nil, fmt.Errorf("decrypt connection config: %w", err)
	}
	var result map[string]any
	if err := json.Unmarshal([]byte(plaintext), &result); err != nil {
		return nil, fmt.Errorf("unmarshal connection config: %w", err)
	}
	return result, nil
}
