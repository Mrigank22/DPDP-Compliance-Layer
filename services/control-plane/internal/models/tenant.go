// services/control-plane/internal/models/tenant.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Plan constants
const (
	PlanStarter    = "starter"
	PlanGrowth     = "growth"
	PlanEnterprise = "enterprise"
)

// Tenant represents a DataSentinel customer organisation.
// Every other model is scoped to a tenant via tenant_id.
type Tenant struct {
	bun.BaseModel `bun:"table:tenants,alias:t"`

	ID            string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	Name          string         `bun:"name,notnull"                               json:"name"           validate:"required,min=2,max=255"`
	Slug          string         `bun:"slug,notnull,unique"                        json:"slug"           validate:"required,min=2,max=63,alphanum"`
	Plan          string         `bun:"plan,notnull,default:starter"               json:"plan"           validate:"required,oneof=starter growth enterprise"`
	IsActive      bool           `bun:"is_active,notnull,default:true"             json:"is_active"`
	Settings      map[string]any `bun:"settings,type:jsonb,default:{}"             json:"settings"`
	DataRegion    string         `bun:"data_region,notnull,default:ap-south-1"     json:"data_region"`
	PrivateDeploy bool           `bun:"private_deploy,notnull,default:false"       json:"private_deploy"`
	CreatedAt     time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt     time.Time      `bun:"updated_at,notnull,default:now()"           json:"updated_at"`

	// Associations (not stored in DB column, loaded via relations)
	Users []*User `bun:"rel:has-many,join:id=tenant_id" json:"users,omitempty"`
}

// CreateTenantInput is the validated payload for tenant creation.
type CreateTenantInput struct {
	Name          string         `json:"name"           validate:"required,min=2,max=255"`
	Slug          string         `json:"slug"           validate:"required,min=2,max=63"`
	Plan          string         `json:"plan"           validate:"required,oneof=starter growth enterprise"`
	DataRegion    string         `json:"data_region"    validate:"omitempty"`
	Settings      map[string]any `json:"settings"`
	PrivateDeploy bool           `json:"private_deploy"`
}

// UpdateTenantInput is the validated payload for tenant updates.
type UpdateTenantInput struct {
	Name          *string        `json:"name"           validate:"omitempty,min=2,max=255"`
	Plan          *string        `json:"plan"           validate:"omitempty,oneof=starter growth enterprise"`
	IsActive      *bool          `json:"is_active"`
	Settings      map[string]any `json:"settings"`
	DataRegion    *string        `json:"data_region"`
	PrivateDeploy *bool          `json:"private_deploy"`
}

// TenantResponse is the safe public representation of a tenant (no internal fields).
type TenantResponse struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	Slug          string         `json:"slug"`
	Plan          string         `json:"plan"`
	IsActive      bool           `json:"is_active"`
	Settings      map[string]any `json:"settings"`
	DataRegion    string         `json:"data_region"`
	PrivateDeploy bool           `json:"private_deploy"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

// ToResponse converts a Tenant model to its safe API response representation.
func (t *Tenant) ToResponse() *TenantResponse {
	return &TenantResponse{
		ID:            t.ID,
		Name:          t.Name,
		Slug:          t.Slug,
		Plan:          t.Plan,
		IsActive:      t.IsActive,
		Settings:      t.Settings,
		DataRegion:    t.DataRegion,
		PrivateDeploy: t.PrivateDeploy,
		CreatedAt:     t.CreatedAt,
		UpdatedAt:     t.UpdatedAt,
	}
}
