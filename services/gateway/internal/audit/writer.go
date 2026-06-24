// services/gateway/internal/audit/writer.go

package audit

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/datasentinel/gateway/internal/config"
)

// GatewayEvent represents a single intercepted request/response event logged to ClickHouse.
type GatewayEvent struct {
	ID                  string
	TenantID            string
	GatewayRuleID       string
	Timestamp           time.Time
	RequestID           string
	SourceIP            string
	DestinationURL      string
	HTTPMethod          string
	ActionTaken         string
	PIITypesDetected    []string
	FieldNames          []string
	PayloadSizeBytes    uint32
	ProcessingLatencyMs uint16
	WasLLMCall          bool
	LLMProvider         string
	LLMModel            string
	AIApp               string
	AIUser              string
	PromptTokens        uint32
	CompletionTokens    uint32
	TotalTokens         uint32
	PolicyID            string
}

// Writer batches gateway events and flushes them to ClickHouse in bulk.
// It is safe for concurrent use.
type Writer struct {
	conn     *sql.DB
	log      *zap.Logger
	cfg      *config.Config
	mu       sync.Mutex
	batch    []*GatewayEvent
	flushCh  chan struct{}
	stopCh   chan struct{}
	wg       sync.WaitGroup
}

const (
	batchSize     = 500
	flushInterval = 2 * time.Second
)

// NewWriter creates a Writer and starts the background flush goroutine.
func NewWriter(cfg *config.Config, log *zap.Logger) (*Writer, error) {
	conn := clickhouse.OpenDB(&clickhouse.Options{
		Addr: []string{cfg.ClickHouseURL},
		Auth: clickhouse.Auth{
			Database: cfg.ClickHouseDatabase,
			Username: cfg.ClickHouseUser,
			Password: cfg.ClickHousePassword,
		},
		DialTimeout:  10 * time.Second,
		MaxOpenConns: 5,
		MaxIdleConns: 2,
		Compression:  &clickhouse.Compression{Method: clickhouse.CompressionLZ4},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := conn.PingContext(ctx); err != nil {
		log.Warn("clickhouse unavailable — gateway events will be lost", zap.Error(err))
	}

	w := &Writer{
		conn:    conn,
		log:     log,
		cfg:     cfg,
		batch:   make([]*GatewayEvent, 0, batchSize),
		flushCh: make(chan struct{}, 1),
		stopCh:  make(chan struct{}),
	}
	w.wg.Add(1)
	go w.flushLoop()
	return w, nil
}

// Write enqueues a gateway event for batch insertion.
func (w *Writer) Write(event *GatewayEvent) {
	if event.ID == "" {
		event.ID = uuid.New().String()
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}

	w.mu.Lock()
	w.batch = append(w.batch, event)
	shouldFlush := len(w.batch) >= batchSize
	w.mu.Unlock()

	if shouldFlush {
		select {
		case w.flushCh <- struct{}{}:
		default:
		}
	}
}

// flushLoop runs on a ticker and flushes the batch to ClickHouse.
func (w *Writer) flushLoop() {
	defer w.wg.Done()
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			w.flush()
		case <-w.flushCh:
			w.flush()
		case <-w.stopCh:
			w.flush() // final flush on shutdown
			return
		}
	}
}

// flush drains the current batch and inserts into ClickHouse.
func (w *Writer) flush() {
	w.mu.Lock()
	if len(w.batch) == 0 {
		w.mu.Unlock()
		return
	}
	toWrite := w.batch
	w.batch = make([]*GatewayEvent, 0, batchSize)
	w.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := w.insertBatch(ctx, toWrite); err != nil {
		w.log.Error("clickhouse batch insert failed",
			zap.Int("count", len(toWrite)),
			zap.Error(err),
		)
	}
}

// insertBatch writes a slice of events to ClickHouse in a single batch insert.
func (w *Writer) insertBatch(ctx context.Context, events []*GatewayEvent) error {
	if len(events) == 0 {
		return nil
	}

	query := `INSERT INTO gateway_events
		(id, tenant_id, gateway_rule_id, timestamp, request_id, source_ip,
		 destination_url, http_method, action_taken, pii_types_detected,
		 field_names, payload_size_bytes, processing_latency_ms,
		 was_llm_call, llm_provider, llm_model, ai_app, ai_user,
		 prompt_tokens, completion_tokens, total_tokens, policy_id)
		VALUES`

	// Build the batch using ClickHouse Go driver batch API
	scope, err := w.conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	stmt, err := scope.PrepareContext(ctx, query+
		` (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		scope.Rollback()
		return fmt.Errorf("prepare stmt: %w", err)
	}
	defer stmt.Close()

	for _, e := range events {
		if _, err := stmt.ExecContext(ctx,
			e.ID, e.TenantID, e.GatewayRuleID, e.Timestamp,
			e.RequestID, e.SourceIP, e.DestinationURL, e.HTTPMethod,
			e.ActionTaken, e.PIITypesDetected, e.FieldNames,
			e.PayloadSizeBytes, e.ProcessingLatencyMs,
			e.WasLLMCall, e.LLMProvider, e.LLMModel, e.AIApp, e.AIUser,
			e.PromptTokens, e.CompletionTokens, e.TotalTokens, e.PolicyID,
		); err != nil {
			scope.Rollback()
			return fmt.Errorf("exec row: %w", err)
		}
	}

	if err := scope.Commit(); err != nil {
		return fmt.Errorf("commit batch: %w", err)
	}

	w.log.Debug("gateway events flushed", zap.Int("count", len(events)))
	return nil
}

// Stop gracefully shuts down the writer, flushing any pending events.
func (w *Writer) Stop() {
	close(w.stopCh)
	w.wg.Wait()
	w.conn.Close()
}
