from fastapi import APIRouter
from formatting_engine.engine import FormattingEngine

from app.bootstrap import CONFIG_ROOT
from app.models.schemas import FormatRenderRequest

router = APIRouter()
formatting_engine = FormattingEngine(CONFIG_ROOT / "formatting")


@router.post("/render")
def render_format(request: FormatRenderRequest) -> dict:
    test = {
        "title": request.title,
        "questions": request.questions,
        "sections": [{"title": "Questions", "questions": request.questions}],
        "totalMarks": sum(question.get("totalMarks", 0) for question in request.questions),
    }
    return formatting_engine.render_test(test, request.formatting)
