"""
HTTP-level tests for the projects router.

These exercise the sync/async split: the CRUD handlers are plain `def` (run by
FastAPI in a threadpool) while the generation handlers are `async def` and push
their storage calls to the threadpool themselves. Both paths have to reach the
same database, which is why these tests use a file-backed SQLite database rather
than `:memory:` — an in-memory database is not shared across threads.
"""

import json
import threading

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app
from app.routers import projects as projects_router
from app.services import deliverables as deliverable_service
from app.services.generation_stream import GenerationStreamEvent


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


def parse_sse(text: str):
    frames = []
    for block in text.strip().split("\n\n"):
        lines = block.splitlines()
        frames.append(
            (
                lines[0].removeprefix("event: "),
                json.loads(lines[1].removeprefix("data: ")),
            )
        )
    return frames


def test_encode_sse_uses_named_json_frame():
    frame = projects_router.encode_sse(
        GenerationStreamEvent("delta", {"deliverable": "spec", "delta": "å\n"})
    )
    assert frame.startswith(b"event: delta\ndata: ")
    assert frame.endswith(b"\n\n")
    assert json.loads(frame.decode().split("data: ", 1)[1]) == {
        "deliverable": "spec",
        "delta": "å\n",
    }


def test_stream_generation_persists_completed_deliverable(client, monkeypatch):
    async def fake_stream(model: str, prompt: str):
        yield "# Live"
        yield "\nSaved"

    monkeypatch.setattr(
        projects_router.generation_stream.providers, "stream_generate", fake_stream
    )
    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/generate/stream",
        json={"model": "ollama/test", "deliverables": ["spec"], "preset": "mvp"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    frames = parse_sse(response.text)
    assert [event for event, _ in frames] == [
        "started",
        "delta",
        "delta",
        "completed",
        "done",
    ]
    saved = client.get(f"/api/projects/{project_id}").json()["deliverables"]
    assert saved["spec"] == "# Live\nSaved"


def test_stream_generation_serializes_first_deliverable_saves(client, monkeypatch):
    """Two completed fields must survive storage's single-row creation boundary."""

    async def fake_stream(model: str, prompt: str):
        if "prompt engineer" in prompt:
            yield "# Agent Prompt"
        else:
            yield "# Specification"

    first_save_entered = threading.Event()
    release_first_save = threading.Event()
    save_deliverables = projects_router.storage.save_deliverables

    def reject_overlapping_first_save(project_id, deliverable):
        if first_save_entered.is_set():
            release_first_save.set()
            raise RuntimeError("concurrent first saves are unsafe")
        first_save_entered.set()
        try:
            release_first_save.wait(timeout=0.2)
            return save_deliverables(project_id, deliverable)
        finally:
            first_save_entered.clear()

    monkeypatch.setattr(
        projects_router.generation_stream.providers, "stream_generate", fake_stream
    )
    monkeypatch.setattr(
        projects_router.storage, "save_deliverables", reject_overlapping_first_save
    )
    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/generate/stream",
        json={
            "model": "ollama/test",
            "deliverables": ["spec", "agent_prompt"],
        },
    )

    frames = parse_sse(response.text)
    assert [event for event, _ in frames] == [
        "started",
        "delta",
        "delta",
        "completed",
        "completed",
        "done",
    ]
    saved = client.get(f"/api/projects/{project_id}").json()["deliverables"]
    assert saved["spec"] == "# Specification"
    assert saved["agent_prompt"] == "# Agent Prompt"


def test_stream_generation_persists_success_when_another_deliverable_fails(
    client, monkeypatch
):
    async def fake_stream(model: str, prompt: str):
        if "prompt engineer" in prompt:
            raise RuntimeError("model dropped the connection")
        yield "# Generated"

    monkeypatch.setattr(
        projects_router.generation_stream.providers, "stream_generate", fake_stream
    )
    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/generate/stream",
        json={
            "model": "ollama/test",
            "deliverables": ["spec", "agent_prompt"],
        },
    )

    assert response.status_code == 200
    frames = parse_sse(response.text)
    assert "failed" in [event for event, _ in frames]
    assert frames[-1][0] == "done"
    saved = client.get(f"/api/projects/{project_id}").json()["deliverables"]
    assert saved["spec"] == "# Generated"
    assert saved["agent_prompt"] is None


def test_stream_generation_emits_error_when_all_deliverables_fail(client, monkeypatch):
    async def fake_stream(model: str, prompt: str):
        raise RuntimeError("provider is down")
        yield ""

    monkeypatch.setattr(
        projects_router.generation_stream.providers, "stream_generate", fake_stream
    )
    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/generate/stream",
        json={"model": "ollama/test", "deliverables": ["spec"]},
    )

    assert response.status_code == 200
    assert parse_sse(response.text)[-1][0] == "error"


def test_stream_generation_validates_before_opening_stream(client):
    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/generate/stream",
        json={"model": "remote/test", "deliverables": ["spec"]},
    )
    assert response.status_code == 400
    assert "Unknown model prefix" in response.json()["detail"]


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
