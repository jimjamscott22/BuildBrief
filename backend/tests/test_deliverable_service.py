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

    assert result.spec == "# Old Spec"
    assert result.agent_prompt == "# Old Prompt"
    assert result.implementation_plan == "generated with ollama/test"
    assert len(calls) == 1
    assert "Preset guidance" in calls[0]


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
