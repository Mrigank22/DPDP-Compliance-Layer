package v1

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// FindingHandler handles all finding-related HTTP endpoints.
type FindingHandler struct {
	findingSvc *services.FindingService
}

// NewFindingHandler creates a FindingHandler.
func NewFindingHandler(findingSvc *services.FindingService) *FindingHandler {
	return &FindingHandler{findingSvc: findingSvc}
}

// List godoc
// GET /api/v1/findings
func (h *FindingHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	filter := &models.FindingListFilter{
		AssetID:     c.Query("asset_id"),
		ScanID:      c.Query("scan_id"),
		FindingType: c.Query("finding_type"),
		Severity:    c.Query("severity"),
		Page:        page,
		PageSize:    pageSize,
	}
	if r := c.Query("is_resolved"); r == "true" {
		t := true
		filter.IsResolved = &t
	} else if r == "false" {
		f := false
		filter.IsResolved = &f
	}

	findings, total, err := h.findingSvc.List(c.Request.Context(), tenantID, filter)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, findings, models.NewPagination(page, pageSize, total))
}

// Get godoc
// GET /api/v1/findings/:id
func (h *FindingHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	finding, err := h.findingSvc.GetByID(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, finding)
}

// Resolve godoc
// POST /api/v1/findings/:id/resolve
func (h *FindingHandler) Resolve(c *gin.Context) {
	var input models.ResolveFindingInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	finding, err := h.findingSvc.Resolve(c.Request.Context(), c.Param("id"), tenantID, userID, &input)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, finding)
}

// MarkFalsePositive godoc
// POST /api/v1/findings/:id/false-positive
func (h *FindingHandler) MarkFalsePositive(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	finding, err := h.findingSvc.MarkFalsePositive(c.Request.Context(), c.Param("id"), tenantID, userID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, finding)
}

// Summary godoc
// GET /api/v1/findings/summary
func (h *FindingHandler) Summary(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	stats, err := h.findingSvc.Summary(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, stats)
}

// Trends godoc
// GET /api/v1/findings/trends?days=30
func (h *FindingHandler) Trends(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	days := 30
	if d := c.Query("days"); d != "" {
		if v, err := strconv.Atoi(d); err == nil && v >= 1 && v <= 90 {
			days = v
		} else {
			handleError(c, services.ErrInvalidInput("days must be between 1 and 90"))
			return
		}
	}
	trends, err := h.findingSvc.Trends(c.Request.Context(), tenantID, days)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, trends)
}
