import math
import random

from question_engine.parameters import sample_int


def generate(config: dict, rng: random.Random) -> dict:
    params = config.get("parameters", {})
    leg_a = sample_int(params.get("legA", "int[3,8]"), rng, 5)
    leg_b = sample_int(params.get("legB", "int[4,12]"), rng, 12)

    return {
        "legA": leg_a,
        "legB": leg_b,
        "questionLatex": f"\\text{{Triangle ABC is right angled at B. }} AB={leg_a},\\;BC={leg_b}",
    }


def solution(generated: dict, config: dict) -> dict:
    leg_a = generated["legA"]
    leg_b = generated["legB"]
    hypotenuse_squared = leg_a**2 + leg_b**2
    hypotenuse = math.sqrt(hypotenuse_squared)
    exact = f"\\sqrt{{{hypotenuse_squared}}}"

    return {
        "answer": str(hypotenuse),
        "answerLatex": exact,
        "workedSolution": [
            {
                "name": "pythagoras",
                "title": "Apply Pythagoras' theorem",
                "expression": f"AC^2 = {leg_a}^2 + {leg_b}^2",
                "latex": f"AC^2={leg_a}^2+{leg_b}^2={hypotenuse_squared}",
                "explanation": "Use the two perpendicular side lengths.",
            },
            {
                "name": "square_root",
                "title": "Find the hypotenuse",
                "expression": f"AC = sqrt({hypotenuse_squared})",
                "latex": f"AC={exact}",
                "explanation": "Take the positive square root for a length.",
            },
        ],
    }
