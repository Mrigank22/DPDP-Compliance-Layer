// services/control-plane/internal/api/v1/audit_handler.go

package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
)

// AuditHandler handles audit log endpoints backed by ClickHouse.
type AuditHandler struct {
	ch *db.ClickHouseClient
}

// NewAuditHandler creates an AuditHandler.
func NewAuditHandler(ch *db.ClickHouseClient) *AuditHandler {
	return &AuditHandler{ch: ch}
}

// List godoc
// GET /api/v1/audit-logs
func (h *AuditHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	filter := &models.AuditLogFilter{
		Action:       c.Query("action"),
		ResourceType: c.Query("resource_type"),
		ResourceID:   c.Query("resource_id"),
		UserID:       c.Query("user_id"),
		Page:         page,
		PageSize:     pageSize,
	}

	logs, total, err := h.ch.QueryAuditLogs(c.Request.Context(), filter, tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, logs, models.NewPagination(page, pageSize, total))
}
