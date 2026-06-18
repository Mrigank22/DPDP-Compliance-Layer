// services/control-plane/internal/services/gateway_service.go

package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// GatewayService manages gateway rules, data flows, and event analytics.
type GatewayService struct {
	pg  *bun.DB
	ch  *db.ClickHouseClient
	log *zap.Logger
}

// NewGatewayService creates a GatewayService.
func NewGatewayService(pg *bun.DB, ch *db.ClickHouseClient, log *zap.Logger) *GatewayService {
	return &GatewayService{pg: pg, ch: ch, log: log}
}

// --- Rules -------------------------------------------------------------------

// ListRules returns all gateway rules for a tenant.
func (s *GatewayService) ListRules(ctx context.Context, tenantID string) ([]*models.GatewayRule, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	var rules []*models.GatewayRule
	err := s.pg.NewSelect().Model(&rules).
		Where("gr.tenant_id = ?", tenantID).
		OrderExpr("gr.created_at DESC").
		Scan(ctx)
	return rules, err
}

// GetRuleByID returns a single gateway rule.
func (s *GatewayService) GetRuleByID(ctx context.Context, id, tenantID string) (*models.GatewayRule, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	rule := &models.GatewayRule{}
	err := s.pg.NewSelect().Model(rule).
		Where("gr.id = ? AND gr.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("gateway rule")
		}
		return nil, err
	}
	return rule, nil
}

// CreateRule inserts a new gateway rule.
func (s *GatewayService) CreateRule(ctx context.Context, tenantID string, input *models.CreateGatewayRuleInput) (*models.GatewayRule, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	direction := "both"
	if input.Direction != "" {
		direction = input.Direction
	}
	rule := &models.GatewayRule{
		TenantID:     tenantID,
		PolicyID:     input.PolicyID,
		Name:         input.Name,
		RoutePattern: input.RoutePattern,
		HTTPMethods:  input.HTTPMethods,
		Direction:    direction,
		Action:       input.Action,
		PIITypes:     input.PIITypes,
		MaskConfig:   input.MaskConfig,
		IsActive:     true,
	}
	if len(rule.HTTPMethods) == 0 {
		rule.HTTPMethods = []string{"*"}
	}
	if _, err := s.pg.NewInsert().Model(rule).Exec(ctx); err != nil {
		return nil, fmt.Errorf("insert gateway rule: %w", err)
	}
	return rule, nil
}

// UpdateRule applies partial updates to a gateway rule.
func (s *GatewayService) UpdateRule(ctx context.Context, id, tenantID string, input *models.UpdateGatewayRuleInput) (*models.GatewayRule, error) {
	rule, err := s.GetRuleByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	q := s.pg.NewUpdate().Model(rule).Where("id = ? AND tenant_id = ?", id, tenantID)

	if input.Name != nil {
		rule.Name = *input.Name
		q = q.Set("name = ?", *input.Name)
	}
	if input.RoutePattern != nil {
		rule.RoutePattern = *input.RoutePattern
		q = q.Set("route_pattern = ?", *input.RoutePattern)
	}
	if input.Direction != nil {
		rule.Direction = *input.Direction
		q = q.Set("direction = ?", *input.Direction)
	}
	if input.Action != nil {
		rule.Action = *input.Action
		q = q.Set("action = ?", *input.Action)
	}
	if input.IsActive != nil {
		rule.IsActive = *input.IsActive
		q = q.Set("is_active = ?", *input.IsActive)
	}
	if len(input.HTTPMethods) > 0 {
		rule.HTTPMethods = input.HTTPMethods
		q = q.Set("http_methods = ?", input.HTTPMethods)
	}
	if len(input.PIITypes) > 0 {
		rule.PIITypes = input.PIITypes
		q = q.Set("pii_types = ?", input.PIITypes)
	}
	if input.MaskConfig != nil {
		rule.MaskConfig = input.MaskConfig
		q = q.Set("mask_config = ?", input.MaskConfig)
	}

	if _, err := q.Exec(ctx); err != nil {
		return nil, err
	}
	return rule, nil
}

// DeleteRule removes a gateway rule.
func (s *GatewayService) DeleteRule(ctx context.Context, id, tenantID string) error {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return err
	}
	res, err := s.pg.NewDelete().Model((*models.GatewayRule)(nil)).
		Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrNotFound("gateway rule")
	}
	return nil
}

// ToggleRule flips the is_active flag on a rule.
func (s *GatewayService) ToggleRule(ctx context.Context, id, tenantID string) (*models.GatewayRule, error) {
	rule, err := s.GetRuleByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	newActive := !rule.IsActive
	isActive := &newActive
	return s.UpdateRule(ctx, id, tenantID, &models.UpdateGatewayRuleInput{IsActive: isActive})
}

// --- Data Flows --------------------------------------------------------------

// ListDataFlows returns all detected data flows for a tenant.
func (s *GatewayService) ListDataFlows(ctx context.Context, tenantID string) ([]*models.DataFlow, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	var flows []*models.DataFlow
	err := s.pg.NewSelect().Model(&flows).
		Where("df.tenant_id = ?", tenantID).
		OrderExpr("df.last_seen_at DESC").
		Scan(ctx)
	return flows, err
}

// ApproveDataFlow marks a data flow as approved.
func (s *GatewayService) ApproveDataFlow(ctx context.Context, id, tenantID, userID string) (*models.DataFlow, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	flow := &models.DataFlow{}
	if err := s.pg.NewSelect().Model(flow).
		Where("id = ? AND tenant_id = ?", id, tenantID).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("data flow")
		}
		return nil, err
	}
	_, err := s.pg.NewUpdate().Model(flow).
		Set("is_approved = true").
		Set("approved_by = ?", userID).
		Where("id = ?", id).Exec(ctx)
	if err != nil {
		return nil, err
	}
	flow.IsApproved = true
	flow.ApprovedBy = &userID
	return flow, nil
}

// UpsertDataFlow records (or refreshes) a detected egress data flow. Called by
// the enforcement gateway when PII is observed leaving the estate. It dedups on
// (tenant_id, destination_url): an existing flow has its event count and last
// seen time advanced and any newly-observed PII types merged in.
func (s *GatewayService) UpsertDataFlow(ctx context.Context, tenantID, destURL, destType string, piiTypes []string) (*models.DataFlow, error) {
	if destURL == "" {
		return nil, ErrInvalidInput("destination_url is required")
	}
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}

	existing := &models.DataFlow{}
	err := s.pg.NewSelect().Model(existing).
		Where("tenant_id = ? AND destination_url = ?", tenantID, destURL).
		Limit(1).Scan(ctx)
	if err == nil {
		merged := mergeStrings(existing.PIITypesInvolved, piiTypes)
		_, uerr := s.pg.NewUpdate().Model((*models.DataFlow)(nil)).
			Set("event_count = event_count + 1").
			Set("last_seen_at = now()").
			Set("pii_types_involved = ?", pgdialect.Array(merged)).
			Where("id = ?", existing.ID).
			Exec(ctx)
		if uerr != nil {
			return nil, uerr
		}
		existing.EventCount++
		existing.PIITypesInvolved = merged
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	flow := &models.DataFlow{
		TenantID:         tenantID,
		DestinationURL:   destURL,
		DestinationType:  destType,
		PIITypesInvolved: piiTypes,
		EventCount:       1,
	}
	if _, ierr := s.pg.NewInsert().Model(flow).Exec(ctx); ierr != nil {
		return nil, fmt.Errorf("insert data flow: %w", ierr)
	}
	return flow, nil
}

// mergeStrings returns the union of two string slices, preserving order.
func mergeStrings(a, b []string) []string {
	seen := make(map[string]bool, len(a)+len(b))
	out := make([]string, 0, len(a)+len(b))
	for _, s := range append(append([]string{}, a...), b...) {
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// --- Gateway Events (ClickHouse) ---------------------------------------------

// ListEvents returns paginated gateway interception events for a tenant.
func (s *GatewayService) ListEvents(ctx context.Context, tenantID string, filter *models.GatewayEventFilter) ([]*models.GatewayEvent, int64, error) {
	events, total, err := s.ch.QueryGatewayEvents(ctx, tenantID, filter)
	if err != nil {
		s.log.Error("QueryGatewayEvents failed",
			zap.String("tenant_id", tenantID),
			zap.Error(err),
		)
	}
	return events, total, err
}

// GetStats returns aggregate gateway statistics for a tenant over the last N hours.
func (s *GatewayService) GetStats(ctx context.Context, tenantID string, hours int) (*models.GatewayStatsResponse, error) {
	if hours < 1 || hours > 168 {
		hours = 24
	}
	stats, err := s.ch.QueryGatewayStats(ctx, tenantID, hours)
	if err != nil {
		// Degrade gracefully: if ClickHouse is unavailable, return an empty,
		// well-formed stats object so the dashboard still renders.
		s.log.Warn("gateway stats query failed; returning empty stats",
			zap.String("tenant_id", tenantID), zap.Error(err))
		return &models.GatewayStatsResponse{
			PeriodHours: hours,
			ByAction:    map[string]int64{},
			ByPIIType:   map[string]int64{},
			Timeline:    []models.GatewayTimeBin{},
		}, nil
	}
	return stats, nil
}
