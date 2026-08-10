import asyncio
from dataclasses import dataclass

from fastapi import HTTPException

from app import providers
from app.models import (
    Deliverable,
    DeliverableFailure,
    GenerationResult,
    Project,
    RefinementResponse,
)
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


def _as_http_exception(error: BaseException, label: str) -> HTTPException:
    if isinstance(error, HTTPException):
        return error
    return HTTPException(
        status_code=502,
        detail=f"LLM generation failed while creating {label}.",
    )


def prepare_generation(
    project: Project,
    model: str,
    deliverable_keys: list[DeliverableKey],
    preset: str | None,
) -> dict[DeliverableKey, str]:
    if not deliverable_keys:
        raise HTTPException(status_code=400, detail="Select at least one deliverable.")
    try:
        providers.split_model_id(model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    preset_instruction = ""
    if preset:
        preset_instruction = PRESET_INSTRUCTIONS.get(preset, "")
        if not preset_instruction:
            raise HTTPException(status_code=400, detail=f"Unknown preset: {preset}")

    context = system_context(project)
    prompts = {}
    for key in deliverable_keys:
        parts = [context]
        if preset_instruction:
            parts.append(f"Preset guidance: {preset_instruction}")
        parts.append(DELIVERABLE_PROMPTS[key].instruction)
        prompts[key] = "\n\n".join(parts)
    return prompts


async def generate_deliverables(
    project: Project,
    existing: Deliverable | None,
    model: str,
    deliverable_keys: list[DeliverableKey],
    preset: str | None = None,
) -> GenerationResult:
    prompts = prepare_generation(project, model, deliverable_keys, preset)
    base = existing.model_dump() if existing else Deliverable().model_dump()

    async def run_one(key: DeliverableKey) -> tuple[DeliverableKey, str]:
        prompt_config = DELIVERABLE_PROMPTS[key]
        try:
            result = await providers.generate(model, prompts[key])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"LLM generation failed while creating {prompt_config.label}.",
            ) from exc
        return key, result

    # return_exceptions keeps one failing deliverable from discarding the others.
    # A local model can spend minutes on each, so partial output is still worth saving.
    outcomes = await asyncio.gather(
        *(run_one(key) for key in deliverable_keys),
        return_exceptions=True,
    )

    failures: list[DeliverableFailure] = []
    first_error: BaseException | None = None

    for key, outcome in zip(deliverable_keys, outcomes):
        label = DELIVERABLE_PROMPTS[key].label
        if isinstance(outcome, BaseException):
            if first_error is None:
                first_error = outcome
            failures.append(
                DeliverableFailure(
                    deliverable=key,
                    label=label,
                    message=_as_http_exception(outcome, label).detail,
                )
            )
            continue
        _, value = outcome
        base[key] = value

    # Nothing came back at all: surface the original error rather than reporting
    # a success that generated no new content.
    if len(failures) == len(deliverable_keys) and first_error is not None:
        raise _as_http_exception(first_error, failures[0].label)

    return GenerationResult(deliverables=Deliverable(**base), failures=failures)


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
