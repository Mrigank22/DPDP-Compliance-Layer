# services/workers/app/db/client.py
"""
SQLAlchemy async-capable database client for the scan workers.
Workers need read access to assets/scans/policies and write access
to findings, scans (status updates), and alerts.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import sessionmaker, Session, DeclarativeBase
from sqlalchemy.pool import QueuePool

from app.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Declarative base — all SQLAlchemy models inherit from this
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Engine setup
# ---------------------------------------------------------------------------

def _make_engine():
    engine = create_engine(
        settings.database_url,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,          # detect stale connections
        pool_recycle=1800,           # recycle connections every 30 min
        echo=settings.debug_sql,
        connect_args={
            "connect_timeout": 10,
            "application_name": "datasentinel-workers",
            "options": "-c timezone=UTC",
        },
    )
    return engine


_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = _make_engine()
    return _engine


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=None,           # bound lazily via get_engine()
)


# ---------------------------------------------------------------------------
# Tenant-context session helper
# Each worker task MUST call set_tenant_context() immediately after opening
# a session so that PostgreSQL RLS policies are enforced correctly.
# ---------------------------------------------------------------------------

@contextmanager
def get_db(tenant_id: str | None = None) -> Generator[Session, None, None]:
    """
    Yield a database session. If tenant_id is provided, sets the
    PostgreSQL session variable ``app.current_tenant_id`` so that
    Row-Level Security policies are enforced for that tenant.

    Usage::

        with get_db(tenant_id=task_tenant_id) as db:
            findings = db.query(Finding).filter(...).all()
    """
    SessionLocal.configure(bind=get_engine())
    session: Session = SessionLocal()
    try:
        if tenant_id:
            session.execute(
                text("SET LOCAL app.current_tenant_id = :tid"),
                {"tid": tenant_id},
            )
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

def check_db_health() -> bool:
    """Returns True when the database is reachable."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.error("DB health check failed: %s", exc)
        return False
