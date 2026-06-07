// services/control-plane/internal/api/v1/dashboard_handler.go

package v1

import (
	"context"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// DashboardHandler aggregates data from multiple services for the home screen.
type DashboardHandler struct {
	pg         *bun.DB
	findingSvc *services.FindingService
	alertSvc   *services.AlertService
	log        *zap.Logger
}

// NewDashboardHandler creates a DashboardHandler.
func NewDashboardHandler(pg *bun.DB, findingSvc *services.FindingService, alertSvc *services.AlertService, log *zap.Logger) *DashboardHandler {
	return &DashboardHandler{pg: pg, findingSvc: findingSvc, alertSvc: alertSvc, log: log}
}

type dashboardResponse struct {
	ComplianceScore     int              `json:"compliance_score"`
	TotalAssets         int64            `json:"total_assets"`
	PIIRecordsExposed   int64            `json:"pii_records_exposed"`
	OpenFindings        int64            `json:"open_findings"`
	CriticalFindings    int64            `json:"critical_findings"`
	UnacknowledgedAlerts int64           `json:"unacknowledged_alerts"`
	OverdueRights       int64            `json:"overdue_rights_requests"`
	ActivePolicies      int64            `json:"active_policies"`
	LastScanAt          *time.Time       `json:"last_scan_at"`
	FindingsBySeverity  map[string]int64 `json:"findings_by_severity"`
	TopRiskAssets       []assetRiskRow   `json:"top_risk_assets"`
	RecentAlerts        []*models.Alert  `json:"recent_alerts"`
}

type assetRiskRow struct {
	ID        string `json:"id" bun:"id"`
	Name      string `json:"name" bun:"name"`
	AssetType string `json:"asset_type" bun:"asset_type"`
	RiskScore int    `json:"risk_score" bun:"risk_score"`
}

// Get godoc
// GET /api/v1/dashboard
func (h *DashboardHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	ctx := c.Request.Context()

	resp := &dashboardResponse{
		FindingsBySeverity: make(map[string]int64),
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	errs := make([]error, 0)

	addErr := func(err error) {
		if err != nil {
			mu.Lock()
			errs = append(errs, err)
			mu.Unlock()
			h.log.Warn("dashboard fetch error", zap.Error(err))
		}
	}

	// Total assets
	wg.Add(1)
	go func() {
		defer wg.Done()
		count, err := h.pg.NewSelect().Model((*models.Asset)(nil)).
			Where("tenant_id = ?", tenantID).Count(ctx)
		addErr(err)
		mu.Lock()
		resp.TotalAssets = int64(count)
		mu.Unlock()
	}()

	// Total PII records across all assets
	wg.Add(1)
	go func() {
		defer wg.Done()
		var total struct{ Sum int64 `bun:"sum"` }
		err := h.pg.NewSelect().
			TableExpr("assets").
			ColumnExpr("COALESCE(SUM(pii_record_count), 0) AS sum").
			Where("tenant_id = ?", tenantID).
			Scan(ctx, &total)
		addErr(err)
		mu.Lock()
		resp.PIIRecordsExposed = total.Sum
		mu.Unlock()
	}()

	// Open findings summary
	wg.Add(1)
	go func() {
		defer wg.Done()
		stats, err := h.findingSvc.Summary(ctx, tenantID)
		if err != nil {
			addErr(err)
			return
		}
		mu.Lock()
		resp.OpenFindings = stats.Unresolved
		resp.FindingsBySeverity = stats.BySeverity
		if c, ok := stats.BySeverity[models.SeverityCritical]; ok {
			resp.CriticalFindings = c
		}
		mu.Unlock()
	}()

	// Unacknowledged alerts
	wg.Add(1)
	go func() {
		defer wg.Done()
		alerts, err := h.alertSvc.GetUnacknowledged(ctx, tenantID)
		addErr(err)
		mu.Lock()
		resp.UnacknowledgedAlerts = int64(len(alerts))
		if len(alerts) > 5 {
			resp.RecentAlerts = alerts[:5]
		} else {
			resp.RecentAlerts = alerts
		}
		mu.Unlock()
	}()

	// Overdue rights requests
	wg.Add(1)
	go func() {
		defer wg.Done()
		count, err := h.pg.NewSelect().Model((*models.RightsRequest)(nil)).
			Where("tenant_id = ? AND due_date < NOW() AND status NOT IN ('completed','rejected')", tenantID).
			Count(ctx)
		addErr(err)
		mu.Lock()
		resp.OverdueRights = int64(count)
		mu.Unlock()
	}()

	// Active policies count
	wg.Add(1)
	go func() {
		defer wg.Done()
		count, err := h.pg.NewSelect().Model((*models.Policy)(nil)).
			Where("tenant_id = ? AND status = 'active'", tenantID).Count(ctx)
		addErr(err)
		mu.Lock()
		resp.ActivePolicies = int64(count)
		mu.Unlock()
	}()

	// Top 5 risk assets
	wg.Add(1)
	go func() {
		defer wg.Done()
		var rows []assetRiskRow
		err := h.pg.NewSelect().
			TableExpr("assets").
			ColumnExpr("id, name, asset_type, risk_score").
			Where("tenant_id = ?", tenantID).
			OrderExpr("risk_score DESC").
			Limit(5).
			Scan(ctx, &rows)
		addErr(err)
		mu.Lock()
		resp.TopRiskAssets = rows
		mu.Unlock()
	}()

	// Most recent scan timestamp
	wg.Add(1)
	go func() {
		defer wg.Done()
		var row struct{ At *time.Time `bun:"at"` }
		err := h.pg.NewSelect().
			TableExpr("scans").
			ColumnExpr("MAX(completed_at) AS at").
			Where("tenant_id = ? AND status = 'completed'", tenantID).
			Scan(ctx, &row)
		addErr(err)
		mu.Lock()
		resp.LastScanAt = row.At
		mu.Unlock()
	}()

	wg.Wait()

	// Calculate a simple compliance score (0–100)
	resp.ComplianceScore = calculateComplianceScore(resp)

	ok(c, resp)
}

// calculateComplianceScore produces a simple weighted compliance score.
// Real implementation would weight policy coverage, open critical findings,
// overdue rights requests, and asset coverage.
func calculateComplianceScore(d *dashboardResponse) int {
	score := 100

	// Deduct for critical findings
	if d.CriticalFindings > 0 {
		deduct := int(d.CriticalFindings) * 5
		if deduct > 40 {
			deduct = 40
		}
		score -= deduct
	}

	// Deduct for overdue rights requests
	if d.OverdueRights > 0 {
		deduct := int(d.OverdueRights) * 3
		if deduct > 15 {
			deduct = 15
		}
		score -= deduct
	}

	// Deduct for zero active policies
	if d.ActivePolicies == 0 {
		score -= 20
	}

	if score < 0 {
		score = 0
	}
	return score
}

// GetDPDPStatus returns a structured DPDP Act compliance posture snapshot.
func (h *DashboardHandler) GetDPDPStatus(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	ctx := c.Request.Context()

	type dpdpCheck struct {
		Requirement string `json:"requirement"`
		Status      string `json:"status"`
		Details     string `json:"details"`
	}

	checks := []dpdpCheck{}

	// Check 1: Consent management in place
	consentCount, _ := h.pg.NewSelect().Model((*models.ConsentRecord)(nil)).
		Where("tenant_id = ?", tenantID).Count(ctx)
	if consentCount > 0 {
		checks = append(checks, dpdpCheck{"Consent Records", "compliant", "Consent records are being collected."})
	} else {
		checks = append(checks, dpdpCheck{"Consent Records", "gap", "No consent records found. Implement consent collection per DPDP §6."})
	}

	// Check 2: Rights request handling
	openRights, _ := h.pg.NewSelect().Model((*models.RightsRequest)(nil)).
		Where("tenant_id = ? AND status NOT IN ('completed','rejected')", tenantID).Count(ctx)
	overdueRights, _ := h.pg.NewSelect().Model((*models.RightsRequest)(nil)).
		Where("tenant_id = ? AND due_date < NOW() AND status NOT IN ('completed','rejected')", tenantID).Count(ctx)
	if overdueRights > 0 {
		checks = append(checks, dpdpCheck{"Data Principal Rights (DPDP §12–13)", "non_compliant",
			"You have overdue Data Subject Requests beyond the 90-day statutory deadline."})
	} else if openRights > 0 {
		checks = append(checks, dpdpCheck{"Data Principal Rights (DPDP §12–13)", "in_progress", "Open rights requests are within deadline."})
	} else {
		checks = append(checks, dpdpCheck{"Data Principal Rights (DPDP §12–13)", "compliant", "No open rights requests."})
	}

	// Check 3: Active data-masking policy
	maskingCount, _ := h.pg.NewSelect().Model((*models.Policy)(nil)).
		Where("tenant_id = ? AND policy_type = 'data_masking' AND status = 'active'", tenantID).Count(ctx)
	if maskingCount > 0 {
		checks = append(checks, dpdpCheck{"Data Minimisation (DPDP §8)", "compliant", "Active data masking policies are in place."})
	} else {
		checks = append(checks, dpdpCheck{"Data Minimisation (DPDP §8)", "gap", "No active data masking policies. Consider applying the DPDP-001 template."})
	}

	// Check 4: Cross-border transfer control
	xborderCount, _ := h.pg.NewSelect().Model((*models.Policy)(nil)).
		Where("tenant_id = ? AND policy_type = 'transfer_control' AND status = 'active'", tenantID).Count(ctx)
	if xborderCount > 0 {
		checks = append(checks, dpdpCheck{"Cross-Border Transfer (DPDP §16)", "compliant", "Transfer control policies are active."})
	} else {
		checks = append(checks, dpdpCheck{"Cross-Border Transfer (DPDP §16)", "gap", "No transfer control policies found."})
	}

	// Overall status
	overallStatus := "compliant"
	for _, ch := range checks {
		if ch.Status == "non_compliant" {
			overallStatus = "non_compliant"
			break
		}
		if ch.Status == "gap" && overallStatus != "non_compliant" {
			overallStatus = "gap"
		}
	}

	ok(c, gin.H{
		"overall_status": overallStatus,
		"checks":         checks,
		"as_of":          time.Now(),
	})
}

// Trend returns 30-day finding and alert trend data for sparklines.
func (h *DashboardHandler) Trend(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)

	trends, err := h.findingSvc.Trends(c.Request.Context(), tenantID, 30)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, trends)
}

// placeholder to avoid import cycle — real usage goes through context
var _ = context.Background
