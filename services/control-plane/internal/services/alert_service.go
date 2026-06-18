// services/control-plane/internal/services/alert_service.go

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

// AlertService manages compliance alerts and notification preferences.
type AlertService struct {
	pg       *bun.DB
	ch       *db.ClickHouseClient
	log      *zap.Logger
	notifSvc *NotificationService
}

// NewAlertService creates an AlertService.
func NewAlertService(pg *bun.DB, ch *db.ClickHouseClient, log *zap.Logger, notifSvc *NotificationService) *AlertService {
	return &AlertService{pg: pg, ch: ch, log: log, notifSvc: notifSvc}
}

// List returns paginated alerts for a tenant.
func (s *AlertService) List(ctx context.Context, tenantID string, filter *models.AlertListFilter) ([]*models.Alert, int64, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, 0, err
	}

	q := s.pg.NewSelect().Model((*models.Alert)(nil)).
		Where("al.tenant_id = ?", tenantID)
	if filter.AlertType != "" {
		q = q.Where("al.alert_type = ?", filter.AlertType)
	}
	if filter.Severity != "" {
		q = q.Where("al.severity = ?", filter.Severity)
	}
	if filter.IsAcknowledged != nil {
		q = q.Where("al.is_acknowledged = ?", *filter.IsAcknowledged)
	}

	var alerts []*models.Alert
	total, err := q.OrderExpr("al.created_at DESC").
		Limit(filter.PageSize).Offset((filter.Page-1)*filter.PageSize).
		ScanAndCount(ctx, &alerts)
	return alerts, int64(total), err
}

// GetUnacknowledged returns all unread alerts for a tenant, most severe first.
func (s *AlertService) GetUnacknowledged(ctx context.Context, tenantID string) ([]*models.Alert, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	var alerts []*models.Alert
	err := s.pg.NewSelect().Model(&alerts).
		Where("tenant_id = ? AND is_acknowledged = false", tenantID).
		OrderExpr("CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC").
		Scan(ctx)
	return alerts, err
}

// Acknowledge marks one or more alerts as read.
func (s *AlertService) Acknowledge(ctx context.Context, tenantID, userID string, alertIDs []string) error {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return err
	}
	now := time.Now()
	_, err := s.pg.NewUpdate().Model((*models.Alert)(nil)).
		Set("is_acknowledged = true").
		Set("acknowledged_by = ?", userID).
		Set("acknowledged_at = ?", now).
		Where("id IN (?) AND tenant_id = ?", bun.In(alertIDs), tenantID).
		Exec(ctx)
	if err != nil {
		return err
	}
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionAlertAcknowledged, "alert", "bulk")
	return nil
}

// AcknowledgeAll marks every unread alert for a tenant as acknowledged.
func (s *AlertService) AcknowledgeAll(ctx context.Context, tenantID, userID string) error {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return err
	}
	now := time.Now()
	_, err := s.pg.NewUpdate().Model((*models.Alert)(nil)).
		Set("is_acknowledged = true").
		Set("acknowledged_by = ?", userID).
		Set("acknowledged_at = ?", now).
		Where("tenant_id = ? AND is_acknowledged = false", tenantID).
		Exec(ctx)
	return err
}

// Create inserts a new alert (called internally by workers / gateway).
func (s *AlertService) Create(ctx context.Context, alert *models.Alert) error {
	_, err := s.pg.NewInsert().Model(alert).Exec(ctx)
	return err
}

// CreateInternal inserts an alert on behalf of a trusted internal service,
// running inside a transaction with the tenant RLS context applied so isolation
// is enforced even when the caller is the shared service identity.
func (s *AlertService) CreateInternal(ctx context.Context, tenantID string, alert *models.Alert) error {
	return s.pg.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if err := db.SetTenantContext(ctx, tx, tenantID); err != nil {
			return err
		}
		_, err := tx.NewInsert().Model(alert).Exec(ctx)
		return err
	})
}

// MarkNotified flags an alert as having had its notifications dispatched.
func (s *AlertService) MarkNotified(ctx context.Context, tenantID, alertID string) error {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return err
	}
	_, err := s.pg.NewUpdate().Model((*models.Alert)(nil)).
		Set("notification_sent = true").
		Where("id = ? AND tenant_id = ?", alertID, tenantID).
		Exec(ctx)
	return err
}

// GetByID returns a single alert.
func (s *AlertService) GetByID(ctx context.Context, id, tenantID string) (*models.Alert, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	alert := &models.Alert{}
	err := s.pg.NewSelect().Model(alert).
		Where("al.id = ? AND al.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("alert")
		}
		return nil, err
	}
	return alert, nil
}

func (s *AlertService) writeAudit(ctx context.Context, tenantID, userID, action, resourceType, resourceID string) {
	entry := &models.AuditLog{
		ID: GenerateID(), TenantID: tenantID, UserID: userID,
		Action: action, ResourceType: resourceType, ResourceID: resourceID,
		Timestamp: time.Now(),
	}
	_ = s.ch.WriteAuditLog(ctx, entry)
}

// Delete removes an alert by ID.
func (s *AlertService) Delete(ctx context.Context, id, tenantID string) error {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return err
	}
	res, err := s.pg.NewDelete().Model((*models.Alert)(nil)).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		Exec(ctx)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrNotFound("alert")
	}
	return nil
}
