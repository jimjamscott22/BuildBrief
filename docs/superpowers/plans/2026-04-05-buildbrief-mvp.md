# BuildBrief MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack web app that takes a software idea through a 4-step wizard and generates structured docs (spec, implementation plan, agent prompt) using a locally-running LLM (LM Studio or Ollama).

**Architecture:** FastAPI backend owns all LLM communication via a unified provider abstraction (LM Studio + Ollama); React/Vite/TypeScript/Tailwind frontend renders a 4-step wizard and displays results in a tabbed markdown viewer. Session storage is an in-memory Python dict keyed by UUID.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic v2, httpx, pytest, pytest-asyncio, respx; React 18, Vite 5, TypeScript, Tailwind CSS 3, react-markdown, remark-gfm, sonner, vitest, @testing-library/react

---

## File Map

### Backend

| File | Responsibility |
| ---- | -------------- |
| `backend/app/__init__.py` | Package marker |
| `backend/app/main.py` | FastAPI app, CORS, all route handlers |
| `backend/app/models.py` | Pydantic request/response models |
| `backend/app/storage.py` | In-memory session store (dict keyed by UUID) |
| `backend/app/prompts.py` | System/user prompt builders per deliverable type |
| `backend/app/llm/__init__.py` | Package marker |
| `backend/app/llm/lmstudio.py` | LM Studio provider (OpenAI-compatible HTTP) |
| `backend/app/llm/ollama.py` | Ollama provider (Ollama native HTTP) |
| `backend/app/llm/registry.py` | Probes both providers, combines model list, dispatches generate |
| `backend/tests/__init__.py` | Package marker |
| `backend/tests/test_models.py` | Pydantic validation tests |
| `backend/tests/test_storage.py` | Storage CRUD tests |
| `backend/tests/test_prompts.py` | Prompt builder tests |
| `backend/tests/test_llm.py` | Provider + registry tests (mocked HTTP via respx) |
| `backend/tests/test_routes.py` | FastAPI endpoint integration tests |
| `backend/requirements.txt` | Python dependencies |
| `backend/pytest.ini` | asyncio_mode = auto |

### Frontend

| File | Responsibility |
| ---- | -------------- |
| `frontend/src/main.tsx` | React entry point, mounts App |
| `frontend/src/App.tsx` | Top-level view state (wizard ↔ results), generation logic |
| `frontend/src/types.ts` | TypeScript types shared across all components |
| `frontend/src/api.ts` | Fetch wrapper for all backend endpoints |
| `frontend/src/hooks/useWizard.ts` | Wizard step (1–4) + form data state |
| `frontend/src/components/wizard/WizardShell.tsx` | Wizard container with step progress indicator |
| `frontend/src/components/wizard/Step1Idea.tsx` | Title, description, target users (all required) |
| `frontend/src/components/wizard/Step2Platform.tsx` | Platform toggle, tech prefs text, complexity toggle |
| `frontend/src/components/wizard/Step3Constraints.tsx` | Constraints + extra context textareas (both optional) |
| `frontend/src/components/wizard/Step4ModelOutputs.tsx` | Model dropdown + deliverable checkboxes + generate button |
| `frontend/src/components/results/ResultsView.tsx` | Tabbed deliverable display, Start Over button |
| `frontend/src/components/results/DeliverableTab.tsx` | react-markdown renderer + .md export button |
| `frontend/src/test/setup.ts` | @testing-library/jest-dom import |
| `frontend/src/test/api.test.ts` | API client unit tests |
| `frontend/src/test/useWizard.test.ts` | Hook unit tests |

---

## Task 1: Repo Structure + Backend Scaffold

**Files:**

- Create: `backend/requirements.txt`
- Create: `backend/pytest.ini`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: Create directories and package markers**

```bash
mkdir -p backend/app/llm backend/tests
touch backend/app/__init__.py backend/app/llm/__init__.py backend/tests/__init__.py
```

- [ ] **Step 2: Write `backend/requirements.txt`**

```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
pydantic>=2.0.0
httpx>=0.27.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
respx>=0.21.0
```

- [ ] **Step 3: Write `backend/pytest.ini`**

```ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 4: Set up Python virtual environment and install dependencies**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Expected: All packages install without error.

- [ ] **Step 5: Write `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="BuildBrief API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Write a smoke test in `backend/tests/test_routes.py`**

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 7: Run the test**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_routes.py -v
```

Expected: `PASSED tests/test_routes.py::test_health`

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat: backend scaffold with health endpoint"
```

---

## Task 2: Data Models

**Files:**

- Create: `backend/app/models.py`
- Create: `backend/tests/test_models.py`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_models.py`:

```python
import pytest
from pydantic import ValidationError
from app.models import ProjectIntake, GenerateRequest, DeliverableType


def test_project_intake_requires_title():
    with pytest.raises(ValidationError):
        ProjectIntake(description="desc", target_users="devs")


def test_project_intake_valid():
    intake = ProjectIntake(title="My App", description="A tool", target_users="Developers")
    assert intake.title == "My App"
    assert intake.platform is None
    assert intake.complexity is None


def test_generate_request_valid():
    req = GenerateRequest(model="lmstudio/llama-3", deliverables=["spec", "implementation_plan"])
    assert req.model == "lmstudio/llama-3"
    assert DeliverableType.spec in req.deliverables


def test_generate_request_invalid_deliverable():
    with pytest.raises(ValidationError):
        GenerateRequest(model="lmstudio/llama-3", deliverables=["invalid"])
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_models.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.models'`

- [ ] **Step 3: Write `backend/app/models.py`**

```python
from __future__ import annotations
from enum import Enum
from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class Platform(str, Enum):
    web = "web"
    mobile = "mobile"
    desktop = "desktop"
    cli = "cli"


class Complexity(str, Enum):
    simple = "simple"
    medium = "medium"
    complex = "complex"


class DeliverableType(str, Enum):
    spec = "spec"
    implementation_plan = "implementation_plan"
    agent_prompt = "agent_prompt"


class ProjectIntake(BaseModel):
    title: str
    description: str
    target_users: str
    platform: Optional[Platform] = None
    tech_preferences: Optional[str] = None
    complexity: Optional[Complexity] = None
    constraints: Optional[str] = None
    extra_context: Optional[str] = None


class Project(BaseModel):
    id: str
    intake: ProjectIntake
    created_at: datetime


class GenerateRequest(BaseModel):
    model: str
    deliverables: list[DeliverableType]


class GenerateResponse(BaseModel):
    spec: Optional[str] = None
    implementation_plan: Optional[str] = None
    agent_prompt: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    intake: ProjectIntake
    created_at: datetime
    deliverables: Optional[GenerateResponse] = None
```

- [ ] **Step 4: Run to verify tests pass**

```bash
pytest tests/test_models.py -v
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/tests/test_models.py
git commit -m "feat: add Pydantic data models"
```

---

## Task 3: In-Memory Storage

**Files:**

- Create: `backend/app/storage.py`
- Create: `backend/tests/test_storage.py`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_storage.py`:

```python
from app.models import ProjectIntake, GenerateResponse
import app.storage as storage


def setup_function():
    storage._store.clear()


def test_create_and_get_project():
    intake = ProjectIntake(title="T", description="D", target_users="U")
    project = storage.create_project(intake)

    assert project.id
    assert project.intake.title == "T"

    record = storage.get_project(project.id)
    assert record is not None
    assert record["project"].id == project.id
    assert record["deliverables"] is None


def test_get_nonexistent_project_returns_none():
    assert storage.get_project("does-not-exist") is None


def test_save_deliverables():
    intake = ProjectIntake(title="T", description="D", target_users="U")
    project = storage.create_project(intake)
    storage.save_deliverables(project.id, GenerateResponse(spec="# Spec"))

    record = storage.get_project(project.id)
    assert record["deliverables"].spec == "# Spec"
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_storage.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.storage'`

- [ ] **Step 3: Write `backend/app/storage.py`**

```python
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional
from .models import Project, ProjectIntake, GenerateResponse

_store: dict[str, dict] = {}


def create_project(intake: ProjectIntake) -> Project:
    project = Project(
        id=str(uuid.uuid4()),
        intake=intake,
        created_at=datetime.now(timezone.utc),
    )
    _store[project.id] = {"project": project, "deliverables": None}
    return project


def get_project(project_id: str) -> Optional[dict]:
    return _store.get(project_id)


def save_deliverables(project_id: str, deliverables: GenerateResponse) -> None:
    if project_id in _store:
        _store[project_id]["deliverables"] = deliverables
```

- [ ] **Step 4: Run to verify tests pass**

```bash
pytest tests/test_storage.py -v
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/storage.py backend/tests/test_storage.py
git commit -m "feat: add in-memory session storage"
```

---

## Task 4: LLM Providers (LM Studio + Ollama)

**Files:**

- Create: `backend/app/llm/lmstudio.py`
- Create: `backend/app/llm/ollama.py`
- Create: `backend/tests/test_llm.py`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_llm.py`:

```python
import pytest
import respx
import httpx
from app.llm import lmstudio, ollama

LMSTUDIO_BASE = "http://localhost:1234"
OLLAMA_BASE = "http://localhost:11434"


@pytest.mark.asyncio
@respx.mock
async def test_lmstudio_list_models():
    respx.get(f"{LMSTUDIO_BASE}/v1/models").mock(
        return_value=httpx.Response(200, json={"data": [{"id": "llama-3"}]})
    )
    models = await lmstudio.list_models()
    assert models == ["lmstudio/llama-3"]


@pytest.mark.asyncio
@respx.mock
async def test_lmstudio_generate():
    respx.post(f"{LMSTUDIO_BASE}/v1/chat/completions").mock(
        return_value=httpx.Response(
            200, json={"choices": [{"message": {"content": "Generated text"}}]}
        )
    )
    result = await lmstudio.generate("lmstudio/llama-3", "Hello", "You are helpful.")
    assert result == "Generated text"


@pytest.mark.asyncio
@respx.mock
async def test_ollama_list_models():
    respx.get(f"{OLLAMA_BASE}/api/tags").mock(
        return_value=httpx.Response(200, json={"models": [{"name": "mistral"}]})
    )
    models = await ollama.list_models()
    assert models == ["ollama/mistral"]


@pytest.mark.asyncio
@respx.mock
async def test_ollama_generate():
    respx.post(f"{OLLAMA_BASE}/api/generate").mock(
        return_value=httpx.Response(200, json={"response": "Ollama text"})
    )
    result = await ollama.generate("ollama/mistral", "Hello", "You are helpful.")
    assert result == "Ollama text"
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_llm.py -v
```

Expected: `ImportError: cannot import name 'lmstudio' from 'app.llm'`

- [ ] **Step 3: Write `backend/app/llm/lmstudio.py`**

```python
import httpx

_BASE_URL = "http://localhost:1234"


async def list_models() -> list[str]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{_BASE_URL}/v1/models", timeout=3.0)
        resp.raise_for_status()
        return [f"lmstudio/{m['id']}" for m in resp.json()["data"]]


async def generate(model: str, prompt: str, system: str = "") -> str:
    model_id = model.removeprefix("lmstudio/")
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{_BASE_URL}/v1/chat/completions",
            json={"model": model_id, "messages": messages},
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
```

- [ ] **Step 4: Write `backend/app/llm/ollama.py`**

```python
import httpx

_BASE_URL = "http://localhost:11434"


async def list_models() -> list[str]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{_BASE_URL}/api/tags", timeout=3.0)
        resp.raise_for_status()
        return [f"ollama/{m['name']}" for m in resp.json()["models"]]


async def generate(model: str, prompt: str, system: str = "") -> str:
    model_id = model.removeprefix("ollama/")
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{_BASE_URL}/api/generate",
            json={"model": model_id, "prompt": prompt, "system": system, "stream": False},
        )
        resp.raise_for_status()
        return resp.json()["response"]
```

- [ ] **Step 5: Run to verify tests pass**

```bash
pytest tests/test_llm.py -v
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/llm/lmstudio.py backend/app/llm/ollama.py backend/tests/test_llm.py backend/pytest.ini
git commit -m "feat: add LM Studio and Ollama LLM providers"
```

---

## Task 5: Model Registry + GET /api/models

**Files:**

- Create: `backend/app/llm/registry.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_llm.py` (append registry tests)
- Modify: `backend/tests/test_routes.py` (append models endpoint tests)

- [ ] **Step 1: Append registry tests to `backend/tests/test_llm.py`**

```python
from app.llm import registry


@pytest.mark.asyncio
@respx.mock
async def test_registry_lists_both_providers():
    respx.get(f"{LMSTUDIO_BASE}/v1/models").mock(
        return_value=httpx.Response(200, json={"data": [{"id": "llama-3"}]})
    )
    respx.get(f"{OLLAMA_BASE}/api/tags").mock(
        return_value=httpx.Response(200, json={"models": [{"name": "mistral"}]})
    )
    models = await registry.list_all_models()
    assert "lmstudio/llama-3" in models
    assert "ollama/mistral" in models


@pytest.mark.asyncio
@respx.mock
async def test_registry_omits_unavailable_provider():
    respx.get(f"{LMSTUDIO_BASE}/v1/models").mock(side_effect=httpx.ConnectError("down"))
    respx.get(f"{OLLAMA_BASE}/api/tags").mock(
        return_value=httpx.Response(200, json={"models": [{"name": "mistral"}]})
    )
    models = await registry.list_all_models()
    assert models == ["ollama/mistral"]


@pytest.mark.asyncio
@respx.mock
async def test_registry_dispatches_lmstudio():
    respx.post(f"{LMSTUDIO_BASE}/v1/chat/completions").mock(
        return_value=httpx.Response(
            200, json={"choices": [{"message": {"content": "hi"}}]}
        )
    )
    result = await registry.generate("lmstudio/llama-3", "hello")
    assert result == "hi"


@pytest.mark.asyncio
@respx.mock
async def test_registry_dispatches_ollama():
    respx.post(f"{OLLAMA_BASE}/api/generate").mock(
        return_value=httpx.Response(200, json={"response": "hi"})
    )
    result = await registry.generate("ollama/mistral", "hello")
    assert result == "hi"


@pytest.mark.asyncio
async def test_registry_raises_on_unknown_prefix():
    with pytest.raises(ValueError, match="Unknown model prefix"):
        await registry.generate("unknown/model", "hello")
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
pytest tests/test_llm.py::test_registry_lists_both_providers -v
```

Expected: `ImportError: cannot import name 'registry' from 'app.llm'`

- [ ] **Step 3: Write `backend/app/llm/registry.py`**

```python
from . import lmstudio, ollama


async def list_all_models() -> list[str]:
    models: list[str] = []
    try:
        models.extend(await lmstudio.list_models())
    except Exception:
        pass
    try:
        models.extend(await ollama.list_models())
    except Exception:
        pass
    return models


async def generate(model: str, prompt: str, system: str = "") -> str:
    if model.startswith("lmstudio/"):
        return await lmstudio.generate(model, prompt, system)
    if model.startswith("ollama/"):
        return await ollama.generate(model, prompt, system)
    raise ValueError(f"Unknown model prefix: {model}")
```

- [ ] **Step 4: Append models endpoint tests to `backend/tests/test_routes.py`**

```python
import respx
import httpx

LMSTUDIO_BASE = "http://localhost:1234"
OLLAMA_BASE = "http://localhost:11434"


@respx.mock
def test_get_models_returns_combined_list():
    respx.get(f"{LMSTUDIO_BASE}/v1/models").mock(
        return_value=httpx.Response(200, json={"data": [{"id": "llama-3"}]})
    )
    respx.get(f"{OLLAMA_BASE}/api/tags").mock(
        return_value=httpx.Response(200, json={"models": [{"name": "mistral"}]})
    )
    resp = client.get("/api/models")
    assert resp.status_code == 200
    assert "lmstudio/llama-3" in resp.json()["models"]
    assert "ollama/mistral" in resp.json()["models"]


@respx.mock
def test_get_models_returns_empty_when_both_down():
    respx.get(f"{LMSTUDIO_BASE}/v1/models").mock(side_effect=httpx.ConnectError("down"))
    respx.get(f"{OLLAMA_BASE}/api/tags").mock(side_effect=httpx.ConnectError("down"))
    resp = client.get("/api/models")
    assert resp.status_code == 200
    assert resp.json()["models"] == []
```

- [ ] **Step 5: Add the `/api/models` route to `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .llm import registry

app = FastAPI(title="BuildBrief API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/models")
async def get_models():
    models = await registry.list_all_models()
    return {"models": models}
```

- [ ] **Step 6: Run all backend tests**

```bash
pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/llm/registry.py backend/app/main.py backend/tests/
git commit -m "feat: add model registry and GET /api/models endpoint"
```

---

## Task 6: Prompt Builders

**Files:**

- Create: `backend/app/prompts.py`
- Create: `backend/tests/test_prompts.py`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_prompts.py`:

```python
from app.models import ProjectIntake, DeliverableType
from app.prompts import format_intake, build_prompts


def test_format_intake_includes_required_fields():
    intake = ProjectIntake(title="My App", description="A tool", target_users="Devs")
    text = format_intake(intake)
    assert "My App" in text
    assert "A tool" in text
    assert "Devs" in text


def test_format_intake_omits_none_fields():
    intake = ProjectIntake(title="T", description="D", target_users="U")
    text = format_intake(intake)
    assert "Platform:" not in text
    assert "Constraints:" not in text


def test_format_intake_includes_optional_when_provided():
    intake = ProjectIntake(
        title="T", description="D", target_users="U",
        platform="web", constraints="No cloud",
    )
    text = format_intake(intake)
    assert "Platform: web" in text
    assert "Constraints: No cloud" in text


def test_build_prompts_returns_nonempty_strings():
    intake = ProjectIntake(title="T", description="D", target_users="U")
    system, user = build_prompts(DeliverableType.spec, intake)
    assert len(system) > 0
    assert len(user) > 0
    assert "T" in user


def test_build_prompts_different_for_each_type():
    intake = ProjectIntake(title="T", description="D", target_users="U")
    sys_spec, _ = build_prompts(DeliverableType.spec, intake)
    sys_impl, _ = build_prompts(DeliverableType.implementation_plan, intake)
    sys_agent, _ = build_prompts(DeliverableType.agent_prompt, intake)
    assert sys_spec != sys_impl
    assert sys_impl != sys_agent
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_prompts.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.prompts'`

- [ ] **Step 3: Write `backend/app/prompts.py`**

```python
from .models import ProjectIntake, DeliverableType

_SYSTEM_PROMPTS = {
    DeliverableType.spec: (
        "You are a senior technical writer. "
        "Generate a clear, structured project specification document in Markdown. "
        "Include sections for Overview, Problem Statement, Goals, Target Users, "
        "Core Features, Non-Goals, Tech Stack, and Data Model."
    ),
    DeliverableType.implementation_plan: (
        "You are a senior software engineer. "
        "Generate a detailed, phased implementation plan in Markdown. "
        "Break the work into phases with concrete tasks, file paths, and commands."
    ),
    DeliverableType.agent_prompt: (
        "You are an expert at writing prompts for AI coding assistants. "
        "Generate a comprehensive system prompt in Markdown that gives an AI coding agent "
        "everything it needs to implement this project from scratch: goals, stack, "
        "architecture, constraints, and step-by-step guidance."
    ),
}

_USER_TEMPLATES = {
    DeliverableType.spec: (
        "Write a full project specification for the following project:\n\n{intake}"
    ),
    DeliverableType.implementation_plan: (
        "Write a detailed implementation plan for the following project:\n\n{intake}"
    ),
    DeliverableType.agent_prompt: (
        "Write a comprehensive AI coding agent prompt for the following project:\n\n{intake}"
    ),
}


def format_intake(intake: ProjectIntake) -> str:
    lines = [
        f"Project Title: {intake.title}",
        f"Description: {intake.description}",
        f"Target Users: {intake.target_users}",
    ]
    if intake.platform:
        lines.append(f"Platform: {intake.platform}")
    if intake.tech_preferences:
        lines.append(f"Tech Preferences: {intake.tech_preferences}")
    if intake.complexity:
        lines.append(f"Complexity: {intake.complexity}")
    if intake.constraints:
        lines.append(f"Constraints: {intake.constraints}")
    if intake.extra_context:
        lines.append(f"Extra Context: {intake.extra_context}")
    return "\n".join(lines)


def build_prompts(deliverable: DeliverableType, intake: ProjectIntake) -> tuple[str, str]:
    system = _SYSTEM_PROMPTS[deliverable]
    user = _USER_TEMPLATES[deliverable].format(intake=format_intake(intake))
    return system, user
```

- [ ] **Step 4: Run to verify tests pass**

```bash
pytest tests/test_prompts.py -v
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/prompts.py backend/tests/test_prompts.py
git commit -m "feat: add deliverable prompt builders"
```

---

## Task 7: Project + Generate Endpoints

**Files:**

- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_routes.py` (append)

- [ ] **Step 1: Append project endpoint tests to `backend/tests/test_routes.py`**

```python
def test_create_project_returns_id():
    resp = client.post("/api/projects", json={
        "title": "My App",
        "description": "A planning tool",
        "target_users": "Developers",
    })
    assert resp.status_code == 200
    assert "id" in resp.json()
    assert len(resp.json()["id"]) > 0


def test_get_project_returns_intake():
    create_resp = client.post("/api/projects", json={
        "title": "My App",
        "description": "A planning tool",
        "target_users": "Developers",
    })
    project_id = create_resp.json()["id"]

    get_resp = client.get(f"/api/projects/{project_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == project_id
    assert data["intake"]["title"] == "My App"
    assert data["deliverables"] is None


def test_get_nonexistent_project_returns_404():
    resp = client.get("/api/projects/does-not-exist")
    assert resp.status_code == 404


@respx.mock
def test_generate_deliverables():
    respx.post(f"{LMSTUDIO_BASE}/v1/chat/completions").mock(
        return_value=httpx.Response(
            200, json={"choices": [{"message": {"content": "# Generated"}}]}
        )
    )
    create_resp = client.post("/api/projects", json={
        "title": "T", "description": "D", "target_users": "U",
    })
    project_id = create_resp.json()["id"]

    gen_resp = client.post(f"/api/projects/{project_id}/generate", json={
        "model": "lmstudio/llama-3",
        "deliverables": ["spec"],
    })
    assert gen_resp.status_code == 200
    assert gen_resp.json()["spec"] == "# Generated"
    assert gen_resp.json()["implementation_plan"] is None


def test_generate_on_nonexistent_project_returns_404():
    resp = client.post("/api/projects/does-not-exist/generate", json={
        "model": "lmstudio/llama-3",
        "deliverables": ["spec"],
    })
    assert resp.status_code == 404
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
pytest tests/test_routes.py::test_create_project_returns_id -v
```

Expected: `FAILED` — route not defined.

- [ ] **Step 3: Replace `backend/app/main.py` with the complete version**

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .llm import registry
from .models import ProjectIntake, GenerateRequest, GenerateResponse, ProjectResponse
from . import storage
from .prompts import build_prompts

app = FastAPI(title="BuildBrief API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/models")
async def get_models():
    return {"models": await registry.list_all_models()}


@app.post("/api/projects")
async def create_project(intake: ProjectIntake):
    project = storage.create_project(intake)
    return {"id": project.id}


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    record = storage.get_project(project_id)
    if not record:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(
        id=record["project"].id,
        intake=record["project"].intake,
        created_at=record["project"].created_at,
        deliverables=record["deliverables"],
    )


@app.post("/api/projects/{project_id}/generate", response_model=GenerateResponse)
async def generate_deliverables(project_id: str, req: GenerateRequest):
    record = storage.get_project(project_id)
    if not record:
        raise HTTPException(status_code=404, detail="Project not found")
    project = record["project"]
    results: dict[str, str] = {}
    for deliverable in req.deliverables:
        system, user = build_prompts(deliverable, project.intake)
        results[deliverable.value] = await registry.generate(req.model, user, system)
    response = GenerateResponse(**results)
    storage.save_deliverables(project_id, response)
    return response
```

- [ ] **Step 4: Run all backend tests**

```bash
pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_routes.py
git commit -m "feat: add project CRUD and generate endpoints — backend complete"
```

---

## Task 8: Frontend Scaffold

**Files:**

- Create: `frontend/` (Vite project)
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tailwind.config.ts`
- Create: `frontend/src/test/setup.ts`

- [ ] **Step 1: Scaffold Vite + TypeScript project**

From the repo root (`BuildBrief/`):

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

Expected: `frontend/` directory with `src/`, `package.json`, `vite.config.ts`, `index.html`.

- [ ] **Step 2: Install Tailwind CSS**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: Replace `frontend/tailwind.config.js` with `frontend/tailwind.config.ts`**

Delete the generated `.js` file and create:

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

- [ ] **Step 4: Replace `frontend/src/index.css` contents**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Install runtime dependencies**

```bash
npm install react-markdown remark-gfm sonner
```

- [ ] **Step 6: Install test dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 7: Replace `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 8: Create `frontend/src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 9: Add `"test"` script to `frontend/package.json`**

In the `"scripts"` section add:

```json
"test": "vitest"
```

- [ ] **Step 10: Replace `frontend/src/App.tsx` with a placeholder**

```typescript
export default function App() {
  return <div className="p-4 text-gray-700">BuildBrief</div>
}
```

- [ ] **Step 11: Verify the dev server starts**

```bash
npm run dev
```

Expected: `Local: http://localhost:5173/` with no console errors. Kill with Ctrl+C.

- [ ] **Step 12: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: scaffold frontend with Vite, Tailwind, vitest"
```

---

## Task 9: TypeScript Types + API Client

**Files:**

- Create: `frontend/src/types.ts`
- Create: `frontend/src/api.ts`
- Create: `frontend/src/test/api.test.ts`

- [ ] **Step 1: Write the failing tests**

`frontend/src/test/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getModels, createProject, generateDeliverables } from '../api'

const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => mockFetch.mockReset())

describe('getModels', () => {
  it('returns model list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: ['lmstudio/llama-3'] }),
    })
    const models = await getModels()
    expect(models).toEqual(['lmstudio/llama-3'])
    expect(mockFetch).toHaveBeenCalledWith('/api/models')
  })

  it('returns empty array when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    const models = await getModels()
    expect(models).toEqual([])
  })
})

describe('createProject', () => {
  it('posts intake and returns id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'abc-123' }),
    })
    const id = await createProject({ title: 'Test', description: 'Desc', target_users: 'Devs' })
    expect(id).toBe('abc-123')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('generateDeliverables', () => {
  it('posts model and deliverables, returns content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ spec: '# Spec', implementation_plan: null, agent_prompt: null }),
    })
    const result = await generateDeliverables('proj-id', 'lmstudio/llama-3', ['spec'])
    expect(result.spec).toBe('# Spec')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend
npm test -- --run src/test/api.test.ts
```

Expected: `Error: Cannot find module '../api'`

- [ ] **Step 3: Write `frontend/src/types.ts`**

```typescript
export type Platform = 'web' | 'mobile' | 'desktop' | 'cli'
export type Complexity = 'simple' | 'medium' | 'complex'
export type DeliverableType = 'spec' | 'implementation_plan' | 'agent_prompt'

export interface IntakeFormData {
  title: string
  description: string
  target_users: string
  platform: Platform | ''
  tech_preferences: string
  complexity: Complexity | ''
  constraints: string
  extra_context: string
}

export interface GenerateResponse {
  spec: string | null
  implementation_plan: string | null
  agent_prompt: string | null
}

export const DELIVERABLE_LABELS: Record<DeliverableType, string> = {
  spec: 'Specification Doc',
  implementation_plan: 'Implementation Plan',
  agent_prompt: 'Agent Prompt',
}
```

- [ ] **Step 4: Write `frontend/src/api.ts`**

```typescript
import type { IntakeFormData, GenerateResponse } from './types'

export async function getModels(): Promise<string[]> {
  try {
    const resp = await fetch('/api/models')
    const data = await resp.json()
    return data.models as string[]
  } catch {
    return []
  }
}

export async function createProject(
  intake: Partial<IntakeFormData> & Pick<IntakeFormData, 'title' | 'description' | 'target_users'>,
): Promise<string> {
  const resp = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(intake),
  })
  if (!resp.ok) throw new Error('Failed to create project')
  const data = await resp.json()
  return data.id as string
}

export async function generateDeliverables(
  projectId: string,
  model: string,
  deliverables: string[],
): Promise<GenerateResponse> {
  const resp = await fetch(`/api/projects/${projectId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, deliverables }),
  })
  if (!resp.ok) throw new Error('Generation failed')
  return resp.json() as Promise<GenerateResponse>
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --run src/test/api.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/types.ts frontend/src/api.ts frontend/src/test/
git commit -m "feat: add TypeScript types and API client"
```

---

## Task 10: useWizard Hook

**Files:**

- Create: `frontend/src/hooks/useWizard.ts`
- Create: `frontend/src/test/useWizard.test.ts`

- [ ] **Step 1: Write the failing tests**

`frontend/src/test/useWizard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWizard } from '../hooks/useWizard'

describe('useWizard', () => {
  it('starts on step 1 with empty form', () => {
    const { result } = renderHook(() => useWizard())
    expect(result.current.step).toBe(1)
    expect(result.current.formData.title).toBe('')
    expect(result.current.formData.platform).toBe('')
  })

  it('next() advances step', () => {
    const { result } = renderHook(() => useWizard())
    act(() => result.current.next())
    expect(result.current.step).toBe(2)
  })

  it('next() does not advance past step 4', () => {
    const { result } = renderHook(() => useWizard())
    act(() => {
      result.current.next()
      result.current.next()
      result.current.next()
      result.current.next()
    })
    expect(result.current.step).toBe(4)
  })

  it('back() decrements step', () => {
    const { result } = renderHook(() => useWizard())
    act(() => result.current.next())
    act(() => result.current.back())
    expect(result.current.step).toBe(1)
  })

  it('back() on step 1 stays at step 1', () => {
    const { result } = renderHook(() => useWizard())
    act(() => result.current.back())
    expect(result.current.step).toBe(1)
  })

  it('setField updates the correct field', () => {
    const { result } = renderHook(() => useWizard())
    act(() => result.current.setField('title', 'My App'))
    expect(result.current.formData.title).toBe('My App')
  })

  it('setField does not affect other fields', () => {
    const { result } = renderHook(() => useWizard())
    act(() => result.current.setField('title', 'My App'))
    expect(result.current.formData.description).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend
npm test -- --run src/test/useWizard.test.ts
```

Expected: `Error: Cannot find module '../hooks/useWizard'`

- [ ] **Step 3: Create the hooks directory**

```bash
mkdir -p src/hooks
```

- [ ] **Step 4: Write `frontend/src/hooks/useWizard.ts`**

```typescript
import { useState } from 'react'
import type { IntakeFormData } from '../types'

const INITIAL_FORM: IntakeFormData = {
  title: '',
  description: '',
  target_users: '',
  platform: '',
  tech_preferences: '',
  complexity: '',
  constraints: '',
  extra_context: '',
}

export function useWizard() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [formData, setFormData] = useState<IntakeFormData>(INITIAL_FORM)

  function next() {
    setStep(s => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s))
  }

  function back() {
    setStep(s => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))
  }

  function setField<K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  return { step, formData, next, back, setField }
}
```

- [ ] **Step 5: Run to verify tests pass**

```bash
npm test -- --run src/test/useWizard.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/hooks/ frontend/src/test/useWizard.test.ts
git commit -m "feat: add useWizard hook"
```

---

## Task 11: Wizard Shell + Step 1

**Files:**

- Create: `frontend/src/components/wizard/WizardShell.tsx`
- Create: `frontend/src/components/wizard/Step1Idea.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create wizard components directory**

```bash
mkdir -p frontend/src/components/wizard
```

- [ ] **Step 2: Write `frontend/src/components/wizard/WizardShell.tsx`**

```typescript
import type { ReactNode } from 'react'

const STEP_LABELS = ['The Idea', 'Platform & Tech', 'Constraints', 'Model & Outputs']

interface Props {
  step: 1 | 2 | 3 | 4
  children: ReactNode
}

export function WizardShell({ step, children }: Props) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">BuildBrief</h1>

      <div className="mb-8 flex gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                i + 1 === step
                  ? 'bg-blue-600 text-white'
                  : i + 1 < step
                    ? 'bg-blue-200 text-blue-800'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i + 1}
            </div>
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write `frontend/src/components/wizard/Step1Idea.tsx`**

```typescript
import type { IntakeFormData } from '../../types'

interface Props {
  formData: IntakeFormData
  setField: <K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) => void
  onNext: () => void
}

export function Step1Idea({ formData, setField, onNext }: Props) {
  const canAdvance =
    formData.title.trim() && formData.description.trim() && formData.target_users.trim()

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">The Idea</h2>

      <div className="space-y-1">
        <label className="block text-sm font-medium">
          Project Title <span className="text-red-500">* Required</span>
        </label>
        <input
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={formData.title}
          onChange={e => setField('title', e.target.value)}
          placeholder="e.g. BuildBrief"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">
          Description <span className="text-red-500">* Required</span>
        </label>
        <textarea
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={4}
          value={formData.description}
          onChange={e => setField('description', e.target.value)}
          placeholder="What does it do? What problem does it solve?"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">
          Target Users <span className="text-red-500">* Required</span>
        </label>
        <input
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={formData.target_users}
          onChange={e => setField('target_users', e.target.value)}
          placeholder="e.g. Solo developers, students"
        />
      </div>

      <div className="flex justify-end">
        <button
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          onClick={onNext}
          disabled={!canAdvance}
        >
          Next
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update `frontend/src/App.tsx`**

```typescript
import { WizardShell } from './components/wizard/WizardShell'
import { Step1Idea } from './components/wizard/Step1Idea'
import { useWizard } from './hooks/useWizard'

export default function App() {
  const { step, formData, next, back, setField } = useWizard()

  return (
    <div className="min-h-screen bg-gray-50">
      <WizardShell step={step}>
        {step === 1 && <Step1Idea formData={formData} setField={setField} onNext={next} />}
        {step !== 1 && <p className="text-gray-400">Step {step} — coming soon</p>}
      </WizardShell>
    </div>
  )
}
```

- [ ] **Step 5: Verify in browser**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`. Confirm: wizard header with 4 step indicators; Step 1 form with three fields; Next button disabled until all three are filled. Kill with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: add wizard shell and Step 1 (The Idea)"
```

---

## Task 12: Steps 2 & 3

**Files:**

- Create: `frontend/src/components/wizard/Step2Platform.tsx`
- Create: `frontend/src/components/wizard/Step3Constraints.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write `frontend/src/components/wizard/Step2Platform.tsx`**

```typescript
import type { IntakeFormData, Platform, Complexity } from '../../types'

interface Props {
  formData: IntakeFormData
  setField: <K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) => void
  onNext: () => void
  onBack: () => void
}

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'web', label: 'Web' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'cli', label: 'CLI' },
]

const COMPLEXITIES: { value: Complexity; label: string }[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'medium', label: 'Medium' },
  { value: 'complex', label: 'Complex' },
]

export function Step2Platform({ formData, setField, onNext, onBack }: Props) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Platform & Tech</h2>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Platform</label>
        <div className="flex gap-2">
          {PLATFORMS.map(p => (
            <button
              key={p.value}
              onClick={() => setField('platform', p.value)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                formData.platform === p.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Tech Preferences</label>
        <input
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={formData.tech_preferences}
          onChange={e => setField('tech_preferences', e.target.value)}
          placeholder="e.g. React, Python, PostgreSQL"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Complexity</label>
        <div className="flex gap-2">
          {COMPLEXITIES.map(c => (
            <button
              key={c.value}
              onClick={() => setField('complexity', c.value)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                formData.complexity === c.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `frontend/src/components/wizard/Step3Constraints.tsx`**

```typescript
import type { IntakeFormData } from '../../types'

interface Props {
  formData: IntakeFormData
  setField: <K extends keyof IntakeFormData>(key: K, value: IntakeFormData[K]) => void
  onNext: () => void
  onBack: () => void
}

export function Step3Constraints({ formData, setField, onNext, onBack }: Props) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Constraints & Context</h2>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Constraints</label>
        <textarea
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          value={formData.constraints}
          onChange={e => setField('constraints', e.target.value)}
          placeholder="e.g. No cloud services, must run offline, budget limit"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Extra Context</label>
        <textarea
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          value={formData.extra_context}
          onChange={e => setField('extra_context', e.target.value)}
          placeholder="Anything else the model should know"
        />
      </div>

      <div className="flex justify-between">
        <button
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update `frontend/src/App.tsx`**

```typescript
import { WizardShell } from './components/wizard/WizardShell'
import { Step1Idea } from './components/wizard/Step1Idea'
import { Step2Platform } from './components/wizard/Step2Platform'
import { Step3Constraints } from './components/wizard/Step3Constraints'
import { useWizard } from './hooks/useWizard'

export default function App() {
  const { step, formData, next, back, setField } = useWizard()

  return (
    <div className="min-h-screen bg-gray-50">
      <WizardShell step={step}>
        {step === 1 && <Step1Idea formData={formData} setField={setField} onNext={next} />}
        {step === 2 && <Step2Platform formData={formData} setField={setField} onNext={next} onBack={back} />}
        {step === 3 && <Step3Constraints formData={formData} setField={setField} onNext={next} onBack={back} />}
        {step === 4 && <p className="text-gray-400">Step 4 — coming soon</p>}
      </WizardShell>
    </div>
  )
}
```

- [ ] **Step 4: Verify in browser — navigate steps 1–3**

```bash
cd frontend && npm run dev
```

Navigate steps 1 → 2 → 3. Back/Next work. Kill with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: add wizard Steps 2 (Platform & Tech) and 3 (Constraints)"
```

---

## Task 13: Step 4 — Model & Outputs

**Files:**

- Create: `frontend/src/components/wizard/Step4ModelOutputs.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write `frontend/src/components/wizard/Step4ModelOutputs.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getModels } from '../../api'
import type { DeliverableType } from '../../types'
import { DELIVERABLE_LABELS } from '../../types'

interface Props {
  onBack: () => void
  onGenerate: (model: string, deliverables: DeliverableType[]) => void
  isGenerating: boolean
}

const ALL_DELIVERABLES: DeliverableType[] = ['spec', 'implementation_plan', 'agent_prompt']

export function Step4ModelOutputs({ onBack, onGenerate, isGenerating }: Props) {
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [selected, setSelected] = useState<DeliverableType[]>(['spec'])

  useEffect(() => {
    getModels().then(list => {
      if (list.length === 0) {
        toast.error('No models available. Please connect to LM Studio or Ollama and try again.')
      } else {
        setModels(list)
        setSelectedModel(list[0])
      }
    })
  }, [])

  function toggle(d: DeliverableType) {
    setSelected(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]))
  }

  const canGenerate = selectedModel && selected.length > 0 && !isGenerating

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Model & Outputs</h2>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Model</label>
        {models.length === 0 ? (
          <p className="text-sm text-gray-400">No models found. Start LM Studio or Ollama.</p>
        ) : (
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
          >
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Deliverables</label>
        {ALL_DELIVERABLES.map(d => (
          <label key={d} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(d)}
              onChange={() => toggle(d)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            {DELIVERABLE_LABELS[d]}
          </label>
        ))}
      </div>

      <div className="flex justify-between">
        <button
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={onBack}
          disabled={isGenerating}
        >
          Back
        </button>
        <button
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          onClick={() => onGenerate(selectedModel, selected)}
          disabled={!canGenerate}
        >
          {isGenerating ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Generating with {selectedModel}…
            </>
          ) : (
            'Generate'
          )}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `frontend/src/App.tsx` with generation logic and results state**

```typescript
import { useState } from 'react'
import { Toaster } from 'sonner'
import { WizardShell } from './components/wizard/WizardShell'
import { Step1Idea } from './components/wizard/Step1Idea'
import { Step2Platform } from './components/wizard/Step2Platform'
import { Step3Constraints } from './components/wizard/Step3Constraints'
import { Step4ModelOutputs } from './components/wizard/Step4ModelOutputs'
import { ResultsView } from './components/results/ResultsView'
import { useWizard } from './hooks/useWizard'
import { createProject, generateDeliverables } from './api'
import type { DeliverableType, GenerateResponse } from './types'

export default function App() {
  const { step, formData, next, back, setField } = useWizard()
  const [isGenerating, setIsGenerating] = useState(false)
  const [results, setResults] = useState<GenerateResponse | null>(null)

  async function handleGenerate(model: string, deliverables: DeliverableType[]) {
    setIsGenerating(true)
    try {
      const projectId = await createProject(formData)
      const data = await generateDeliverables(projectId, model, deliverables)
      setResults(data)
    } finally {
      setIsGenerating(false)
    }
  }

  if (results) {
    return (
      <>
        <Toaster />
        <ResultsView results={results} onReset={() => setResults(null)} />
      </>
    )
  }

  return (
    <>
      <Toaster />
      <div className="min-h-screen bg-gray-50">
        <WizardShell step={step}>
          {step === 1 && <Step1Idea formData={formData} setField={setField} onNext={next} />}
          {step === 2 && <Step2Platform formData={formData} setField={setField} onNext={next} onBack={back} />}
          {step === 3 && <Step3Constraints formData={formData} setField={setField} onNext={next} onBack={back} />}
          {step === 4 && <Step4ModelOutputs onBack={back} onGenerate={handleGenerate} isGenerating={isGenerating} />}
        </WizardShell>
      </div>
    </>
  )
}
```

Note: `ResultsView` is imported here but created in the next task. The app will not compile until Task 14 is complete.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: add Step 4 with model picker, deliverable checkboxes, generation trigger"
```

---

## Task 14: Results View + Markdown Export

**Files:**

- Create: `frontend/src/components/results/ResultsView.tsx`
- Create: `frontend/src/components/results/DeliverableTab.tsx`
- Modify: `frontend/tailwind.config.ts` (add typography plugin)

- [ ] **Step 1: Create results components directory**

```bash
mkdir -p frontend/src/components/results
```

- [ ] **Step 2: Install `@tailwindcss/typography`**

```bash
cd frontend
npm install -D @tailwindcss/typography
```

- [ ] **Step 3: Update `frontend/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [require('@tailwindcss/typography')],
} satisfies Config
```

- [ ] **Step 4: Write `frontend/src/components/results/DeliverableTab.tsx`**

```typescript
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  label: string
  content: string
}

export function DeliverableTab({ label, content }: Props) {
  function handleExport() {
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${label.toLowerCase().replace(/\s+/g, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Export .md
        </button>
      </div>
      <div className="prose prose-sm max-w-none rounded-md border border-gray-100 bg-gray-50 p-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Write `frontend/src/components/results/ResultsView.tsx`**

```typescript
import { useState } from 'react'
import type { GenerateResponse, DeliverableType } from '../../types'
import { DELIVERABLE_LABELS } from '../../types'
import { DeliverableTab } from './DeliverableTab'

interface Props {
  results: GenerateResponse
  onReset: () => void
}

export function ResultsView({ results, onReset }: Props) {
  const available = (
    Object.entries(results) as [DeliverableType, string | null][]
  ).filter((entry): entry is [DeliverableType, string] => entry[1] !== null)

  const [activeTab, setActiveTab] = useState<DeliverableType>(available[0]?.[0] ?? 'spec')

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your Deliverables</h1>
        <button
          onClick={onReset}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Start Over
        </button>
      </div>

      <div className="mb-4 flex border-b border-gray-200">
        {available.map(([key]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === key
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {DELIVERABLE_LABELS[key]}
          </button>
        ))}
      </div>

      {available.map(([key, content]) =>
        activeTab === key ? (
          <DeliverableTab key={key} label={DELIVERABLE_LABELS[key]} content={content} />
        ) : null,
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run all frontend tests**

```bash
cd frontend
npm test -- --run
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
cd ..
git add frontend/src/components/results/ frontend/tailwind.config.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add results view with tabs, markdown rendering, and .md export"
```

---

## Task 15: End-to-End Smoke Test

No new files — manual verification only.

- [ ] **Step 1: Start the backend**

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Expected: `Application startup complete.`

- [ ] **Step 2: Start the frontend (new terminal)**

```bash
cd frontend
npm run dev
```

Expected: `Local: http://localhost:5173/`

- [ ] **Step 3: Run through the full flow**

1. Open `http://localhost:5173`
2. Step 1: fill Title, Description, Target Users → Next (button disabled until all three are filled)
3. Step 2: pick a platform and complexity → Next
4. Step 3: optionally add constraints → Next
5. Step 4: verify model dropdown populates (requires LM Studio or Ollama running with a model loaded); select deliverables → Generate
6. Confirm spinner appears with the model name
7. Confirm results view renders with tabs for each selected deliverable
8. Confirm markdown content renders (headers, lists, code blocks)
9. Click **Export .md** on a tab — file downloads
10. Click **Start Over** — returns to the wizard at Step 1

- [ ] **Step 4: Verify the no-models toast** (optional — only if no LLM provider is running)

Kill LM Studio/Ollama, reload the page, navigate to Step 4. Confirm toast appears: "No models available. Please connect to LM Studio or Ollama and try again." Confirm Generate button is disabled.

- [ ] **Step 5: Run the full backend test suite**

```bash
cd backend
pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 6: Run the full frontend test suite**

```bash
cd frontend
npm test -- --run
```

Expected: All tests PASS.

- [ ] **Step 7: Final commit**

```bash
cd ..
git add .
git commit -m "feat: BuildBrief MVP complete"
```
