// services/gateway/cmd/server/main.go

package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/datasentinel/gateway/internal/api"
	"github.com/datasentinel/gateway/internal/audit"
	"github.com/datasentinel/gateway/internal/config"
	"github.com/datasentinel/gateway/internal/engine"
	"github.com/datasentinel/gateway/internal/policy"
)

func main() {
	// ── Config ───────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	must(err, "load config")

	// ── Logger ───────────────────────────────────────────────────────────────
	log := buildLogger(cfg)
	defer log.Sync() //nolint:errcheck

	log.Info("DataSentinel gateway starting",
		zap.String("env", cfg.Env),
		zap.Int("http_port", cfg.HTTPPort),
		zap.String("control_plane", cfg.ControlPlaneURL),
	)

	// ── Redis ────────────────────────────────────────────────────────────────
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	must(err, "parse redis url")
	rdb := redis.NewClient(redisOpts)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	must(rdb.Ping(ctx).Err(), "redis ping")
	cancel()

	// ── PII Detector ─────────────────────────────────────────────────────────
	detector := engine.NewDetector(cfg.PIIScoreThreshold, cfg.MaxDetectWorkers)

	// ── Policy Loader (with background sync) ─────────────────────────────────
	pl := policy.NewPolicyLoader(cfg, rdb, log)
	defer pl.Stop()

	// ── Audit Writer (batched ClickHouse writes) ──────────────────────────────
	aw, err := audit.NewWriter(cfg, log)
	must(err, "init audit writer")
	defer aw.Stop()

	// ── HTTP Server ───────────────────────────────────────────────────────────
	router := api.BuildRouter(cfg, detector, pl, aw, rdb, log)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler:      router,
		ReadTimeout:  cfg.UpstreamReadTimeout + 5*time.Second,
		WriteTimeout: cfg.UpstreamWriteTimeout + 5*time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Info("gateway listening", zap.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("server error", zap.Error(err))
		}
	}()

	// ── Graceful shutdown ─────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit

	log.Info("shutdown signal received", zap.String("signal", sig.String()))

	ctx2, cancel2 := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel2()
	if err := srv.Shutdown(ctx2); err != nil {
		log.Error("server shutdown error", zap.Error(err))
	}

	if err := rdb.Close(); err != nil {
		log.Error("redis close error", zap.Error(err))
	}

	log.Info("gateway shutdown complete")
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
	log, err := zapCfg.Build()
	if err != nil {
		panic("failed to build logger: " + err.Error())
	}
	return log
}

func must(err error, ctx string) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL [%s]: %v\n", ctx, err)
		os.Exit(1)
	}
}
