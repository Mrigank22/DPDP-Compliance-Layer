// services/control-plane/internal/config/config.go

package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds all runtime configuration for the control plane.
// Values are loaded from environment variables (uppercase, underscore-separated).
type Config struct {
	// Server
	Env            string `mapstructure:"ENV"`
	Port           int    `mapstructure:"PORT"`
	BaseURL        string `mapstructure:"BASE_URL"`
	FrontendURL    string `mapstructure:"FRONTEND_URL"`
	AllowedOrigins string `mapstructure:"ALLOWED_ORIGINS"`

	// PostgreSQL
	DatabaseURL     string        `mapstructure:"DATABASE_URL"`
	DBMaxOpenConns  int           `mapstructure:"DB_MAX_OPEN_CONNS"`
	DBMaxIdleConns  int           `mapstructure:"DB_MAX_IDLE_CONNS"`
	DBConnLifetime  time.Duration `mapstructure:"DB_CONN_LIFETIME"`

	// Redis
	RedisURL string `mapstructure:"REDIS_URL"`

	// ClickHouse
	ClickHouseURL      string `mapstructure:"CLICKHOUSE_URL"`
	ClickHouseUser     string `mapstructure:"CLICKHOUSE_USER"`
	ClickHousePassword string `mapstructure:"CLICKHOUSE_PASSWORD"`
	ClickHouseDatabase string `mapstructure:"CLICKHOUSE_DATABASE"`

	// JWT — RS256
	JWTPrivateKeyPath  string        `mapstructure:"JWT_PRIVATE_KEY_PATH"`
	JWTPublicKeyPath   string        `mapstructure:"JWT_PUBLIC_KEY_PATH"`
	JWTAccessTokenTTL  time.Duration `mapstructure:"JWT_ACCESS_TOKEN_TTL"`
	JWTRefreshTokenTTL time.Duration `mapstructure:"JWT_REFRESH_TOKEN_TTL"`

	// Encryption
	MasterEncryptionKey string `mapstructure:"MASTER_ENCRYPTION_KEY"` // 32-byte hex

	// Internal service-to-service API key (shared with gateway + workers).
	// Callers presenting this key in X-API-Key are treated as a trusted service
	// identity scoped to the tenant named in the X-Tenant-ID header.
	InternalAPIKey string `mapstructure:"INTERNAL_API_KEY"`

	// AWS
	AWSRegion          string `mapstructure:"AWS_REGION"`
	AWSAccessKeyID     string `mapstructure:"AWS_ACCESS_KEY_ID"`
	AWSSecretAccessKey string `mapstructure:"AWS_SECRET_ACCESS_KEY"`
	S3ReportsBucket    string `mapstructure:"S3_REPORTS_BUCKET"`

	// Email (gomail)
	SMTPHost     string `mapstructure:"SMTP_HOST"`
	SMTPPort     int    `mapstructure:"SMTP_PORT"`
	SMTPUser     string `mapstructure:"SMTP_USER"`
	SMTPPassword string `mapstructure:"SMTP_PASSWORD"`
	SMTPFrom     string `mapstructure:"SMTP_FROM"`

	// Workers (for dispatching Celery tasks via Redis)
	WorkerRedisURL string `mapstructure:"WORKER_REDIS_URL"`

	// Rate limiting
	AuthRateLimitRPM int `mapstructure:"AUTH_RATE_LIMIT_RPM"`
	APIRateLimitRPM  int `mapstructure:"API_RATE_LIMIT_RPM"`

	// Phone-home (private deploy sync)
	PhoneHomeDisabled bool   `mapstructure:"PHONE_HOME_DISABLED"`
	PhoneHomeURL      string `mapstructure:"PHONE_HOME_URL"`
	DeploymentID      string `mapstructure:"DEPLOYMENT_ID"`

	// Observability
	OTLPEndpoint string `mapstructure:"OTLP_ENDPOINT"`
	LogLevel     string `mapstructure:"LOG_LEVEL"`
}

// Load reads configuration from environment variables, applying defaults where needed.
func Load() (*Config, error) {
	v := viper.New()

	// Defaults
	v.SetDefault("ENV", "production")
	v.SetDefault("PORT", 3001)
	v.SetDefault("BASE_URL", "http://localhost:3001")
	v.SetDefault("FRONTEND_URL", "http://localhost:3000")
	v.SetDefault("ALLOWED_ORIGINS", "http://localhost:3000")
	v.SetDefault("DB_MAX_OPEN_CONNS", 25)
	v.SetDefault("DB_MAX_IDLE_CONNS", 5)
	v.SetDefault("DB_CONN_LIFETIME", "30m")
	v.SetDefault("REDIS_URL", "redis://localhost:6379/0")
	v.SetDefault("CLICKHOUSE_URL", "http://localhost:8123")
	v.SetDefault("CLICKHOUSE_USER", "default")
	v.SetDefault("CLICKHOUSE_PASSWORD", "")
	v.SetDefault("CLICKHOUSE_DATABASE", "datasentinel")
	v.SetDefault("JWT_ACCESS_TOKEN_TTL", "15m")
	v.SetDefault("JWT_REFRESH_TOKEN_TTL", "168h") // 7 days
	v.SetDefault("AWS_REGION", "ap-south-1")
	v.SetDefault("SMTP_PORT", 587)
	v.SetDefault("AUTH_RATE_LIMIT_RPM", 10)
	v.SetDefault("API_RATE_LIMIT_RPM", 300)
	v.SetDefault("PHONE_HOME_DISABLED", false)
	v.SetDefault("PHONE_HOME_URL", "https://app.datasentinel.io/api/v1/updates")
	v.SetDefault("LOG_LEVEL", "info")
	v.SetDefault("WORKER_REDIS_URL", "redis://localhost:6379/1")
	v.SetDefault("INTERNAL_API_KEY", "")

	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// Optional .env file (ignored if absent — env vars take precedence)
	v.SetConfigFile(".env")
	v.SetConfigType("env")
	_ = v.ReadInConfig()

	cfg := &Config{}
	if err := v.Unmarshal(cfg); err != nil {
		return nil, fmt.Errorf("config unmarshal: %w", err)
	}

	if err := cfg.validate(); err != nil {
		return nil, fmt.Errorf("config validation: %w", err)
	}

	return cfg, nil
}

func (c *Config) validate() error {
	required := map[string]string{
		"DATABASE_URL":         c.DatabaseURL,
		"MASTER_ENCRYPTION_KEY": c.MasterEncryptionKey,
	}
	for k, v := range required {
		if strings.TrimSpace(v) == "" {
			return fmt.Errorf("required env var %s is not set", k)
		}
	}
	if len(c.MasterEncryptionKey) != 64 { // 32 bytes hex-encoded = 64 chars
		return fmt.Errorf("MASTER_ENCRYPTION_KEY must be 64 hex characters (32 bytes)")
	}
	return nil
}

// IsDevelopment returns true when running in development mode.
func (c *Config) IsDevelopment() bool { return c.Env == "development" }

// IsProduction returns true for production deployments.
func (c *Config) IsProduction() bool { return c.Env == "production" }

// CORSOrigins returns the slice of allowed origins for CORS.
func (c *Config) CORSOrigins() []string {
	return strings.Split(c.AllowedOrigins, ",")
}
