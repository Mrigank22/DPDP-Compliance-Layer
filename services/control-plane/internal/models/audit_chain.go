// services/control-plane/internal/models/audit_chain.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// AuditChainEntry is one link in a tenant's tamper-evident audit ledger.
// hash = SHA-256(prev_hash | seq | tenant_id | action | actor_id |
//                resource_type | resource_id | changes | created_at).
type AuditChainEntry struct {
	bun.BaseModel `bun:"table:audit_chain,alias:ac"`

	ID           string    `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID     string    `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	Seq          int64     `bun:"seq,notnull"                                json:"seq"`
	Action       string    `bun:"action,notnull"                             json:"action"`
	ActorID      string    `bun:"actor_id,notnull,default:''"                json:"actor_id"`
	ResourceType string    `bun:"resource_type,notnull,default:''"           json:"resource_type"`
	ResourceID   string    `bun:"resource_id,notnull,default:''"             json:"resource_id"`
	Changes      string    `bun:"changes,notnull,default:''"                 json:"changes"`
	PrevHash     string    `bun:"prev_hash,notnull,default:''"               json:"prev_hash"`
	Hash         string    `bun:"hash,notnull"                               json:"hash"`
	CreatedAt    time.Time `bun:"created_at,notnull,default:now()"           json:"created_at"`
}

// AuditChainVerifyResult is the outcome of an integrity verification.
type AuditChainVerifyResult struct {
	Valid       bool   `json:"valid"`
	Entries     int64  `json:"entries"`
	BrokenAtSeq *int64 `json:"broken_at_seq,omitempty"`
	Message     string `json:"message"`
}
