// services/control-plane/internal/api/v1/webhook_handler.go

package v1

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/services"
)

// ---- Domain types -----------------------------------------------------------

// WebhookChannel is the delivery channel type.
type WebhookChannel string

const (
	ChannelSlack     WebhookChannel = "slack"
	ChannelPagerDuty WebhookChannel = "pagerduty"
	ChannelEmail     WebhookChannel = "email"
	ChannelJIRA      WebhookChannel = "jira"
	ChannelHTTP      WebhookChannel = "http"
)

// WebhookConfig stores a configured notification destination for a tenant.
// Stored in PostgreSQL as a JSONB blob inside tenant.settings["webhooks"].
// We use an in-memory representation here and persist to tenant settings.
type WebhookConfig struct {
	ID        string         `json:"id"`
	TenantID  string         `json:"tenant_id"`
	Name      string         `json:"name"`
	Channel   WebhookChannel `json:"channel"`
	URL       string         `json:"url,omitempty"`
	Secret    string         `json:"secret,omitempty"`   // HMAC signing secret — never returned to client
	Email     string         `json:"email,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
	Events    []string       `json:"events"`             // which alert types trigger this
	IsActive  bool           `json:"is_active"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

// WebhookConfigResponse is the safe API representation (secret omitted).
type WebhookConfigResponse struct {
	ID        string         `json:"id"`
	TenantID  string         `json:"tenant_id"`
	Name      string         `json:"name"`
	Channel   WebhookChannel `json:"channel"`
	URL       string         `json:"url,omitempty"`
	Email     string         `json:"email,omitempty"`
	Events    []string       `json:"events"`
	IsActive  bool           `json:"is_active"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

func (w *WebhookConfig) toResponse() *WebhookConfigResponse {
	return &WebhookConfigResponse{
		ID: w.ID, TenantID: w.TenantID, Name: w.Name,
		Channel: w.Channel, URL: w.URL, Email: w.Email,
		Events: w.Events, IsActive: w.IsActive,
		CreatedAt: w.CreatedAt, UpdatedAt: w.UpdatedAt,
	}
}

// NotificationPrefs stores per-tenant alert notification preferences.
type NotificationPrefs struct {
	EmailRecipients  []string          `json:"email_recipients"`
	SlackChannel     string            `json:"slack_channel"`
	MinSeverity      string            `json:"min_severity"`        // only alert on this severity and above
	QuietHoursStart  string            `json:"quiet_hours_start"`   // HH:MM 24h IST
	QuietHoursEnd    string            `json:"quiet_hours_end"`
	EscalationHours  int               `json:"escalation_hours"`    // hours before escalating unacked critical alerts
	EscalationEmails []string          `json:"escalation_emails"`
}

// WebhookHandler handles webhook config and notification preference endpoints.
type WebhookHandler struct {
	pg  *bun.DB
	log *zap.Logger
}

// NewWebhookHandler creates a WebhookHandler.
func NewWebhookHandler(pg *bun.DB, log *zap.Logger) *WebhookHandler {
	return &WebhookHandler{pg: pg, log: log}
}

// ---- Webhook Config CRUD ----------------------------------------------------

// ListWebhooks godoc
// GET /api/v1/webhooks
func (h *WebhookHandler) ListWebhooks(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	webhooks, err := h.loadWebhooks(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	resp := make([]*WebhookConfigResponse, len(webhooks))
	for i, w := range webhooks {
		resp[i] = w.toResponse()
	}
	ok(c, resp)
}

// CreateWebhook godoc
// POST /api/v1/webhooks
func (h *WebhookHandler) CreateWebhook(c *gin.Context) {
	var input struct {
		Name    string            `json:"name"    validate:"required,min=1,max=100"`
		Channel WebhookChannel    `json:"channel" validate:"required,oneof=slack pagerduty email jira http"`
		URL     string            `json:"url"     validate:"omitempty,url"`
		Email   string            `json:"email"   validate:"omitempty,email"`
		Headers map[string]string `json:"headers"`
		Events  []string          `json:"events"  validate:"required,min=1"`
	}
	if !bindAndValidate(c, &input) {
		return
	}

	tenantID := middleware.GetTenantID(c)
	if input.Channel != ChannelEmail && input.URL == "" {
		handleError(c, services.ErrInvalidInput("url is required for channel type "+string(input.Channel)))
		return
	}
	if input.Channel == ChannelEmail && input.Email == "" {
		handleError(c, services.ErrInvalidInput("email is required for email channel"))
		return
	}

	// Generate HMAC signing secret for HTTP webhooks
	secret := ""
	if input.Channel == ChannelHTTP {
		rawSecret := make([]byte, 32)
		_, _ = rand.Read(rawSecret)
		secret = hex.EncodeToString(rawSecret)
	}

	now := time.Now()
	wh := &WebhookConfig{
		ID:        uuid.New().String(),
		TenantID:  tenantID,
		Name:      input.Name,
		Channel:   input.Channel,
		URL:       input.URL,
		Secret:    secret,
		Email:     input.Email,
		Headers:   input.Headers,
		Events:    input.Events,
		IsActive:  true,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := h.upsertWebhook(c.Request.Context(), tenantID, wh); err != nil {
		handleError(c, err)
		return
	}

	resp := wh.toResponse()
	// Return the signing secret once at creation time for HTTP webhooks
	if input.Channel == ChannelHTTP && secret != "" {
		c.JSON(http.StatusCreated, gin.H{
			"webhook":        resp,
			"signing_secret": secret,
			"note":           "Store this signing secret securely — it will not be shown again.",
		})
		return
	}
	created(c, resp)
}

// UpdateWebhook godoc
// PATCH /api/v1/webhooks/:id
func (h *WebhookHandler) UpdateWebhook(c *gin.Context) {
	var input struct {
		Name     *string           `json:"name"      validate:"omitempty,min=1,max=100"`
		URL      *string           `json:"url"       validate:"omitempty,url"`
		Email    *string           `json:"email"     validate:"omitempty,email"`
		Headers  map[string]string `json:"headers"`
		Events   []string          `json:"events"    validate:"omitempty,min=1"`
		IsActive *bool             `json:"is_active"`
	}
	if !bindAndValidate(c, &input) {
		return
	}

	tenantID := middleware.GetTenantID(c)
	webhooks, err := h.loadWebhooks(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}

	var target *WebhookConfig
	for _, w := range webhooks {
		if w.ID == c.Param("id") {
			target = w
			break
		}
	}
	if target == nil {
		handleError(c, services.ErrNotFound("webhook"))
		return
	}

	if input.Name != nil     { target.Name = *input.Name }
	if input.URL != nil      { target.URL = *input.URL }
	if input.Email != nil    { target.Email = *input.Email }
	if input.Headers != nil  { target.Headers = input.Headers }
	if len(input.Events) > 0 { target.Events = input.Events }
	if input.IsActive != nil { target.IsActive = *input.IsActive }
	target.UpdatedAt = time.Now()

	if err := h.upsertWebhook(c.Request.Context(), tenantID, target); err != nil {
		handleError(c, err)
		return
	}
	ok(c, target.toResponse())
}

// DeleteWebhook godoc
// DELETE /api/v1/webhooks/:id
func (h *WebhookHandler) DeleteWebhook(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	if err := h.removeWebhook(c.Request.Context(), tenantID, c.Param("id")); err != nil {
		handleError(c, err)
		return
	}
	noContent(c)
}

// TestWebhook godoc
// POST /api/v1/webhooks/:id/test
// Sends a test payload to verify the endpoint is reachable.
func (h *WebhookHandler) TestWebhook(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	webhooks, err := h.loadWebhooks(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}

	var target *WebhookConfig
	for _, w := range webhooks {
		if w.ID == c.Param("id") {
			target = w
			break
		}
	}
	if target == nil {
		handleError(c, services.ErrNotFound("webhook"))
		return
	}

	if target.Channel != ChannelHTTP && target.Channel != ChannelSlack {
		ok(c, gin.H{"message": "Test delivery is only supported for HTTP and Slack webhooks."})
		return
	}

	payload := map[string]any{
		"type":      "test",
		"tenant_id": tenantID,
		"timestamp": time.Now(),
		"message":   "This is a test notification from DataSentinel.",
	}

	success, statusCode, deliveryErr := h.deliverHTTPWebhook(target, payload)
	if !success {
		ok(c, gin.H{
			"success":     false,
			"status_code": statusCode,
			"error":       deliveryErr,
		})
		return
	}
	ok(c, gin.H{"success": true, "status_code": statusCode, "message": "Test payload delivered successfully."})
}

// ---- Notification Preferences -----------------------------------------------

// GetNotificationPrefs godoc
// GET /api/v1/alerts/config
func (h *WebhookHandler) GetNotificationPrefs(c *gin.Context) {
	tenantID := middleware.GetTenantID(c)
	prefs, err := h.loadNotificationPrefs(c.Request.Context(), tenantID)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, prefs)
}

// UpdateNotificationPrefs godoc
// PATCH /api/v1/alerts/config
func (h *WebhookHandler) UpdateNotificationPrefs(c *gin.Context) {
	var input NotificationPrefs
	if err := c.ShouldBindJSON(&input); err != nil {
		handleError(c, services.ErrInvalidInput(err.Error()))
		return
	}
	tenantID := middleware.GetTenantID(c)
	if err := h.saveNotificationPrefs(c.Request.Context(), tenantID, &input); err != nil {
		handleError(c, err)
		return
	}
	ok(c, input)
}

// ---- Storage helpers (persist webhooks into tenant.settings JSONB) -----------

const webhooksSettingKey = "webhooks"
const notifPrefsKey = "notification_prefs"

type tenantSettingsRow struct {
	Settings map[string]any `bun:"settings"`
}

func (h *WebhookHandler) loadWebhooks(ctx context.Context, tenantID string) ([]*WebhookConfig, error) {
	row := &tenantSettingsRow{}
	if err := h.pg.NewSelect().
		TableExpr("tenants").
		ColumnExpr("settings").
		Where("id = ?", tenantID).
		Scan(ctx, row); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, services.ErrNotFound("tenant")
		}
		return nil, err
	}
	raw, ok := row.Settings[webhooksSettingKey]
	if !ok {
		return []*WebhookConfig{}, nil
	}
	b, _ := json.Marshal(raw)
	var hooks []*WebhookConfig
	_ = json.Unmarshal(b, &hooks)
	return hooks, nil
}

func (h *WebhookHandler) upsertWebhook(ctx context.Context, tenantID string, wh *WebhookConfig) error {
	hooks, err := h.loadWebhooks(ctx, tenantID)
	if err != nil {
		return err
	}
	found := false
	for i, w := range hooks {
		if w.ID == wh.ID {
			hooks[i] = wh
			found = true
			break
		}
	}
	if !found {
		hooks = append(hooks, wh)
	}
	return h.saveWebhooks(ctx, tenantID, hooks)
}

func (h *WebhookHandler) removeWebhook(ctx context.Context, tenantID, id string) error {
	hooks, err := h.loadWebhooks(ctx, tenantID)
	if err != nil {
		return err
	}
	updated := hooks[:0]
	for _, w := range hooks {
		if w.ID != id {
			updated = append(updated, w)
		}
	}
	if len(updated) == len(hooks) {
		return services.ErrNotFound("webhook")
	}
	return h.saveWebhooks(ctx, tenantID, updated)
}

func (h *WebhookHandler) saveWebhooks(ctx context.Context, tenantID string, hooks []*WebhookConfig) error {
	_, err := h.pg.NewUpdate().
		TableExpr("tenants").
		Set("settings = jsonb_set(settings, '{webhooks}', ?::jsonb, true)", mustJSON(hooks)).
		Where("id = ?", tenantID).
		Exec(ctx)
	return err
}

func (h *WebhookHandler) loadNotificationPrefs(ctx context.Context, tenantID string) (*NotificationPrefs, error) {
	row := &tenantSettingsRow{}
	if err := h.pg.NewSelect().
		TableExpr("tenants").
		ColumnExpr("settings").
		Where("id = ?", tenantID).
		Scan(ctx, row); err != nil {
		return nil, err
	}
	raw, ok := row.Settings[notifPrefsKey]
	if !ok {
		return &NotificationPrefs{MinSeverity: "high", EscalationHours: 4}, nil
	}
	b, _ := json.Marshal(raw)
	prefs := &NotificationPrefs{}
	_ = json.Unmarshal(b, prefs)
	return prefs, nil
}

func (h *WebhookHandler) saveNotificationPrefs(ctx context.Context, tenantID string, prefs *NotificationPrefs) error {
	_, err := h.pg.NewUpdate().
		TableExpr("tenants").
		Set("settings = jsonb_set(settings, '{notification_prefs}', ?::jsonb, true)", mustJSON(prefs)).
		Where("id = ?", tenantID).
		Exec(ctx)
	return err
}

// ---- Delivery logic ---------------------------------------------------------

// deliverHTTPWebhook sends a signed JSON payload to an HTTP webhook endpoint.
func (h *WebhookHandler) deliverHTTPWebhook(wh *WebhookConfig, payload map[string]any) (bool, int, string) {
	b, err := json.Marshal(payload)
	if err != nil {
		return false, 0, fmt.Sprintf("marshal payload: %v", err)
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, wh.URL, strings.NewReader(string(b)))
	if err != nil {
		return false, 0, fmt.Sprintf("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "DataSentinel-Webhook/1.0")

	// HMAC-SHA256 signature for HTTP webhooks
	if wh.Secret != "" {
		mac := hmac.New(sha256.New, []byte(wh.Secret))
		mac.Write(b)
		req.Header.Set("X-DataSentinel-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}

	// Custom headers (e.g., Authorization for PagerDuty)
	for k, v := range wh.Headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false, 0, fmt.Sprintf("http delivery: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return true, resp.StatusCode, ""
	}
	return false, resp.StatusCode, fmt.Sprintf("webhook returned status %d", resp.StatusCode)
}

// DeliverAlert is called by the AlertService when a new alert is created.
// It loads all active webhooks for the tenant and dispatches to matching ones.
func (h *WebhookHandler) DeliverAlert(ctx context.Context, tenantID string, alertType, severity, title, body string) {
	hooks, err := h.loadWebhooks(ctx, tenantID)
	if err != nil {
		h.log.Warn("load webhooks for alert delivery failed",
			zap.String("tenant_id", tenantID), zap.Error(err))
		return
	}

	payload := map[string]any{
		"type":       "alert",
		"alert_type": alertType,
		"severity":   severity,
		"title":      title,
		"body":       body,
		"tenant_id":  tenantID,
		"timestamp":  time.Now(),
	}

	for _, wh := range hooks {
		if !wh.IsActive {
			continue
		}
		if !matchesEvents(wh.Events, alertType) {
			continue
		}
		switch wh.Channel {
		case ChannelHTTP, ChannelSlack:
			go func(w *WebhookConfig) {
				ok, _, errMsg := h.deliverHTTPWebhook(w, payload)
				if !ok {
					h.log.Warn("webhook delivery failed",
						zap.String("webhook_id", w.ID),
						zap.String("error", errMsg),
					)
				}
			}(wh)
		}
	}
}

// ---- Utilities --------------------------------------------------------------

func matchesEvents(events []string, alertType string) bool {
	for _, e := range events {
		if e == "*" || e == alertType {
			return true
		}
	}
	return false
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// RegisterWebhookRoutes mounts webhook and notification pref routes.
func RegisterWebhookRoutes(rg *gin.RouterGroup, wh *WebhookHandler) {
	// Webhook CRUD
	webhooks := rg.Group("/webhooks")
	{
		webhooks.GET("", wh.ListWebhooks)
		webhooks.POST("", wh.CreateWebhook)
		webhooks.PATCH("/:id", wh.UpdateWebhook)
		webhooks.DELETE("/:id", wh.DeleteWebhook)
		webhooks.POST("/:id/test", wh.TestWebhook)
	}

	// Notification preferences hang off the alerts namespace
	rg.GET("/alerts/config", wh.GetNotificationPrefs)
	rg.PATCH("/alerts/config", wh.UpdateNotificationPrefs)
}
