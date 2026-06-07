// services/control-plane/internal/api/v1/router.go

package v1

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/config"
	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/middleware"
	"github.com/datasentinel/control-plane/internal/models"
	"github.com/datasentinel/control-plane/internal/services"
	"github.com/redis/go-redis/v9"
	"github.com/uptrace/bun"
)

// Handlers bundles all handler instances for dependency injection.
type Handlers struct {
	Auth      *AuthHandler
	Asset     *AssetHandler
	Policy    *PolicyHandler
	Finding   *FindingHandler
	Alert     *AlertHandler
	Scan      *ScanHandler
	Rights    *RightsHandler
	Report    *ReportHandler
	Gateway   *GatewayHandler
	Audit     *AuditHandler
	User      *UserHandler
	Health    *HealthHandler
	Dashboard *DashboardHandler
	APIKey    *APIKeyHandler
}

// NewHandlers wires all service dependencies into handler instances.
func NewHandlers(
	pg *bun.DB,
	ch *db.ClickHouseClient,
	rdb *redis.Client,
	cfg *config.Config,
	log *zap.Logger,
) (*Handlers, error) {
	// Core services (order matters for dependency injection)
	notifSvc := services.NewNotificationService(cfg, log)
	tenantSvc := services.NewTenantService(pg, log)
	workerSvc := services.NewWorkerService(rdb, cfg, log)

	authSvc, err := services.NewAuthService(pg, ch, cfg, log, notifSvc, tenantSvc)
	if err != nil {
		return nil, err
	}

	assetSvc := services.NewAssetService(pg, ch, cfg, log, workerSvc)
	policySvc := services.NewPolicyService(pg, ch, log)
	findingSvc := services.NewFindingService(pg, ch, log)
	alertSvc := services.NewAlertService(pg, ch, log, notifSvc)
	scanSvc := services.NewScanService(pg, ch, log)
	rightsSvc := services.NewRightsService(pg, ch, log, workerSvc)
	reportSvc := services.NewReportService(pg, ch, log, workerSvc)
	gatewaySvc := services.NewGatewayService(pg, ch, log)

	return &Handlers{
		Auth:      NewAuthHandler(authSvc),
		Asset:     NewAssetHandler(assetSvc),
		Policy:    NewPolicyHandler(policySvc),
		Finding:   NewFindingHandler(findingSvc),
		Alert:     NewAlertHandler(alertSvc),
		Scan:      NewScanHandler(scanSvc),
		Rights:    NewRightsHandler(rightsSvc),
		Report:    NewReportHandler(reportSvc),
		Gateway:   NewGatewayHandler(gatewaySvc),
		Audit:     NewAuditHandler(ch),
		User:      NewUserHandler(pg, log),
		Health:    NewHealthHandler(pg, rdb, ch),
		Dashboard: NewDashboardHandler(pg, findingSvc, alertSvc, log),
		APIKey:    NewAPIKeyHandler(pg, log),
	}, nil
}

// RegisterRoutes mounts all API routes onto the gin engine.
func RegisterRoutes(r *gin.Engine, h *Handlers, authSvc *services.AuthService, pg *bun.DB, rdb *redis.Client, cfg *config.Config, log *zap.Logger) {
	// ── Global middleware ────────────────────────────────────────────────────
	r.Use(middleware.RequestID())
	r.Use(middleware.Logger(log))
	r.Use(middleware.Recovery(log))
	r.Use(corsMiddleware(cfg))

	// ── Probe endpoints (no auth) ────────────────────────────────────────────
	r.GET("/healthz", h.Health.Liveness)
	r.GET("/readyz", h.Health.Readiness)

	// ── API v1 base ──────────────────────────────────────────────────────────
	v1 := r.Group("/api/v1")

	// ── Auth routes (public) ─────────────────────────────────────────────────
	auth := v1.Group("/auth")
	auth.Use(middleware.RateLimit(rdb, cfg.AuthRateLimitRPM))
	{
		auth.POST("/register", h.Auth.Register)
		auth.POST("/login", h.Auth.Login)
		auth.POST("/refresh", h.Auth.Refresh)
		auth.POST("/logout", h.Auth.Logout)
		auth.POST("/forgot-password", h.Auth.ForgotPassword)
		auth.POST("/reset-password", h.Auth.ResetPassword)
		auth.POST("/accept-invite", h.Auth.AcceptInvite)
	}

	// ── Authenticated routes ─────────────────────────────────────────────────
	api := v1.Group("")
	api.Use(middleware.RequireAuth(authSvc, pg, log))
	api.Use(middleware.TenantRateLimit(rdb, cfg.APIRateLimitRPM))

	// Auth (requires login)
	api.GET("/auth/me", h.Auth.Me)
	api.PUT("/auth/change-password", h.Auth.ChangePassword)
	api.POST("/auth/mfa/enable", h.Auth.EnableMFA)
	api.POST("/auth/mfa/verify", h.Auth.VerifyMFA)
	api.POST("/auth/invite", middleware.RequireRole(models.RoleAdmin), h.Auth.InviteUser)

	// Dashboard
	api.GET("/dashboard", h.Dashboard.Get)
	api.GET("/dashboard/dpdp-status", h.Dashboard.GetDPDPStatus)
	api.GET("/dashboard/trends", h.Dashboard.Trend)

	// Assets
	assets := api.Group("/assets")
	{
		assets.GET("", h.Asset.List)
		assets.POST("", middleware.RequireRole(models.RoleAdmin), h.Asset.Create)
		assets.GET("/:id", h.Asset.Get)
		assets.PATCH("/:id", middleware.RequireRole(models.RoleAdmin), h.Asset.Update)
		assets.DELETE("/:id", middleware.RequireRole(models.RoleAdmin), h.Asset.Delete)
		assets.POST("/:id/scan", middleware.RequireRole(models.RoleAnalyst), h.Asset.TriggerScan)
		assets.GET("/:id/scans", h.Asset.ListScans)
		assets.GET("/:id/findings", h.Asset.ListFindings)
		assets.GET("/:id/data-flows", h.Asset.ListDataFlows)
		assets.POST("/:id/test-connection", middleware.RequireRole(models.RoleAdmin), h.Asset.TestConnection)
	}

	// Scans
	scans := api.Group("/scans")
	{
		scans.GET("", h.Scan.List)
		scans.GET("/:id", h.Scan.Get)
		scans.POST("/:id/cancel", middleware.RequireRole(models.RoleAnalyst), h.Scan.Cancel)
	}

	// Findings
	findings := api.Group("/findings")
	{
		findings.GET("", h.Finding.List)
		findings.GET("/summary", h.Finding.Summary)
		findings.GET("/trends", h.Finding.Trends)
		findings.GET("/:id", h.Finding.Get)
		findings.POST("/:id/resolve", middleware.RequireRole(models.RoleAnalyst), h.Finding.Resolve)
		findings.POST("/:id/false-positive", middleware.RequireRole(models.RoleAnalyst), h.Finding.MarkFalsePositive)
	}

	// Alerts
	alerts := api.Group("/alerts")
	{
		alerts.GET("", h.Alert.List)
		alerts.GET("/unread", h.Alert.Unread)
		alerts.GET("/:id", h.Alert.Get)
		alerts.POST("/acknowledge", h.Alert.Acknowledge)
		alerts.POST("/acknowledge-all", h.Alert.AcknowledgeAll)
		alerts.DELETE("/:id", h.Alert.Delete)
	}

	// Policies
	policies := api.Group("/policies")
	{
		policies.GET("/templates", h.Policy.GetTemplates)
		policies.POST("/templates/:template_id/apply", middleware.RequireRole(models.RoleAdmin), h.Policy.ApplyTemplate)
		policies.GET("", h.Policy.List)
		policies.POST("", middleware.RequireRole(models.RoleAdmin), h.Policy.Create)
		policies.GET("/:id", h.Policy.Get)
		policies.PATCH("/:id", middleware.RequireRole(models.RoleAdmin), h.Policy.Update)
		policies.DELETE("/:id", middleware.RequireRole(models.RoleAdmin), h.Policy.Delete)
		policies.POST("/:id/activate", middleware.RequireRole(models.RoleAdmin), h.Policy.Activate)
		policies.POST("/:id/deactivate", middleware.RequireRole(models.RoleAdmin), h.Policy.Deactivate)
		policies.GET("/:id/versions", h.Policy.ListVersions)
		policies.GET("/:id/versions/:version", h.Policy.GetByVersion)
		policies.POST("/:id/rollback", middleware.RequireRole(models.RoleAdmin), h.Policy.Rollback)
	}

	// Rights Requests (DSRs)
	rights := api.Group("/rights-requests")
	{
		rights.GET("", h.Rights.List)
		rights.GET("/overdue", h.Rights.Overdue)
		rights.POST("", h.Rights.Create)
		rights.GET("/:id", h.Rights.Get)
		rights.PATCH("/:id", middleware.RequireRole(models.RoleAnalyst), h.Rights.Update)
		rights.POST("/:id/assign", middleware.RequireRole(models.RoleAdmin), h.Rights.Assign)
		rights.POST("/:id/complete", middleware.RequireRole(models.RoleAnalyst), h.Rights.Complete)
		rights.POST("/:id/reject", middleware.RequireRole(models.RoleAdmin), h.Rights.Reject)
		rights.POST("/:id/search", middleware.RequireRole(models.RoleAnalyst), h.Rights.SearchPrincipal)
	}

	// Reports
	reports := api.Group("/reports")
	{
		reports.GET("/templates", h.Report.GetTemplates)
		reports.GET("", h.Report.List)
		reports.POST("", middleware.RequireRole(models.RoleAnalyst), h.Report.Generate)
		reports.GET("/:id", h.Report.Get)
		reports.DELETE("/:id", middleware.RequireRole(models.RoleAdmin), h.Report.Delete)
	}

	// Gateway
	gateway := api.Group("/gateway")
	{
		gateway.GET("/rules", h.Gateway.ListRules)
		gateway.POST("/rules", middleware.RequireRole(models.RoleAdmin), h.Gateway.CreateRule)
		gateway.GET("/rules/:id", h.Gateway.GetRule)
		gateway.PATCH("/rules/:id", middleware.RequireRole(models.RoleAdmin), h.Gateway.UpdateRule)
		gateway.DELETE("/rules/:id", middleware.RequireRole(models.RoleAdmin), h.Gateway.DeleteRule)
		gateway.POST("/rules/:id/toggle", middleware.RequireRole(models.RoleAdmin), h.Gateway.ToggleRule)
		gateway.GET("/data-flows", h.Gateway.ListDataFlows)
		gateway.POST("/data-flows/:id/approve", middleware.RequireRole(models.RoleAdmin), h.Gateway.ApproveDataFlow)
		gateway.GET("/stats", h.Gateway.GetStats)
	}

	// Team / User management
	team := api.Group("/team")
	{
		team.GET("", middleware.RequireRole(models.RoleAdmin), h.User.ListTeam)
		team.GET("/:id", middleware.RequireRole(models.RoleAdmin), h.User.GetTeamMember)
		team.PATCH("/:id", middleware.RequireRole(models.RoleAdmin), h.User.UpdateTeamMember)
		team.DELETE("/:id", middleware.RequireRole(models.RoleOwner), h.User.RemoveTeamMember)
	}

	// API Keys
	apikeys := api.Group("/apikeys")
	{
		apikeys.GET("", h.APIKey.List)
		apikeys.POST("", h.APIKey.Create)
		apikeys.GET("/:id", h.APIKey.Get)
		apikeys.PATCH("/:id", h.APIKey.Update)
		apikeys.DELETE("/:id", h.APIKey.Revoke)
		apikeys.DELETE("", h.APIKey.RevokeAll)
	}

	// Audit Logs
	api.GET("/audit-logs", middleware.RequireRole(models.RoleAdmin), h.Audit.List)

	// 404 fallback
	r.NoRoute(func(c *gin.Context) {
		requestID, _ := c.Get(middleware.CtxRequestID)
		rid, _ := requestID.(string)
		c.JSON(http.StatusNotFound, models.APIResponse{
			RequestID: rid,
			Error:     &models.APIError{Code: models.ErrCodeNotFound, Message: "route not found"},
		})
	})
}

// corsMiddleware sets CORS headers based on the configured allowed origins.
func corsMiddleware(cfg *config.Config) gin.HandlerFunc {
	allowed := cfg.CORSOrigins()
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		for _, o := range allowed {
			if o == "*" || strings.EqualFold(origin, strings.TrimSpace(o)) {
				c.Header("Access-Control-Allow-Origin", origin)
				break
			}
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID, X-API-Key")
		c.Header("Access-Control-Expose-Headers", "X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
