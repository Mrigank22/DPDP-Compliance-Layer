// services/control-plane/internal/services/auth_service.go

package services

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"

	"github.com/datasentinel/control-plane/internal/config"
	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/uptrace/bun"
)

const (
	bcryptCost        = 12
	maxFailedAttempts = 5
	lockoutDuration   = 15 * time.Minute
	resetTokenTTL     = 1 * time.Hour
	inviteTokenTTL    = 72 * time.Hour
)

// AuthService handles all authentication and identity operations.
type AuthService struct {
	pg        *bun.DB
	ch        *db.ClickHouseClient
	cfg       *config.Config
	log       *zap.Logger
	privKey   *rsa.PrivateKey
	pubKey    *rsa.PublicKey
	notifSvc  *NotificationService
	tenantSvc *TenantService
}

// NewAuthService constructs an AuthService, loading RS256 keys from disk or generating ephemeral keys.
func NewAuthService(pg *bun.DB, ch *db.ClickHouseClient, cfg *config.Config, log *zap.Logger, notifSvc *NotificationService, tenantSvc *TenantService) (*AuthService, error) {
	svc := &AuthService{pg: pg, ch: ch, cfg: cfg, log: log, notifSvc: notifSvc, tenantSvc: tenantSvc}
	if err := svc.loadKeys(); err != nil {
		return nil, err
	}
	return svc, nil
}

func (s *AuthService) loadKeys() error {
	if s.cfg.JWTPrivateKeyPath != "" {
		privPEM, err := os.ReadFile(s.cfg.JWTPrivateKeyPath)
		if err != nil {
			return fmt.Errorf("read private key: %w", err)
		}
		block, _ := pem.Decode(privPEM)
		parsedKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return fmt.Errorf("parse private key: %w", err)
		}
		priv, ok := parsedKey.(*rsa.PrivateKey)
		if !ok {
			return fmt.Errorf("parse private key: not an RSA private key")
		}
		s.privKey = priv
		s.pubKey = &priv.PublicKey
		return nil
	}

	// Generate ephemeral key for development
	s.log.Warn("JWT_PRIVATE_KEY_PATH not set — generating ephemeral RSA key (development only)")
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("generate rsa key: %w", err)
	}
	s.privKey = priv
	s.pubKey = &priv.PublicKey
	return nil
}

// PublicKey returns the RSA public key for JWT verification (used by middleware).
func (s *AuthService) PublicKey() *rsa.PublicKey { return s.pubKey }

// PrivateKey returns the RSA private key, used to sign platform-admin tokens.
func (s *AuthService) PrivateKey() *rsa.PrivateKey { return s.privKey }

// ---- Registration -----------------------------------------------------------

// Register creates a new tenant + owner user in a single transaction.
func (s *AuthService) Register(ctx context.Context, input *models.RegisterInput) (*models.AuthTokenResponse, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcryptCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	var tokens *models.AuthTokenResponse

	err = s.pg.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		// Create tenant
		tenant := &models.Tenant{
			Name: input.TenantName,
			Slug: input.TenantSlug,
			Plan: models.PlanStarter,
		}
		if _, err := tx.NewInsert().Model(tenant).Exec(ctx); err != nil {
			if strings.Contains(err.Error(), "tenants_slug_unique") {
				return &AppError{Code: models.ErrCodeConflict, Message: "an organization with this slug already exists"}
			}
			return fmt.Errorf("create tenant: %w", err)
		}

		// Create owner user
		ph := string(hash)
		user := &models.User{
			TenantID:     tenant.ID,
			Email:        input.Email,
			PasswordHash: &ph,
			FullName:     input.FullName,
			Role:         models.RoleOwner,
		}
		if _, err := tx.NewInsert().Model(user).Exec(ctx); err != nil {
			if strings.Contains(err.Error(), "users_email_unique") {
				return &AppError{Code: models.ErrCodeConflict, Message: "an account with this email already exists"}
			}
			return fmt.Errorf("create user: %w", err)
		}

		var err2 error
		tokens, err2 = s.issueTokenPair(ctx, tx, user, tenant.ID)
		return err2
	})
	if err != nil {
		return nil, err
	}

	s.writeAudit(ctx, &models.AuditLog{
		TenantID:     tokens.User.TenantID,
		UserID:       tokens.User.ID,
		Action:       models.AuditActionUserCreated,
		ResourceType: "user",
		ResourceID:   tokens.User.ID,
	})

	return tokens, nil
}

// ---- Login ------------------------------------------------------------------

// Login validates credentials and issues JWT + refresh token.
func (s *AuthService) Login(ctx context.Context, input *models.LoginInput, ip string) (*models.AuthTokenResponse, error) {
	user := &models.User{}
	err := s.pg.NewSelect().Model(user).
		Where("email = ?", input.Email).
		Relation("Tenant").
		Scan(ctx)
	if err != nil {
		return nil, &AppError{Code: models.ErrCodeUnauthorized, Message: "invalid email or password"}
	}

	if !user.IsActive {
		return nil, &AppError{Code: models.ErrCodeUnauthorized, Message: "account is disabled"}
	}

	if user.Tenant != nil && !user.Tenant.IsActive {
		return nil, &AppError{Code: models.ErrCodeUnauthorized, Message: "this workspace has been suspended — contact your DataSentinel representative"}
	}

	if user.IsLocked() {
		return nil, &AppError{Code: models.ErrCodeAccountLocked, Message: "account is temporarily locked — try again in 15 minutes"}
	}

	if user.PasswordHash == nil {
		return nil, &AppError{Code: models.ErrCodeUnauthorized, Message: "this account uses SSO — please log in with your identity provider"}
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, s.handleFailedLogin(ctx, user)
	}

	// Reset failed attempts on success
	if user.FailedLoginAttempts > 0 {
		now := time.Now()
		_, _ = s.pg.NewUpdate().Model(user).
			Set("failed_login_attempts = 0").
			Set("locked_until = NULL").
			Set("last_login_at = ?", now).
			Where("id = ?", user.ID).
			Exec(ctx)
	}

	// MFA check
	if user.MFAEnabled {
		if input.TOTPCode == "" {
			return nil, &AppError{Code: models.ErrCodeMFARequired, Message: "MFA code required"}
		}
		decryptedSecret, err := decrypt(user.MFASecret, s.cfg.MasterEncryptionKey, user.TenantID)
		if err != nil {
			return nil, fmt.Errorf("decrypt mfa secret: %w", err)
		}
		if !totp.Validate(input.TOTPCode, decryptedSecret) {
			return nil, &AppError{Code: models.ErrCodeUnauthorized, Message: "invalid MFA code"}
		}
	}

	tokens, err := s.issueTokenPair(ctx, s.pg, user, user.TenantID)
	if err != nil {
		return nil, err
	}

	s.writeAudit(ctx, &models.AuditLog{
		TenantID:  user.TenantID,
		UserID:    user.ID,
		Action:    models.AuditActionUserLogin,
		IPAddress: ip,
	})

	return tokens, nil
}

func (s *AuthService) handleFailedLogin(ctx context.Context, user *models.User) error {
	attempts := user.FailedLoginAttempts + 1
	update := s.pg.NewUpdate().Model(user).
		Set("failed_login_attempts = ?", attempts)

	if attempts >= maxFailedAttempts {
		lockUntil := time.Now().Add(lockoutDuration)
		update = update.Set("locked_until = ?", lockUntil)
	}
	_, _ = update.Where("id = ?", user.ID).Exec(ctx)

	if attempts >= maxFailedAttempts {
		return &AppError{Code: models.ErrCodeAccountLocked, Message: "account locked after too many failed attempts — try again in 15 minutes"}
	}
	return &AppError{Code: models.ErrCodeUnauthorized, Message: "invalid email or password"}
}

// ---- Token refresh ----------------------------------------------------------

// RefreshTokens validates a refresh token and issues a new token pair (rotation).
func (s *AuthService) RefreshTokens(ctx context.Context, rawRefreshToken string) (*models.AuthTokenResponse, error) {
	tokenHash := hashToken(rawRefreshToken)

	rt := &models.RefreshToken{}
	err := s.pg.NewSelect().Model(rt).Where("token_hash = ?", tokenHash).Scan(ctx)
	if err != nil {
		return nil, &AppError{Code: models.ErrCodeInvalidToken, Message: "invalid refresh token"}
	}

	if !rt.IsValid() {
		// Possible token reuse attack — revoke entire family
		if rt.Revoked {
			s.revokeFamily(ctx, rt.Family)
		}
		return nil, &AppError{Code: models.ErrCodeTokenExpired, Message: "refresh token expired or revoked"}
	}

	user := &models.User{}
	if err := s.pg.NewSelect().Model(user).Where("id = ?", rt.UserID).Scan(ctx); err != nil {
		return nil, fmt.Errorf("load user for refresh: %w", err)
	}

	// Revoke old token
	now := time.Now()
	_, _ = s.pg.NewUpdate().Model(rt).
		Set("revoked = true").
		Set("revoked_at = ?", now).
		Where("id = ?", rt.ID).Exec(ctx)

	return s.issueTokenPair(ctx, s.pg, user, rt.TenantID)
}

// Logout revokes the user's refresh token family.
func (s *AuthService) Logout(ctx context.Context, rawRefreshToken string) error {
	tokenHash := hashToken(rawRefreshToken)
	rt := &models.RefreshToken{}
	if err := s.pg.NewSelect().Model(rt).Where("token_hash = ?", tokenHash).Scan(ctx); err != nil {
		return nil // token not found — idempotent
	}
	s.revokeFamily(ctx, rt.Family)
	return nil
}

func (s *AuthService) revokeFamily(ctx context.Context, family string) {
	_, _ = s.pg.NewUpdate().Model((*models.RefreshToken)(nil)).
		Set("revoked = true").
		Set("revoked_at = NOW()").
		Where("family = ?", family).
		Exec(ctx)
}

// ---- JWT issuance -----------------------------------------------------------

type DataSentinelClaims struct {
	jwt.RegisteredClaims
	TenantID string `json:"tid"`
	Role     string `json:"role"`
	Email    string `json:"email"`
}

func (s *AuthService) issueTokenPair(ctx context.Context, db bun.IDB, user *models.User, tenantID string) (*models.AuthTokenResponse, error) {
	// Access token
	now := time.Now()
	claims := DataSentinelClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTAccessTokenTTL)),
			Issuer:    "datasentinel",
		},
		TenantID: tenantID,
		Role:     user.Role,
		Email:    user.Email,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	accessToken, err := token.SignedString(s.privKey)
	if err != nil {
		return nil, fmt.Errorf("sign access token: %w", err)
	}

	// Refresh token — random 32-byte hex
	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		return nil, fmt.Errorf("generate refresh token: %w", err)
	}
	rawRefresh := hex.EncodeToString(rawBytes)
	refreshHash := hashToken(rawRefresh)
	family := uuid.New().String()

	rt := &models.RefreshToken{
		UserID:    user.ID,
		TenantID:  tenantID,
		TokenHash: refreshHash,
		Family:    family,
		ExpiresAt: now.Add(s.cfg.JWTRefreshTokenTTL),
	}
	if _, err := db.NewInsert().Model(rt).Exec(ctx); err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &models.AuthTokenResponse{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		ExpiresIn:    int(s.cfg.JWTAccessTokenTTL.Seconds()),
		User:         *user.ToResponse(),
	}, nil
}

// ValidateAccessToken parses and validates an RS256 JWT, returning the claims.
func (s *AuthService) ValidateAccessToken(tokenStr string) (*DataSentinelClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &DataSentinelClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.pubKey, nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, &AppError{Code: models.ErrCodeTokenExpired, Message: "access token expired"}
		}
		return nil, &AppError{Code: models.ErrCodeInvalidToken, Message: "invalid access token"}
	}
	claims, ok := token.Claims.(*DataSentinelClaims)
	if !ok || !token.Valid {
		return nil, &AppError{Code: models.ErrCodeInvalidToken, Message: "invalid token claims"}
	}
	return claims, nil
}

// ---- Password reset ---------------------------------------------------------

// ForgotPassword generates a reset token and sends email (non-blocking).
func (s *AuthService) ForgotPassword(ctx context.Context, email string) error {
	user := &models.User{}
	if err := s.pg.NewSelect().Model(user).Where("email = ?", email).Scan(ctx); err != nil {
		// Return nil even if user not found to prevent email enumeration
		return nil
	}

	rawToken := make([]byte, 32)
	_, _ = rand.Read(rawToken)
	rawStr := hex.EncodeToString(rawToken)
	tokenHash := hashToken(rawStr)

	prt := &models.PasswordResetToken{
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(resetTokenTTL),
	}
	if _, err := s.pg.NewInsert().Model(prt).Exec(ctx); err != nil {
		return fmt.Errorf("store reset token: %w", err)
	}

	go s.notifSvc.SendPasswordResetEmail(context.Background(), user.Email, user.FullName, rawStr)
	return nil
}

// ResetPassword consumes a reset token and sets a new password.
func (s *AuthService) ResetPassword(ctx context.Context, rawToken, newPassword string) error {
	tokenHash := hashToken(rawToken)
	prt := &models.PasswordResetToken{}
	if err := s.pg.NewSelect().Model(prt).Where("token_hash = ?", tokenHash).Scan(ctx); err != nil {
		return &AppError{Code: models.ErrCodeInvalidToken, Message: "invalid or expired reset token"}
	}
	if prt.Used || time.Now().After(prt.ExpiresAt) {
		return &AppError{Code: models.ErrCodeTokenExpired, Message: "reset token has expired"}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcryptCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	ph := string(hash)

	return s.pg.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		// Update password
		_, err := tx.NewUpdate().Model((*models.User)(nil)).
			Set("password_hash = ?", ph).
			Set("failed_login_attempts = 0").
			Set("locked_until = NULL").
			Where("id = ?", prt.UserID).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("update password: %w", err)
		}
		// Mark token used
		now := time.Now()
		_, err = tx.NewUpdate().Model(prt).
			Set("used = true").
			Set("used_at = ?", now).
			Where("id = ?", prt.ID).
			Exec(ctx)
		return err
	})
}

// ---- MFA --------------------------------------------------------------------

// EnableMFA generates a TOTP secret and QR code URI for the user.
func (s *AuthService) EnableMFA(ctx context.Context, userID, tenantID string) (string, string, error) {
	user := &models.User{}
	if err := s.pg.NewSelect().Model(user).
		Where("id = ? AND tenant_id = ?", userID, tenantID).
		Scan(ctx); err != nil {
		return "", "", fmt.Errorf("load user: %w", err)
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "DataSentinel",
		AccountName: user.Email,
	})
	if err != nil {
		return "", "", fmt.Errorf("generate totp: %w", err)
	}

	// Encrypt secret before storing
	encrypted, err := encrypt(key.Secret(), s.cfg.MasterEncryptionKey, tenantID)
	if err != nil {
		return "", "", fmt.Errorf("encrypt mfa secret: %w", err)
	}

	_, err = s.pg.NewUpdate().Model(user).
		Set("mfa_secret = ?", encrypted).
		Where("id = ?", userID).
		Exec(ctx)
	if err != nil {
		return "", "", fmt.Errorf("store mfa secret: %w", err)
	}

	return key.Secret(), key.URL(), nil
}

// VerifyMFA validates a TOTP code and activates MFA for the account.
func (s *AuthService) VerifyMFA(ctx context.Context, userID, tenantID, code string) error {
	user := &models.User{}
	if err := s.pg.NewSelect().Model(user).
		Where("id = ? AND tenant_id = ?", userID, tenantID).
		Scan(ctx); err != nil {
		return fmt.Errorf("load user: %w", err)
	}
	if user.MFASecret == nil {
		return &AppError{Code: models.ErrCodeInvalidInput, Message: "MFA setup not initiated"}
	}

	secret, err := decrypt(user.MFASecret, s.cfg.MasterEncryptionKey, tenantID)
	if err != nil {
		return fmt.Errorf("decrypt mfa secret: %w", err)
	}
	if !totp.Validate(code, secret) {
		return &AppError{Code: models.ErrCodeUnauthorized, Message: "invalid TOTP code"}
	}

	_, err = s.pg.NewUpdate().Model(user).
		Set("mfa_enabled = true").
		Where("id = ?", userID).Exec(ctx)
	return err
}

// ---- Invite -----------------------------------------------------------------

// InviteUser sends an invitation email; the invited user is created with no password.
func (s *AuthService) InviteUser(ctx context.Context, tenantID, inviterID string, input *models.InviteUserInput) error {
	// Check for existing email
	exists, err := s.pg.NewSelect().Model((*models.User)(nil)).
		Where("email = ?", input.Email).Exists(ctx)
	if err != nil {
		return fmt.Errorf("check existing user: %w", err)
	}
	if exists {
		return &AppError{Code: models.ErrCodeConflict, Message: "a user with this email already exists"}
	}

	user := &models.User{
		TenantID:  tenantID,
		Email:     input.Email,
		FullName:  input.FullName,
		Role:      input.Role,
		IsActive:  false, // activated on invite acceptance
		InvitedBy: &inviterID,
	}
	if _, err := s.pg.NewInsert().Model(user).Exec(ctx); err != nil {
		return fmt.Errorf("create invited user: %w", err)
	}

	// Generate invite token
	rawToken := make([]byte, 32)
	_, _ = rand.Read(rawToken)
	rawStr := hex.EncodeToString(rawToken)

	// Store as a password-reset-style token (reuse table, short TTL)
	tokenHash := hashToken(rawStr)
	prt := &models.PasswordResetToken{
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(inviteTokenTTL),
	}
	if _, err := s.pg.NewInsert().Model(prt).Exec(ctx); err != nil {
		return fmt.Errorf("store invite token: %w", err)
	}

	go s.notifSvc.SendInviteEmail(context.Background(), input.Email, input.FullName, rawStr)

	s.writeAudit(ctx, &models.AuditLog{
		TenantID:     tenantID,
		UserID:       inviterID,
		Action:       models.AuditActionUserCreated,
		ResourceType: "user",
		ResourceID:   user.ID,
	})
	return nil
}

// AcceptInvite sets a password and activates an invited user account.
func (s *AuthService) AcceptInvite(ctx context.Context, rawToken, password string) (*models.AuthTokenResponse, error) {
	tokenHash := hashToken(rawToken)
	prt := &models.PasswordResetToken{}
	if err := s.pg.NewSelect().Model(prt).Where("token_hash = ?", tokenHash).Scan(ctx); err != nil {
		return nil, &AppError{Code: models.ErrCodeInvalidToken, Message: "invalid or expired invite token"}
	}
	if prt.Used || time.Now().After(prt.ExpiresAt) {
		return nil, &AppError{Code: models.ErrCodeTokenExpired, Message: "invite link has expired"}
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	ph := string(hash)

	user := &models.User{}
	if err := s.pg.NewSelect().Model(user).Where("id = ?", prt.UserID).Scan(ctx); err != nil {
		return nil, fmt.Errorf("load invited user: %w", err)
	}

	return nil, s.pg.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		_, err := tx.NewUpdate().Model(user).
			Set("password_hash = ?", ph).
			Set("is_active = true").
			Where("id = ?", user.ID).Exec(ctx)
		if err != nil {
			return err
		}
		now := time.Now()
		_, err = tx.NewUpdate().Model(prt).
			Set("used = true").Set("used_at = ?", now).
			Where("id = ?", prt.ID).Exec(ctx)
		return err
	})
}

// ---- Helpers ----------------------------------------------------------------

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (s *AuthService) writeAudit(ctx context.Context, entry *models.AuditLog) {
	entry.ID = uuid.New().String()
	entry.Timestamp = time.Now()
	if err := s.ch.WriteAuditLog(ctx, entry); err != nil {
		s.log.Warn("audit log write failed", zap.Error(err))
	}
}
