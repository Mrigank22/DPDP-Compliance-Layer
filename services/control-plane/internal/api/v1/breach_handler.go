// services/control-plane/internal/api/v1/breach_handler.go

package v1

import (
	"time"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// BreachHandler handles personal data breach incident endpoints (DPDP §8(6)).
type BreachHandler struct {
	svc *services.BreachService
}

func NewBreachHandler(svc *services.BreachService) *BreachHandler {
	return &BreachHandler{svc: svc}
}

// List godoc — GET /api/v1/breaches
func (h *BreachHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	filter := &models.BreachListFilter{
		Status:   c.Query("status"),
		Severity: c.Query("severity"),
		Overdue:  c.Query("overdue") == "true",
		Page:     page,
		PageSize: pageSize,
	}
	items, total, err := h.svc.List(c.Request.Context(), tenantID, filter)
	if err != nil {
		handleError(c, err)
		return
	}
	resp := make([]*models.BreachIncidentResponse, len(items))
	for i, b := range items {
		resp[i] = b.ToResponse()
	}
	okPaginated(c, resp, models.NewPagination(page, pageSize, total))
}

// Stats godoc — GET /api/v1/breaches/stats
func (h *BreachHandler) Stats(c *gin.Context) {
	stats, err := h.svc.Stats(c.Request.Context(), middleware.GetTenantID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, stats)
}

// Get godoc — GET /api/v1/breaches/:id
func (h *BreachHandler) Get(c *gin.Context) {
	bi, err := h.svc.GetByID(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, bi.ToResponse())
}

// Create godoc — POST /api/v1/breaches
func (h *BreachHandler) Create(c *gin.Context) {
	var in models.CreateBreachInput
	if !bindAndValidate(c, &in) {
		return
	}
	bi, err := h.svc.Create(c.Request.Context(), middleware.GetTenantID(c), middleware.GetUserID(c), &in)
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, bi.ToResponse())
}

// Update godoc — PATCH /api/v1/breaches/:id
func (h *BreachHandler) Update(c *gin.Context) {
	var in models.UpdateBreachInput
	if !bindAndValidate(c, &in) {
		return
	}
	bi, err := h.svc.Update(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c), middleware.GetUserID(c), &in)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, bi.ToResponse())
}

// AddTimeline godoc — POST /api/v1/breaches/:id/timeline
func (h *BreachHandler) AddTimeline(c *gin.Context) {
	var in models.AddBreachTimelineInput
	if !bindAndValidate(c, &in) {
		return
	}
	entry, err := h.svc.AddTimelineNote(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c), middleware.GetUserID(c), &in)
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, entry)
}

// NotifyBoard godoc — POST /api/v1/breaches/:id/notify-board (admin)
func (h *BreachHandler) NotifyBoard(c *gin.Context) {
	var in models.NotifyBoardInput
	if !bindAndValidate(c, &in) {
		return
	}
	bi, err := h.svc.NotifyBoard(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c), middleware.GetUserID(c), &in)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, bi.ToResponse())
}

// NotifyPrincipals godoc — POST /api/v1/breaches/:id/notify-principals (admin)
func (h *BreachHandler) NotifyPrincipals(c *gin.Context) {
	var in models.NotifyPrincipalsInput
	if !bindAndValidate(c, &in) {
		return
	}
	bi, err := h.svc.NotifyPrincipals(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c), middleware.GetUserID(c), &in)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, bi.ToResponse())
}

// Close godoc — POST /api/v1/breaches/:id/close (admin)
func (h *BreachHandler) Close(c *gin.Context) {
	var in models.CloseBreachInput
	if !bindAndValidate(c, &in) {
		return
	}
	bi, err := h.svc.Close(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c), middleware.GetUserID(c), &in)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, bi.ToResponse())
}

// Evidence godoc — GET /api/v1/breaches/:id/evidence
//
// Returns the incident plus its full timeline as a self-contained evidence pack.
func (h *BreachHandler) Evidence(c *gin.Context) {
	bi, err := h.svc.GetByID(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{
		"generated_at": time.Now().UTC(),
		"incident":     bi.ToResponse(),
	})
}

// Delete godoc — DELETE /api/v1/breaches/:id (admin)
func (h *BreachHandler) Delete(c *gin.Context) {
	if err := h.svc.Delete(c.Request.Context(), c.Param("id"), middleware.GetTenantID(c), middleware.GetUserID(c)); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "Breach incident deleted."})
}
