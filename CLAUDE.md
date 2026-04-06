# BuildBrief — CLAUDE.md

## Project Overview

BuildBrief is a full-stack app that turns rough software ideas into structured build artifacts (spec, implementation plan, agent prompt) using local LLMs. It is a four-step wizard UI backed by a FastAPI API.

## Monorepo Structure

```
BuildBrief/
├── backend/        # FastAPI + Python 3.11, managed with uv
│   ├── app/
│   │   ├── main.py         # FastAPI app, CORS, router registration
│   │   ├── models.py       # Pydantic domain models
│   │   ├── schemas.py      # Request/response schemas
│   │   ├── storage.py      # In-memory UUID-keyed project store
│   │   ├── providers.py    # LM Studio + Ollama provider abstraction
│   │   └── routers/
│   │       ├── models.py   # GET /api/models
│   │       └── projects.py # POST /api/projects, POST /api/projects/{id}/generate, GET /api/projects/{id}
│   ├── pyproject.toml
│   └── uv.lock
└── frontend/       # React + Vite + TypeScript + Tailwind
    ├── src/
    └── package.json
```

## Running the Project

### Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

Runs on `http://localhost:8000`. Copy `.env.example` to `.env` before first run.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`.

## Key Conventions

- **Backend deps**: managed with `uv`. Add packages via `uv add <package>`, not pip.
- **Storage**: in-memory only (no database). `storage.py` holds a dict keyed by UUID.
- **LLM providers**: LM Studio (`lmstudio/...`) and Ollama (`ollama/...`) are probed at request time. Missing providers are silently omitted from the model list.
- **Deliverables**: each selected deliverable (spec, implementation_plan, agent_prompt) is generated in a separate LLM call. Unselected ones are omitted from the response.
- **Frontend never calls LLM providers directly** — all generation goes through the backend.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/models` | List available local models |
| POST | `/api/projects` | Create project from wizard intake |
| POST | `/api/projects/{id}/generate` | Generate selected deliverables |
| GET | `/api/projects/{id}` | Retrieve project + generated results |
