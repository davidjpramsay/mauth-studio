from collections import OrderedDict

from fastapi import APIRouter
from formatting_engine.engine import FormattingEngine
from question_engine.registry import QuestionRegistry

from app.bootstrap import CONFIG_ROOT
from app.models.schemas import TestBuildRequest, TestGenerateRequest
from app.services.test_rules import TestRuleEngine

router = APIRouter()
question_registry = QuestionRegistry(CONFIG_ROOT / "question-types")
formatting_engine = FormattingEngine(CONFIG_ROOT / "formatting")
test_rule_engine = TestRuleEngine(CONFIG_ROOT / "test-rules")


@router.post("/generate")
def generate_test(request: TestGenerateRequest) -> dict:
    questions = []
    sequence = 0
    for spec in request.questions:
        for _ in range(spec.count):
            seed = None if request.seed is None else request.seed + sequence
            questions.append(
                question_registry.generate(
                    spec.type,
                    seed=seed,
                    formatting_id=request.formatting,
                    marking_id=request.marking,
                )
            )
            sequence += 1

    total_marks = sum(question["totalMarks"] for question in questions)
    grouped = OrderedDict()
    for question in questions:
        section = question.get("section", "Questions")
        grouped.setdefault(section, []).append(question)

    test = {
        "title": request.title,
        "questions": questions,
        "sections": [{"title": title, "questions": section_questions} for title, section_questions in grouped.items()],
        "totalMarks": total_marks,
        "formatting": request.formatting,
        "marking": request.marking,
    }
    rendered = formatting_engine.render_test(test, request.formatting)
    return {
        **test,
        "renderedHtml": rendered["html"],
        "blocks": rendered["blocks"],
        "formattedSections": rendered["sections"],
        "formattingConfig": rendered["formatting"],
    }


@router.post("/build")
def build_test(request: TestBuildRequest) -> dict:
    test = test_rule_engine.build(request.model_dump())
    rendered = formatting_engine.render_test(test, request.formatting)
    return {
        **test,
        "renderedHtml": rendered["html"],
        "blocks": rendered["blocks"],
        "formattedSections": rendered["sections"],
        "formattingConfig": rendered["formatting"],
    }
