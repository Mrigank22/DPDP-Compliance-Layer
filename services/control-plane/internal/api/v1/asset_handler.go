// services/control-plane/internal/api/v1/asset_handler.go

package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// AssetHandler handles all asset-related HTTP endpoints.
type AssetHandler struct {
	assetSvc *services.AssetService
}

// NewAssetHandler creates an AssetHandler.
func NewAssetHandler(assetSvc *services.AssetService) *AssetHandler {
	return &AssetHandler{assetSvc: assetSvc}
}

// List godoc
// GET /api/v1/assets
func (h *AssetHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	assets, total, err := h.assetSvc.List(c.Request.Context(), tenantID, &models.AssetListFilter{
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		handleError(c, err)
		return
	}

	resp := make([]*models.AssetResponse, len(assets))
	for i, a := range assets {
		resp[i] = a.ToResponse()
	}
	okPaginated(c, resp, models.NewPagination(page, pageSize, total))
}

// Get godoc
// GET /api/v1/assets/:id
func (h *AssetHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	asset, err := h.assetSvc.Get(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, asset.ToResponse())
}

// Create godoc
// POST /api/v1/assets
func (h *AssetHandler) Create(c *gin.Context) {
	var input models.CreateAssetInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	asset, err := h.assetSvc.Create(c.Request.Context(), tenantID, userID, &input)
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, asset.ToResponse())
}

// Update godoc
// PATCH /api/v1/assets/:id
func (h *AssetHandler) Update(c *gin.Context) {
	var input models.UpdateAssetInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	asset, err := h.assetSvc.Update(c.Request.Context(), c.Param("id"), tenantID, userID, &input)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, asset.ToResponse())
}

// Delete godoc
// DELETE /api/v1/assets/:id
func (h *AssetHandler) Delete(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	if err := h.assetSvc.Delete(c.Request.Context(), c.Param("id"), tenantID, userID); err != nil {
		handleError(c, err)
		return
	}
	noContent(c)
}

// TriggerScan godoc
// POST /api/v1/assets/:id/scan
func (h *AssetHandler) TriggerScan(c *gin.Context) {
	var body struct {
		ScanType string `json:"scan_type" validate:"required,oneof=full incremental targeted"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	tenantID := middleware.GetTenantID(c)

	scan, err := h.assetSvc.TriggerScan(c.Request.Context(), c.Param("id"), tenantID, body.ScanType)
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, scan)
}

// ListScans godoc
// GET /api/v1/assets/:id/scans
func (h *AssetHandler) ListScans(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	scans, total, err := h.assetSvc.ListScans(c.Request.Context(), c.Param("id"), tenantID, page, pageSize)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, scans, models.NewPagination(page, pageSize, total))
}

// ListFindings godoc
// GET /api/v1/assets/:id/findings
func (h *AssetHandler) ListFindings(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	filter := &models.FindingListFilter{
		AssetID:     c.Param("id"),
		Severity:    c.Query("severity"),
		FindingType: c.Query("finding_type"),
		Page:        page,
		PageSize:    pageSize,
	}
	if r := c.Query("is_resolved"); r == "true" {
		t := true
		filter.IsResolved = &t
	} else if r == "false" {
		f := false
		filter.IsResolved = &f
	}

	findings, total, err := h.assetSvc.ListFindings(c.Request.Context(), c.Param("id"), tenantID, filter.Page, filter.PageSize)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, findings, models.NewPagination(page, pageSize, total))
}

// ListDataFlows godoc
// GET /api/v1/assets/:id/data-flows
func (h *AssetHandler) ListDataFlows(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	flows, err := h.assetSvc.ListDataFlows(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, flows)
}

// TestConnection godoc
// POST /api/v1/assets/:id/test-connection
func (h *AssetHandler) TestConnection(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	result, err := h.assetSvc.TestConnection(c.Request.Context(), c.Param("id"), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, result)
}
