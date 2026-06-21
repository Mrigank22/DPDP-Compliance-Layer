// services/control-plane/internal/api/v1/platform_admin_handler.go

package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// PlatformAdminHandler exposes the vendor-level super-admin API under /admin.
type PlatformAdminHandler struct {
	svc *services.PlatformAdminService
}

// NewPlatformAdminHandler creates a PlatformAdminHandler.
func NewPlatformAdminHandler(svc *services.PlatformAdminService) *PlatformAdminHandler {
	return &PlatformAdminHandler{svc: svc}
}

// Service exposes the underlying service (used to build the auth middleware).
func (h *PlatformAdminHandler) Service() *services.PlatformAdminService { return h.svc }

// ---- Auth -------------------------------------------------------------------

// Login godoc — POST /api/v1/admin/auth/login
func (h *PlatformAdminHandler) Login(c *gin.Context) {
	var input models.PlatformLoginInput
	if !bindAndValidate(c, &input) {
		return
	}
	resp, err := h.svc.Login(c.Request.Context(), &input, c.ClientIP())
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, resp)
}

// Me godoc — GET /api/v1/admin/me
func (h *PlatformAdminHandler) Me(c *gin.Context) {
	admin := middleware.GetPlatformAdmin(c)
	if admin == nil {
		handleError(c, services.ErrNotFound("platform admin"))
		return
	}
	ok(c, admin.ToResponse())
}

// ---- MFA --------------------------------------------------------------------

// BeginMFA godoc — POST /api/v1/admin/mfa/begin
func (h *PlatformAdminHandler) BeginMFA(c *gin.Context) {
	admin := middleware.GetPlatformAdmin(c)
	url, secret, err := h.svc.BeginMFAEnrollment(c.Request.Context(), admin.ID, admin.Email)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"otpauth_url": url, "secret": secret})
}

// VerifyMFA godoc — POST /api/v1/admin/mfa/verify
func (h *PlatformAdminHandler) VerifyMFA(c *gin.Context) {
	var body struct {
		Code string `json:"code" validate:"required"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	id := middleware.GetPlatformAdminID(c)
	if err := h.svc.CompleteMFAEnrollment(c.Request.Context(), id, body.Code, c.ClientIP()); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "MFA enabled"})
}

// ---- Platform stats ---------------------------------------------------------

// Stats godoc — GET /api/v1/admin/stats
func (h *PlatformAdminHandler) Stats(c *gin.Context) {
	stats, err := h.svc.Stats(c.Request.Context())
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, stats)
}

// ---- Tenants ----------------------------------------------------------------

// ListTenants godoc — GET /api/v1/admin/tenants
func (h *PlatformAdminHandler) ListTenants(c *gin.Context) {
	page, pageSize := pagination(c)
	tenants, total, err := h.svc.ListTenants(c.Request.Context(), page, pageSize)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, tenants, models.NewPagination(page, pageSize, total))
}

// SuspendTenant godoc — POST /api/v1/admin/tenants/:id/suspend
func (h *PlatformAdminHandler) SuspendTenant(c *gin.Context) {
	if err := h.svc.SetTenantActive(c.Request.Context(), c.Param("id"),
		middleware.GetPlatformAdminID(c), platformEmail(c), false, c.ClientIP()); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "tenant suspended"})
}

// ActivateTenant godoc — POST /api/v1/admin/tenants/:id/activate
func (h *PlatformAdminHandler) ActivateTenant(c *gin.Context) {
	if err := h.svc.SetTenantActive(c.Request.Context(), c.Param("id"),
		middleware.GetPlatformAdminID(c), platformEmail(c), true, c.ClientIP()); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "tenant activated"})
}

// DeleteTenant godoc — DELETE /api/v1/admin/tenants/:id
func (h *PlatformAdminHandler) DeleteTenant(c *gin.Context) {
	if err := h.svc.DeleteTenant(c.Request.Context(), c.Param("id"),
		middleware.GetPlatformAdminID(c), platformEmail(c), c.ClientIP()); err != nil {
		handleError(c, err)
		return
	}
	noContent(c)
}

// ---- Platform admins --------------------------------------------------------

// ListAdmins godoc — GET /api/v1/admin/admins
func (h *PlatformAdminHandler) ListAdmins(c *gin.Context) {
	admins, err := h.svc.ListAdmins(c.Request.Context())
	if err != nil {
		handleError(c, err)
		return
	}
	out := make([]*models.PlatformAdminResponse, 0, len(admins))
	for _, a := range admins {
		out = append(out, a.ToResponse())
	}
	ok(c, gin.H{"admins": out})
}

// CreateAdmin godoc — POST /api/v1/admin/admins
func (h *PlatformAdminHandler) CreateAdmin(c *gin.Context) {
	var input models.CreatePlatformAdminInput
	if !bindAndValidate(c, &input) {
		return
	}
	actorID := middleware.GetPlatformAdminID(c)
	admin, err := h.svc.CreateAdmin(c.Request.Context(), &input, &actorID, platformEmail(c), c.ClientIP())
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, admin.ToResponse())
}

// DisableAdmin godoc — POST /api/v1/admin/admins/:id/disable
func (h *PlatformAdminHandler) DisableAdmin(c *gin.Context) {
	if err := h.svc.SetAdminActive(c.Request.Context(), c.Param("id"),
		middleware.GetPlatformAdminID(c), platformEmail(c), false, c.ClientIP()); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "admin disabled"})
}

// EnableAdmin godoc — POST /api/v1/admin/admins/:id/enable
func (h *PlatformAdminHandler) EnableAdmin(c *gin.Context) {
	if err := h.svc.SetAdminActive(c.Request.Context(), c.Param("id"),
		middleware.GetPlatformAdminID(c), platformEmail(c), true, c.ClientIP()); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "admin enabled"})
}

// ---- Audit ------------------------------------------------------------------

// ListAudit godoc — GET /api/v1/admin/audit
func (h *PlatformAdminHandler) ListAudit(c *gin.Context) {
	page, pageSize := pagination(c)
	rows, total, err := h.svc.ListAudit(c.Request.Context(), page, pageSize)
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, rows, models.NewPagination(page, pageSize, total))
}

func platformEmail(c *gin.Context) string {
	if v, ok := c.Get(middleware.CtxPlatformAdminEmail); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
