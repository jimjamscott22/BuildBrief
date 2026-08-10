import asyncio
import json

import httpx
import pytest

from app import providers


async def collect(stream):
    return [chunk async for chunk in stream]


def async_client_for(lines: list[str], captured: dict):
    client_class = httpx.AsyncClient

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = json.loads(request.content)
        body = "\n".join(lines) + "\n"
        return httpx.Response(200, text=body)

    transport = httpx.MockTransport(handler)
    return lambda **kwargs: client_class(transport=transport, **kwargs)


def test_lmstudio_stream_yields_content_deltas(monkeypatch):
    captured = {}
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        async_client_for(
            [
                'data: {"choices":[{"delta":{"role":"assistant"}}]}',
                'data: {"choices":[{"delta":{"content":"# Spec"}}]}',
                'data: {"choices":[{"delta":{"content":"\\nBody"}}]}',
                "data: [DONE]",
            ],
            captured,
        ),
    )
    try:
        chunks = asyncio.run(collect(providers.lmstudio.stream("model", "prompt")))
    finally:
        monkeypatch.setattr(providers.httpx, "AsyncClient", real_client)

    assert chunks == ["# Spec", "\nBody"]
    assert captured["payload"]["stream"] is True


def test_ollama_stream_yields_response_until_done(monkeypatch):
    captured = {}
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        async_client_for(
            [
                '{"response":"Hello","done":false}',
                '{"response":" world","done":false}',
                '{"response":"","done":true}',
                '{"response":"ignored","done":false}',
            ],
            captured,
        ),
    )
    try:
        chunks = asyncio.run(collect(providers.ollama.stream("model", "prompt")))
    finally:
        monkeypatch.setattr(providers.httpx, "AsyncClient", real_client)

    assert chunks == ["Hello", " world"]
    assert captured["payload"]["stream"] is True


def test_stream_generate_routes_prefix_and_rejects_unknown(monkeypatch):
    async def fake_stream(model: str, prompt: str):
        yield f"{model}:{prompt}"

    monkeypatch.setattr(providers.ollama, "stream", fake_stream)
    assert asyncio.run(collect(providers.stream_generate("ollama/qwen", "brief"))) == [
        "qwen:brief"
    ]
    with pytest.raises(ValueError, match="Unknown model prefix"):
        asyncio.run(collect(providers.stream_generate("remote/qwen", "brief")))
