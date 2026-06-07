// services/control-plane/internal/api/v1/gateway_handler.go

package v1

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// GatewayHandler handles gateway rule, data-flow, and event analytics endpoints.
type GatewayHandler struct {
	gatewaySvc *services.GatewayService
}

// NewGatewayHandler creates a GatewayHandler.
func NewGatewayHandler(gatewaySvc *services.GatewayService) *GatewayHandler {
	return &GatewayHandler{gatewaySvc: gatewaySvc}
}

// --- Rules -------------------------------------------------------------------

// ListRules godoc
// GET /api/v1/gateway/rules
func (h *GatewayHandler) ListRules(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	rules, err := h.gatewaySvc.ListRules(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, rules)
}

// GetRule godoc
// GET /api/v1/gateway/rules/:id
func (h *GatewayHandler) GetRule(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	rule, err := h.gatewaySvc.GetRuleByID(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, rule)
}

// CreateRule godoc
// POST /api/v1/gateway/rules
func (h *GatewayHandler) CreateRule(c *gin.Context) {
	var input models.CreateGatewayRuleInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	rule, err := h.gatewaySvc.CreateRule(c.Request.Context(), tenantID, &input)
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, rule)
}

// UpdateRule godoc
// PATCH /api/v1/gateway/rules/:id
func (h *GatewayHandler) UpdateRule(c *gin.Context) {
	var input models.UpdateGatewayRuleInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	rule, err := h.gatewaySvc.UpdateRule(c.Request.Context(), c.Param("id"), tenantID, &input)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, rule)
}

// DeleteRule godoc
// DELETE /api/v1/gateway/rules/:id
func (h *GatewayHandler) DeleteRule(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	if err := h.gatewaySvc.DeleteRule(c.Request.Context(), c.Param("id"), tenantID); err != nil {
		handleError(c, err)
		return
	}
	noContent(c)
}

// ToggleRule godoc
// POST /api/v1/gateway/rules/:id/toggle
func (h *GatewayHandler) ToggleRule(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	rule, err := h.gatewaySvc.ToggleRule(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, rule)
}

// --- Data Flows --------------------------------------------------------------

// ListDataFlows godoc
// GET /api/v1/gateway/data-flows
func (h *GatewayHandler) ListDataFlows(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	flows, err := h.gatewaySvc.ListDataFlows(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, flows)
}

// ApproveDataFlow godoc
// POST /api/v1/gateway/data-flows/:id/approve
func (h *GatewayHandler) ApproveDataFlow(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	flow, err := h.gatewaySvc.ApproveDataFlow(c.Request.Context(), c.Param("id"), tenantID, userID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, flow)
}

// --- Stats -------------------------------------------------------------------

// GetStats godoc
// GET /api/v1/gateway/stats?hours=24
func (h *GatewayHandler) GetStats(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	hours := 24
	if h := c.Query("hours"); h != "" {
		if v, err := strconv.Atoi(h); err == nil && v >= 1 && v <= 168 {
			hours = v
		}
	}
	stats, err := h.gatewaySvc.GetStats(c.Request.Context(), tenantID, hours)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, stats)
}
