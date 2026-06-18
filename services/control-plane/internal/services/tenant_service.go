// services/control-plane/internal/services/tenant_service.go

package services

import (
	"context"
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/models"
)

// TenantService manages tenant CRUD operations.
type TenantService struct {
	pg  *bun.DB
	log *zap.Logger
}

// NewTenantService creates a TenantService.
func NewTenantService(pg *bun.DB, log *zap.Logger) *TenantService {
	return &TenantService{pg: pg, log: log}
}

// GetByID returns a tenant by primary key.
func (s *TenantService) GetByID(ctx context.Context, id string) (*models.Tenant, error) {
	tenant := &models.Tenant{}
	err := s.pg.NewSelect().Model(tenant).Where("t.id = ?", id).Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("tenant")
		}
		return nil, err
	}
	return tenant, nil
}

// GetBySlug returns a tenant by slug.
func (s *TenantService) GetBySlug(ctx context.Context, slug string) (*models.Tenant, error) {
	tenant := &models.Tenant{}
	err := s.pg.NewSelect().Model(tenant).Where("t.slug = ?", slug).Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("tenant")
		}
		return nil, err
	}
	return tenant, nil
}

// Update applies partial updates to a tenant record.
func (s *TenantService) Update(ctx context.Context, id string, input *models.UpdateTenantInput) (*models.Tenant, error) {
	tenant, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	q := s.pg.NewUpdate().Model(tenant).Where("id = ?", id)

	if input.Name != nil {
		tenant.Name = *input.Name
		q = q.Set("name = ?", *input.Name)
	}
	if input.Plan != nil {
		tenant.Plan = *input.Plan
		q = q.Set("plan = ?", *input.Plan)
	}
	if input.IsActive != nil {
		tenant.IsActive = *input.IsActive
		q = q.Set("is_active = ?", *input.IsActive)
	}
	if input.DataRegion != nil {
		tenant.DataRegion = *input.DataRegion
		q = q.Set("data_region = ?", *input.DataRegion)
	}
	if input.PrivateDeploy != nil {
		tenant.PrivateDeploy = *input.PrivateDeploy
		q = q.Set("private_deploy = ?", *input.PrivateDeploy)
	}
	if input.Settings != nil {
		tenant.Settings = input.Settings
		q = q.Set("settings = ?", input.Settings)
	}

	if _, err := q.Exec(ctx); err != nil {
		return nil, err
	}
	return tenant, nil
}

// ListAll returns all tenants (super-admin only).
func (s *TenantService) ListAll(ctx context.Context, page, pageSize int) ([]*models.Tenant, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var tenants []*models.Tenant
	total, err := s.pg.NewSelect().Model(&tenants).
		OrderExpr("created_at DESC").
		Limit(pageSize).Offset(offset).
		ScanAndCount(ctx, &tenants)
	return tenants, int64(total), err
}

// Suspend deactivates a tenant account.
func (s *TenantService) Suspend(ctx context.Context, id string) error {
	_, err := s.pg.NewUpdate().Model((*models.Tenant)(nil)).
		Set("is_active = false").
		Where("id = ?", id).
		Exec(ctx)
	return err
}

// GenerateID returns a new UUID string (for use in service tests).
func GenerateID() string { return uuid.New().String() }
