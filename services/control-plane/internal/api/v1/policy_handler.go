// services/control-plane/internal/api/v1/policy_handler.go

package v1

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// PolicyHandler handles all policy-related HTTP endpoints.
type PolicyHandler struct {
	policySvc *services.PolicyService
}

// NewPolicyHandler creates a PolicyHandler.
func NewPolicyHandler(policySvc *services.PolicyService) *PolicyHandler {
	return &PolicyHandler{policySvc: policySvc}
}

// List godoc
// GET /api/v1/policies
func (h *PolicyHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	policies, total, err := h.policySvc.List(c.Request.Context(), tenantID, page, pageSize)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, policies, models.NewPagination(page, pageSize, total))
}

// Get godoc
// GET /api/v1/policies/:id
func (h *PolicyHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	policy, err := h.policySvc.GetByID(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, policy)
}

// Create godoc
// POST /api/v1/policies
func (h *PolicyHandler) Create(c *gin.Context) {
	var input models.CreatePolicyInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	policy, err := h.policySvc.Create(c.Request.Context(), tenantID, userID, &input)
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, policy)
}

// Update godoc
// PATCH /api/v1/policies/:id
func (h *PolicyHandler) Update(c *gin.Context) {
	var input models.UpdatePolicyInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	policy, err := h.policySvc.Update(c.Request.Context(), c.Param("id"), tenantID, userID, &input)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, policy)
}

// Delete godoc
// DELETE /api/v1/policies/:id
func (h *PolicyHandler) Delete(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	if err := h.policySvc.Delete(c.Request.Context(), c.Param("id"), tenantID, userID); err != nil {
		handleError(c, err)
		return
	}
	noContent(c)
}

// Activate godoc
// POST /api/v1/policies/:id/activate
func (h *PolicyHandler) Activate(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	if err := h.policySvc.SetStatus(c.Request.Context(), c.Param("id"), tenantID, userID, models.PolicyStatusActive); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "Policy activated."})
}

// Deactivate godoc
// POST /api/v1/policies/:id/deactivate
func (h *PolicyHandler) Deactivate(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	if err := h.policySvc.SetStatus(c.Request.Context(), c.Param("id"), tenantID, userID, models.PolicyStatusInactive); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "Policy deactivated."})
}

// ListVersions godoc
// GET /api/v1/policies/:id/versions
func (h *PolicyHandler) ListVersions(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	versions, err := h.policySvc.ListVersions(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, versions)
}

// Rollback godoc
// POST /api/v1/policies/:id/rollback
func (h *PolicyHandler) Rollback(c *gin.Context) {
	var body struct {
		Version int `json:"version" validate:"required,min=1"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	policy, err := h.policySvc.Rollback(c.Request.Context(), c.Param("id"), tenantID, userID, body.Version)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, policy)
}

// GetTemplates godoc
// GET /api/v1/policies/templates
func (h *PolicyHandler) GetTemplates(c *gin.Context) {
	ok(c, gin.H{"templates": h.policySvc.GetTemplates()})
}

// ApplyTemplate godoc
// POST /api/v1/policies/templates/:template_id/apply
func (h *PolicyHandler) ApplyTemplate(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	policy, err := h.policySvc.ApplyTemplate(c.Request.Context(), c.Param("template_id"), tenantID, userID)
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, policy)
}

// GetByVersion godoc
// GET /api/v1/policies/:id/versions/:version
func (h *PolicyHandler) GetByVersion(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	versionStr := c.Param("version")
	version, err := strconv.Atoi(versionStr)
	if err != nil {
		handleError(c, services.ErrInvalidInput("version must be a positive integer"))
		return
	}
	versions, err := h.policySvc.ListVersions(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	for _, v := range versions {
		if v.Version == version {
			ok(c, v)
			return
		}
	}
	handleError(c, services.ErrNotFound("policy version"))
}
