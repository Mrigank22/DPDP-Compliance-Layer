// services/control-plane/internal/services/finding_service.go

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

// FindingService manages scan findings and their lifecycle.
type FindingService struct {
	pg  *bun.DB
	ch  *db.ClickHouseClient
	log *zap.Logger
}

// NewFindingService creates a FindingService.
func NewFindingService(pg *bun.DB, ch *db.ClickHouseClient, log *zap.Logger) *FindingService {
	return &FindingService{pg: pg, ch: ch, log: log}
}

// List returns paginated findings for a tenant, supporting rich filters.
func (s *FindingService) List(ctx context.Context, tenantID string, filter *models.FindingListFilter) ([]*models.Finding, int64, error) {
	if filter.Page < 1 { filter.Page = 1 }
	if filter.PageSize < 1 || filter.PageSize > 100 { filter.PageSize = 20 }
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, 0, err
	}

	q := s.pg.NewSelect().Model((*models.Finding)(nil)).
		Where("f.tenant_id = ?", tenantID)

	if filter.AssetID != "" { q = q.Where("f.asset_id = ?", filter.AssetID) }
	if filter.ScanID != "" { q = q.Where("f.scan_id = ?", filter.ScanID) }
	if filter.FindingType != "" { q = q.Where("f.finding_type = ?", filter.FindingType) }
	if filter.Severity != "" { q = q.Where("f.severity = ?", filter.Severity) }
	if filter.IsResolved != nil { q = q.Where("f.is_resolved = ?", *filter.IsResolved) }

	var findings []*models.Finding
	total, err := q.OrderExpr("f.created_at DESC").
		Limit(filter.PageSize).Offset((filter.Page-1)*filter.PageSize).
		ScanAndCount(ctx)
	return findings, int64(total), err
}

// GetByID returns a single finding with its asset relation.
func (s *FindingService) GetByID(ctx context.Context, id, tenantID string) (*models.Finding, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	finding := &models.Finding{}
	err := s.pg.NewSelect().Model(finding).
		Relation("Asset").
		Where("f.id = ? AND f.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("finding")
		}
		return nil, err
	}
	return finding, nil
}

// Resolve marks a finding as resolved.
func (s *FindingService) Resolve(ctx context.Context, id, tenantID, userID string, input *models.ResolveFindingInput) (*models.Finding, error) {
	finding, err := s.GetByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	if finding.IsResolved {
		return finding, nil // idempotent
	}

	now := time.Now()
	finding.IsResolved = true
	finding.ResolvedBy = &userID
	finding.ResolvedAt = &now
	finding.ResolutionNote = &input.ResolutionNote

	_, err = s.pg.NewUpdate().Model(finding).
		Set("is_resolved = true").
		Set("resolved_by = ?", userID).
		Set("resolved_at = ?", now).
		Set("resolution_note = ?", input.ResolutionNote).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		Exec(ctx)
	if err != nil {
		return nil, err
	}

	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionFindingResolved, "finding", id)
	return finding, nil
}

// MarkFalsePositive resolves a finding and marks it as a false positive in evidence.
func (s *FindingService) MarkFalsePositive(ctx context.Context, id, tenantID, userID string) (*models.Finding, error) {
	finding, err := s.GetByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	note := "Marked as false positive"
	evidence := finding.Evidence
	if evidence == nil {
		evidence = map[string]any{}
	}
	evidence["false_positive"] = true
	evidence["false_positive_by"] = userID
	evidence["false_positive_at"] = now

	_, err = s.pg.NewUpdate().Model(finding).
		Set("is_resolved = true").
		Set("resolved_by = ?", userID).
		Set("resolved_at = ?", now).
		Set("resolution_note = ?", note).
		Set("evidence = ?", evidence).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		Exec(ctx)
	if err != nil {
		return nil, err
	}
	finding.IsResolved = true
	finding.ResolvedBy = &userID
	finding.ResolvedAt = &now
	finding.ResolutionNote = &note
	finding.Evidence = evidence
	return finding, nil
}

// Summary returns aggregated counts grouped by severity, type, and PII type.
func (s *FindingService) Summary(ctx context.Context, tenantID string) (*models.FindingStatsResponse, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}

	type countRow struct {
		Key   string `bun:"key"`
		Count int64  `bun:"count"`
	}

	stats := &models.FindingStatsResponse{
		BySeverity: make(map[string]int64),
		ByType:     make(map[string]int64),
		ByPIIType:  make(map[string]int64),
	}

	// Total
	total, err := s.pg.NewSelect().Model((*models.Finding)(nil)).
		Where("tenant_id = ?", tenantID).Count(ctx)
	if err != nil {
		return nil, err
	}
	stats.Total = int64(total)

	// Unresolved
	unresolved, _ := s.pg.NewSelect().Model((*models.Finding)(nil)).
		Where("tenant_id = ? AND is_resolved = false", tenantID).Count(ctx)
	stats.Unresolved = int64(unresolved)

	// By severity
	var severityRows []countRow
	_ = s.pg.NewSelect().
		TableExpr("findings").
		ColumnExpr("severity AS key, count(*) AS count").
		Where("tenant_id = ?", tenantID).
		GroupExpr("severity").
		Scan(ctx, &severityRows)
	for _, r := range severityRows {
		stats.BySeverity[r.Key] = r.Count
	}

	// By finding_type
	var typeRows []countRow
	_ = s.pg.NewSelect().
		TableExpr("findings").
		ColumnExpr("finding_type AS key, count(*) AS count").
		Where("tenant_id = ?", tenantID).
		GroupExpr("finding_type").
		Scan(ctx, &typeRows)
	for _, r := range typeRows {
		stats.ByType[r.Key] = r.Count
	}

	return stats, nil
}

// Trends returns daily finding counts for the last N days, grouped by severity.
func (s *FindingService) Trends(ctx context.Context, tenantID string, days int) ([]map[string]any, error) {
	if days < 1 || days > 90 {
		days = 30
	}
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}

	type trendRow struct {
		Date     time.Time `bun:"date"`
		Severity string    `bun:"severity"`
		Count    int64     `bun:"count"`
	}

	var rows []trendRow
	err := s.pg.NewSelect().
		TableExpr("findings").
		ColumnExpr("date_trunc('day', created_at) AS date, severity, count(*) AS count").
		Where("tenant_id = ? AND created_at >= NOW() - INTERVAL '? days'", tenantID, days).
		GroupExpr("date_trunc('day', created_at), severity").
		OrderExpr("date ASC").
		Scan(ctx, &rows)
	if err != nil {
		return nil, err
	}

	// Reshape into [{date, critical, high, medium, low, info}, ...]
	dayMap := make(map[string]map[string]any)
	for _, r := range rows {
		day := r.Date.Format("2006-01-02")
		if _, ok := dayMap[day]; !ok {
			dayMap[day] = map[string]any{"date": day}
		}
		dayMap[day][r.Severity] = r.Count
	}

	result := make([]map[string]any, 0, len(dayMap))
	for _, v := range dayMap {
		result = append(result, v)
	}
	return result, nil
}

func (s *FindingService) writeAudit(ctx context.Context, tenantID, userID, action, resourceType, resourceID string) {
	entry := &models.AuditLog{
		ID: GenerateID(), TenantID: tenantID, UserID: userID,
		Action: action, ResourceType: resourceType, ResourceID: resourceID,
		Timestamp: time.Now(),
	}
	if err := s.ch.WriteAuditLog(ctx, entry); err != nil {
		s.log.Warn("audit write failed", zap.Error(err))
	}
}
