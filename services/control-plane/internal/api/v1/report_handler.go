// services/control-plane/internal/api/v1/report_handler.go

package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// ReportHandler handles all report-related HTTP endpoints.
type ReportHandler struct {
	reportSvc *services.ReportService
}

// NewReportHandler creates a ReportHandler.
func NewReportHandler(reportSvc *services.ReportService) *ReportHandler {
	return &ReportHandler{reportSvc: reportSvc}
}

// GetTemplates godoc
// GET /api/v1/reports/templates
func (h *ReportHandler) GetTemplates(c *gin.Context) {
	templates := h.reportSvc.GetTemplates()
	ok(c, gin.H{"templates": templates})
}

// List godoc
// GET /api/v1/reports
func (h *ReportHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	reports, total, err := h.reportSvc.List(c.Request.Context(), tenantID, page, pageSize)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, reports, models.NewPagination(page, pageSize, total))
}

// Generate godoc
// POST /api/v1/reports
func (h *ReportHandler) Generate(c *gin.Context) {
	var input models.GenerateReportInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	report, err := h.reportSvc.Generate(c.Request.Context(), tenantID, userID, &input)
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, report)
}

// Get godoc
// GET /api/v1/reports/:id
func (h *ReportHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	report, err := h.reportSvc.GetByID(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, report)
}

// Delete godoc
// DELETE /api/v1/reports/:id
func (h *ReportHandler) Delete(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	if err := h.reportSvc.Delete(c.Request.Context(), c.Param("id"), tenantID); err != nil {
		handleError(c, err)
		return
	}
	noContent(c)
}

