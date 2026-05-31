from fastapi import APIRouter

from app.models.schemas import MathRequest, MathResponse
from app.services.algebra import expand_expression, factor_expression, simplify_expression
from app.services.calculus import differentiate_expression, integrate_expression
from app.services.solver import solve_expression
from app.services.types import MathInput

router = APIRouter()


def _to_input(request: MathRequest) -> MathInput:
    return MathInput(
        expression=request.expression,
        input_format=request.inputFormat,
        variable=request.variable,
        include_steps=request.includeSteps,
        include_graph=request.includeGraph,
    )


@router.post("/simplify", response_model=MathResponse)
def simplify(request: MathRequest) -> dict:
    return simplify_expression(_to_input(request))


@router.post("/expand", response_model=MathResponse)
def expand(request: MathRequest) -> dict:
    return expand_expression(_to_input(request))


@router.post("/factor", response_model=MathResponse)
def factor(request: MathRequest) -> dict:
    return factor_expression(_to_input(request))


@router.post("/solve", response_model=MathResponse)
def solve(request: MathRequest) -> dict:
    return solve_expression(_to_input(request))


@router.post("/differentiate", response_model=MathResponse)
def differentiate(request: MathRequest) -> dict:
    return differentiate_expression(_to_input(request))


@router.post("/integrate", response_model=MathResponse)
def integrate(request: MathRequest) -> dict:
    return integrate_expression(_to_input(request))
