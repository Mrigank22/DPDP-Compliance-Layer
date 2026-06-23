// services/control-plane/internal/services/rights_service.go

package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

const dpdpDeadlineDays = 90

// RightsService manages Data Subject Requests under the DPDP Act 2023.
type RightsService struct {
	pg        *bun.DB
	ch        *db.ClickHouseClient
	log       *zap.Logger
	workerSvc *WorkerService
}

// NewRightsService creates a RightsService.
func NewRightsService(pg *bun.DB, ch *db.ClickHouseClient, log *zap.Logger, workerSvc *WorkerService) *RightsService {
	return &RightsService{pg: pg, ch: ch, log: log, workerSvc: workerSvc}
}

// List returns paginated rights requests for a tenant.
func (s *RightsService) List(ctx context.Context, tenantID string, filter *models.RightsRequestListFilter) ([]*models.RightsRequest, int64, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, 0, err
	}

	q := s.pg.NewSelect().Model((*models.RightsRequest)(nil)).
		Where("rr.tenant_id = ?", tenantID)
	if filter.RequestType != "" {
		q = q.Where("rr.request_type = ?", filter.RequestType)
	}
	if filter.Status != "" {
		q = q.Where("rr.status = ?", filter.Status)
	}
	if filter.Overdue != nil && *filter.Overdue {
		q = q.Where("rr.due_date < NOW() AND rr.status NOT IN ('completed','rejected')")
	}

	var requests []*models.RightsRequest
	total, err := q.OrderExpr("rr.due_date ASC").
		Limit(filter.PageSize).Offset((filter.Page-1)*filter.PageSize).
		ScanAndCount(ctx, &requests)

	// Add these lines:
	if err != nil && err != sql.ErrNoRows {
		return nil, 0, err
	}
	if requests == nil {
		requests = []*models.RightsRequest{}
	}

	return requests, int64(total), err
}

// GetByID returns a single rights request.
func (s *RightsService) GetByID(ctx context.Context, id, tenantID string) (*models.RightsRequest, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	rr := &models.RightsRequest{}
	err := s.pg.NewSelect().Model(rr).
		Relation("Assignee").
		Where("rr.id = ? AND rr.tenant_id = ?", id, tenantID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound("rights request")
		}
		return nil, err
	}
	return rr, nil
}

// Create opens a new Data Subject Request with the 90-day statutory deadline.
func (s *RightsService) Create(ctx context.Context, tenantID, userID string, input *models.CreateRightsRequestInput) (*models.RightsRequest, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	rr := &models.RightsRequest{
		TenantID:           tenantID,
		RequestType:        input.RequestType,
		DataPrincipalEmail: input.DataPrincipalEmail,
		DataPrincipalName:  input.DataPrincipalName,
		Status:             models.RightsStatusReceived,
		DueDate:            time.Now().AddDate(0, 0, dpdpDeadlineDays),
		Notes:              input.Notes,
	}
	if _, err := s.pg.NewInsert().Model(rr).Exec(ctx); err != nil {
		return nil, fmt.Errorf("create rights request: %w", err)
	}

	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionRightsRequestCreated, "rights_request", rr.ID)
	return rr, nil
}

// Update applies status transitions and note updates.
func (s *RightsService) Update(ctx context.Context, id, tenantID, userID string, input *models.UpdateRightsRequestInput) (*models.RightsRequest, error) {
	rr, err := s.GetByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}

	q := s.pg.NewUpdate().Model(rr).Where("id = ? AND tenant_id = ?", id, tenantID)

	if input.Status != nil {
		rr.Status = *input.Status
		q = q.Set("status = ?", *input.Status)
	}
	if input.AssignedTo != nil {
		rr.AssignedTo = input.AssignedTo
		q = q.Set("assigned_to = ?", *input.AssignedTo)
	}
	if input.Notes != nil {
		rr.Notes = input.Notes
		q = q.Set("notes = ?", *input.Notes)
	}
	if input.ResponseData != nil {
		rr.ResponseData = input.ResponseData
		q = q.Set("response_data = ?", input.ResponseData)
	}
	if input.RejectionReason != nil {
		rr.RejectionReason = input.RejectionReason
		q = q.Set("rejection_reason = ?", *input.RejectionReason)
	}

	if _, err := q.Exec(ctx); err != nil {
		return nil, err
	}
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionRightsRequestUpdated, "rights_request", id)
	return rr, nil
}

// Complete marks a request as completed and stores the response data.
func (s *RightsService) Complete(ctx context.Context, id, tenantID, userID string, responseData map[string]any) (*models.RightsRequest, error) {
	statusCompleted := models.RightsStatusCompleted
	return s.Update(ctx, id, tenantID, userID, &models.UpdateRightsRequestInput{
		Status:       &statusCompleted,
		ResponseData: responseData,
	})
}

// Reject marks a request as rejected with a mandatory reason.
func (s *RightsService) Reject(ctx context.Context, id, tenantID, userID, reason string) (*models.RightsRequest, error) {
	statusRejected := models.RightsStatusRejected
	return s.Update(ctx, id, tenantID, userID, &models.UpdateRightsRequestInput{
		Status:          &statusRejected,
		RejectionReason: &reason,
	})
}

// Assign assigns a request to a team member.
func (s *RightsService) Assign(ctx context.Context, id, tenantID, userID, assigneeID string) (*models.RightsRequest, error) {
	inProgress := models.RightsStatusInProgress
	return s.Update(ctx, id, tenantID, userID, &models.UpdateRightsRequestInput{
		AssignedTo: &assigneeID,
		Status:     &inProgress,
	})
}

// Verify records that the data principal's identity has been confirmed and kicks
// off automated discovery across the tenant's connected assets. Identity
// verification is a deliberate human gate (DPDP requires confirming the
// requester) — everything after it is automated.
func (s *RightsService) Verify(ctx context.Context, id, tenantID, userID, method string) (*models.RightsRequest, error) {
	rr, err := s.GetByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	if rr.Status == models.RightsStatusCompleted || rr.Status == models.RightsStatusRejected {
		return nil, ErrConflict("request is already closed")
	}
	if method == "" {
		method = "manual"
	}
	now := time.Now()
	rr.VerifiedAt = &now
	rr.VerificationMethod = &method
	rr.VerifiedBy = &userID
	if rr.Status == models.RightsStatusReceived {
		rr.Status = models.RightsStatusInProgress
	}
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	if _, err := s.pg.NewUpdate().Model(rr).
		Set("verified_at = ?", now).
		Set("verification_method = ?", method).
		Set("verified_by = ?", userID).
		Set("status = ?", rr.Status).
		Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx); err != nil {
		return nil, err
	}

	// Automated discovery across all connected assets.
	if _, derr := s.workerSvc.DispatchRightsSearch(ctx, id, rr.DataPrincipalEmail, tenantID); derr != nil {
		s.log.Warn("dispatch discovery after verify failed",
			zap.String("request_id", id), zap.Error(derr))
	}
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionRightsRequestUpdated, "rights_request", id)
	return rr, nil
}

// Approve authorises an erasure request after discovery and dispatches the
// (automated) erasure execution. This is the safety gate: destructive deletion
// never runs without an explicit human approval on a verified, discovered request.
func (s *RightsService) Approve(ctx context.Context, id, tenantID, userID string) (*models.RightsRequest, error) {
	rr, err := s.GetByID(ctx, id, tenantID)
	if err != nil {
		return nil, err
	}
	if rr.RequestType != models.RightsTypeErasure {
		return nil, ErrInvalidInput("only erasure requests require approval")
	}
	if rr.Status != models.RightsStatusPendingApproval {
		return nil, ErrConflict("request is not awaiting approval")
	}
	if rr.VerifiedAt == nil {
		return nil, ErrConflict("data principal identity must be verified before approval")
	}
	now := time.Now()
	rr.ApprovedBy = &userID
	rr.ApprovedAt = &now
	rr.Status = models.RightsStatusInProgress
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	if _, err := s.pg.NewUpdate().Model(rr).
		Set("approved_by = ?", userID).
		Set("approved_at = ?", now).
		Set("status = ?", rr.Status).
		Where("id = ? AND tenant_id = ?", id, tenantID).Exec(ctx); err != nil {
		return nil, err
	}
	if _, derr := s.workerSvc.DispatchRightsErasure(ctx, id, tenantID); derr != nil {
		return nil, fmt.Errorf("dispatch erasure: %w", derr)
	}
	go s.writeAudit(context.Background(), tenantID, userID, models.AuditActionRightsRequestUpdated, "rights_request", id)
	return rr, nil
}

// GetOverdue returns all requests past their 90-day DPDP deadline.
func (s *RightsService) GetOverdue(ctx context.Context, tenantID string) ([]*models.RightsRequest, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	var requests []*models.RightsRequest
	err := s.pg.NewSelect().Model(&requests).
		Where("tenant_id = ? AND due_date < NOW() AND status NOT IN ('completed', 'rejected')", tenantID).
		OrderExpr("due_date ASC").
		Scan(ctx)
	return requests, err
}

// SearchPrincipal dispatches a worker task to search all connected assets
// for records belonging to the given data principal.
func (s *RightsService) SearchPrincipal(ctx context.Context, tenantID, userID, requestID string) (string, error) {
	rr, err := s.GetByID(ctx, requestID, tenantID)
	if err != nil {
		return "", err
	}
	taskID, err := s.workerSvc.DispatchRightsSearch(ctx, requestID, rr.DataPrincipalEmail, tenantID)
	if err != nil {
		return "", fmt.Errorf("dispatch rights search: %w", err)
	}
	return taskID, nil
}

func (s *RightsService) writeAudit(ctx context.Context, tenantID, userID, action, resourceType, resourceID string) {
	entry := &models.AuditLog{
		ID: GenerateID(), TenantID: tenantID, UserID: userID,
		Action: action, ResourceType: resourceType, ResourceID: resourceID,
		Timestamp: time.Now(),
	}
	_ = s.ch.WriteAuditLog(ctx, entry)
}
