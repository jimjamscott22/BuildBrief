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

The frontend handles the wizard, saved-project library, results display, and client-side export. The backend owns all LLM communication, API orchestration, and MariaDB persistence. The frontend does not call any model provider directly.

Project intake data and generated deliverables are stored in MariaDB using UUID-keyed project records. This allows generated plans to survive backend restarts and be reopened from the Library page.

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
| GET | `/api/projects` | Return saved project summaries for the Library |
| POST | `/api/projects` | Store intake data and return a project UUID |
| POST | `/api/projects/{id}/generate` | Generate the selected deliverables for a project |
| GET | `/api/projects/{id}` | Return stored project data and generated deliverables |
| DELETE | `/api/projects/{id}` | Delete a saved project and its deliverables |

## Frontend Behavior

The frontend is expected to provide:

- A four-step intake wizard
- Required field indicators for core inputs
- A model picker populated from `GET /api/models`
- Deliverable selection via checkboxes
- A loading state during generation that references the selected model
- A saved-project Library with search and platform filtering
- A tabbed results view with one tab per generated deliverable
- Reloadable result URLs backed by persisted project records
- Markdown rendering using `react-markdown` and `remark-gfm`
- Client-side Markdown export for each deliverable

## Error Handling

If no local model providers are reachable, the backend returns an empty model list from `GET /api/models`. The frontend should surface this clearly and prevent generation until a model is available.

Expected user-facing message:

> No models available. Please connect to LM Studio or Ollama and try again.

The generate action should also remain disabled until a model is selected.

## Development Notes

During development, the frontend and backend run on separate local ports:

- Frontend: Vite on `http://localhost:5173`
- Backend: Uvicorn on `http://localhost:8001`

Because of that split, the backend needs CORS configured to allow requests from the frontend development origin.

## Getting Started

To run BuildBrief locally, you will need:

- Node.js and npm for the frontend
- Python 3.10+ for the backend
- A MariaDB server for saved projects and deliverables
- LM Studio or Ollama running locally if you want model discovery and generation to work

Create a MariaDB database and user on your Raspberry Pi:

```sql
CREATE DATABASE buildbrief CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'buildbrief_user'@'%' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON buildbrief.* TO 'buildbrief_user'@'%';
FLUSH PRIVILEGES;
```

Then configure the backend environment:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` so `DATABASE_URL` points to your MariaDB server:

```env
DATABASE_URL=mysql+pymysql://buildbrief:change-me@raspberrypi.local:3306/buildbrief
```

Start the backend first:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8001
```

`uv sync` will create the local virtual environment and install the backend dependencies declared in `backend/pyproject.toml`.

Then start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Once both servers are running:

- Open `http://localhost:5173` for the frontend
- Check `http://localhost:8000/api/health` for the backend health endpoint
- Open `http://localhost:5173/library` to revisit saved project plans
- If no local model provider is running, the UI will load but generation will stay unavailable until LM Studio or Ollama is reachable

If you want architecture and product context before running the app, start with the docs linked below.

### Running with Docker

You can also run the application using the included Docker Compose configuration. Ensure you have Docker installed and have already set up your `backend/.env` file as described above.

```bash
docker compose up -d
```

Once the containers are running:
- Open `http://localhost:5173` for the frontend
- Check `http://localhost:8001/api/health` for the backend health endpoint

To stop the containers, run:
```bash
docker compose down
```

## Repository Docs

- [Project spec](docs/project-spec.md)
- [Technical design](docs/design.md)
- [Implementation plan](docs/implementation-plan.md)
- [Docs overview](docs/README.md)

## Current Status

BuildBrief includes the core wizard, local model discovery, deliverable generation, MariaDB-backed project persistence, and a saved-project Library.
