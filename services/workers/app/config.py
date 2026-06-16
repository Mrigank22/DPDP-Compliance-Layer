# services/workers/app/config.py
"""
Central configuration for the DataSentinel scan workers.
All values are sourced from environment variables; no secrets are hardcoded.
"""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ---- PostgreSQL ----------------------------------------------------------
    database_url: str = Field(..., description="PostgreSQL DSN, e.g. postgresql://user:pass@host:5432/db")
    debug_sql: bool   = Field(default=False, description="Log all SQL statements (dev only)")

    # ---- Redis ---------------------------------------------------------------
    redis_url: str = Field(default="redis://localhost:6379/0", description="Redis DSN for Celery broker & result backend")

    # ---- Celery --------------------------------------------------------------
    celery_task_serializer: str       = "json"
    celery_result_serializer: str     = "json"
    celery_accept_content: list[str]  = ["json"]
    celery_timezone: str              = "Asia/Kolkata"
    celery_enable_utc: bool           = True
    celery_worker_concurrency: int    = Field(default=4, description="Number of worker processes")
    celery_task_soft_time_limit: int  = Field(default=3600, description="Soft task time limit in seconds (1 hour)")
    celery_task_time_limit: int       = Field(default=3900, description="Hard task time limit in seconds")
    celery_task_max_retries: int      = Field(default=3)
    celery_task_default_retry_delay: int = Field(default=60, description="Seconds between retries")

    # ---- AWS -----------------------------------------------------------------
    aws_region: str                = Field(default="ap-south-1")
    aws_access_key_id: str | None  = Field(default=None)
    aws_secret_access_key: str | None = Field(default=None)
    aws_role_arn: str | None       = Field(default=None, description="IAM role to assume for cross-account scans")
    s3_reports_bucket: str | None  = Field(default=None, description="S3 bucket where generated compliance reports are stored")
    report_url_ttl_seconds: int    = Field(default=604800, description="Lifetime of presigned report download URLs (max 7 days for SigV4)")

    # ---- GCP -----------------------------------------------------------------
    google_application_credentials: str | None = Field(default=None, description="Path to GCP service account JSON")

    # ---- Azure ---------------------------------------------------------------
    azure_storage_connection_string: str | None = Field(default=None)

    # ---- Encryption ----------------------------------------------------------
    master_encryption_key: str = Field(..., description="32-byte hex master key for AES-256-GCM (derive per-tenant keys via HKDF)")

    # ---- Control Plane -------------------------------------------------------
    control_plane_url: str     = Field(default="http://control-plane:3001", description="Internal URL of the control plane service")
    control_plane_api_key: str = Field(..., description="Internal service API key for worker → control plane calls")

    # ---- ClickHouse ----------------------------------------------------------
    clickhouse_url: str  = Field(default="http://clickhouse:8123", description="ClickHouse HTTP interface URL")
    clickhouse_user: str = Field(default="default")
    clickhouse_password: str = Field(default="")
    clickhouse_database: str = Field(default="datasentinel")

    # ---- Logging & Observability ---------------------------------------------
    log_level: str      = Field(default="INFO")
    environment: str    = Field(default="production", description="development | staging | production")
    service_name: str   = Field(default="datasentinel-workers")

    # ---- PII Detection -------------------------------------------------------
    presidio_score_threshold: float = Field(default=0.7, description="Minimum confidence score to report a PII detection")
    spacy_model: str = Field(default="en_core_web_lg")
    max_sample_size: int = Field(default=1000, description="Maximum number of records to analyse per table/object")

    # ---- Scan Settings -------------------------------------------------------
    scan_batch_size: int = Field(default=500, description="Records per batch during classification")
    s3_max_objects_per_scan: int = Field(default=10000, description="Cap on S3 objects inspected per scan run")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    @field_validator("presidio_score_threshold")
    @classmethod
    def _validate_threshold(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("presidio_score_threshold must be between 0.0 and 1.0")
        return v

    @field_validator("report_url_ttl_seconds")
    @classmethod
    def _clamp_report_ttl(cls, v: int) -> int:
        # AWS SigV4 presigned URLs are valid for at most 7 days (604800s).
        return max(60, min(v, 604800))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


# Module-level singleton for convenience: `from app.config import settings`
settings: Settings = get_settings()
