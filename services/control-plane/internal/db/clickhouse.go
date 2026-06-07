// services/control-plane/internal/db/clickhouse.go

package db

import (
	"context"
	"crypto/tls"
	"database/sql"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/config"
	"github.com/datasentinel/control-plane/internal/models"
)

// ClickHouseClient wraps the ClickHouse connection and provides typed write methods.
type ClickHouseClient struct {
	conn *sql.DB
	db   string
	log  *zap.Logger
}

// NewClickHouse opens a ClickHouse connection pool.
func NewClickHouse(cfg *config.Config, log *zap.Logger) (*ClickHouseClient, error) {
	var tlsConfig *tls.Config

	if cfg.IsProduction() {
		tlsConfig = &tls.Config{}
	}

	conn := clickhouse.OpenDB(&clickhouse.Options{
		Addr: []string{cfg.ClickHouseURL},
		Auth: clickhouse.Auth{
			Database: cfg.ClickHouseDatabase,
			Username: cfg.ClickHouseUser,
			Password: cfg.ClickHousePassword,
		},
		TLS:             tlsConfig,
		DialTimeout:     10 * time.Second,
		MaxOpenConns:    10,
		MaxIdleConns:    5,
		ConnMaxLifetime: 30 * time.Minute,
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := conn.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("clickhouse ping: %w", err)
	}

	log.Info("clickhouse connected", zap.String("database", cfg.ClickHouseDatabase))
	return &ClickHouseClient{conn: conn, db: cfg.ClickHouseDatabase, log: log}, nil
}

// WriteAuditLog inserts a single audit log record asynchronously.
func (ch *ClickHouseClient) WriteAuditLog(ctx context.Context, entry *models.AuditLog) error {
	query := `INSERT INTO audit_logs
		(id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, changes, timestamp)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := ch.conn.ExecContext(ctx, query,
		entry.ID, entry.TenantID, entry.UserID, entry.Action,
		entry.ResourceType, entry.ResourceID, entry.IPAddress,
		entry.UserAgent, entry.Changes, entry.Timestamp,
	)
	if err != nil {
		ch.log.Error("clickhouse audit_log write failed", zap.Error(err))
		return fmt.Errorf("clickhouse write audit_log: %w", err)
	}
	return nil
}

// WriteGatewayEvent inserts a gateway interception event.
func (ch *ClickHouseClient) WriteGatewayEvent(ctx context.Context, event *models.GatewayEvent) error {
	query := `INSERT INTO gateway_events
		(id, tenant_id, gateway_rule_id, timestamp, request_id, source_ip,
		 destination_url, http_method, action_taken, pii_types_detected,
		 field_names, payload_size_bytes, processing_latency_ms,
		 was_llm_call, llm_provider, policy_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := ch.conn.ExecContext(ctx, query,
		event.ID, event.TenantID, event.GatewayRuleID, event.Timestamp,
		event.RequestID, event.SourceIP, event.DestinationURL, event.HTTPMethod,
		event.ActionTaken, event.PIITypesDetected, event.FieldNames,
		event.PayloadSizeBytes, event.ProcessingLatencyMs,
		event.WasLLMCall, event.LLMProvider, event.PolicyID,
	)
	if err != nil {
		ch.log.Error("clickhouse gateway_event write failed", zap.Error(err))
		return fmt.Errorf("clickhouse write gateway_event: %w", err)
	}
	return nil
}

// QueryAuditLogs retrieves paginated audit log entries for a tenant.
func (ch *ClickHouseClient) QueryAuditLogs(ctx context.Context, filter *models.AuditLogFilter, tenantID string) ([]*models.AuditLog, int64, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}
	offset := (filter.Page - 1) * filter.PageSize

	// Count query
	countQuery := `SELECT count() FROM audit_logs WHERE tenant_id = ?`
	args := []any{tenantID}

	if filter.Action != "" {
		countQuery += " AND action = ?"
		args = append(args, filter.Action)
	}
	if filter.ResourceType != "" {
		countQuery += " AND resource_type = ?"
		args = append(args, filter.ResourceType)
	}
	if filter.StartDate != nil {
		countQuery += " AND timestamp >= ?"
		args = append(args, *filter.StartDate)
	}
	if filter.EndDate != nil {
		countQuery += " AND timestamp <= ?"
		args = append(args, *filter.EndDate)
	}

	var total int64
	if err := ch.conn.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("clickhouse count audit_logs: %w", err)
	}

	// Data query
	dataQuery := countQuery + fmt.Sprintf(" ORDER BY timestamp DESC LIMIT %d OFFSET %d", filter.PageSize, offset)
	dataQuery = `SELECT id, tenant_id, user_id, action, resource_type, resource_id,
		ip_address, user_agent, changes, timestamp
		FROM audit_logs WHERE tenant_id = ?`
	dataArgs := []any{tenantID}

	if filter.Action != "" {
		dataQuery += " AND action = ?"
		dataArgs = append(dataArgs, filter.Action)
	}
	if filter.ResourceType != "" {
		dataQuery += " AND resource_type = ?"
		dataArgs = append(dataArgs, filter.ResourceType)
	}
	if filter.StartDate != nil {
		dataQuery += " AND timestamp >= ?"
		dataArgs = append(dataArgs, *filter.StartDate)
	}
	if filter.EndDate != nil {
		dataQuery += " AND timestamp <= ?"
		dataArgs = append(dataArgs, *filter.EndDate)
	}
	dataQuery += fmt.Sprintf(" ORDER BY timestamp DESC LIMIT %d OFFSET %d", filter.PageSize, offset)

	rows, err := ch.conn.QueryContext(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("clickhouse query audit_logs: %w", err)
	}
	defer rows.Close()

	var logs []*models.AuditLog
	for rows.Next() {
		entry := &models.AuditLog{}
		if err := rows.Scan(
			&entry.ID, &entry.TenantID, &entry.UserID, &entry.Action,
			&entry.ResourceType, &entry.ResourceID, &entry.IPAddress,
			&entry.UserAgent, &entry.Changes, &entry.Timestamp,
		); err != nil {
			return nil, 0, fmt.Errorf("clickhouse scan audit_log: %w", err)
		}
		logs = append(logs, entry)
	}
	return logs, total, rows.Err()
}

// Ping checks ClickHouse availability.
func (ch *ClickHouseClient) Ping(ctx context.Context) error {
	return ch.conn.PingContext(ctx)
}

// Close closes the ClickHouse connection pool.
func (ch *ClickHouseClient) Close() error {
	return ch.conn.Close()
}
