// services/control-plane/internal/models/breach.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Breach incident lifecycle.
const (
	BreachStatusOpen      = "open"      // recorded, initial triage
	BreachStatusAssessing = "assessing" // scope under assessment
	BreachStatusContained = "contained" // breach stopped / mitigated
	BreachStatusNotified  = "notified"  // Board + affected principals intimated
	BreachStatusClosed    = "closed"    // resolved and documented
)

const (
	BreachSeverityLow      = "low"
	BreachSeverityMedium   = "medium"
	BreachSeverityHigh     = "high"
	BreachSeverityCritical = "critical"
)

// BreachBoardDeadlineHours is the window for the detailed intimation to the Data
// Protection Board after the Data Fiduciary becomes aware of the breach
// (DPDP draft Rules: within 72 hours).
const BreachBoardDeadlineHours = 72

// BreachIncident is a recorded personal data breach (DPDP Act 2023 §8(6)).
type BreachIncident struct {
	bun.BaseModel `bun:"table:breach_incidents,alias:bi"`

	ID                      string     `bun:"id,pk,type:uuid,default:uuid_generate_v4()"          json:"id"`
	TenantID                string     `bun:"tenant_id,notnull,type:uuid"                         json:"tenant_id"`
	Reference               string     `bun:"reference,notnull"                                   json:"reference"`
	Title                   string     `bun:"title,notnull"                                       json:"title"`
	Description             string     `bun:"description,notnull,default:''"                      json:"description"`
	Status                  string     `bun:"status,notnull,default:'open'"                       json:"status"`
	Severity                string     `bun:"severity,notnull,default:'medium'"                   json:"severity"`
	Categories              []string   `bun:"categories,array,notnull,default:'{}'"               json:"categories"`
	AffectedDataTypes       []string   `bun:"affected_data_types,array,notnull,default:'{}'"      json:"affected_data_types"`
	AffectedPrincipals      int        `bun:"affected_principals,notnull,default:0"               json:"affected_principals"`
	AffectedAssetIDs        []string   `bun:"affected_asset_ids,array,notnull,default:'{}'"       json:"affected_asset_ids"`
	DiscoveredAt            time.Time  `bun:"discovered_at,notnull,default:now()"                 json:"discovered_at"`
	OccurredAt              *time.Time `bun:"occurred_at"                                         json:"occurred_at"`
	RootCause               string     `bun:"root_cause,notnull,default:''"                       json:"root_cause"`
	Consequences            string     `bun:"consequences,notnull,default:''"                     json:"consequences"`
	MitigationMeasures      string     `bun:"mitigation_measures,notnull,default:''"              json:"mitigation_measures"`
	RemedialMeasures        string     `bun:"remedial_measures,notnull,default:''"                json:"remedial_measures"`
	BoardNotifiedAt         *time.Time `bun:"board_notified_at"                                   json:"board_notified_at"`
	BoardReference          string     `bun:"board_reference,notnull,default:''"                  json:"board_reference"`
	PrincipalsNotifiedAt    *time.Time `bun:"principals_notified_at"                              json:"principals_notified_at"`
	PrincipalsNotifiedCount int        `bun:"principals_notified_count,notnull,default:0"         json:"principals_notified_count"`
	ReportedBy              *string    `bun:"reported_by,type:uuid"                               json:"reported_by"`
	AssignedTo              *string    `bun:"assigned_to,type:uuid"                               json:"assigned_to"`
	CreatedAt               time.Time  `bun:"created_at,notnull,default:now()"                    json:"created_at"`
	UpdatedAt               time.Time  `bun:"updated_at,notnull,default:now()"                    json:"updated_at"`

	// Relations
	Assignee *BreachActor           `bun:"rel:belongs-to,join:assigned_to=id" json:"assignee,omitempty"`
	Reporter *BreachActor           `bun:"rel:belongs-to,join:reported_by=id" json:"reporter,omitempty"`
	Timeline []*BreachTimelineEntry `bun:"rel:has-many,join:id=incident_id"   json:"timeline,omitempty"`
}

// BreachActor is the minimal user shape joined onto incidents/timeline.
// (A view of users; never exposes secrets.)
type BreachActor struct {
	bun.BaseModel `bun:"table:users,alias:bu"`

	ID       string `bun:"id,pk" json:"id"`
	FullName string `bun:"full_name" json:"full_name"`
	Email    string `bun:"email" json:"email"`
}

// BoardDeadline is the 72h-from-awareness deadline for the Board intimation.
func (b *BreachIncident) BoardDeadline() time.Time {
	return b.DiscoveredAt.Add(BreachBoardDeadlineHours * time.Hour)
}

// BoardOverdue reports whether the Board intimation is past its deadline.
func (b *BreachIncident) BoardOverdue() bool {
	return b.BoardNotifiedAt == nil && b.Status != BreachStatusClosed && time.Now().After(b.BoardDeadline())
}

// PrincipalsPending reports whether affected principals still need intimation.
func (b *BreachIncident) PrincipalsPending() bool {
	return b.PrincipalsNotifiedAt == nil && b.Status != BreachStatusClosed
}

// BreachIncidentResponse augments the incident with computed deadline fields.
type BreachIncidentResponse struct {
	*BreachIncident
	BoardDeadline     time.Time `json:"board_deadline"`
	BoardOverdue      bool      `json:"board_overdue"`
	PrincipalsPending bool      `json:"principals_pending"`
}

// ToResponse builds the API representation with computed fields.
func (b *BreachIncident) ToResponse() *BreachIncidentResponse {
	return &BreachIncidentResponse{
		BreachIncident:    b,
		BoardDeadline:     b.BoardDeadline(),
		BoardOverdue:      b.BoardOverdue(),
		PrincipalsPending: b.PrincipalsPending(),
	}
}

// BreachTimelineEntry is one immutable action in an incident's timeline.
type BreachTimelineEntry struct {
	bun.BaseModel `bun:"table:breach_timeline_entries,alias:bte"`

	ID         string    `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID   string    `bun:"tenant_id,notnull,type:uuid"                json:"-"`
	IncidentID string    `bun:"incident_id,notnull,type:uuid"              json:"incident_id"`
	EntryType  string    `bun:"entry_type,notnull,default:'note'"          json:"entry_type"`
	Note       string    `bun:"note,notnull,default:''"                    json:"note"`
	ActorID    *string   `bun:"actor_id,type:uuid"                         json:"actor_id"`
	CreatedAt  time.Time `bun:"created_at,notnull,default:now()"           json:"created_at"`

	Actor *BreachActor `bun:"rel:belongs-to,join:actor_id=id" json:"actor,omitempty"`
}

// BreachStats summarises a tenant's breach posture.
type BreachStats struct {
	Total              int `bun:"total"               json:"total"`
	Open               int `bun:"open"                json:"open"`
	CriticalOpen       int `bun:"critical_open"       json:"critical_open"`
	BoardOverdue       int `bun:"board_overdue"       json:"board_overdue"`
	AwaitingPrincipals int `bun:"awaiting_principals" json:"awaiting_principals"`
	Closed             int `bun:"closed"              json:"closed"`
}

// ---- Request DTOs -----------------------------------------------------------

type CreateBreachInput struct {
	Title              string     `json:"title"                validate:"required,min=3,max=255"`
	Description        string     `json:"description"          validate:"omitempty,max=5000"`
	Severity           string     `json:"severity"             validate:"omitempty,oneof=low medium high critical"`
	Categories         []string   `json:"categories"           validate:"omitempty,dive,oneof=confidentiality integrity availability"`
	AffectedDataTypes  []string   `json:"affected_data_types"  validate:"omitempty,dive,max=100"`
	AffectedPrincipals int        `json:"affected_principals"  validate:"omitempty,min=0"`
	AffectedAssetIDs   []string   `json:"affected_asset_ids"   validate:"omitempty,dive,uuid"`
	DiscoveredAt       *time.Time `json:"discovered_at"`
	OccurredAt         *time.Time `json:"occurred_at"`
}

type UpdateBreachInput struct {
	Title              *string    `json:"title"                validate:"omitempty,min=3,max=255"`
	Description        *string    `json:"description"          validate:"omitempty,max=5000"`
	Status             *string    `json:"status"               validate:"omitempty,oneof=open assessing contained notified closed"`
	Severity           *string    `json:"severity"             validate:"omitempty,oneof=low medium high critical"`
	Categories         []string   `json:"categories"           validate:"omitempty,dive,oneof=confidentiality integrity availability"`
	AffectedDataTypes  []string   `json:"affected_data_types"  validate:"omitempty,dive,max=100"`
	AffectedPrincipals *int       `json:"affected_principals"  validate:"omitempty,min=0"`
	AffectedAssetIDs   []string   `json:"affected_asset_ids"   validate:"omitempty,dive,uuid"`
	OccurredAt         *time.Time `json:"occurred_at"`
	RootCause          *string    `json:"root_cause"           validate:"omitempty,max=5000"`
	Consequences       *string    `json:"consequences"         validate:"omitempty,max=5000"`
	MitigationMeasures *string    `json:"mitigation_measures"  validate:"omitempty,max=5000"`
	RemedialMeasures   *string    `json:"remedial_measures"    validate:"omitempty,max=5000"`
	AssignedTo         *string    `json:"assigned_to"          validate:"omitempty,uuid"`
}

type NotifyBoardInput struct {
	Reference string `json:"reference" validate:"omitempty,max=255"`
	Note      string `json:"note"      validate:"omitempty,max=2000"`
}

type NotifyPrincipalsInput struct {
	Count int    `json:"count" validate:"omitempty,min=0"`
	Note  string `json:"note"  validate:"omitempty,max=2000"`
}

type AddBreachTimelineInput struct {
	Note string `json:"note" validate:"required,min=1,max=2000"`
}

type CloseBreachInput struct {
	Note string `json:"note" validate:"omitempty,max=2000"`
}

// BreachListFilter is the query filter for listing incidents.
type BreachListFilter struct {
	Status   string
	Severity string
	Overdue  bool
	Page     int
	PageSize int
}
