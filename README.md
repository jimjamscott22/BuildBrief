# BuildBrief

BuildBrief is a project planning assistant that takes rough software ideas and turns them into structured build artifacts. It helps developers, students, and makers move from an initial concept to specification documents, implementation plans, and agent-ready coding prompts.

## What It Does

BuildBrief guides a user through a short intake wizard, collects the important context around a project idea, and then uses a selected local LLM to generate one or more deliverables:

- Specification document
- Implementation plan
- Agent prompt

The goal is to turn messy ideas into build-ready output with clearer scope, structure, and next steps.

## Product Flow

The application is designed as a four-step wizard:

1. The idea
2. Platform and tech preferences
3. Constraints and additional context
4. Model and output selection

Users provide core project information, choose from available local models, and select which deliverables they want generated. Each requested deliverable is produced independently so the output can stay focused on its specific purpose.

## Architecture

BuildBrief is a full-stack monorepo with a separate frontend and backend:

```text
BuildBrief/
├── frontend/          # React + Vite + TypeScript + Tailwind
└── backend/           # FastAPI + Python 3.10+
```

The frontend handles the wizard, results display, and client-side export. The backend owns all LLM communication and API orchestration. The frontend does not call any model provider directly.

For the MVP, project data is stored in memory using UUID-keyed records. A database is intentionally not required for the initial version. Persistent storage can be added later when account support, history, or saved projects become necessary.

## LLM Providers

BuildBrief supports two local model providers behind a shared abstraction:

| Provider | Base URL | Protocol |
| --- | --- | --- |
| LM Studio | `http://localhost:1234` | OpenAI-compatible |
| Ollama | `http://localhost:11434` | Ollama native API |

The backend exposes a unified interface that:

- Lists available models across both providers
- Prefixes model names by source, such as `lmstudio/...` or `ollama/...`
- Omits providers that are unavailable at request time
- Uses the selected model for generation through the backend only

This keeps the UI simple while allowing multiple local providers to appear in one model picker.

## Deliverables

Each deliverable type is generated through a separate LLM call with a focused prompt. Intake data from the wizard is injected as structured context into every request.

Only the outputs the user selects are returned. A typical response shape is:

```json
{
  "spec": "...",
  "implementation_plan": "...",
  "agent_prompt": "..."
}
```

Unselected deliverables are omitted from the response.

## API Overview

The backend API is designed around project intake, model discovery, and deliverable generation:

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/models` | Probe local providers and return a combined model list |
| POST | `/api/projects` | Store intake data and return a project UUID |
| POST | `/api/projects/{id}/generate` | Generate the selected deliverables for a project |
| GET | `/api/projects/{id}` | Return stored project data and generated deliverables |

## Frontend Behavior

The frontend is expected to provide:

- A four-step intake wizard
- Required field indicators for core inputs
- A model picker populated from `GET /api/models`
- Deliverable selection via checkboxes
- A loading state during generation that references the selected model
- A tabbed results view with one tab per generated deliverable
- Markdown rendering using `react-markdown` and `remark-gfm`
- Client-side Markdown export for each deliverable

## Error Handling

If no local model providers are reachable, the backend returns an empty model list from `GET /api/models`. The frontend should surface this clearly and prevent generation until a model is available.

Expected user-facing message:

> No models available. Please connect to LM Studio or Ollama and try again.

The generate action should also remain disabled until a model is selected.

## Running Locally

### Prerequisites

- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python backend)
- Node.js 18+ and npm (frontend)
- LM Studio or Ollama running locally with at least one model loaded

### Backend

```bash
cd backend
cp .env.example .env   # adjust URLs if your providers aren't on default ports
uv sync
uv run uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

## Development Notes

During development, the frontend and backend run on separate local ports:

- Frontend: Vite on `http://localhost:5173`
- Backend: Uvicorn on `http://localhost:8000`

Because of that split, the backend needs CORS configured to allow requests from the frontend development origin.

## Repository Docs

- [Project spec](docs/project-spec.md)
- [Technical design](docs/design.md)
- [Implementation plan](docs/implementation-plan.md)
- [Docs overview](docs/README.md)

## Current Status

This repository currently contains the planning and design documentation for the BuildBrief MVP. The implementation is intended to follow the architecture and behavior described in the docs above.
