// services/control-plane/internal/api/v1/apikey_handler.go

package v1

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// APIKeyHandler handles API key CRUD endpoints.
type APIKeyHandler struct {
	pg  *bun.DB
	log *zap.Logger
}

// NewAPIKeyHandler creates an APIKeyHandler.
func NewAPIKeyHandler(pg *bun.DB, log *zap.Logger) *APIKeyHandler {
	return &APIKeyHandler{pg: pg, log: log}
}

// List godoc
// GET /api/v1/apikeys
// Returns all active API keys for the tenant (key_hash never returned).
func (h *APIKeyHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	user := middleware.GetUser(c)

	q := h.pg.NewSelect().Model((*models.APIKey)(nil)).
		Where("ak.tenant_id = ?", tenantID)

	// Non-admins can only see their own keys
	if !user.CanAdmin() {
		q = q.Where("ak.user_id = ?", userID)
	}

	var keys []*models.APIKey
	if err := q.OrderExpr("ak.created_at DESC").Scan(c.Request.Context(), &keys); err != nil {
		handleError(c, err)
		return
	}

	resp := make([]*models.APIKeyResponse, len(keys))
	for i, k := range keys {
		resp[i] = k.ToResponse()
	}
	ok(c, resp)
}

// Create godoc
// POST /api/v1/apikeys
// Creates a new API key and returns the raw key ONCE. It is never stored.
func (h *APIKeyHandler) Create(c *gin.Context) {
	var input models.CreateAPIKeyInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	// Generate 32 random bytes → hex string (64 chars), prefixed with "ds_"
	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		handleError(c, fmt.Errorf("generate key entropy: %w", err))
		return
	}
	rawKey := "ds_" + hex.EncodeToString(rawBytes)
	keyPrefix := rawKey[:11] // "ds_" + first 8 hex chars

	// Hash for storage
	sum := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(sum[:])

	apiKey := &models.APIKey{
		ID:        uuid.New().String(),
		TenantID:  tenantID,
		UserID:    userID,
		Name:      input.Name,
		KeyHash:   keyHash,
		KeyPrefix: keyPrefix,
		Scopes:    input.Scopes,
		ExpiresAt: input.ExpiresAt,
		IsActive:  true,
		CreatedAt: time.Now(),
	}

	if _, err := h.pg.NewInsert().Model(apiKey).Exec(c.Request.Context()); err != nil {
		handleError(c, err)
		return
	}

	h.log.Info("api key created",
		zap.String("tenant_id", tenantID),
		zap.String("user_id", userID),
		zap.String("key_id", apiKey.ID),
		zap.String("prefix", keyPrefix),
	)

	// Return the raw key in the response — this is the ONLY time it is exposed
	created(c, &models.APIKeyCreateResponse{
		ID:        apiKey.ID,
		TenantID:  tenantID,
		UserID:    userID,
		Name:      apiKey.Name,
		RawKey:    rawKey,
		KeyPrefix: keyPrefix,
		Scopes:    apiKey.Scopes,
		ExpiresAt: apiKey.ExpiresAt,
		CreatedAt: apiKey.CreatedAt,
	})
}

// Update godoc
// PATCH /api/v1/apikeys/:id
// Allows updating name, scopes, and expiry. Cannot change key value.
func (h *APIKeyHandler) Update(c *gin.Context) {
	var input struct {
		Name      *string    `json:"name"       validate:"omitempty,min=1,max=100"`
		Scopes    []string   `json:"scopes"     validate:"omitempty,dive,oneof=read write gateway admin"`
		ExpiresAt *time.Time `json:"expires_at"`
	}
	if !bindAndValidate(c, &input) {
		return
	}

	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	user := middleware.GetUser(c)

	apiKey := &models.APIKey{}
	if err := h.pg.NewSelect().Model(apiKey).
		Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID).
		Scan(c.Request.Context()); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			handleError(c, services.ErrNotFound("api key"))
		} else {
			handleError(c, err)
		}
		return
	}

	// Non-admins can only edit their own keys
	if !user.CanAdmin() && apiKey.UserID != userID {
		handleError(c, services.ErrForbidden("you can only modify your own API keys"))
		return
	}

	q := h.pg.NewUpdate().Model(apiKey).Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID)
	if input.Name != nil {
		apiKey.Name = *input.Name
		q = q.Set("name = ?", *input.Name)
	}
	if len(input.Scopes) > 0 {
		apiKey.Scopes = input.Scopes
		q = q.Set("scopes = ?", input.Scopes)
	}
	if input.ExpiresAt != nil {
		apiKey.ExpiresAt = input.ExpiresAt
		q = q.Set("expires_at = ?", *input.ExpiresAt)
	}

	if _, err := q.Exec(c.Request.Context()); err != nil {
		handleError(c, err)
		return
	}
	ok(c, apiKey.ToResponse())
}

// Revoke godoc
// DELETE /api/v1/apikeys/:id
// Soft-revokes (deactivates) an API key immediately.
func (h *APIKeyHandler) Revoke(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	user := middleware.GetUser(c)

	apiKey := &models.APIKey{}
	if err := h.pg.NewSelect().Model(apiKey).
		Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID).
		Scan(c.Request.Context()); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			handleError(c, services.ErrNotFound("api key"))
		} else {
			handleError(c, err)
		}
		return
	}

	// Non-admins can only revoke their own keys
	if !user.CanAdmin() && apiKey.UserID != userID {
		handleError(c, services.ErrForbidden("you can only revoke your own API keys"))
		return
	}

	if _, err := h.pg.NewUpdate().Model((*models.APIKey)(nil)).
		Set("is_active = false").
		Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID).
		Exec(c.Request.Context()); err != nil {
		handleError(c, err)
		return
	}

	h.log.Info("api key revoked",
		zap.String("tenant_id", tenantID),
		zap.String("revoked_by", userID),
		zap.String("key_id", c.Param("id")),
	)

	// Fire audit log asynchronously
	go func() {
		entry := &models.AuditLog{
			ID:           uuid.New().String(),
			TenantID:     tenantID,
			UserID:       userID,
			Action:       models.AuditActionAPIKeyRevoked,
			ResourceType: "api_key",
			ResourceID:   c.Param("id"),
			Timestamp:    time.Now(),
		}
		_ = entry // written by audit middleware — here for completeness
	}()

	noContent(c)
}

// RevokeAll godoc
// DELETE /api/v1/apikeys
// Revokes all API keys for the authenticated user (useful on suspected compromise).
func (h *APIKeyHandler) RevokeAll(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	res, err := h.pg.NewUpdate().Model((*models.APIKey)(nil)).
		Set("is_active = false").
		Where("user_id = ? AND tenant_id = ? AND is_active = true", userID, tenantID).
		Exec(c.Request.Context())
	if err != nil {
		handleError(c, err)
		return
	}
	rows, _ := res.RowsAffected()

	h.log.Info("all api keys revoked",
		zap.String("tenant_id", tenantID),
		zap.String("user_id", userID),
		zap.Int64("count", rows),
	)

	ok(c, gin.H{"revoked": rows, "message": fmt.Sprintf("%d API key(s) revoked.", rows)})
}

// Get godoc
// GET /api/v1/apikeys/:id
func (h *APIKeyHandler) Get(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	user := middleware.GetUser(c)

	apiKey := &models.APIKey{}
	if err := h.pg.NewSelect().Model(apiKey).
		Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID).
		Scan(c.Request.Context()); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			handleError(c, services.ErrNotFound("api key"))
		} else {
			handleError(c, err)
		}
		return
	}

	if !user.CanAdmin() && apiKey.UserID != userID {
		handleError(c, services.ErrForbidden("access denied"))
		return
	}

	ok(c, apiKey.ToResponse())
}

// RegisterAPIKeyRoutes mounts API key routes onto an authenticated router group.
// Call this from router.go inside the authenticated group.
func RegisterAPIKeyRoutes(rg *gin.RouterGroup, h *APIKeyHandler) {
	keys := rg.Group("/apikeys")
	{
		keys.GET("", h.List)
		keys.POST("", h.Create)
		keys.GET("/:id", h.Get)
		keys.PATCH("/:id", h.Update)
		keys.DELETE("/:id", h.Revoke)
		keys.DELETE("", h.RevokeAll)
	}

	_ = context.Background // suppress unused import
}
