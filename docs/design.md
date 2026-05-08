# BuildBrief Technical Design

## Architecture

**Full-stack monorepo:** React/Vite/TypeScript/Tailwind frontend + FastAPI Python backend.

```text
BuildBrief/
├── frontend/          # React + Vite + TypeScript + Tailwind
└── backend/           # FastAPI + Python 3.10+
```

The backend owns all LLM communication. The frontend never calls any LLM provider directly.

**Storage:** MariaDB via SQLAlchemy, keyed by UUID project records. Generated deliverables are persisted one row per project so result URLs can be reopened after backend restarts.

---

## LLM Integration

Two local providers are supported via a unified abstraction layer:

| Provider  | Base URL                    | Protocol            |
| --------- | --------------------------- | ------------------- |
| LM Studio | `http://localhost:1234`     | OpenAI-compatible   |
| Ollama    | `http://localhost:11434`    | Ollama native API   |

The abstraction exposes two methods:

```python
list_models() -> list[str]     # e.g. ["lmstudio/llama-3", "ollama/mistral"]
generate(prompt: str) -> str
```

Models are prefixed by source (`lmstudio/` or `ollama/`) and presented together in a single dropdown. Both providers are probed at request time; unavailable providers are silently omitted.

---

## API

| Method | Endpoint                      | Description                                        |
| ------ | ----------------------------- | -------------------------------------------------- |
| GET    | `/api/models`                 | Probes both providers; returns combined model list |
| GET    | `/api/projects`               | Returns saved project summaries for the Library    |
| POST   | `/api/projects`               | Stores intake data; returns UUID                   |
| POST   | `/api/projects/{id}/generate` | Calls chosen model; returns deliverables dict      |
| GET    | `/api/projects/{id}`          | Returns project + deliverables                     |
| DELETE | `/api/projects/{id}`          | Deletes project + deliverables                     |

---

## Wizard (4 Steps)

### Step 1 — The Idea

- Project title `* Required`
- Description `* Required`
- Target users `* Required`

### Step 2 — Platform & Tech

- Platform (web / mobile / desktop / CLI)
- Tech preferences (free text)
- Complexity (simple / medium / complex)

### Step 3 — Constraints & Context

- Constraints (optional)
- Extra context (optional)

### Step 4 — Model & Outputs

- Model picker: dropdown populated from `GET /api/models`
- Deliverable checkboxes: Specification Doc, Implementation Plan, Agent Prompt

Required fields display a `* Required` label adjacent to the input.

---

## Deliverable Generation

Each selected deliverable triggers a **separate LLM call** with a focused system prompt and user prompt. Intake data is injected as structured context into each call.

Response shape:

```json
{
  "spec": "...",
  "implementation_plan": "...",
  "agent_prompt": "..."
}
```

Only requested deliverables are included; unselected keys are omitted.

---

## Error Handling

If both providers are offline or unreachable, `GET /api/models` returns an empty list. The frontend displays a toast notification:

> "No models available. Please connect to LM Studio or Ollama and try again."

The generate button is disabled when no model is selected.

---

## Development Setup

During development the frontend (Vite, default port `5173`) and backend (Uvicorn, default port `8000`) run on different ports. The backend must be configured with CORS middleware to allow requests from `http://localhost:5173`.

---

## Frontend Behaviour

- **Library view:** Searchable saved-project list with platform filtering and delete/open actions.
- **Results view:** Tabbed layout — one tab per generated deliverable.
- **Reloadable results:** `/results/:id` fetches persisted project data if navigation state is missing.
- **Rendering:** `react-markdown` + `remark-gfm` for full Markdown/GFM support.
- **Loading state:** Spinner shown during generation, labelled with the selected model name.
- **Export:** Client-side Markdown download button per deliverable (no server round-trip needed).
