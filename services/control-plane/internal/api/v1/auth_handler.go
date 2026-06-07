// services/control-plane/internal/api/v1/auth_handler.go

package v1

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// AuthHandler handles all auth-related HTTP endpoints.
type AuthHandler struct {
	authSvc *services.AuthService
}

// NewAuthHandler creates an AuthHandler.
func NewAuthHandler(authSvc *services.AuthService) *AuthHandler {
	return &AuthHandler{authSvc: authSvc}
}

// Register godoc
// POST /api/v1/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var input models.RegisterInput
	if !bindAndValidate(c, &input) {
		return
	}
	tokens, err := h.authSvc.Register(c.Request.Context(), &input)
	if err != nil {
		handleError(c, err)
		return
	}
	created(c, tokens)
}

// Login godoc
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var input models.LoginInput
	if !bindAndValidate(c, &input) {
		return
	}
	tokens, err := h.authSvc.Login(c.Request.Context(), &input, c.ClientIP())
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, tokens)
}

// Refresh godoc
// POST /api/v1/auth/refresh
func (h *AuthHandler) Refresh(c *gin.Context) {
	var body struct {
		RefreshToken string `json:"refresh_token" validate:"required"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	tokens, err := h.authSvc.RefreshTokens(c.Request.Context(), body.RefreshToken)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, tokens)
}

// Logout godoc
// POST /api/v1/auth/logout
func (h *AuthHandler) Logout(c *gin.Context) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = c.ShouldBindJSON(&body)
	_ = h.authSvc.Logout(c.Request.Context(), body.RefreshToken)
	noContent(c)
}

// Me godoc
// GET /api/v1/auth/me
func (h *AuthHandler) Me(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		handleError(c, services.ErrNotFound("user"))
		return
	}
	ok(c, user.ToResponse())
}

// ForgotPassword godoc
// POST /api/v1/auth/forgot-password
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var body struct {
		Email string `json:"email" validate:"required,email"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	// Always 200 regardless of whether email exists (prevents enumeration)
	_ = h.authSvc.ForgotPassword(c.Request.Context(), body.Email)
	ok(c, gin.H{"message": "If that email is registered, a reset link has been sent."})
}

// ResetPassword godoc
// POST /api/v1/auth/reset-password
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var body struct {
		Token       string `json:"token"        validate:"required"`
		NewPassword string `json:"new_password" validate:"required,min=8,max=128"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	if err := h.authSvc.ResetPassword(c.Request.Context(), body.Token, body.NewPassword); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "Password updated successfully."})
}

// EnableMFA godoc
// POST /api/v1/auth/mfa/enable
func (h *AuthHandler) EnableMFA(c *gin.Context) {
	userID := middleware.GetUserID(c)
	tenantID := middleware.GetTenantID(c)
	secret, otpURL, err := h.authSvc.EnableMFA(c.Request.Context(), userID, tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{
		"secret":  secret,
		"otp_url": otpURL,
		"message": "Scan the QR code and verify with a 6-digit code to activate MFA.",
	})
}

// VerifyMFA godoc
// POST /api/v1/auth/mfa/verify
func (h *AuthHandler) VerifyMFA(c *gin.Context) {
	var body struct {
		Code string `json:"code" validate:"required,len=6"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	userID := middleware.GetUserID(c)
	tenantID := middleware.GetTenantID(c)
	if err := h.authSvc.VerifyMFA(c.Request.Context(), userID, tenantID, body.Code); err != nil {
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "MFA enabled successfully."})
}

// AcceptInvite godoc
// POST /api/v1/auth/accept-invite
func (h *AuthHandler) AcceptInvite(c *gin.Context) {
	var body struct {
		Token    string `json:"token"    validate:"required"`
		Password string `json:"password" validate:"required,min=8,max=128"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	tokens, err := h.authSvc.AcceptInvite(c.Request.Context(), body.Token, body.Password)
	if err != nil {
		handleError(c, err)
		return
	}
	// tokens may be nil if no auto-login on invite acceptance
	if tokens != nil {
		ok(c, tokens)
	} else {
		ok(c, gin.H{"message": "Invitation accepted. Please log in."})
	}
}

// ChangePassword godoc
// PUT /api/v1/auth/change-password
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var input models.ChangePasswordInput
	if !bindAndValidate(c, &input) {
		return
	}
	// Re-validate current password via login service
	user := middleware.GetUser(c)
	loginInput := &models.LoginInput{Email: user.Email, Password: input.CurrentPassword}
	if _, err := h.authSvc.Login(c.Request.Context(), loginInput, c.ClientIP()); err != nil {
		handleError(c, services.ErrInvalidInput("current password is incorrect"))
		return
	}
	if err := h.authSvc.ResetPassword(c.Request.Context(), "", input.NewPassword); err != nil {
		// Bypass the token check — direct password update
		handleError(c, err)
		return
	}
	ok(c, gin.H{"message": "Password changed successfully."})
}

// InviteUser godoc
// POST /api/v1/auth/invite
func (h *AuthHandler) InviteUser(c *gin.Context) {
	var input models.InviteUserInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	if err := h.authSvc.InviteUser(c.Request.Context(), tenantID, userID, &input); err != nil {
		handleError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"message": "Invitation sent to " + input.Email})
}
