package services

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// ScanService manages scan records and their schedules.
type ScanService struct {
	pg  *bun.DB
	ch  *db.ClickHouseClient
	log *zap.Logger
}

// NewScanService creates a ScanService.
func NewScanService(pg *bun.DB, ch *db.ClickHouseClient, log *zap.Logger) *ScanService {
	return &ScanService{pg: pg, ch: ch, log: log}
}

// List returns paginated scans for a tenant with optional asset / status filters.
func (s *ScanService) List(ctx context.Context, tenantID string, filter *models.ScanListFilter) ([]*models.Scan, int64, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, 0, err
	}

	q := s.pg.NewSelect().Model((*models.Scan)(nil)).
		Where("s.tenant_id = ?", tenantID)
	if filter.AssetID != "" {
		q = q.Where("s.asset_id = ?", filter.AssetID)
	}
	if filter.Status != "" {
		q = q.Where("s.status = ?", filter.Status)
	}

	var scans []*models.Scan
	total, err := q.Relation("Asset").
		OrderExpr("s.created_at DESC").
		Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).
		ScanAndCount(ctx)
	return scans, int64(total), err
}

// GetByID returns a single scan record.
func (s *ScanService) GetByID(ctx context.Context, id, tenantID string) (*models.Scan, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	scan := &models.Scan{}
	err := s.pg.NewSelect().Model(scan).
		Relation("Asset").
		Where("s.id = ? AND s.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("scan")
		}
		return nil, err
	}
	return scan, nil
}

// Cancel marks a running scan as cancelled.
func (s *ScanService) Cancel(ctx context.Context, id, tenantID, userID string) error {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return err
	}
	res, err := s.pg.NewUpdate().Model((*models.Scan)(nil)).
		Set("status = 'cancelled'").
		Where("id = ? AND tenant_id = ? AND status IN ('queued','running')", id, tenantID).
		Exec(ctx)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrNotFound("scan (or scan is not cancellable)")
	}
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionScanCancelled, "scan", id)
	return nil
}

func (s *ScanService) writeAudit(ctx context.Context, tenantID, userID, action, resourceType, resourceID string) {
	entry := &models.AuditLog{
		ID:           GenerateID(),
		TenantID:     tenantID,
		UserID:       userID,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Timestamp:    time.Now(),
	}
	_ = s.ch.WriteAuditLog(ctx, entry)
}
