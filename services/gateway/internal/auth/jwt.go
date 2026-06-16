// services/gateway/internal/auth/jwt.go
//
// A minimal, dependency-free RS256 JWT verifier. The control plane signs access
// tokens with RS256; the gateway verifies the signature with the distributed
// public key before trusting the tenant claim. When no public key is configured
// JWT auth is disabled (callers must use the X-API-Key path) — secure by default.

package auth

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

// Verifier verifies RS256 JWTs against an RSA public key.
type Verifier struct {
	pub *rsa.PublicKey
}

// LoadVerifier loads an RSA public key from a PEM file. An empty path yields a
// disabled verifier (JWT auth rejected; X-API-Key still works).
func LoadVerifier(pemPath string) (*Verifier, error) {
	if strings.TrimSpace(pemPath) == "" {
		return &Verifier{}, nil
	}
	data, err := os.ReadFile(pemPath)
	if err != nil {
		return nil, fmt.Errorf("read jwt public key: %w", err)
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, errors.New("jwt public key: no PEM block found")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		// Fall back to PKCS1 public key format
		if rsaPub, e2 := x509.ParsePKCS1PublicKey(block.Bytes); e2 == nil {
			return &Verifier{pub: rsaPub}, nil
		}
		return nil, fmt.Errorf("parse jwt public key: %w", err)
	}
	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("jwt public key is not RSA")
	}
	return &Verifier{pub: rsaPub}, nil
}

// Enabled reports whether signature verification is configured.
func (v *Verifier) Enabled() bool { return v != nil && v.pub != nil }

type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

// TenantFromBearer verifies an "Authorization: Bearer <jwt>" header and returns
// the verified tenant_id (tid) claim.
func (v *Verifier) TenantFromBearer(authHeader string) (string, error) {
	if !v.Enabled() {
		return "", errors.New("jwt verification is disabled; use X-API-Key")
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return "", errors.New("malformed authorization header")
	}
	segs := strings.Split(parts[1], ".")
	if len(segs) != 3 {
		return "", errors.New("malformed jwt")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(segs[0])
	if err != nil {
		return "", errors.New("invalid jwt header encoding")
	}
	var hdr jwtHeader
	if err := json.Unmarshal(headerBytes, &hdr); err != nil {
		return "", errors.New("invalid jwt header")
	}
	if hdr.Alg != "RS256" {
		return "", fmt.Errorf("unsupported jwt alg %q", hdr.Alg)
	}

	sig, err := base64.RawURLEncoding.DecodeString(segs[2])
	if err != nil {
		return "", errors.New("invalid jwt signature encoding")
	}
	signingInput := segs[0] + "." + segs[1]
	digest := sha256.Sum256([]byte(signingInput))
	if err := rsa.VerifyPKCS1v15(v.pub, crypto.SHA256, digest[:], sig); err != nil {
		return "", errors.New("jwt signature verification failed")
	}

	claimBytes, err := base64.RawURLEncoding.DecodeString(segs[1])
	if err != nil {
		return "", errors.New("invalid jwt claims encoding")
	}
	var claims struct {
		TID string  `json:"tid"`
		Exp float64 `json:"exp"`
	}
	if err := json.Unmarshal(claimBytes, &claims); err != nil {
		return "", errors.New("invalid jwt claims")
	}
	if claims.Exp > 0 && time.Now().Unix() > int64(claims.Exp) {
		return "", errors.New("token expired")
	}
	if claims.TID == "" {
		return "", errors.New("missing tenant id claim")
	}
	return claims.TID, nil
}
