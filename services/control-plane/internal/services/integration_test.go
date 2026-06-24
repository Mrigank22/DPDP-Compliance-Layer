// services/control-plane/internal/services/integration_test.go
//
// Integration tests for tenant isolation and the security-critical service
// flows, run against a REAL Postgres. They are skipped unless TEST_DATABASE_URL
// points at a disposable database, e.g.:
//
//	TEST_DATABASE_URL=postgres://datasentinel:datasentinel@localhost:5432/datasentinel_test?sslmode=disable \
//	    go test ./internal/services/ -run Integration -v
//
// The schema is created by the real migrations (excluding the ClickHouse-only
// 000011 file, which is not valid PostgreSQL).

package services

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/driver/pgdriver"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

func setupTestDB(t *testing.T) *bun.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL (a disposable database) to run integration tests")
	}

	sqldb := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(dsn)))
	pg := bun.NewDB(sqldb, pgdialect.New())
	t.Cleanup(func() { _ = pg.Close() })

	// Copy migrations to a temp dir, excluding the ClickHouse-only file which is
	// not valid PostgreSQL.
	tmp := t.TempDir()
	entries, err := os.ReadDir("../../migrations")
	if err != nil {
		t.Fatalf("read migrations dir: %v", err)
	}
	for _, e := range entries {
		if e.IsDir() || strings.Contains(e.Name(), "clickhouse") {
			continue
		}
		data, err := os.ReadFile(filepath.Join("../../migrations", e.Name()))
		if err != nil {
			t.Fatalf("read migration %s: %v", e.Name(), err)
		}
		if err := os.WriteFile(filepath.Join(tmp, e.Name()), data, 0o600); err != nil {
			t.Fatalf("write migration %s: %v", e.Name(), err)
		}
	}
	if err := db.RunMigrations(pg, tmp, zap.NewNop()); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	return pg
}

type seededTenant struct {
	tenantID string
	userID   string
	rtHash   string
}

func seedTenant(t *testing.T, ctx context.Context, pg *bun.DB, label string) seededTenant {
	t.Helper()
	tenant := &models.Tenant{
		ID:   uuid.NewString(),
		Name: "Tenant " + label,
		Slug: "t-" + label + "-" + uuid.NewString()[:8],
	}
	if _, err := pg.NewInsert().Model(tenant).Exec(ctx); err != nil {
		t.Fatalf("seed tenant: %v", err)
	}
	user := &models.User{
		ID:       uuid.NewString(),
		TenantID: tenant.ID,
		Email:    label + "-" + uuid.NewString()[:8] + "@example.com",
		FullName: "User " + label,
		Role:     models.RoleAdmin,
		IsActive: true,
	}
	if _, err := pg.NewInsert().Model(user).Exec(ctx); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	rt := &models.RefreshToken{
		ID:        uuid.NewString(),
		UserID:    user.ID,
		TenantID:  tenant.ID,
		TokenHash: uuid.NewString(),
		Family:    uuid.NewString(),
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if _, err := pg.NewInsert().Model(rt).Exec(ctx); err != nil {
		t.Fatalf("seed refresh token: %v", err)
	}
	return seededTenant{tenantID: tenant.ID, userID: user.ID, rtHash: rt.TokenHash}
}

func TestTenantIsolationIntegration(t *testing.T) {
	pg := setupTestDB(t)
	ctx := context.Background()
	log := zap.NewNop()

	a := seedTenant(t, ctx, pg, "a")
	b := seedTenant(t, ctx, pg, "b")

	t.Run("explicit tenant scoping blocks cross-tenant reads", func(t *testing.T) {
		// Tenant A querying tenant B's user by id must return nothing.
		count, err := pg.NewSelect().Model((*models.User)(nil)).
			Where("id = ? AND tenant_id = ?", b.userID, a.tenantID).Count(ctx)
		if err != nil {
			t.Fatalf("count: %v", err)
		}
		if count != 0 {
			t.Fatal("SECURITY: tenant A read tenant B's user via id")
		}
	})

	t.Run("SCIM list is scoped to one tenant", func(t *testing.T) {
		scim := NewSCIMService(pg, log)
		list, err := scim.ListUsers(ctx, a.tenantID, "", 1, 100)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		for _, u := range list.Resources {
			if u.ID == b.userID {
				t.Fatal("SECURITY: SCIM list for tenant A returned tenant B's user")
			}
		}
	})

	t.Run("SCIM cannot fetch another tenant's user", func(t *testing.T) {
		scim := NewSCIMService(pg, log)
		if _, err := scim.GetUser(ctx, a.tenantID, b.userID); err == nil {
			t.Fatal("SECURITY: SCIM fetched a cross-tenant user")
		}
	})

	t.Run("SCIM cross-tenant deactivate is a no-op", func(t *testing.T) {
		scim := NewSCIMService(pg, log)
		// Tenant A attempts to deactivate tenant B's user.
		_ = scim.DeactivateUser(ctx, a.tenantID, b.userID)

		userB := &models.User{}
		if err := pg.NewSelect().Model(userB).Where("id = ?", b.userID).Scan(ctx); err != nil {
			t.Fatalf("reload user B: %v", err)
		}
		if !userB.IsActive {
			t.Fatal("SECURITY: tenant A deactivated tenant B's user")
		}
	})

	t.Run("SCIM deprovision deactivates and revokes sessions", func(t *testing.T) {
		scim := NewSCIMService(pg, log)
		if err := scim.DeactivateUser(ctx, a.tenantID, a.userID); err != nil {
			t.Fatalf("deactivate: %v", err)
		}

		userA := &models.User{}
		if err := pg.NewSelect().Model(userA).Where("id = ?", a.userID).Scan(ctx); err != nil {
			t.Fatalf("reload user A: %v", err)
		}
		if userA.IsActive {
			t.Fatal("deprovisioned user is still active")
		}

		rt := &models.RefreshToken{}
		if err := pg.NewSelect().Model(rt).Where("token_hash = ?", a.rtHash).Scan(ctx); err != nil {
			t.Fatalf("reload refresh token: %v", err)
		}
		if !rt.Revoked {
			t.Fatal("deprovisioned user's refresh token was not revoked")
		}
	})
}

func TestAuditChainIntegration(t *testing.T) {
	pg := setupTestDB(t)
	ctx := context.Background()
	chain := NewAuditChainService(pg, zap.NewNop())

	a := seedTenant(t, ctx, pg, "audit")

	for i := 0; i < 3; i++ {
		if err := chain.AppendAudit(ctx, &models.AuditLog{
			TenantID:     a.tenantID,
			UserID:       a.userID,
			Action:       "user.updated",
			ResourceType: "user",
			ResourceID:   a.userID,
			Changes:      `{"i":` + uuid.NewString() + `}`,
		}); err != nil {
			t.Fatalf("append %d: %v", i, err)
		}
	}

	res, err := chain.Verify(ctx, a.tenantID)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !res.Valid || res.Entries != 3 {
		t.Fatalf("expected valid chain of 3, got valid=%v entries=%d", res.Valid, res.Entries)
	}

	// Tamper with a stored record directly in the database.
	if _, err := pg.NewUpdate().Model((*models.AuditChainEntry)(nil)).
		Set("changes = ?", "TAMPERED").
		Where("tenant_id = ? AND seq = 1", a.tenantID).Exec(ctx); err != nil {
		t.Fatalf("tamper: %v", err)
	}

	res, err = chain.Verify(ctx, a.tenantID)
	if err != nil {
		t.Fatalf("verify after tamper: %v", err)
	}
	if res.Valid {
		t.Fatal("SECURITY: tampered audit chain reported as valid")
	}
	if res.BrokenAtSeq == nil || *res.BrokenAtSeq != 1 {
		t.Fatalf("expected break at seq 1, got %v", res.BrokenAtSeq)
	}
}
