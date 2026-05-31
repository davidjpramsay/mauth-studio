import sympy as sp

from app.services.graphs import function_graph_config
from app.services.parser import parse_expression
from app.services.types import MathInput


def _build_response(
    original,
    result,
    operation: str,
    math_input: MathInput,
    explanation: str,
) -> dict:
    steps = []
    if math_input.include_steps:
        steps = [
            {
                "name": "start",
                "title": "Start",
                "expression": sp.sstr(original),
                "latex": sp.latex(original),
                "explanation": "Read the expression.",
            },
            {
                "name": operation,
                "title": operation.replace("_", " ").title(),
                "expression": sp.sstr(result),
                "latex": sp.latex(result),
                "explanation": explanation,
            },
        ]

    return {
        "result": sp.sstr(result),
        "latex": sp.latex(result),
        "steps": steps,
        "graphConfig": function_graph_config(original) if math_input.include_graph else None,
    }


def simplify_expression(math_input: MathInput) -> dict:
    expr = parse_expression(math_input.expression, math_input.input_format)
    result = sp.simplify(expr)
    return _build_response(expr, result, "simplify", math_input, "Collect equivalent terms.")


def expand_expression(math_input: MathInput) -> dict:
    expr = parse_expression(math_input.expression, math_input.input_format)
    result = sp.expand(expr)
    return _build_response(expr, result, "expand", math_input, "Apply distributive expansion.")


def factor_expression(math_input: MathInput) -> dict:
    expr = parse_expression(math_input.expression, math_input.input_format)
    result = sp.factor(expr)
    return _build_response(expr, result, "factor", math_input, "Rewrite the expression as factors.")
