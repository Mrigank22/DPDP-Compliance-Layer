// services/gateway/internal/config/config.go

package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds all gateway runtime configuration.
type Config struct {
	// Server
	Env         string `mapstructure:"ENV"`
	HTTPPort    int    `mapstructure:"HTTP_PORT"`
	HTTPSPort   int    `mapstructure:"HTTPS_PORT"`
	MetricsPort int    `mapstructure:"METRICS_PORT"`

	// TLS
	TLSCertFile string `mapstructure:"TLS_CERT_FILE"`
	TLSKeyFile  string `mapstructure:"TLS_KEY_FILE"`

	// Control Plane
	ControlPlaneURL    string        `mapstructure:"CONTROL_PLANE_URL"`
	ControlPlaneAPIKey string        `mapstructure:"CONTROL_PLANE_API_KEY"`
	PolicySyncInterval time.Duration `mapstructure:"POLICY_SYNC_INTERVAL"`

	// Redis (policy cache backup + tokenization vault)
	RedisURL string `mapstructure:"REDIS_URL"`

	// PostgreSQL (tokenization vault persistence)
	DatabaseURL string `mapstructure:"DATABASE_URL"`

	// ClickHouse (event logging)
	ClickHouseURL      string `mapstructure:"CLICKHOUSE_URL"`
	ClickHouseUser     string `mapstructure:"CLICKHOUSE_USER"`
	ClickHousePassword string `mapstructure:"CLICKHOUSE_PASSWORD"`
	ClickHouseDatabase string `mapstructure:"CLICKHOUSE_DATABASE"`

	// Encryption
	MasterEncryptionKey string `mapstructure:"MASTER_ENCRYPTION_KEY"`

	// JWT verification (RS256 public key shared with the control plane). When
	// empty, JWT auth is disabled and callers must use X-API-Key.
	JWTPublicKeyPath string `mapstructure:"JWT_PUBLIC_KEY_PATH"`

	// Proxy behaviour
	UpstreamDialTimeout  time.Duration `mapstructure:"UPSTREAM_DIAL_TIMEOUT"`
	UpstreamReadTimeout  time.Duration `mapstructure:"UPSTREAM_READ_TIMEOUT"`
	UpstreamWriteTimeout time.Duration `mapstructure:"UPSTREAM_WRITE_TIMEOUT"`
	MaxBodyBytes         int64         `mapstructure:"MAX_BODY_BYTES"`

	// Detection tuning
	PIIScoreThreshold float64 `mapstructure:"PII_SCORE_THRESHOLD"`
	MaxDetectWorkers  int     `mapstructure:"MAX_DETECT_WORKERS"`

	// Observability
	LogLevel    string `mapstructure:"LOG_LEVEL"`
	ServiceName string `mapstructure:"SERVICE_NAME"`
}

// Load reads configuration from environment variables with safe defaults.
func Load() (*Config, error) {
	v := viper.New()

	v.SetDefault("ENV", "production")
	v.SetDefault("HTTP_PORT", 8080)
	v.SetDefault("HTTPS_PORT", 8443)
	v.SetDefault("METRICS_PORT", 9090)
	v.SetDefault("POLICY_SYNC_INTERVAL", "30s")
	v.SetDefault("REDIS_URL", "redis://localhost:6379/2")
	v.SetDefault("CLICKHOUSE_URL", "http://localhost:8123")
	v.SetDefault("CLICKHOUSE_USER", "default")
	v.SetDefault("CLICKHOUSE_PASSWORD", "")
	v.SetDefault("CLICKHOUSE_DATABASE", "datasentinel")
	v.SetDefault("UPSTREAM_DIAL_TIMEOUT", "5s")
	v.SetDefault("UPSTREAM_READ_TIMEOUT", "30s")
	v.SetDefault("UPSTREAM_WRITE_TIMEOUT", "30s")
	v.SetDefault("MAX_BODY_BYTES", 10*1024*1024) // 10 MB
	v.SetDefault("PII_SCORE_THRESHOLD", 0.7)
	v.SetDefault("MAX_DETECT_WORKERS", 8)
	v.SetDefault("LOG_LEVEL", "info")
	v.SetDefault("SERVICE_NAME", "datasentinel-gateway")

	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.SetConfigFile(".env")
	v.SetConfigType("env")
	_ = v.ReadInConfig()

	cfg := &Config{}
	if err := v.Unmarshal(cfg); err != nil {
		return nil, fmt.Errorf("config unmarshal: %w", err)
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *Config) validate() error {
	if strings.TrimSpace(c.ControlPlaneURL) == "" {
		return fmt.Errorf("CONTROL_PLANE_URL is required")
	}
	if strings.TrimSpace(c.ControlPlaneAPIKey) == "" {
		return fmt.Errorf("CONTROL_PLANE_API_KEY is required")
	}
	if strings.TrimSpace(c.MasterEncryptionKey) == "" {
		return fmt.Errorf("MASTER_ENCRYPTION_KEY is required")
	}
	return nil
}

func (c *Config) IsDevelopment() bool { return c.Env == "development" }
func (c *Config) IsProduction() bool  { return c.Env == "production" }
