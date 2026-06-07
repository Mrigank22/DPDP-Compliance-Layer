// services/control-plane/internal/api/v1/user_handler.go

package v1

import (
	"context"
	"database/sql"
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// UserHandler handles team / user management endpoints.
type UserHandler struct {
	pg  *bun.DB
	log *zap.Logger
}

// NewUserHandler creates a UserHandler.
func NewUserHandler(pg *bun.DB, log *zap.Logger) *UserHandler {
	return &UserHandler{pg: pg, log: log}
}

// ListTeam godoc
// GET /api/v1/team
func (h *UserHandler) ListTeam(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)
	offset := (page - 1) * pageSize

	var users []*models.User
	total, err := h.pg.NewSelect().Model(&users).
		Where("tenant_id = ?", tenantID).
		OrderExpr("created_at ASC").
		Limit(pageSize).Offset(offset).
		ScanAndCount(c.Request.Context())
	if err != nil {
		handleError(c, err)
		return
	}

	resp := make([]*models.UserResponse, len(users))
	for i, u := range users {
		resp[i] = u.ToResponse()
	}
	okPaginated(c, resp, models.NewPagination(page, pageSize, int64(total)))
}

// GetTeamMember godoc
// GET /api/v1/team/:id
func (h *UserHandler) GetTeamMember(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	user := &models.User{}
	err := h.pg.NewSelect().Model(user).
		Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID).
		Scan(c.Request.Context())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			handleError(c, services.ErrNotFound("user"))
		} else {
			handleError(c, err)
		}
		return
	}
	ok(c, user.ToResponse())
}

// UpdateTeamMember godoc
// PATCH /api/v1/team/:id
func (h *UserHandler) UpdateTeamMember(c *gin.Context) {
	var input models.UpdateUserInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)
	requester := middleware.GetUser(c)

	// Only owners can change roles; admins can only deactivate
	if input.Role != nil && !requester.HasRole(models.RoleOwner) {
		handleError(c, services.ErrForbidden("only owners can change user roles"))
		return
	}

	user := &models.User{}
	if err := h.pg.NewSelect().Model(user).
		Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID).
		Scan(c.Request.Context()); err != nil {
		handleError(c, services.ErrNotFound("user"))
		return
	}

	q := h.pg.NewUpdate().Model(user).Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID)
	if input.FullName != nil { q = q.Set("full_name = ?", *input.FullName) }
	if input.Role != nil { q = q.Set("role = ?", *input.Role) }
	if input.IsActive != nil { q = q.Set("is_active = ?", *input.IsActive) }

	if _, err := q.Exec(c.Request.Context()); err != nil {
		handleError(c, err)
		return
	}
	// Re-fetch updated user
	_ = h.pg.NewSelect().Model(user).
		Where("id = ?", c.Param("id")).
		Scan(context.Background())
	ok(c, user.ToResponse())
}

// RemoveTeamMember godoc
// DELETE /api/v1/team/:id
func (h *UserHandler) RemoveTeamMember(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	requesterID := middleware.GetUserID(c)

	if c.Param("id") == requesterID {
		handleError(c, services.ErrInvalidInput("you cannot remove yourself from the team"))
		return
	}

	res, err := h.pg.NewUpdate().Model((*models.User)(nil)).
		Set("is_active = false").
		Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID).
		Exec(c.Request.Context())
	if err != nil {
		handleError(c, err)
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		handleError(c, services.ErrNotFound("user"))
		return
	}
	noContent(c)
}
