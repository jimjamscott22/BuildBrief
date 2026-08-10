# Streaming Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BuildBrief's blind generation wait with cancellable, token-level streaming into Results while saving every fully completed deliverable.

**Architecture:** Provider-specific async iterators decode LM Studio SSE and Ollama NDJSON into text deltas. A provider-neutral service runs selected deliverables concurrently, emits typed events, and persists each complete output through an injected callback; a FastAPI `StreamingResponse` serializes those events as SSE. The React client parses the streamed `fetch()` response, a focused hook owns run state and cancellation, and Results renders drafts and statuses before reloading authoritative saved output.

**Tech Stack:** Python 3.10+, FastAPI 0.135.3, Starlette 1.0.0, HTTPX 0.28.1, pytest 8; React 18.3, React Router 6.30, TypeScript 5.6, Vite 8, Vitest, Testing Library, jsdom, Tailwind CSS 3.4.

## Global Constraints

- Use `POST /api/projects/{project_id}/generate/stream` with the existing `GenerateRequest` JSON body and a `text/event-stream` response.
- Keep `POST /api/projects/{project_id}/generate` and the buffered provider `generate()` interface working.
- Keep selected deliverables concurrent; do not introduce a job queue, reconnect protocol, database migration, authentication change, or concurrency limiter.
- Persist only complete deliverables and preserve unselected existing deliverables.
- On cancellation, retain completed deliverables and discard every incomplete draft.
- Use the existing visual system; add no runtime frontend or backend dependency.
- Add only Vitest, Testing Library, jest-dom, and jsdom as frontend development dependencies.
- Treat refresh or direct navigation to Results as saved mode; never restart generation without router state.
- Status must use text as well as color, progress must be announced politely, run failures must alert, and Stop must remain keyboard accessible.

---

## File Map

- `backend/app/providers.py`: decode each provider's wire format and expose `stream_generate()` while retaining `generate()`.
- `backend/app/services/deliverables.py`: centralize request validation and prompt construction shared by buffered and streaming paths.
- `backend/app/services/generation_stream.py`: own concurrent producer tasks, typed stream events, completion persistence, partial failures, and cancellation cleanup.
- `backend/app/routers/projects.py`: expose the streaming route, serialize SSE frames, and bridge completion persistence to synchronous storage through the threadpool.
- `backend/tests/test_providers.py`: verify provider frame decoding, routing, request flags, errors, and stream closure.
- `backend/tests/test_generation_stream.py`: verify orchestration, event ordering, partial failure, completion-before-persistence, and cancellation.
- `backend/tests/test_projects_router.py`: verify HTTP validation, SSE framing, saved output, and failure events.
- `frontend/src/generationStream.ts`: define the event union and parse arbitrary streamed byte boundaries into validated events.
- `frontend/src/api.ts`: perform the streaming POST and delegate body parsing.
- `frontend/src/pages/wizard/useWizardController.ts`: save the project and navigate immediately with a `generationRequest` instead of awaiting generation.
- `frontend/src/pages/results/useGenerationRun.ts`: own AbortController, elapsed time, draft accumulation, statuses, failures, settling reload, and cancellation notice.
- `frontend/src/pages/ResultsPage.tsx`: combine saved and generating modes and render live progress, statuses, Stop, Markdown, and export guards.
- `frontend/src/test/setup.ts`, `frontend/vite.config.ts`, `frontend/package.json`, `frontend/package-lock.json`: provide the frontend test harness.
- Focused `*.test.ts(x)` files live beside the frontend units they exercise.
- `docs/app-review.md` and `docs/app-review.html`: mark finding #03 complete with exact implementation and test evidence.

---

### Task 1: Provider token streams

**Files:**
- Create: `backend/tests/test_providers.py`
- Modify: `backend/app/providers.py`

**Interfaces:**
- Produces: `LMStudioProvider.stream(model_id: str, prompt: str) -> AsyncIterator[str]`.
- Produces: `OllamaProvider.stream(model_name: str, prompt: str) -> AsyncIterator[str]`.
- Produces: `split_model_id(prefixed_model: str) -> tuple[LMStudioProvider | OllamaProvider, str]`.
- Produces: `stream_generate(prefixed_model: str, prompt: str) -> AsyncIterator[str]`.
- Preserves: `generate(prefixed_model: str, prompt: str) -> Awaitable[str]` and both concrete buffered provider methods.

- [ ] **Step 1: Write failing parser and routing tests**

Create `backend/tests/test_providers.py` with real HTTPX streaming responses supplied by `MockTransport`:

```python
import asyncio
import json

import httpx
import pytest

from app import providers


async def collect(stream):
    return [chunk async for chunk in stream]


def async_client_for(lines: list[str], captured: dict):
    client_class = httpx.AsyncClient

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = json.loads(request.content)
        body = "\n".join(lines) + "\n"
        return httpx.Response(200, text=body)

    transport = httpx.MockTransport(handler)
    return lambda **kwargs: client_class(transport=transport, **kwargs)


def test_lmstudio_stream_yields_content_deltas(monkeypatch):
    captured = {}
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        async_client_for(
            [
                'data: {"choices":[{"delta":{"role":"assistant"}}]}',
                'data: {"choices":[{"delta":{"content":"# Spec"}}]}',
                'data: {"choices":[{"delta":{"content":"\nBody"}}]}',
                "data: [DONE]",
            ],
            captured,
        ),
    )
    try:
        chunks = asyncio.run(collect(providers.lmstudio.stream("model", "prompt")))
    finally:
        monkeypatch.setattr(providers.httpx, "AsyncClient", real_client)

    assert chunks == ["# Spec", "\nBody"]
    assert captured["payload"]["stream"] is True


def test_ollama_stream_yields_response_until_done(monkeypatch):
    captured = {}
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        async_client_for(
            [
                '{"response":"Hello","done":false}',
                '{"response":" world","done":false}',
                '{"response":"","done":true}',
                '{"response":"ignored","done":false}',
            ],
            captured,
        ),
    )
    try:
        chunks = asyncio.run(collect(providers.ollama.stream("model", "prompt")))
    finally:
        monkeypatch.setattr(providers.httpx, "AsyncClient", real_client)

    assert chunks == ["Hello", " world"]
    assert captured["payload"]["stream"] is True


def test_stream_generate_routes_prefix_and_rejects_unknown(monkeypatch):
    async def fake_stream(model: str, prompt: str):
        yield f"{model}:{prompt}"

    monkeypatch.setattr(providers.ollama, "stream", fake_stream)
    assert asyncio.run(collect(providers.stream_generate("ollama/qwen", "brief"))) == [
        "qwen:brief"
    ]
    with pytest.raises(ValueError, match="Unknown model prefix"):
        asyncio.run(collect(providers.stream_generate("remote/qwen", "brief")))
```

Keep the `real_client` restoration because monkeypatching the imported module attribute also changes the shared HTTPX module object during the test.

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd backend && uv run pytest tests/test_providers.py -v`

Expected: FAIL because `LMStudioProvider.stream`, `OllamaProvider.stream`, and `stream_generate` do not exist.

- [ ] **Step 3: Implement provider streaming**

In `backend/app/providers.py`:

```python
import json
from collections.abc import AsyncIterator

GENERATION_TIMEOUT = httpx.Timeout(120.0, connect=5.0)
```

Add `stream()` to `LMStudioProvider` using this behavior:

```python
async def stream(self, model_id: str, prompt: str) -> AsyncIterator[str]:
    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=GENERATION_TIMEOUT) as client:
        async with client.stream(
            "POST", f"{LM_STUDIO_URL}/v1/chat/completions", json=payload
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                value = line.removeprefix("data:").strip()
                if not value or value == "[DONE]":
                    continue
                content = json.loads(value)["choices"][0]["delta"].get("content")
                if content:
                    yield content
```

Add `stream()` to `OllamaProvider`:

```python
async def stream(self, model_name: str, prompt: str) -> AsyncIterator[str]:
    payload = {"model": model_name, "prompt": prompt, "stream": True}
    async with httpx.AsyncClient(timeout=GENERATION_TIMEOUT) as client:
        async with client.stream(
            "POST", f"{OLLAMA_URL}/api/generate", json=payload
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                frame = json.loads(line)
                content = frame.get("response")
                if content:
                    yield content
                if frame.get("done") is True:
                    break
```

Centralize prefix routing so buffered and streaming paths reject models identically:

```python
def split_model_id(prefixed_model: str):
    if prefixed_model.startswith("lmstudio/"):
        return lmstudio, prefixed_model.removeprefix("lmstudio/")
    if prefixed_model.startswith("ollama/"):
        return ollama, prefixed_model.removeprefix("ollama/")
    raise ValueError(f"Unknown model prefix in: {prefixed_model}")


async def generate(prefixed_model: str, prompt: str) -> str:
    provider, model_id = split_model_id(prefixed_model)
    return await provider.generate(model_id, prompt)


async def stream_generate(
    prefixed_model: str, prompt: str
) -> AsyncIterator[str]:
    provider, model_id = split_model_id(prefixed_model)
    async for delta in provider.stream(model_id, prompt):
        yield delta
```

- [ ] **Step 4: Verify GREEN and regression safety**

Run: `cd backend && uv run pytest tests/test_providers.py tests/test_deliverable_service.py -v`

Expected: all tests PASS.

- [ ] **Step 5: Commit provider streaming**

```bash
git add backend/app/providers.py backend/tests/test_providers.py
git commit -m "feat: stream local model tokens"
```

---

### Task 2: Shared prompt preparation and concurrent stream orchestration

**Files:**
- Create: `backend/app/services/generation_stream.py`
- Create: `backend/tests/test_generation_stream.py`
- Modify: `backend/app/services/deliverables.py`
- Modify: `backend/tests/test_deliverable_service.py`

**Interfaces:**
- Consumes: `providers.split_model_id()` and `providers.stream_generate()` from Task 1.
- Produces: `prepare_generation(project: Project, model: str, deliverable_keys: list[DeliverableKey], preset: str | None) -> dict[DeliverableKey, str]` in `deliverables.py`.
- Produces: immutable `GenerationStreamEvent(event: str, data: dict[str, object])`.
- Produces: `stream_generation(project, model, deliverable_keys, preset, persist) -> AsyncIterator[GenerationStreamEvent]`, where `persist` is `Callable[[DeliverableKey, str], Awaitable[None]]`.

- [ ] **Step 1: Write failing shared-preparation and orchestration tests**

Extend `backend/tests/test_deliverable_service.py`:

```python
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
```

Create `backend/tests/test_generation_stream.py`:

```python
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
    assert [item for item in persisted] == [("spec", "# Generated\nBody")]
    assert any(e.event == "completed" and e.data["deliverable"] == "spec" for e in events)
    assert any(e.event == "failed" and e.data["deliverable"] == "agent_prompt" for e in events)
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
```

Also add a total-failure test asserting events are `started`, `failed`, `error`, with no `done`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd backend && uv run pytest tests/test_deliverable_service.py tests/test_generation_stream.py -v`

Expected: FAIL because `prepare_generation` and `generation_stream` do not exist.

- [ ] **Step 3: Extract request preparation without changing buffered behavior**

In `deliverables.py`, implement:

```python
def prepare_generation(
    project: Project,
    model: str,
    deliverable_keys: list[DeliverableKey],
    preset: str | None,
) -> dict[DeliverableKey, str]:
    if not deliverable_keys:
        raise HTTPException(status_code=400, detail="Select at least one deliverable.")
    try:
        providers.split_model_id(model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    preset_instruction = ""
    if preset:
        preset_instruction = PRESET_INSTRUCTIONS.get(preset, "")
        if not preset_instruction:
            raise HTTPException(status_code=400, detail=f"Unknown preset: {preset}")

    context = system_context(project)
    prompts = {}
    for key in deliverable_keys:
        parts = [context]
        if preset_instruction:
            parts.append(f"Preset guidance: {preset_instruction}")
        parts.append(DELIVERABLE_PROMPTS[key].instruction)
        prompts[key] = "\n\n".join(parts)
    return prompts
```

Refactor `generate_deliverables()` to call `prepare_generation()` once and pass each prepared prompt to its existing concurrent `run_one`; preserve the existing error mapping, merge semantics, and `GenerationResult`.

- [ ] **Step 4: Implement the event orchestrator**

Create `generation_stream.py` with:

```python
import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass

from app import providers
from app.models import Project
from app.schemas import DeliverableKey
from app.services.deliverables import DELIVERABLE_PROMPTS, prepare_generation

PersistCompleted = Callable[[DeliverableKey, str], Awaitable[None]]


@dataclass(frozen=True)
class GenerationStreamEvent:
    event: str
    data: dict[str, object]


async def stream_generation(
    project: Project,
    model: str,
    deliverable_keys: list[DeliverableKey],
    preset: str | None,
    persist: PersistCompleted,
) -> AsyncIterator[GenerationStreamEvent]:
    prompts = prepare_generation(project, model, deliverable_keys, preset)
    queue: asyncio.Queue[GenerationStreamEvent] = asyncio.Queue()

    async def run_one(key: DeliverableKey) -> None:
        chunks: list[str] = []
        try:
            async for delta in providers.stream_generate(model, prompts[key]):
                chunks.append(delta)
                await queue.put(
                    GenerationStreamEvent("delta", {"deliverable": key, "delta": delta})
                )
            if not chunks:
                raise RuntimeError("The model returned no content.")
            await persist(key, "".join(chunks))
            await queue.put(GenerationStreamEvent("completed", {"deliverable": key}))
        except asyncio.CancelledError:
            raise
        except Exception:
            label = DELIVERABLE_PROMPTS[key].label
            await queue.put(
                GenerationStreamEvent(
                    "failed",
                    {
                        "deliverable": key,
                        "label": label,
                        "message": f"LLM generation failed while creating {label}.",
                    },
                )
            )

    yield GenerationStreamEvent("started", {"deliverables": deliverable_keys})
    tasks = [asyncio.create_task(run_one(key)) for key in deliverable_keys]
    settled = 0
    failures = []
    try:
        while settled < len(tasks):
            event = await queue.get()
            if event.event in {"completed", "failed"}:
                settled += 1
            if event.event == "failed":
                failures.append(event.data)
            yield event
        if len(failures) == len(tasks):
            yield GenerationStreamEvent(
                "error", {"message": "No deliverables were generated."}
            )
        else:
            yield GenerationStreamEvent("done", {"failures": failures})
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
```

- [ ] **Step 5: Verify GREEN and all service regressions**

Run: `cd backend && uv run pytest tests/test_deliverable_service.py tests/test_generation_stream.py -v`

Expected: all tests PASS, including existing buffered partial-success behavior.

- [ ] **Step 6: Commit orchestration**

```bash
git add backend/app/services/deliverables.py backend/app/services/generation_stream.py backend/tests/test_deliverable_service.py backend/tests/test_generation_stream.py
git commit -m "feat: orchestrate streaming deliverables"
```

---

### Task 3: FastAPI SSE endpoint and durable completion

**Files:**
- Modify: `backend/app/routers/projects.py`
- Modify: `backend/tests/test_projects_router.py`

**Interfaces:**
- Consumes: `GenerationStreamEvent` and `stream_generation()` from Task 2.
- Produces: `encode_sse(event: GenerationStreamEvent) -> bytes`.
- Produces: `POST /api/projects/{project_id}/generate/stream`.
- Emits: `started`, `delta`, `completed`, `failed`, `done`, and `error` frames defined in the design.

- [ ] **Step 1: Write failing HTTP and serialization tests**

Add to `backend/tests/test_projects_router.py`:

```python
import json

from app.routers import projects as projects_router
from app.services.generation_stream import GenerationStreamEvent


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
        "started", "delta", "delta", "completed", "done"
    ]
    saved = client.get(f"/api/projects/{project_id}").json()["deliverables"]
    assert saved["spec"] == "# Live\nSaved"


def test_stream_generation_validates_before_opening_stream(client):
    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/generate/stream",
        json={"model": "remote/test", "deliverables": ["spec"]},
    )
    assert response.status_code == 400
    assert "Unknown model prefix" in response.json()["detail"]
```

Add one partial-failure test that stubs `stream_generate()` by prompt, asserts `failed` plus `done`, and verifies the successful field is persisted while the failed field is `None`. Add one all-failed test asserting the final event is `error`.

- [ ] **Step 2: Run route tests and verify RED**

Run: `cd backend && uv run pytest tests/test_projects_router.py -v`

Expected: FAIL because `encode_sse` and `/generate/stream` do not exist.

- [ ] **Step 3: Implement SSE serialization and endpoint**

Update router imports:

```python
import json
from collections.abc import AsyncIterator

from fastapi.responses import StreamingResponse
from app.services import generation_stream
from app.services.deliverables import prepare_generation
```

Add:

```python
def encode_sse(event: generation_stream.GenerationStreamEvent) -> bytes:
    data = json.dumps(event.data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event.event}\ndata: {data}\n\n".encode()


@router.post("/{project_id}/generate/stream")
async def stream_deliverables(project_id: str, body: GenerateRequest):
    record = await run_in_threadpool(storage.get_project, project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")

    prepare_generation(
        record.project, body.model, body.deliverables, body.preset
    )

    async def persist(key, content):
        partial = Deliverable(**{key: content})
        saved = await run_in_threadpool(
            storage.save_deliverables, project_id, partial
        )
        if saved is None:
            raise RuntimeError("Project disappeared before generation completed.")

    async def events() -> AsyncIterator[bytes]:
        async for event in generation_stream.stream_generation(
            record.project,
            body.model,
            body.deliverables,
            body.preset,
            persist,
        ):
            yield encode_sse(event)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

Import `Deliverable` from `app.models`. Keep the preflight `prepare_generation()` call even though the stream service repeats it: that is what ensures invalid model and preset errors remain HTTP 400 rather than becoming a 200 response containing an error frame.

- [ ] **Step 4: Verify GREEN and the complete backend suite**

Run: `cd backend && uv run pytest -v`

Expected: all backend tests PASS.

- [ ] **Step 5: Commit the endpoint**

```bash
git add backend/app/routers/projects.py backend/tests/test_projects_router.py
git commit -m "feat: expose generation event stream"
```

---

### Task 4: Browser SSE transport and frontend test harness

**Files:**
- Create: `frontend/src/generationStream.ts`
- Create: `frontend/src/generationStream.test.ts`
- Create: `frontend/src/test/setup.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.app.json`
- Modify: `frontend/eslint.config.js`

**Interfaces:**
- Produces: discriminated `GenerationStreamEvent` union with `type` values matching backend event names.
- Produces: `readGenerationStream(body: ReadableStream<Uint8Array>, onEvent: (event: GenerationStreamEvent) => void) -> Promise<void>`.
- Produces: `streamDeliverables(id, req, onEvent, signal) -> Promise<void>` in `api.ts`.

- [ ] **Step 1: Install the test-only packages and configure Vitest**

Run:

```bash
cd frontend
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom
```

Add `"test": "vitest run"` to `scripts`. In `vite.config.ts`, import `defineConfig` from `vitest/config` and add:

```typescript
test: {
  environment: 'jsdom',
  setupFiles: './src/test/setup.ts',
  restoreMocks: true,
},
```

Create `src/test/setup.ts` containing `import '@testing-library/jest-dom/vitest'`. Add `"types": ["vitest/globals"]` under `compilerOptions` in `tsconfig.app.json`. Add `globals.node` and `globals.browser` to ESLint globals so config and tests lint cleanly.

- [ ] **Step 2: Write failing parser and API tests**

Create `generationStream.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { readGenerationStream } from './generationStream'

function body(...chunks: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}

describe('readGenerationStream', () => {
  it('parses split frames, adjacent frames, CRLF, and unicode', async () => {
    const onEvent = vi.fn()
    await readGenerationStream(
      body(
        'event: started\r\ndata: {"deliverables":["spec"]}\r\n\r',
        '\nevent: delta\ndata: {"deliverable":"spec","delta":"å"}\n\n',
        'event: completed\ndata: {"deliverable":"spec"}\n\n',
      ),
      onEvent,
    )
    expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual([
      'started', 'delta', 'completed',
    ])
    expect(onEvent.mock.calls[1][0].delta).toBe('å')
  })

  it('rejects malformed JSON', async () => {
    await expect(
      readGenerationStream(body('event: delta\ndata: nope\n\n'), vi.fn()),
    ).rejects.toThrow('Invalid generation stream data')
  })
})
```

Add API tests in the same file that stub `globalThis.fetch`, assert the POST URL/body/Accept header/signal, and assert a non-2xx JSON detail becomes `ApiError`.

- [ ] **Step 3: Run tests and verify RED**

Run: `cd frontend && npm test -- src/generationStream.test.ts`

Expected: FAIL because `generationStream.ts`, `readGenerationStream`, and `streamDeliverables` do not exist.

- [ ] **Step 4: Implement the typed parser and streaming API request**

In `generationStream.ts`, define exact event members for `started`, `delta`, `completed`, `failed`, `done`, and `error`. Implement a frame parser that:

```typescript
function parseFrame(frame: string): GenerationStreamEvent | null {
  let name = ''
  const data: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (!name) return null
  try {
    const payload = JSON.parse(data.join('\n')) as Record<string, unknown>
    return validateGenerationEvent(name, payload)
  } catch {
    throw new Error('Invalid generation stream data.')
  }
}
```

`validateGenerationEvent()` must switch over all six names, check required string/array fields, and throw for unknown event names or invalid payload shapes. `readGenerationStream()` must use `TextDecoder.decode(chunk, { stream: true })`, retain incomplete frames, find separators with `/\r?\n\r?\n/`, parse all complete frames, flush the decoder, and reject a non-whitespace trailing fragment.

In `api.ts`, add:

```typescript
export async function streamDeliverables(
  id: string,
  req: GenerateRequest,
  onEvent: (event: GenerationStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`${BASE}/projects/${id}/generate/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(req),
    signal,
  })
  if (!response.ok) throw await apiErrorFromResponse(response)
  if (!response.body) throw new Error('Generation stream is unavailable.')
  await readGenerationStream(response.body, onEvent)
}
```

Extract `apiErrorFromResponse(response)` from the existing generic `request()` error branch so buffered and streaming calls preserve the same message behavior.

- [ ] **Step 5: Verify GREEN, build, and lint**

Run:

```bash
cd frontend
npm test -- src/generationStream.test.ts
npm run build
npm run lint
```

Expected: all three commands succeed with no warnings or errors.

- [ ] **Step 6: Commit the transport**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.app.json frontend/eslint.config.js frontend/src/test/setup.ts frontend/src/generationStream.ts frontend/src/generationStream.test.ts frontend/src/api.ts
git commit -m "feat: parse generation event streams"
```

---

### Task 5: Immediate wizard handoff to Results

**Files:**
- Create: `frontend/src/pages/wizard/useWizardController.test.tsx`
- Modify: `frontend/src/pages/wizard/useWizardController.ts`
- Modify: `frontend/src/pages/WizardPage.tsx`

**Interfaces:**
- Consumes: existing `GenerateRequest` type.
- Produces: Results router state `{ generationRequest: GenerateRequest, project: Partial<Project> }`.
- Removes: wizard-owned generation timer and call to buffered `generateDeliverables()`.

- [ ] **Step 1: Write a failing controller test**

Use `renderHook`, `act`, `MemoryRouter`, and mocked API functions. Drive the hook to step 4, set a model, call `handleGenerate()`, and assert:

```typescript
expect(api.createProject).toHaveBeenCalledWith(expect.objectContaining({ title: 'Live Brief' }))
expect(api.generateDeliverables).not.toHaveBeenCalled()
expect(navigate).toHaveBeenCalledWith('/results/project-1', {
  state: {
    generationRequest: {
      model: 'ollama/test',
      deliverables: ['spec'],
      preset: 'mvp',
    },
    project: expect.objectContaining({ id: 'project-1', title: 'Live Brief' }),
  },
})
```

Also assert a second click while the project save is pending does not create a second project.

- [ ] **Step 2: Run the controller test and verify RED**

Run: `cd frontend && npm test -- src/pages/wizard/useWizardController.test.tsx`

Expected: FAIL because `handleGenerate()` still awaits `generateDeliverables()` and navigates with completed data.

- [ ] **Step 3: Implement immediate navigation**

In `useWizardController.ts`:

- remove the `generateDeliverables` import;
- remove `elapsed` state and the generating timer effect;
- keep `generating` as the short project-save lock;
- after `ensureProject()`, navigate with `generationRequest` and project identity immediately;
- keep `finally { setGenerating(false) }` for save failures and React cleanup safety.

The new core of `handleGenerate()` is:

```typescript
const projectId = await ensureProject()
navigate(`/results/${projectId}`, {
  state: {
    generationRequest: {
      model: selectedModel,
      deliverables: [...deliverables],
      preset: selectedPreset,
    },
    project: { ...form, id: projectId },
  },
})
```

Remove `elapsed` from the hook return. In `WizardPage.tsx`, change the busy button label to `Preparing...`; Results now owns elapsed generation time.

- [ ] **Step 4: Verify GREEN, build, and lint**

Run:

```bash
cd frontend
npm test -- src/pages/wizard/useWizardController.test.tsx
npm run build
npm run lint
```

Expected: all commands succeed.

- [ ] **Step 5: Commit the wizard handoff**

```bash
git add frontend/src/pages/wizard/useWizardController.ts frontend/src/pages/wizard/useWizardController.test.tsx frontend/src/pages/WizardPage.tsx
git commit -m "feat: open results before generation starts"
```

---

### Task 6: Cancellable React generation state hook

**Files:**
- Create: `frontend/src/pages/results/useGenerationRun.ts`
- Create: `frontend/src/pages/results/useGenerationRun.test.tsx`

**Interfaces:**
- Consumes: `streamDeliverables()`, `getProject()`, `GenerateRequest`, and `GenerationStreamEvent`.
- Produces: `DeliverableRunStatus = 'queued' | 'generating' | 'complete' | 'failed'`.
- Produces: `GenerationPhase = 'idle' | 'running' | 'stopping' | 'completed' | 'cancelled' | 'failed'`.
- Produces: `useGenerationRun(projectId: string | undefined, request: GenerateRequest | undefined)` returning `{ phase, drafts, statuses, failures, elapsed, error, notice, savedRecord, stop }`.

- [ ] **Step 1: Write failing hook state-machine tests**

Mock `streamDeliverables` with a deferred async implementation. In `useGenerationRun.test.tsx`, verify:

```typescript
it('accumulates deltas and settles from persisted output', async () => {
  api.streamDeliverables.mockImplementation(async (_id, _request, onEvent) => {
    onEvent({ type: 'started', deliverables: ['spec'] })
    onEvent({ type: 'delta', deliverable: 'spec', delta: '# Live' })
    onEvent({ type: 'completed', deliverable: 'spec' })
    onEvent({ type: 'done', failures: [] })
  })
  api.getProject.mockResolvedValue(savedRecord('# Live'))

  const { result } = renderHook(() => useGenerationRun('project-1', request))
  await waitFor(() => expect(result.current.phase).toBe('completed'))
  expect(result.current.drafts.spec).toBe('# Live')
  expect(result.current.statuses.spec).toBe('complete')
  expect(result.current.savedRecord?.deliverables?.spec).toBe('# Live')
})
```

Add a cancellation test whose mock waits for `signal.abort`, then rejects with a DOM `AbortError`; call `stop()`, assert phase becomes `cancelled`, `getProject()` supplies the completed saved field, the incomplete draft is absent from final displayed data, and notice is `Generation stopped. Incomplete drafts were not saved.` Add a failure test for `failed` and terminal `error` events. Add an unmount test asserting the signal is aborted and no post-unmount state warning is produced.

- [ ] **Step 2: Run hook tests and verify RED**

Run: `cd frontend && npm test -- src/pages/results/useGenerationRun.test.tsx`

Expected: FAIL because `useGenerationRun` does not exist.

- [ ] **Step 3: Implement the state machine**

The hook must:

- initialize every requested key to an empty draft and `queued`;
- own exactly one `AbortController` per request;
- start a one-second elapsed timer only while phase is `running`;
- transition the relevant key to `generating` and append on `delta`;
- transition to `complete` only on `completed`;
- retain typed failures and mark the key `failed` on `failed`;
- treat terminal `error` as phase `failed` with its message;
- treat `AbortError` after `stop()` as phase `cancelled`, not failed;
- call `getProject(projectId)` after `done`, terminal `error`, intentional abort, or transport failure;
- expose `savedRecord` only after that authoritative reload;
- abort on unmount and suppress every later state update;
- implement `stop()` as phase `stopping` followed by `controller.abort()`.

Use functional state updates for deltas:

```typescript
setDrafts((current) => ({
  ...current,
  [event.deliverable]: `${current[event.deliverable] ?? ''}${event.delta}`,
}))
```

Use a local `mounted` boolean and `stopRequested` ref to distinguish user cancellation from unmount cleanup. Do not catch an abort caused only by unmount into a visible notice.

- [ ] **Step 4: Verify GREEN, build, and lint**

Run:

```bash
cd frontend
npm test -- src/pages/results/useGenerationRun.test.tsx
npm run build
npm run lint
```

Expected: all commands succeed without React state-update warnings.

- [ ] **Step 5: Commit the hook**

```bash
git add frontend/src/pages/results/useGenerationRun.ts frontend/src/pages/results/useGenerationRun.test.tsx
git commit -m "feat: manage cancellable generation runs"
```

---

### Task 7: Live Results experience

**Files:**
- Create: `frontend/src/pages/ResultsPage.test.tsx`
- Modify: `frontend/src/pages/ResultsPage.tsx`

**Interfaces:**
- Consumes: `useGenerationRun()` from Task 6 and router state from Task 5.
- Preserves: saved Results mode, Markdown rendering, partial-failure summary, edit/library/start-over links, and exports.
- Produces: live requested tabs with text status, progress, elapsed time, Stop, cancellation notice, and terminal history-state replacement.

- [ ] **Step 1: Write failing live Results tests**

Render `ResultsPage` inside `MemoryRouter` and a `/results/:id` route. Mock `useGenerationRun()` to cover these observable behaviors:

```typescript
it('renders live progress, draft markdown, statuses, and stop control', async () => {
  mockedRun.mockReturnValue({
    phase: 'running',
    drafts: { spec: '# Live spec', implementation_plan: '' },
    statuses: { spec: 'generating', implementation_plan: 'queued' },
    failures: [],
    elapsed: 12,
    error: '',
    notice: '',
    savedRecord: null,
    stop,
  })

  renderGeneratingResults()
  expect(screen.getByText('0 of 2 complete')).toBeInTheDocument()
  expect(screen.getByText('00:12')).toBeInTheDocument()
  expect(screen.getByText('Generating')).toBeInTheDocument()
  expect(screen.getByText('Queued')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Live spec' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Stop generation' }))
  expect(stop).toHaveBeenCalledOnce()
})
```

Add tests that:

- render a cancellation notice with `role="status"` and no incomplete draft after `savedRecord` arrives;
- render run-level error text with `role="alert"`;
- disable current export while the active draft is queued or generating;
- preserve direct saved-mode loading from `getProject()`;
- replace router state after a terminal run so remounting does not call the streaming hook with a request.

- [ ] **Step 2: Run Results tests and verify RED**

Run: `cd frontend && npm test -- src/pages/ResultsPage.test.tsx`

Expected: FAIL because Results has no generating mode, status labels, progress, or Stop control.

- [ ] **Step 3: Integrate generating and saved modes**

Change `LocationState` to:

```typescript
interface LocationState {
  generationRequest?: GenerateRequest
  deliverables?: Deliverable
  failures?: DeliverableFailure[]
  requested?: DeliverableKey[]
  project?: Partial<Project>
}
```

Call `useGenerationRun(id, state?.generationRequest)`. While a generation request exists:

- derive tabs from the requested keys using `DELIVERABLE_OPTIONS`, even before content exists;
- use `run.drafts` until `run.savedRecord` exists;
- show a panel with `aria-live="polite"` containing padded elapsed time and `${completeCount} of ${requested.length} complete`;
- show the exact capitalized status next to each tab;
- render `Stop generation` during `running` and `Stopping...` disabled during `stopping`;
- render `run.notice` with `role="status"` and `run.error` with `role="alert"`;
- disable Export Current unless the active status is `complete` or the page is in saved mode with non-empty content;
- disable Export Bundle while phase is `running` or `stopping`.

Once `savedRecord` is available in a terminal phase, call React Router's `navigate(location.pathname, { replace: true, state: { deliverables, failures, requested, project } })` exactly once. This removes `generationRequest`, makes saved output authoritative, and prevents refresh/remount regeneration.

For streamed Markdown, continue using `react-markdown` without `rehype-raw`; add a nearby comment that generated Markdown is intentionally not allowed to inject raw HTML.

- [ ] **Step 4: Verify GREEN and all frontend tests**

Run:

```bash
cd frontend
npm test
npm run build
npm run lint
```

Expected: all tests pass, TypeScript builds, and ESLint reports no errors or warnings.

- [ ] **Step 5: Commit the Results UX**

```bash
git add frontend/src/pages/ResultsPage.tsx frontend/src/pages/ResultsPage.test.tsx
git commit -m "feat: render and stop live generation"
```

---

### Task 8: End-to-end verification and finding closure

**Files:**
- Modify: `docs/app-review.md`
- Modify: `docs/app-review.html`

**Interfaces:**
- Consumes: all implementation and tests from Tasks 1–7.
- Produces: review finding #03 marked fixed with accurate endpoint, cancellation, persistence, and test evidence.

- [ ] **Step 1: Run the complete automated verification suite from clean processes**

Run:

```bash
cd backend
uv run pytest -v
cd ../frontend
npm test
npm run build
npm run lint
```

Expected: every backend and frontend test passes; build and lint exit 0 with no warnings.

- [ ] **Step 2: Run an HTTP streaming smoke test**

Start the configured local services using the repository launcher, select one available local model, generate one Specification Document, and verify in the browser:

1. Results opens immediately.
2. The Specification tab changes from Queued to Generating when its first delta arrives.
3. Markdown grows without waiting for the complete provider response.
4. Status changes to Complete and the saved project reloads.
5. Refreshing Results does not start another generation.
6. Starting another generation and pressing Stop removes its partial draft.
7. A deliverable completed before Stop remains present after reload.

If no provider is available, run the backend route test `test_stream_generation_persists_completed_deliverable` and the Results live-state tests as the deterministic smoke substitutes, and state that provider-backed manual verification was unavailable in the final handoff.

- [ ] **Step 3: Update both review artifacts**

In finding #03 of `docs/app-review.md` and `docs/app-review.html`, add a fixed marker and a concise note stating:

```text
Fixed. Generation now uses a POST SSE stream consumed with fetch. LM Studio SSE and Ollama NDJSON deltas render in Results as they arrive; each completed deliverable is persisted independently; AbortController stops unfinished provider streams and reloads completed saved work. The buffered endpoint remains compatible.
```

List these exact new backend and frontend tests as verification evidence: `test_lmstudio_stream_yields_content_deltas`, `test_ollama_stream_yields_response_until_done`, `test_stream_generate_routes_prefix_and_rejects_unknown`, `test_prepare_generation_validates_before_building_prompts`, `test_stream_persists_before_completed_and_keeps_partial_failures`, `test_stream_cancels_unfinished_provider_when_consumer_closes`, `test_encode_sse_uses_named_json_frame`, `test_stream_generation_persists_completed_deliverable`, `test_stream_generation_validates_before_opening_stream`, the `readGenerationStream` split-frame and malformed-data cases, the controller immediate-handoff case, the generation-hook completion/cancellation/failure/unmount cases, and the Results live/cancel/error/saved-mode/history cases. Change roadmap item 7, `Streaming generation`, from Open to Done in both review artifacts.

- [ ] **Step 4: Re-run repository checks after documentation edits**

Run:

```bash
git diff --check
cd backend
uv run pytest -q
cd ../frontend
npm test
npm run build
npm run lint
```

Expected: no whitespace errors; all verification commands succeed.

- [ ] **Step 5: Commit finding closure**

```bash
git add docs/app-review.md docs/app-review.html
git commit -m "docs: close streaming generation finding"
```

- [ ] **Step 6: Inspect the final diff and history**

Run:

```bash
git status --short
git log --oneline -10
git diff HEAD~8..HEAD --stat
```

Expected: the worktree is clean; history contains the design, provider, orchestration, endpoint, frontend transport, wizard handoff, run hook, Results UX, and finding-closure commits; the diff is limited to the files named in this plan.
