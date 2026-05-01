from fastapi import APIRouter
from question_engine.registry import QuestionRegistry

from app.bootstrap import CONFIG_ROOT
from app.models.schemas import QuestionGenerateRequest

router = APIRouter()
registry = QuestionRegistry(CONFIG_ROOT / "question-types")


@router.post("/generate")
def generate_question(request: QuestionGenerateRequest) -> dict:
    return registry.generate(
        request.type,
        seed=request.seed,
        formatting_id=request.formatting,
        marking_id=request.marking,
    )
