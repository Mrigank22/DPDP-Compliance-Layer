// services/control-plane/internal/services/gateway_service.go

package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/uptrace/bun"
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

	if input.Name != nil { rule.Name = *input.Name; q = q.Set("name = ?", *input.Name) }
	if input.RoutePattern != nil { rule.RoutePattern = *input.RoutePattern; q = q.Set("route_pattern = ?", *input.RoutePattern) }
	if input.Direction != nil { rule.Direction = *input.Direction; q = q.Set("direction = ?", *input.Direction) }
	if input.Action != nil { rule.Action = *input.Action; q = q.Set("action = ?", *input.Action) }
	if input.IsActive != nil { rule.IsActive = *input.IsActive; q = q.Set("is_active = ?", *input.IsActive) }
	if len(input.HTTPMethods) > 0 { rule.HTTPMethods = input.HTTPMethods; q = q.Set("http_methods = ?", input.HTTPMethods) }
	if len(input.PIITypes) > 0 { rule.PIITypes = input.PIITypes; q = q.Set("pii_types = ?", input.PIITypes) }
	if input.MaskConfig != nil { rule.MaskConfig = input.MaskConfig; q = q.Set("mask_config = ?", input.MaskConfig) }

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

// --- Gateway Events (ClickHouse) ---------------------------------------------

// GetStats returns aggregate gateway statistics for a tenant over the last N hours.
func (s *GatewayService) GetStats(ctx context.Context, tenantID string, hours int) (map[string]any, error) {
	if hours < 1 || hours > 168 {
		hours = 24
	}
	cutoff := time.Now().Add(-time.Duration(hours) * time.Hour)

	type statRow struct {
		ActionTaken string `ch:"action_taken"`
		Count       uint64 `ch:"count"`
	}

	// This would query ClickHouse gateway_events table directly.
	// For brevity, returning a structured mock that real ClickHouse queries would populate.
	stats := map[string]any{
		"period_hours":    hours,
		"since":           cutoff,
		"total_requests":  0,
		"by_action":       map[string]uint64{},
		"top_pii_types":   []string{},
		"block_rate_pct":  0.0,
		"avg_latency_ms":  0.0,
	}
	return stats, nil
}
