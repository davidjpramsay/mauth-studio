import json
from pathlib import Path

DEFAULT_TEST_RULE_ID = "high_school_mathematics"
TEST_RULE_ALIASES = {
    "year10_algebra": DEFAULT_TEST_RULE_ID,
}


class TestRuleEngine:
    def __init__(self, config_dir: Path):
        self.config_dir = config_dir
        self.rules = self._load_rules()

    def build(self, request: dict) -> dict:
        requested_rule_id = request.get("testRule", DEFAULT_TEST_RULE_ID)
        rule_id = TEST_RULE_ALIASES.get(requested_rule_id, requested_rule_id)
        rule = self.rules[rule_id]
        supplied_sections = {section["title"]: section for section in request.get("sections", [])}
        sections = []
        all_questions = []

        for rule_section in rule.get("sections", []):
            title = rule_section["title"]
            supplied = supplied_sections.get(title, {"title": title, "questions": []})
            questions = [
                self._normalize_question(question, title, request) for question in supplied.get("questions", [])
            ]
            sections.append(
                {
                    "title": title,
                    "instructions": rule_section.get("instructions", ""),
                    "questions": questions,
                }
            )
            all_questions.extend(questions)

        extra_sections = [
            section
            for title, section in supplied_sections.items()
            if title not in {rule_section["title"] for rule_section in rule.get("sections", [])}
        ]
        for section in extra_sections:
            questions = [
                self._normalize_question(question, section["title"], request)
                for question in section.get("questions", [])
            ]
            sections.append({"title": section["title"], "instructions": "", "questions": questions})
            all_questions.extend(questions)

        total_marks = sum(question["totalMarks"] for question in all_questions)
        return {
            "title": request.get("title") or rule.get("title", "Worksheet"),
            "questions": all_questions,
            "sections": sections,
            "totalMarks": total_marks,
            "formatting": request.get("formatting", rule.get("formatting", "default")),
            "marking": request.get("marking", rule.get("marking", "default")),
            "testRule": rule_id,
            "rule": rule,
        }

    @classmethod
    def _normalize_question(cls, question: dict, section: str, request: dict) -> dict:
        parts = question.get("parts") or []
        marks = question.get("marksBreakdown") or {}
        total_marks = question.get("totalMarks")
        if parts:
            total_marks = sum(cls._part_marks(part) for part in parts)
            marks = {part.get("label", str(index + 1)): cls._part_marks(part) for index, part in enumerate(parts)}
        elif total_marks is None:
            total_marks = sum(int(value) for value in marks.values())

        return {
            "id": question.get("id") or f"authored-{section.lower().replace(' ', '-')}",
            "type": question.get("type", "authored"),
            "section": section,
            "questionText": question.get("questionText", ""),
            "questionLatex": question.get("questionLatex") or "",
            "contentBlocks": question.get("contentBlocks") or [],
            "answer": question.get("answer", ""),
            "answerLatex": question.get("answerLatex") or "",
            "parts": parts,
            "workedSolution": question.get("workedSolution", []),
            "marksBreakdown": marks,
            "totalMarks": int(total_marks),
            "graphConfig": question.get("graphConfig"),
            "tableConfig": question.get("tableConfig"),
            "formatting": request.get("formatting", "default"),
            "marking": request.get("marking", "default"),
            "metadata": question.get("metadata", {}),
        }

    @staticmethod
    def _part_marks(part: dict) -> int:
        subparts = part.get("subparts") or []
        if subparts:
            return sum(int(subpart.get("marks", 0)) for subpart in subparts)
        return int(part.get("marks", 0))

    def _load_rules(self) -> dict[str, dict]:
        rules = {}
        for path in sorted(self.config_dir.glob("*.json")):
            with path.open("r", encoding="utf-8") as handle:
                rule = json.load(handle)
            rules[rule["id"]] = rule
        return rules
