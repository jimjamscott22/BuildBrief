from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app import storage
from app.models import ProjectSummary, ProjectWithDeliverables, RefinementResponse
from app.schemas import GenerateRequest, ProjectCreate, ProjectUpdate, RefineRequest
from app.services.deliverables import generate_deliverables as generate_project_deliverables
from app.services.deliverables import refine_project

router = APIRouter()


@router.post("", status_code=201)
async def create_project(body: ProjectCreate):
    project = storage.create_project(body)
    return {"id": project.id}


@router.get("", response_model=list[ProjectSummary])
async def list_projects(
    q: Annotated[str | None, Query(max_length=100)] = None,
    platform: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return storage.list_projects(q=q, platform=platform, limit=limit, offset=offset)


@router.get("/{project_id}", response_model=ProjectWithDeliverables)
async def get_project(project_id: str):
    record = storage.get_project(project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return record


@router.put("/{project_id}", response_model=ProjectWithDeliverables)
async def update_project(project_id: str, body: ProjectUpdate):
    project = storage.update_project(project_id, body)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    record = storage.get_project(project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return record


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str):
    deleted = storage.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return None


@router.post("/{project_id}/generate", response_model=Deliverable)
async def generate_deliverables(project_id: str, body: GenerateRequest):
    record = storage.get_project(project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")

    generated = await generate_project_deliverables(
        project=record.project,
        existing=record.deliverables,
        model=body.model,
        deliverable_keys=body.deliverables,
        preset=body.preset,
    )
    deliverable = storage.save_deliverables(project_id, generated)
    if deliverable is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return deliverable


@router.post("/{project_id}/refine", response_model=RefinementResponse)
async def refine_project_questions(project_id: str, body: RefineRequest):
    record = storage.get_project(project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return await refine_project(record.project, body.model)
