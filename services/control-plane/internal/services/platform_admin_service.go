// services/control-plane/internal/services/platform_admin_service.go

package services

import (
	"context"
	"crypto/rsa"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/golang-jwt/jwt/v5"
	"github.com/pquerna/otp/totp"
	"github.com/uptrace/bun"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"

	"github.com/datasentinel/control-plane/internal/config"
	"github.com/datasentinel/control-plane/internal/models"
)

const (
	platformScope      = "platform_admin"
	platformTokenTTL   = 8 * time.Hour
	platformMFAInfo    = "platform-admin"
	platformMaxFailed  = 5
	platformLockout    = 15 * time.Minute
	platformMFAIssuer  = "DataSentinel Platform"
)

// PlatformAdminService manages the platform super-admin identity space and the
// vendor-level operations over all tenants, services and data. It is entirely
// separate from tenant authentication.
type PlatformAdminService struct {
	pg   *bun.DB
	cfg  *config.Config
	log  *zap.Logger
	priv *rsa.PrivateKey
	pub  *rsa.PublicKey
}

// NewPlatformAdminService constructs the service. priv/pub may be nil for CLI
// usage that only creates admins (no token issuance needed).
func NewPlatformAdminService(pg *bun.DB, cfg *config.Config, log *zap.Logger, priv *rsa.PrivateKey, pub *rsa.PublicKey) *PlatformAdminService {
	return &PlatformAdminService{pg: pg, cfg: cfg, log: log, priv: priv, pub: pub}
}

// PlatformClaims are the JWT claims for a platform-admin session. The distinct
// "platform_admin" scope guarantees a tenant-user token can never satisfy the
// platform middleware and vice-versa.
type PlatformClaims struct {
	jwt.RegisteredClaims
	Scope string `json:"scope"`
	Email string `json:"email"`
}

// ---- Schema bootstrap -------------------------------------------------------

// EnsureSchema idempotently creates the platform tables. Called at startup and
// from the CLI bootstrap so the super-admin store always exists, independently
// of the tenant migration chain.
func (s *PlatformAdminService) EnsureSchema(ctx context.Context) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS platform_admins (
			id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
			email                 TEXT        NOT NULL UNIQUE,
			password_hash         TEXT        NOT NULL,
			full_name             TEXT        NOT NULL DEFAULT '',
			is_active             BOOLEAN     NOT NULL DEFAULT true,
			mfa_enabled           BOOLEAN     NOT NULL DEFAULT false,
			mfa_secret            TEXT,
			last_login_at         TIMESTAMPTZ,
			failed_login_attempts INTEGER     NOT NULL DEFAULT 0,
			locked_until          TIMESTAMPTZ,
			created_by            UUID,
			created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS platform_audit (
			id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
			admin_id    UUID        NOT NULL,
			admin_email TEXT        NOT NULL DEFAULT '',
			action      TEXT        NOT NULL,
			target_type TEXT        NOT NULL DEFAULT '',
			target_id   TEXT        NOT NULL DEFAULT '',
			detail      JSONB       NOT NULL DEFAULT '{}',
			ip_address  TEXT        NOT NULL DEFAULT '',
			created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_platform_audit_admin   ON platform_audit (admin_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit (created_at DESC)`,
	}
	for _, q := range stmts {
		if _, err := s.pg.ExecContext(ctx, q); err != nil {
			return fmt.Errorf("ensure platform schema: %w", err)
		}
	}
	return nil
}

// HasAnyAdmin reports whether at least one platform admin exists.
func (s *PlatformAdminService) HasAnyAdmin(ctx context.Context) (bool, error) {
	n, err := s.pg.NewSelect().Model((*models.PlatformAdmin)(nil)).Count(ctx)
	return n > 0, err
}

// ---- Admin lifecycle --------------------------------------------------------

// CreateAdmin validates and inserts a new platform admin. createdBy is nil for
// CLI-bootstrapped admins and set to the acting admin's id for UI-created ones.
func (s *PlatformAdminService) CreateAdmin(ctx context.Context, input *models.CreatePlatformAdminInput, createdBy *string, actorEmail, ip string) (*models.PlatformAdmin, error) {
	if err := validatePasswordStrength(input.Password); err != nil {
		return nil, ErrInvalidInput(err.Error())
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcryptCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	admin := &models.PlatformAdmin{
		Email:        strings.ToLower(strings.TrimSpace(input.Email)),
		PasswordHash: string(hash),
		FullName:     strings.TrimSpace(input.FullName),
		IsActive:     true,
		CreatedBy:    createdBy,
	}
	if _, err := s.pg.NewInsert().Model(admin).Exec(ctx); err != nil {
		if strings.Contains(err.Error(), "platform_admins_email") || strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return nil, &AppError{Code: models.ErrCodeConflict, Message: "a platform admin with this email already exists"}
		}
		return nil, fmt.Errorf("insert platform admin: %w", err)
	}
	if createdBy != nil {
		s.writeAudit(ctx, *createdBy, actorEmail, "platform_admin.create", "platform_admin", admin.ID,
			map[string]any{"email": admin.Email}, ip)
	}
	return admin, nil
}

// ListAdmins returns all platform admins.
func (s *PlatformAdminService) ListAdmins(ctx context.Context) ([]*models.PlatformAdmin, error) {
	var admins []*models.PlatformAdmin
	err := s.pg.NewSelect().Model(&admins).OrderExpr("created_at ASC").Scan(ctx)
	return admins, err
}

// SetAdminActive enables or disables a platform admin. An admin cannot disable
// their own account, and the final active admin cannot be disabled.
func (s *PlatformAdminService) SetAdminActive(ctx context.Context, id, actorID, actorEmail string, active bool, ip string) error {
	if !active && id == actorID {
		return ErrInvalidInput("you cannot disable your own account")
	}
	if !active {
		activeCount, err := s.pg.NewSelect().Model((*models.PlatformAdmin)(nil)).Where("is_active = true").Count(ctx)
		if err != nil {
			return err
		}
		if activeCount <= 1 {
			return ErrInvalidInput("cannot disable the last active platform admin")
		}
	}
	res, err := s.pg.NewUpdate().Model((*models.PlatformAdmin)(nil)).
		Set("is_active = ?", active).
		Set("updated_at = ?", time.Now()).
		Where("id = ?", id).Exec(ctx)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return ErrNotFound("platform admin")
	}
	action := "platform_admin.disable"
	if active {
		action = "platform_admin.enable"
	}
	s.writeAudit(ctx, actorID, actorEmail, action, "platform_admin", id, nil, ip)
	return nil
}

// GetActiveByID loads an active platform admin (used by the auth middleware).
func (s *PlatformAdminService) GetActiveByID(ctx context.Context, id string) (*models.PlatformAdmin, error) {
	admin := &models.PlatformAdmin{}
	err := s.pg.NewSelect().Model(admin).Where("id = ? AND is_active = true", id).Scan(ctx)
	if err != nil {
		return nil, err
	}
	return admin, nil
}

// ---- Authentication ---------------------------------------------------------

// Login authenticates a platform admin and issues a scoped access token.
func (s *PlatformAdminService) Login(ctx context.Context, input *models.PlatformLoginInput, ip string) (*models.PlatformAuthResponse, error) {
	admin := &models.PlatformAdmin{}
	err := s.pg.NewSelect().Model(admin).
		Where("email = ?", strings.ToLower(strings.TrimSpace(input.Email))).Scan(ctx)
	if err != nil {
		return nil, &AppError{Code: models.ErrCodeUnauthorized, Message: "invalid email or password"}
	}
	if !admin.IsActive {
		return nil, &AppError{Code: models.ErrCodeUnauthorized, Message: "account is disabled"}
	}
	if admin.IsLocked() {
		return nil, &AppError{Code: models.ErrCodeAccountLocked, Message: "account is temporarily locked — try again in 15 minutes"}
	}
	if bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(input.Password)) != nil {
		return nil, s.handleFailedLogin(ctx, admin)
	}

	// MFA gate
	if admin.MFAEnabled {
		if input.TOTPCode == "" {
			return nil, &AppError{Code: models.ErrCodeMFARequired, Message: "MFA code required"}
		}
		secret, err := decrypt(admin.MFASecret, s.cfg.MasterEncryptionKey, platformMFAInfo)
		if err != nil {
			return nil, fmt.Errorf("decrypt mfa secret: %w", err)
		}
		if !totp.Validate(input.TOTPCode, secret) {
			return nil, &AppError{Code: models.ErrCodeUnauthorized, Message: "invalid MFA code"}
		}
	}

	// Reset lockout counters + record login.
	now := time.Now()
	_, _ = s.pg.NewUpdate().Model((*models.PlatformAdmin)(nil)).
		Set("failed_login_attempts = 0").
		Set("locked_until = NULL").
		Set("last_login_at = ?", now).
		Where("id = ?", admin.ID).Exec(ctx)
	admin.LastLoginAt = &now

	token, expiresIn, err := s.issueToken(admin)
	if err != nil {
		return nil, err
	}
	s.writeAudit(ctx, admin.ID, admin.Email, "platform_admin.login", "platform_admin", admin.ID, nil, ip)

	return &models.PlatformAuthResponse{
		AccessToken: token,
		ExpiresIn:   expiresIn,
		Admin:       admin.ToResponse(),
	}, nil
}

func (s *PlatformAdminService) handleFailedLogin(ctx context.Context, admin *models.PlatformAdmin) error {
	attempts := admin.FailedLoginAttempts + 1
	q := s.pg.NewUpdate().Model((*models.PlatformAdmin)(nil)).Set("failed_login_attempts = ?", attempts)
	if attempts >= platformMaxFailed {
		q = q.Set("locked_until = ?", time.Now().Add(platformLockout))
	}
	_, _ = q.Where("id = ?", admin.ID).Exec(ctx)
	if attempts >= platformMaxFailed {
		return &AppError{Code: models.ErrCodeAccountLocked, Message: "account locked after too many failed attempts — try again in 15 minutes"}
	}
	return &AppError{Code: models.ErrCodeUnauthorized, Message: "invalid email or password"}
}

func (s *PlatformAdminService) issueToken(admin *models.PlatformAdmin) (string, int, error) {
	if s.priv == nil {
		return "", 0, fmt.Errorf("token signing key not configured")
	}
	now := time.Now()
	claims := PlatformClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   admin.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(platformTokenTTL)),
			Issuer:    "datasentinel-platform",
		},
		Scope: platformScope,
		Email: admin.Email,
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := tok.SignedString(s.priv)
	if err != nil {
		return "", 0, fmt.Errorf("sign platform token: %w", err)
	}
	return signed, int(platformTokenTTL.Seconds()), nil
}

// ValidatePlatformToken verifies an RS256 platform token and its scope.
func (s *PlatformAdminService) ValidatePlatformToken(tokenStr string) (*PlatformClaims, error) {
	if s.pub == nil {
		return nil, errors.New("token verification key not configured")
	}
	token, err := jwt.ParseWithClaims(tokenStr, &PlatformClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.pub, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*PlatformClaims)
	if !ok || !token.Valid || claims.Scope != platformScope {
		return nil, errors.New("invalid platform token")
	}
	return claims, nil
}

// ---- MFA --------------------------------------------------------------------

// BeginMFAEnrollment generates and stores (encrypted) a TOTP secret, returning
// the provisioning URL and secret for the authenticator app. MFA is not active
// until the admin confirms a code via CompleteMFAEnrollment.
func (s *PlatformAdminService) BeginMFAEnrollment(ctx context.Context, adminID, email string) (otpauthURL, secret string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{Issuer: platformMFAIssuer, AccountName: email})
	if err != nil {
		return "", "", fmt.Errorf("generate totp: %w", err)
	}
	enc, err := encrypt(key.Secret(), s.cfg.MasterEncryptionKey, platformMFAInfo)
	if err != nil {
		return "", "", err
	}
	_, err = s.pg.NewUpdate().Model((*models.PlatformAdmin)(nil)).
		Set("mfa_secret = ?", enc).
		Set("updated_at = ?", time.Now()).
		Where("id = ?", adminID).Exec(ctx)
	if err != nil {
		return "", "", err
	}
	return key.URL(), key.Secret(), nil
}

// CompleteMFAEnrollment verifies the first code and activates MFA.
func (s *PlatformAdminService) CompleteMFAEnrollment(ctx context.Context, adminID, code, ip string) error {
	admin, err := s.GetActiveByID(ctx, adminID)
	if err != nil {
		return ErrNotFound("platform admin")
	}
	if admin.MFASecret == nil {
		return ErrInvalidInput("start MFA enrollment first")
	}
	secret, err := decrypt(admin.MFASecret, s.cfg.MasterEncryptionKey, platformMFAInfo)
	if err != nil {
		return fmt.Errorf("decrypt mfa secret: %w", err)
	}
	if !totp.Validate(code, secret) {
		return ErrInvalidInput("invalid MFA code")
	}
	if _, err := s.pg.NewUpdate().Model((*models.PlatformAdmin)(nil)).
		Set("mfa_enabled = true").
		Set("updated_at = ?", time.Now()).
		Where("id = ?", adminID).Exec(ctx); err != nil {
		return err
	}
	s.writeAudit(ctx, adminID, admin.Email, "platform_admin.mfa_enabled", "platform_admin", adminID, nil, ip)
	return nil
}

// ---- Tenant control ---------------------------------------------------------

// ListTenants returns a page of tenants enriched with usage counts.
func (s *PlatformAdminService) ListTenants(ctx context.Context, page, pageSize int) ([]*models.TenantAdminView, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	var tenants []*models.Tenant
	total, err := s.pg.NewSelect().Model(&tenants).
		OrderExpr("created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).
		ScanAndCount(ctx)
	if err != nil {
		return nil, 0, err
	}

	ids := make([]string, 0, len(tenants))
	for _, t := range tenants {
		ids = append(ids, t.ID)
	}
	userCounts, _ := s.countByTenant(ctx, "users", ids)
	assetCounts, _ := s.countByTenant(ctx, "assets", ids)
	findingCounts, _ := s.countByTenant(ctx, "findings", ids)

	views := make([]*models.TenantAdminView, 0, len(tenants))
	for _, t := range tenants {
		views = append(views, &models.TenantAdminView{
			ID:            t.ID,
			Name:          t.Name,
			Slug:          t.Slug,
			Plan:          t.Plan,
			IsActive:      t.IsActive,
			DataRegion:    t.DataRegion,
			PrivateDeploy: t.PrivateDeploy,
			UserCount:     userCounts[t.ID],
			AssetCount:    assetCounts[t.ID],
			FindingCount:  findingCounts[t.ID],
			CreatedAt:     t.CreatedAt,
		})
	}
	return views, int64(total), nil
}

func (s *PlatformAdminService) countByTenant(ctx context.Context, table string, ids []string) (map[string]int, error) {
	res := make(map[string]int)
	if len(ids) == 0 {
		return res, nil
	}
	var rows []struct {
		TenantID string `bun:"tenant_id"`
		C        int    `bun:"c"`
	}
	err := s.pg.NewSelect().
		TableExpr(table).
		ColumnExpr("tenant_id").
		ColumnExpr("COUNT(*) AS c").
		Where("tenant_id IN (?)", bun.In(ids)).
		GroupExpr("tenant_id").
		Scan(ctx, &rows)
	if err != nil {
		return res, err
	}
	for _, r := range rows {
		res[r.TenantID] = r.C
	}
	return res, nil
}

// SetTenantActive suspends or reactivates a tenant. Suspended tenants' users
// cannot authenticate.
func (s *PlatformAdminService) SetTenantActive(ctx context.Context, tenantID, actorID, actorEmail string, active bool, ip string) error {
	res, err := s.pg.NewUpdate().Model((*models.Tenant)(nil)).
		Set("is_active = ?", active).
		Set("updated_at = ?", time.Now()).
		Where("id = ?", tenantID).Exec(ctx)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return ErrNotFound("tenant")
	}
	action := "tenant.suspend"
	if active {
		action = "tenant.activate"
	}
	s.writeAudit(ctx, actorID, actorEmail, action, "tenant", tenantID, nil, ip)
	return nil
}

// DeleteTenant permanently removes a tenant and all of its data (cascade). This
// is irreversible — the UI requires explicit confirmation.
func (s *PlatformAdminService) DeleteTenant(ctx context.Context, tenantID, actorID, actorEmail, ip string) error {
	res, err := s.pg.NewDelete().Model((*models.Tenant)(nil)).Where("id = ?", tenantID).Exec(ctx)
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		return ErrNotFound("tenant")
	}
	s.writeAudit(ctx, actorID, actorEmail, "tenant.delete", "tenant", tenantID, nil, ip)
	return nil
}

// ---- Platform statistics ----------------------------------------------------

// Stats returns a platform-wide overview across all tenants.
func (s *PlatformAdminService) Stats(ctx context.Context) (*models.PlatformStats, error) {
	count := func(model any, where string) int64 {
		q := s.pg.NewSelect().Model(model)
		if where != "" {
			q = q.Where(where)
		}
		n, err := q.Count(ctx)
		if err != nil {
			s.log.Warn("platform stat count failed", zap.String("where", where), zap.Error(err))
		}
		return int64(n)
	}
	stats := &models.PlatformStats{
		TotalTenants:   count((*models.Tenant)(nil), ""),
		ActiveTenants:  count((*models.Tenant)(nil), "is_active = true"),
		TotalUsers:     count((*models.User)(nil), ""),
		TotalAssets:    count((*models.Asset)(nil), ""),
		TotalFindings:  count((*models.Finding)(nil), ""),
		TotalScans:     count((*models.Scan)(nil), ""),
		TotalPolicies:  count((*models.Policy)(nil), ""),
		PlatformAdmins: count((*models.PlatformAdmin)(nil), ""),
	}
	stats.SuspendedTenants = stats.TotalTenants - stats.ActiveTenants
	return stats, nil
}

// ---- Audit ------------------------------------------------------------------

func (s *PlatformAdminService) ListAudit(ctx context.Context, page, pageSize int) ([]*models.PlatformAudit, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 50
	}
	var rows []*models.PlatformAudit
	total, err := s.pg.NewSelect().Model(&rows).
		OrderExpr("created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).
		ScanAndCount(ctx)
	return rows, int64(total), err
}

func (s *PlatformAdminService) writeAudit(ctx context.Context, adminID, adminEmail, action, targetType, targetID string, detail map[string]any, ip string) {
	if detail == nil {
		detail = map[string]any{}
	}
	entry := &models.PlatformAudit{
		AdminID:    adminID,
		AdminEmail: adminEmail,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Detail:     detail,
		IPAddress:  ip,
	}
	if _, err := s.pg.NewInsert().Model(entry).Exec(ctx); err != nil {
		s.log.Warn("platform audit write failed", zap.Error(err))
	}
}

// ---- Password policy --------------------------------------------------------

// validatePasswordStrength enforces a strong platform-admin password.
func validatePasswordStrength(pw string) error {
	if len(pw) < 12 {
		return errors.New("password must be at least 12 characters")
	}
	var hasUpper, hasLower, hasDigit, hasSymbol bool
	for _, r := range pw {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasDigit = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSymbol = true
		}
	}
	if !hasUpper || !hasLower || !hasDigit || !hasSymbol {
		return errors.New("password must include upper-case, lower-case, a digit and a symbol")
	}
	return nil
}
