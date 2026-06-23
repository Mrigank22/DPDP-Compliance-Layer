// services/control-plane/internal/api/v1/lineage_handler.go

package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/services"
)

// LineageHandler exposes the personal-data lineage graph.
type LineageHandler struct {
	svc *services.LineageService
}

func NewLineageHandler(svc *services.LineageService) *LineageHandler {
	return &LineageHandler{svc: svc}
}

// Get godoc
// GET /api/v1/lineage
func (h *LineageHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	graph, err := h.svc.BuildGraph(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, graph)
}
