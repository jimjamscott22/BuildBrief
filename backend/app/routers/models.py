from fastapi import APIRouter
from app.providers import list_all_models

router = APIRouter()


@router.get("/models")
async def get_models():
    """Return combined list of available models from LM Studio and Ollama."""
    models = await list_all_models()
    return {"models": models}
