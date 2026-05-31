import json
from collections.abc import Iterable
from pathlib import Path

import sympy as sp
from sympy.parsing.sympy_parser import convert_xor, parse_expr, standard_transformations

TRANSFORMATIONS = standard_transformations + (convert_xor,)


class MarkingEngine:
    def __init__(self, config_dir: Path):
        self.config_dir = config_dir
        self.configs = self._load_configs()

    def mark_answer(
        self,
        expected: str,
        submitted: str,
        config_id: str = "default",
        submitted_steps: Iterable[str] | None = None,
    ) -> dict:
        config = self.configs[config_id]
        submitted_step_names = set(submitted_steps or [])
        step_breakdown = []
        awarded = 0

        for step in config.get("steps", []):
            marks = int(step.get("marks", 0))
            gained = marks if step["name"] in submitted_step_names else 0
            awarded += gained
            step_breakdown.append({"name": step["name"], "marks": marks, "awarded": gained})

        accuracy_marks = int(config.get("accuracyMarks", 1))
        is_equivalent = (
            self.equivalent(expected, submitted) if config.get("equivalence", True) else expected == submitted
        )
        if is_equivalent:
            awarded += accuracy_marks

        available = sum(item["marks"] for item in step_breakdown) + accuracy_marks
        return {
            "awarded": awarded,
            "available": available,
            "equivalent": is_equivalent,
            "breakdown": [
                *step_breakdown,
                {"name": "accuracy", "marks": accuracy_marks, "awarded": accuracy_marks if is_equivalent else 0},
            ],
        }

    @staticmethod
    def equivalent(expected: str, submitted: str) -> bool:
        try:
            expected_expr = parse_expr(expected.replace("^", "**"), transformations=TRANSFORMATIONS)
            submitted_expr = parse_expr(submitted.replace("^", "**"), transformations=TRANSFORMATIONS)
            return sp.simplify(expected_expr - submitted_expr) == 0
        except Exception:
            return expected.strip() == submitted.strip()

    def _load_configs(self) -> dict:
        configs = {}
        for path in sorted(self.config_dir.glob("*.json")):
            with path.open("r", encoding="utf-8") as handle:
                config = json.load(handle)
            configs[config["id"]] = config
        return configs
