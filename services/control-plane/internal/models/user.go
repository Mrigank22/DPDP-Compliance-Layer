// services/control-plane/internal/models/user.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Role constants
const (
	RoleOwner   = "owner"
	RoleAdmin   = "admin"
	RoleAnalyst = "analyst"
	RoleViewer  = "viewer"
)

// User represents an authenticated operator within a tenant.
type User struct {
	bun.BaseModel `bun:"table:users,alias:u"`

	ID                   string     `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID             string     `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	Email                string     `bun:"email,notnull,unique"                        json:"email"           validate:"required,email"`
	PasswordHash         *string    `bun:"password_hash"                               json:"-"`               // never serialised
	FullName             string     `bun:"full_name,notnull,default:''"               json:"full_name"       validate:"required,min=1,max=255"`
	Role                 string     `bun:"role,notnull,default:viewer"                json:"role"            validate:"required,oneof=owner admin analyst viewer"`
	IsActive             bool       `bun:"is_active,notnull,default:true"             json:"is_active"`
	LastLoginAt          *time.Time `bun:"last_login_at"                              json:"last_login_at"`
	FailedLoginAttempts  int        `bun:"failed_login_attempts,notnull,default:0"    json:"-"`
	LockedUntil          *time.Time `bun:"locked_until"                               json:"-"`
	MFAEnabled           bool       `bun:"mfa_enabled,notnull,default:false"          json:"mfa_enabled"`
	MFASecret            *string    `bun:"mfa_secret"                                 json:"-"`               // AES-256-GCM encrypted
	InvitedBy            *string    `bun:"invited_by,type:uuid"                       json:"invited_by"`
	CreatedAt            time.Time  `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt            time.Time  `bun:"updated_at,notnull,default:now()"           json:"updated_at"`

	// Relations
	Tenant *Tenant `bun:"rel:belongs-to,join:tenant_id=id" json:"tenant,omitempty"`
}

// IsLocked returns true when the account is currently locked due to failed attempts.
func (u *User) IsLocked() bool {
	if u.LockedUntil == nil {
		return false
	}
	return time.Now().Before(*u.LockedUntil)
}

// HasRole checks whether the user has at least the given role.
// Role hierarchy: owner > admin > analyst > viewer
func (u *User) HasRole(minimum string) bool {
	hierarchy := map[string]int{
		RoleViewer:  1,
		RoleAnalyst: 2,
		RoleAdmin:   3,
		RoleOwner:   4,
	}
	return hierarchy[u.Role] >= hierarchy[minimum]
}

// CanWrite returns true for roles that are allowed to mutate resources.
func (u *User) CanWrite() bool { return u.HasRole(RoleAnalyst) }

// CanAdmin returns true for roles with administrative privileges.
func (u *User) CanAdmin() bool { return u.HasRole(RoleAdmin) }

// CanOwn returns true only for the tenant owner.
func (u *User) CanOwn() bool { return u.Role == RoleOwner }

// ---- Request / Response DTOs ------------------------------------------------

type RegisterInput struct {
	Email     string `json:"email"      validate:"required,email"`
	Password  string `json:"password"   validate:"required,min=8,max=128"`
	FullName  string `json:"full_name"  validate:"required,min=1,max=255"`
	TenantName string `json:"tenant_name" validate:"required,min=2,max=255"`
	TenantSlug string `json:"tenant_slug" validate:"required,min=2,max=63"`
}

type LoginInput struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required"`
	TOTPCode string `json:"totp_code"` // optional; required if MFA enabled
}

type InviteUserInput struct {
	Email    string `json:"email"    validate:"required,email"`
	FullName string `json:"full_name" validate:"required,min=1,max=255"`
	Role     string `json:"role"     validate:"required,oneof=admin analyst viewer"`
}

type UpdateUserInput struct {
	FullName *string `json:"full_name" validate:"omitempty,min=1,max=255"`
	Role     *string `json:"role"      validate:"omitempty,oneof=owner admin analyst viewer"`
	IsActive *bool   `json:"is_active"`
}

type ChangePasswordInput struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password"     validate:"required,min=8,max=128"`
}

// UserResponse is the safe public shape of a user; never includes secrets.
type UserResponse struct {
	ID          string     `json:"id"`
	TenantID    string     `json:"tenant_id"`
	Email       string     `json:"email"`
	FullName    string     `json:"full_name"`
	Role        string     `json:"role"`
	IsActive    bool       `json:"is_active"`
	LastLoginAt *time.Time `json:"last_login_at"`
	MFAEnabled  bool       `json:"mfa_enabled"`
	InvitedBy   *string    `json:"invited_by"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (u *User) ToResponse() *UserResponse {
	return &UserResponse{
		ID:          u.ID,
		TenantID:    u.TenantID,
		Email:       u.Email,
		FullName:    u.FullName,
		Role:        u.Role,
		IsActive:    u.IsActive,
		LastLoginAt: u.LastLoginAt,
		MFAEnabled:  u.MFAEnabled,
		InvitedBy:   u.InvitedBy,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
	}
}

// AuthTokenResponse is returned after a successful login or token refresh.
type AuthTokenResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	ExpiresIn    int          `json:"expires_in"` // seconds
	User         UserResponse `json:"user"`
}
