// services/control-plane/internal/models/platform_admin.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// PlatformAdmin is a DataSentinel platform operator (super-admin). It is a
// distinct identity from tenant users: it has NO tenant_id, is not subject to
// row-level security, and authenticates through a separate login that issues a
// token with the "platform_admin" scope. Platform admins have the highest level
// of control over the product — every tenant, service and data set.
type PlatformAdmin struct {
	bun.BaseModel `bun:"table:platform_admins,alias:pa"`

	ID                  string     `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	Email               string     `bun:"email,notnull,unique"                       json:"email"`
	PasswordHash        string     `bun:"password_hash,notnull"                      json:"-"`
	FullName            string     `bun:"full_name,notnull,default:''"               json:"full_name"`
	IsActive            bool       `bun:"is_active,notnull,default:true"             json:"is_active"`
	MFAEnabled          bool       `bun:"mfa_enabled,notnull,default:false"          json:"mfa_enabled"`
	MFASecret           *string    `bun:"mfa_secret"                                 json:"-"`
	LastLoginAt         *time.Time `bun:"last_login_at"                              json:"last_login_at"`
	FailedLoginAttempts int        `bun:"failed_login_attempts,notnull,default:0"    json:"-"`
	LockedUntil         *time.Time `bun:"locked_until"                               json:"-"`
	CreatedBy           *string    `bun:"created_by,type:uuid"                       json:"created_by"`
	CreatedAt           time.Time  `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt           time.Time  `bun:"updated_at,notnull,default:now()"           json:"updated_at"`
}

// IsLocked reports whether the account is currently in a lockout window.
func (a *PlatformAdmin) IsLocked() bool {
	return a.LockedUntil != nil && a.LockedUntil.After(time.Now())
}

// PlatformAdminResponse is the safe, serialisable view of a platform admin.
type PlatformAdminResponse struct {
	ID          string     `json:"id"`
	Email       string     `json:"email"`
	FullName    string     `json:"full_name"`
	IsActive    bool       `json:"is_active"`
	MFAEnabled  bool       `json:"mfa_enabled"`
	LastLoginAt *time.Time `json:"last_login_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

// ToResponse projects a PlatformAdmin onto its safe response form.
func (a *PlatformAdmin) ToResponse() *PlatformAdminResponse {
	return &PlatformAdminResponse{
		ID:          a.ID,
		Email:       a.Email,
		FullName:    a.FullName,
		IsActive:    a.IsActive,
		MFAEnabled:  a.MFAEnabled,
		LastLoginAt: a.LastLoginAt,
		CreatedAt:   a.CreatedAt,
	}
}

// PlatformAudit is an immutable record of a platform-admin action. It is global
// (not tenant-scoped) so vendor operations are fully accountable.
type PlatformAudit struct {
	bun.BaseModel `bun:"table:platform_audit,alias:pau"`

	ID         string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	AdminID    string         `bun:"admin_id,notnull,type:uuid"                 json:"admin_id"`
	AdminEmail string         `bun:"admin_email,notnull,default:''"             json:"admin_email"`
	Action     string         `bun:"action,notnull"                             json:"action"`
	TargetType string         `bun:"target_type,notnull,default:''"             json:"target_type"`
	TargetID   string         `bun:"target_id,notnull,default:''"               json:"target_id"`
	Detail     map[string]any `bun:"detail,type:jsonb,default:'{}'"             json:"detail"`
	IPAddress  string         `bun:"ip_address,notnull,default:''"              json:"ip_address"`
	CreatedAt  time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`
}

// ---- DTOs -------------------------------------------------------------------

// PlatformLoginInput is the platform-admin login payload.
type PlatformLoginInput struct {
	Email    string `json:"email"     validate:"required,email"`
	Password string `json:"password"  validate:"required"`
	TOTPCode string `json:"totp_code"`
}

// CreatePlatformAdminInput creates a new platform admin.
type CreatePlatformAdminInput struct {
	Email    string `json:"email"     validate:"required,email"`
	FullName string `json:"full_name" validate:"required,min=1,max=255"`
	Password string `json:"password"  validate:"required,min=12"`
}

// PlatformAuthResponse is returned on successful platform login.
type PlatformAuthResponse struct {
	AccessToken string                 `json:"access_token"`
	ExpiresIn   int                    `json:"expires_in"`
	Admin       *PlatformAdminResponse `json:"admin"`
}

// TenantAdminView is a tenant enriched with platform-level statistics.
type TenantAdminView struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Slug          string    `json:"slug"`
	Plan          string    `json:"plan"`
	IsActive      bool      `json:"is_active"`
	DataRegion    string    `json:"data_region"`
	PrivateDeploy bool      `json:"private_deploy"`
	UserCount     int       `json:"user_count"`
	AssetCount    int       `json:"asset_count"`
	FindingCount  int       `json:"finding_count"`
	CreatedAt     time.Time `json:"created_at"`
}

// PlatformStats is the platform-wide overview shown on the admin dashboard.
type PlatformStats struct {
	TotalTenants     int64 `json:"total_tenants"`
	ActiveTenants    int64 `json:"active_tenants"`
	SuspendedTenants int64 `json:"suspended_tenants"`
	TotalUsers       int64 `json:"total_users"`
	TotalAssets      int64 `json:"total_assets"`
	TotalFindings    int64 `json:"total_findings"`
	TotalScans       int64 `json:"total_scans"`
	TotalPolicies    int64 `json:"total_policies"`
	PlatformAdmins   int64 `json:"platform_admins"`
}
