// services/control-plane/internal/services/report_service.go

package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// ReportService manages compliance report generation and retrieval.
type ReportService struct {
	pg        *bun.DB
	ch        *db.ClickHouseClient
	log       *zap.Logger
	workerSvc *WorkerService
}

// NewReportService creates a ReportService.
func NewReportService(pg *bun.DB, ch *db.ClickHouseClient, log *zap.Logger, workerSvc *WorkerService) *ReportService {
	return &ReportService{pg: pg, ch: ch, log: log, workerSvc: workerSvc}
}

// List returns paginated reports for a tenant.
func (s *ReportService) List(ctx context.Context, tenantID string, page, pageSize int) ([]*models.Report, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, 0, err
	}
	var reports []*models.Report
	total, err := s.pg.NewSelect().Model(&reports).
		ExcludeColumn("content", "content_html").
		Where("r.tenant_id = ?", tenantID).
		OrderExpr("r.created_at DESC").
		Limit(pageSize).Offset((page-1)*pageSize).
		ScanAndCount(ctx, &reports)
	return reports, int64(total), err
}

// GetByID returns a single report record.
func (s *ReportService) GetByID(ctx context.Context, id, tenantID string) (*models.Report, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	report := &models.Report{}
	err := s.pg.NewSelect().Model(report).
		ExcludeColumn("content", "content_html").
		Where("r.id = ? AND r.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("report")
		}
		return nil, err
	}
	return report, nil
}

// GetForDownload returns a single report including its stored body so it can be
// streamed to the client. Used only by the download endpoint.
func (s *ReportService) GetForDownload(ctx context.Context, id, tenantID string) (*models.Report, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	report := &models.Report{}
	err := s.pg.NewSelect().Model(report).
		Where("r.id = ? AND r.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("report")
		}
		return nil, err
	}
	return report, nil
}

// Generate creates a report record and dispatches a generation worker task.
func (s *ReportService) Generate(ctx context.Context, tenantID, userID string, input *models.GenerateReportInput) (*models.Report, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	report := &models.Report{
		TenantID:    tenantID,
		ReportType:  input.ReportType,
		Title:       input.Title,
		Status:      models.ReportStatusGenerating,
		GeneratedBy: &userID,
		Parameters:  input.Parameters,
	}
	if _, err := s.pg.NewInsert().Model(report).Exec(ctx); err != nil {
		return nil, fmt.Errorf("create report record: %w", err)
	}

	// Dispatch to worker queue asynchronously
	go func() {
		if err := s.workerSvc.DispatchReportGeneration(context.Background(), report.ID, tenantID); err != nil {
			s.log.Error("dispatch report generation failed", zap.Error(err), zap.String("report_id", report.ID))
			_, _ = s.pg.NewUpdate().Model((*models.Report)(nil)).
				Set("status = 'failed'").
				Where("id = ?", report.ID).
				Exec(context.Background())
		}
	}()

	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionReportGenerated, "report", report.ID)
	return report, nil
}

// Delete removes a report record (and its S3 file via worker).
func (s *ReportService) Delete(ctx context.Context, id, tenantID string) error {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return err
	}
	res, err := s.pg.NewDelete().Model((*models.Report)(nil)).
		Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrNotFound("report")
	}
	return nil
}

// GetTemplates returns the available report template definitions.
func (s *ReportService) GetTemplates() []map[string]any {
	return []map[string]any{
		{"id": "dpdp_compliance", "name": "DPDP Compliance Summary", "description": "Full compliance posture under the Digital Personal Data Protection Act 2023. Includes risk score, policy coverage, findings summary, and remediation roadmap."},
		{"id": "executive_summary", "name": "Executive Summary", "description": "Board-level overview of data privacy risks, key metrics, and trends."},
		{"id": "asset_inventory", "name": "Asset Inventory", "description": "Complete inventory of all connected data assets with PII exposure and risk scores."},
		{"id": "incident_report", "name": "Incident Report", "description": "Detailed documentation of a specific data incident or breach for regulatory notification."},
		{"id": "dpia", "name": "Data Protection Impact Assessment (DPIA)", "description": "Structured DPIA template pre-populated with detected PII flows and risk factors."},
		{"id": "audit_evidence", "name": "Audit Evidence Pack", "description": "Full audit trail export with policy history, scan results, and user activity logs."},
	}
}

func (s *ReportService) writeAudit(ctx context.Context, tenantID, userID, action, resourceType, resourceID string) {
	entry := &models.AuditLog{
		ID: GenerateID(), TenantID: tenantID, UserID: userID,
		Action: action, ResourceType: resourceType, ResourceID: resourceID,
	}
	_ = s.ch.WriteAuditLog(ctx, entry)
}
