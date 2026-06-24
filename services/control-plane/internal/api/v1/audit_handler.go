// services/control-plane/internal/api/v1/audit_handler.go

package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// AuditHandler handles audit log endpoints backed by ClickHouse, plus
// integrity verification of the tamper-evident audit ledger (Postgres).
type AuditHandler struct {
	ch    *db.ClickHouseClient
	chain *services.AuditChainService
}

// NewAuditHandler creates an AuditHandler.
func NewAuditHandler(ch *db.ClickHouseClient, chain *services.AuditChainService) *AuditHandler {
	return &AuditHandler{ch: ch, chain: chain}
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

// Verify godoc
// GET /api/v1/audit-logs/verify
//
// Re-computes the tenant's tamper-evident audit hash chain and reports whether
// any record was altered, inserted or removed.
func (h *AuditHandler) Verify(c *gin.Context) {
	result, err := h.chain.Verify(c.Request.Context(), middleware.GetTenantID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, result)
}
