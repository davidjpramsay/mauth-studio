import random

import sympy as sp

from question_engine.parameters import sample_int


def _text_expression(expr) -> str:
    return sp.sstr(expr).replace("**", "^").replace("*", "")


def generate(config: dict, rng: random.Random) -> dict:
    x = sp.Symbol("x")
    params = config.get("parameters", {})
    a = sample_int(params.get("a", "int[1,5]"), rng, 2) or 2
    b = sample_int(params.get("b", "int[-5,5]"), rng, -3)
    c = sample_int(params.get("c", "int[-10,10]"), rng, 4)
    expression = a * x**3 + b * x**2 + c * x

    return {
        "expression": _text_expression(expression),
        "sourceExpression": sp.sstr(expression),
        "expressionLatex": sp.latex(expression),
        "questionLatex": "\\text{Differentiate: }" + sp.latex(expression),
        "variable": "x",
    }


def solution(generated: dict, config: dict) -> dict:
    x = sp.Symbol(generated.get("variable", "x"))
    expression = sp.sympify(generated["sourceExpression"])
    derivative = sp.diff(expression, x)

    return {
        "answer": sp.sstr(derivative),
        "answerLatex": sp.latex(derivative),
        "workedSolution": [
            {
                "name": "power_rule",
                "title": "Apply the power rule",
                "expression": sp.sstr(derivative),
                "latex": sp.latex(derivative),
                "explanation": "Differentiate each term using d/dx ax^n = anx^(n-1).",
            }
        ],
        "graphConfig": {
            "type": "tangent",
            "expression": sp.sstr(expression),
            "latex": sp.latex(expression),
            "xMin": -5,
            "xMax": 5,
            "yMin": -10,
            "yMax": 10,
            "metadata": {"derivative": sp.sstr(derivative), "point": 1},
        },
    }
