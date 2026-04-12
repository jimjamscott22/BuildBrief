"""
LLM provider abstraction.
Supports LM Studio (OpenAI-compatible) and Ollama (native API).
Both providers are probed at request time; unreachable providers are silently omitted.
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://localhost:1234")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
TIMEOUT = float(os.getenv("LLM_LIST_TIMEOUT", "5.0"))
GENERATE_TIMEOUT = float(os.getenv("LLM_GENERATE_TIMEOUT", "120.0"))


class LMStudioProvider:
    """OpenAI-compatible API at LM_STUDIO_URL."""

    async def list_models(self) -> list[str]:
        """Return model ids prefixed with 'lmstudio/'. Returns [] if provider is unreachable."""
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                r = await client.get(f"{LM_STUDIO_URL}/v1/models")
                r.raise_for_status()
                data = r.json()
                return [f"lmstudio/{m['id']}" for m in data.get("data", [])]
        except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError):
            return []

    async def generate(self, model_id: str, prompt: str) -> str:
        """
        Call /v1/chat/completions with the given prompt.
        model_id is the raw id WITHOUT the 'lmstudio/' prefix.
        Returns the assistant message content.
        Raises RuntimeError with a descriptive message on failure.
        """
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
        }
        try:
            async with httpx.AsyncClient(timeout=GENERATE_TIMEOUT) as client:
                r = await client.post(f"{LM_STUDIO_URL}/v1/chat/completions", json=payload)
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"]
        except httpx.ConnectError:
            raise RuntimeError("Cannot connect to LM Studio. Is it running?")
        except httpx.TimeoutException:
            raise RuntimeError(f"LM Studio timed out after {GENERATE_TIMEOUT:.0f}s. Try a smaller model.")
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"LM Studio returned HTTP {exc.response.status_code}.")


class OllamaProvider:
    """Ollama native API at OLLAMA_URL."""

    async def list_models(self) -> list[str]:
        """Return model names prefixed with 'ollama/'. Returns [] if provider is unreachable."""
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                r = await client.get(f"{OLLAMA_URL}/api/tags")
                r.raise_for_status()
                data = r.json()
                return [f"ollama/{m['name']}" for m in data.get("models", [])]
        except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError):
            return []

    async def generate(self, model_name: str, prompt: str) -> str:
        """
        Call /api/generate with the given prompt (non-streaming).
        model_name is the raw name WITHOUT the 'ollama/' prefix.
        Returns the response string.
        Raises RuntimeError with a descriptive message on failure.
        """
        payload = {"model": model_name, "prompt": prompt, "stream": False}
        try:
            async with httpx.AsyncClient(timeout=GENERATE_TIMEOUT) as client:
                r = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
                r.raise_for_status()
                return r.json()["response"]
        except httpx.ConnectError:
            raise RuntimeError("Cannot connect to Ollama. Is it running?")
        except httpx.TimeoutException:
            raise RuntimeError(f"Ollama timed out after {GENERATE_TIMEOUT:.0f}s. Try a smaller model.")
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"Ollama returned HTTP {exc.response.status_code}.")


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


async def generate(prefixed_model: str, prompt: str) -> str:
    """
    Route generation to the correct provider based on the 'lmstudio/' or 'ollama/' prefix.
    Raises ValueError for unknown prefixes.
    """
    if prefixed_model.startswith("lmstudio/"):
        return await lmstudio.generate(prefixed_model[len("lmstudio/"):], prompt)
    elif prefixed_model.startswith("ollama/"):
        return await ollama.generate(prefixed_model[len("ollama/"):], prompt)
    else:
        raise ValueError(f"Unknown model prefix in: {prefixed_model}")
