from fastapi import APIRouter
from app.models import ModelsResponse
from app.providers import get_model_status

router = APIRouter()


@router.get("/models", response_model=ModelsResponse)
async def get_models():
    """Return combined list of available models from LM Studio and Ollama."""
    return await get_model_status()
