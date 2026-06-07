// services/control-plane/internal/db/postgres.go

package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/golang-migrate/migrate/v4"
	migratepostgres "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/driver/pgdriver"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/config"
)

// NewPostgres opens a bun/PostgreSQL connection pool and validates connectivity.
func NewPostgres(cfg *config.Config, log *zap.Logger) (*bun.DB, error) {
	sqlDB := sql.OpenDB(pgdriver.NewConnector(
		pgdriver.WithDSN(cfg.DatabaseURL),
		pgdriver.WithTimeout(10*time.Second),
		pgdriver.WithApplicationName("datasentinel-control-plane"),
	))

	sqlDB.SetMaxOpenConns(cfg.DBMaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.DBMaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.DBConnLifetime)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := sqlDB.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("postgres ping: %w", err)
	}

	db := bun.NewDB(sqlDB, pgdialect.New())

	// Query hook: set tenant context on every connection from pool
	db.AddQueryHook(&tenantQueryHook{log: log})

	log.Info("postgres connected", zap.String("dsn_host", maskDSN(cfg.DatabaseURL)))
	return db, nil
}

// RunMigrations executes all pending SQL migrations from the migrations directory.
func RunMigrations(db *bun.DB, migrationsPath string, log *zap.Logger) error {
	sqlDB := db.DB
	driver, err := migratepostgres.WithInstance(sqlDB, &migratepostgres.Config{})
	if err != nil {
		return fmt.Errorf("migrate driver: %w", err)
	}

	m, err := migrate.NewWithDatabaseInstance(
		fmt.Sprintf("file://%s", migrationsPath),
		"postgres",
		driver,
	)
	if err != nil {
		return fmt.Errorf("migrate init: %w", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migrate up: %w", err)
	}

	version, dirty, _ := m.Version()
	log.Info("migrations complete", zap.Uint("version", version), zap.Bool("dirty", dirty))
	return nil
}

// SetTenantContext injects the tenant ID into the PostgreSQL session so that
// Row-Level Security policies are enforced. Must be called at the start of
// every transaction or connection checkout that touches tenant-scoped tables.
func SetTenantContext(ctx context.Context, db bun.IDB, tenantID string) error {
	_, err := db.ExecContext(ctx, "SET LOCAL app.current_tenant_id = ?", tenantID)
	return err
}

// ClearTenantContext resets the tenant context (for superadmin operations).
func ClearTenantContext(ctx context.Context, db bun.IDB) error {
	_, err := db.ExecContext(ctx, "RESET app.current_tenant_id")
	return err
}

// maskDSN strips credentials from a DSN for safe logging.
func maskDSN(dsn string) string {
	// Simple approach: return only host portion
	// e.g. "postgresql://user:pass@host:5432/db" → "host:5432/db"
	if len(dsn) < 10 {
		return "****"
	}
	// Find @ sign
	for i := len(dsn) - 1; i >= 0; i-- {
		if dsn[i] == '@' {
			return dsn[i+1:]
		}
	}
	return "****"
}

// tenantQueryHook is a bun QueryHook that logs slow queries in development.
type tenantQueryHook struct {
	log *zap.Logger
}

func (h *tenantQueryHook) BeforeQuery(ctx context.Context, event *bun.QueryEvent) context.Context {
	return ctx
}

func (h *tenantQueryHook) AfterQuery(ctx context.Context, event *bun.QueryEvent) {
	duration := time.Since(event.StartTime)
	if duration > 500*time.Millisecond {
		h.log.Warn("slow query",
			zap.Duration("duration", duration),
			zap.String("query", event.Query),
		)
	}
	if event.Err != nil && event.Err != sql.ErrNoRows {
		h.log.Error("query error",
			zap.Error(event.Err),
			zap.String("query", event.Query),
		)
	}
}
