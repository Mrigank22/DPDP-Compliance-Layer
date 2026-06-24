// services/control-plane/internal/api/v1/sso_handler.go

package v1

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// SSOHandler exposes enterprise SSO (OIDC): the public login flow and the
// admin connection configuration.
type SSOHandler struct {
	svc         *services.SSOService
	frontendURL string
}

func NewSSOHandler(svc *services.SSOService, frontendURL string) *SSOHandler {
	return &SSOHandler{svc: svc, frontendURL: frontendURL}
}

func (h *SSOHandler) errURL(msg string) string {
	return strings.TrimRight(h.frontendURL, "/") + "/login?sso_error=" + url.QueryEscape(msg)
}

// StartLogin godoc
// POST /api/v1/auth/sso/start { email }
func (h *SSOHandler) StartLogin(c *gin.Context) {
	var in models.SSOStartInput
	if !bindAndValidate(c, &in) {
		return
	}
	authURL, err := h.svc.StartLogin(c.Request.Context(), in.Email)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"authorization_url": authURL})
}

// Callback godoc
// GET /api/v1/auth/sso/callback?code=&state=  (browser redirect target for the IdP)
func (h *SSOHandler) Callback(c *gin.Context) {
	if e := c.Query("error"); e != "" {
		desc := c.Query("error_description")
		if desc == "" {
			desc = e
		}
		c.Redirect(http.StatusFound, h.errURL(desc))
		return
	}
	redirectURL, err := h.svc.HandleCallback(c.Request.Context(), c.Query("code"), c.Query("state"))
	if err != nil {
		msg := "sign-in failed"
		if ae, ok := err.(*services.AppError); ok {
			msg = ae.Message
		}
		c.Redirect(http.StatusFound, h.errURL(msg))
		return
	}
	c.Redirect(http.StatusFound, redirectURL)
}

// Exchange godoc
// POST /api/v1/auth/sso/exchange { code }
func (h *SSOHandler) Exchange(c *gin.Context) {
	var in models.SSOExchangeInput
	if !bindAndValidate(c, &in) {
		return
	}
	tokens, err := h.svc.Exchange(c.Request.Context(), in.Code)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, tokens)
}

// GetConnection godoc
// GET /api/v1/sso/connection  (admin)
func (h *SSOHandler) GetConnection(c *gin.Context) {
	resp, err := h.svc.GetConnection(c.Request.Context(), middleware.GetTenantID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, resp)
}

// Update godoc
// PUT /api/v1/sso/connection  (admin)
func (h *SSOHandler) Update(c *gin.Context) {
	var in models.UpsertSSOConnectionInput
	if !bindAndValidate(c, &in) {
		return
	}
	resp, err := h.svc.UpsertConnection(c.Request.Context(), middleware.GetTenantID(c), &in)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, resp)
}

// Delete godoc
// DELETE /api/v1/sso/connection  (admin)
func (h *SSOHandler) Delete(c *gin.Context) {
	if err := h.svc.DeleteConnection(c.Request.Context(), middleware.GetTenantID(c)); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "SSO connection removed."})
}
