// services/control-plane/internal/services/breach_service.go
//
// Personal data breach incident management (DPDP Act 2023 §8(6)).
//
// Workflow: record an incident → assess its scope → intimate the Data Protection
// Board (within 72h of awareness) and the affected Data Principals → close with a
// documented timeline that serves as the evidence pack. Every state change is
// written to the tamper-evident audit ledger and to the incident's own timeline.
//
// Tenant isolation: every query is explicitly scoped by tenant_id (the primary
// control); see db.SetTenantContext for the RLS backstop.

package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// BreachService manages personal data breach incidents.
type BreachService struct {
	pg  *bun.DB
	ch  *db.ClickHouseClient
	log *zap.Logger
}

func NewBreachService(pg *bun.DB, ch *db.ClickHouseClient, log *zap.Logger) *BreachService {
	return &BreachService{pg: pg, ch: ch, log: log}
}

// List returns paginated incidents for a tenant.
func (s *BreachService) List(ctx context.Context, tenantID string, f *models.BreachListFilter) ([]*models.BreachIncident, int64, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 100 {
		f.PageSize = 20
	}

	q := s.pg.NewSelect().Model((*models.BreachIncident)(nil)).
		Relation("Reporter").Relation("Assignee").
		Where("bi.tenant_id = ?", tenantID)
	if f.Status != "" {
		q = q.Where("bi.status = ?", f.Status)
	}
	if f.Severity != "" {
		q = q.Where("bi.severity = ?", f.Severity)
	}
	if f.Overdue {
		q = q.Where("bi.board_notified_at IS NULL AND bi.status <> ? AND bi.discovered_at + (? || ' hours')::interval < now()",
			models.BreachStatusClosed, models.BreachBoardDeadlineHours)
	}

	var incidents []*models.BreachIncident
	total, err := q.OrderExpr("bi.discovered_at DESC").
		Limit(f.PageSize).Offset((f.Page-1)*f.PageSize).
		ScanAndCount(ctx, &incidents)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, 0, err
	}
	if incidents == nil {
		incidents = []*models.BreachIncident{}
	}
	return incidents, int64(total), nil
}

// Stats summarises the tenant's breach posture for dashboards/headers.
func (s *BreachService) Stats(ctx context.Context, tenantID string) (*models.BreachStats, error) {
	stats := &models.BreachStats{}
	err := s.pg.NewSelect().
		ColumnExpr("count(*) AS total").
		ColumnExpr("count(*) FILTER (WHERE status <> ?) AS open", models.BreachStatusClosed).
		ColumnExpr("count(*) FILTER (WHERE severity = ? AND status <> ?) AS critical_open", models.BreachSeverityCritical, models.BreachStatusClosed).
		ColumnExpr("count(*) FILTER (WHERE board_notified_at IS NULL AND status <> ? AND discovered_at + (? || ' hours')::interval < now()) AS board_overdue", models.BreachStatusClosed, models.BreachBoardDeadlineHours).
		ColumnExpr("count(*) FILTER (WHERE principals_notified_at IS NULL AND status <> ?) AS awaiting_principals", models.BreachStatusClosed).
		ColumnExpr("count(*) FILTER (WHERE status = ?) AS closed", models.BreachStatusClosed).
		TableExpr("breach_incidents").
		Where("tenant_id = ?", tenantID).
		Scan(ctx, stats)
	if err != nil {
		return nil, err
	}
	return stats, nil
}

// GetByID returns a single incident with its ordered timeline and people.
func (s *BreachService) GetByID(ctx context.Context, id, tenantID string) (*models.BreachIncident, error) {
	bi := &models.BreachIncident{}
	err := s.pg.NewSelect().Model(bi).
		Relation("Reporter").Relation("Assignee").
		Relation("Timeline", func(q *bun.SelectQuery) *bun.SelectQuery {
			return q.Relation("Actor").Order("created_at ASC")
		}).
		Where("bi.id = ? AND bi.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("breach incident")
		}
		return nil, err
	}
	return bi, nil
}

// get fetches the bare incident row (no relations) for internal mutations.
func (s *BreachService) get(ctx context.Context, id, tenantID string) (*models.BreachIncident, error) {
	bi := &models.BreachIncident{}
	err := s.pg.NewSelect().Model(bi).
		Where("bi.id = ? AND bi.tenant_id = ?", id, tenantID).Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("breach incident")
		}
		return nil, err
	}
	return bi, nil
}

// Create records a new breach incident.
func (s *BreachService) Create(ctx context.Context, tenantID, userID string, in *models.CreateBreachInput) (*models.BreachIncident, error) {
	discovered := time.Now()
	if in.DiscoveredAt != nil {
		discovered = *in.DiscoveredAt
	}
	severity := in.Severity
	if severity == "" {
		severity = models.BreachSeverityMedium
	}
	reporter := userID

	bi := &models.BreachIncident{
		TenantID:           tenantID,
		Reference:          breachReference(),
		Title:              strings.TrimSpace(in.Title),
		Description:        in.Description,
		Status:             models.BreachStatusOpen,
		Severity:           severity,
		Categories:         cleanList(in.Categories),
		AffectedDataTypes:  cleanList(in.AffectedDataTypes),
		AffectedPrincipals: in.AffectedPrincipals,
		AffectedAssetIDs:   cleanList(in.AffectedAssetIDs),
		DiscoveredAt:       discovered,
		OccurredAt:         in.OccurredAt,
		ReportedBy:         &reporter,
	}
	if _, err := s.pg.NewInsert().Model(bi).Exec(ctx); err != nil {
		return nil, fmt.Errorf("create breach incident: %w", err)
	}

	s.addTimelineEntry(ctx, tenantID, bi.ID, userID, "created", "Incident recorded")
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionBreachCreated, bi.ID)
	return s.GetByID(ctx, bi.ID, tenantID)
}

// Update applies scope/detail/status/assignment changes.
func (s *BreachService) Update(ctx context.Context, id, tenantID, userID string, in *models.UpdateBreachInput) (*models.BreachIncident, error) {
	bi, err := s.get(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}

	q := s.pg.NewUpdate().Model(bi).Where("id = ? AND tenant_id = ?", id, tenantID)
	statusChanged := false

	if in.Title != nil {
		q = q.Set("title = ?", strings.TrimSpace(*in.Title))
	}
	if in.Description != nil {
		q = q.Set("description = ?", *in.Description)
	}
	if in.Status != nil && *in.Status != bi.Status {
		statusChanged = true
		q = q.Set("status = ?", *in.Status)
	}
	if in.Severity != nil {
		q = q.Set("severity = ?", *in.Severity)
	}
	if in.Categories != nil {
		q = q.Set("categories = ?", pgArray(cleanList(in.Categories)))
	}
	if in.AffectedDataTypes != nil {
		q = q.Set("affected_data_types = ?", pgArray(cleanList(in.AffectedDataTypes)))
	}
	if in.AffectedPrincipals != nil {
		q = q.Set("affected_principals = ?", *in.AffectedPrincipals)
	}
	if in.AffectedAssetIDs != nil {
		q = q.Set("affected_asset_ids = ?", pgArray(cleanList(in.AffectedAssetIDs)))
	}
	if in.OccurredAt != nil {
		q = q.Set("occurred_at = ?", *in.OccurredAt)
	}
	if in.RootCause != nil {
		q = q.Set("root_cause = ?", *in.RootCause)
	}
	if in.Consequences != nil {
		q = q.Set("consequences = ?", *in.Consequences)
	}
	if in.MitigationMeasures != nil {
		q = q.Set("mitigation_measures = ?", *in.MitigationMeasures)
	}
	if in.RemedialMeasures != nil {
		q = q.Set("remedial_measures = ?", *in.RemedialMeasures)
	}
	if in.AssignedTo != nil {
		q = q.Set("assigned_to = ?", *in.AssignedTo)
	}
	q = q.Set("updated_at = now()")

	if _, err := q.Exec(ctx); err != nil {
		return nil, fmt.Errorf("update breach incident: %w", err)
	}

	if statusChanged {
		s.addTimelineEntry(ctx, tenantID, id, userID, "status_change", "Status changed to "+*in.Status)
	} else {
		s.addTimelineEntry(ctx, tenantID, id, userID, "scope_update", "Incident details updated")
	}
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionBreachUpdated, id)
	return s.GetByID(ctx, id, tenantID)
}

// AddTimelineNote appends a free-text note to the incident timeline.
func (s *BreachService) AddTimelineNote(ctx context.Context, id, tenantID, userID string, in *models.AddBreachTimelineInput) (*models.BreachTimelineEntry, error) {
	if _, err := s.get(ctx, id, tenantID); err != nil {
		return nil, err
	}
	entry := s.addTimelineEntry(ctx, tenantID, id, userID, "note", strings.TrimSpace(in.Note))
	if entry == nil {
		return nil, ErrInternal("failed to add timeline note")
	}
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionBreachUpdated, id)
	return entry, nil
}

// NotifyBoard records the intimation to the Data Protection Board.
func (s *BreachService) NotifyBoard(ctx context.Context, id, tenantID, userID string, in *models.NotifyBoardInput) (*models.BreachIncident, error) {
	bi, err := s.get(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	q := s.pg.NewUpdate().Model((*models.BreachIncident)(nil)).
		Set("board_notified_at = ?", now).
		Set("board_reference = ?", strings.TrimSpace(in.Reference)).
		Set("updated_at = now()")
	// Once both intimations are done, advance the status.
	if bi.PrincipalsNotifiedAt != nil && bi.Status != models.BreachStatusClosed {
		q = q.Set("status = ?", models.BreachStatusNotified)
	}
	if _, err := q.Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx); err != nil {
		return nil, fmt.Errorf("notify board: %w", err)
	}

	note := "Data Protection Board intimated"
	if in.Note != "" {
		note += " — " + strings.TrimSpace(in.Note)
	}
	s.addTimelineEntry(ctx, tenantID, id, userID, "board_notified", note)
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionBreachBoardNotified, id)
	return s.GetByID(ctx, id, tenantID)
}

// NotifyPrincipals records the intimation to affected Data Principals.
func (s *BreachService) NotifyPrincipals(ctx context.Context, id, tenantID, userID string, in *models.NotifyPrincipalsInput) (*models.BreachIncident, error) {
	bi, err := s.get(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	q := s.pg.NewUpdate().Model((*models.BreachIncident)(nil)).
		Set("principals_notified_at = ?", now).
		Set("principals_notified_count = ?", in.Count).
		Set("updated_at = now()")
	if bi.BoardNotifiedAt != nil && bi.Status != models.BreachStatusClosed {
		q = q.Set("status = ?", models.BreachStatusNotified)
	}
	if _, err := q.Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx); err != nil {
		return nil, fmt.Errorf("notify principals: %w", err)
	}

	note := fmt.Sprintf("Affected data principals intimated (%d)", in.Count)
	if in.Note != "" {
		note += " — " + strings.TrimSpace(in.Note)
	}
	s.addTimelineEntry(ctx, tenantID, id, userID, "principals_notified", note)
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionBreachPrincipalsNotified, id)
	return s.GetByID(ctx, id, tenantID)
}

// Close marks the incident resolved and documented.
func (s *BreachService) Close(ctx context.Context, id, tenantID, userID string, in *models.CloseBreachInput) (*models.BreachIncident, error) {
	if _, err := s.get(ctx, id, tenantID); err != nil {
		return nil, err
	}
	if _, err := s.pg.NewUpdate().Model((*models.BreachIncident)(nil)).
		Set("status = ?", models.BreachStatusClosed).
		Set("updated_at = now()").
		Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx); err != nil {
		return nil, fmt.Errorf("close breach incident: %w", err)
	}

	note := "Incident closed"
	if in.Note != "" {
		note += " — " + strings.TrimSpace(in.Note)
	}
	s.addTimelineEntry(ctx, tenantID, id, userID, "closed", note)
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionBreachClosed, id)
	return s.GetByID(ctx, id, tenantID)
}

// Delete removes an incident and its timeline (admin only).
func (s *BreachService) Delete(ctx context.Context, id, tenantID, userID string) error {
	res, err := s.pg.NewDelete().Model((*models.BreachIncident)(nil)).
		Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete breach incident: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound("breach incident")
	}
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionBreachDeleted, id)
	return nil
}

// ---- helpers ----------------------------------------------------------------

func (s *BreachService) addTimelineEntry(ctx context.Context, tenantID, incidentID, actorID, entryType, note string) *models.BreachTimelineEntry {
	var actor *string
	if actorID != "" {
		actor = &actorID
	}
	entry := &models.BreachTimelineEntry{
		TenantID:   tenantID,
		IncidentID: incidentID,
		EntryType:  entryType,
		Note:       note,
		ActorID:    actor,
	}
	if _, err := s.pg.NewInsert().Model(entry).Exec(ctx); err != nil {
		s.log.Warn("breach: add timeline entry failed", zap.Error(err), zap.String("incident_id", incidentID))
		return nil
	}
	return entry
}

func (s *BreachService) writeAudit(ctx context.Context, tenantID, userID, action, resourceID string) {
	entry := &models.AuditLog{
		ID: GenerateID(), TenantID: tenantID, UserID: userID,
		Action: action, ResourceType: "breach_incident", ResourceID: resourceID,
		Timestamp: time.Now(),
	}
	_ = s.ch.WriteAuditLog(ctx, entry)
}

// breachReference builds a human-friendly per-tenant reference, e.g. BR-20260625-1A2B3C.
func breachReference() string {
	return fmt.Sprintf("BR-%s-%s", time.Now().Format("20060102"), strings.ToUpper(uuid.New().String()[:6]))
}

// pgArray wraps a slice so bun encodes it as a PostgreSQL array literal in Set().
func pgArray(v []string) any { return pgdialect.Array(v) }
