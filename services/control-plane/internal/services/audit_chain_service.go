// services/control-plane/internal/services/audit_chain_service.go
//
// Tamper-evident audit ledger. Every audit event is appended as a link in a
// per-tenant hash chain: hash = SHA-256(prev_hash | fields). Appends are
// serialized per tenant with a Postgres advisory lock so sequence numbers and
// the chain never race. Verify() re-computes the chain and reports the first
// break, making any past-record tampering detectable.

package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"hash/fnv"
	"strconv"
	"strings"
	"time"

	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/models"
)

// AuditChainService maintains the tamper-evident audit ledger.
type AuditChainService struct {
	pg  *bun.DB
	log *zap.Logger
}

func NewAuditChainService(pg *bun.DB, log *zap.Logger) *AuditChainService {
	return &AuditChainService{pg: pg, log: log}
}

// AppendAudit implements db.AuditChainAppender. It links one audit event into
// the tenant's chain. It is best-effort from the caller's perspective: errors
// are returned for logging but the audit/ClickHouse path continues regardless.
func (s *AuditChainService) AppendAudit(ctx context.Context, e *models.AuditLog) error {
	if e == nil || e.TenantID == "" {
		return nil
	}
	return s.pg.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		// Serialize appends for this tenant.
		if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(?)", lockKey(e.TenantID)); err != nil {
			return err
		}

		prev := &models.AuditChainEntry{}
		err := tx.NewSelect().Model(prev).
			Where("tenant_id = ?", e.TenantID).
			Order("seq DESC").Limit(1).Scan(ctx)
		seq := int64(1)
		prevHash := ""
		if err == nil {
			seq = prev.Seq + 1
			prevHash = prev.Hash
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		entry := &models.AuditChainEntry{
			TenantID:     e.TenantID,
			Seq:          seq,
			Action:       e.Action,
			ActorID:      e.UserID,
			ResourceType: e.ResourceType,
			ResourceID:   e.ResourceID,
			Changes:      e.Changes,
			PrevHash:     prevHash,
			CreatedAt:    time.Now().UTC().Truncate(time.Microsecond),
		}
		entry.Hash = chainHash(entry)
		_, err = tx.NewInsert().Model(entry).Exec(ctx)
		return err
	})
}

// Verify re-computes a tenant's chain and reports the first broken link (if any).
func (s *AuditChainService) Verify(ctx context.Context, tenantID string) (*models.AuditChainVerifyResult, error) {
	var entries []*models.AuditChainEntry
	if err := s.pg.NewSelect().Model(&entries).
		Where("tenant_id = ?", tenantID).
		Order("seq ASC").Scan(ctx); err != nil {
		return nil, err
	}
	return verifyChain(entries), nil
}

// verifyChain is the pure verification logic: it walks an ordered slice of
// chain entries, recomputing each link, and reports the first break. Separated
// from Verify so it can be unit-tested without a database.
func verifyChain(entries []*models.AuditChainEntry) *models.AuditChainVerifyResult {
	res := &models.AuditChainVerifyResult{Valid: true, Entries: int64(len(entries))}
	prevHash := ""
	expectSeq := int64(1)
	for _, e := range entries {
		if e.Seq != expectSeq || e.PrevHash != prevHash || chainHash(e) != e.Hash {
			seq := e.Seq
			res.Valid = false
			res.BrokenAtSeq = &seq
			res.Message = "audit chain integrity check FAILED — a record was altered, inserted or removed"
			return res
		}
		prevHash = e.Hash
		expectSeq++
	}
	res.Message = "audit chain verified — no tampering detected"
	return res
}

// chainHash computes the deterministic SHA-256 link hash for an entry.
func chainHash(e *models.AuditChainEntry) string {
	parts := []string{
		e.PrevHash,
		strconv.FormatInt(e.Seq, 10),
		e.TenantID,
		e.Action,
		e.ActorID,
		e.ResourceType,
		e.ResourceID,
		e.Changes,
		e.CreatedAt.UTC().Format(time.RFC3339Nano),
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x1f")))
	return hex.EncodeToString(sum[:])
}

// lockKey derives a stable advisory-lock key from a tenant id.
func lockKey(s string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(s))
	return int64(h.Sum64())
}
