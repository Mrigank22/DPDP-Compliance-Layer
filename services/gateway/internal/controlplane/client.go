// services/gateway/internal/controlplane/client.go
//
// Client is the gateway's typed, resilient channel back to the control plane.
// It centralises every service-to-service call (raising alerts, registering
// detected data flows) so payloads are always JSON-marshalled (never string
// concatenated), authenticated with the internal key + tenant header, and
// bounded by sane timeouts.

package controlplane

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/datasentinel/gateway/internal/config"
)

// Client talks to the control plane's /internal endpoints.
type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
	log     *zap.Logger

	// flowSeen dedups data-flow registrations so we don't hammer the control
	// plane on every single proxied request to the same destination.
	flowSeen sync.Map // key "tenant|dest" -> time.Time of last registration
}

const flowDedupWindow = 5 * time.Minute

// NewClient builds a control-plane client from gateway config.
func NewClient(cfg *config.Config, log *zap.Logger) *Client {
	return &Client{
		baseURL: cfg.ControlPlaneURL,
		apiKey:  cfg.ControlPlaneAPIKey,
		http:    &http.Client{Timeout: 5 * time.Second},
		log:     log,
	}
}

// AlertInput is the payload for raising a compliance alert.
type AlertInput struct {
	AlertType        string  `json:"alert_type"`
	Severity         string  `json:"severity"`
	Title            string  `json:"title"`
	Body             string  `json:"body"`
	RelatedAssetID   *string `json:"related_asset_id,omitempty"`
	RelatedFindingID *string `json:"related_finding_id,omitempty"`
}

// RaiseAlert posts an alert to the control plane (which persists it and fans it
// out to configured webhooks). Errors are logged, never returned, so alerting
// never blocks or breaks the proxy path.
func (c *Client) RaiseAlert(ctx context.Context, tenantID string, in AlertInput) {
	if in.AlertType == "" {
		in.AlertType = "policy_violation"
	}
	if in.Severity == "" {
		in.Severity = "high"
	}
	c.post(ctx, tenantID, "/api/v1/internal/alerts", in, "raise alert")
}

type dataFlowInput struct {
	DestinationURL  string   `json:"destination_url"`
	DestinationType string   `json:"destination_type"`
	PIITypes        []string `json:"pii_types"`
}

// RegisterDataFlow records an observed egress of PII toward an external
// destination. Registrations are deduplicated per (tenant, destination) within
// a short window to avoid excessive control-plane traffic.
func (c *Client) RegisterDataFlow(ctx context.Context, tenantID, destURL, destType string, piiTypes []string) {
	if destURL == "" || len(piiTypes) == 0 {
		return
	}
	key := tenantID + "|" + destURL
	if v, ok := c.flowSeen.Load(key); ok {
		if last, ok := v.(time.Time); ok && time.Since(last) < flowDedupWindow {
			return
		}
	}
	c.flowSeen.Store(key, time.Now())
	c.post(ctx, tenantID, "/api/v1/internal/data-flows", dataFlowInput{
		DestinationURL:  destURL,
		DestinationType: destType,
		PIITypes:        piiTypes,
	}, "register data flow")
}

// post marshals body as JSON and POSTs it with service auth headers.
func (c *Client) post(ctx context.Context, tenantID, path string, body any, op string) {
	payload, err := json.Marshal(body)
	if err != nil {
		c.log.Warn("control-plane "+op+": marshal failed", zap.Error(err))
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s%s", c.baseURL, path), bytes.NewReader(payload))
	if err != nil {
		c.log.Warn("control-plane "+op+": build request failed", zap.Error(err))
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("X-Tenant-ID", tenantID)

	resp, err := c.http.Do(req)
	if err != nil {
		c.log.Warn("control-plane "+op+": request failed", zap.Error(err))
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		c.log.Warn("control-plane "+op+": non-2xx",
			zap.Int("status", resp.StatusCode),
			zap.String("tenant_id", tenantID))
	}
}
