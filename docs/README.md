# BuildBrief

BuildBrief is a project planning assistant that takes rough software ideas and generates structured specification documents, implementation plans, and agent‑ready coding prompts. It helps developers, students, and makers turn messy app ideas into build‑ready artifacts and clear next steps.

## Features

- **Idea Intake:** Collects information about your project idea, target users, preferred technologies, platform, complexity, and constraints.
- **Structuring Engine:** Analyzes the idea and organizes it into key components: problem, users, features, data entities, constraints, and risks.
- **Output Generator:** Produces various deliverables such as specification documents, MVP checklists, implementation roadmaps, database schemas, API plans, and agent coding prompts for tools like Codex, Claude, and Cursor.
- **Iteration Layer:** Enables refining and adjusting the generated outputs—e.g. simplifying the project for an MVP or adapting to a different tech stack.
- **Saved Library:** Persists project intake data and generated deliverables in MariaDB so plans can be reopened later.
- **Export Options:** Exports generated deliverables as Markdown.

## Docs

| Document | Description |
|---|---|
| [Project Specification](project-spec.md) | Functional/technical requirements, core features, API plan, data model |
| [Implementation Plan](implementation-plan.md) | Task‑by‑task breakdown with phases, timeline, and milestones |

## Getting Started

These instructions will guide you in setting up the project locally for development and testing.

### Prerequisites

- Node.js (v18.x or later) and npm or yarn
- Python 3.10+
- uv for backend dependency management
- MariaDB for saved projects and deliverables
- A modern web browser

### Installation

Clone the repository:

```bash
git clone https://github.com/yourusername/buildbrief.git
cd buildbrief
```

Install backend dependencies:

```bash
cd backend
cp .env.example .env
uv sync
```

Set `DATABASE_URL` in `backend/.env` to your MariaDB server, for example:

```env
DATABASE_URL=mysql+pymysql://buildbrief:change-me@raspberrypi.local:3306/buildbrief
```

Install frontend dependencies:

```bash
cd ../frontend
npm install
```

## Running the Application

Open two terminal windows or tabs.

Start the backend (FastAPI):

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

The backend will run at `http://localhost:8000`.

Start the frontend (React):

```bash
cd frontend
npm run dev
```

The frontend will open at `http://localhost:5173`.

## Usage

Once running, open `http://localhost:5173` in your browser. Enter your project idea via the intake form. Fill out as many fields as possible. Select the desired outputs and generate your documents. Reopen saved plans from `/library`, review the results, then export them.

## Project Structure

```
buildbrief/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entrypoint
│   │   ├── schemas.py        # Pydantic models
│   │   ├── routers/          # API routes
│   │   ├── storage.py        # MariaDB persistence
│   │   └── ...
│   ├── pyproject.toml        # Python dependencies
│   └── ...
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── api.ts            # API calls
│   │   └── ...
│   ├── package.json          # Node dependencies
│   └── ...
├── docs/
│   ├── project-spec.md
│   ├── implementation-plan.md
│   └── ...
├── README.md
└── .gitignore
```

## Contributing

Contributions are welcome! Please open an issue first to discuss your planned changes. Make sure to update tests as appropriate.

## License

This project is licensed under the MIT License.

## Acknowledgements

BuildBrief is inspired by modern AI‑assisted development workflows and aims to streamline the transition from idea to implementation.
