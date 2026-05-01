from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import bootstrap  # noqa: F401
from app.api.diagram import router as diagram_router
from app.api.format import router as format_router
from app.api.math import router as math_router
from app.api.questions import router as questions_router
from app.api.storage import router as storage_router
from app.api.tests import router as tests_router

app = FastAPI(title="Mauth Studio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(math_router, prefix="/api/math", tags=["math"])
app.include_router(questions_router, prefix="/api/questions", tags=["questions"])
app.include_router(tests_router, prefix="/api/tests", tags=["tests"])
app.include_router(format_router, prefix="/api/format", tags=["formatting"])
app.include_router(diagram_router, prefix="/api/diagram", tags=["diagram"])
app.include_router(storage_router, prefix="/api/storage", tags=["storage"])


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
