// services/control-plane/internal/services/worker_service.go

package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/datasentinel/control-plane/internal/config"
)

// celeryTask is the Celery-compatible task envelope published to Redis.
// Celery workers will consume these from the configured queue.
type celeryTask struct {
	ID      string         `json:"id"`
	Task    string         `json:"task"`
	Args    []any          `json:"args"`
	Kwargs  map[string]any `json:"kwargs"`
	Retries int            `json:"retries"`
	ETA     *time.Time     `json:"eta,omitempty"`
}

// WorkerService dispatches tasks to the Python Celery scan workers via Redis.
type WorkerService struct {
	redis *redis.Client
	cfg   *config.Config
	log   *zap.Logger
}

// Queue name constants — must match Celery worker queue definitions.
const (
	QueueDiscovery     = "discovery"
	QueueClassification = "classification"
	QueuePosture       = "posture"
	QueueRights        = "rights"
	QueueNotifications = "notifications"
	QueueReports       = "reports"
)

// NewWorkerService creates a WorkerService.
func NewWorkerService(redis *redis.Client, cfg *config.Config, log *zap.Logger) *WorkerService {
	return &WorkerService{redis: redis, cfg: cfg, log: log}
}

// DispatchScan enqueues a scan task for the discovery worker.
// Returns the Celery task ID.
func (s *WorkerService) DispatchScan(ctx context.Context, scanID, assetID, tenantID, scanType string) (string, error) {
	task := &celeryTask{
		ID:   uuid.New().String(),
		Task: "app.tasks.discovery.run_scan",
		Kwargs: map[string]any{
			"scan_id":   scanID,
			"asset_id":  assetID,
			"tenant_id": tenantID,
			"scan_type": scanType,
		},
	}
	return task.ID, s.publish(ctx, QueueDiscovery, task)
}

// DispatchRightsSearch enqueues a DSR search task across all connected assets.
func (s *WorkerService) DispatchRightsSearch(ctx context.Context, requestID, principalEmail, tenantID string) (string, error) {
	task := &celeryTask{
		ID:   uuid.New().String(),
		Task: "app.tasks.rights.search_data_principal",
		Kwargs: map[string]any{
			"request_id":      requestID,
			"principal_email": principalEmail,
			"tenant_id":       tenantID,
		},
	}
	return task.ID, s.publish(ctx, QueueRights, task)
}

// DispatchReportGeneration enqueues a report generation task.
func (s *WorkerService) DispatchReportGeneration(ctx context.Context, reportID, tenantID string) error {
	task := &celeryTask{
		ID:   uuid.New().String(),
		Task: "app.tasks.reports.generate_report",
		Kwargs: map[string]any{
			"report_id": reportID,
			"tenant_id": tenantID,
		},
	}
	return s.publish(ctx, QueueReports, task)
}

// TestAssetConnection dispatches a synchronous-style connectivity test.
// For now, returns a basic check; full implementation pings the asset via worker RPC.
func (s *WorkerService) TestAssetConnection(ctx context.Context, assetID, tenantID string) (bool, string, error) {
	// In a real deployment, this would use Celery's chord/result backend to
	// wait for a synchronous result. For the control plane API, we dispatch
	// and return a task ID, then the frontend polls /scans/:id for the result.
	task := &celeryTask{
		ID:   uuid.New().String(),
		Task: "app.tasks.discovery.test_connection",
		Kwargs: map[string]any{
			"asset_id":  assetID,
			"tenant_id": tenantID,
		},
	}
	if err := s.publish(ctx, QueueDiscovery, task); err != nil {
		return false, "", fmt.Errorf("dispatch test: %w", err)
	}
	return true, "Connection test dispatched — check asset status", nil
}

// publish serialises a task and pushes it to the named Celery queue in Redis.
// Celery uses a LPUSH to `celery` key with a Kombu-formatted message.
func (s *WorkerService) publish(ctx context.Context, queue string, task *celeryTask) error {
	payload, err := json.Marshal(map[string]any{
		"body":            task,
		"content-type":    "application/json",
		"content-encoding": "utf-8",
		"headers": map[string]any{
			"task":    task.Task,
			"id":      task.ID,
			"retries": task.Retries,
		},
		"properties": map[string]any{
			"reply_to":    "",
			"delivery_mode": 2,
			"delivery_tag": uuid.New().String(),
			"delivery_info": map[string]any{
				"exchange":    "",
				"routing_key": queue,
			},
		},
	})
	if err != nil {
		return fmt.Errorf("marshal task: %w", err)
	}

	if err := s.redis.LPush(ctx, queue, payload).Err(); err != nil {
		s.log.Error("redis lpush task failed",
			zap.String("queue", queue),
			zap.String("task", task.Task),
			zap.Error(err),
		)
		return fmt.Errorf("redis lpush: %w", err)
	}

	s.log.Info("task dispatched",
		zap.String("queue", queue),
		zap.String("task", task.Task),
		zap.String("task_id", task.ID),
	)
	return nil
}
