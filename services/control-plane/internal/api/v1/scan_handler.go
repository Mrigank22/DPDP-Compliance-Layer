// services/control-plane/internal/api/v1/scan_handler.go

package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// ScanHandler handles all scan-related HTTP endpoints.
type ScanHandler struct {
	scanSvc *services.ScanService
}

// NewScanHandler creates a ScanHandler.
func NewScanHandler(scanSvc *services.ScanService) *ScanHandler {
	return &ScanHandler{scanSvc: scanSvc}
}

// List godoc
// GET /api/v1/scans
func (h *ScanHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	filter := &models.ScanListFilter{
		AssetID:  c.Query("asset_id"),
		Status:   c.Query("status"),
		Page:     page,
		PageSize: pageSize,
	}
	scans, total, err := h.scanSvc.List(c.Request.Context(), tenantID, filter)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, scans, models.NewPagination(page, pageSize, total))
}

// Get godoc
// GET /api/v1/scans/:id
func (h *ScanHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	scan, err := h.scanSvc.GetByID(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, scan)
}

// Cancel godoc
// POST /api/v1/scans/:id/cancel
func (h *ScanHandler) Cancel(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	if err := h.scanSvc.Cancel(c.Request.Context(), c.Param("id"), tenantID, userID); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "Scan cancellation requested."})
}
