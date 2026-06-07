// services/control-plane/internal/models/apikey.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// API key scope constants
const (
	ScopeRead    = "read"
	ScopeWrite   = "write"
	ScopeGateway = "gateway"
	ScopeAdmin   = "admin"
)

// APIKey represents a long-lived machine credential scoped to a tenant.
// The raw key is shown only once at creation time; only the SHA-256 hash is stored.
type APIKey struct {
	bun.BaseModel `bun:"table:api_keys,alias:ak"`

	ID         string     `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID   string     `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	UserID     string     `bun:"user_id,notnull,type:uuid"                  json:"user_id"`
	Name       string     `bun:"name,notnull"                               json:"name"        validate:"required,min=1,max=100"`
	KeyHash    string     `bun:"key_hash,notnull,unique"                    json:"-"`          // never exposed
	KeyPrefix  string     `bun:"key_prefix,notnull"                         json:"key_prefix"` // first 8 chars
	Scopes     []string   `bun:"scopes,array,default:'{}'"                  json:"scopes"      validate:"required,dive,oneof=read write gateway admin"`
	LastUsedAt *time.Time `bun:"last_used_at"                               json:"last_used_at"`
	ExpiresAt  *time.Time `bun:"expires_at"                                 json:"expires_at"`
	IsActive   bool       `bun:"is_active,notnull,default:true"             json:"is_active"`
	CreatedAt  time.Time  `bun:"created_at,notnull,default:now()"           json:"created_at"`

	// Relations
	User   *User   `bun:"rel:belongs-to,join:user_id=id"     json:"user,omitempty"`
	Tenant *Tenant `bun:"rel:belongs-to,join:tenant_id=id"   json:"tenant,omitempty"`
}

// IsExpired returns true when the key has a set expiry that has passed.
func (k *APIKey) IsExpired() bool {
	if k.ExpiresAt == nil {
		return false
	}
	return time.Now().After(*k.ExpiresAt)
}

// HasScope checks whether the key grants the requested scope.
func (k *APIKey) HasScope(scope string) bool {
	for _, s := range k.Scopes {
		if s == scope || s == ScopeAdmin {
			return true
		}
	}
	return false
}

// ---- DTOs -------------------------------------------------------------------

type CreateAPIKeyInput struct {
	Name      string     `json:"name"       validate:"required,min=1,max=100"`
	Scopes    []string   `json:"scopes"     validate:"required,min=1,dive,oneof=read write gateway admin"`
	ExpiresAt *time.Time `json:"expires_at"`
}

// APIKeyCreateResponse is returned once at key-creation time; RawKey is never stored.
type APIKeyCreateResponse struct {
	ID        string     `json:"id"`
	TenantID  string     `json:"tenant_id"`
	UserID    string     `json:"user_id"`
	Name      string     `json:"name"`
	RawKey    string     `json:"key"` // shown once only
	KeyPrefix string     `json:"key_prefix"`
	Scopes    []string   `json:"scopes"`
	ExpiresAt *time.Time `json:"expires_at"`
	CreatedAt time.Time  `json:"created_at"`
}

// APIKeyResponse is the safe representation for list / detail views.
type APIKeyResponse struct {
	ID         string     `json:"id"`
	TenantID   string     `json:"tenant_id"`
	UserID     string     `json:"user_id"`
	Name       string     `json:"name"`
	KeyPrefix  string     `json:"key_prefix"`
	Scopes     []string   `json:"scopes"`
	LastUsedAt *time.Time `json:"last_used_at"`
	ExpiresAt  *time.Time `json:"expires_at"`
	IsActive   bool       `json:"is_active"`
	CreatedAt  time.Time  `json:"created_at"`
}

func (k *APIKey) ToResponse() *APIKeyResponse {
	return &APIKeyResponse{
		ID:         k.ID,
		TenantID:   k.TenantID,
		UserID:     k.UserID,
		Name:       k.Name,
		KeyPrefix:  k.KeyPrefix,
		Scopes:     k.Scopes,
		LastUsedAt: k.LastUsedAt,
		ExpiresAt:  k.ExpiresAt,
		IsActive:   k.IsActive,
		CreatedAt:  k.CreatedAt,
	}
}
