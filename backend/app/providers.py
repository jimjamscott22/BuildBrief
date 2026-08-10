"""
LLM provider abstraction.
Supports LM Studio (OpenAI-compatible) and Ollama (native API).
Both providers are probed at request time; unreachable providers are silently omitted.
"""

import json
import os
from collections.abc import AsyncIterator

import httpx
from dotenv import load_dotenv

from app.models import ModelsResponse, ProviderStatus

load_dotenv()

LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://localhost:1234")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
TIMEOUT = 5.0  # seconds for model listing; generation uses a longer timeout
GENERATION_TIMEOUT = httpx.Timeout(120.0, connect=5.0)


class LMStudioProvider:
    """OpenAI-compatible API at LM_STUDIO_URL."""

    async def list_models(self) -> list[str]:
        """Return model ids prefixed with 'lmstudio/'. Returns [] on any error."""
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                r = await client.get(f"{LM_STUDIO_URL}/v1/models")
                r.raise_for_status()
                data = r.json()
                return [f"lmstudio/{m['id']}" for m in data.get("data", [])]
        except Exception:
            return []

    async def status(self) -> ProviderStatus:
        models = await self.list_models()
        return ProviderStatus(
            id="lmstudio",
            label="LM Studio",
            available=bool(models),
            models=models,
            message=(
                f"{len(models)} model{'s' if len(models) != 1 else ''} available."
                if models
                else "LM Studio is not reachable at the configured URL."
            ),
        )

    async def generate(self, model_id: str, prompt: str) -> str:
        """
        Call /v1/chat/completions with the given prompt.
        model_id is the raw id WITHOUT the 'lmstudio/' prefix.
        Returns the assistant message content.
        """
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(f"{LM_STUDIO_URL}/v1/chat/completions", json=payload)
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

    async def stream(self, model_id: str, prompt: str) -> AsyncIterator[str]:
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=GENERATION_TIMEOUT) as client:
            async with client.stream(
                "POST", f"{LM_STUDIO_URL}/v1/chat/completions", json=payload
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    value = line.removeprefix("data:").strip()
                    if not value or value == "[DONE]":
                        continue
                    content = json.loads(value)["choices"][0]["delta"].get("content")
                    if content:
                        yield content


class OllamaProvider:
    """Ollama native API at OLLAMA_URL."""

    async def list_models(self) -> list[str]:
        """Return model names prefixed with 'ollama/'. Returns [] on any error."""
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                r = await client.get(f"{OLLAMA_URL}/api/tags")
                r.raise_for_status()
                data = r.json()
                return [f"ollama/{m['name']}" for m in data.get("models", [])]
        except Exception:
            return []

    async def status(self) -> ProviderStatus:
        models = await self.list_models()
        return ProviderStatus(
            id="ollama",
            label="Ollama",
            available=bool(models),
            models=models,
            message=(
                f"{len(models)} model{'s' if len(models) != 1 else ''} available."
                if models
                else "Ollama is not reachable at the configured URL."
            ),
        )

    async def generate(self, model_name: str, prompt: str) -> str:
        """
        Call /api/generate with the given prompt (non-streaming).
        model_name is the raw name WITHOUT the 'ollama/' prefix.
        Returns the response string.
        """
        payload = {"model": model_name, "prompt": prompt, "stream": False}
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
            r.raise_for_status()
            return r.json()["response"]

    async def stream(self, model_name: str, prompt: str) -> AsyncIterator[str]:
        payload = {"model": model_name, "prompt": prompt, "stream": True}
        async with httpx.AsyncClient(timeout=GENERATION_TIMEOUT) as client:
            async with client.stream(
                "POST", f"{OLLAMA_URL}/api/generate", json=payload
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    frame = json.loads(line)
                    content = frame.get("response")
                    if content:
                        yield content
                    if frame.get("done") is True:
                        break


lmstudio = LMStudioProvider()
ollama = OllamaProvider()


async def list_all_models() -> list[str]:
    """Probe both providers concurrently; return combined model list."""
    import asyncio
    lm_models, ol_models = await asyncio.gather(
        lmstudio.list_models(),
        ollama.list_models(),
    )
    return lm_models + ol_models


async def get_model_status() -> ModelsResponse:
    """Probe both providers concurrently; return model list plus per-provider status."""
    import asyncio
    statuses = await asyncio.gather(lmstudio.status(), ollama.status())
    return ModelsResponse(
        models=[model for status in statuses for model in status.models],
        providers=list(statuses),
    )


def split_model_id(prefixed_model: str):
    if prefixed_model.startswith("lmstudio/"):
        return lmstudio, prefixed_model.removeprefix("lmstudio/")
    if prefixed_model.startswith("ollama/"):
        return ollama, prefixed_model.removeprefix("ollama/")
    raise ValueError(f"Unknown model prefix in: {prefixed_model}")


async def generate(prefixed_model: str, prompt: str) -> str:
    """Route buffered generation to the provider identified by its prefix."""
    provider, model_id = split_model_id(prefixed_model)
    return await provider.generate(model_id, prompt)


async def stream_generate(prefixed_model: str, prompt: str) -> AsyncIterator[str]:
    """Stream generation deltas from the provider identified by its prefix."""
    provider, model_id = split_model_id(prefixed_model)
    async for delta in provider.stream(model_id, prompt):
        yield delta
