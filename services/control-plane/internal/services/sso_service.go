// services/control-plane/internal/services/sso_service.go
//
// Enterprise SSO via OIDC. Per-tenant connections: a user enters their email,
// we resolve the tenant by email domain, redirect to that tenant's identity
// provider, verify the returned ID token, JIT-provision the user against our
// role model, and mint a normal DataSentinel session. Tokens are never placed
// in a redirect URL — the callback stores them under a one-time code that the
// SPA exchanges over POST.

package services

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/redis/go-redis/v9"
	"github.com/uptrace/bun"
	"go.uber.org/zap"
	"golang.org/x/oauth2"

	"github.com/datasentinel/control-plane/internal/config"
	"github.com/datasentinel/control-plane/internal/models"
)

const (
	ssoStateTTL    = 10 * time.Minute
	ssoExchangeTTL = 60 * time.Second
)

// SSOService manages per-tenant OIDC connections and the login flow.
type SSOService struct {
	pg   *bun.DB
	rdb  *redis.Client
	cfg  *config.Config
	log  *zap.Logger
	auth *AuthService

	providerCache sync.Map // issuerURL -> *oidc.Provider
}

func NewSSOService(pg *bun.DB, rdb *redis.Client, cfg *config.Config, log *zap.Logger, auth *AuthService) *SSOService {
	return &SSOService{pg: pg, rdb: rdb, cfg: cfg, log: log, auth: auth}
}

type ssoState struct {
	TenantID string `json:"t"`
	ConnID   string `json:"c"`
	Nonce    string `json:"n"`
}

// ---- Admin config -----------------------------------------------------------

// GetConnection returns the tenant's SSO config (secret never exposed).
func (s *SSOService) GetConnection(ctx context.Context, tenantID string) (*models.SSOConnectionResponse, error) {
	conn := &models.SSOConnection{}
	err := s.pg.NewSelect().Model(conn).Where("tenant_id = ?", tenantID).Limit(1).Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return &models.SSOConnectionResponse{Provider: models.SSOProviderOIDC, DefaultRole: models.RoleViewer, AutoProvision: true, EmailDomains: []string{}}, nil
		}
		return nil, err
	}
	return conn.ToResponse(), nil
}

// UpsertConnection validates and stores the tenant's OIDC connection.
func (s *SSOService) UpsertConnection(ctx context.Context, tenantID string, in *models.UpsertSSOConnectionInput) (*models.SSOConnectionResponse, error) {
	issuer := strings.TrimRight(strings.TrimSpace(in.IssuerURL), "/")
	clientID := strings.TrimSpace(in.ClientID)
	role := in.DefaultRole
	if role == "" {
		role = models.RoleViewer
	}
	domains := cleanDomains(in.EmailDomains)

	// Preserve the existing secret unless a new one is supplied.
	existing := &models.SSOConnection{}
	hasExisting := s.pg.NewSelect().Model(existing).Where("tenant_id = ?", tenantID).Limit(1).Scan(ctx) == nil
	secret := ""
	if hasExisting {
		secret = existing.ClientSecret
	}
	if in.ClientSecret != nil && strings.TrimSpace(*in.ClientSecret) != "" {
		enc, err := encrypt(strings.TrimSpace(*in.ClientSecret), s.cfg.MasterEncryptionKey, tenantID)
		if err != nil {
			return nil, fmt.Errorf("encrypt client secret: %w", err)
		}
		secret = enc
	}

	if in.Enabled {
		if issuer == "" || clientID == "" || secret == "" {
			return nil, ErrInvalidInput("issuer URL, client ID and client secret are required to enable SSO")
		}
		if len(domains) == 0 {
			return nil, ErrInvalidInput("at least one email domain is required to enable SSO")
		}
		// Validate the issuer by performing OIDC discovery now, so admins get
		// immediate feedback on a wrong URL.
		if _, err := s.providerFor(ctx, issuer); err != nil {
			return nil, ErrInvalidInput("could not reach the OIDC issuer's discovery document — check the issuer URL")
		}
	}

	conn := &models.SSOConnection{
		TenantID:      tenantID,
		Provider:      models.SSOProviderOIDC,
		Enabled:       in.Enabled,
		IssuerURL:     issuer,
		ClientID:      clientID,
		ClientSecret:  secret,
		EmailDomains:  domains,
		DefaultRole:   role,
		AutoProvision: in.AutoProvision,
	}
	_, err := s.pg.NewInsert().Model(conn).
		On("CONFLICT (tenant_id) DO UPDATE").
		Set("enabled = EXCLUDED.enabled").
		Set("issuer_url = EXCLUDED.issuer_url").
		Set("client_id = EXCLUDED.client_id").
		Set("client_secret = EXCLUDED.client_secret").
		Set("email_domains = EXCLUDED.email_domains").
		Set("default_role = EXCLUDED.default_role").
		Set("auto_provision = EXCLUDED.auto_provision").
		Set("updated_at = now()").
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("upsert sso connection: %w", err)
	}
	return s.GetConnection(ctx, tenantID)
}

// DeleteConnection removes a tenant's SSO config.
func (s *SSOService) DeleteConnection(ctx context.Context, tenantID string) error {
	_, err := s.pg.NewDelete().Model((*models.SSOConnection)(nil)).Where("tenant_id = ?", tenantID).Exec(ctx)
	return err
}

// ---- Login flow -------------------------------------------------------------

// StartLogin resolves the tenant by email domain and returns the IdP
// authorization URL to redirect the browser to.
func (s *SSOService) StartLogin(ctx context.Context, email string) (string, error) {
	domain := emailDomain(email)
	if domain == "" {
		return "", ErrInvalidInput("a valid email is required")
	}

	// Cross-tenant lookup by domain (this runs before any auth context exists).
	conn := &models.SSOConnection{}
	err := s.pg.NewSelect().Model(conn).
		Where("enabled = true AND ? = ANY(email_domains)", domain).
		Limit(1).Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", &AppError{Code: models.ErrCodeNotFound, Message: "no SSO is configured for this email domain"}
		}
		return "", err
	}

	oauthCfg, _, err := s.oauthConfig(ctx, conn)
	if err != nil {
		return "", fmt.Errorf("sso provider init: %w", err)
	}

	state, nonce := randToken(), randToken()
	payload, _ := json.Marshal(ssoState{TenantID: conn.TenantID, ConnID: conn.ID, Nonce: nonce})
	if err := s.rdb.Set(ctx, "sso:state:"+state, payload, ssoStateTTL).Err(); err != nil {
		return "", fmt.Errorf("store sso state: %w", err)
	}
	return oauthCfg.AuthCodeURL(state, oidc.Nonce(nonce)), nil
}

// HandleCallback completes the OIDC flow and returns the frontend redirect URL
// carrying a one-time exchange code.
func (s *SSOService) HandleCallback(ctx context.Context, code, state string) (string, error) {
	if code == "" || state == "" {
		return "", ErrInvalidInput("missing code or state")
	}
	raw, err := s.rdb.GetDel(ctx, "sso:state:"+state).Result()
	if err != nil {
		return "", &AppError{Code: models.ErrCodeUnauthorized, Message: "login session expired — please try again"}
	}
	var st ssoState
	if err := json.Unmarshal([]byte(raw), &st); err != nil {
		return "", &AppError{Code: models.ErrCodeUnauthorized, Message: "invalid login session"}
	}

	conn := &models.SSOConnection{}
	if err := s.pg.NewSelect().Model(conn).Where("id = ?", st.ConnID).Limit(1).Scan(ctx); err != nil {
		return "", &AppError{Code: models.ErrCodeUnauthorized, Message: "SSO connection no longer exists"}
	}
	if !conn.Enabled {
		return "", &AppError{Code: models.ErrCodeForbidden, Message: "SSO is disabled for this workspace"}
	}

	oauthCfg, provider, err := s.oauthConfig(ctx, conn)
	if err != nil {
		return "", fmt.Errorf("sso provider init: %w", err)
	}
	oauth2Token, err := oauthCfg.Exchange(ctx, code)
	if err != nil {
		return "", &AppError{Code: models.ErrCodeUnauthorized, Message: "could not complete sign-in with the identity provider"}
	}
	rawIDToken, ok := oauth2Token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		return "", &AppError{Code: models.ErrCodeUnauthorized, Message: "identity provider did not return an ID token"}
	}
	idToken, err := provider.Verifier(&oidc.Config{ClientID: conn.ClientID}).Verify(ctx, rawIDToken)
	if err != nil {
		return "", &AppError{Code: models.ErrCodeUnauthorized, Message: "could not verify the identity token"}
	}
	if idToken.Nonce != st.Nonce {
		return "", &AppError{Code: models.ErrCodeUnauthorized, Message: "login nonce mismatch"}
	}

	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		GivenName     string `json:"given_name"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return "", fmt.Errorf("parse id token claims: %w", err)
	}
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" {
		return "", &AppError{Code: models.ErrCodeUnauthorized, Message: "the identity provider did not supply an email"}
	}

	user, err := s.provisionUser(ctx, conn, email, firstNonEmpty(claims.Name, claims.GivenName, email))
	if err != nil {
		return "", err
	}

	tokens, err := s.auth.IssueSession(ctx, user)
	if err != nil {
		return "", err
	}
	s.auth.writeAudit(ctx, &models.AuditLog{
		TenantID: user.TenantID,
		UserID:   user.ID,
		Action:   models.AuditActionUserLogin,
	})

	exCode := randToken()
	tokensJSON, _ := json.Marshal(tokens)
	if err := s.rdb.Set(ctx, "sso:exchange:"+exCode, tokensJSON, ssoExchangeTTL).Err(); err != nil {
		return "", fmt.Errorf("store exchange code: %w", err)
	}

	base := strings.TrimRight(s.cfg.FrontendURL, "/")
	return base + "/auth/sso/callback?code=" + url.QueryEscape(exCode), nil
}

// Exchange swaps a one-time SSO code for the session tokens.
func (s *SSOService) Exchange(ctx context.Context, code string) (*models.AuthTokenResponse, error) {
	raw, err := s.rdb.GetDel(ctx, "sso:exchange:"+code).Result()
	if err != nil {
		return nil, &AppError{Code: models.ErrCodeUnauthorized, Message: "invalid or expired sign-in code"}
	}
	tokens := &models.AuthTokenResponse{}
	if err := json.Unmarshal([]byte(raw), tokens); err != nil {
		return nil, fmt.Errorf("decode session: %w", err)
	}
	return tokens, nil
}

// ---- Helpers ----------------------------------------------------------------

// provisionUser finds or (JIT) creates the user for an SSO login.
func (s *SSOService) provisionUser(ctx context.Context, conn *models.SSOConnection, email, name string) (*models.User, error) {
	user := &models.User{}
	err := s.pg.NewSelect().Model(user).
		Where("lower(email) = ? AND tenant_id = ?", email, conn.TenantID).
		Limit(1).Scan(ctx)
	if err == nil {
		if !user.IsActive {
			return nil, &AppError{Code: models.ErrCodeUnauthorized, Message: "your account is disabled — contact an administrator"}
		}
		now := time.Now()
		_, _ = s.pg.NewUpdate().Model(user).Set("last_login_at = ?", now).Where("id = ?", user.ID).Exec(ctx)
		return user, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if !conn.AutoProvision {
		return nil, &AppError{Code: models.ErrCodeForbidden, Message: "no account exists for this email — ask an administrator to invite you"}
	}

	role := conn.DefaultRole
	if role == "" || role == models.RoleOwner {
		role = models.RoleViewer
	}
	now := time.Now()
	user = &models.User{
		TenantID:    conn.TenantID,
		Email:       email,
		FullName:    name,
		Role:        role,
		IsActive:    true,
		LastLoginAt: &now,
	}
	if _, err := s.pg.NewInsert().Model(user).Exec(ctx); err != nil {
		if strings.Contains(err.Error(), "users_email_unique") {
			return nil, &AppError{Code: models.ErrCodeConflict, Message: "this email is already registered to another workspace"}
		}
		return nil, fmt.Errorf("provision sso user: %w", err)
	}
	return user, nil
}

// oauthConfig builds the OAuth2 config + OIDC provider for a connection.
func (s *SSOService) oauthConfig(ctx context.Context, conn *models.SSOConnection) (*oauth2.Config, *oidc.Provider, error) {
	if conn.ClientSecret == "" {
		return nil, nil, fmt.Errorf("sso connection has no client secret")
	}
	provider, err := s.providerFor(ctx, conn.IssuerURL)
	if err != nil {
		return nil, nil, err
	}
	secret, err := decrypt(&conn.ClientSecret, s.cfg.MasterEncryptionKey, conn.TenantID)
	if err != nil {
		return nil, nil, fmt.Errorf("decrypt client secret: %w", err)
	}
	cfg := &oauth2.Config{
		ClientID:     conn.ClientID,
		ClientSecret: secret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  strings.TrimRight(s.cfg.BaseURL, "/") + "/api/v1/auth/sso/callback",
		Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
	}
	return cfg, provider, nil
}

// providerFor returns a cached (or freshly discovered) OIDC provider.
func (s *SSOService) providerFor(ctx context.Context, issuer string) (*oidc.Provider, error) {
	if v, ok := s.providerCache.Load(issuer); ok {
		return v.(*oidc.Provider), nil
	}
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, err
	}
	s.providerCache.Store(issuer, provider)
	return provider, nil
}

func emailDomain(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	at := strings.LastIndex(email, "@")
	if at < 0 || at == len(email)-1 || !strings.Contains(email[at+1:], ".") {
		return ""
	}
	return email[at+1:]
}

func cleanDomains(in []string) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, d := range in {
		d = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(d, "@")))
		if d == "" || seen[d] {
			continue
		}
		seen[d] = true
		out = append(out, d)
	}
	return out
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func randToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
