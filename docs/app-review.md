# BuildBrief — Application Review

**Date:** 2026-08-03 · **Reviewed at commit:** `60c8658` · **Reviewer:** Claude (app_review skill)
**Revision 3 (2026-08-03):** findings 01 and 02 fixed; finding 04 partly fixed — see [Resolved](#resolved).

---

## Snapshot

Measured after the revision-3 fixes; the review body below describes the code as reviewed at `60c8658`.

| | |
| --- | --- |
| Backend | FastAPI + SQLAlchemy 2.0 + PyMySQL → MariaDB · 840 LOC |
| Frontend | React 18 + Vite 8 + TypeScript + Tailwind 3 · 1,733 LOC |
| Providers | LM Studio (OpenAI-compatible) + Ollama (native), probed at request time |
| Tests | 17 passing (`uv run pytest`) · 415 LOC · backend only |
| Typecheck / lint | `tsc -b` clean, `eslint .` clean |
| CI | none |
| Migrations | none (`Base.metadata.create_all`) |

<a id="resolved"></a>

## Resolved

Findings **01** and **02** are fixed; **04** is half fixed — the network exposure and the hardcoded credential are closed, authentication is not. All three are marked inline below with what changed.

| Finding | Change | Verification |
| --- | --- | --- |
| 01 — partial failures discarded completed work | `asyncio.gather(..., return_exceptions=True)`; successes persisted; new `GenerationResult` carries per-deliverable `failures`. Frontend `ensureProject()` stops retries forking duplicate projects; Results shows "n of m generated". | `test_partial_generation_is_persisted`, `test_total_generation_failure_returns_502` |
| 02 — database calls blocked the event loop | Five CRUD handlers changed from `async def` to `def` (FastAPI threadpool); `generate`/`refine` push storage through `run_in_threadpool`; engine gained `pool_pre_ping=True, pool_recycle=1800`. | New `tests/test_projects_router.py` (6 HTTP-level tests) |
| 04 — bound to every interface, hardcoded DSN *(partial)* | `HOST`/`PORT` env vars defaulting to `127.0.0.1:8001`; both Dockerfiles drop their `--host 0.0.0.0`; `DEFAULT_DATABASE_URL` deleted and a missing `DATABASE_URL` now raises at startup. Authentication and the per-IP generate cap are **still open**. | New `tests/test_configuration.py` (4 tests) |

Test count went from 5 to 17. Everything else in this document still stands.

**What's genuinely good.** The provider abstraction is clean and correctly concurrent — `asyncio.gather` over two probes, prefix-based routing, graceful omission of unreachable providers. The wizard state is properly extracted into `useWizardController`, so `WizardPage` stays presentational. `ApiError` carries status and the backend's `detail` string all the way to the UI. Every `useEffect` that fetches uses the `ignore` flag to avoid setting state after unmount. `Deliverable` merge semantics preserve unselected existing outputs, and there's a test proving it. `react-markdown` runs without `rehype-raw`, so LLM output can't inject HTML — keep it that way.

The issues below are mostly about what happens when things go wrong, and about the app's readiness to move off one developer's machine.

---

## Start here — the five that matter most

### 1. A partial generation failure throws away everything that succeeded ✅ FIXED

`backend/app/services/deliverables.py:104`

> **Fixed.** The gather now uses `return_exceptions=True` and partitions outcomes: successes merge into the `Deliverable`, failures become typed `DeliverableFailure` entries on a new `GenerationResult`. Total failure still raises, preserving the 400/502 mapping — reporting success when nothing generated would be a lie. The router persists partial output before returning. On the frontend, an `ensureProject()` helper backed by `createdId` state means a retry updates the same record instead of forking a new one (`handleRefine` had the identical bug and shares the helper), and `ResultsPage` renders an "n of m generated" banner naming what failed, counted over *requested* keys so regenerating a subset reports the right ratio.

```python
generated = await asyncio.gather(*(run_one(key) for key in deliverable_keys))
```

`asyncio.gather` without `return_exceptions=True` propagates the first exception and cancels the rest. Pick the "Agent Handoff" preset (3 deliverables), have the third time out at 120s, and the two that already completed — several minutes of local GPU time — are discarded. `storage.save_deliverables` is never reached, the endpoint returns 502, and the user sees "LLM generation failed while creating Agent Prompt."

It compounds on the frontend. `useWizardController.handleGenerate` creates the project *before* generating, and on failure `editId` is still `null`:

```ts
const projectId = editId ?? (await createProject(projectData)).id
```

So every retry writes another orphan row. Three failed attempts leave three identical projects in the Library.

**Fix:** gather with `return_exceptions=True`, persist whatever succeeded, and return per-deliverable status so the UI can show "2 of 3 generated — retry Agent Prompt". On the frontend, capture the created id in state (or navigate to `?edit=<id>` immediately after creation) so a retry updates rather than duplicates.

### 2. Every database call blocks the event loop ✅ FIXED

> **Fixed.** The five storage-only handlers are now plain `def`, so FastAPI runs them in its threadpool. `generate` and `refine` stay `async def` — they await the providers — and push their storage calls through `run_in_threadpool`. The engine gained `pool_pre_ping=True, pool_recycle=1800`. Covered by a new `tests/test_projects_router.py`; note those tests use a file-backed SQLite database via `tmp_path`, because `:memory:` is not shared across threads and the threadpool handlers would otherwise hit an empty database.

`backend/app/storage.py` is entirely synchronous PyMySQL, and every route in `routers/projects.py` is `async def`. FastAPI runs `async def` handlers directly on the event loop — it only offloads plain `def` handlers to a threadpool. So each `session.get()` and `session.execute()` stalls the whole server, including the in-flight generation requests and the `/api/models` probe.

Against MariaDB on `raspberrypi.local` — a network round trip to a Pi — that stall is measured in tens of milliseconds per query, and the Library list issues one join query while holding the loop.

**Fix (smallest):** drop `async` from the handlers that only touch storage (`create_project`, `list_projects`, `get_project`, `update_project`, `delete_project`). FastAPI then runs them in the threadpool. `generate_deliverables` and `refine_project` stay `async` but should wrap their `storage.*` calls in `run_in_threadpool`. Longer term, move to `aiomysql` + `AsyncSession`.

**Related, same file:** the engine has no `pool_pre_ping`.

```python
_engine = create_engine(url, future=True)
```

MariaDB closes idle connections after `wait_timeout` (28,800s by default, often much lower on a Pi image). The first request after an idle period gets a dead pooled connection and a "MySQL server has gone away" 500. Add `pool_pre_ping=True, pool_recycle=1800`. Two keyword arguments, and it eliminates a class of intermittent failure that is miserable to debug.

### 3. Generation is a blind 120-second wait ✅ FIXED

> **Fixed.** Generation now uses a POST SSE stream consumed with fetch. LM Studio SSE and Ollama NDJSON deltas render in Results as they arrive; each completed deliverable is persisted independently; AbortController stops unfinished provider streams and reloads completed saved work. The buffered endpoint remains compatible.
>
> Verified by: `test_lmstudio_stream_yields_content_deltas`, `test_ollama_stream_yields_response_until_done`, `test_stream_generate_routes_prefix_and_rejects_unknown`, `test_prepare_generation_validates_before_building_prompts`, `test_stream_persists_before_completed_and_keeps_partial_failures`, `test_stream_cancels_unfinished_provider_when_consumer_closes`, `test_encode_sse_uses_named_json_frame`, `test_stream_generation_persists_completed_deliverable`, `test_stream_generation_validates_before_opening_stream`, the `readGenerationStream` split-frame and malformed-data cases, the controller immediate-handoff case, the generation-hook completion/cancellation/failure/unmount cases, and the Results live/cancel/error/saved-mode/history cases.

Originally, `handleGenerate` fired one buffered request and showed only a counting timer. A local 7B model producing three long markdown documents could sit near the 120s `httpx` timeout with zero feedback or cancellation.

The provider APIs already supported streaming: LM Studio accepts `"stream": true` on `/v1/chat/completions`, and Ollama streams when requested. The original buffered implementation did not expose either stream to Results.

**Implemented:** `POST /api/projects/{id}/generate/stream` emits named SSE events, including incremental `{deliverable, delta}` data. Results renders those deltas immediately, and its `AbortController` cancels unfinished provider streams.

### 4. The API is unauthenticated and bound to every interface ◐ PARTLY FIXED

> **Fixed: the exposure and the credential.** The listen address is now `HOST`/`PORT` (`app/main.py`), defaulting to `127.0.0.1:8001`, and both Dockerfiles were switched to shell form so those defaults survive containers — the previous `--host 0.0.0.0` in `backend/Dockerfile` would otherwise have overridden the change. The frontend dev server was bound the same way: under `network_mode: host` it proxies `/api` to the backend, so leaving Vite on `0.0.0.0` would have republished the API that had just been pulled back to loopback. `DEFAULT_DATABASE_URL` is gone; `configure_database` raises a message naming `.env.example` when `DATABASE_URL` is unset.
>
> **Still open: authentication.** Anything that can reach the port still has unrestricted access, and `/generate` still has no concurrency cap. Loopback is a boundary, not a control — this needs a real answer before the app runs anywhere shared.

Three things stack:

- `main.py:37` — `uvicorn.run(app, host="0.0.0.0", port=8001)`
- `docker-compose.yml` — `network_mode: host` on both services
- No authentication, authorization, or rate limiting on any endpoint

Anyone on the same network can list, read, edit, and delete the entire project library, and can POST to `/generate` to occupy the GPU indefinitely. The CORS allowlist (`http://localhost:5173`) is not a control here — it constrains browsers, not `curl`.

**Fix:** bind to `127.0.0.1` by default and make the host an env var. Add a shared-secret header check or a single-user session if this is ever meant to run on a LAN. Add a simple per-IP concurrency cap on `/generate` — one in-flight generation at a time is realistic for a single local GPU anyway, and the semaphore doubles as backpressure.

**Also:** `storage.py:14` hardcodes a real-looking fallback DSN with a credential in it.

```python
DEFAULT_DATABASE_URL = "mysql+pymysql://buildbrief:password@raspberrypi.local:3306/buildbrief"
```

A missing `DATABASE_URL` should fail loudly at startup, not silently attempt to connect to a named host with a guessed password. Raise on absence and keep the example in `.env.example`, where it already is.

### 5. No migrations, no API tests, no frontend tests, no CI

`init_db()` calls `create_all`, which creates missing tables and ignores changed ones. The moment a column is added or widened, every existing deployment needs manual DDL. Add Alembic now, while there are two tables and no external users.

Test coverage was 174 lines against 2,454 lines of application code, all of it below the HTTP layer. The revision-2 and revision-3 work added `tests/test_projects_router.py` and `tests/test_configuration.py` (415 test LOC total now), so the routers and the environment handling are covered; the provider clients and every React component still are not:

- ~~**Router tests** with `TestClient`: 404 paths, the `GenerateRequest` validation boundary, the 502 mapping.~~ **Done** — six tests covering CRUD round trip, 404s, 422 on an unknown deliverable key, partial-generation persistence, total-failure 502, and the 400 unknown-prefix path.
- **Provider tests** with `httpx.MockTransport`: prefix routing, malformed provider responses (`r.json()["choices"][0]` will `KeyError` → 500 on an unexpected payload shape), unreachable-provider fallback.
- **Frontend**: add Vitest + Testing Library. `useWizardController` alone carries validation, edit-mode hydration, preset application, and the generation flow — it's the highest-value target in the repo.
- **CI**: a GitHub Actions workflow running `uv run pytest`, `npm run lint`, and `tsc -b` on push. All three already pass, so it stays green from day one.

---

## Performance

**Library search fires a request per keystroke, with no debounce and no abort.** `LibraryPage.tsx:32` — the effect depends on `[platform, query]`, so typing "planner" issues seven requests. Responses can resolve out of order and a stale one wins. Debounce to ~250ms and abort the previous request with an `AbortController`.

**The same filter runs twice.** `listProjects` already applies `q` and `platform` server-side; `filteredProjects` (`LibraryPage.tsx:50`) re-applies both client-side. Beyond being dead work, it's a correctness trap: server-side `ilike` and client-side `toLowerCase().includes()` will diverge on the first non-ASCII title. Delete the client-side pass and render `projects` directly.

**Missing indexes.** `list_projects` orders by `updated_at DESC, created_at DESC` on every call, and neither column is indexed. Add `index=True` to `updated_at`. The `ilike '%term%'` search can't use a B-tree at all — fine at current scale, but a MariaDB `FULLTEXT` index on `(title, description)` is the upgrade path when the library grows.

**Pagination is implemented in the API but not in the UI.** `limit`/`offset` exist and are validated; `LibraryPage` hardcodes `limit: 100` and renders whatever comes back. Past 100 projects, briefs silently vanish. Add "Load more" or real pagination.

**`react-markdown` + `remark-gfm` ship in the initial bundle** but are only used on `/results/:id`. `React.lazy` on `ResultsPage` moves roughly 100KB out of the path to first paint on the wizard, which is the landing route.

**Google Fonts is render-blocking.** `index.css:1` is an `@import url(fonts.googleapis.com/...)` for three families and twelve weights. A CSS `@import` blocks rendering until it resolves — over a slow link, the whole app waits. Move it to `<link rel="preconnect">` + `<link rel="stylesheet">` in `index.html`, trim the weights actually used, and add `font-display: swap`.

**Concurrent generation may be counterproductive locally.** `asyncio.gather` fires three requests at one local model server. LM Studio and Ollama queue them, so wall-clock time is unchanged at best; with a large model, three concurrent contexts can push VRAM into swap and make it worse. Measure it — a sequential loop with per-deliverable progress may well be both faster and better UX.

---

## Security

**No input length limits.** `ProjectCreate` accepts unbounded strings for every field. They're concatenated into `system_context()` and sent to the model, and stored in `TEXT` columns (65,535 bytes — a longer value raises `DataError`). A 500KB `extra_context` blows the model's context window and then fails the insert. Add `Field(max_length=...)` — 200 for `title`, 5,000 for the long fields.

**Unvalidated `platform` on the list endpoint.** `list_projects(platform: str | None = None)` in `routers/projects.py:23` is a bare `str`, while `ProjectCreate.platform` is a `Literal`. An arbitrary value just returns an empty list rather than a 422. Reuse the `Platform` literal.

**Provider responses are trusted.** `r.json()["choices"][0]["message"]["content"]` and `r.json()["response"]` assume a well-formed payload. A provider returning an error object yields `KeyError` → unhandled 500. Parse defensively and map to a 502 with a useful message.

**Prompt injection is inherent and mostly acceptable here.** Project text flows straight into the prompt, so a user can steer their own generation — that's the product working as designed. Worth noting only because the day BuildBrief gains shared projects or a public gallery, generated markdown becomes attacker-controlled content rendered in someone else's browser. The current `react-markdown` setup (no `rehype-raw`) is what keeps that safe; guard it with a comment and a test.

**`docker-compose.yml` is a development configuration.** `--reload`, source bind-mounts, and Vite's dev server. That's correct for local work, but the README presents it as the way to run BuildBrief. Add a production target — multi-stage frontend build served as static files, no `--reload` on uvicorn — before this runs anywhere unattended.

---

## Code quality

**`DeliverableKey` is defined twice.** `models.py:4` has `DeliverableKey = str`; `schemas.py:5` has the `Literal`. `models.py`'s version is unused and will silently weaken typing the moment someone imports the wrong one. Delete it.

**`@app.on_event("startup")` is deprecated.** `main.py:32` — move to the `lifespan` context manager. FastAPI emits a `DeprecationWarning` and will remove it.

**Scratch files are committed.** `frontend/themes_scratch.css` (132 lines) and `frontend/gen_themes.py` (193 lines) are build-time scratch, not app source. Delete them or move them under `tools/` with a note on how they're run — and per this project's conventions, `gen_themes.py` should be invoked via `uv run`, not bare `python`.

**`save_deliverables` can't clear a field.** `storage.py:213` skips `None` values, which is the right merge semantic for generation but means there's no way to delete a single deliverable. Fine today; worth a comment so the next person doesn't mistake it for a bug.

**Refinement question parsing is fragile.** `deliverables.py:123` strips leading `0123456789. )-` from every non-empty line and takes the first five. A model that emits a preamble ("Here are five questions:") returns that preamble as question one. Ask for JSON and parse it, with the line-based approach as fallback.

**No React error boundary.** Any render-time exception blanks the page. One boundary around `<Outlet />` in `Layout` costs ten lines.

**`pad()` is defined in four files.** `WizardPage`, `ResultsPage`, `LibraryPage`, `GenerateStep`. Move it to a shared `utils.ts`.

---

## UX

**Theme flashes on every load.** `ThemePicker` reads `localStorage` in a `useEffect`, which runs after first paint — so a Gruvbox Light user sees a dark navy flash on every navigation. Fix with a tiny inline script in `index.html` that sets `data-theme` on `<html>` before the bundle loads.

**Results are download-only.** Export writes a `.md` file; there's no copy-to-clipboard. For the Agent Prompt deliverable specifically, copy-to-clipboard *is* the primary action — the whole point is pasting it into a coding agent. Add a copy button per section.

**`formatDate` will render "Invalid Date".** `ResultsPage` seeds project state from `location.state` with `created_at: '' `, and `LibraryPage.formatDate` passes strings to `new Date()` unguarded. Guard the empty case.

---

## Feature suggestions

**Streaming generation** — covered in issue 3. Do this one first; it changes how the app feels more than anything else on this list.

**Regenerate a single deliverable.** The API already supports it — `GenerateRequest.deliverables` takes a subset and the merge preserves the rest. Only the wizard exposes it, and only as a full four-step round trip. A "Regenerate this section" button on the Results page, with a model and preset picker, is a small addition on top of machinery that already exists.

**Deliverable versions.** Right now regenerating overwrites in place, so a worse result destroys a better one. A `deliverable_versions` table keyed by `(project_id, key, created_at)` with a version switcher on the Results page turns "regenerate" from a gamble into an experiment — and it's what makes trying different local models actually useful.

**Editable prompt templates.** `DELIVERABLE_PROMPTS` and `PRESET_INSTRUCTIONS` are hardcoded dictionaries. Surfacing them as editable, per-project overrides costs one table and one settings view, and it's the difference between a fixed tool and one people tune to their own way of writing specs.

**Export as a zip or a repo scaffold.** The bundle export concatenates markdown into one file. A zip containing `specification.md`, `implementation-plan.md`, and `AGENTS.md` — laid out as a directory you drop into a new project — matches how the output is actually used.

---

## Suggested order

| # | Work | Effort | Status | Why now |
| --- | --- | --- | --- | --- |
| 1 | `return_exceptions=True` + persist partial results; stop duplicating projects on retry | S | ✅ Done | Users lose real generation time today |
| 2 | `pool_pre_ping` + `pool_recycle` | XS | ✅ Done | Two arguments; kills a whole class of intermittent 500s |
| 3 | Un-`async` the storage-only routes | S | ✅ Done | Removes event-loop stalls without a driver migration |
| 4 | Bind to `127.0.0.1`; remove the hardcoded DSN | S | ✅ Done | Closes the exposure before anything else is built on it |
| 4b | Shared-secret auth + a per-IP cap on `/generate` | S | Open | The other half of finding 04; needed before any non-loopback use |
| 5 | Alembic | S | Open | Cheapest now, at two tables |
| 6 | CI running the checks that already pass | S | Open | Locks in a currently-green baseline |
| 7 | Streaming generation (SSE) | M | ✅ Done | The highest-impact product change |
| 8 | Provider tests, then Vitest on `useWizardController` | M | Partly done | Router tests landed with item 1; the rest makes everything above safe to change |
| 9 | Debounce/abort Library search; delete the duplicate client filter | S | Open | Visible responsiveness win |
| 10 | Theme flash, copy-to-clipboard, `React.lazy` on Results | S | Open | Small polish, immediately noticeable |

**Next up:** item 5 (Alembic), then 6 (CI) — both are cheap and both get more expensive the longer they wait. Item 4b can stay parked while the app only ever listens on loopback, but it comes due the moment that changes.
