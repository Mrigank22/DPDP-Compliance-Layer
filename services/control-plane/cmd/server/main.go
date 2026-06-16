// services/control-plane/cmd/server/main.go

package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	v1 "github.com/datasentinel/control-plane/internal/api/v1"
	"github.com/datasentinel/control-plane/internal/config"
	"github.com/datasentinel/control-plane/internal/db"
	"github.com/datasentinel/control-plane/internal/services"
)

func main() {
	// ── Config ───────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	must(err, "load config")

	// ── Logger ───────────────────────────────────────────────────────────────
	log := buildLogger(cfg)
	// Install the logger as the fallback used by API handler error logging so
	// that handler-level errors are always written out with full context.
	v1.SetLogger(log)
	defer func(log *zap.Logger) {
		err := log.Sync()
		if err != nil {
			fmt.Println("error syncing zap logger")
		}
	}(log) //nolint:errcheck

	log.Info("DataSentinel control-plane starting",
		zap.String("env", cfg.Env),
		zap.Int("port", cfg.Port),
		zap.String("go_version", runtime.Version()),
	)

	// ── Databases ────────────────────────────────────────────────────────────
	pg, err := db.NewPostgres(cfg, log)
	must(err, "connect postgres")

	rdb, err := db.NewRedis(cfg, log)
	must(err, "connect redis")

	ch, err := db.NewClickHouse(cfg, log)
	must(err, "connect clickhouse")

	// ── Run migrations ───────────────────────────────────────────────────────
	migrationsDir := resolveMigrationsPath()
	if err := db.RunMigrations(pg, migrationsDir, log); err != nil {
		log.Fatal("migrations failed", zap.Error(err))
	}

	// ── Handlers ─────────────────────────────────────────────────────────────
	handlers, err := v1.NewHandlers(pg, ch, rdb, cfg, log)
	must(err, "init handlers")

	// Pull the auth service back out for the router (needs it for middleware)
	notifSvc := services.NewNotificationService(cfg, log)
	tenantSvc := services.NewTenantService(pg, log)
	authSvc, err := services.NewAuthService(pg, ch, cfg, log, notifSvc, tenantSvc)
	must(err, "init auth service")

	// ── Gin engine ───────────────────────────────────────────────────────────
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}
	engine := gin.New()

	v1.RegisterRoutes(engine, handlers, authSvc, pg, rdb, cfg, log)

	// ── HTTP server ──────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      engine,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start serving in a goroutine so we don't block signal handling
	go func() {
		log.Info("listening", zap.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("server error", zap.Error(err))
		}
	}()

	// ── Graceful shutdown ────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit

	log.Info("shutdown signal received", zap.String("signal", sig.String()))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Error("server shutdown error", zap.Error(err))
	}

	// Close database connections
	if err := pg.Close(); err != nil {
		log.Error("postgres close error", zap.Error(err))
	}
	if err := rdb.Close(); err != nil {
		log.Error("redis close error", zap.Error(err))
	}
	if err := ch.Close(); err != nil {
		log.Error("clickhouse close error", zap.Error(err))
	}

	log.Info("shutdown complete")
}

func buildLogger(cfg *config.Config) *zap.Logger {
	level := zapcore.InfoLevel
	if cfg.IsDevelopment() {
		level = zapcore.DebugLevel
	}

	zapCfg := zap.Config{
		Level:            zap.NewAtomicLevelAt(level),
		Development:      cfg.IsDevelopment(),
		Encoding:         "json",
		OutputPaths:      []string{"stdout"},
		ErrorOutputPaths: []string{"stderr"},
		EncoderConfig: zapcore.EncoderConfig{
			TimeKey:        "ts",
			LevelKey:       "level",
			NameKey:        "logger",
			CallerKey:      "caller",
			MessageKey:     "msg",
			StacktraceKey:  "stacktrace",
			LineEnding:     zapcore.DefaultLineEnding,
			EncodeLevel:    zapcore.LowercaseLevelEncoder,
			EncodeTime:     zapcore.ISO8601TimeEncoder,
			EncodeDuration: zapcore.StringDurationEncoder,
			EncodeCaller:   zapcore.ShortCallerEncoder,
		},
	}

	if cfg.IsDevelopment() {
		zapCfg.Encoding = "console"
		zapCfg.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}

	log, err := zapCfg.Build(zap.AddCaller(), zap.AddCallerSkip(0))
	if err != nil {
		panic("failed to build logger: " + err.Error())
	}
	return log
}

// resolveMigrationsPath finds the migrations directory relative to the binary.
func resolveMigrationsPath() string {
	// Check env override first
	if p := os.Getenv("MIGRATIONS_PATH"); p != "" {
		return p
	}
	// Relative to binary location (works in Docker)
	exe, err := os.Executable()
	if err == nil {
		candidate := filepath.Join(filepath.Dir(exe), "../../migrations")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	// Default: ./migrations relative to CWD
	return "./migrations"
}

func must(err error, context string) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: %s: %v\n", context, err)
		os.Exit(1)
	}
}
