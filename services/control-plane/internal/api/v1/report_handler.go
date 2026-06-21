// services/control-plane/internal/api/v1/report_handler.go

package v1

import (
	"fmt"
	"net/http"
	"strings"

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

// Download godoc
// GET /api/v1/reports/:id/download?format=html|json
// Streams the report body to the client. format=html serves the branded,
// print-ready HTML document inline (rendered in the browser); format=json (the
// default) serves the machine-readable JSON body. When the JSON body was
// mirrored to an external object store (e.g. S3) the request is redirected to
// that presigned URL; otherwise the body stored in the database is served.
func (h *ReportHandler) Download(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	report, err := h.reportSvc.GetForDownload(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	if report.Status != models.ReportStatusReady {
		handleError(c, services.ErrConflict("report is not ready for download"))
		return
	}

	// Branded HTML document — served inline so the browser renders it.
	if strings.EqualFold(c.Query("format"), "html") {
		if report.ContentHTML != nil && *report.ContentHTML != "" {
			c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", downloadFilename(report.Title, report.ID, "html")))
			c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(*report.ContentHTML))
			return
		}
		handleError(c, services.ErrNotFound("report document"))
		return
	}

	// JSON body — prefer a real object-storage URL (e.g. an S3 presigned link).
	if report.FileURL != nil {
		u := strings.TrimSpace(*report.FileURL)
		if strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
			c.Redirect(http.StatusFound, u)
			return
		}
	}
	if report.Content != nil && *report.Content != "" {
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", downloadFilename(report.Title, report.ID, "json")))
		c.Data(http.StatusOK, "application/json", []byte(*report.Content))
		return
	}

	handleError(c, services.ErrNotFound("report content"))
}

// downloadFilename builds a safe download filename from the report title.
func downloadFilename(title, id, ext string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(title) {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		case r == ' ':
			b.WriteRune('-')
		}
	}
	name := b.String()
	if name == "" {
		name = "report-" + id
	}
	return name + "." + ext
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

