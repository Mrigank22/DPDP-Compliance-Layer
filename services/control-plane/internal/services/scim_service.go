// services/control-plane/internal/services/scim_service.go
//
// SCIM 2.0 user provisioning. An IdP (Okta, Entra ID, etc.) calls the
// /scim/v2 endpoints with a bearer token to create, update and deactivate
// users in a tenant. Tokens are attached to the tenant's SSO connection
// (only the SHA-256 hash is stored). Provisioned users get the SSO
// connection's default role and no password (they sign in via SSO).

package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/models"
)

// SCIMService implements SCIM 2.0 user provisioning.
type SCIMService struct {
	pg  *bun.DB
	log *zap.Logger
}

func NewSCIMService(pg *bun.DB, log *zap.Logger) *SCIMService {
	return &SCIMService{pg: pg, log: log}
}

// SCIMHTTPError carries a SCIM-shaped error up to the handler.
type SCIMHTTPError struct {
	Status   int
	Detail   string
	ScimType string
}

func (e *SCIMHTTPError) Error() string { return e.Detail }

func scimErr(status int, detail, scimType string) *SCIMHTTPError {
	return &SCIMHTTPError{Status: status, Detail: detail, ScimType: scimType}
}

// ---- Token management -------------------------------------------------------

// GenerateToken creates (or rotates) the tenant's SCIM bearer token. The raw
// token is returned exactly once; only its hash is persisted.
func (s *SCIMService) GenerateToken(ctx context.Context, tenantID string) (string, error) {
	conn := &models.SSOConnection{}
	err := s.pg.NewSelect().Model(conn).Where("tenant_id = ?", tenantID).Limit(1).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return "", &AppError{Code: models.ErrCodeInvalidInput, Message: "configure SSO before enabling SCIM provisioning"}
	} else if err != nil {
		return "", err
	}

	raw := "scim_" + randToken()
	if _, err := s.pg.NewUpdate().Model((*models.SSOConnection)(nil)).
		Set("scim_token_hash = ?", hashToken(raw)).
		Set("scim_enabled = ?", true).
		Set("updated_at = now()").
		Where("tenant_id = ?", tenantID).Exec(ctx); err != nil {
		return "", fmt.Errorf("store scim token: %w", err)
	}
	return raw, nil
}

// RevokeToken disables SCIM provisioning and clears the stored token.
func (s *SCIMService) RevokeToken(ctx context.Context, tenantID string) error {
	_, err := s.pg.NewUpdate().Model((*models.SSOConnection)(nil)).
		Set("scim_token_hash = ?", "").
		Set("scim_enabled = ?", false).
		Set("updated_at = now()").
		Where("tenant_id = ?", tenantID).Exec(ctx)
	return err
}

// ConnectionForToken authenticates a SCIM bearer token and returns the owning
// SSO connection (carrying tenant_id and default_role). Used by the middleware.
func (s *SCIMService) ConnectionForToken(ctx context.Context, rawToken string) (*models.SSOConnection, error) {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return nil, sql.ErrNoRows
	}
	conn := &models.SSOConnection{}
	err := s.pg.NewSelect().Model(conn).
		Where("scim_token_hash = ? AND scim_enabled = true", hashToken(rawToken)).
		Limit(1).Scan(ctx)
	if err != nil {
		return nil, err
	}
	return conn, nil
}

// ---- User provisioning ------------------------------------------------------

var filterRe = regexp.MustCompile(`(?i)^\s*userName\s+eq\s+"([^"]*)"\s*$`)

// ListUsers returns a SCIM ListResponse, honouring an optional
// `userName eq "x"` filter plus startIndex/count pagination.
func (s *SCIMService) ListUsers(ctx context.Context, tenantID, filter string, startIndex, count int) (*models.SCIMListResponse, error) {
	if startIndex < 1 {
		startIndex = 1
	}
	if count < 0 {
		count = 0
	}
	if count == 0 || count > 200 {
		count = 100
	}

	q := s.pg.NewSelect().Model((*models.User)(nil)).Where("tenant_id = ?", tenantID)
	if m := filterRe.FindStringSubmatch(filter); m != nil {
		q = q.Where("lower(email) = ?", strings.ToLower(strings.TrimSpace(m[1])))
	} else if strings.TrimSpace(filter) != "" {
		return nil, scimErr(400, "unsupported filter; only `userName eq` is supported", "invalidFilter")
	}

	total, err := q.Count(ctx)
	if err != nil {
		return nil, err
	}

	var users []*models.User
	if err := q.Order("created_at ASC").
		Limit(count).Offset(startIndex - 1).Scan(ctx, &users); err != nil {
		return nil, err
	}

	resources := make([]*models.SCIMUser, 0, len(users))
	for _, u := range users {
		resources = append(resources, toSCIMUser(u))
	}
	return &models.SCIMListResponse{
		Schemas:      []string{models.SCIMListResponseSchema},
		TotalResults: total,
		StartIndex:   startIndex,
		ItemsPerPage: len(resources),
		Resources:    resources,
	}, nil
}

// GetUser returns a single SCIM user by id within the tenant.
func (s *SCIMService) GetUser(ctx context.Context, tenantID, id string) (*models.SCIMUser, error) {
	u, err := s.findUser(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	return toSCIMUser(u), nil
}

// CreateUser provisions a new user. Returns (user, created). When the user
// already exists, created is false and a 409 uniqueness error is returned.
func (s *SCIMService) CreateUser(ctx context.Context, conn *models.SSOConnection, in *models.SCIMUser) (*models.SCIMUser, error) {
	email := strings.ToLower(strings.TrimSpace(in.UserName))
	if email == "" || !strings.Contains(email, "@") {
		return nil, scimErr(400, "userName must be a valid email address", "invalidValue")
	}

	existing := &models.User{}
	err := s.pg.NewSelect().Model(existing).
		Where("lower(email) = ? AND tenant_id = ?", email, conn.TenantID).Limit(1).Scan(ctx)
	if err == nil {
		return nil, scimErr(409, "user already exists", "uniqueness")
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	role := conn.DefaultRole
	if role == "" || role == models.RoleOwner {
		role = models.RoleViewer
	}
	user := &models.User{
		TenantID: conn.TenantID,
		Email:    email,
		FullName: displayName(in, email),
		Role:     role,
		IsActive: in.Active,
	}
	if _, err := s.pg.NewInsert().Model(user).Exec(ctx); err != nil {
		if strings.Contains(err.Error(), "users_email_unique") || strings.Contains(err.Error(), "duplicate") {
			return nil, scimErr(409, "user already exists", "uniqueness")
		}
		return nil, fmt.Errorf("scim create user: %w", err)
	}
	return toSCIMUser(user), nil
}

// ReplaceUser handles SCIM PUT: full replace of the mutable attributes.
func (s *SCIMService) ReplaceUser(ctx context.Context, tenantID, id string, in *models.SCIMUser) (*models.SCIMUser, error) {
	u, err := s.findUser(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	wasActive := u.IsActive
	u.FullName = displayName(in, u.Email)
	u.IsActive = in.Active
	if _, err := s.pg.NewUpdate().Model(u).
		Column("full_name", "is_active", "updated_at").
		Set("updated_at = now()").Where("id = ? AND tenant_id = ?", u.ID, tenantID).Exec(ctx); err != nil {
		return nil, fmt.Errorf("scim replace user: %w", err)
	}
	if wasActive && !u.IsActive {
		s.revokeUserTokens(ctx, u.ID)
	}
	return toSCIMUser(u), nil
}

// PatchUser handles SCIM PATCH operations. The common case is
// `replace active=false`, which deprovisions the user.
func (s *SCIMService) PatchUser(ctx context.Context, tenantID, id string, ops []models.SCIMPatchOperation) (*models.SCIMUser, error) {
	u, err := s.findUser(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	wasActive := u.IsActive

	for _, op := range ops {
		switch strings.ToLower(strings.TrimSpace(op.Op)) {
		case "replace", "add":
			if err := applyPatchValue(u, op); err != nil {
				return nil, err
			}
		case "remove":
			if strings.EqualFold(strings.Trim(op.Path, "\""), "active") {
				u.IsActive = false
			}
		default:
			return nil, scimErr(400, "unsupported PATCH op: "+op.Op, "invalidSyntax")
		}
	}

	if _, err := s.pg.NewUpdate().Model(u).
		Column("full_name", "is_active", "updated_at").
		Set("updated_at = now()").Where("id = ? AND tenant_id = ?", u.ID, tenantID).Exec(ctx); err != nil {
		return nil, fmt.Errorf("scim patch user: %w", err)
	}
	if wasActive && !u.IsActive {
		s.revokeUserTokens(ctx, u.ID)
	}
	return toSCIMUser(u), nil
}

// DeactivateUser handles SCIM DELETE by disabling the account (soft delete)
// and revoking active sessions.
func (s *SCIMService) DeactivateUser(ctx context.Context, tenantID, id string) error {
	u, err := s.findUser(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if _, err := s.pg.NewUpdate().Model((*models.User)(nil)).
		Set("is_active = false").Set("updated_at = now()").
		Where("id = ? AND tenant_id = ?", u.ID, tenantID).Exec(ctx); err != nil {
		return fmt.Errorf("scim deactivate user: %w", err)
	}
	s.revokeUserTokens(ctx, u.ID)
	return nil
}

// ---- helpers ----------------------------------------------------------------

func (s *SCIMService) findUser(ctx context.Context, tenantID, id string) (*models.User, error) {
	u := &models.User{}
	err := s.pg.NewSelect().Model(u).
		Where("id = ? AND tenant_id = ?", id, tenantID).Limit(1).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, scimErr(404, "user not found", "")
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *SCIMService) revokeUserTokens(ctx context.Context, userID string) {
	now := time.Now()
	if _, err := s.pg.NewUpdate().Model((*models.RefreshToken)(nil)).
		Set("revoked = true").Set("revoked_at = ?", now).
		Where("user_id = ? AND revoked = false", userID).Exec(ctx); err != nil {
		s.log.Warn("scim: revoke refresh tokens failed", zap.Error(err))
	}
}

// applyPatchValue applies a replace/add operation to the user.
func applyPatchValue(u *models.User, op models.SCIMPatchOperation) error {
	path := strings.ToLower(strings.Trim(op.Path, "\""))
	switch path {
	case "active":
		b, err := parseSCIMBool(op.Value)
		if err != nil {
			return scimErr(400, "active must be a boolean", "invalidValue")
		}
		u.IsActive = b
	case "name.formatted", "displayname":
		var v string
		if err := unmarshalSCIM(op.Value, &v); err == nil && strings.TrimSpace(v) != "" {
			u.FullName = v
		}
	case "username":
		// userName changes are not supported (email is the stable identity).
	case "":
		// No path: value is a partial resource object.
		var patch struct {
			Active      *bool     `json:"active"`
			DisplayName string    `json:"displayName"`
			Name        *SCIMName `json:"name"`
		}
		if err := unmarshalSCIM(op.Value, &patch); err != nil {
			return scimErr(400, "invalid PATCH value", "invalidValue")
		}
		if patch.Active != nil {
			u.IsActive = *patch.Active
		}
		if name := firstNonEmpty(formattedName(patch.Name), patch.DisplayName); name != "" {
			u.FullName = name
		}
	}
	return nil
}

// SCIMName is a local alias used only for PATCH value decoding.
type SCIMName = models.SCIMName

func formattedName(n *models.SCIMName) string {
	if n == nil {
		return ""
	}
	if strings.TrimSpace(n.Formatted) != "" {
		return n.Formatted
	}
	return strings.TrimSpace(strings.TrimSpace(n.GivenName + " " + n.FamilyName))
}

func displayName(in *models.SCIMUser, fallbackEmail string) string {
	if in == nil {
		return fallbackEmail
	}
	return firstNonEmpty(formattedName(in.Name), in.DisplayName, fallbackEmail)
}

func toSCIMUser(u *models.User) *models.SCIMUser {
	given, family := splitName(u.FullName)
	return &models.SCIMUser{
		Schemas:     []string{models.SCIMUserSchema},
		ID:          u.ID,
		UserName:    u.Email,
		Name:        &models.SCIMName{Formatted: u.FullName, GivenName: given, FamilyName: family},
		DisplayName: u.FullName,
		Emails:      []models.SCIMEmail{{Value: u.Email, Primary: true, Type: "work"}},
		Active:      u.IsActive,
		Meta: &models.SCIMMeta{
			ResourceType: "User",
			Created:      u.CreatedAt.UTC().Format(time.RFC3339),
			LastModified: u.UpdatedAt.UTC().Format(time.RFC3339),
			Location:     "/scim/v2/Users/" + u.ID,
		},
	}
}

func splitName(full string) (given, family string) {
	full = strings.TrimSpace(full)
	if full == "" {
		return "", ""
	}
	parts := strings.SplitN(full, " ", 2)
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], strings.TrimSpace(parts[1])
}

func parseSCIMBool(raw []byte) (bool, error) {
	s := strings.Trim(strings.TrimSpace(string(raw)), `"`)
	return strconv.ParseBool(strings.ToLower(s))
}

func unmarshalSCIM(raw []byte, dst any) error {
	if len(raw) == 0 {
		return errors.New("empty value")
	}
	return json.Unmarshal(raw, dst)
}
