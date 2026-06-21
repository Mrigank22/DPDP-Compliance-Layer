# services/workers/app/db/models.py
"""
SQLAlchemy ORM models for the DataSentinel PostgreSQL schema.
These mirror the Go bun models and the SQL migrations exactly.
Workers use these for reading task input (assets, policies, scans)
and writing results (findings, scan status, alerts).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    ARRAY,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.db.client import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Tenant
# ---------------------------------------------------------------------------

class Tenant(Base):
    __tablename__ = "tenants"

    id             = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name           = Column(Text, nullable=False)
    slug           = Column(Text, nullable=False, unique=True)
    plan           = Column(Text, nullable=False, default="starter")
    is_active      = Column(Boolean, nullable=False, default=True)
    settings       = Column(JSONB, nullable=False, default=dict)
    data_region    = Column(Text, nullable=False, default="ap-south-1")
    private_deploy = Column(Boolean, nullable=False, default=False)
    created_at     = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at     = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    users    = relationship("User",  back_populates="tenant", lazy="dynamic")
    assets   = relationship("Asset", back_populates="tenant", lazy="dynamic")
    policies = relationship("Policy", back_populates="tenant", lazy="dynamic")


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id                    = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id             = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    email                 = Column(Text, nullable=False, unique=True)
    password_hash         = Column(Text, nullable=True)
    full_name             = Column(Text, nullable=False, default="")
    role                  = Column(Text, nullable=False, default="viewer")
    is_active             = Column(Boolean, nullable=False, default=True)
    last_login_at         = Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    locked_until          = Column(DateTime(timezone=True), nullable=True)
    mfa_enabled           = Column(Boolean, nullable=False, default=False)
    mfa_secret            = Column(Text, nullable=True)
    invited_by            = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at            = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at            = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    tenant = relationship("Tenant", back_populates="users")


# ---------------------------------------------------------------------------
# APIKey
# ---------------------------------------------------------------------------

class APIKey(Base):
    __tablename__ = "api_keys"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id   = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id     = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name        = Column(Text, nullable=False)
    key_hash    = Column(Text, nullable=False, unique=True)
    key_prefix  = Column(Text, nullable=False)
    scopes      = Column(ARRAY(Text), nullable=False, default=list)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at  = Column(DateTime(timezone=True), nullable=True)
    is_active   = Column(Boolean, nullable=False, default=True)
    created_at  = Column(DateTime(timezone=True), nullable=False, default=_now)


# ---------------------------------------------------------------------------
# Asset
# ---------------------------------------------------------------------------

class Asset(Base):
    __tablename__ = "assets"

    id                = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id         = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name              = Column(Text, nullable=False)
    asset_type        = Column(Text, nullable=False)
    provider          = Column(Text, nullable=False)
    region            = Column(Text, nullable=True)
    connection_config = Column(JSONB, nullable=True)       # decrypted at app layer before use
    credentials_ref   = Column(Text, nullable=True)
    status            = Column(Text, nullable=False, default="connected")
    last_scanned_at   = Column(DateTime(timezone=True), nullable=True)
    pii_record_count  = Column(BigInteger, nullable=False, default=0)
    risk_score        = Column(Integer, nullable=False, default=0)
    tags              = Column(JSONB, nullable=False, default=dict)
    created_at        = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at        = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    tenant   = relationship("Tenant", back_populates="assets")
    scans    = relationship("Scan", back_populates="asset", lazy="dynamic")
    findings = relationship("Finding", back_populates="asset", lazy="dynamic")


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------

class Policy(Base):
    __tablename__ = "policies"

    id               = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id        = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name             = Column(Text, nullable=False)
    description      = Column(Text, nullable=False, default="")
    policy_type      = Column(Text, nullable=False)
    status           = Column(Text, nullable=False, default="active")
    enforcement_mode = Column(Text, nullable=False, default="alert")
    priority         = Column(Integer, nullable=False, default=100)
    rules            = Column(JSONB, nullable=False, default=dict)
    applies_to       = Column(JSONB, nullable=False, default=dict)
    created_by       = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    version          = Column(Integer, nullable=False, default=1)
    created_at       = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at       = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    tenant = relationship("Tenant", back_populates="policies")


# ---------------------------------------------------------------------------
# Scan
# ---------------------------------------------------------------------------

class Scan(Base):
    __tablename__ = "scans"

    id               = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id        = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    asset_id         = Column(UUID(as_uuid=False), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    scan_type        = Column(Text, nullable=False)
    status           = Column(Text, nullable=False, default="queued")
    triggered_by     = Column(Text, nullable=False, default="schedule")
    celery_task_id   = Column(Text, nullable=True)
    started_at       = Column(DateTime(timezone=True), nullable=True)
    completed_at     = Column(DateTime(timezone=True), nullable=True)
    records_scanned  = Column(BigInteger, nullable=False, default=0)
    pii_records_found = Column(BigInteger, nullable=False, default=0)
    error_message    = Column(Text, nullable=True)
    summary          = Column(JSONB, nullable=False, default=dict)
    created_at       = Column(DateTime(timezone=True), nullable=False, default=_now)

    asset    = relationship("Asset", back_populates="scans")
    findings = relationship("Finding", back_populates="scan", lazy="dynamic")


# ---------------------------------------------------------------------------
# Finding
# ---------------------------------------------------------------------------

class Finding(Base):
    __tablename__ = "findings"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id       = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    scan_id         = Column(UUID(as_uuid=False), ForeignKey("scans.id", ondelete="SET NULL"), nullable=True)
    asset_id        = Column(UUID(as_uuid=False), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    finding_type    = Column(Text, nullable=False)
    severity        = Column(Text, nullable=False)
    title           = Column(Text, nullable=False)
    description     = Column(Text, nullable=False, default="")
    pii_types       = Column(ARRAY(Text), nullable=False, default=list)
    location        = Column(JSONB, nullable=False, default=dict)
    sample_count    = Column(BigInteger, nullable=False, default=0)
    is_resolved     = Column(Boolean, nullable=False, default=False)
    resolved_by     = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at     = Column(DateTime(timezone=True), nullable=True)
    resolution_note = Column(Text, nullable=True)
    evidence        = Column(JSONB, nullable=False, default=dict)
    created_at      = Column(DateTime(timezone=True), nullable=False, default=_now)

    asset = relationship("Asset", back_populates="findings")
    scan  = relationship("Scan", back_populates="findings")


# ---------------------------------------------------------------------------
# Alert
# ---------------------------------------------------------------------------

class Alert(Base):
    __tablename__ = "alerts"

    id                 = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id          = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    alert_type         = Column(Text, nullable=False)
    severity           = Column(Text, nullable=False)
    title              = Column(Text, nullable=False)
    body               = Column(Text, nullable=False, default="")
    related_finding_id = Column(UUID(as_uuid=False), ForeignKey("findings.id", ondelete="SET NULL"), nullable=True)
    related_asset_id   = Column(UUID(as_uuid=False), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    is_acknowledged    = Column(Boolean, nullable=False, default=False)
    acknowledged_by    = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    acknowledged_at    = Column(DateTime(timezone=True), nullable=True)
    notification_sent  = Column(Boolean, nullable=False, default=False)
    created_at         = Column(DateTime(timezone=True), nullable=False, default=_now)


# ---------------------------------------------------------------------------
# RightsRequest
# ---------------------------------------------------------------------------

class RightsRequest(Base):
    __tablename__ = "rights_requests"

    id                   = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id            = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    request_type         = Column(Text, nullable=False)
    data_principal_email = Column(Text, nullable=False)
    data_principal_name  = Column(Text, nullable=True)
    status               = Column(Text, nullable=False, default="received")
    due_date             = Column(DateTime(timezone=True), nullable=False)
    assigned_to          = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes                = Column(Text, nullable=True)
    response_data        = Column(JSONB, nullable=True)
    rejection_reason     = Column(Text, nullable=True)
    created_at           = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at           = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)


# ---------------------------------------------------------------------------
# ConsentRecord
# ---------------------------------------------------------------------------

class ConsentRecord(Base):
    __tablename__ = "consent_records"

    id                   = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id            = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    data_principal_id    = Column(Text, nullable=False)
    purpose              = Column(Text, nullable=False)
    consent_given        = Column(Boolean, nullable=False)
    consent_timestamp    = Column(DateTime(timezone=True), nullable=True)
    withdrawal_timestamp = Column(DateTime(timezone=True), nullable=True)
    notice_version       = Column(Text, nullable=True)
    ip_address           = Column(Text, nullable=True)
    consent_mechanism    = Column(Text, nullable=False, default="form")
    meta                 = Column("metadata",JSONB, nullable=False, default=dict)
    created_at           = Column(DateTime(timezone=True), nullable=False, default=_now)


# ---------------------------------------------------------------------------
# DataFlow
# ---------------------------------------------------------------------------

class DataFlow(Base):
    __tablename__ = "data_flows"

    id                  = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id           = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    source_asset_id     = Column(UUID(as_uuid=False), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    destination_url     = Column(Text, nullable=False)
    destination_type    = Column(Text, nullable=False)
    pii_types_involved  = Column(ARRAY(Text), nullable=False, default=list)
    is_approved         = Column(Boolean, nullable=False, default=False)
    approved_by         = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    first_detected_at   = Column(DateTime(timezone=True), nullable=False, default=_now)
    last_seen_at        = Column(DateTime(timezone=True), nullable=False, default=_now)
    event_count         = Column(BigInteger, nullable=False, default=0)
    created_at          = Column(DateTime(timezone=True), nullable=False, default=_now)


# ---------------------------------------------------------------------------
# GatewayRule
# ---------------------------------------------------------------------------

class GatewayRule(Base):
    __tablename__ = "gateway_rules"

    id            = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id     = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    policy_id     = Column(UUID(as_uuid=False), ForeignKey("policies.id", ondelete="SET NULL"), nullable=True)
    name          = Column(Text, nullable=False)
    route_pattern = Column(Text, nullable=False)
    http_methods  = Column(ARRAY(Text), nullable=False, default=list)
    direction     = Column(Text, nullable=False, default="both")
    action        = Column(Text, nullable=False)
    pii_types     = Column(ARRAY(Text), nullable=False, default=list)
    mask_config   = Column(JSONB, nullable=False, default=dict)
    is_active     = Column(Boolean, nullable=False, default=True)
    created_at    = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at    = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

class Report(Base):
    __tablename__ = "reports"

    id             = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tenant_id      = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    report_type    = Column(Text, nullable=False)
    title          = Column(Text, nullable=False)
    status         = Column(Text, nullable=False, default="generating")
    file_url       = Column(Text, nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)
    generated_by   = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    parameters     = Column(JSONB, nullable=False, default=dict)
    content        = Column(Text, nullable=True)
    content_html   = Column(Text, nullable=True)
    created_at     = Column(DateTime(timezone=True), nullable=False, default=_now)
