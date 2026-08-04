from datetime import datetime
from pydantic import BaseModel

from app.schemas import DeliverableKey


class Project(BaseModel):
    id: str
    title: str
    description: str
    target_users: str
    platform: str  # "web" | "mobile" | "desktop" | "cli"
    tech_preferences: str
    complexity: str  # "simple" | "medium" | "complex"
    constraints: str
    extra_context: str
    created_at: datetime
    updated_at: datetime


class Deliverable(BaseModel):
    spec: str | None = None
    implementation_plan: str | None = None
    agent_prompt: str | None = None


class ProjectSummary(BaseModel):
    id: str
    title: str
    description: str
    target_users: str
    platform: str
    complexity: str
    created_at: datetime
    updated_at: datetime
    has_spec: bool
    has_implementation_plan: bool
    has_agent_prompt: bool


class ProjectWithDeliverables(BaseModel):
    project: Project
    deliverables: Deliverable | None = None


class DeliverableFailure(BaseModel):
    """One requested deliverable that could not be generated."""

    deliverable: DeliverableKey
    label: str
    message: str


class GenerationResult(BaseModel):
    """
    Outcome of a generation request.

    `deliverables` holds everything that is now persisted, including outputs from
    earlier runs that were not regenerated. `failures` lists the requested keys that
    did not complete, so a partial success stays a success.
    """

    deliverables: Deliverable
    failures: list[DeliverableFailure] = []


class ProviderStatus(BaseModel):
    id: str
    label: str
    available: bool
    models: list[str]
    message: str


class ModelsResponse(BaseModel):
    models: list[str]
    providers: list[ProviderStatus]


class RefinementResponse(BaseModel):
    questions: list[str]
