// services/control-plane/internal/services/policy_service.go

package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// PolicyService manages governance policies and their versioned history.
type PolicyService struct {
	pg  *bun.DB
	ch  *db.ClickHouseClient
	log *zap.Logger
}

// NewPolicyService creates a PolicyService.
func NewPolicyService(pg *bun.DB, ch *db.ClickHouseClient, log *zap.Logger) *PolicyService {
	return &PolicyService{pg: pg, ch: ch, log: log}
}

// List returns paginated policies for a tenant.
func (s *PolicyService) List(ctx context.Context, tenantID string, page, pageSize int) ([]*models.Policy, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, 0, err
	}
	var policies []*models.Policy
	total, err := s.pg.NewSelect().Model(&policies).
		Where("p.tenant_id = ?", tenantID).
		OrderExpr("p.priority ASC, p.created_at DESC").
		Limit(pageSize).Offset((page-1)*pageSize).
		ScanAndCount(ctx, &policies)
	return policies, int64(total), err
}

// GetByID returns a policy with its version history.
func (s *PolicyService) GetByID(ctx context.Context, id, tenantID string) (*models.Policy, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	policy := &models.Policy{}
	err := s.pg.NewSelect().Model(policy).
		Relation("Versions", func(q *bun.SelectQuery) *bun.SelectQuery {
			return q.OrderExpr("version DESC").Limit(10)
		}).
		Where("p.id = ? AND p.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("policy")
		}
		return nil, err
	}
	return policy, nil
}

// Create inserts a new policy and writes version 1 to policy_versions.
func (s *PolicyService) Create(ctx context.Context, tenantID, userID string, input *models.CreatePolicyInput) (*models.Policy, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}

	status := models.PolicyStatusDraft
	if input.Status != "" {
		status = input.Status
	}
	enforceMode := models.EnforcementAlert
	if input.EnforcementMode != "" {
		enforceMode = input.EnforcementMode
	}
	priority := 100
	if input.Priority > 0 {
		priority = input.Priority
	}

	policy := &models.Policy{
		TenantID:        tenantID,
		Name:            input.Name,
		Description:     input.Description,
		PolicyType:      input.PolicyType,
		Status:          status,
		EnforcementMode: enforceMode,
		Priority:        priority,
		Rules:           input.Rules,
		AppliesTo:       input.AppliesTo,
		CreatedBy:       &userID,
		Version:         1,
	}

	return policy, s.pg.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(policy).Exec(ctx); err != nil {
			return fmt.Errorf("insert policy: %w", err)
		}
		ver := &models.PolicyVersion{
			PolicyID:      policy.ID,
			TenantID:      tenantID,
			Version:       1,
			Rules:         input.Rules,
			ChangedBy:     &userID,
			ChangeSummary: "Initial version",
		}
		if _, err := tx.NewInsert().Model(ver).Exec(ctx); err != nil {
			return fmt.Errorf("insert policy version: %w", err)
		}
		if err := s.upsertGatewayRuleForPolicy(ctx, tx, policy); err != nil {
			return fmt.Errorf("sync gateway rule: %w", err)
		}
		go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionPolicyCreated, "policy", policy.ID)
		return nil
	})
}

// Update applies partial updates and saves a new version snapshot.
func (s *PolicyService) Update(ctx context.Context, id, tenantID, userID string, input *models.UpdatePolicyInput) (*models.Policy, error) {
	policy, err := s.GetByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}

	return policy, s.pg.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		q := tx.NewUpdate().Model(policy).Where("id = ? AND tenant_id = ?", id, tenantID)

		if input.Name != nil {
			policy.Name = *input.Name
			q = q.Set("name = ?", *input.Name)
		}
		if input.Description != nil {
			policy.Description = *input.Description
			q = q.Set("description = ?", *input.Description)
		}
		if input.Status != nil {
			policy.Status = *input.Status
			q = q.Set("status = ?", *input.Status)
		}
		if input.EnforcementMode != nil {
			policy.EnforcementMode = *input.EnforcementMode
			q = q.Set("enforcement_mode = ?", *input.EnforcementMode)
		}
		if input.Priority != nil {
			policy.Priority = *input.Priority
			q = q.Set("priority = ?", *input.Priority)
		}
		if input.AppliesTo != nil {
			policy.AppliesTo = input.AppliesTo
			q = q.Set("applies_to = ?", input.AppliesTo)
		}

		rulesChanged := input.Rules != nil
		if rulesChanged {
			policy.Rules = input.Rules
			policy.Version++
			q = q.Set("rules = ?", input.Rules).Set("version = ?", policy.Version)
		}

		if _, err := q.Exec(ctx); err != nil {
			return err
		}

		// Write version snapshot only when rules change
		if rulesChanged {
			ver := &models.PolicyVersion{
				PolicyID:      id,
				TenantID:      tenantID,
				Version:       policy.Version,
				Rules:         input.Rules,
				ChangedBy:     &userID,
				ChangeSummary: input.ChangeSummary,
			}
			if _, err := tx.NewInsert().Model(ver).Exec(ctx); err != nil {
				return err
			}
		}

		// Project the policy onto its linked gateway rule so the change takes
		// effect on live traffic.
		if err := s.upsertGatewayRuleForPolicy(ctx, tx, policy); err != nil {
			return fmt.Errorf("sync gateway rule: %w", err)
		}

		go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionPolicyUpdated, "policy", id)
		return nil
	})
}

// Delete soft-deletes a policy by setting status=inactive and removes its
// linked gateway rule, so the gateway reverts that traffic to normal.
func (s *PolicyService) Delete(ctx context.Context, id, tenantID, userID string) error {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return err
	}
	if err := s.pg.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		res, err := tx.NewUpdate().Model((*models.Policy)(nil)).
			Set("status = ?", models.PolicyStatusInactive).
			Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx)
		if err != nil {
			return err
		}
		if rows, _ := res.RowsAffected(); rows == 0 {
			return ErrNotFound("policy")
		}
		return s.deleteGatewayRuleForPolicy(ctx, tx, id, tenantID)
	}); err != nil {
		return err
	}
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionPolicyDeleted, "policy", id)
	return nil
}

// SetStatus activates or deactivates a policy and re-syncs its gateway rule.
func (s *PolicyService) SetStatus(ctx context.Context, id, tenantID, userID, status string) error {
	policy, err := s.GetByID(ctx, id, tenantID)
	if err != nil {
		return err
	}
	policy.Status = status
	return s.pg.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		res, err := tx.NewUpdate().Model((*models.Policy)(nil)).
			Set("status = ?", status).
			Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx)
		if err != nil {
			return err
		}
		if rows, _ := res.RowsAffected(); rows == 0 {
			return ErrNotFound("policy")
		}
		return s.upsertGatewayRuleForPolicy(ctx, tx, policy)
	})
}

// ListVersions returns all saved versions for a policy.
func (s *PolicyService) ListVersions(ctx context.Context, id, tenantID string) ([]*models.PolicyVersion, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	var versions []*models.PolicyVersion
	err := s.pg.NewSelect().Model(&versions).
		Where("policy_id = ? AND tenant_id = ?", id, tenantID).
		OrderExpr("version DESC").Scan(ctx)
	return versions, err
}

// Rollback reverts a policy's rules to a specific historical version.
func (s *PolicyService) Rollback(ctx context.Context, id, tenantID, userID string, targetVersion int) (*models.Policy, error) {
	version := &models.PolicyVersion{}
	err := s.pg.NewSelect().Model(version).
		Where("policy_id = ? AND tenant_id = ? AND version = ?", id, tenantID, targetVersion).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound(fmt.Sprintf("policy version %d", targetVersion))
		}
		return nil, err
	}

	rollbackMsg := fmt.Sprintf("Rolled back to version %d", targetVersion)
	return s.Update(ctx, id, tenantID, userID, &models.UpdatePolicyInput{
		Rules:         version.Rules,
		ChangeSummary: rollbackMsg,
	})
}

// GetTemplates returns the built-in DPDP/RBI/IRDAI/LLM policy templates.
func (s *PolicyService) GetTemplates() []*PolicyTemplate {
	return builtInTemplates()
}

// ApplyTemplate creates a new policy from a named template.
func (s *PolicyService) ApplyTemplate(ctx context.Context, templateID, tenantID, userID string) (*models.Policy, error) {
	tpl := findTemplate(templateID)
	if tpl == nil {
		return nil, ErrNotFound("template")
	}
	return s.Create(ctx, tenantID, userID, tpl.toCreateInput())
}

func (s *PolicyService) writeAudit(ctx context.Context, tenantID, userID, action, resourceType, resourceID string) {
	entry := &models.AuditLog{
		ID: GenerateID(), TenantID: tenantID, UserID: userID,
		Action: action, ResourceType: resourceType, ResourceID: resourceID,
		Timestamp: time.Now(),
	}
	if err := s.ch.WriteAuditLog(ctx, entry); err != nil {
		s.log.Warn("audit write failed", zap.Error(err))
	}
}

// ---- Policy → Gateway rule projection ---------------------------------------
//
// The enforcement gateway polls GET /api/v1/gateway/rules and applies any active
// gateway_rules. To make policies actually enforceable, every policy is projected
// onto a single gateway_rules row (linked by policy_id). The projection honours
// the policy's status and enforcement mode:
//
//   enforce  + active        → rule active, action = the policy's action
//   alert    + active        → rule active, action = "alert" (observe only)
//   audit_only OR not active → rule inactive (no live enforcement)
//
// Deleting a policy removes its gateway rule, so the gateway reverts to normal.

// gatewayPIIAliases maps policy PII identifiers onto the gateway detector's names.
var gatewayPIIAliases = map[string]string{
	"CARD_NUMBER": "CREDIT_CARD",
	"CREDITCARD":  "CREDIT_CARD",
	"CARD":        "CREDIT_CARD",
}

// gatewayValidActions are the actions the enforcement gateway can apply.
var gatewayValidActions = map[string]bool{
	"mask": true, "redact": true, "block": true, "tokenize": true,
	"alert": true, "allow": true, "encrypt": true, "hash": true,
}

// policyToGatewaySpec translates a policy's DSL into gateway-rule fields.
func policyToGatewaySpec(p *models.Policy) (action string, piiTypes []string, direction string, maskConfig map[string]any) {
	direction = "both"
	maskConfig = map[string]any{}
	actionType := models.GatewayActionAlert

	if p.Rules != nil {
		if a, ok := p.Rules["action"].(map[string]any); ok {
			if t, ok := a["type"].(string); ok && t != "" {
				actionType = strings.ToLower(strings.TrimSpace(t))
			}
			if cfg, ok := a["config"].(map[string]any); ok && cfg != nil {
				maskConfig = cfg
			}
		}

		var rawPII []string
		preds := extractPredicates(p.Rules["predicates"])
		if len(preds) == 0 {
			// The visual builder nests predicates under "conditions".
			if cond, ok := p.Rules["conditions"].(map[string]any); ok {
				preds = extractPredicates(cond["predicates"])
			}
		}
		for _, pm := range preds {
			field, _ := pm["field"].(string)
			switch field {
			case "pii_type":
				rawPII = append(rawPII, toStrings(pm["value"])...)
			case "direction":
				if v, ok := pm["value"].(string); ok {
					switch v {
					case "request", "response", "both":
						direction = v
					}
				}
			}
		}
		piiTypes = normalizePIITypes(rawPII)
	}

	// Enforcement mode governs the effective action.
	switch p.EnforcementMode {
	case models.EnforcementEnforce:
		if gatewayValidActions[actionType] {
			action = actionType
		} else {
			action = models.GatewayActionAlert
		}
	default: // alert | audit_only → observe only
		action = models.GatewayActionAlert
	}
	return action, piiTypes, direction, maskConfig
}

// policyRuleActive reports whether the projected gateway rule should be live.
func policyRuleActive(p *models.Policy) bool {
	return p.Status == models.PolicyStatusActive && p.EnforcementMode != models.EnforcementAuditOnly
}

// upsertGatewayRuleForPolicy creates or updates the gateway rule linked to a policy.
func (s *PolicyService) upsertGatewayRuleForPolicy(ctx context.Context, idb bun.IDB, p *models.Policy) error {
	action, piiTypes, direction, maskConfig := policyToGatewaySpec(p)
	active := policyRuleActive(p)

	existing := &models.GatewayRule{}
	err := idb.NewSelect().Model(existing).
		Where("policy_id = ? AND tenant_id = ?", p.ID, p.TenantID).
		Limit(1).Scan(ctx)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		policyID := p.ID
		rule := &models.GatewayRule{
			TenantID:     p.TenantID,
			PolicyID:     &policyID,
			Name:         p.Name,
			RoutePattern: "*",
			HTTPMethods:  []string{"*"},
			Direction:    direction,
			Action:       action,
			PIITypes:     piiTypes,
			MaskConfig:   maskConfig,
			IsActive:     active,
		}
		_, insErr := idb.NewInsert().Model(rule).Exec(ctx)
		return insErr
	}

	existing.Name = p.Name
	existing.RoutePattern = "*"
	existing.HTTPMethods = []string{"*"}
	existing.Direction = direction
	existing.Action = action
	existing.PIITypes = piiTypes
	existing.MaskConfig = maskConfig
	existing.IsActive = active
	existing.UpdatedAt = time.Now()
	_, updErr := idb.NewUpdate().Model(existing).
		Column("name", "route_pattern", "http_methods", "direction", "action", "pii_types", "mask_config", "is_active", "updated_at").
		WherePK().Exec(ctx)
	return updErr
}

// deleteGatewayRuleForPolicy removes the gateway rule linked to a policy (if any).
func (s *PolicyService) deleteGatewayRuleForPolicy(ctx context.Context, idb bun.IDB, policyID, tenantID string) error {
	_, err := idb.NewDelete().Model((*models.GatewayRule)(nil)).
		Where("policy_id = ? AND tenant_id = ?", policyID, tenantID).Exec(ctx)
	return err
}

// extractPredicates normalises the predicates field, which may arrive as
// []any (from JSON / JSONB) or []map[string]any (from in-memory templates).
func extractPredicates(raw any) []map[string]any {
	switch v := raw.(type) {
	case []map[string]any:
		return v
	case []any:
		out := make([]map[string]any, 0, len(v))
		for _, e := range v {
			if m, ok := e.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	default:
		return nil
	}
}

// toStrings coerces a DSL value (string, []string or []any) into []string.
func toStrings(v any) []string {
	switch val := v.(type) {
	case string:
		return []string{val}
	case []string:
		return val
	case []any:
		out := make([]string, 0, len(val))
		for _, item := range val {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

// normalizePIITypes upper-cases, de-duplicates and alias-maps PII type names.
func normalizePIITypes(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, t := range in {
		u := strings.ToUpper(strings.TrimSpace(t))
		if u == "" {
			continue
		}
		if alias, ok := gatewayPIIAliases[u]; ok {
			u = alias
		}
		if !seen[u] {
			seen[u] = true
			out = append(out, u)
		}
	}
	return out
}

// ---- Policy Templates -------------------------------------------------------

// PolicyTemplate is a built-in governance policy preset.
type PolicyTemplate struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Pack        string         `json:"pack"`
	PolicyType  string         `json:"policy_type"`
	Rules       map[string]any `json:"rules"`
	AppliesTo   map[string]any `json:"applies_to"`
}

func (t *PolicyTemplate) toCreateInput() *models.CreatePolicyInput {
	return &models.CreatePolicyInput{
		Name: t.Name, Description: t.Description,
		PolicyType: t.PolicyType, Status: models.PolicyStatusDraft,
		EnforcementMode: models.EnforcementAlert,
		Rules:           t.Rules, AppliesTo: t.AppliesTo,
	}
}

func findTemplate(id string) *PolicyTemplate {
	for _, t := range builtInTemplates() {
		if t.ID == id {
			return t
		}
	}
	return nil
}

func builtInTemplates() []*PolicyTemplate {
	return []*PolicyTemplate{
		{
			ID: "DPDP-001", Pack: "dpdp", PolicyType: models.PolicyTypeDataMasking,
			Name:        "Mask Indian PII in API Responses",
			Description: "Masks Aadhaar, PAN, phone numbers, and email addresses in all API responses sent to unapproved destinations.",
			Rules: map[string]any{
				"operator": "AND",
				"predicates": []map[string]any{
					{"field": "pii_type", "operator": "in", "value": []string{"AADHAAR", "PAN", "PHONE", "EMAIL"}},
					{"field": "direction", "operator": "eq", "value": "response"},
				},
				"action": map[string]any{
					"type":   "mask",
					"config": map[string]any{"strategy": "partial", "preserve_last": 4, "mask_char": "*"},
				},
			},
		},
		{
			ID: "DPDP-002", Pack: "dpdp", PolicyType: models.PolicyTypeTransferControl,
			Name:        "Block Cross-Border Data Transfer",
			Description: "Blocks personal data transfers to endpoints outside approved countries per DPDP Act §16.",
			Rules: map[string]any{
				"operator": "AND",
				"predicates": []map[string]any{
					{"field": "destination.country", "operator": "not_in", "value": []string{"IN"}},
					{"field": "pii_type", "operator": "exists", "value": true},
				},
				"action": map[string]any{"type": "block", "config": map[string]any{"message": "Cross-border transfer blocked — DPDP Act §16"}},
			},
		},
		{
			ID: "DPDP-003", Pack: "dpdp", PolicyType: models.PolicyTypeLLMGuard,
			Name:        "Alert on LLM Prompts Containing Personal Data",
			Description: "Fires an alert whenever personal data is detected in prompts sent to external LLM APIs.",
			Rules: map[string]any{
				"operator": "AND",
				"predicates": []map[string]any{
					{"field": "destination.type", "operator": "eq", "value": "llm"},
					{"field": "pii_type", "operator": "exists", "value": true},
					{"field": "direction", "operator": "eq", "value": "request"},
				},
				"action": map[string]any{"type": "alert", "config": map[string]any{"severity": "high"}},
			},
		},
		{
			ID: "DPDP-004", Pack: "dpdp", PolicyType: models.PolicyTypeDataMasking,
			Name:        "Redact PII from Application Logs",
			Description: "Redacts personal data fields from log-ingestion endpoints.",
			Rules: map[string]any{
				"predicates": []map[string]any{
					{"field": "pii_type", "operator": "in", "value": []string{"AADHAAR", "PAN", "PHONE", "EMAIL", "BANK_ACCOUNT"}},
					{"field": "destination.type", "operator": "eq", "value": "logging"},
				},
				"action": map[string]any{"type": "redact"},
			},
		},
		{
			ID: "DPDP-006", Pack: "dpdp", PolicyType: models.PolicyTypeBreachResponse,
			Name:        "Alert on Breach Indicators",
			Description: "Alerts when mass data export patterns (>1000 records) or unusual query volumes are detected.",
			Rules: map[string]any{
				"predicates": []map[string]any{
					{"field": "response.record_count", "operator": "greater_than", "value": 1000},
					{"field": "pii_type", "operator": "exists", "value": true},
				},
				"action": map[string]any{"type": "alert", "config": map[string]any{"severity": "critical"}},
			},
		},
		{
			ID: "RBI-001", Pack: "rbi", PolicyType: models.PolicyTypeTransferControl,
			Name:        "Block Payment Data Leaving India",
			Description: "Blocks all payment and financial data from leaving Indian infrastructure per RBI data localisation guidelines.",
			Rules: map[string]any{
				"predicates": []map[string]any{
					{"field": "pii_type", "operator": "in", "value": []string{"BANK_ACCOUNT", "CARD_NUMBER", "UPI"}},
					{"field": "destination.country", "operator": "not_in", "value": []string{"IN"}},
				},
				"action": map[string]any{"type": "block", "config": map[string]any{"message": "RBI data localisation — payment data must remain in India"}},
			},
		},
		{
			ID: "RBI-003", Pack: "rbi", PolicyType: models.PolicyTypeDataMasking,
			Name:        "Mask Card Numbers (PCI-DSS)",
			Description: "Masks credit/debit card numbers in all API traffic, preserving only the last 4 digits.",
			Rules: map[string]any{
				"predicates": []map[string]any{
					{"field": "pii_type", "operator": "eq", "value": "CARD_NUMBER"},
				},
				"action": map[string]any{
					"type":   "mask",
					"config": map[string]any{"strategy": "partial", "preserve_last": 4, "mask_char": "*", "format": "####-####-####-XXXX"},
				},
			},
		},
		{
			ID: "LLM-001", Pack: "llm", PolicyType: models.PolicyTypeLLMGuard,
			Name:        "Redact PII Before Sending to External LLMs",
			Description: "Scans and redacts all PII from prompts before forwarding to OpenAI, Anthropic, Google, and other LLM providers.",
			Rules: map[string]any{
				"predicates": []map[string]any{
					{"field": "destination.type", "operator": "eq", "value": "llm"},
					{"field": "direction", "operator": "eq", "value": "request"},
					{"field": "pii_type", "operator": "exists", "value": true},
				},
				"action": map[string]any{"type": "redact"},
			},
		},
		{
			ID: "LLM-003", Pack: "llm", PolicyType: models.PolicyTypeLLMGuard,
			Name:        "Block LLM Calls Containing Sensitive Financial Data",
			Description: "Blocks requests to LLM APIs that contain bank account numbers, card details, or UPI IDs.",
			Rules: map[string]any{
				"predicates": []map[string]any{
					{"field": "destination.type", "operator": "eq", "value": "llm"},
					{"field": "pii_type", "operator": "in", "value": []string{"BANK_ACCOUNT", "CARD_NUMBER", "UPI"}},
				},
				"action": map[string]any{"type": "block", "config": map[string]any{"message": "Financial data cannot be sent to external LLMs"}},
			},
		},
		{
			ID: "SEC-001", Pack: "security", PolicyType: models.PolicyTypeBreachResponse,
			Name:        "Alert on Bulk Data Exports",
			Description: "Fires a critical alert when any single API response contains more than 1000 records with PII.",
			Rules: map[string]any{
				"predicates": []map[string]any{
					{"field": "response.record_count", "operator": "greater_than", "value": 1000},
					{"field": "pii_type", "operator": "exists", "value": true},
				},
				"action": map[string]any{"type": "alert", "config": map[string]any{"severity": "critical"}},
			},
		},
	}
}
