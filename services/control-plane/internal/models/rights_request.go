// services/control-plane/internal/models/rights_request.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Rights request type constants (DPDP Act 2023 Chapter III)
const (
	RightsTypeAccess      = "access"
	RightsTypeCorrection  = "correction"
	RightsTypeErasure     = "erasure"
	RightsTypePortability = "portability"
	RightsTypeNomination  = "nomination"
)

// Rights request status constants
const (
	RightsStatusReceived   = "received"
	RightsStatusInProgress = "in_progress"
	RightsStatusCompleted  = "completed"
	RightsStatusRejected   = "rejected"
)

// dpdpDueDays is the statutory deadline under the DPDP Act 2023.
const dpdpDueDays = 90

// RightsRequest represents a Data Subject Request (DSR) filed under the DPDP Act.
type RightsRequest struct {
	bun.BaseModel `bun:"table:rights_requests,alias:rr"`

	ID                  string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID            string         `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	RequestType         string         `bun:"request_type,notnull"                       json:"request_type"           validate:"required,oneof=access correction erasure portability nomination"`
	DataPrincipalEmail  string         `bun:"data_principal_email,notnull"               json:"data_principal_email"   validate:"required,email"`
	DataPrincipalName   *string        `bun:"data_principal_name"                        json:"data_principal_name"`
	Status              string         `bun:"status,notnull,default:received"            json:"status"                 validate:"omitempty,oneof=received in_progress completed rejected"`
	DueDate             time.Time      `bun:"due_date,notnull"                           json:"due_date"`
	AssignedTo          *string        `bun:"assigned_to,type:uuid"                      json:"assigned_to"`
	Notes               *string        `bun:"notes"                                      json:"notes"`
	ResponseData        map[string]any `bun:"response_data,type:jsonb"                   json:"response_data"`
	RejectionReason     *string        `bun:"rejection_reason"                           json:"rejection_reason"`
	CreatedAt           time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt           time.Time      `bun:"updated_at,notnull,default:now()"           json:"updated_at"`

	// Relations
	Assignee *User `bun:"rel:belongs-to,join:assigned_to=id" json:"assignee,omitempty"`
}

// IsOverdue returns true if the request has not been completed within the statutory deadline.
func (r *RightsRequest) IsOverdue() bool {
	if r.Status == RightsStatusCompleted || r.Status == RightsStatusRejected {
		return false
	}
	return time.Now().After(r.DueDate)
}

// DaysRemaining returns how many calendar days remain before the due date.
// A negative value means the request is overdue.
func (r *RightsRequest) DaysRemaining() int {
	return int(time.Until(r.DueDate).Hours() / 24)
}

// ---- DTOs -------------------------------------------------------------------

type CreateRightsRequestInput struct {
	RequestType        string  `json:"request_type"         validate:"required,oneof=access correction erasure portability nomination"`
	DataPrincipalEmail string  `json:"data_principal_email" validate:"required,email"`
	DataPrincipalName  *string `json:"data_principal_name"`
	Notes              *string `json:"notes"                validate:"omitempty,max=5000"`
}

type UpdateRightsRequestInput struct {
	Status          *string        `json:"status"           validate:"omitempty,oneof=received in_progress completed rejected"`
	AssignedTo      *string        `json:"assigned_to"      validate:"omitempty,uuid"`
	Notes           *string        `json:"notes"            validate:"omitempty,max=5000"`
	ResponseData    map[string]any `json:"response_data"`
	RejectionReason *string        `json:"rejection_reason" validate:"omitempty,max=2000"`
}

type RightsRequestListFilter struct {
	RequestType string `query:"request_type" validate:"omitempty,oneof=access correction erasure portability nomination"`
	Status      string `query:"status"       validate:"omitempty,oneof=received in_progress completed rejected"`
	Overdue     *bool  `query:"overdue"`
	Page        int    `query:"page"         validate:"omitempty,min=1"`
	PageSize    int    `query:"page_size"    validate:"omitempty,min=1,max=100"`
}
