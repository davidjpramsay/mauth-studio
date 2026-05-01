from dataclasses import dataclass


@dataclass(frozen=True)
class MathInput:
    expression: str
    input_format: str = "plain"
    variable: str = "x"
    include_steps: bool = True
    include_graph: bool = False


@dataclass(frozen=True)
class MatrixInput:
    values: list
    operation: str
    other: list | None = None
