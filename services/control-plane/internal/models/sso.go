// services/control-plane/internal/models/sso.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// SSO provider constants.
const (
	SSOProviderOIDC = "oidc"
)

// SSOConnection is a tenant's enterprise SSO (OIDC) configuration.
type SSOConnection struct {
	bun.BaseModel `bun:"table:sso_connections,alias:sso"`

	ID            string    `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID      string    `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	Provider      string    `bun:"provider,notnull,default:'oidc'"            json:"provider"`
	Enabled       bool      `bun:"enabled,notnull,default:false"              json:"enabled"`
	IssuerURL     string    `bun:"issuer_url,notnull,default:''"              json:"issuer_url"`
	ClientID      string    `bun:"client_id,notnull,default:''"               json:"client_id"`
	ClientSecret  string    `bun:"client_secret,notnull,default:''"           json:"-"` // encrypted; never serialised
	EmailDomains  []string  `bun:"email_domains,array,default:'{}'"           json:"email_domains"`
	DefaultRole   string    `bun:"default_role,notnull,default:'viewer'"      json:"default_role"`
	AutoProvision bool      `bun:"auto_provision,notnull,default:true"        json:"auto_provision"`
	SCIMEnabled   bool      `bun:"scim_enabled,notnull,default:false"         json:"scim_enabled"`
	SCIMTokenHash string    `bun:"scim_token_hash,notnull,default:''"         json:"-"`
	CreatedAt     time.Time `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt     time.Time `bun:"updated_at,notnull,default:now()"           json:"updated_at"`
}

// SSOConnectionResponse is the admin-facing view (never exposes the secret).
type SSOConnectionResponse struct {
	Enabled         bool     `json:"enabled"`
	Provider        string   `json:"provider"`
	IssuerURL       string   `json:"issuer_url"`
	ClientID        string   `json:"client_id"`
	ClientSecretSet bool     `json:"client_secret_set"`
	EmailDomains    []string `json:"email_domains"`
	DefaultRole     string   `json:"default_role"`
	AutoProvision   bool     `json:"auto_provision"`
	SCIMEnabled     bool     `json:"scim_enabled"`
	SCIMTokenSet    bool     `json:"scim_token_set"`
}

// ToResponse maps a connection to its safe response form.
func (c *SSOConnection) ToResponse() *SSOConnectionResponse {
	domains := c.EmailDomains
	if domains == nil {
		domains = []string{}
	}
	return &SSOConnectionResponse{
		Enabled:         c.Enabled,
		Provider:        c.Provider,
		IssuerURL:       c.IssuerURL,
		ClientID:        c.ClientID,
		ClientSecretSet: c.ClientSecret != "",
		EmailDomains:    domains,
		DefaultRole:     c.DefaultRole,
		AutoProvision:   c.AutoProvision,
		SCIMEnabled:     c.SCIMEnabled,
		SCIMTokenSet:    c.SCIMTokenHash != "",
	}
}

// UpsertSSOConnectionInput is the admin request body for configuring SSO.
type UpsertSSOConnectionInput struct {
	Enabled       bool     `json:"enabled"`
	IssuerURL     string   `json:"issuer_url"     validate:"omitempty,url"`
	ClientID      string   `json:"client_id"      validate:"omitempty,max=512"`
	ClientSecret  *string  `json:"client_secret"  validate:"omitempty,max=1024"` // nil = keep existing
	EmailDomains  []string `json:"email_domains"`
	DefaultRole   string   `json:"default_role"   validate:"omitempty,oneof=admin analyst viewer"`
	AutoProvision bool     `json:"auto_provision"`
}

// SSOStartInput is the public request to begin an SSO login.
type SSOStartInput struct {
	Email string `json:"email" form:"email" validate:"required,email"`
}

// SSOExchangeInput swaps a one-time SSO code for a session.
type SSOExchangeInput struct {
	Code string `json:"code" validate:"required"`
}
