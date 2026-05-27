import sympy as sp

from app.services.parser import parse_equation_or_expression
from app.services.types import MathInput


def solve_expression(math_input: MathInput) -> dict:
    parsed = parse_equation_or_expression(math_input.expression, math_input.input_format)
    variable = sp.Symbol(math_input.variable)
    solutions = sp.solve(parsed, variable)
    steps = []
    if math_input.include_steps:
        steps = [
            {
                "name": "solve",
                "title": "Solve",
                "expression": sp.sstr(solutions),
                "latex": sp.latex(solutions),
                "explanation": f"Solve for {math_input.variable}.",
            }
        ]

    return {
        "result": sp.sstr(solutions),
        "latex": sp.latex(solutions),
        "steps": steps,
        "graphConfig": None,
    }
