// services/control-plane/internal/services/ai_governance_service.go

package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// AIGovernanceService manages the AI system registry + model catalog and computes
// shadow-AI discovery from observed gateway traffic.
type AIGovernanceService struct {
	pg  *bun.DB
	ch  *db.ClickHouseClient
	log *zap.Logger
}

func NewAIGovernanceService(pg *bun.DB, ch *db.ClickHouseClient, log *zap.Logger) *AIGovernanceService {
	return &AIGovernanceService{pg: pg, ch: ch, log: log}
}

// ---- AI systems -------------------------------------------------------------

// ListSystems returns the tenant's registered AI systems with their models.
func (s *AIGovernanceService) ListSystems(ctx context.Context, tenantID string) ([]*models.AISystem, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	var systems []*models.AISystem
	err := s.pg.NewSelect().Model(&systems).
		Relation("Models").
		Where("ais.tenant_id = ?", tenantID).
		OrderExpr("ais.created_at DESC").
		Scan(ctx)
	if systems == nil {
		systems = []*models.AISystem{}
	}
	return systems, err
}

// GetSystem returns a single AI system with its models.
func (s *AIGovernanceService) GetSystem(ctx context.Context, id, tenantID string) (*models.AISystem, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	sys := &models.AISystem{}
	err := s.pg.NewSelect().Model(sys).
		Relation("Models").
		Where("ais.id = ? AND ais.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("ai system")
		}
		return nil, err
	}
	return sys, nil
}

// CreateSystem registers a new AI system.
func (s *AIGovernanceService) CreateSystem(ctx context.Context, tenantID, userID string, in *models.CreateAISystemInput) (*models.AISystem, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, ErrInvalidInput("name is required")
	}
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	if err := s.ensureNameAvailable(ctx, tenantID, name, ""); err != nil {
		return nil, err
	}

	sys := &models.AISystem{
		TenantID:       tenantID,
		Name:           name,
		Description:    strings.TrimSpace(in.Description),
		Owner:          strings.TrimSpace(in.Owner),
		LifecycleStage: orDefault(in.LifecycleStage, models.AISystemStageProposed),
		RiskTier:       orDefault(in.RiskTier, models.AIRiskTierUnassessed),
		Providers:      cleanList(in.Providers),
		Endpoints:      cleanList(in.Endpoints),
		Status:         "active",
		Tags:           in.Tags,
		CreatedBy:      &userID,
	}
	if sys.Tags == nil {
		sys.Tags = map[string]any{}
	}
	if _, err := s.pg.NewInsert().Model(sys).Returning("*").Exec(ctx); err != nil {
		return nil, fmt.Errorf("create ai system: %w", err)
	}
	return s.GetSystem(ctx, sys.ID, tenantID)
}

// UpdateSystem patches an AI system's mutable fields.
func (s *AIGovernanceService) UpdateSystem(ctx context.Context, id, tenantID string, in *models.UpdateAISystemInput) (*models.AISystem, error) {
	sys, err := s.GetSystem(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, ErrInvalidInput("name cannot be empty")
		}
		if err := s.ensureNameAvailable(ctx, tenantID, name, id); err != nil {
			return nil, err
		}
		sys.Name = name
	}
	if in.Description != nil {
		sys.Description = strings.TrimSpace(*in.Description)
	}
	if in.Owner != nil {
		sys.Owner = strings.TrimSpace(*in.Owner)
	}
	if in.LifecycleStage != nil {
		sys.LifecycleStage = *in.LifecycleStage
	}
	if in.RiskTier != nil {
		sys.RiskTier = *in.RiskTier
	}
	if in.Status != nil {
		sys.Status = *in.Status
	}
	if in.Providers != nil {
		sys.Providers = cleanList(in.Providers)
	}
	if in.Endpoints != nil {
		sys.Endpoints = cleanList(in.Endpoints)
	}
	if in.Tags != nil {
		sys.Tags = in.Tags
	}

	_, err = s.pg.NewUpdate().Model(sys).
		Column("name", "description", "owner", "lifecycle_stage", "risk_tier",
			"status", "providers", "endpoints", "tags").
		Where("ais.id = ? AND ais.tenant_id = ?", id, tenantID).
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("update ai system: %w", err)
	}
	return s.GetSystem(ctx, id, tenantID)
}

// DeleteSystem removes an AI system. Linked models are detached (ai_system_id
// set to NULL) by the foreign-key ON DELETE SET NULL rule.
func (s *AIGovernanceService) DeleteSystem(ctx context.Context, id, tenantID string) error {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return err
	}
	res, err := s.pg.NewDelete().Model((*models.AISystem)(nil)).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete ai system: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound("ai system")
	}
	return nil
}

// ---- AI models --------------------------------------------------------------

// ListModels returns the tenant's model catalog.
func (s *AIGovernanceService) ListModels(ctx context.Context, tenantID string) ([]*models.AIModel, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	var list []*models.AIModel
	err := s.pg.NewSelect().Model(&list).
		Where("aim.tenant_id = ?", tenantID).
		OrderExpr("aim.provider ASC, aim.model ASC").
		Scan(ctx)
	if list == nil {
		list = []*models.AIModel{}
	}
	return list, err
}

// ---- Discovery --------------------------------------------------------------

// Discover aggregates observed LLM traffic and flags models not present in the
// catalog as shadow AI.
func (s *AIGovernanceService) Discover(ctx context.Context, tenantID string, hours int) (*models.AIDiscoveryResponse, error) {
	rows, err := s.ch.QueryAIDiscovery(ctx, tenantID, hours)
	if err != nil {
		// ClickHouse may be unavailable; return an empty (not failed) view.
		s.log.Warn("ai discovery query failed", zap.Error(err))
		rows = []*models.AIDiscoveryRow{}
	}

	// Build the registered (provider|model) -> system map from the catalog.
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	var catalog []*models.AIModel
	if err := s.pg.NewSelect().Model(&catalog).
		Where("aim.tenant_id = ?", tenantID).Scan(ctx); err != nil {
		return nil, fmt.Errorf("load ai catalog: %w", err)
	}
	regMap := make(map[string]*string, len(catalog))
	for _, m := range catalog {
		regMap[modelKey(m.Provider, m.Model)] = m.AISystemID
	}

	modelSeen := map[string]bool{}
	registeredSeen := map[string]bool{}
	providerSeen := map[string]bool{}
	for _, r := range rows {
		if r.PIITypes == nil {
			r.PIITypes = []string{}
		}
		key := modelKey(r.Provider, r.Model)
		modelSeen[key] = true
		if r.Provider != "" {
			providerSeen[r.Provider] = true
		}
		if sysID, ok := regMap[key]; ok {
			r.Registered = true
			r.AISystemID = sysID
			registeredSeen[key] = true
		}
	}

	resp := &models.AIDiscoveryResponse{
		Rows:             rows,
		TotalModels:      len(modelSeen),
		RegisteredModels: len(registeredSeen),
		ShadowModels:     len(modelSeen) - len(registeredSeen),
		ProviderCount:    len(providerSeen),
		PeriodHours:      normalizeHours(hours),
	}
	return resp, nil
}

// Promote registers a discovered (provider, model) as a governed AI system,
// creating the system and linking the model into the catalog.
func (s *AIGovernanceService) Promote(ctx context.Context, tenantID, userID string, in *models.PromoteAIInput) (*models.AISystem, error) {
	provider := strings.TrimSpace(in.Provider)
	model := strings.TrimSpace(in.Model)
	name := strings.TrimSpace(in.Name)
	if provider == "" || model == "" {
		return nil, ErrInvalidInput("provider and model are required")
	}
	if name == "" {
		return nil, ErrInvalidInput("name is required")
	}
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	if err := s.ensureNameAvailable(ctx, tenantID, name, ""); err != nil {
		return nil, err
	}

	endpoints := []string{}
	if ep := strings.TrimSpace(in.Endpoint); ep != "" {
		endpoints = []string{ep}
	}

	sys := &models.AISystem{
		TenantID:       tenantID,
		Name:           name,
		Description:    strings.TrimSpace(in.Description),
		Owner:          strings.TrimSpace(in.Owner),
		LifecycleStage: models.AISystemStageUnderReview,
		RiskTier:       models.AIRiskTierUnassessed,
		Providers:      []string{provider},
		Endpoints:      endpoints,
		Status:         "active",
		Tags:           map[string]any{},
		CreatedBy:      &userID,
	}
	if _, err := s.pg.NewInsert().Model(sys).Returning("*").Exec(ctx); err != nil {
		return nil, fmt.Errorf("promote: create system: %w", err)
	}

	// Upsert the model into the catalog, linked to the new system.
	now := time.Now()
	m := &models.AIModel{
		TenantID:    tenantID,
		AISystemID:  &sys.ID,
		Provider:    provider,
		Model:       model,
		DisplayName: model,
		Source:      models.AIModelSourceRegistered,
		LastSeenAt:  &now,
	}
	_, err := s.pg.NewInsert().Model(m).
		On("CONFLICT (tenant_id, provider, model) DO UPDATE").
		Set("ai_system_id = EXCLUDED.ai_system_id").
		Set("source = 'registered'").
		Set("updated_at = now()").
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("promote: link model: %w", err)
	}
	return s.GetSystem(ctx, sys.ID, tenantID)
}

// ---- Usage & cost -----------------------------------------------------------

// Usage aggregates LLM token usage and estimated cost over the last N hours,
// broken down by model and by calling application.
func (s *AIGovernanceService) Usage(ctx context.Context, tenantID string, hours int) (*models.AIUsageResponse, error) {
	groups, timeline, err := s.ch.QueryAIUsage(ctx, tenantID, hours)
	if err != nil {
		s.log.Warn("ai usage query failed", zap.Error(err))
		groups, timeline = nil, nil
	}

	resp := &models.AIUsageResponse{
		PeriodHours: normalizeHours(hours),
		Timeline:    timeline,
		ByModel:     []*models.AIUsageModelRow{},
		ByApp:       []*models.AIUsageAppRow{},
	}
	if resp.Timeline == nil {
		resp.Timeline = []models.AIUsageTimeBin{}
	}

	byModel := map[string]*models.AIUsageModelRow{}
	byApp := map[string]*models.AIUsageAppRow{}

	for _, g := range groups {
		cost, priced := estimateCostUSD(g.Model, g.PromptTokens, g.CompletionTokens)

		resp.TotalCalls += g.Calls
		resp.PromptTokens += g.PromptTokens
		resp.CompletionTokens += g.CompletionTokens
		resp.TotalTokens += g.TotalTokens
		resp.EstimatedCostUSD += cost

		mk := modelKey(g.Provider, g.Model)
		mr := byModel[mk]
		if mr == nil {
			mr = &models.AIUsageModelRow{Provider: g.Provider, Model: g.Model, Priced: priced}
			byModel[mk] = mr
		}
		mr.Calls += g.Calls
		mr.PromptTokens += g.PromptTokens
		mr.CompletionTokens += g.CompletionTokens
		mr.TotalTokens += g.TotalTokens
		mr.EstimatedCostUSD += cost

		app := g.App
		if app == "" {
			app = "unattributed"
		}
		ar := byApp[app]
		if ar == nil {
			ar = &models.AIUsageAppRow{App: app}
			byApp[app] = ar
		}
		ar.Calls += g.Calls
		ar.TotalTokens += g.TotalTokens
		ar.EstimatedCostUSD += cost
	}

	for _, mr := range byModel {
		mr.EstimatedCostUSD = round4(mr.EstimatedCostUSD)
		resp.ByModel = append(resp.ByModel, mr)
	}
	for _, ar := range byApp {
		ar.EstimatedCostUSD = round4(ar.EstimatedCostUSD)
		resp.ByApp = append(resp.ByApp, ar)
	}
	sort.Slice(resp.ByModel, func(i, j int) bool { return resp.ByModel[i].TotalTokens > resp.ByModel[j].TotalTokens })
	sort.Slice(resp.ByApp, func(i, j int) bool { return resp.ByApp[i].TotalTokens > resp.ByApp[j].TotalTokens })
	resp.ModelCount = len(byModel)
	resp.EstimatedCostUSD = round4(resp.EstimatedCostUSD)
	return resp, nil
}

// ---- Risk assessments (Pillar 3) -------------------------------------------

// Frameworks returns the static governance-framework control catalog.
func (s *AIGovernanceService) Frameworks() []models.Framework {
	return frameworkCatalog
}

// ListAssessments returns all framework assessments for one AI system.
func (s *AIGovernanceService) ListAssessments(ctx context.Context, systemID, tenantID string) ([]*models.AIAssessment, error) {
	if _, err := s.GetSystem(ctx, systemID, tenantID); err != nil {
		return nil, err
	}
	var list []*models.AIAssessment
	err := s.pg.NewSelect().Model(&list).
		Where("aia.tenant_id = ? AND aia.ai_system_id = ?", tenantID, systemID).
		Scan(ctx)
	if list == nil {
		list = []*models.AIAssessment{}
	}
	return list, err
}

// UpsertAssessment saves (creates or replaces) a system's assessment against a
// framework, recomputing its readiness score.
func (s *AIGovernanceService) UpsertAssessment(ctx context.Context, systemID, tenantID, framework, userID string, in *models.UpsertAssessmentInput) (*models.AIAssessment, error) {
	if !frameworkExists(framework) {
		return nil, ErrInvalidInput("unknown framework")
	}
	if _, err := s.GetSystem(ctx, systemID, tenantID); err != nil {
		return nil, err
	}

	valid := controlIndexByFramework[framework]
	clean := make([]models.AssessmentControlResponse, 0, len(in.Responses))
	seen := map[string]bool{}
	for _, r := range in.Responses {
		if !valid[r.ControlID] || seen[r.ControlID] {
			continue
		}
		st := r.Status
		switch st {
		case models.ControlStatusMet, models.ControlStatusPartial, models.ControlStatusNotMet, models.ControlStatusNotApplicable:
		default:
			st = models.ControlStatusUnanswered
		}
		note := strings.TrimSpace(r.Note)
		if len(note) > 1000 {
			note = note[:1000]
		}
		seen[r.ControlID] = true
		clean = append(clean, models.AssessmentControlResponse{ControlID: r.ControlID, Status: st, Note: note})
	}

	status := in.Status
	switch status {
	case models.AssessmentStatusDraft, models.AssessmentStatusInProgress, models.AssessmentStatusCompleted:
	default:
		status = models.AssessmentStatusInProgress
	}
	score, _ := computeAssessmentScore(framework, clean)

	now := time.Now()
	a := &models.AIAssessment{
		TenantID:   tenantID,
		AISystemID: systemID,
		Framework:  framework,
		Status:     status,
		Responses:  clean,
		Score:      score,
		AssessedBy: &userID,
		UpdatedAt:  now,
	}
	if status == models.AssessmentStatusCompleted {
		a.CompletedAt = &now
	}
	_, err := s.pg.NewInsert().Model(a).
		On("CONFLICT (tenant_id, ai_system_id, framework) DO UPDATE").
		Set("status = EXCLUDED.status").
		Set("responses = EXCLUDED.responses").
		Set("score = EXCLUDED.score").
		Set("assessed_by = EXCLUDED.assessed_by").
		Set("completed_at = EXCLUDED.completed_at").
		Set("updated_at = EXCLUDED.updated_at").
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("upsert assessment: %w", err)
	}

	out := &models.AIAssessment{}
	err = s.pg.NewSelect().Model(out).
		Where("aia.tenant_id = ? AND aia.ai_system_id = ? AND aia.framework = ?", tenantID, systemID, framework).
		Scan(ctx)
	return out, err
}

// RiskRegister computes each AI system's inherent, mitigated and residual risk
// from its framework assessments.
func (s *AIGovernanceService) RiskRegister(ctx context.Context, tenantID string) (*models.RiskRegisterResponse, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	var systems []*models.AISystem
	if err := s.pg.NewSelect().Model(&systems).
		Where("ais.tenant_id = ?", tenantID).
		OrderExpr("ais.created_at DESC").Scan(ctx); err != nil {
		return nil, err
	}
	var assessments []*models.AIAssessment
	if err := s.pg.NewSelect().Model(&assessments).
		Where("aia.tenant_id = ?", tenantID).Scan(ctx); err != nil {
		return nil, err
	}
	bySystem := map[string][]*models.AIAssessment{}
	for _, a := range assessments {
		bySystem[a.AISystemID] = append(bySystem[a.AISystemID], a)
	}

	resp := &models.RiskRegisterResponse{Rows: []*models.RiskRegisterRow{}}
	residualSum := 0
	for _, sys := range systems {
		inherent := tierInherent(sys.RiskTier)
		asmts := bySystem[sys.ID]
		readiness, gaps := 0, 0
		if len(asmts) > 0 {
			sum := 0
			for _, a := range asmts {
				sum += a.Score
				_, g := computeAssessmentScore(a.Framework, a.Responses)
				gaps += g
			}
			readiness = sum / len(asmts)
		}
		residual := int(float64(inherent)*(1-0.7*float64(readiness)/100) + 0.5)
		resp.Rows = append(resp.Rows, &models.RiskRegisterRow{
			AISystemID:         sys.ID,
			Name:               sys.Name,
			Owner:              sys.Owner,
			LifecycleStage:     sys.LifecycleStage,
			RiskTier:           sys.RiskTier,
			InherentRisk:       inherent,
			Readiness:          readiness,
			ResidualRisk:       residual,
			FrameworksAssessed: len(asmts),
			Gaps:               gaps,
		})
		resp.TotalSystems++
		if len(asmts) > 0 {
			resp.AssessedSystems++
		}
		if residual >= 70 {
			resp.HighRisk++
		}
		residualSum += residual
	}
	if resp.TotalSystems > 0 {
		resp.AvgResidual = residualSum / resp.TotalSystems
	}
	sort.Slice(resp.Rows, func(i, j int) bool { return resp.Rows[i].ResidualRisk > resp.Rows[j].ResidualRisk })
	return resp, nil
}

// ---- Lifecycle & oversight (Pillar 5) --------------------------------------

// Transition moves an AI system through its lifecycle, enforcing a state machine
// and recording an immutable attestation for every change.
func (s *AIGovernanceService) Transition(ctx context.Context, systemID, tenantID, userID, action, statement string) (*models.AISystem, error) {
	sys, err := s.GetSystem(ctx, systemID, tenantID)
	if err != nil {
		return nil, err
	}
	from := sys.LifecycleStage
	statement = strings.TrimSpace(statement)
	now := time.Now()

	var to string
	switch action {
	case models.AIActionSubmitReview:
		if from == models.AISystemStageRetired {
			return nil, ErrInvalidInput("retired systems must be reopened first")
		}
		to = models.AISystemStageUnderReview
	case models.AIActionApprove:
		if from != models.AISystemStageUnderReview {
			return nil, ErrInvalidInput("only systems under review can be approved")
		}
		if statement == "" {
			return nil, ErrInvalidInput("an oversight attestation is required to approve")
		}
		to = models.AISystemStageApproved
	case models.AIActionMarkReviewed:
		if from != models.AISystemStageApproved {
			return nil, ErrInvalidInput("only approved systems can be reviewed")
		}
		if statement == "" {
			return nil, ErrInvalidInput("a review statement is required")
		}
		to = models.AISystemStageApproved
	case models.AIActionRetire:
		if from == models.AISystemStageRetired {
			return nil, ErrInvalidInput("system is already retired")
		}
		to = models.AISystemStageRetired
	case models.AIActionReopen:
		if from != models.AISystemStageApproved && from != models.AISystemStageRetired {
			return nil, ErrInvalidInput("only approved or retired systems can be reopened")
		}
		to = models.AISystemStageUnderReview
	default:
		return nil, ErrInvalidInput("unknown action")
	}

	sys.LifecycleStage = to
	cols := []string{"lifecycle_stage"}
	switch action {
	case models.AIActionApprove:
		due := now.AddDate(0, 0, 180)
		sys.ApprovedBy, sys.ApprovedAt, sys.LastReviewedAt, sys.ReviewDueAt = &userID, &now, &now, &due
		cols = append(cols, "approved_by", "approved_at", "last_reviewed_at", "review_due_at")
	case models.AIActionMarkReviewed:
		due := now.AddDate(0, 0, 180)
		sys.LastReviewedAt, sys.ReviewDueAt = &now, &due
		cols = append(cols, "last_reviewed_at", "review_due_at")
	}

	if _, err := s.pg.NewUpdate().Model(sys).
		Column(cols...).
		Where("ais.id = ? AND ais.tenant_id = ?", systemID, tenantID).
		Exec(ctx); err != nil {
		return nil, fmt.Errorf("transition: %w", err)
	}

	att := &models.AIAttestation{
		TenantID:   tenantID,
		AISystemID: systemID,
		Action:     action,
		FromStage:  from,
		ToStage:    to,
		Statement:  statement,
		ActorID:    &userID,
	}
	if _, err := s.pg.NewInsert().Model(att).Exec(ctx); err != nil {
		return nil, fmt.Errorf("record attestation: %w", err)
	}

	return s.GetSystem(ctx, systemID, tenantID)
}

// ListAttestations returns the oversight/attestation history for an AI system.
func (s *AIGovernanceService) ListAttestations(ctx context.Context, systemID, tenantID string) ([]*models.AIAttestation, error) {
	if _, err := s.GetSystem(ctx, systemID, tenantID); err != nil {
		return nil, err
	}
	var list []*models.AIAttestation
	err := s.pg.NewSelect().Model(&list).
		Relation("Actor").
		Where("aiat.tenant_id = ? AND aiat.ai_system_id = ?", tenantID, systemID).
		OrderExpr("aiat.created_at DESC").
		Scan(ctx)
	if list == nil {
		list = []*models.AIAttestation{}
	}
	return list, err
}

// ---- helpers ----------------------------------------------------------------

func (s *AIGovernanceService) ensureNameAvailable(ctx context.Context, tenantID, name, excludeID string) error {
	q := s.pg.NewSelect().Model((*models.AISystem)(nil)).
		Where("tenant_id = ? AND lower(name) = lower(?)", tenantID, name)
	if excludeID != "" {
		q = q.Where("id <> ?", excludeID)
	}
	exists, err := q.Exists(ctx)
	if err != nil {
		return fmt.Errorf("check ai system name: %w", err)
	}
	if exists {
		return ErrInvalidInput("an AI system with this name already exists")
	}
	return nil
}

func modelKey(provider, model string) string {
	return strings.ToLower(provider) + "|" + strings.ToLower(model)
}

func normalizeHours(hours int) int {
	if hours < 1 || hours > 8760 {
		return 720
	}
	return hours
}

func orDefault(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

func cleanList(in []string) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, v := range in {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func round4(f float64) float64 {
	return float64(int64(f*10000+0.5)) / 10000
}

// tierInherent maps an EU AI Act risk tier to an inherent-risk score (0-100).
func tierInherent(tier string) int {
	switch tier {
	case models.AIRiskTierProhibited:
		return 100
	case models.AIRiskTierHigh:
		return 85
	case models.AIRiskTierLimited:
		return 45
	case models.AIRiskTierMinimal:
		return 15
	default: // unassessed
		return 60
	}
}

// computeAssessmentScore returns a 0-100 readiness score and the number of gaps
// (applicable controls not fully met) for a framework assessment.
func computeAssessmentScore(framework string, responses []models.AssessmentControlResponse) (score int, gaps int) {
	fw, ok := frameworkByID[framework]
	if !ok || len(fw.Controls) == 0 {
		return 0, 0
	}
	byID := make(map[string]string, len(responses))
	for _, r := range responses {
		byID[r.ControlID] = r.Status
	}
	var applicable, metSum float64
	for _, c := range fw.Controls {
		switch byID[c.ID] {
		case models.ControlStatusNotApplicable:
			continue
		case models.ControlStatusMet:
			applicable++
			metSum++
		case models.ControlStatusPartial:
			applicable++
			metSum += 0.5
			gaps++
		default: // not_met, unanswered, missing
			applicable++
			gaps++
		}
	}
	if applicable == 0 {
		return 100, 0 // all controls marked N/A -> no risk-relevant controls
	}
	return int(metSum/applicable*100 + 0.5), gaps
}
