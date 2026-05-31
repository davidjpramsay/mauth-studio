import re
from typing import Any

import sympy as sp
from sympy.parsing.latex import parse_latex
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)


def parse_expression(expression: str, input_format: str = "plain") -> Any:
    source = expression.strip()
    if input_format == "latex":
        try:
            return parse_latex(source)
        except Exception:
            source = latex_to_plain(source)

    source = source.replace("^", "**")
    return parse_expr(source, transformations=TRANSFORMATIONS, evaluate=True)


def parse_equation_or_expression(expression: str, input_format: str = "plain") -> Any:
    if "=" not in expression:
        return parse_expression(expression, input_format)

    left, right = expression.split("=", 1)
    return sp.Eq(
        parse_expression(left, input_format),
        parse_expression(right, input_format),
    )


def latex_to_plain(latex: str) -> str:
    text = latex
    replacements = {
        "\\left": "",
        "\\right": "",
        "\\cdot": "*",
        "\\times": "*",
        "\\,": "",
        "{": "(",
        "}": ")",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)

    text = re.sub(r"\\frac\(([^()]+)\)\(([^()]+)\)", r"((\1)/(\2))", text)
    text = re.sub(r"([A-Za-z0-9)])\s*\^\s*\(([^()]+)\)", r"\1**(\2)", text)
    text = text.replace("^", "**")
    text = re.sub(r"(?<=\d)(?=[A-Za-z])", "*", text)
    text = re.sub(r"(?<=[A-Za-z0-9)])(?=\()", "*", text)
    text = text.replace("\\", "")
    return text
