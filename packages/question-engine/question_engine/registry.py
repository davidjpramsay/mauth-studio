import importlib
import json
import random
from collections.abc import Callable
from pathlib import Path
from typing import Any


class QuestionRegistry:
    def __init__(self, config_dir: Path):
        self.config_dir = config_dir
        self._configs = self._load_configs()

    def list_types(self) -> list:
        return sorted(self._configs.keys())

    def get_config(self, question_type: str) -> dict:
        if question_type not in self._configs:
            raise KeyError(f"Unknown question type: {question_type}")
        return self._configs[question_type]

    def generate(
        self,
        question_type: str,
        seed: int | None = None,
        formatting_id: str = "default",
        marking_id: str = "default",
    ) -> dict:
        config = self.get_config(question_type)
        rng = random.Random(seed)
        generator = self._load_callable(config["generator"])
        solution = self._load_callable(config["solution"])

        generated = generator(config, rng)
        solved = solution(generated, config)
        marks = config.get("marks", {})
        total_marks = sum(int(value) for value in marks.values())
        diagram = (
            solved.get("diagram")
            or generated.get("diagram")
            or self._format_template_value(config.get("diagram"), generated)
        )
        content_blocks = list(solved.get("contentBlocks") or generated.get("contentBlocks") or [])
        if diagram:
            content_blocks.append(
                {
                    "kind": "diagram",
                    "diagramAlign": diagram.get("diagramAlign", "center"),
                    "graphConfig": {
                        "type": diagram.get("type", "geometricConstruction"),
                        "data": diagram.get("data", {}),
                        "style": diagram.get("style", "school"),
                        "options": diagram.get("options", {}),
                        "widthPx": diagram.get("options", {}).get("width", 420),
                        "heightPx": diagram.get("options", {}).get("height", 300),
                    },
                }
            )

        return {
            "id": config["id"],
            "type": config["id"],
            "section": config.get("section", "Questions"),
            "questionText": config["template"].format(**generated),
            "questionLatex": generated["questionLatex"],
            "contentBlocks": content_blocks,
            "answer": solved["answer"],
            "answerLatex": solved["answerLatex"],
            "workedSolution": solved["workedSolution"],
            "marksBreakdown": marks,
            "totalMarks": total_marks,
            "graphConfig": solved.get("graphConfig"),
            "diagram": diagram,
            "formatting": formatting_id,
            "marking": marking_id,
            "metadata": {
                "seed": seed,
                "configVersion": config.get("version", 1),
            },
        }

    def _load_configs(self) -> dict[str, dict]:
        configs = {}
        for path in sorted(self.config_dir.glob("*.json")):
            with path.open("r", encoding="utf-8") as handle:
                config = json.load(handle)
            configs[config["id"]] = config
        return configs

    @staticmethod
    def _load_callable(dotted_path: str) -> Callable:
        module_name, func_name = dotted_path.rsplit(".", 1)
        module = importlib.import_module(module_name)
        return getattr(module, func_name)

    @classmethod
    def _format_template_value(cls, value: Any, context: dict) -> Any:
        if isinstance(value, str):
            try:
                return value.format(**context)
            except KeyError:
                return value
        if isinstance(value, list):
            return [cls._format_template_value(item, context) for item in value]
        if isinstance(value, dict):
            return {key: cls._format_template_value(item, context) for key, item in value.items()}
        return value
