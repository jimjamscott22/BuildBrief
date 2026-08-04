import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRouter
from app import storage
from app.routers.models import router as models_router
from app.routers.projects import router as projects_router

load_dotenv()

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8001


def server_host() -> str:
    """
    Interface to listen on.

    The API has no authentication, so it must not reach a routable interface by
    default: anyone who can connect can read, edit, and delete every project and can
    occupy the GPU indefinitely. Set HOST=0.0.0.0 only behind an access control.
    """
    return os.getenv("HOST") or DEFAULT_HOST


def server_port() -> int:
    return int(os.getenv("PORT") or DEFAULT_PORT)


app = FastAPI(title="BuildBrief API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")


@api_router.get("/health")
def health_check():
    return {"status": "ok"}


api_router.include_router(models_router)
api_router.include_router(projects_router, prefix="/projects")

app.include_router(api_router)


@app.on_event("startup")
def startup() -> None:
    storage.init_db()

if __name__ == "__main__":
    uvicorn.run(app, host=server_host(), port=server_port())
