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
	query := `INSERT INTO datasentinel.audit_logs
        (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, changes, timestamp)
        VALUES (toUUID(?), toUUID(?), toUUID(?), ?, ?, toUUID(?), ?, ?, ?, ?)`

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

	// Build WHERE clause once, shared by both queries
	where := "WHERE tenant_id = ?"
	args := []any{tenantID}

	if filter.Action != "" {
		where += " AND action = ?"
		args = append(args, filter.Action)
	}
	if filter.ResourceType != "" {
		where += " AND resource_type = ?"
		args = append(args, filter.ResourceType)
	}
	if filter.ResourceID != "" {
		where += " AND resource_id = ?"
		args = append(args, filter.ResourceID)
	}
	if filter.UserID != "" {
		where += " AND user_id = ?"
		args = append(args, filter.UserID)
	}
	if filter.StartDate != nil {
		where += " AND timestamp >= ?"
		args = append(args, *filter.StartDate)
	}
	if filter.EndDate != nil {
		where += " AND timestamp <= ?"
		args = append(args, *filter.EndDate)
	}

	// Count
	var total int64
	if err := ch.conn.QueryRowContext(ctx,
		"SELECT count() FROM audit_logs "+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("clickhouse count audit_logs: %w", err)
	}

	// Data — reuse same where + args
	dataQuery := fmt.Sprintf(`SELECT id, tenant_id, user_id, action, resource_type,
        resource_id, ip_address, user_agent, changes, timestamp
        FROM audit_logs %s ORDER BY timestamp DESC LIMIT %d OFFSET %d`,
		where, filter.PageSize, offset)

	rows, err := ch.conn.QueryContext(ctx, dataQuery, args...)
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
	if logs == nil {
		logs = []*models.AuditLog{}
	}
	return logs, total, rows.Err()
}

// QueryGatewayEvents retrieves paginated gateway interception events for a tenant,
// newest first. Filters by action, PII type, LLM-call flag, and a `since` cutoff.
func (ch *ClickHouseClient) QueryGatewayEvents(ctx context.Context, tenantID string, filter *models.GatewayEventFilter) ([]*models.GatewayEvent, int64, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 25
	}
	offset := (filter.Page - 1) * filter.PageSize

	where := "WHERE tenant_id = ?"
	args := []any{tenantID}
	if filter.Action != "" {
		where += " AND action_taken = ?"
		args = append(args, filter.Action)
	}
	if filter.PIIType != "" {
		where += " AND has(pii_types_detected, ?)"
		args = append(args, filter.PIIType)
	}
	if filter.WasLLMCall != nil {
		where += " AND was_llm_call = ?"
		args = append(args, *filter.WasLLMCall)
	}
	if filter.Since != nil {
		where += " AND timestamp > ?"
		args = append(args, *filter.Since)
	}

	var total int64
	if err := ch.conn.QueryRowContext(ctx, "SELECT count() FROM gateway_events "+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("clickhouse count gateway_events: %w", err)
	}

	dataQuery := `SELECT id, tenant_id, gateway_rule_id, timestamp, request_id, source_ip,
		destination_url, http_method, action_taken, pii_types_detected, field_names,
		payload_size_bytes, processing_latency_ms, was_llm_call, llm_provider, policy_id
		FROM gateway_events ` + where +
		fmt.Sprintf(" ORDER BY timestamp DESC LIMIT %d OFFSET %d", filter.PageSize, offset)

	rows, err := ch.conn.QueryContext(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("clickhouse query gateway_events: %w", err)
	}
	defer rows.Close()

	events := make([]*models.GatewayEvent, 0, filter.PageSize)
	for rows.Next() {
		e := &models.GatewayEvent{}
		if err := rows.Scan(
			&e.ID, &e.TenantID, &e.GatewayRuleID, &e.Timestamp, &e.RequestID, &e.SourceIP,
			&e.DestinationURL, &e.HTTPMethod, &e.ActionTaken, &e.PIITypesDetected, &e.FieldNames,
			&e.PayloadSizeBytes, &e.ProcessingLatencyMs, &e.WasLLMCall, &e.LLMProvider, &e.PolicyID,
		); err != nil {
			return nil, 0, fmt.Errorf("clickhouse scan gateway_event: %w", err)
		}
		events = append(events, e)
	}
	return events, total, rows.Err()
}

// QueryGatewayStats computes aggregate gateway analytics over the last N hours.
func (ch *ClickHouseClient) QueryGatewayStats(ctx context.Context, tenantID string, hours int) (*models.GatewayStatsResponse, error) {
	if hours < 1 || hours > 168 {
		hours = 24
	}
	cutoff := time.Now().Add(-time.Duration(hours) * time.Hour)
	resp := &models.GatewayStatsResponse{
		PeriodHours: hours,
		ByAction:    map[string]int64{},
		ByPIIType:   map[string]int64{},
		Timeline:    []models.GatewayTimeBin{},
	}

	// Totals + latency + LLM + PII detections in a single pass.
	row := ch.conn.QueryRowContext(ctx, `
		SELECT
			count() AS total,
			countIf(action_taken = 'blocked') AS blocked,
			countIf(action_taken = 'masked') AS masked,
			countIf(action_taken = 'redacted') AS redacted,
			countIf(action_taken = 'allowed') AS allowed,
			countIf(action_taken = 'tokenized') AS tokenized,
			countIf(was_llm_call) AS llm_calls,
			countIf(length(pii_types_detected) > 0) AS pii_detections,
			avg(processing_latency_ms) AS avg_latency
		FROM gateway_events
		WHERE tenant_id = ? AND timestamp >= ?`,
		tenantID, cutoff,
	)
	var avgLatency float64
	if err := row.Scan(
		&resp.TotalEvents, &resp.Blocked, &resp.Masked, &resp.Redacted,
		&resp.Allowed, &resp.Tokenized, &resp.LLMCalls, &resp.PIIDetections, &avgLatency,
	); err != nil {
		return nil, fmt.Errorf("clickhouse gateway stats: %w", err)
	}
	resp.AvgLatencyMs = round2(avgLatency)
	resp.ByAction = map[string]int64{
		"blocked": resp.Blocked, "masked": resp.Masked, "redacted": resp.Redacted,
		"allowed": resp.Allowed, "tokenized": resp.Tokenized,
	}
	if resp.TotalEvents > 0 {
		resp.BlockRate = round2(float64(resp.Blocked) / float64(resp.TotalEvents) * 100)
	}

	// PII-type breakdown via arrayJoin (best-effort; ignore errors so stats still render).
	if piiRows, err := ch.conn.QueryContext(ctx, `
		SELECT pii, count() AS c
		FROM gateway_events
		ARRAY JOIN pii_types_detected AS pii
		WHERE tenant_id = ? AND timestamp >= ?
		GROUP BY pii ORDER BY c DESC LIMIT 12`,
		tenantID, cutoff,
	); err == nil {
		defer piiRows.Close()
		for piiRows.Next() {
			var pii string
			var c int64
			if err := piiRows.Scan(&pii, &c); err == nil {
				resp.ByPIIType[pii] = c
			}
		}
	}

	// Hourly activity timeline.
	if tlRows, err := ch.conn.QueryContext(ctx, `
		SELECT toStartOfHour(timestamp) AS bucket, count() AS c,
		       countIf(action_taken = 'blocked') AS blocked
		FROM gateway_events
		WHERE tenant_id = ? AND timestamp >= ?
		GROUP BY bucket ORDER BY bucket ASC`,
		tenantID, cutoff,
	); err == nil {
		defer tlRows.Close()
		for tlRows.Next() {
			var bucket time.Time
			var c, blocked int64
			if err := tlRows.Scan(&bucket, &c, &blocked); err == nil {
				resp.Timeline = append(resp.Timeline, models.GatewayTimeBin{
					TS: bucket.Format("15:04"), Count: c, Blocked: blocked,
				})
			}
		}
	}

	return resp, nil
}

func round2(f float64) float64 {
	return float64(int64(f*100+0.5)) / 100
}

// Ping checks ClickHouse availability.
func (ch *ClickHouseClient) Ping(ctx context.Context) error {
	return ch.conn.PingContext(ctx)
}

// Close closes the ClickHouse connection pool.
func (ch *ClickHouseClient) Close() error {
	return ch.conn.Close()
}
