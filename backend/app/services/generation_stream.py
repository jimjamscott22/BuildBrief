import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass

from app import providers
from app.models import Project
from app.schemas import DeliverableKey
from app.services.deliverables import DELIVERABLE_PROMPTS, prepare_generation

PersistCompleted = Callable[[DeliverableKey, str], Awaitable[None]]


@dataclass(frozen=True)
class GenerationStreamEvent:
    event: str
    data: dict[str, object]


async def stream_generation(
    project: Project,
    model: str,
    deliverable_keys: list[DeliverableKey],
    preset: str | None,
    persist: PersistCompleted,
) -> AsyncIterator[GenerationStreamEvent]:
    prompts = prepare_generation(project, model, deliverable_keys, preset)
    queue: asyncio.Queue[GenerationStreamEvent] = asyncio.Queue()

    async def run_one(key: DeliverableKey) -> None:
        chunks: list[str] = []
        try:
            async for delta in providers.stream_generate(model, prompts[key]):
                chunks.append(delta)
                await queue.put(
                    GenerationStreamEvent("delta", {"deliverable": key, "delta": delta})
                )
            if not chunks:
                raise RuntimeError("The model returned no content.")
            await persist(key, "".join(chunks))
            await queue.put(GenerationStreamEvent("completed", {"deliverable": key}))
        except asyncio.CancelledError:
            raise
        except Exception:
            label = DELIVERABLE_PROMPTS[key].label
            await queue.put(
                GenerationStreamEvent(
                    "failed",
                    {
                        "deliverable": key,
                        "label": label,
                        "message": f"LLM generation failed while creating {label}.",
                    },
                )
            )

    yield GenerationStreamEvent("started", {"deliverables": deliverable_keys})
    tasks = [asyncio.create_task(run_one(key)) for key in deliverable_keys]
    settled = 0
    failures = []
    try:
        while settled < len(tasks):
            event = await queue.get()
            if event.event in {"completed", "failed"}:
                settled += 1
            if event.event == "failed":
                failures.append(event.data)
            yield event
        if len(failures) == len(tasks):
            yield GenerationStreamEvent(
                "error", {"message": "No deliverables were generated."}
            )
        else:
            yield GenerationStreamEvent("done", {"failures": failures})
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
