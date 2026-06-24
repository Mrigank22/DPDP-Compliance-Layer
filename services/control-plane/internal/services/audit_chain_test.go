// services/control-plane/internal/services/audit_chain_test.go

package services

import (
	"testing"
	"time"

	"github.com/datasentinel/control-plane/internal/models"
)

// buildChain produces a correctly-linked chain of n entries for a tenant.
func buildChain(tenant string, n int) []*models.AuditChainEntry {
	entries := make([]*models.AuditChainEntry, 0, n)
	prev := ""
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := int64(1); i <= int64(n); i++ {
		e := &models.AuditChainEntry{
			TenantID:     tenant,
			Seq:          i,
			Action:       "user.updated",
			ActorID:      "actor-1",
			ResourceType: "user",
			ResourceID:   "res-1",
			Changes:      `{"field":"value"}`,
			PrevHash:     prev,
			CreatedAt:    base.Add(time.Duration(i) * time.Second),
		}
		e.Hash = chainHash(e)
		prev = e.Hash
		entries = append(entries, e)
	}
	return entries
}

func TestVerifyChainValid(t *testing.T) {
	res := verifyChain(buildChain(tenantA, 5))
	if !res.Valid {
		t.Fatalf("expected valid chain, got: %s", res.Message)
	}
	if res.Entries != 5 {
		t.Fatalf("expected 5 entries, got %d", res.Entries)
	}
	if res.BrokenAtSeq != nil {
		t.Fatalf("expected no break, got broken_at_seq=%d", *res.BrokenAtSeq)
	}
}

func TestVerifyChainEmpty(t *testing.T) {
	res := verifyChain(nil)
	if !res.Valid || res.Entries != 0 {
		t.Fatalf("empty chain should be valid with 0 entries, got valid=%v entries=%d", res.Valid, res.Entries)
	}
}

func TestVerifyDetectsModifiedRecord(t *testing.T) {
	chain := buildChain(tenantA, 4)
	// Tamper a past record's payload without recomputing its hash.
	chain[1].Changes = `{"field":"TAMPERED"}`

	res := verifyChain(chain)
	if res.Valid {
		t.Fatal("SECURITY: tampered record was not detected")
	}
	if res.BrokenAtSeq == nil || *res.BrokenAtSeq != 2 {
		t.Fatalf("expected break at seq 2, got %v", res.BrokenAtSeq)
	}
}

func TestVerifyDetectsDeletedRecord(t *testing.T) {
	chain := buildChain(tenantA, 4)
	// Remove the second entry, leaving a sequence gap.
	chain = append(chain[:1], chain[2:]...)

	res := verifyChain(chain)
	if res.Valid {
		t.Fatal("SECURITY: deleted record was not detected")
	}
}

func TestVerifyDetectsInsertedRecord(t *testing.T) {
	chain := buildChain(tenantA, 3)
	forged := &models.AuditChainEntry{
		TenantID: tenantA, Seq: 99, Action: "user.deleted", PrevHash: chain[2].Hash,
		CreatedAt: time.Now().UTC(),
	}
	forged.Hash = chainHash(forged)
	chain = append(chain, forged) // seq jumps 3 -> 99

	res := verifyChain(chain)
	if res.Valid {
		t.Fatal("SECURITY: inserted out-of-sequence record was not detected")
	}
}

func TestChainHashDeterministicAndSensitive(t *testing.T) {
	e := &models.AuditChainEntry{
		TenantID: tenantA, Seq: 1, Action: "a", ActorID: "u", ResourceType: "user",
		ResourceID: "r", Changes: "c", PrevHash: "", CreatedAt: time.Unix(0, 0).UTC(),
	}
	h1 := chainHash(e)
	if h1 != chainHash(e) {
		t.Fatal("chainHash must be deterministic")
	}
	e.Action = "b"
	if chainHash(e) == h1 {
		t.Fatal("changing a field must change the hash")
	}
}

func TestLockKeyDeterministic(t *testing.T) {
	if lockKey(tenantA) != lockKey(tenantA) {
		t.Fatal("lockKey must be stable for the same tenant")
	}
	if lockKey(tenantA) == lockKey(tenantB) {
		t.Fatal("different tenants should map to different lock keys")
	}
}
