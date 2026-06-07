// services/control-plane/internal/api/v1/rights_handler.go

package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// RightsHandler handles Data Subject Request (DSR) endpoints.
type RightsHandler struct {
	rightsSvc *services.RightsService
}

// NewRightsHandler creates a RightsHandler.
func NewRightsHandler(rightsSvc *services.RightsService) *RightsHandler {
	return &RightsHandler{rightsSvc: rightsSvc}
}

// List godoc
// GET /api/v1/rights-requests
func (h *RightsHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	filter := &models.RightsRequestListFilter{
		RequestType: c.Query("request_type"),
		Status:      c.Query("status"),
		Page:        page,
		PageSize:    pageSize,
	}
	if c.Query("overdue") == "true" {
		t := true
		filter.Overdue = &t
	}

	requests, total, err := h.rightsSvc.List(c.Request.Context(), tenantID, filter)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, requests, models.NewPagination(page, pageSize, total))
}

// Get godoc
// GET /api/v1/rights-requests/:id
func (h *RightsHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	rr, err := h.rightsSvc.GetByID(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, rr)
}

// Create godoc
// POST /api/v1/rights-requests
func (h *RightsHandler) Create(c *gin.Context) {
	var input models.CreateRightsRequestInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	rr, err := h.rightsSvc.Create(c.Request.Context(), tenantID, userID, &input)
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, rr)
}

// Update godoc
// PATCH /api/v1/rights-requests/:id
func (h *RightsHandler) Update(c *gin.Context) {
	var input models.UpdateRightsRequestInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	rr, err := h.rightsSvc.Update(c.Request.Context(), c.Param("id"), tenantID, userID, &input)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, rr)
}

// Assign godoc
// POST /api/v1/rights-requests/:id/assign
func (h *RightsHandler) Assign(c *gin.Context) {
	var body struct {
		AssigneeID string `json:"assignee_id" validate:"required,uuid"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	rr, err := h.rightsSvc.Assign(c.Request.Context(), c.Param("id"), tenantID, userID, body.AssigneeID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, rr)
}

// Complete godoc
// POST /api/v1/rights-requests/:id/complete
func (h *RightsHandler) Complete(c *gin.Context) {
	var body struct {
		ResponseData map[string]any `json:"response_data"`
	}
	_ = c.ShouldBindJSON(&body)
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	rr, err := h.rightsSvc.Complete(c.Request.Context(), c.Param("id"), tenantID, userID, body.ResponseData)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, rr)
}

// Reject godoc
// POST /api/v1/rights-requests/:id/reject
func (h *RightsHandler) Reject(c *gin.Context) {
	var body struct {
		Reason string `json:"reason" validate:"required,min=10,max=2000"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	rr, err := h.rightsSvc.Reject(c.Request.Context(), c.Param("id"), tenantID, userID, body.Reason)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, rr)
}

// Overdue godoc
// GET /api/v1/rights-requests/overdue
func (h *RightsHandler) Overdue(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	requests, err := h.rightsSvc.GetOverdue(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"requests": requests, "count": len(requests)})
}

// SearchPrincipal godoc
// POST /api/v1/rights-requests/:id/search
func (h *RightsHandler) SearchPrincipal(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	taskID, err := h.rightsSvc.SearchPrincipal(c.Request.Context(), tenantID, userID, c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"task_id": taskID, "message": "Search dispatched across all connected assets."})
}
