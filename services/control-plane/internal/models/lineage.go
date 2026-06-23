// services/control-plane/internal/models/lineage.go

package models

import "time"

// LineageAsset is a data-holding node: a connected asset enriched with the PII
// categories discovered in it and the number of egress flows originating from it.
type LineageAsset struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	AssetType      string   `json:"asset_type"`
	Provider       string   `json:"provider"`
	Region         *string  `json:"region"`
	PIITypes       []string `json:"pii_types"`
	PIIRecordCount int64    `json:"pii_record_count"`
	RiskScore      int      `json:"risk_score"`
	FlowCount      int      `json:"flow_count"`
}

// LineageDestination is a sink node aggregated from all flows to the same host.
type LineageDestination struct {
	Key             string   `json:"key"`
	URL             string   `json:"url"`
	Host            string   `json:"host"`
	DestinationType string   `json:"destination_type"`
	PIITypes        []string `json:"pii_types"`
	EventCount      int64    `json:"event_count"`
	Approved        bool     `json:"approved"` // true only when every flow to it is approved
	FlowCount       int      `json:"flow_count"`
	External        bool     `json:"external"`
}

// LineageEdge connects a source asset to a destination, carrying the PII types
// observed on that flow.
type LineageEdge struct {
	ID              string    `json:"id"`
	SourceAssetID   *string   `json:"source_asset_id"`
	DestinationKey  string    `json:"destination_key"`
	DestinationType string    `json:"destination_type"`
	PIITypes        []string  `json:"pii_types"`
	Approved        bool      `json:"approved"`
	EventCount      int64     `json:"event_count"`
	LastSeenAt      time.Time `json:"last_seen_at"`
}

// LineageSummary holds headline counts for the lineage view.
type LineageSummary struct {
	AssetCount           int `json:"asset_count"`
	DestinationCount     int `json:"destination_count"`
	FlowCount            int `json:"flow_count"`
	UnapprovedFlows      int `json:"unapproved_flows"`
	ExternalDestinations int `json:"external_destinations"`
}

// LineageGraph is the full personal-data lineage for a tenant: where PII lives
// (assets) and where it flows (edges → destinations).
type LineageGraph struct {
	Assets       []*LineageAsset       `json:"assets"`
	Destinations []*LineageDestination `json:"destinations"`
	Edges        []*LineageEdge        `json:"edges"`
	Summary      LineageSummary        `json:"summary"`
}
