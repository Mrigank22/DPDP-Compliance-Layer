// services/control-plane/internal/api/v1/scim_handler.go
//
// SCIM 2.0 protocol endpoints (mounted at /scim/v2, authenticated by a bearer
// token) plus the admin endpoints used by the dashboard to mint/revoke that
// token. Protocol responses use application/scim+json and SCIM status codes.

package v1

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// SCIMHandler serves SCIM 2.0 provisioning.
type SCIMHandler struct {
	svc *services.SCIMService
}

func NewSCIMHandler(svc *services.SCIMService) *SCIMHandler {
	return &SCIMHandler{svc: svc}
}

// Service exposes the SCIM service so the router can mount the bearer-token
// authentication middleware for the /scim/v2 endpoints.
func (h *SCIMHandler) Service() *services.SCIMService { return h.svc }

// ---- SCIM protocol endpoints (bearer-token auth) ----------------------------

// ListUsers godoc — GET /scim/v2/Users
func (h *SCIMHandler) ListUsers(c *gin.Context) {
	startIndex, _ := strconv.Atoi(c.DefaultQuery("startIndex", "1"))
	count, _ := strconv.Atoi(c.DefaultQuery("count", "0"))

	list, err := h.svc.ListUsers(c.Request.Context(), h.tenant(c), c.Query("filter"), startIndex, count)
	if err != nil {
		h.scimError(c, err)
		return
	}
	h.writeSCIM(c, http.StatusOK, list)
}

// GetUser godoc — GET /scim/v2/Users/:id
func (h *SCIMHandler) GetUser(c *gin.Context) {
	u, err := h.svc.GetUser(c.Request.Context(), h.tenant(c), c.Param("id"))
	if err != nil {
		h.scimError(c, err)
		return
	}
	h.writeSCIM(c, http.StatusOK, u)
}

// CreateUser godoc — POST /scim/v2/Users
func (h *SCIMHandler) CreateUser(c *gin.Context) {
	var in models.SCIMUser
	if err := c.ShouldBindJSON(&in); err != nil {
		middleware.WriteSCIMError(c, http.StatusBadRequest, "invalid SCIM user payload", "invalidSyntax")
		return
	}
	conn := h.conn(c)
	if conn == nil {
		middleware.WriteSCIMError(c, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	u, err := h.svc.CreateUser(c.Request.Context(), conn, &in)
	if err != nil {
		h.scimError(c, err)
		return
	}
	h.writeSCIM(c, http.StatusCreated, u)
}

// ReplaceUser godoc — PUT /scim/v2/Users/:id
func (h *SCIMHandler) ReplaceUser(c *gin.Context) {
	var in models.SCIMUser
	if err := c.ShouldBindJSON(&in); err != nil {
		middleware.WriteSCIMError(c, http.StatusBadRequest, "invalid SCIM user payload", "invalidSyntax")
		return
	}
	u, err := h.svc.ReplaceUser(c.Request.Context(), h.tenant(c), c.Param("id"), &in)
	if err != nil {
		h.scimError(c, err)
		return
	}
	h.writeSCIM(c, http.StatusOK, u)
}

// PatchUser godoc — PATCH /scim/v2/Users/:id
func (h *SCIMHandler) PatchUser(c *gin.Context) {
	var in models.SCIMPatchOp
	if err := c.ShouldBindJSON(&in); err != nil {
		middleware.WriteSCIMError(c, http.StatusBadRequest, "invalid SCIM patch payload", "invalidSyntax")
		return
	}
	u, err := h.svc.PatchUser(c.Request.Context(), h.tenant(c), c.Param("id"), in.Operations)
	if err != nil {
		h.scimError(c, err)
		return
	}
	h.writeSCIM(c, http.StatusOK, u)
}

// DeleteUser godoc — DELETE /scim/v2/Users/:id (soft delete / deactivate)
func (h *SCIMHandler) DeleteUser(c *gin.Context) {
	if err := h.svc.DeactivateUser(c.Request.Context(), h.tenant(c), c.Param("id")); err != nil {
		h.scimError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// ServiceProviderConfig godoc — GET /scim/v2/ServiceProviderConfig
func (h *SCIMHandler) ServiceProviderConfig(c *gin.Context) {
	h.writeSCIM(c, http.StatusOK, gin.H{
		"schemas":               []string{"urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"},
		"documentationUri":      "",
		"patch":                 gin.H{"supported": true},
		"bulk":                  gin.H{"supported": false, "maxOperations": 0, "maxPayloadSize": 0},
		"filter":                gin.H{"supported": true, "maxResults": 200},
		"changePassword":        gin.H{"supported": false},
		"sort":                  gin.H{"supported": false},
		"etag":                  gin.H{"supported": false},
		"authenticationSchemes": []gin.H{{"type": "oauthbearertoken", "name": "OAuth Bearer Token", "description": "Authentication via the SCIM bearer token"}},
	})
}

// ---- Admin token management (JWT auth, standard envelope) --------------------

// GenerateToken godoc — POST /api/v1/sso/scim-token (admin)
func (h *SCIMHandler) GenerateToken(c *gin.Context) {
	raw, err := h.svc.GenerateToken(c.Request.Context(), middleware.GetTenantID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	// Returned exactly once — the dashboard must show it to the admin now.
	ok(c, gin.H{"token": raw})
}

// RevokeToken godoc — DELETE /api/v1/sso/scim-token (admin)
func (h *SCIMHandler) RevokeToken(c *gin.Context) {
	if err := h.svc.RevokeToken(c.Request.Context(), middleware.GetTenantID(c)); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "SCIM provisioning disabled."})
}

// ---- helpers ----------------------------------------------------------------

func (h *SCIMHandler) tenant(c *gin.Context) string {
	v, _ := c.Get(middleware.CtxSCIMTenantID)
	s, _ := v.(string)
	return s
}

func (h *SCIMHandler) conn(c *gin.Context) *models.SSOConnection {
	v, _ := c.Get(middleware.CtxSCIMConn)
	conn, _ := v.(*models.SSOConnection)
	return conn
}

func (h *SCIMHandler) writeSCIM(c *gin.Context, status int, body any) {
	c.Header("Content-Type", "application/scim+json")
	c.JSON(status, body)
}

func (h *SCIMHandler) scimError(c *gin.Context, err error) {
	var se *services.SCIMHTTPError
	if errors.As(err, &se) {
		middleware.WriteSCIMError(c, se.Status, se.Detail, se.ScimType)
		return
	}
	middleware.WriteSCIMError(c, http.StatusInternalServerError, "internal error", "")
}
