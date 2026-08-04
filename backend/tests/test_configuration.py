"""
Tests for how the app reads its environment.

Both cases here are about failing safe: an unset DATABASE_URL must stop the process
rather than fall back to a guessed connection string, and an unset HOST must keep the
unauthenticated API on loopback rather than publish it to the network.
"""

import pytest
from sqlalchemy import make_url

from app import main, storage


@pytest.fixture(autouse=True)
def restore_storage_globals():
    """configure_database mutates module state; put it back for later tests."""
    engine, session_factory = storage._engine, storage._SessionLocal
    yield
    storage._engine, storage._SessionLocal = engine, session_factory


def test_missing_database_url_raises_instead_of_guessing(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_URL is not set"):
        storage.configure_database()


def test_explicit_url_beats_the_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://wrong:wrong@example.invalid/db")
    url = f"sqlite+pysqlite:///{tmp_path / 'explicit.db'}"

    storage.configure_database(url)

    assert storage._engine is not None
    assert storage._engine.url == make_url(url)


def test_host_defaults_to_loopback(monkeypatch):
    monkeypatch.delenv("HOST", raising=False)
    monkeypatch.delenv("PORT", raising=False)

    assert main.server_host() == "127.0.0.1"
    assert main.server_port() == 8001


def test_host_and_port_are_overridable(monkeypatch):
    monkeypatch.setenv("HOST", "0.0.0.0")
    monkeypatch.setenv("PORT", "9000")

    assert main.server_host() == "0.0.0.0"
    assert main.server_port() == 9000
