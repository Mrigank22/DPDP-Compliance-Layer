// services/control-plane/internal/services/detection_service.go

package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// DetectionService manages per-tenant PII-detection tuning (custom detectors,
// ignore-lists and the confidence threshold).
type DetectionService struct {
	pg  *bun.DB
	log *zap.Logger
}

func NewDetectionService(pg *bun.DB, log *zap.Logger) *DetectionService {
	return &DetectionService{pg: pg, log: log}
}

// Get returns the tenant's detection settings, or sensible defaults when none
// have been configured yet.
func (s *DetectionService) Get(ctx context.Context, tenantID string) (*models.DetectionSetting, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	ds := &models.DetectionSetting{}
	err := s.pg.NewSelect().Model(ds).
		Where("ds.tenant_id = ?", tenantID).
		Limit(1).Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return &models.DetectionSetting{
				TenantID:            tenantID,
				ConfidenceThreshold: models.DefaultConfidenceThreshold,
				CustomPIITypes:      []models.CustomPIIType{},
				IgnorePatterns:      []models.IgnorePattern{},
			}, nil
		}
		return nil, err
	}
	if ds.CustomPIITypes == nil {
		ds.CustomPIITypes = []models.CustomPIIType{}
	}
	if ds.IgnorePatterns == nil {
		ds.IgnorePatterns = []models.IgnorePattern{}
	}
	return ds, nil
}

// Upsert validates and stores the tenant's detection settings. Every regular
// expression is compiled with Go's RE2 engine, which is linear-time and immune
// to catastrophic backtracking (ReDoS).
func (s *DetectionService) Upsert(ctx context.Context, tenantID, userID string, in *models.UpsertDetectionSettingsInput) (*models.DetectionSetting, error) {
	if in.ConfidenceThreshold < 0 || in.ConfidenceThreshold > 1 {
		return nil, ErrInvalidInput("confidence_threshold must be between 0 and 1")
	}
	custom, err := sanitizeCustomTypes(in.CustomPIITypes)
	if err != nil {
		return nil, err
	}
	ignore, err := sanitizeIgnorePatterns(in.IgnorePatterns)
	if err != nil {
		return nil, err
	}

	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}
	now := time.Now()
	ds := &models.DetectionSetting{
		TenantID:            tenantID,
		ConfidenceThreshold: in.ConfidenceThreshold,
		CustomPIITypes:      custom,
		IgnorePatterns:      ignore,
		UpdatedBy:           &userID,
		UpdatedAt:           now,
	}
	_, err = s.pg.NewInsert().Model(ds).
		On("CONFLICT (tenant_id) DO UPDATE").
		Set("confidence_threshold = EXCLUDED.confidence_threshold").
		Set("custom_pii_types = EXCLUDED.custom_pii_types").
		Set("ignore_patterns = EXCLUDED.ignore_patterns").
		Set("updated_by = EXCLUDED.updated_by").
		Set("updated_at = EXCLUDED.updated_at").
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("upsert detection settings: %w", err)
	}
	return s.Get(ctx, tenantID)
}

var detectionKeyStrip = regexp.MustCompile(`[^A-Z0-9_]`)

func sanitizeCustomTypes(in []models.CustomPIIType) ([]models.CustomPIIType, error) {
	if len(in) > models.MaxCustomPIITypes {
		return nil, ErrInvalidInput(fmt.Sprintf("too many custom PII types (max %d)", models.MaxCustomPIITypes))
	}
	out := make([]models.CustomPIIType, 0, len(in))
	seen := make(map[string]bool, len(in))
	for _, t := range in {
		key := detectionKeyStrip.ReplaceAllString(strings.ToUpper(strings.TrimSpace(t.Key)), "_")
		key = strings.Trim(key, "_")
		if key == "" {
			return nil, ErrInvalidInput("each custom PII type needs a key (letters, digits, underscore)")
		}
		if seen[key] {
			continue
		}
		seen[key] = true

		pattern := strings.TrimSpace(t.Regex)
		if pattern == "" {
			return nil, ErrInvalidInput("regex is required for custom PII type " + key)
		}
		if len(pattern) > models.MaxDetectionRegexLength {
			return nil, ErrInvalidInput("regex too long for " + key)
		}
		if _, err := regexp.Compile(pattern); err != nil {
			return nil, ErrInvalidInput("invalid regex for " + key + ": " + err.Error())
		}

		score := t.Score
		if score <= 0 || score > 1 {
			score = 0.85
		}
		label := strings.TrimSpace(t.Label)
		if label == "" {
			label = key
		}
		out = append(out, models.CustomPIIType{
			Key: key, Label: label, Regex: pattern, Score: score, Enabled: t.Enabled,
		})
	}
	return out, nil
}

func sanitizeIgnorePatterns(in []models.IgnorePattern) ([]models.IgnorePattern, error) {
	if len(in) > models.MaxIgnorePatterns {
		return nil, ErrInvalidInput(fmt.Sprintf("too many ignore patterns (max %d)", models.MaxIgnorePatterns))
	}
	out := make([]models.IgnorePattern, 0, len(in))
	seen := make(map[string]bool, len(in))
	for _, p := range in {
		pattern := strings.TrimSpace(p.Pattern)
		if pattern == "" {
			continue
		}
		if seen[pattern] {
			continue
		}
		seen[pattern] = true
		if len(pattern) > models.MaxDetectionRegexLength {
			return nil, ErrInvalidInput("ignore pattern too long")
		}
		if _, err := regexp.Compile(pattern); err != nil {
			return nil, ErrInvalidInput("invalid ignore pattern: " + err.Error())
		}
		out = append(out, models.IgnorePattern{Pattern: pattern, Note: strings.TrimSpace(p.Note)})
	}
	return out, nil
}
