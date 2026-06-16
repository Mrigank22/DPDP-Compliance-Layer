# services/workers/app/celery_app.py
"""
Celery application factory for DataSentinel scan workers.
All task modules are auto-discovered from app.tasks.
"""

from __future__ import annotations

from celery import Celery
from celery.signals import worker_ready, worker_shutdown
from kombu import Queue

from app.config import settings

# ---------------------------------------------------------------------------
# Application instance
# ---------------------------------------------------------------------------

app = Celery(
    "datasentinel_workers",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.discovery",
        "app.tasks.classification",
        "app.tasks.rights",
        "app.tasks.reports",
        "app.tasks.notifications",
        "app.tasks.posture",
    ],
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

app.conf.update(
    # Serialization
    task_serializer=settings.celery_task_serializer,
    result_serializer=settings.celery_result_serializer,
    accept_content=settings.celery_accept_content,

    # Timezone
    timezone=settings.celery_timezone,
    enable_utc=settings.celery_enable_utc,

    # Task behaviour
    task_acks_late=True,                    # ack only after completion (safe re-delivery)
    task_reject_on_worker_lost=True,        # re-queue if worker crashes mid-task
    task_soft_time_limit=settings.celery_task_soft_time_limit,
    task_time_limit=settings.celery_task_time_limit,
    task_max_retries=settings.celery_task_max_retries,
    task_default_retry_delay=settings.celery_task_default_retry_delay,

    # Result expiry (keep results for 24 h for status polling)
    result_expires=86400,

    # Worker
    worker_prefetch_multiplier=1,           # one task at a time per worker process
    worker_concurrency=settings.celery_worker_concurrency,
    worker_max_tasks_per_child=500,         # restart worker process after 500 tasks (memory safety)

    # Queue definitions — each queue maps to a dedicated worker pool
    task_queues=(
        Queue("discovery",       routing_key="discovery"),
        Queue("classification",  routing_key="classification"),
        Queue("rights",          routing_key="rights"),
        Queue("reports",         routing_key="reports"),
        Queue("notifications",   routing_key="notifications"),
    ),
    task_default_queue="discovery",
    task_routes={
        "app.tasks.discovery.*":      {"queue": "discovery"},
        "app.tasks.posture.*":        {"queue": "discovery"},
        "app.tasks.classification.*": {"queue": "classification"},
        "app.tasks.rights.*":         {"queue": "rights"},
        "app.tasks.reports.*":        {"queue": "reports"},
        "app.tasks.notifications.*":  {"queue": "notifications"},
    },

    # Beat schedule — periodic tasks
    beat_schedule={
        "scheduled-scans-every-hour": {
            "task": "app.tasks.discovery.run_scheduled_scans",
            "schedule": 3600.0,  # every 60 minutes
        },
        "check-overdue-rights-requests": {
            "task": "app.tasks.rights.check_overdue_requests",
            "schedule": 900.0,   # every 15 minutes
        },
        "posture-checks-every-6h": {
            "task": "app.tasks.posture.run_scheduled_posture_checks",
            "schedule": 21600.0,  # every 6 hours
        },
        "retention-policy-enforcement": {
            "task": "app.tasks.classification.enforce_retention_policies",
            "schedule": 86400.0, # daily
        },
        "cleanup-expired-tokens": {
            "task": "app.tasks.notifications.cleanup_expired_data",
            "schedule": 3600.0,
        },
    },
)


# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------

@worker_ready.connect
def on_worker_ready(sender, **kwargs):
    """Log when the worker process is fully started."""
    import logging
    logging.getLogger(__name__).info(
        "DataSentinel worker ready",
        extra={"worker": sender.hostname},
    )


@worker_shutdown.connect
def on_worker_shutdown(sender, **kwargs):
    """Clean up resources on graceful shutdown."""
    import logging
    logging.getLogger(__name__).info("Worker shutting down")


# ---------------------------------------------------------------------------
# Entry point (for local dev: celery -A app.celery_app worker -l info)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.start()