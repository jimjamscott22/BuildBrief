"""
HTTP-level tests for the projects router.

These exercise the sync/async split: the CRUD handlers are plain `def` (run by
FastAPI in a threadpool) while the generation handlers are `async def` and push
their storage calls to the threadpool themselves. Both paths have to reach the
same database, which is why these tests use a file-backed SQLite database rather
than `:memory:` — an in-memory database is not shared across threads.
"""

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app
from app.services import deliverables as deliverable_service


PROJECT_BODY = {
    "title": "Pi Library",
    "description": "Save generated build docs",
    "target_users": "Me",
    "platform": "web",
    "tech_preferences": "React, FastAPI",
    "complexity": "medium",
    "constraints": "Local models only",
    "extra_context": "",
}


@pytest.fixture()
def client(tmp_path):
    storage.configure_database(f"sqlite+pysqlite:///{tmp_path / 'test.db'}")
    storage.init_db()
    with TestClient(app) as test_client:
        yield test_client


def create_project(client) -> str:
    response = client.post("/api/projects", json=PROJECT_BODY)
    assert response.status_code == 201
    return response.json()["id"]


def test_project_crud_round_trip(client):
    project_id = create_project(client)

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [project_id]

    fetched = client.get(f"/api/projects/{project_id}")
    assert fetched.status_code == 200
    assert fetched.json()["project"]["title"] == "Pi Library"
    assert fetched.json()["deliverables"] is None

    assert client.delete(f"/api/projects/{project_id}").status_code == 204
    assert client.get(f"/api/projects/{project_id}").status_code == 404


def test_missing_project_returns_404(client):
    assert client.get("/api/projects/does-not-exist").status_code == 404
    assert client.delete("/api/projects/does-not-exist").status_code == 404

    response = client.post(
        "/api/projects/does-not-exist/generate",
        json={"model": "ollama/test", "deliverables": ["spec"]},
    )
    assert response.status_code == 404


def test_unknown_deliverable_key_is_rejected(client):
    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/generate",
        json={"model": "ollama/test", "deliverables": ["roadmap"]},
    )
    assert response.status_code == 422


def test_partial_generation_is_persisted(client, monkeypatch):
    """A failing deliverable must not discard the ones that already succeeded."""

    async def fake_generate(model: str, prompt: str) -> str:
        if "prompt engineer" in prompt:
            raise RuntimeError("model dropped the connection")
        return f"# Generated\n\n{model}"

    monkeypatch.setattr(deliverable_service.providers, "generate", fake_generate)

    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/generate",
        json={
            "model": "ollama/test",
            "deliverables": ["spec", "implementation_plan", "agent_prompt"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["deliverables"]["spec"].startswith("# Generated")
    assert payload["deliverables"]["implementation_plan"].startswith("# Generated")
    assert payload["deliverables"]["agent_prompt"] is None
    assert [item["deliverable"] for item in payload["failures"]] == ["agent_prompt"]

    # The successful outputs survive the request, which is the whole point.
    reloaded = client.get(f"/api/projects/{project_id}").json()
    assert reloaded["deliverables"]["spec"].startswith("# Generated")
    assert reloaded["deliverables"]["implementation_plan"].startswith("# Generated")
    assert reloaded["deliverables"]["agent_prompt"] is None

    summary = client.get("/api/projects").json()[0]
    assert summary["has_spec"] is True
    assert summary["has_implementation_plan"] is True
    assert summary["has_agent_prompt"] is False


def test_total_generation_failure_returns_502(client, monkeypatch):
    async def fake_generate(model: str, prompt: str) -> str:
        raise RuntimeError("provider is down")

    monkeypatch.setattr(deliverable_service.providers, "generate", fake_generate)

    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/generate",
        json={"model": "ollama/test", "deliverables": ["spec"]},
    )

    assert response.status_code == 502
    assert client.get(f"/api/projects/{project_id}").json()["deliverables"] is None


def test_unknown_model_prefix_returns_400(client):
    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/generate",
        json={"model": "mystery/model", "deliverables": ["spec"]},
    )

    assert response.status_code == 400
    assert "Unknown model prefix" in response.json()["detail"]
