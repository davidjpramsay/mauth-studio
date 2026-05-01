import sympy as sp

from app.services.graphs import function_graph_config
from app.services.parser import parse_expression
from app.services.types import MathInput


def differentiate_expression(math_input: MathInput) -> dict:
    expr = parse_expression(math_input.expression, math_input.input_format)
    variable = sp.Symbol(math_input.variable)
    result = sp.diff(expr, variable)
    steps = []
    if math_input.include_steps:
        steps = [
            {
                "name": "differentiate",
                "title": "Differentiate",
                "expression": sp.sstr(result),
                "latex": sp.latex(result),
                "explanation": f"Differentiate term-by-term with respect to {math_input.variable}.",
            }
        ]

    return {
        "result": sp.sstr(result),
        "latex": sp.latex(result),
        "steps": steps,
        "graphConfig": function_graph_config(expr) if math_input.include_graph else None,
    }


def integrate_expression(math_input: MathInput) -> dict:
    expr = parse_expression(math_input.expression, math_input.input_format)
    variable = sp.Symbol(math_input.variable)
    result = sp.integrate(expr, variable)
    steps = []
    if math_input.include_steps:
        steps = [
            {
                "name": "integrate",
                "title": "Integrate",
                "expression": sp.sstr(result),
                "latex": sp.latex(result),
                "explanation": f"Integrate term-by-term with respect to {math_input.variable}.",
            }
        ]

    return {
        "result": sp.sstr(result),
        "latex": sp.latex(result),
        "steps": steps,
        "graphConfig": function_graph_config(expr) if math_input.include_graph else None,
    }
