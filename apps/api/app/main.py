import os
from secrets import compare_digest

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import bootstrap  # noqa: F401
from app.api.agent import agent_discovery_router, agent_router
from app.api.diagram import router as diagram_router
from app.api.format import router as format_router
from app.api.math import router as math_router
from app.api.questions import router as questions_router
from app.api.storage import router as storage_router
from app.api.system import router as system_router
from app.api.tests import router as tests_router

app = FastAPI(title="Mauth Studio API", version="0.1.0")


@app.middleware("http")
async def authenticate_local_api(request: Request, call_next):
    expected_token = os.environ.get("MAUTH_AGENT_TOKEN", "").strip()
    public_api_paths = {"/api/health", "/api/system/status"}
    protected_api = request.url.path.startswith("/api/") and request.url.path not in public_api_paths
    if expected_token and protected_api:
        authorization = request.headers.get("Authorization", "")
        scheme, _, supplied_token = authorization.partition(" ")
        authenticated = (
            scheme.lower() == "bearer" and bool(supplied_token) and compare_digest(supplied_token, expected_token)
        )
        if not authenticated:
            return JSONResponse(
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
                content={
                    "success": False,
                    "code": "AGENT_AUTH_REQUIRED"
                    if request.url.path.startswith("/api/agent/")
                    else "API_AUTH_REQUIRED",
                    "error": "This Mauth local API requires the private token from the current desktop runtime.",
                    "setupLink": "/agent-docs",
                },
            )
    return await call_next(request)


LOCAL_DEV_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://0.0.0.0:5173",
        "http://[::1]:5173",
    ],
    allow_origin_regex=LOCAL_DEV_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(math_router, prefix="/api/math", tags=["math"])
app.include_router(questions_router, prefix="/api/questions", tags=["questions"])
app.include_router(tests_router, prefix="/api/tests", tags=["tests"])
app.include_router(format_router, prefix="/api/format", tags=["formatting"])
app.include_router(diagram_router, prefix="/api/diagram", tags=["diagram"])
app.include_router(storage_router, prefix="/api/storage", tags=["storage"])
app.include_router(system_router, prefix="/api/system", tags=["system"])
app.include_router(agent_router, prefix="/api/agent/current", tags=["agent"])
app.include_router(agent_discovery_router, tags=["agent"])


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
