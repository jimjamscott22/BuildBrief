from typing import Literal

from pydantic import BaseModel

DeliverableKey = Literal["spec", "implementation_plan", "agent_prompt"]
Platform = Literal["web", "mobile", "desktop", "cli"]
Complexity = Literal["simple", "medium", "complex"]


class ProjectCreate(BaseModel):
    title: str
    description: str
    target_users: str
    platform: Platform = "web"
    tech_preferences: str = ""
    complexity: Complexity = "medium"
    constraints: str = ""
    extra_context: str = ""


class ProjectUpdate(ProjectCreate):
    pass


class GenerateRequest(BaseModel):
    model: str  # e.g. "lmstudio/llama-3" or "ollama/mistral"
    deliverables: list[DeliverableKey]
    preset: str | None = None


class RefineRequest(BaseModel):
    model: str
