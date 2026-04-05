# BuildBrief

BuildBrief is a project planning assistant that takes rough software ideas and generates structured specification documents, implementation plans, and agent‑ready coding prompts. It helps developers, students, and makers turn messy app ideas into build‑ready artifacts and clear next steps.

## Features

- **Idea Intake:** Collects information about your project idea, target users, preferred technologies, platform, complexity, and constraints.
- **Structuring Engine:** Analyzes the idea and organizes it into key components: problem, users, features, data entities, constraints, and risks.
- **Output Generator:** Produces various deliverables such as specification documents, MVP checklists, implementation roadmaps, database schemas, API plans, and agent coding prompts for tools like Codex, Claude, and Cursor.
- **Iteration Layer:** Enables refining and adjusting the generated outputs—e.g. simplifying the project for an MVP or adapting to a different tech stack.
- **Export Options:** Exports deliverables in multiple formats including Markdown, PDF, DOCX, and JSON.

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
- pip installed
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
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
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
source venv/bin/activate
uvicorn app.main:app --reload
```

The backend will run at `http://localhost:8000`.

Start the frontend (React):

```bash
cd frontend
npm run dev
```

The frontend will open at `http://localhost:3000`.

## Usage

Once running, open `http://localhost:3000` in your browser. Enter your project idea via the intake form. Fill out as many fields as possible. Select the desired outputs and generate your documents. Review and refine the results, then export them.

## Project Structure

```
buildbrief/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entrypoint
│   │   ├── schemas.py        # Pydantic models
│   │   ├── services/         # Business logic modules
│   │   └── …
│   ├── requirements.txt      # Python dependencies
│   └── …
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/         # API calls
│   │   └── …
│   ├── package.json          # Node dependencies
│   └── …
├── docs/
│   ├── project-spec.md
│   ├── implementation-plan.md
│   └── …
├── README.md
└── .gitignore
```

## Contributing

Contributions are welcome! Please open an issue first to discuss your planned changes. Make sure to update tests as appropriate.

## License

This project is licensed under the MIT License.

## Acknowledgements

BuildBrief is inspired by modern AI‑assisted development workflows and aims to streamline the transition from idea to implementation.
