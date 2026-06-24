// services/control-plane/internal/services/crypto_test.go

package services

import (
	"strings"
	"testing"
)

// A valid 32-byte (64 hex char) master key for tests.
const testMasterHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

const (
	tenantA = "11111111-1111-1111-1111-111111111111"
	tenantB = "22222222-2222-2222-2222-222222222222"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	plaintext := "super-secret-oidc-client-secret"

	ct, err := encrypt(plaintext, testMasterHex, tenantA)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if ct == plaintext || ct == "" {
		t.Fatalf("ciphertext looks wrong: %q", ct)
	}

	got, err := decrypt(&ct, testMasterHex, tenantA)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if got != plaintext {
		t.Fatalf("round-trip mismatch: got %q want %q", got, plaintext)
	}
}

// TestEncryptTenantIsolation is the key security property: a value encrypted for
// one tenant MUST NOT be decryptable with another tenant's context, because each
// tenant uses an HKDF-derived key.
func TestEncryptTenantIsolation(t *testing.T) {
	ct, err := encrypt("tenant-A-only", testMasterHex, tenantA)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	if _, err := decrypt(&ct, testMasterHex, tenantB); err == nil {
		t.Fatal("SECURITY: tenant B was able to decrypt tenant A's ciphertext")
	}
}

func TestDecryptWrongMasterKeyFails(t *testing.T) {
	ct, err := encrypt("secret", testMasterHex, tenantA)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	otherMaster := strings.Repeat("ab", 32)
	if _, err := decrypt(&ct, otherMaster, tenantA); err == nil {
		t.Fatal("decrypt should fail with the wrong master key")
	}
}

func TestEncryptIsNonDeterministic(t *testing.T) {
	a, err := encrypt("same", testMasterHex, tenantA)
	if err != nil {
		t.Fatalf("encrypt a: %v", err)
	}
	b, err := encrypt("same", testMasterHex, tenantA)
	if err != nil {
		t.Fatalf("encrypt b: %v", err)
	}
	if a == b {
		t.Fatal("two encryptions of the same plaintext produced identical ciphertext (nonce reuse?)")
	}
}

func TestDecryptTamperDetected(t *testing.T) {
	ct, err := encrypt("secret", testMasterHex, tenantA)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	// Flip a character in the base64 ciphertext.
	b := []byte(ct)
	if b[len(b)-2] == 'A' {
		b[len(b)-2] = 'B'
	} else {
		b[len(b)-2] = 'A'
	}
	tampered := string(b)
	if _, err := decrypt(&tampered, testMasterHex, tenantA); err == nil {
		t.Fatal("GCM should have rejected tampered ciphertext")
	}
}

func TestDeriveTenantKeyDistinctAndStable(t *testing.T) {
	a1, err := deriveTenantKey(testMasterHex, tenantA)
	if err != nil {
		t.Fatalf("derive a1: %v", err)
	}
	a2, _ := deriveTenantKey(testMasterHex, tenantA)
	b, _ := deriveTenantKey(testMasterHex, tenantB)

	if len(a1) != 32 {
		t.Fatalf("derived key must be 32 bytes, got %d", len(a1))
	}
	if string(a1) != string(a2) {
		t.Fatal("key derivation must be deterministic for the same tenant")
	}
	if string(a1) == string(b) {
		t.Fatal("different tenants must derive different keys")
	}
}

func TestDecryptNilCiphertext(t *testing.T) {
	if _, err := decrypt(nil, testMasterHex, tenantA); err == nil {
		t.Fatal("decrypt(nil) should return an error")
	}
}
