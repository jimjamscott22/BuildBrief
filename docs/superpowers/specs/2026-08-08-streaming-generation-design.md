# Streaming Generation Design

## Summary

BuildBrief will replace the wizard's blind generation wait with a live Results experience. After the project is saved, the app navigates immediately to Results, opens a streaming generation request, renders model output as it arrives, reports per-deliverable status, and lets the user stop generation.

Completed deliverables are saved independently. If the user stops the run, completed deliverables remain saved while every incomplete draft is discarded and removed from the UI.

## Goals

- Show real generated text throughout a long local-model request.
- Report queued, generating, completed, and failed states per requested deliverable.
- Allow the user to stop an active run through `AbortController`.
- Preserve every deliverable that completed before a failure or cancellation.
- Preserve existing deliverables that were not selected for regeneration.
- Keep the existing non-streaming generation endpoint working.
- Support both configured providers without buffering their complete responses.

## Non-goals

- Resuming an interrupted partial deliverable.
- Persisting token-level drafts.
- Reconnecting an abandoned stream with `Last-Event-ID`.
- Changing the current concurrent generation policy.
- Adding a background job queue or cross-process generation registry.
- Adding authentication or the separate concurrency limit from review finding #04.

## API Design

Add `POST /api/projects/{project_id}/generate/stream`. The request body remains the existing `GenerateRequest` JSON shape:

```json
{
  "model": "ollama/qwen2.5-coder:7b",
  "deliverables": ["spec", "implementation_plan"],
  "preset": "mvp"
}
```

The response uses `text/event-stream`. A `POST` stream consumed with `fetch()` is intentional: generation changes persisted state, the existing JSON body remains usable, and the response can be cancelled with an `AbortController`.

Every SSE message uses an explicit event name and one JSON object in its `data` field:

| Event | Data | Meaning |
| --- | --- | --- |
| `started` | `{ "deliverables": DeliverableKey[] }` | The request was accepted and the selected work is queued. |
| `delta` | `{ "deliverable": DeliverableKey, "delta": string }` | Append text to the named in-memory draft. The first delta changes its state to generating. |
| `completed` | `{ "deliverable": DeliverableKey }` | The complete output has been persisted. |
| `failed` | `{ "deliverable": DeliverableKey, "label": string, "message": string }` | This deliverable failed; other selected work continues. |
| `done` | `{ "failures": DeliverableFailure[] }` | All selected work has settled and the stream will close. |
| `error` | `{ "message": string }` | The run could not produce any deliverable or another run-level error occurred. |

The endpoint validates that the project exists, at least one deliverable is selected, the preset is known, and the model prefix is supported before constructing the streaming response. These failures retain normal HTTP 4xx responses. Provider errors that occur after streaming begins become `failed` events. If all selected deliverables fail, the stream also emits a final `error` event instead of `done`.

SSE frames are serialized by one small backend helper so JSON escaping, blank-line framing, and event naming are covered independently by tests.

## Backend Architecture

### Provider streaming

Each provider gains an async streaming method that yields non-empty text deltas:

- LM Studio sends `"stream": true` to `/v1/chat/completions`, iterates its SSE lines, ignores empty lines and `[DONE]`, and yields `choices[0].delta.content` when present.
- Ollama sends `"stream": true` to `/api/generate`, iterates NDJSON lines, and yields each `response` value until `done` is true.
- The provider router exposes a single `stream_generate(prefixed_model, prompt)` async iterator and keeps the current buffered `generate()` interface intact for the existing endpoint and refinement flow.

Provider calls use `httpx.AsyncClient.stream()` so response bodies are closed when iteration completes, errors, or is cancelled. The request keeps a bounded connection/write timeout and a 120-second read timeout between received chunks, matching the existing maximum stalled-read behavior without imposing a 120-second total duration on an actively streaming response.

Malformed provider frames and provider HTTP errors fail that deliverable. Frames that are valid but contain no content are ignored.

### Generation orchestration

The service builds prompts through one shared helper used by buffered and streaming generation, avoiding drift in preset validation and instructions.

For streaming generation, one async producer task runs per selected deliverable. Each producer:

1. Reads deltas from `stream_generate()`.
2. Accumulates the complete value in memory while sending delta messages to a shared async queue.
3. Saves only the completed value through the existing merge-based storage operation.
4. Sends `completed`, or maps an exception to a typed `failed` message.

The endpoint consumes the queue and yields serialized SSE frames. It emits `done` after every producer settles unless every producer failed, in which case it emits `error`.

Storage calls remain off the event loop through FastAPI's threadpool helper. A successful save merges only the newly completed deliverable, so unselected existing outputs remain intact.

### Cancellation and disconnects

The stream generator owns all producer tasks. In its `finally` block it cancels unfinished producers and awaits their cleanup. Cancellation reaches the HTTPX stream at an await point and closes the provider response.

No incomplete buffer is sent to storage. A deliverable that emitted `completed` is already durable before the event reaches the browser. This gives cancellation deterministic semantics: completed work survives, partial work does not.

## Frontend Architecture

### Streaming client

Add a focused API helper that:

- performs the streaming `POST` with an optional `AbortSignal`;
- reports normal non-2xx responses as `ApiError`;
- incrementally decodes UTF-8 response bytes;
- parses SSE frames across arbitrary network chunk boundaries;
- dispatches typed events to a callback;
- throws a clear error for a response with no readable body or malformed event data.

The parser is transport-focused and independent from React, allowing direct unit tests for split frames, multiple frames in one chunk, multi-byte text, and invalid JSON.

### Navigation and Results state

`handleGenerate` continues to create or update the project, then navigates immediately to `/results/{id}` with a generation request in router state. It no longer waits for the buffered generation endpoint.

`ResultsPage` supports two modes:

- Saved mode: current behavior when opened from the Library or loaded directly.
- Generating mode: starts the stream once from router state, initializes requested tabs, and accumulates deltas per deliverable.

The generating view displays:

- the existing elapsed timer;
- `n of m complete` progress;
- queued, generating, complete, or failed status beside every requested tab;
- streamed Markdown in the active tab;
- a `Stop generation` control while work is active.

Requested tabs exist before their first delta so the user can inspect all statuses. The first requested deliverable is selected initially. The app does not auto-switch tabs on every incoming delta because that would fight user navigation.

When `done` arrives, Results fetches the saved project and replaces the transient drafts with the authoritative persisted deliverables and failure summary. It then removes the generation request from browser history state so a refresh does not regenerate.

When the user stops:

1. The page marks the run as stopping and calls `abort()`.
2. An `AbortError` is treated as an intentional cancellation, not a failure toast.
3. Results fetches the saved project after the aborted fetch settles.
4. Persisted completed deliverables remain visible; incomplete transient drafts disappear.
5. The page reports that generation stopped and incomplete drafts were not saved.

If navigation unmounts the page during generation, cleanup aborts the request without performing a state update on the unmounted page.

### Accessibility and interaction

- Progress text lives in an `aria-live="polite"` region.
- Run-level failures use `role="alert"`.
- Status is expressed with text as well as color.
- The stop control remains keyboard accessible and is disabled once stopping begins.
- Export controls remain disabled for an active or empty draft and become available for completed content.

The new view reuses the existing panel, caption, button, tab, typography, and color conventions. No new visual design system or dependency is required.

## Failure Handling

- A single provider failure produces a failed tab while other work continues and completed outputs persist.
- Total provider failure produces a run-level error and reloads any previously saved deliverables.
- A network or parse failure displays a retryable run-level error, aborts remaining work, and reloads persisted results.
- A project deleted before generation starts returns HTTP 404.
- A storage failure prevents `completed` from being emitted for that deliverable and is reported as a failure.
- Existing unselected deliverables remain unchanged in every outcome.

## Testing Strategy

Backend tests will cover:

- LM Studio SSE parsing, including `[DONE]` and content-free frames;
- Ollama NDJSON parsing and terminal frames;
- prefixed provider routing and unknown prefixes;
- exact SSE frame serialization;
- endpoint event order for a successful deliverable;
- concurrent partial failure with successful persistence;
- total failure event semantics;
- producer cancellation and cleanup on stream cancellation;
- preservation of unselected existing deliverables.

Frontend tests will use Vitest, Testing Library, and a DOM test environment. They will cover:

- SSE parsing across byte and frame boundaries;
- typed event dispatch and malformed data;
- immediate navigation from the wizard with a generation request;
- live delta rendering and per-deliverable state transitions;
- completion reload and history-state cleanup;
- stop behavior, including removal of incomplete drafts and preservation of fetched completed output;
- user-visible partial and total failures.

The final verification run includes all backend tests, frontend tests, TypeScript build, and frontend lint.

## Compatibility and Rollout

The existing `POST /api/projects/{project_id}/generate` response and behavior remain unchanged. The new endpoint is additive. Saved Results URLs continue to work without router state, and refreshes never restart generation.

No database migration or new runtime dependency is required. Frontend test-only dependencies are added for the new browser behavior tests.
