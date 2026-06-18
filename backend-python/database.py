from contextlib import contextmanager
from typing import Generator, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from config import get_settings
from models import Base

_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker[Session]] = None


def _init_engine() -> sessionmaker[Session]:
    global _engine, _SessionLocal
    if _SessionLocal is None:
        settings = get_settings()
        _engine = create_engine(
            settings.sqlalchemy_database_url,
            echo=False,
            pool_pre_ping=True,
        )
        _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
    return _SessionLocal


def init_db() -> None:
    _init_engine()
    assert _engine is not None
    Base.metadata.create_all(bind=_engine)
    with _engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE oauth_tokens "
                "ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE oauth_tokens "
                "ALTER COLUMN access_token_secret DROP NOT NULL"
            )
        )
        conn.execute(
            text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'PROCESSING'")
        )
        conn.execute(
            text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS cards JSONB")
        )


@contextmanager
def get_session() -> Generator[Session, None, None]:
    session = _init_engine()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
