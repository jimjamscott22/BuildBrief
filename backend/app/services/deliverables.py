import asyncio
from dataclasses import dataclass

from fastapi import HTTPException

from app import providers
from app.models import Deliverable, Project, RefinementResponse
from app.schemas import DeliverableKey


@dataclass(frozen=True)
class DeliverablePrompt:
    label: str
    instruction: str


DELIVERABLE_PROMPTS: dict[DeliverableKey, DeliverablePrompt] = {
    "spec": DeliverablePrompt(
        label="Specification Document",
        instruction=(
            "You are a senior software architect. Using the project details above, write a detailed "
            "project specification document in Markdown. Include: overview, problem statement, goals, "
            "target users, core features, non-goals, MVP scope, data model, API plan, risks."
        ),
    ),
    "implementation_plan": DeliverablePrompt(
        label="Implementation Plan",
        instruction=(
            "You are a senior software engineer. Using the project details above, write a detailed "
            "implementation plan in Markdown. Include: phases, tasks per phase, milestones, required "
            "resources. Focus on practical steps to build the MVP."
        ),
    ),
    "agent_prompt": DeliverablePrompt(
        label="Agent Prompt",
        instruction=(
            "You are an AI prompt engineer. Using the project details above, write a comprehensive "
            "coding agent prompt in Markdown. The prompt should give an AI coding assistant everything "
            "it needs to begin implementing this project: context, goals, constraints, tech stack, and "
            "initial tasks."
        ),
    ),
}


PRESET_INSTRUCTIONS = {
    "mvp": "Optimize the output for a lean MVP that can be built and validated quickly.",
    "technical_spec": "Emphasize architecture, data flow, APIs, testing, and operational risks.",
    "agent_handoff": "Make the output especially concrete for a coding agent implementation handoff.",
    "student_project": "Keep the output educational, scoped, and achievable for a student portfolio project.",
    "startup_prototype": "Focus on product validation, iteration speed, and investor-demo clarity.",
}


def system_context(project: Project) -> str:
    return (
        f"Project: {project.title}\n"
        f"Description: {project.description}\n"
        f"Target users: {project.target_users}\n"
        f"Platform: {project.platform}\n"
        f"Tech preferences: {project.tech_preferences}\n"
        f"Complexity: {project.complexity}\n"
        f"Constraints: {project.constraints}\n"
        f"Extra context: {project.extra_context}"
    )


async def generate_deliverables(
    project: Project,
    existing: Deliverable | None,
    model: str,
    deliverable_keys: list[DeliverableKey],
    preset: str | None = None,
) -> Deliverable:
    if not deliverable_keys:
        raise HTTPException(status_code=400, detail="Select at least one deliverable.")

    preset_instruction = ""
    if preset:
        preset_instruction = PRESET_INSTRUCTIONS.get(preset, "")
        if not preset_instruction:
            raise HTTPException(status_code=400, detail=f"Unknown preset: {preset}")

    context = system_context(project)
    base = existing.model_dump() if existing else Deliverable().model_dump()

    async def run_one(key: DeliverableKey) -> tuple[DeliverableKey, str]:
        prompt_config = DELIVERABLE_PROMPTS[key]
        prompt_parts = [context]
        if preset_instruction:
            prompt_parts.append(f"Preset guidance: {preset_instruction}")
        prompt_parts.append(prompt_config.instruction)
        try:
            result = await providers.generate(model, "\n\n".join(prompt_parts))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"LLM generation failed while creating {prompt_config.label}.",
            ) from exc
        return key, result

    generated = await asyncio.gather(*(run_one(key) for key in deliverable_keys))
    for key, value in generated:
        base[key] = value
    return Deliverable(**base)


async def refine_project(project: Project, model: str) -> RefinementResponse:
    prompt = (
        f"{system_context(project)}\n\n"
        "Suggest five concise clarifying questions that would most improve the generated project plan. "
        "Return only a numbered list of questions."
    )
    try:
        content = await providers.generate(model, prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="LLM refinement failed.") from exc

    questions = [
        line.lstrip("0123456789. )-").strip()
        for line in content.splitlines()
        if line.strip()
    ]
    return RefinementResponse(questions=[q for q in questions if q][:5])
