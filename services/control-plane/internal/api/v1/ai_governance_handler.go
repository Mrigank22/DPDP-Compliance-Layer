// services/control-plane/internal/api/v1/ai_governance_handler.go

package v1

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// AIGovernanceHandler exposes the AI system registry, model catalog and
// shadow-AI discovery view.
type AIGovernanceHandler struct {
	svc *services.AIGovernanceService
}

func NewAIGovernanceHandler(svc *services.AIGovernanceService) *AIGovernanceHandler {
	return &AIGovernanceHandler{svc: svc}
}

// ListSystems godoc
// GET /api/v1/ai/systems
func (h *AIGovernanceHandler) ListSystems(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	systems, err := h.svc.ListSystems(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"systems": systems, "count": len(systems)})
}

// GetSystem godoc
// GET /api/v1/ai/systems/:id
func (h *AIGovernanceHandler) GetSystem(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	sys, err := h.svc.GetSystem(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, sys)
}

// CreateSystem godoc
// POST /api/v1/ai/systems
func (h *AIGovernanceHandler) CreateSystem(c *gin.Context) {
	var in models.CreateAISystemInput
	if !bindAndValidate(c, &in) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	sys, err := h.svc.CreateSystem(c.Request.Context(), tenantID, userID, &in)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, sys)
}

// UpdateSystem godoc
// PATCH /api/v1/ai/systems/:id
func (h *AIGovernanceHandler) UpdateSystem(c *gin.Context) {
	var in models.UpdateAISystemInput
	if !bindAndValidate(c, &in) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	sys, err := h.svc.UpdateSystem(c.Request.Context(), c.Param("id"), tenantID, &in)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, sys)
}

// DeleteSystem godoc
// DELETE /api/v1/ai/systems/:id
func (h *AIGovernanceHandler) DeleteSystem(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	if err := h.svc.DeleteSystem(c.Request.Context(), c.Param("id"), tenantID); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "AI system deleted."})
}

// ListModels godoc
// GET /api/v1/ai/models
func (h *AIGovernanceHandler) ListModels(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	mdls, err := h.svc.ListModels(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"models": mdls, "count": len(mdls)})
}

// Discover godoc
// GET /api/v1/ai/discovery?hours=720
func (h *AIGovernanceHandler) Discover(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	hours := 720
	if v := c.Query("hours"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 8760 {
			hours = n
		}
	}
	resp, err := h.svc.Discover(c.Request.Context(), tenantID, hours)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, resp)
}

// Usage godoc
// GET /api/v1/ai/usage?hours=720
func (h *AIGovernanceHandler) Usage(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	hours := 720
	if v := c.Query("hours"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 8760 {
			hours = n
		}
	}
	resp, err := h.svc.Usage(c.Request.Context(), tenantID, hours)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, resp)
}

// Promote godoc
// POST /api/v1/ai/promote
func (h *AIGovernanceHandler) Promote(c *gin.Context) {
	var in models.PromoteAIInput
	if !bindAndValidate(c, &in) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	sys, err := h.svc.Promote(c.Request.Context(), tenantID, userID, &in)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, sys)
}

// Frameworks godoc
// GET /api/v1/ai/frameworks
func (h *AIGovernanceHandler) Frameworks(c *gin.Context) {
	ok(c, gin.H{"frameworks": h.svc.Frameworks()})
}

// ListAssessments godoc
// GET /api/v1/ai/systems/:id/assessments
func (h *AIGovernanceHandler) ListAssessments(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	list, err := h.svc.ListAssessments(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"assessments": list, "count": len(list)})
}

// UpsertAssessment godoc
// PUT /api/v1/ai/systems/:id/assessments/:framework
func (h *AIGovernanceHandler) UpsertAssessment(c *gin.Context) {
	var in models.UpsertAssessmentInput
	if !bindAndValidate(c, &in) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	a, err := h.svc.UpsertAssessment(c.Request.Context(), c.Param("id"), tenantID, c.Param("framework"), userID, &in)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, a)
}

// RiskRegister godoc
// GET /api/v1/ai/risk-register
func (h *AIGovernanceHandler) RiskRegister(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	resp, err := h.svc.RiskRegister(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, resp)
}

// Transition godoc
// POST /api/v1/ai/systems/:id/transition
func (h *AIGovernanceHandler) Transition(c *gin.Context) {
	var in models.TransitionInput
	if !bindAndValidate(c, &in) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	sys, err := h.svc.Transition(c.Request.Context(), c.Param("id"), tenantID, userID, in.Action, in.Statement)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, sys)
}

// ListAttestations godoc
// GET /api/v1/ai/systems/:id/attestations
func (h *AIGovernanceHandler) ListAttestations(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	list, err := h.svc.ListAttestations(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"attestations": list, "count": len(list)})
}
