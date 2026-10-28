"""Restricted symbolic maths parsing shared by the API and marking engine."""

import ast
import operator
import re

import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    standard_transformations,
    stringify_expr,
)


class InvalidMathExpression(ValueError):
    """The supplied expression is outside the supported mathematical grammar."""


_FUNCTIONS = {
    name: getattr(sp, name)
    for name in (
        "sin",
        "cos",
        "tan",
        "asin",
        "acos",
        "atan",
        "sinh",
        "cosh",
        "tanh",
        "asinh",
        "acosh",
        "atanh",
        "sqrt",
        "log",
        "ln",
        "exp",
        "Abs",
        "floor",
        "ceiling",
        "sec",
        "csc",
        "cot",
        "asec",
        "acsc",
        "acot",
        "factorial",
    )
}
_CONSTANTS = {"pi": sp.pi, "E": sp.E, "I": sp.I}
_BINARY = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
}
_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_SYMBOL = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")


def validate_symbolic_expression(expression: sp.Expr) -> sp.Expr:
    """Reject unbounded numeric powers and overly complex parser results."""
    for index, item in enumerate(sp.preorder_traversal(expression)):
        if index >= 512:
            raise InvalidMathExpression("Mathematical expression is too complex")
        if isinstance(item, sp.Integer) and abs(int(item)).bit_length() > 16384:
            raise InvalidMathExpression("Mathematical value is too large")
        if isinstance(item, sp.Pow) and item.exp.is_number and (item.exp.is_real is not True or abs(item.exp) > 1000):
            raise InvalidMathExpression("Exponent is too large")
    return expression


def parse_math_expression(source: str, *, implicit_multiplication: bool = True) -> sp.Expr:
    """Parse only arithmetic and approved functions without evaluating Python code."""
    source = source.strip()
    if (
        not source
        or len(source) > 512
        or any(character in source for character in ('"', "'", "\\", "[", "]", "{", "}", ";", "#"))
    ):
        raise InvalidMathExpression("Invalid mathematical expression")
    transformations = (
        standard_transformations
        + ((implicit_multiplication_application,) if implicit_multiplication else ())
        + (convert_xor,)
    )
    try:
        transformed = stringify_expr(source, {}, vars(sp), transformations)
        tree = ast.parse(transformed, mode="eval")
        if sum(1 for _ in ast.walk(tree)) > 512:
            raise InvalidMathExpression("Mathematical expression is too complex")
        return validate_symbolic_expression(_evaluate(tree.body))
    except InvalidMathExpression:
        raise
    except Exception as error:
        raise InvalidMathExpression("Invalid mathematical expression") from error


def _evaluate(node: ast.AST) -> sp.Expr:
    if isinstance(node, ast.BinOp) and type(node.op) in _BINARY:
        left, right = _evaluate(node.left), _evaluate(node.right)
        if isinstance(node.op, ast.Pow) and right.is_number and (right.is_real is not True or abs(right) > 1000):
            raise InvalidMathExpression("Exponent is too large")
        if (
            isinstance(node.op, ast.Pow)
            and left.is_Integer
            and right.is_Integer
            and right > 0
            and abs(int(left)).bit_length() * int(right) > 16384
        ):
            raise InvalidMathExpression("Mathematical value is too large")
        return _BINARY[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return _UNARY[type(node.op)](_evaluate(node.operand))
    if isinstance(node, ast.Name) and node.id in _CONSTANTS:
        return _CONSTANTS[node.id]
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Call) and not node.keywords:
        function = node.func
        if (
            isinstance(function.func, ast.Name)
            and function.func.id == "Function"
            and len(function.args) == 1
            and isinstance(function.args[0], ast.Constant)
            and isinstance(function.args[0].value, str)
            and _SYMBOL.fullmatch(function.args[0].value)
            and "__" not in function.args[0].value
            and not function.keywords
            and 1 <= len(node.args) <= 4
        ):
            return sp.Function(function.args[0].value)(*(_evaluate(argument) for argument in node.args))
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name) or node.keywords:
        raise InvalidMathExpression("Unsupported mathematical operation")
    name = node.func.id
    if name in {"Integer", "Float", "Symbol"} and len(node.args) == 1 and isinstance(node.args[0], ast.Constant):
        value = node.args[0].value
        if name == "Integer" and type(value) is int and len(str(value)) <= 100:
            return sp.Integer(value)
        if name == "Float" and isinstance(value, str) and len(value) <= 100:
            return sp.Float(value)
        if name == "Symbol" and isinstance(value, str) and _SYMBOL.fullmatch(value) and "__" not in value:
            return sp.Symbol(value)
        raise InvalidMathExpression("Invalid mathematical value")
    function = _FUNCTIONS.get(name)
    if function is None or not 1 <= len(node.args) <= (2 if name == "log" else 1):
        raise InvalidMathExpression("Unsupported mathematical function")
    arguments = [_evaluate(argument) for argument in node.args]
    if name == "factorial" and (
        arguments[0].is_integer is not True or arguments[0].is_number is not True or abs(arguments[0]) > 1000
    ):
        raise InvalidMathExpression("Factorial input is too large")
    return function(*arguments)
