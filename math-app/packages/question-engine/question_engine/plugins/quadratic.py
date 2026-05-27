import random

import sympy as sp

from question_engine.parameters import sample_int


def _text_expression(expr) -> str:
    return sp.sstr(expr).replace("**", "^").replace("*", "")


def _non_zero_sample(spec: str, rng: random.Random, fallback: int) -> int:
    value = 0
    attempts = 0
    while value == 0 and attempts < 20:
        value = sample_int(spec, rng, fallback)
        attempts += 1
    return value or fallback


def generate(config: dict, rng: random.Random) -> dict:
    x = sp.Symbol("x")
    params = config.get("parameters", {})
    root_1 = _non_zero_sample(params.get("root1", "int[-5,5]"), rng, -2)
    root_2 = _non_zero_sample(params.get("root2", "int[-5,5]"), rng, 3)
    expression = sp.expand((x - root_1) * (x - root_2))

    return {
        "expression": _text_expression(expression),
        "sourceExpression": sp.sstr(expression),
        "expressionLatex": sp.latex(expression),
        "questionLatex": "\\text{Factorise: }" + sp.latex(expression),
        "root1": root_1,
        "root2": root_2,
    }


def solution(generated: dict, config: dict) -> dict:
    expression = sp.sympify(generated["sourceExpression"])
    answer = sp.factor(expression)
    root_1 = generated["root1"]
    root_2 = generated["root2"]

    return {
        "answer": sp.sstr(answer),
        "answerLatex": sp.latex(answer),
        "workedSolution": [
            {
                "name": "factor_pair",
                "title": "Find the factor pair",
                "expression": f"{root_1}, {root_2}",
                "latex": f"{root_1}, {root_2}",
                "explanation": "Use the roots to form linear factors.",
            },
            {
                "name": "factor",
                "title": "Write the factors",
                "expression": sp.sstr(answer),
                "latex": sp.latex(answer),
                "explanation": "Write the quadratic as a product of two linear factors.",
            },
        ],
        "graphConfig": {
            "type": "function",
            "expression": sp.sstr(expression),
            "latex": sp.latex(expression),
            "xMin": -10,
            "xMax": 10,
            "yMin": -10,
            "yMax": 10,
            "metadata": {"roots": [root_1, root_2]},
        },
    }
