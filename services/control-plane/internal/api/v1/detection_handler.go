// services/control-plane/internal/api/v1/detection_handler.go

package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// DetectionHandler exposes per-tenant PII-detection tuning.
type DetectionHandler struct {
	svc *services.DetectionService
}

func NewDetectionHandler(svc *services.DetectionService) *DetectionHandler {
	return &DetectionHandler{svc: svc}
}

// Get godoc
// GET /api/v1/detection-settings
func (h *DetectionHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	ds, err := h.svc.Get(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, ds)
}

// Update godoc
// PUT /api/v1/detection-settings
func (h *DetectionHandler) Update(c *gin.Context) {
	var in models.UpsertDetectionSettingsInput
	if !bindAndValidate(c, &in) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	ds, err := h.svc.Upsert(c.Request.Context(), tenantID, userID, &in)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, ds)
}
