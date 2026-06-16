// services/control-plane/internal/api/v1/internal_handler.go
//
// InternalHandler exposes service-to-service endpoints consumed by the
// enforcement gateway and the scan workers. These routes are authenticated by
// the shared internal API key (NOT user JWTs) and are mounted under
// /api/v1/internal with middleware.RequireServiceAuth.

package v1

import (
	"go.uber.org/zap"

	"github.com/gin-gonic/gin"

	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
)

// InternalHandler bundles the dependencies needed by service-to-service routes.
type InternalHandler struct {
	alertSvc   *services.AlertService
	gatewaySvc *services.GatewayService
	webhook    *WebhookHandler
	log        *zap.Logger
}

// NewInternalHandler creates an InternalHandler.
func NewInternalHandler(alertSvc *services.AlertService, gatewaySvc *services.GatewayService, webhook *WebhookHandler, log *zap.Logger) *InternalHandler {
	return &InternalHandler{alertSvc: alertSvc, gatewaySvc: gatewaySvc, webhook: webhook, log: log}
}

// createAlertInput is the payload the gateway/workers send to raise an alert.
type createAlertInput struct {
	AlertType        string  `json:"alert_type"        validate:"required,oneof=policy_violation breach_detected scan_anomaly rights_deadline retention_due cross_border_detected"`
	Severity         string  `json:"severity"          validate:"required,oneof=critical high medium low info"`
	Title            string  `json:"title"             validate:"required,min=1,max=500"`
	Body             string  `json:"body"`
	RelatedFindingID *string `json:"related_finding_id" validate:"omitempty,uuid"`
	RelatedAssetID   *string `json:"related_asset_id"   validate:"omitempty,uuid"`
}

// CreateAlert godoc
// POST /api/v1/internal/alerts
// Creates an alert record for the tenant and fans it out to configured webhooks.
func (h *InternalHandler) CreateAlert(c *gin.Context) {
	var input createAlertInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)

	alert := &models.Alert{
		ID:               services.GenerateID(),
		TenantID:         tenantID,
		AlertType:        input.AlertType,
		Severity:         input.Severity,
		Title:            input.Title,
		Body:             input.Body,
		RelatedFindingID: input.RelatedFindingID,
		RelatedAssetID:   input.RelatedAssetID,
		NotificationSent: true, // delivered synchronously below
	}
	if err := h.alertSvc.CreateInternal(c.Request.Context(), tenantID, alert); err != nil {
		handleError(c, err)
		return
	}

	// Fan out to configured channels (Slack/PagerDuty/HTTP/etc.) without blocking.
	h.webhook.DeliverAlert(c.Request.Context(), tenantID, input.AlertType, input.Severity, input.Title, input.Body)

	h.log.Info("internal alert created",
		zap.String("tenant_id", tenantID),
		zap.String("alert_type", input.AlertType),
		zap.String("severity", input.Severity),
		zap.String("alert_id", alert.ID),
	)
	created(c, alert)
}

// notifyAlertInput is the payload workers send to dispatch an existing alert.
type notifyAlertInput struct {
	AlertType string `json:"alert_type"`
	Severity  string `json:"severity"`
	Title     string `json:"title"`
	Body      string `json:"body"`
}

// NotifyAlert godoc
// POST /api/v1/internal/alerts/:id/notify
// Dispatches an already-created alert to configured webhook channels and marks
// it notified. Used by the workers' notification task.
func (h *InternalHandler) NotifyAlert(c *gin.Context) {
	var input notifyAlertInput
	// Body is optional; fall back to the stored alert if absent.
	_ = c.ShouldBindJSON(&input)

	tenantID := middleware.GetTenantID(c)
	alertID := c.Param("id")

	if input.Title == "" || input.Severity == "" {
		alert, err := h.alertSvc.GetByID(c.Request.Context(), alertID, tenantID)
		if err != nil {
			handleError(c, err)
			return
		}
		input.AlertType = alert.AlertType
		input.Severity = alert.Severity
		input.Title = alert.Title
		input.Body = alert.Body
	}

	h.webhook.DeliverAlert(c.Request.Context(), tenantID, input.AlertType, input.Severity, input.Title, input.Body)

	if err := h.alertSvc.MarkNotified(c.Request.Context(), tenantID, alertID); err != nil {
		h.log.Warn("mark alert notified failed",
			zap.String("tenant_id", tenantID), zap.String("alert_id", alertID), zap.Error(err))
	}
	ok(c, gin.H{"message": "alert dispatched", "alert_id": alertID})
}

// upsertDataFlowInput is the payload the gateway sends when it observes PII
// leaving the estate toward an external destination.
type upsertDataFlowInput struct {
	DestinationURL  string   `json:"destination_url"  validate:"required,min=1,max=2048"`
	DestinationType string   `json:"destination_type" validate:"omitempty,oneof=internal_api external_api llm storage email third_party"`
	PIITypes        []string `json:"pii_types"`
}

// UpsertDataFlow godoc
// POST /api/v1/internal/data-flows
// Records (or refreshes) a detected egress data flow observed by the gateway.
func (h *InternalHandler) UpsertDataFlow(c *gin.Context) {
	var input upsertDataFlowInput
	if !bindAndValidate(c, &input) {
		return
	}
	tenantID := middleware.GetTenantID(c)

	destType := input.DestinationType
	if destType == "" {
		destType = "external_api"
	}
	flow, err := h.gatewaySvc.UpsertDataFlow(c.Request.Context(), tenantID, input.DestinationURL, destType, input.PIITypes)
	if err != nil {
		handleError(c, err)
		return
	}
	ok(c, flow)
}
