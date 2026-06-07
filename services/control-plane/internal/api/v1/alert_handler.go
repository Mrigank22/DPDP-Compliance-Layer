// services/control-plane/internal/api/v1/alert_handler.go

package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// AlertHandler handles all alert-related HTTP endpoints.
type AlertHandler struct {
	alertSvc *services.AlertService
}

// NewAlertHandler creates an AlertHandler.
func NewAlertHandler(alertSvc *services.AlertService) *AlertHandler {
	return &AlertHandler{alertSvc: alertSvc}
}

// List godoc
// GET /api/v1/alerts
func (h *AlertHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	filter := &models.AlertListFilter{
		AlertType: c.Query("alert_type"),
		Severity:  c.Query("severity"),
		Page:      page,
		PageSize:  pageSize,
	}
	if r := c.Query("is_acknowledged"); r == "true" {
		t := true
		filter.IsAcknowledged = &t
	} else if r == "false" {
		f := false
		filter.IsAcknowledged = &f
	}

	alerts, total, err := h.alertSvc.List(c.Request.Context(), tenantID, filter)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, alerts, models.NewPagination(page, pageSize, total))
}

// Get godoc
// GET /api/v1/alerts/:id
func (h *AlertHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	alert, err := h.alertSvc.GetByID(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, alert)
}

// Unread godoc
// GET /api/v1/alerts/unread
func (h *AlertHandler) Unread(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	alerts, err := h.alertSvc.GetUnacknowledged(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"alerts": alerts, "count": len(alerts)})
}

// Acknowledge godoc
// POST /api/v1/alerts/acknowledge
func (h *AlertHandler) Acknowledge(c *gin.Context) {
	var input models.AcknowledgeAlertInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	if err := h.alertSvc.Acknowledge(c.Request.Context(), tenantID, userID, input.AlertIDs); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "Alerts acknowledged."})
}

// AcknowledgeAll godoc
// POST /api/v1/alerts/acknowledge-all
func (h *AlertHandler) AcknowledgeAll(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	if err := h.alertSvc.AcknowledgeAll(c.Request.Context(), tenantID, userID); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "All alerts acknowledged."})
}

// Delete godoc
// DELETE /api/v1/alerts/:id
func (h *AlertHandler) Delete(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	if err := h.alertSvc.Delete(c.Request.Context(), c.Param("id"), tenantID); err != nil {
		handleError(c, err)
		return
	}
	noContent(c)
}
