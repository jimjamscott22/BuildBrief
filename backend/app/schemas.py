from pydantic import BaseModel


class ProjectCreate(BaseModel):
    title: str
    description: str
    target_users: str
    platform: str = "web"
    tech_preferences: str = ""
    complexity: str = "medium"
    constraints: str = ""
    extra_context: str = ""


class GenerateRequest(BaseModel):
    model: str  # e.g. "lmstudio/llama-3" or "ollama/mistral"
    deliverables: list[str]  # e.g. ["spec", "implementation_plan", "agent_prompt"]
