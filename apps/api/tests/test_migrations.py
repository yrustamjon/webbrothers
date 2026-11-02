"""Exercise frozen migrations against SQLite and optional isolated PostgreSQL schemas."""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

API_ROOT = Path(__file__).resolve().parents[1]


def migration_config():
    cfg = Config(str(API_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_ROOT / "migrations"))
    return cfg


def exercise(url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", str(url))
    cfg = migration_config()
    command.upgrade(cfg, "0001_metadata")
    engine = create_engine(url)
    assert "enrolled_scopes" not in {
        c["name"] for c in inspect(engine).get_columns("devices")
    }
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO users (id,email,password_hash,verified,created_at) VALUES ('u','test@example.com','hash',false,CURRENT_TIMESTAMP)"
            )
        )
        c.execute(
            text(
                "INSERT INTO devices (id,owner_id,display_name,operating_system,architecture,public_key,scopes,token_hash,revoked) VALUES ('d','u','Test','linux','amd64','key','[\"browser.discovery\"]','digest',false)"
            )
        )
    command.upgrade(cfg, "head")
    with engine.connect() as c:
        row = c.execute(
            text("SELECT scopes,enrolled_scopes,monitoring_paused FROM devices")
        ).one()
        assert row[0] == row[1] == '["browser.discovery"]' and not row[2]
    command.downgrade(cfg, "0001_metadata")
    assert "enrolled_scopes" not in {
        c["name"] for c in inspect(engine).get_columns("devices")
    }
    command.upgrade(cfg, "head")
    engine.dispose()


def test_sqlite_migration_upgrade(tmp_path, monkeypatch):
    exercise(f"sqlite:///{tmp_path}/migration.db", monkeypatch)


@pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="Alohida PostgreSQL ulanishi sozlanmagan"
)
def test_postgres_migration_upgrade(monkeypatch):
    # Unique schema confines all DDL and synthetic fixtures; shared tables stay unchanged.
    url = make_url(os.environ["TEST_DATABASE_URL"])
    schema = "bmp_test_" + uuid4().hex
    admin = create_engine(url)
    with admin.begin() as c:
        c.execute(text(f'CREATE SCHEMA "{schema}"'))
    isolated = url.update_query_dict({"options": "-csearch_path=" + schema})
    try:
        exercise(isolated.render_as_string(hide_password=False), monkeypatch)
    finally:
        with admin.begin() as c:
            c.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
