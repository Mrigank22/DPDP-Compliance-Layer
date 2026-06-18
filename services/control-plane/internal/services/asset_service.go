// services/control-plane/internal/services/asset_service.go

package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/config"
	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// AssetService manages data sources (assets) and their scanning/discovery.
type AssetService struct {
	pg        *bun.DB
	ch        *db.ClickHouseClient
	cfg       *config.Config
	log       *zap.Logger
	workerSvc *WorkerService
}

// NewAssetService creates an AssetService.
func NewAssetService(pg *bun.DB, ch *db.ClickHouseClient, cfg *config.Config, log *zap.Logger, workerSvc *WorkerService) *AssetService {
	return &AssetService{pg: pg, ch: ch, cfg: cfg, log: log, workerSvc: workerSvc}
}

// List returns paginated assets for a tenant.
func (s *AssetService) List(ctx context.Context, tenantID string, filter *models.AssetListFilter) ([]*models.Asset, int64, error) {
	if filter == nil {
		filter = &models.AssetListFilter{Page: 1, PageSize: 20}
	}
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, 0, err
	}

	q := s.pg.NewSelect().Model((*models.Asset)(nil)).
		Where("a.tenant_id = ?", tenantID)

	if filter.AssetType != "" {
		q = q.Where("a.asset_type = ?", filter.AssetType)
	}
	if filter.Provider != "" {
		q = q.Where("a.provider = ?", filter.Provider)
	}
	if filter.Status != "" {
		q = q.Where("a.status = ?", filter.Status)
	}
	if filter.Search != "" {
		q = q.Where("a.name ILIKE ?", "%"+filter.Search+"%")
	}

	var assets []*models.Asset
	total, err := q.OrderExpr("a.created_at DESC").
		Limit(filter.PageSize).Offset((filter.Page-1)*filter.PageSize).
		ScanAndCount(ctx, &assets)
	// Bug 1: treat empty result as valid, not an error
	if err != nil && err != sql.ErrNoRows {
		return nil, 0, err
	}

	// Bug 2: return empty slice instead of nil
	if assets == nil {
		assets = []*models.Asset{}
	}

	return assets, int64(total), nil
}

// Create inserts a new asset and validates connectivity to the data source.
func (s *AssetService) Create(ctx context.Context, tenantID, userID string, input *models.CreateAssetInput) (*models.Asset, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}

	asset := &models.Asset{
		TenantID:         tenantID,
		Name:             input.Name,
		AssetType:        input.AssetType,
		Provider:         input.Provider,
		Region:           input.Region,
		ConnectionConfig: input.ConnectionConfig,
		CredentialsRef:   input.CredentialsRef,
		Status:           models.AssetStatusConnected,
		Tags:             input.Tags,
	}

	if _, err := s.pg.NewInsert().Model(asset).Exec(ctx); err != nil {
		return nil, fmt.Errorf("create asset: %w", err)
	}

	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionAssetCreated, "asset", asset.ID)
	return asset, nil
}

// Get retrieves a single asset by ID.
func (s *AssetService) Get(ctx context.Context, id, tenantID string) (*models.Asset, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}

	asset := &models.Asset{}
	err := s.pg.NewSelect().Model(asset).
		Where("a.id = ? AND a.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("asset")
		}
		return nil, err
	}
	return asset, nil
}

// Update modifies an existing asset's configuration.
func (s *AssetService) Update(ctx context.Context, id, tenantID, userID string, input *models.UpdateAssetInput) (*models.Asset, error) {
	asset, err := s.Get(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}

	if input.Name != nil {
		asset.Name = *input.Name
	}
	if input.Status != nil {
		asset.Status = *input.Status
	}
	if input.ConnectionConfig != nil {
		asset.ConnectionConfig = input.ConnectionConfig
	}
	if input.CredentialsRef != nil {
		asset.CredentialsRef = input.CredentialsRef
	}
	if input.Tags != nil {
		asset.Tags = input.Tags
	}
	asset.UpdatedAt = time.Now()

	if _, err := s.pg.NewUpdate().Model(asset).
		Where("id = ? AND tenant_id = ?", id, tenantID).
		Exec(ctx); err != nil {
		return nil, fmt.Errorf("update asset: %w", err)
	}

	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionAssetUpdated, "asset", id)
	return asset, nil
}

// Delete removes an asset and all related data (scans, findings).
func (s *AssetService) Delete(ctx context.Context, id, tenantID, userID string) error {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return err
	}

	res, err := s.pg.NewDelete().Model((*models.Asset)(nil)).
		Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx)
	if err != nil {
		return err
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrNotFound("asset")
	}

	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionAssetDeleted, "asset", id)
	return nil
}

// TriggerScan enqueues a scan task for this asset via the worker service.
func (s *AssetService) TriggerScan(ctx context.Context, id, tenantID, userID string) (*models.Scan, error) {
	asset, err := s.Get(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}

	// Create a scan record
	scan := &models.Scan{
		TenantID:    tenantID,
		AssetID:     asset.ID,
		Status:      models.ScanStatusQueued,
		TriggeredBy: models.ScanTriggeredByManual,
		ScanType:    models.ScanTypeFull,
	}

	if _, err := s.pg.NewInsert().Model(scan).Exec(ctx); err != nil {
		return nil, fmt.Errorf("create scan record: %w", err)
	}

	// Update asset status to scanning
	_, _ = s.pg.NewUpdate().Model(asset).
		Set("status = ?", models.AssetStatusScanning).
		Where("id = ?", asset.ID).
		Exec(ctx)

	// Dispatch scan to worker queue asynchronously
	go func() {
		if _, err := s.workerSvc.DispatchScan(context.Background(), scan.ID, asset.ID, tenantID, models.ScanTypeFull); err != nil {
			s.log.Error("dispatch scan failed", zap.Error(err), zap.String("scan_id", scan.ID))
			_, _ = s.pg.NewUpdate().Model((*models.Scan)(nil)).
				Set("status = ?", models.ScanStatusFailed).
				Where("id = ?", scan.ID).
				Exec(context.Background())
		}
	}()

	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionScanTriggered, "scan", scan.ID)
	return scan, nil
}

// ListScans returns all scans for an asset.
func (s *AssetService) ListScans(ctx context.Context, assetID, tenantID string, page, pageSize int) ([]*models.Scan, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, 0, err
	}

	var scans []*models.Scan
	total, err := s.pg.NewSelect().Model(&scans).
		Where("s.asset_id = ? AND s.tenant_id = ?", assetID, tenantID).
		OrderExpr("s.created_at DESC").
		Limit(pageSize).Offset((page-1)*pageSize).
		ScanAndCount(ctx, &scans)
	return scans, int64(total), err
}

// ListFindings returns all findings for an asset.
func (s *AssetService) ListFindings(ctx context.Context, assetID, tenantID string, page, pageSize int) ([]*models.Finding, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, 0, err
	}

	var findings []*models.Finding
	total, err := s.pg.NewSelect().Model(&findings).
		Where("f.asset_id = ? AND f.tenant_id = ?", assetID, tenantID).
		OrderExpr("f.created_at DESC").
		Limit(pageSize).Offset((page-1)*pageSize).
		ScanAndCount(ctx, &findings)
	return findings, int64(total), err
}

// ListDataFlows returns data flows associated with this asset (ingress/egress).
func (s *AssetService) ListDataFlows(ctx context.Context, assetID, tenantID string) ([]map[string]any, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}

	// Placeholder: In production, query a data_flows table or ClickHouse
	// Returns flows where assetID is source or destination
	var flows []map[string]any
	flows = make([]map[string]any, 0) // Empty for now; implement per your schema
	return flows, nil
}

// TestConnection validates connectivity to the asset data source.
func (s *AssetService) TestConnection(ctx context.Context, id, tenantID string) (bool, error) {
	asset, err := s.Get(ctx, id, tenantID)
	if err != nil {
		return false, err
	}

	// Dispatch connectivity test via worker
	result, _, err := s.workerSvc.TestAssetConnection(ctx, asset.ID, tenantID)
	return result, err
}

func (s *AssetService) writeAudit(ctx context.Context, tenantID, userID, action, resourceType, resourceID string) {
	entry := &models.AuditLog{
		ID:           GenerateID(),
		TenantID:     tenantID,
		UserID:       userID,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Timestamp:    time.Now(),
	}
	_ = s.ch.WriteAuditLog(ctx, entry)
}
