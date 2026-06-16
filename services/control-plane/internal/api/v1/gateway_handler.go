// services/control-plane/internal/api/v1/gateway_handler.go

package v1

import (
	"net/http"
	"strconv"
	"time"

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

// --- Events ------------------------------------------------------------------

// ListEvents godoc
// GET /api/v1/gateway/events?page=1&page_size=25&action=&pii_type=&was_llm_call=
func (h *GatewayHandler) ListEvents(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	filter := &models.GatewayEventFilter{
		Action:   c.Query("action"),
		PIIType:  c.Query("pii_type"),
		Page:     page,
		PageSize: pageSize,
	}
	if v := c.Query("was_llm_call"); v != "" {
		b := v == "true"
		filter.WasLLMCall = &b
	}

	events, total, err := h.gatewaySvc.ListEvents(c.Request.Context(), tenantID, filter)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, events, models.NewPagination(page, pageSize, total))
}

// StreamEvents godoc
// GET /api/v1/gateway/events/live
// Server-Sent Events stream of new gateway interception events. Polls ClickHouse
// every 2s for events newer than the last seen timestamp and pushes them to the client.
func (h *GatewayHandler) StreamEvents(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		handleError(c, services.ErrInternal("streaming unsupported"))
		return
	}

	// Open the window from "now" so we only stream genuinely new events.
	since := time.Now()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	ctx := c.Request.Context()

	// Initial comment to establish the stream and defeat proxy buffering.
	_, _ = c.Writer.Write([]byte(": connected\n\n"))
	flusher.Flush()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			filter := &models.GatewayEventFilter{Since: &since, Page: 1, PageSize: 50}
			events, _, err := h.gatewaySvc.ListEvents(ctx, tenantID, filter)
			if err != nil {
				// Emit a heartbeat and keep the connection alive on transient errors.
				_, _ = c.Writer.Write([]byte(": heartbeat\n\n"))
				flusher.Flush()
				continue
			}
			// Events come back newest-first; advance the cursor and emit oldest-first.
			for i := len(events) - 1; i >= 0; i-- {
				e := events[i]
				if e.Timestamp.After(since) {
					since = e.Timestamp
				}
				if err := writeSSE(c, "event", e); err != nil {
					return
				}
			}
			flusher.Flush()
		}
	}
}

// writeSSE marshals data as a named SSE event.
func writeSSE(c *gin.Context, event string, data any) error {
	c.SSEvent(event, data)
	return nil
}
