// services/control-plane/internal/api/v1/consent_handler.go

package v1

import (
	"context"
	"database/sql"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// ConsentHandler handles consent record management endpoints.
type ConsentHandler struct {
	pg  *bun.DB
	log *zap.Logger
}

// NewConsentHandler creates a ConsentHandler.
func NewConsentHandler(pg *bun.DB, log *zap.Logger) *ConsentHandler {
	return &ConsentHandler{pg: pg, log: log}
}

// Record godoc
// POST /api/v1/consent/record
// Records a new consent event for a data principal.
func (h *ConsentHandler) Record(c *gin.Context) {
	var input struct {
		DataPrincipalID  string         `json:"data_principal_id"  validate:"required"`
		Purpose          string         `json:"purpose"            validate:"required,min=1,max=500"`
		ConsentGiven     bool           `json:"consent_given"`
		NoticeVersion    *string        `json:"notice_version"`
		ConsentTimestamp *time.Time     `json:"consent_timestamp"`
		Mechanism        string         `json:"mechanism"          validate:"omitempty,oneof=form api sdk import"`
		Metadata         map[string]any `json:"metadata"`
	}
	if !bindAndValidate(c, &input) {
		return
	}

	tenantID := middleware.GetTenantID(c)
	now := time.Now()
	if input.ConsentTimestamp == nil {
		input.ConsentTimestamp = &now
	}
	mechanism := "api"
	if input.Mechanism != "" {
		mechanism = input.Mechanism
	}

	ipAddr := c.ClientIP()
	record := &models.ConsentRecord{
		ID:               uuid.New().String(),
		TenantID:         tenantID,
		DataPrincipalID:  input.DataPrincipalID,
		Purpose:          input.Purpose,
		ConsentGiven:     input.ConsentGiven,
		ConsentTimestamp: input.ConsentTimestamp,
		NoticeVersion:    input.NoticeVersion,
		IPAddress:        &ipAddr,
		ConsentMechanism: mechanism,
		Metadata:         input.Metadata,
		CreatedAt:        now,
	}

	if _, err := h.pg.NewInsert().Model(record).Exec(c.Request.Context()); err != nil {
		handleError(c, err)
		return
	}
	created(c, record)
}

// GetByPrincipal godoc
// GET /api/v1/consent/principal/:id
// Returns all consent records for a data principal, newest first.
func (h *ConsentHandler) GetByPrincipal(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	principalID := c.Param("id")

	if principalID == "" {
		handleError(c, services.ErrInvalidInput("data_principal_id is required"))
		return
	}

	var records []*models.ConsentRecord
	if err := h.pg.NewSelect().Model(&records).
		Where("tenant_id = ? AND data_principal_id = ?", tenantID, principalID).
		OrderExpr("created_at DESC").
		Scan(c.Request.Context()); err != nil {
		handleError(c, err)
		return
	}

	ok(c, gin.H{
		"data_principal_id": principalID,
		"records":           records,
		"count":             len(records),
	})
}

// Withdraw godoc
// POST /api/v1/consent/withdraw/:id
// Records a consent withdrawal for a specific consent record.
func (h *ConsentHandler) Withdraw(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)

	record := &models.ConsentRecord{}
	if err := h.pg.NewSelect().Model(record).
		Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID).
		Scan(c.Request.Context()); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			handleError(c, services.ErrNotFound("consent record"))
		} else {
			handleError(c, err)
		}
		return
	}

	if record.WithdrawalTimestamp != nil {
		// Already withdrawn — idempotent
		ok(c, record)
		return
	}

	now := time.Now()
	record.ConsentGiven = false
	record.WithdrawalTimestamp = &now

	if _, err := h.pg.NewUpdate().Model(record).
		Set("consent_given = false").
		Set("withdrawal_timestamp = ?", now).
		Where("id = ? AND tenant_id = ?", c.Param("id"), tenantID).
		Exec(c.Request.Context()); err != nil {
		handleError(c, err)
		return
	}

	h.log.Info("consent withdrawn",
		zap.String("tenant_id", tenantID),
		zap.String("record_id", record.ID),
		zap.String("principal_id", record.DataPrincipalID),
	)
	ok(c, record)
}

// WithdrawByPrincipal godoc
// POST /api/v1/consent/withdraw-all/:principal_id
// Withdraws all active consents for a data principal (e.g., on erasure request).
func (h *ConsentHandler) WithdrawByPrincipal(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	principalID := c.Param("principal_id")

	now := time.Now()
	res, err := h.pg.NewUpdate().Model((*models.ConsentRecord)(nil)).
		Set("consent_given = false").
		Set("withdrawal_timestamp = ?", now).
		Where("tenant_id = ? AND data_principal_id = ? AND consent_given = true AND withdrawal_timestamp IS NULL",
			tenantID, principalID).
		Exec(c.Request.Context())
	if err != nil {
		handleError(c, err)
		return
	}
	rows, _ := res.RowsAffected()
	ok(c, gin.H{
		"data_principal_id": principalID,
		"withdrawn_count":   rows,
		"withdrawn_at":      now,
	})
}

// Summary godoc
// GET /api/v1/consent/summary
// Returns aggregate consent statistics for the tenant.
func (h *ConsentHandler) Summary(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	ctx := c.Request.Context()

	type purposeRow struct {
		Purpose        string `bun:"purpose"          json:"purpose"`
		Total          int64  `bun:"total"            json:"total"`
		GivenCount     int64  `bun:"given_count"      json:"given_count"`
		WithdrawnCount int64  `bun:"withdrawn_count"  json:"withdrawn_count"`
	}

	total, _ := h.pg.NewSelect().Model((*models.ConsentRecord)(nil)).
		Where("tenant_id = ?", tenantID).Count(ctx)

	given, _ := h.pg.NewSelect().Model((*models.ConsentRecord)(nil)).
		Where("tenant_id = ? AND consent_given = true", tenantID).Count(ctx)

	withdrawn, _ := h.pg.NewSelect().Model((*models.ConsentRecord)(nil)).
		Where("tenant_id = ? AND withdrawal_timestamp IS NOT NULL", tenantID).Count(ctx)

	var byPurpose []purposeRow
	_ = h.pg.NewSelect().
		TableExpr("consent_records").
		ColumnExpr(`purpose,
			count(*) AS total,
			count(*) FILTER (WHERE consent_given = true) AS given_count,
			count(*) FILTER (WHERE withdrawal_timestamp IS NOT NULL) AS withdrawn_count`).
		Where("tenant_id = ?", tenantID).
		GroupExpr("purpose").
		OrderExpr("total DESC").
		Scan(ctx, &byPurpose)

	ok(c, gin.H{
		"total_records":     total,
		"consent_given":     given,
		"consent_withdrawn": withdrawn,
		"by_purpose":        byPurpose,
	})
}

// Import godoc
// POST /api/v1/consent/import
// Bulk-imports consent records from a CSV file.
// Expected CSV columns: data_principal_id, purpose, consent_given (true/false),
//
//	consent_timestamp (RFC3339 or empty), notice_version (optional)
func (h *ConsentHandler) Import(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		handleError(c, services.ErrInvalidInput("file field is required (multipart/form-data)"))
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true
	reader.Comment = '#'

	// Read header
	header, err := reader.Read()
	if err != nil {
		handleError(c, services.ErrInvalidInput("CSV has no header row"))
		return
	}

	// Build column index map
	colIdx := make(map[string]int)
	for i, h := range header {
		colIdx[strings.ToLower(strings.TrimSpace(h))] = i
	}
	required := []string{"data_principal_id", "purpose", "consent_given"}
	for _, req := range required {
		if _, ok := colIdx[req]; !ok {
			handleError(c, services.ErrInvalidInput(fmt.Sprintf("CSV missing required column: %s", req)))
			return
		}
	}

	var records []*models.ConsentRecord
	var importErrors []string
	lineNum := 1

	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		lineNum++
		if err != nil {
			importErrors = append(importErrors, fmt.Sprintf("line %d: parse error: %v", lineNum, err))
			continue
		}

		get := func(col string) string {
			idx, ok := colIdx[col]
			if !ok || idx >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[idx])
		}

		consentGiven, _ := strconv.ParseBool(get("consent_given"))
		var consentTS *time.Time
		if ts := get("consent_timestamp"); ts != "" {
			if parsed, err := time.Parse(time.RFC3339, ts); err == nil {
				consentTS = &parsed
			}
		}
		now := time.Now()
		if consentTS == nil {
			consentTS = &now
		}

		noticeVer := get("notice_version")
		var noticeVerPtr *string
		if noticeVer != "" {
			noticeVerPtr = &noticeVer
		}

		record := &models.ConsentRecord{
			ID:               uuid.New().String(),
			TenantID:         tenantID,
			DataPrincipalID:  get("data_principal_id"),
			Purpose:          get("purpose"),
			ConsentGiven:     consentGiven,
			ConsentTimestamp: consentTS,
			NoticeVersion:    noticeVerPtr,
			ConsentMechanism: "import",
			Metadata:         map[string]any{},
			CreatedAt:        now,
		}

		if record.DataPrincipalID == "" || record.Purpose == "" {
			importErrors = append(importErrors, fmt.Sprintf("line %d: data_principal_id and purpose are required", lineNum))
			continue
		}
		records = append(records, record)
	}

	if len(records) == 0 {
		handleError(c, services.ErrInvalidInput("no valid records found in CSV"))
		return
	}

	// Batch insert in chunks of 500
	const chunkSize = 500
	imported := 0
	for i := 0; i < len(records); i += chunkSize {
		end := i + chunkSize
		if end > len(records) {
			end = len(records)
		}
		chunk := records[i:end]
		if _, err := h.pg.NewInsert().Model(&chunk).Exec(c.Request.Context()); err != nil {
			importErrors = append(importErrors, fmt.Sprintf("batch insert error (rows %d-%d): %v", i, end, err))
			continue
		}
		imported += end - i
	}

	h.log.Info("consent records imported",
		zap.String("tenant_id", tenantID),
		zap.Int("imported", imported),
		zap.Int("errors", len(importErrors)),
	)

	ok(c, gin.H{
		"imported": imported,
		"errors":   importErrors,
	})
}

// List godoc
// GET /api/v1/consent
// Returns paginated consent records with optional filters.
func (h *ConsentHandler) List(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	page, pageSize := pagination(c)

	q := h.pg.NewSelect().Model((*models.ConsentRecord)(nil)).
		Where("tenant_id = ?", tenantID)

	if purpose := c.Query("purpose"); purpose != "" {
		q = q.Where("purpose = ?", purpose)
	}
	if pid := c.Query("data_principal_id"); pid != "" {
		q = q.Where("data_principal_id = ?", pid)
	}
	if given := c.Query("consent_given"); given == "true" {
		q = q.Where("consent_given = true")
	} else if given == "false" {
		q = q.Where("consent_given = false")
	}

	var records []*models.ConsentRecord
	total, err := q.OrderExpr("created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).
		ScanAndCount(c.Request.Context())
	if err != nil {
		handleError(c, err)
		return
	}
	okPaginated(c, records, models.NewPagination(page, pageSize, int64(total)))
}

// RegisterConsentRoutes mounts consent routes onto an authenticated router group.
func RegisterConsentRoutes(rg *gin.RouterGroup, h *ConsentHandler) {
	consent := rg.Group("/consent")
	{
		consent.GET("", h.List)
		consent.POST("/record", h.Record)
		consent.GET("/principal/:id", h.GetByPrincipal)
		consent.POST("/withdraw/:id", h.Withdraw)
		consent.POST("/withdraw-all/:principal_id", h.WithdrawByPrincipal)
		consent.GET("/summary", h.Summary)
		consent.POST("/import", h.Import)
	}

	_ = context.Background
}
