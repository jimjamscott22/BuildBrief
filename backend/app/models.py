from datetime import datetime
from pydantic import BaseModel


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


class Deliverable(BaseModel):
    spec: str | None = None
    implementation_plan: str | None = None
    agent_prompt: str | None = None


class ProjectWithDeliverables(BaseModel):
    project: Project
    deliverables: Deliverable | None = None
