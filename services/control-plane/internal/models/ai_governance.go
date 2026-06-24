// services/control-plane/internal/models/ai_governance.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// AI system lifecycle stages.
const (
	AISystemStageDiscovered  = "discovered"
	AISystemStageProposed    = "proposed"
	AISystemStageUnderReview = "under_review"
	AISystemStageApproved    = "approved"
	AISystemStageRetired     = "retired"
)

// EU AI Act risk tiers (populated by later assessment pillars).
const (
	AIRiskTierUnassessed = "unassessed"
	AIRiskTierMinimal    = "minimal"
	AIRiskTierLimited    = "limited"
	AIRiskTierHigh       = "high"
	AIRiskTierProhibited = "prohibited"
)

// AI model catalog source.
const (	AIModelSourceObserved   = "observed"
	AIModelSourceRegistered = "registered"
)

// AISystem is a registered AI use-case / application under governance.
type AISystem struct {
	bun.BaseModel `bun:"table:ai_systems,alias:ais"`

	ID             string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID       string         `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	Name           string         `bun:"name,notnull"                               json:"name"            validate:"required,min=1,max=255"`
	Description    string         `bun:"description,notnull,default:''"             json:"description"`
	Owner          string         `bun:"owner,notnull,default:''"                   json:"owner"`
	LifecycleStage string         `bun:"lifecycle_stage,notnull,default:'discovered'" json:"lifecycle_stage" validate:"omitempty,oneof=discovered proposed under_review approved retired"`
	RiskTier       string         `bun:"risk_tier,notnull,default:'unassessed'"     json:"risk_tier"       validate:"omitempty,oneof=unassessed minimal limited high prohibited"`
	Providers      []string       `bun:"providers,array,default:'{}'"               json:"providers"`
	Endpoints      []string       `bun:"endpoints,array,default:'{}'"               json:"endpoints"`
	Status         string         `bun:"status,notnull,default:'active'"            json:"status"          validate:"omitempty,oneof=active archived"`
	Tags           map[string]any `bun:"tags,type:jsonb,default:{}"                 json:"tags"`
	ApprovedBy     *string        `bun:"approved_by,type:uuid"                      json:"approved_by"`
	ApprovedAt     *time.Time     `bun:"approved_at"                                json:"approved_at"`
	LastReviewedAt *time.Time     `bun:"last_reviewed_at"                           json:"last_reviewed_at"`
	ReviewDueAt    *time.Time     `bun:"review_due_at"                              json:"review_due_at"`
	CreatedBy      *string        `bun:"created_by,type:uuid"                       json:"created_by"`
	CreatedAt      time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt      time.Time      `bun:"updated_at,notnull,default:now()"           json:"updated_at"`

	// Relations
	Models []*AIModel `bun:"rel:has-many,join:id=ai_system_id" json:"models,omitempty"`
}

// AIModel is a provider+model entry an AI system uses — registered in the
// catalog, or observed from gateway traffic.
type AIModel struct {
	bun.BaseModel `bun:"table:ai_models,alias:aim"`

	ID           string     `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID     string     `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	AISystemID   *string    `bun:"ai_system_id,type:uuid"                     json:"ai_system_id"`
	Provider     string     `bun:"provider,notnull"                           json:"provider"      validate:"required"`
	Model        string     `bun:"model,notnull"                              json:"model"         validate:"required"`
	DisplayName  string     `bun:"display_name,notnull,default:''"            json:"display_name"`
	Source       string     `bun:"source,notnull,default:'registered'"        json:"source"        validate:"omitempty,oneof=observed registered"`
	FirstSeenAt  *time.Time `bun:"first_seen_at"                              json:"first_seen_at"`
	LastSeenAt   *time.Time `bun:"last_seen_at"                               json:"last_seen_at"`
	CallCount    int64      `bun:"call_count,notnull,default:0"               json:"call_count"`
	PIICallCount int64      `bun:"pii_call_count,notnull,default:0"           json:"pii_call_count"`
	CreatedAt    time.Time  `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt    time.Time  `bun:"updated_at,notnull,default:now()"           json:"updated_at"`
}

// ---- Inputs -----------------------------------------------------------------

type CreateAISystemInput struct {
	Name           string         `json:"name"            validate:"required,min=1,max=255"`
	Description    string         `json:"description"     validate:"omitempty,max=2000"`
	Owner          string         `json:"owner"           validate:"omitempty,max=255"`
	LifecycleStage string         `json:"lifecycle_stage" validate:"omitempty,oneof=discovered proposed under_review approved retired"`
	RiskTier       string         `json:"risk_tier"       validate:"omitempty,oneof=unassessed minimal limited high prohibited"`
	Providers      []string       `json:"providers"`
	Endpoints      []string       `json:"endpoints"`
	Tags           map[string]any `json:"tags"`
}

type UpdateAISystemInput struct {
	Name           *string        `json:"name"            validate:"omitempty,min=1,max=255"`
	Description    *string        `json:"description"     validate:"omitempty,max=2000"`
	Owner          *string        `json:"owner"           validate:"omitempty,max=255"`
	LifecycleStage *string        `json:"lifecycle_stage" validate:"omitempty,oneof=discovered proposed under_review approved retired"`
	RiskTier       *string        `json:"risk_tier"       validate:"omitempty,oneof=unassessed minimal limited high prohibited"`
	Status         *string        `json:"status"          validate:"omitempty,oneof=active archived"`
	Providers      []string       `json:"providers"`
	Endpoints      []string       `json:"endpoints"`
	Tags           map[string]any `json:"tags"`
}

// PromoteAIInput registers a discovered (provider, model) as a governed AI
// system, creating the system and linking the model into the catalog.
type PromoteAIInput struct {
	Provider    string `json:"provider"    validate:"required"`
	Model       string `json:"model"       validate:"required"`
	Name        string `json:"name"        validate:"required,min=1,max=255"`
	Description string `json:"description" validate:"omitempty,max=2000"`
	Owner       string `json:"owner"       validate:"omitempty,max=255"`
	Endpoint    string `json:"endpoint"    validate:"omitempty,max=500"`
}

// ---- Discovery (computed from ClickHouse gateway_events) --------------------

// AIDiscoveryRow is one observed (provider, model, app) usage aggregate.
type AIDiscoveryRow struct {
	Provider       string    `json:"provider"`
	Model          string    `json:"model"`
	App            string    `json:"app"`
	DestinationURL string    `json:"destination_url"`
	CallCount      int64     `json:"call_count"`
	PIICallCount   int64     `json:"pii_call_count"`
	PIITypes       []string  `json:"pii_types"`
	SourceCount    int64     `json:"source_count"`
	FirstSeen      time.Time `json:"first_seen"`
	LastSeen       time.Time `json:"last_seen"`
	Registered     bool      `json:"registered"` // false = shadow AI
	AISystemID     *string   `json:"ai_system_id,omitempty"`
}

// AIDiscoveryResponse is the shadow-AI discovery view.
type AIDiscoveryResponse struct {
	Rows             []*AIDiscoveryRow `json:"rows"`
	TotalModels      int               `json:"total_models"`
	RegisteredModels int               `json:"registered_models"`
	ShadowModels     int               `json:"shadow_models"`
	ProviderCount    int               `json:"provider_count"`
	PeriodHours      int               `json:"period_hours"`
}

// ---- Usage & cost (computed from ClickHouse gateway_events) -----------------

// AIUsageGroupRow is the raw per-(provider, model, app) usage aggregate read
// from ClickHouse before cost is applied.
type AIUsageGroupRow struct {
	Provider         string
	Model            string
	App              string
	Calls            int64
	PromptTokens     int64
	CompletionTokens int64
	TotalTokens      int64
}

// AIUsageModelRow is per-model token usage and estimated cost.
type AIUsageModelRow struct {
	Provider         string  `json:"provider"`
	Model            string  `json:"model"`
	Calls            int64   `json:"calls"`
	PromptTokens     int64   `json:"prompt_tokens"`
	CompletionTokens int64   `json:"completion_tokens"`
	TotalTokens      int64   `json:"total_tokens"`
	EstimatedCostUSD float64 `json:"estimated_cost_usd"`
	Priced           bool    `json:"priced"`
}

// AIUsageAppRow is per-application token usage and estimated cost.
type AIUsageAppRow struct {
	App              string  `json:"app"`
	Calls            int64   `json:"calls"`
	TotalTokens      int64   `json:"total_tokens"`
	EstimatedCostUSD float64 `json:"estimated_cost_usd"`
}

// AIUsageTimeBin is one daily usage bucket.
type AIUsageTimeBin struct {
	Date        string `json:"date"`
	Calls       int64  `json:"calls"`
	TotalTokens int64  `json:"total_tokens"`
}

// AIUsageResponse is the AI usage & cost dashboard payload.
type AIUsageResponse struct {
	TotalCalls       int64              `json:"total_calls"`
	PromptTokens     int64              `json:"prompt_tokens"`
	CompletionTokens int64              `json:"completion_tokens"`
	TotalTokens      int64              `json:"total_tokens"`
	EstimatedCostUSD float64            `json:"estimated_cost_usd"`
	ModelCount       int                `json:"model_count"`
	ByModel          []*AIUsageModelRow `json:"by_model"`
	ByApp            []*AIUsageAppRow   `json:"by_app"`
	Timeline         []AIUsageTimeBin   `json:"timeline"`
	PeriodHours      int                `json:"period_hours"`
}

// ---- Risk assessments (Pillar 3) -------------------------------------------

// Framework identifiers.
const (
	FrameworkNISTAIRMF = "nist_ai_rmf"
	FrameworkEUAIAct   = "eu_ai_act"
	FrameworkISO42001  = "iso_42001"
	FrameworkDPDP      = "dpdp"
)

// Assessment lifecycle status.
const (
	AssessmentStatusDraft      = "draft"
	AssessmentStatusInProgress = "in_progress"
	AssessmentStatusCompleted  = "completed"
)

// Per-control response status.
const (
	ControlStatusMet           = "met"
	ControlStatusPartial       = "partial"
	ControlStatusNotMet        = "not_met"
	ControlStatusNotApplicable = "not_applicable"
	ControlStatusUnanswered    = "unanswered"
)

// FrameworkControl is one reference control in a governance framework.
type FrameworkControl struct {
	ID          string `json:"id"`
	Ref         string `json:"ref"`
	Title       string `json:"title"`
	Category    string `json:"category"`
	Description string `json:"description"`
}

// Framework is a governance/compliance framework and its controls.
type Framework struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Controls    []FrameworkControl `json:"controls"`
}

// AssessmentControlResponse is a single control answer within an assessment.
type AssessmentControlResponse struct {
	ControlID string `json:"control_id"`
	Status    string `json:"status"`
	Note      string `json:"note"`
}

// AIAssessment is a framework assessment of one AI system.
type AIAssessment struct {
	bun.BaseModel `bun:"table:ai_assessments,alias:aia"`

	ID          string                      `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID    string                      `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	AISystemID  string                      `bun:"ai_system_id,notnull,type:uuid"             json:"ai_system_id"`
	Framework   string                      `bun:"framework,notnull"                          json:"framework"`
	Status      string                      `bun:"status,notnull,default:'in_progress'"       json:"status"`
	Responses   []AssessmentControlResponse `bun:"responses,type:jsonb,default:'[]'"          json:"responses"`
	Score       int                         `bun:"score,notnull,default:0"                    json:"score"`
	AssessedBy  *string                     `bun:"assessed_by,type:uuid"                      json:"assessed_by"`
	CompletedAt *time.Time                  `bun:"completed_at"                               json:"completed_at"`
	CreatedAt   time.Time                   `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt   time.Time                   `bun:"updated_at,notnull,default:now()"           json:"updated_at"`
}

// UpsertAssessmentInput is the request body for saving a framework assessment.
type UpsertAssessmentInput struct {
	Status    string                      `json:"status"    validate:"omitempty,oneof=draft in_progress completed"`
	Responses []AssessmentControlResponse `json:"responses"`
}

// RiskRegisterRow is one AI system's risk posture across its assessments.
type RiskRegisterRow struct {
	AISystemID         string `json:"ai_system_id"`
	Name               string `json:"name"`
	Owner              string `json:"owner"`
	LifecycleStage     string `json:"lifecycle_stage"`
	RiskTier           string `json:"risk_tier"`
	InherentRisk       int    `json:"inherent_risk"`
	Readiness          int    `json:"readiness"`
	ResidualRisk       int    `json:"residual_risk"`
	FrameworksAssessed int    `json:"frameworks_assessed"`
	Gaps               int    `json:"gaps"`
}

// RiskRegisterResponse is the AI risk register payload.
type RiskRegisterResponse struct {
	Rows            []*RiskRegisterRow `json:"rows"`
	TotalSystems    int                `json:"total_systems"`
	AssessedSystems int                `json:"assessed_systems"`
	HighRisk        int                `json:"high_risk"`
	AvgResidual     int                `json:"avg_residual"`
}

// ---- Lifecycle & oversight (Pillar 5) --------------------------------------

// Lifecycle transition actions.
const (
	AIActionSubmitReview = "submit_review"
	AIActionApprove      = "approve"
	AIActionMarkReviewed = "mark_reviewed"
	AIActionRetire       = "retire"
	AIActionReopen       = "reopen"
)

// AIAttestation is an immutable record of a lifecycle transition / human sign-off.
type AIAttestation struct {
	bun.BaseModel `bun:"table:ai_attestations,alias:aiat"`

	ID         string    `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID   string    `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	AISystemID string    `bun:"ai_system_id,notnull,type:uuid"             json:"ai_system_id"`
	Action     string    `bun:"action,notnull"                             json:"action"`
	FromStage  string    `bun:"from_stage,notnull,default:''"              json:"from_stage"`
	ToStage    string    `bun:"to_stage,notnull,default:''"                json:"to_stage"`
	Statement  string    `bun:"statement,notnull,default:''"               json:"statement"`
	ActorID    *string   `bun:"actor_id,type:uuid"                         json:"actor_id"`
	CreatedAt  time.Time `bun:"created_at,notnull,default:now()"           json:"created_at"`

	// Relations
	Actor *User `bun:"rel:belongs-to,join:actor_id=id" json:"actor,omitempty"`
}

// TransitionInput is the request body for a lifecycle transition.
type TransitionInput struct {
	Action    string `json:"action"    validate:"required,oneof=submit_review approve mark_reviewed retire reopen"`
	Statement string `json:"statement" validate:"omitempty,max=2000"`
}
