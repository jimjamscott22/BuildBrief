import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app import providers, storage
from app.models import Deliverable, Project, ProjectWithDeliverables
from app.schemas import GenerateRequest, ProjectCreate

router = APIRouter()

DELIVERABLE_PROMPTS = {
    "spec": (
        "You are a senior software architect. Using the project details above, write a detailed "
        "project specification document in Markdown. Include: overview, problem statement, goals, "
        "target users, core features, non-goals, MVP scope, data model, API plan, risks."
    ),
    "implementation_plan": (
        "You are a senior software engineer. Using the project details above, write a detailed "
        "implementation plan in Markdown. Include: phases, tasks per phase, milestones, required "
        "resources. Focus on practical steps to build the MVP."
    ),
    "agent_prompt": (
        "You are an AI prompt engineer. Using the project details above, write a comprehensive "
        "coding agent prompt in Markdown. The prompt should give an AI coding assistant everything "
        "it needs to begin implementing this project: context, goals, constraints, tech stack, and "
        "initial tasks."
    ),
}


def _system_context(project: Project) -> str:
    lines = [
        f"Project: {project.title}",
        f"Description: {project.description}",
        f"Target users: {project.target_users}",
        f"Platform: {project.platform}",
        f"Complexity: {project.complexity}",
    ]
    if project.tech_preferences:
        lines.append(f"Tech preferences: {project.tech_preferences}")
    if project.constraints:
        lines.append(f"Constraints: {project.constraints}")
    if project.extra_context:
        lines.append(f"Extra context: {project.extra_context}")
    return "\n".join(lines)


@router.post("", status_code=201)
async def create_project(body: ProjectCreate):
    project_id = str(uuid.uuid4())
    project = Project(
        id=project_id,
        created_at=datetime.utcnow(),
        **body.model_dump(),
    )
    storage.projects[project_id] = project
    return {"id": project_id}


@router.get("/{project_id}", response_model=ProjectWithDeliverables)
async def get_project(project_id: str):
    project = storage.projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    deliverable = storage.deliverables.get(project_id)
    return ProjectWithDeliverables(project=project, deliverables=deliverable)


@router.post("/{project_id}/generate", response_model=Deliverable)
async def generate_deliverables(project_id: str, body: GenerateRequest):
    project = storage.projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    context = _system_context(project)

    # Start from existing deliverable or blank
    existing = storage.deliverables.get(project_id) or Deliverable()
    updates: dict = existing.model_dump()

    for deliverable_name in body.deliverables:
        instruction = DELIVERABLE_PROMPTS.get(deliverable_name)
        if instruction is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown deliverable: {deliverable_name}. "
                       f"Valid options: {list(DELIVERABLE_PROMPTS.keys())}",
            )
        prompt = f"{context}\n\n{instruction}"
        try:
            result = await providers.generate(body.model, prompt)
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail="LLM generation failed unexpectedly.") from exc
        updates[deliverable_name] = result

    deliverable = Deliverable(**updates)
    storage.deliverables[project_id] = deliverable
    return deliverable
