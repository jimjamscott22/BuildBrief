import asyncio

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models import Deliverable, Project
from app.schemas import GenerateRequest
from app.services import deliverables


def make_project() -> Project:
    return Project(
        id="project-1",
        title="Brief Builder",
        description="Build planning docs",
        target_users="Makers",
        platform="web",
        tech_preferences="React, FastAPI",
        complexity="medium",
        constraints="Local models only",
        extra_context="Prefer concise outputs",
        created_at="2026-06-19T00:00:00Z",
        updated_at="2026-06-19T00:00:00Z",
    )


def test_generate_request_rejects_unknown_deliverable():
    with pytest.raises(ValidationError):
        GenerateRequest(model="ollama/test", deliverables=["roadmap"])


def test_prepare_generation_validates_before_building_prompts():
    prompts = deliverables.prepare_generation(
        make_project(), "ollama/test", ["spec"], "mvp"
    )
    assert list(prompts) == ["spec"]
    assert "Preset guidance" in prompts["spec"]

    with pytest.raises(HTTPException) as empty:
        deliverables.prepare_generation(make_project(), "ollama/test", [], None)
    assert empty.value.status_code == 400

    with pytest.raises(HTTPException) as model:
        deliverables.prepare_generation(make_project(), "remote/test", ["spec"], None)
    assert model.value.status_code == 400


def test_generation_preserves_unselected_existing_deliverables(monkeypatch):
    calls: list[str] = []

    async def fake_generate(model: str, prompt: str) -> str:
        calls.append(prompt)
        return f"generated with {model}"

    monkeypatch.setattr(deliverables.providers, "generate", fake_generate)

    result = asyncio.run(
        deliverables.generate_deliverables(
            project=make_project(),
            existing=Deliverable(spec="# Old Spec", agent_prompt="# Old Prompt"),
            model="ollama/test",
            deliverable_keys=["implementation_plan"],
            preset="agent_handoff",
        )
    )

    assert result.deliverables.spec == "# Old Spec"
    assert result.deliverables.agent_prompt == "# Old Prompt"
    assert result.deliverables.implementation_plan == "generated with ollama/test"
    assert result.failures == []
    assert len(calls) == 1
    assert "Preset guidance" in calls[0]


def test_partial_failure_keeps_the_deliverables_that_succeeded(monkeypatch):
    async def fake_generate(model: str, prompt: str) -> str:
        if "prompt engineer" in prompt:
            raise RuntimeError("model dropped the connection")
        return "generated"

    monkeypatch.setattr(deliverables.providers, "generate", fake_generate)

    result = asyncio.run(
        deliverables.generate_deliverables(
            project=make_project(),
            existing=None,
            model="ollama/test",
            deliverable_keys=["spec", "implementation_plan", "agent_prompt"],
        )
    )

    assert result.deliverables.spec == "generated"
    assert result.deliverables.implementation_plan == "generated"
    assert result.deliverables.agent_prompt is None
    assert [failure.deliverable for failure in result.failures] == ["agent_prompt"]
    assert result.failures[0].label == "Agent Prompt"
    assert "Agent Prompt" in result.failures[0].message


def test_total_failure_still_raises(monkeypatch):
    async def fake_generate(model: str, prompt: str) -> str:
        raise RuntimeError("provider is down")

    monkeypatch.setattr(deliverables.providers, "generate", fake_generate)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            deliverables.generate_deliverables(
                project=make_project(),
                existing=None,
                model="ollama/test",
                deliverable_keys=["spec", "implementation_plan"],
            )
        )

    assert exc.value.status_code == 502


def test_generation_maps_provider_errors_to_http_error(monkeypatch):
    async def fake_generate(model: str, prompt: str) -> str:
        raise ValueError("Unknown model prefix in: bad/model")

    monkeypatch.setattr(deliverables.providers, "generate", fake_generate)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            deliverables.generate_deliverables(
                project=make_project(),
                existing=None,
                model="bad/model",
                deliverable_keys=["spec"],
            )
        )

    assert exc.value.status_code == 400
    assert "Unknown model prefix" in exc.value.detail
