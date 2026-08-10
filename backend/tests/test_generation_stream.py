import asyncio

from app.models import Project
from app.services import generation_stream


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


async def collect_events(stream):
    return [event async for event in stream]


def test_stream_persists_before_completed_and_keeps_partial_failures(monkeypatch):
    persisted = []

    async def fake_stream(model: str, prompt: str):
        if "prompt engineer" in prompt:
            raise RuntimeError("provider dropped")
        yield "# Generated"
        yield "\nBody"

    async def persist(key, content):
        persisted.append((key, content))

    monkeypatch.setattr(generation_stream.providers, "stream_generate", fake_stream)
    events = asyncio.run(
        collect_events(
            generation_stream.stream_generation(
                make_project(),
                "ollama/test",
                ["spec", "agent_prompt"],
                None,
                persist,
            )
        )
    )

    assert events[0].event == "started"
    assert persisted == [("spec", "# Generated\nBody")]
    assert any(
        event.event == "completed" and event.data["deliverable"] == "spec"
        for event in events
    )
    assert any(
        event.event == "failed" and event.data["deliverable"] == "agent_prompt"
        for event in events
    )
    assert events[-1].event == "done"
    assert events[-1].data["failures"][0]["deliverable"] == "agent_prompt"


def test_stream_cancels_unfinished_provider_when_consumer_closes(monkeypatch):
    cancelled = asyncio.Event()

    async def blocked_stream(model: str, prompt: str):
        try:
            yield "partial"
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    async def persist(key, content):
        raise AssertionError("an incomplete draft must not be persisted")

    monkeypatch.setattr(generation_stream.providers, "stream_generate", blocked_stream)

    async def scenario():
        stream = generation_stream.stream_generation(
            make_project(), "ollama/test", ["spec"], None, persist
        )
        assert (await anext(stream)).event == "started"
        assert (await anext(stream)).event == "delta"
        await stream.aclose()
        await asyncio.wait_for(cancelled.wait(), timeout=1)

    asyncio.run(scenario())


def test_stream_reports_error_when_every_deliverable_fails(monkeypatch):
    async def failed_stream(model: str, prompt: str):
        raise RuntimeError("provider dropped")
        yield "unreachable"

    async def persist(key, content):
        raise AssertionError("a failed draft must not be persisted")

    monkeypatch.setattr(generation_stream.providers, "stream_generate", failed_stream)
    events = asyncio.run(
        collect_events(
            generation_stream.stream_generation(
                make_project(), "ollama/test", ["spec"], None, persist
            )
        )
    )

    assert [event.event for event in events] == ["started", "failed", "error"]
    assert not any(event.event == "done" for event in events)
