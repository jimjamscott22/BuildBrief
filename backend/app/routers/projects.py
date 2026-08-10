import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app import storage
from app.models import (
    Deliverable,
    GenerationResult,
    ProjectSummary,
    ProjectWithDeliverables,
    RefinementResponse,
)
from app.schemas import GenerateRequest, ProjectCreate, ProjectUpdate, RefineRequest
from app.services import generation_stream
from app.services.deliverables import prepare_generation
from app.services.deliverables import generate_deliverables as generate_project_deliverables
from app.services.deliverables import refine_project

router = APIRouter()


def encode_sse(event: generation_stream.GenerationStreamEvent) -> bytes:
    data = json.dumps(event.data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event.event}\ndata: {data}\n\n".encode()

# Storage is synchronous (PyMySQL), so these handlers are declared `def` rather than
# `async def`. FastAPI runs plain `def` handlers in a threadpool; an `async def`
# handler would run its blocking queries on the event loop and stall every other
# request, including in-flight generations.


@router.post("", status_code=201)
def create_project(body: ProjectCreate):
    project = storage.create_project(body)
    return {"id": project.id}


@router.get("", response_model=list[ProjectSummary])
def list_projects(
    q: Annotated[str | None, Query(max_length=100)] = None,
    platform: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return storage.list_projects(q=q, platform=platform, limit=limit, offset=offset)


@router.get("/{project_id}", response_model=ProjectWithDeliverables)
def get_project(project_id: str):
    record = storage.get_project(project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return record


@router.put("/{project_id}", response_model=ProjectWithDeliverables)
def update_project(project_id: str, body: ProjectUpdate):
    project = storage.update_project(project_id, body)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    record = storage.get_project(project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return record


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str):
    deleted = storage.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return None


# The two handlers below await the model providers, so they stay `async def` and push
# their blocking storage calls to the threadpool instead.


@router.post("/{project_id}/generate", response_model=GenerationResult)
async def generate_deliverables(project_id: str, body: GenerateRequest):
    record = await run_in_threadpool(storage.get_project, project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await generate_project_deliverables(
        project=record.project,
        existing=record.deliverables,
        model=body.model,
        deliverable_keys=body.deliverables,
        preset=body.preset,
    )
    saved = await run_in_threadpool(
        storage.save_deliverables, project_id, result.deliverables
    )
    if saved is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return GenerationResult(deliverables=saved, failures=result.failures)


@router.post("/{project_id}/generate/stream")
async def stream_deliverables(project_id: str, body: GenerateRequest):
    record = await run_in_threadpool(storage.get_project, project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")

    prepare_generation(record.project, body.model, body.deliverables, body.preset)

    async def persist(key, content):
        partial = Deliverable(**{key: content})
        saved = await run_in_threadpool(storage.save_deliverables, project_id, partial)
        if saved is None:
            raise RuntimeError("Project disappeared before generation completed.")

    async def events() -> AsyncIterator[bytes]:
        async for event in generation_stream.stream_generation(
            record.project,
            body.model,
            body.deliverables,
            body.preset,
            persist,
        ):
            yield encode_sse(event)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{project_id}/refine", response_model=RefinementResponse)
async def refine_project_questions(project_id: str, body: RefineRequest):
    record = await run_in_threadpool(storage.get_project, project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return await refine_project(record.project, body.model)
