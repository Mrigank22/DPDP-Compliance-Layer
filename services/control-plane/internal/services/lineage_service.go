// services/control-plane/internal/services/lineage_service.go

package services

import (
	"context"
	"net/url"
	"strings"

	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/models"
)

// LineageService assembles a personal-data lineage graph by joining the data
// inventory (assets + discovered PII) with observed egress flows.
type LineageService struct {
	pg  *bun.DB
	log *zap.Logger
}

func NewLineageService(pg *bun.DB, log *zap.Logger) *LineageService {
	return &LineageService{pg: pg, log: log}
}

// BuildGraph returns the lineage graph for a tenant.
func (s *LineageService) BuildGraph(ctx context.Context, tenantID string) (*models.LineageGraph, error) {
	if err := db.SetTenantContext(ctx, s.pg, tenantID); err != nil {
		return nil, err
	}

	var assets []*models.Asset
	if err := s.pg.NewSelect().Model(&assets).
		Where("a.tenant_id = ?", tenantID).
		OrderExpr("a.risk_score DESC").Scan(ctx); err != nil {
		return nil, err
	}

	// PII categories per asset, from unresolved findings.
	var fRows []struct {
		AssetID  string   `bun:"asset_id"`
		PIITypes []string `bun:"pii_types,array"`
	}
	if err := s.pg.NewSelect().Model((*models.Finding)(nil)).
		Column("asset_id", "pii_types").
		Where("tenant_id = ? AND is_resolved = false", tenantID).
		Scan(ctx, &fRows); err != nil {
		s.log.Warn("lineage findings query failed", zap.Error(err))
	}
	piiByAsset := make(map[string]map[string]bool, len(fRows))
	for _, r := range fRows {
		set := piiByAsset[r.AssetID]
		if set == nil {
			set = map[string]bool{}
			piiByAsset[r.AssetID] = set
		}
		for _, p := range r.PIITypes {
			if p != "" {
				set[p] = true
			}
		}
	}

	var flows []*models.DataFlow
	if err := s.pg.NewSelect().Model(&flows).
		Where("df.tenant_id = ?", tenantID).
		OrderExpr("df.last_seen_at DESC").Scan(ctx); err != nil {
		return nil, err
	}

	flowsByAsset := map[string]int{}
	destAgg := map[string]*models.LineageDestination{}
	edges := make([]*models.LineageEdge, 0, len(flows))
	unapproved := 0

	for _, f := range flows {
		key := lineageHost(f.DestinationURL)
		if f.SourceAssetID != nil {
			flowsByAsset[*f.SourceAssetID]++
		}
		if !f.IsApproved {
			unapproved++
		}

		d := destAgg[key]
		if d == nil {
			d = &models.LineageDestination{
				Key:             key,
				URL:             f.DestinationURL,
				Host:            key,
				DestinationType: f.DestinationType,
				Approved:        true,
				External:        isExternalDest(f.DestinationType),
			}
			destAgg[key] = d
		}
		d.PIITypes = mergeUnique(d.PIITypes, f.PIITypesInvolved)
		d.EventCount += f.EventCount
		d.FlowCount++
		if !f.IsApproved {
			d.Approved = false
		}

		edges = append(edges, &models.LineageEdge{
			ID:              f.ID,
			SourceAssetID:   f.SourceAssetID,
			DestinationKey:  key,
			DestinationType: f.DestinationType,
			PIITypes:        f.PIITypesInvolved,
			Approved:        f.IsApproved,
			EventCount:      f.EventCount,
			LastSeenAt:      f.LastSeenAt,
		})
	}

	lAssets := make([]*models.LineageAsset, 0, len(assets))
	for _, a := range assets {
		lAssets = append(lAssets, &models.LineageAsset{
			ID:             a.ID,
			Name:           a.Name,
			AssetType:      a.AssetType,
			Provider:       a.Provider,
			Region:         a.Region,
			PIITypes:       setToSlice(piiByAsset[a.ID]),
			PIIRecordCount: a.PIIRecordCount,
			RiskScore:      a.RiskScore,
			FlowCount:      flowsByAsset[a.ID],
		})
	}

	dests := make([]*models.LineageDestination, 0, len(destAgg))
	external := 0
	for _, d := range destAgg {
		dests = append(dests, d)
		if d.External {
			external++
		}
	}

	return &models.LineageGraph{
		Assets:       lAssets,
		Destinations: dests,
		Edges:        edges,
		Summary: models.LineageSummary{
			AssetCount:           len(lAssets),
			DestinationCount:     len(dests),
			FlowCount:            len(flows),
			UnapprovedFlows:      unapproved,
			ExternalDestinations: external,
		},
	}, nil
}

// lineageHost extracts a stable host key from a destination URL.
func lineageHost(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "unknown"
	}
	candidate := raw
	if !strings.Contains(candidate, "://") {
		candidate = "https://" + candidate
	}
	if u, err := url.Parse(candidate); err == nil && u.Host != "" {
		return strings.ToLower(u.Host)
	}
	if i := strings.IndexAny(raw, "/?"); i > 0 {
		return strings.ToLower(raw[:i])
	}
	return strings.ToLower(raw)
}

func isExternalDest(t string) bool {
	switch t {
	case "external_api", "llm", "third_party", "email":
		return true
	}
	return false
}

func mergeUnique(a, b []string) []string {
	seen := make(map[string]bool, len(a)+len(b))
	out := make([]string, 0, len(a)+len(b))
	for _, lst := range [][]string{a, b} {
		for _, x := range lst {
			if x != "" && !seen[x] {
				seen[x] = true
				out = append(out, x)
			}
		}
	}
	return out
}

func setToSlice(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
