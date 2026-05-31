import sympy as sp

from app.services.types import MatrixInput


def matrix_operation(matrix_input: MatrixInput) -> dict:
    matrix = sp.Matrix(matrix_input.values)
    if matrix_input.operation == "determinant":
        result = matrix.det()
    elif matrix_input.operation == "inverse":
        result = matrix.inv()
    elif matrix_input.operation == "multiply" and matrix_input.other is not None:
        result = matrix * sp.Matrix(matrix_input.other)
    else:
        raise ValueError(f"Unsupported matrix operation: {matrix_input.operation}")

    return {
        "result": sp.sstr(result),
        "latex": sp.latex(result),
        "steps": [],
        "graphConfig": None,
    }
