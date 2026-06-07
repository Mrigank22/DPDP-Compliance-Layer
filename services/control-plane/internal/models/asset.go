// services/control-plane/internal/models/asset.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Asset type constants
const (
	AssetTypeS3Bucket    = "s3_bucket"
	AssetTypeRDSInstance = "rds_instance"
	AssetTypeGCSBucket   = "gcs_bucket"
	AssetTypeAzureBlob   = "azure_blob"
	AssetTypePostgreSQL  = "postgresql"
	AssetTypeAPIEndpoint = "api_endpoint"
	AssetTypeLLMEndpoint = "llm_endpoint"
)

// Provider constants
const (
	ProviderAWS    = "aws"
	ProviderGCP    = "gcp"
	ProviderAzure  = "azure"
	ProviderOnPrem = "onprem"
)

// Asset status constants
const (
	AssetStatusConnected    = "connected"
	AssetStatusDisconnected = "disconnected"
	AssetStatusScanning     = "scanning"
	AssetStatusError        = "error"
)

// Asset represents a connected data source under governance.
type Asset struct {
	bun.BaseModel `bun:"table:assets,alias:a"`

	ID               string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID         string         `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	Name             string         `bun:"name,notnull"                               json:"name"             validate:"required,min=1,max=255"`
	AssetType        string         `bun:"asset_type,notnull"                         json:"asset_type"       validate:"required,oneof=s3_bucket rds_instance gcs_bucket azure_blob postgresql api_endpoint llm_endpoint"`
	Provider         string         `bun:"provider,notnull"                           json:"provider"         validate:"required,oneof=aws gcp azure onprem"`
	Region           *string        `bun:"region"                                     json:"region"`
	ConnectionConfig map[string]any `bun:"connection_config,type:jsonb"               json:"-"`               // encrypted at app layer; never returned raw
	CredentialsRef   *string        `bun:"credentials_ref"                            json:"credentials_ref"` // secrets manager path
	Status           string         `bun:"status,notnull,default:connected"           json:"status"           validate:"omitempty,oneof=connected disconnected scanning error"`
	LastScannedAt    *time.Time     `bun:"last_scanned_at"                            json:"last_scanned_at"`
	PIIRecordCount   int64          `bun:"pii_record_count,notnull,default:0"         json:"pii_record_count"`
	RiskScore        int            `bun:"risk_score,notnull,default:0"               json:"risk_score"`
	Tags             map[string]any `bun:"tags,type:jsonb,default:{}"                 json:"tags"`
	CreatedAt        time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt        time.Time      `bun:"updated_at,notnull,default:now()"           json:"updated_at"`

	// Relations
	Tenant   *Tenant    `bun:"rel:belongs-to,join:tenant_id=id" json:"tenant,omitempty"`
	Scans    []*Scan    `bun:"rel:has-many,join:id=asset_id"    json:"scans,omitempty"`
	Findings []*Finding `bun:"rel:has-many,join:id=asset_id"    json:"findings,omitempty"`
}

// ---- DTOs -------------------------------------------------------------------

type CreateAssetInput struct {
	Name             string         `json:"name"              validate:"required,min=1,max=255"`
	AssetType        string         `json:"asset_type"        validate:"required,oneof=s3_bucket rds_instance gcs_bucket azure_blob postgresql api_endpoint llm_endpoint"`
	Provider         string         `json:"provider"          validate:"required,oneof=aws gcp azure onprem"`
	Region           *string        `json:"region"`
	ConnectionConfig map[string]any `json:"connection_config" validate:"required"`
	CredentialsRef   *string        `json:"credentials_ref"`
	Tags             map[string]any `json:"tags"`
}

type UpdateAssetInput struct {
	Name             *string        `json:"name"              validate:"omitempty,min=1,max=255"`
	ConnectionConfig map[string]any `json:"connection_config"`
	CredentialsRef   *string        `json:"credentials_ref"`
	Status           *string        `json:"status"            validate:"omitempty,oneof=connected disconnected error"`
	Tags             map[string]any `json:"tags"`
}

// AssetResponse is the safe public representation; connection_config is omitted.
type AssetResponse struct {
	ID             string         `json:"id"`
	TenantID       string         `json:"tenant_id"`
	Name           string         `json:"name"`
	AssetType      string         `json:"asset_type"`
	Provider       string         `json:"provider"`
	Region         *string        `json:"region"`
	CredentialsRef *string        `json:"credentials_ref"`
	Status         string         `json:"status"`
	LastScannedAt  *time.Time     `json:"last_scanned_at"`
	PIIRecordCount int64          `json:"pii_record_count"`
	RiskScore      int            `json:"risk_score"`
	Tags           map[string]any `json:"tags"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

func (a *Asset) ToResponse() *AssetResponse {
	return &AssetResponse{
		ID:             a.ID,
		TenantID:       a.TenantID,
		Name:           a.Name,
		AssetType:      a.AssetType,
		Provider:       a.Provider,
		Region:         a.Region,
		CredentialsRef: a.CredentialsRef,
		Status:         a.Status,
		LastScannedAt:  a.LastScannedAt,
		PIIRecordCount: a.PIIRecordCount,
		RiskScore:      a.RiskScore,
		Tags:           a.Tags,
		CreatedAt:      a.CreatedAt,
		UpdatedAt:      a.UpdatedAt,
	}
}

// AssetListFilter is the query filter for listing assets.
type AssetListFilter struct {
	AssetType string `query:"asset_type"`
	Provider  string `query:"provider"`
	Status    string `query:"status"     validate:"omitempty,oneof=connected disconnected scanning error"`
	Search    string `query:"search"`
	Page      int    `query:"page"       validate:"omitempty,min=1"`
	PageSize  int    `query:"page_size"  validate:"omitempty,min=1,max=100"`
}
