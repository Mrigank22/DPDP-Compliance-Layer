// services/control-plane/internal/models/gateway_rule.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Gateway action constants
const (
	GatewayActionMask     = "mask"
	GatewayActionRedact   = "redact"
	GatewayActionBlock    = "block"
	GatewayActionTokenize = "tokenize"
	GatewayActionAlert    = "alert"
	GatewayActionAllow    = "allow"
)

// GatewayRule defines how the enforcement gateway should handle traffic matching a route.
type GatewayRule struct {
	bun.BaseModel `bun:"table:gateway_rules,alias:gr"`

	ID           string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID     string         `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	PolicyID     *string        `bun:"policy_id,type:uuid"                        json:"policy_id"`
	Name         string         `bun:"name,notnull"                               json:"name"          validate:"required,min=1,max=255"`
	RoutePattern string         `bun:"route_pattern,notnull"                      json:"route_pattern" validate:"required"`
	HTTPMethods  []string       `bun:"http_methods,array,default:'{\"*\"}'"       json:"http_methods"`
	Direction    string         `bun:"direction,notnull,default:both"             json:"direction"     validate:"omitempty,oneof=request response both"`
	Action       string         `bun:"action,notnull"                             json:"action"        validate:"required,oneof=mask redact block tokenize alert allow"`
	PIITypes     []string       `bun:"pii_types,array,default:'{}'"               json:"pii_types"`
	MaskConfig   map[string]any `bun:"mask_config,type:jsonb,default:{}"          json:"mask_config"`
	IsActive     bool           `bun:"is_active,notnull,default:true"             json:"is_active"`
	CreatedAt    time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt    time.Time      `bun:"updated_at,notnull,default:now()"           json:"updated_at"`
}

type CreateGatewayRuleInput struct {
	PolicyID     *string        `json:"policy_id"     validate:"omitempty,uuid"`
	Name         string         `json:"name"          validate:"required,min=1,max=255"`
	RoutePattern string         `json:"route_pattern" validate:"required"`
	HTTPMethods  []string       `json:"http_methods"`
	Direction    string         `json:"direction"     validate:"omitempty,oneof=request response both"`
	Action       string         `json:"action"        validate:"required,oneof=mask redact block tokenize alert allow"`
	PIITypes     []string       `json:"pii_types"`
	MaskConfig   map[string]any `json:"mask_config"`
}

type UpdateGatewayRuleInput struct {
	Name         *string        `json:"name"          validate:"omitempty,min=1,max=255"`
	RoutePattern *string        `json:"route_pattern"`
	HTTPMethods  []string       `json:"http_methods"`
	Direction    *string        `json:"direction"     validate:"omitempty,oneof=request response both"`
	Action       *string        `json:"action"        validate:"omitempty,oneof=mask redact block tokenize alert allow"`
	PIITypes     []string       `json:"pii_types"`
	MaskConfig   map[string]any `json:"mask_config"`
	IsActive     *bool          `json:"is_active"`
}

// ---- GatewayEvent (ClickHouse) ---------------------------------------------

// GatewayEvent is a single proxied-request record written to ClickHouse.
type GatewayEvent struct {
	ID                  string    `json:"id" ch:"id"`
	TenantID            string    `json:"tenant_id" ch:"tenant_id"`
	GatewayRuleID       string    `json:"gateway_rule_id" ch:"gateway_rule_id"`
	Timestamp           time.Time `json:"timestamp" ch:"timestamp"`
	RequestID           string    `json:"request_id" ch:"request_id"`
	SourceIP            string    `json:"source_ip" ch:"source_ip"`
	DestinationURL      string    `json:"destination_url" ch:"destination_url"`
	HTTPMethod          string    `json:"http_method" ch:"http_method"`
	ActionTaken         string    `json:"action_taken" ch:"action_taken"`
	PIITypesDetected    []string  `json:"pii_types_detected" ch:"pii_types_detected"`
	FieldNames          []string  `json:"field_names" ch:"field_names"`
	PayloadSizeBytes    uint32    `json:"payload_size_bytes" ch:"payload_size_bytes"`
	ProcessingLatencyMs uint16    `json:"processing_latency_ms" ch:"processing_latency_ms"`
	WasLLMCall          bool      `json:"was_llm_call" ch:"was_llm_call"`
	LLMProvider         string    `json:"llm_provider" ch:"llm_provider"`
	PolicyID            string    `json:"policy_id" ch:"policy_id"`
}

// ---- DataFlow ---------------------------------------------------------------

type DataFlow struct {
	bun.BaseModel `bun:"table:data_flows,alias:df"`

	ID                string    `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID          string    `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	SourceAssetID     *string   `bun:"source_asset_id,type:uuid"                  json:"source_asset_id"`
	DestinationURL    string    `bun:"destination_url,notnull"                    json:"destination_url"`
	DestinationType   string    `bun:"destination_type,notnull"                   json:"destination_type" validate:"required,oneof=internal_api external_api llm storage email third_party"`
	PIITypesInvolved  []string  `bun:"pii_types_involved,array,default:'{}'"      json:"pii_types_involved"`
	IsApproved        bool      `bun:"is_approved,notnull,default:false"          json:"is_approved"`
	ApprovedBy        *string   `bun:"approved_by,type:uuid"                      json:"approved_by"`
	FirstDetectedAt   time.Time `bun:"first_detected_at,notnull,default:now()"    json:"first_detected_at"`
	LastSeenAt        time.Time `bun:"last_seen_at,notnull,default:now()"         json:"last_seen_at"`
	EventCount        int64     `bun:"event_count,notnull,default:0"              json:"event_count"`
	CreatedAt         time.Time `bun:"created_at,notnull,default:now()"           json:"created_at"`
}

// ---- ConsentRecord ----------------------------------------------------------

type ConsentRecord struct {
	bun.BaseModel `bun:"table:consent_records,alias:cr"`

	ID                  string     `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID            string     `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	DataPrincipalID     string     `bun:"data_principal_id,notnull"                  json:"data_principal_id" validate:"required"`
	Purpose             string     `bun:"purpose,notnull"                            json:"purpose"           validate:"required,min=1,max=500"`
	ConsentGiven        bool       `bun:"consent_given,notnull"                      json:"consent_given"`
	ConsentTimestamp    *time.Time `bun:"consent_timestamp"                          json:"consent_timestamp"`
	WithdrawalTimestamp *time.Time `bun:"withdrawal_timestamp"                       json:"withdrawal_timestamp"`
	NoticeVersion       *string    `bun:"notice_version"                             json:"notice_version"`
	IPAddress           *string    `bun:"ip_address"                                 json:"ip_address"`
	ConsentMechanism    string     `bun:"consent_mechanism,notnull,default:form"     json:"consent_mechanism" validate:"omitempty,oneof=form api sdk import"`
	Metadata            map[string]any `bun:"metadata,type:jsonb,default:{}"         json:"metadata"`
	CreatedAt           time.Time  `bun:"created_at,notnull,default:now()"           json:"created_at"`
}

// ---- RefreshToken -----------------------------------------------------------

type RefreshToken struct {
	bun.BaseModel `bun:"table:refresh_tokens,alias:rt"`

	ID        string     `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	UserID    string     `bun:"user_id,notnull,type:uuid"                  json:"-"`
	TenantID  string     `bun:"tenant_id,notnull,type:uuid"                json:"-"`
	TokenHash string     `bun:"token_hash,notnull,unique"                  json:"-"`
	Family    string     `bun:"family,notnull,type:uuid"                   json:"-"` // detect reuse attacks
	ExpiresAt time.Time  `bun:"expires_at,notnull"                         json:"-"`
	Revoked   bool       `bun:"revoked,notnull,default:false"              json:"-"`
	RevokedAt *time.Time `bun:"revoked_at"                                 json:"-"`
	CreatedAt time.Time  `bun:"created_at,notnull,default:now()"           json:"-"`
}

// IsValid returns true if the token is not revoked and not expired.
func (rt *RefreshToken) IsValid() bool {
	return !rt.Revoked && time.Now().Before(rt.ExpiresAt)
}
