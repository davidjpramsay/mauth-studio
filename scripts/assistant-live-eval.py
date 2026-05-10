#!/usr/bin/env python3
"""Run a small live OpenAI eval for the Mauth in-app assistant.

This intentionally tests the provider boundary, not the React UI. It checks
whether a focused teacher request turns into the high-level authoring tool
instead of expensive low-level action loops.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.models.schemas import AssistantChatMessage, AssistantChatRequest, AssistantToolOutput  # noqa: E402
from app.services.openai_assistant import assistant_configured, create_assistant_response  # noqa: E402


def sample_document_summary() -> dict[str, Any]:
    return {
        "frontMatter": {"assessmentTitle": "Assistant live eval"},
        "counts": {
            "questions": 1,
            "marksTotal": 0,
            "modules": 0,
            "studentSpaceLines": 0,
            "solutionOnlyModules": 0,
        },
        "questions": [
            {
                "id": "q1",
                "index": 0,
                "marks": 0,
                "pageBreakAfter": False,
                "modules": [],
                "parts": [],
                "studentSpaceLines": 0,
                "solutionModuleCount": 0,
            }
        ],
    }


def sample_circle_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 5
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": (
                "Points A, B and C lie on a circle. The tangent to the circle at A is drawn. "
                "Prove the angle between the tangent and chord AB is equal to angle ACB."
            ),
        },
        {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 12},
    ]
    summary["questions"][0]["studentSpaceLines"] = 12
    return summary


def sample_parallel_chord_circle_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 5
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": (
                "A, B and C are points on a circle. The tangent to the circle at A is parallel to chord BC. "
                "Prove that AB=AC."
            ),
        },
        {"id": "q1-student-space", "kind": "space", "visibility": "student", "lines": 12},
    ]
    summary["questions"][0]["studentSpaceLines"] = 12
    return summary


def sample_probability_document_summary() -> dict[str, Any]:
    summary = sample_document_summary()
    summary["questions"][0]["marks"] = 4
    summary["questions"][0]["modules"] = [
        {
            "id": "q1-question-text",
            "kind": "text",
            "visibility": "always",
            "textPreview": "A discrete random variable X has probabilities P(X=x)=k/x for x=2,3,4,5.",
        }
    ]
    return summary


def usage_cost(usage: dict[str, Any] | None) -> float:
    if not isinstance(usage, dict):
        return 0
    value = usage.get("estimatedCostUsd")
    return value if isinstance(value, int | float) else 0


def usage_tokens(usage: dict[str, Any] | None) -> int:
    if not isinstance(usage, dict):
        return 0
    value = usage.get("totalTokens")
    return value if isinstance(value, int) else 0


def as_dict(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if isinstance(value, dict):
        return value
    return {}


def assert_authoring_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.replaceQuestion":
        issues.append(f"expected mauth.author.replaceQuestion, got {call.get('mauthToolName')!r}")

    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]

    question_text = str(args.get("questionText") or "")
    solution_text = str(args.get("solutionText") or args.get("solution") or "")
    lower_question = question_text.lower()
    lower_solution = solution_text.lower()

    if args.get("questionNumber") != 1:
        issues.append("questionNumber should be 1")
    if not isinstance(args.get("marks"), int) or args["marks"] < 2:
        issues.append("marks should be an integer of at least 2")
    if not isinstance(args.get("studentSpaceLines"), int) or args["studentSpaceLines"] < 6:
        issues.append("studentSpaceLines should be generous, at least 6")
    if len(question_text) < 120:
        issues.append("questionText is too short to be teacher-ready")
    if len(solution_text) < 120:
        issues.append("solutionText is too short to be a worked solution")
    if "tangent" not in lower_question:
        issues.append("questionText should explicitly involve a tangent")
    if "circle" not in lower_question:
        issues.append("questionText should explicitly involve a circle")
    if "prove" not in lower_question and "show" not in lower_question:
        issues.append("questionText should be an explicit proof/show question")
    if "parallel" in lower_question:
        issues.append(
            "live eval rejected a parallel-line conclusion because the prior model output made an invalid parallel proof"
        )
    if "\\circ" in question_text:
        issues.append("circle proof prompt should be symbolic here, not a numerical angle substitution")
    if any(phrase in lower_solution for phrase in ("does not follow", "cannot be proven", "not enough information")):
        issues.append("solution says the requested proof conclusion does not follow")
    if "therefore" in lower_solution and "different conclusion" in lower_solution:
        issues.append("solution appears to prove a different conclusion from the question target")
    if "ac=bc" in lower_question.replace(" ", "") and "ac=ab" in lower_solution.replace(" ", ""):
        issues.append("solution proves AC=AB while the question asks for AC=BC")
    if (
        "given that" in lower_question
        and "\\angle acb" in lower_question
        and ("prove" in lower_question or "show" in lower_question)
    ):
        issues.append("questionText appears to give an angle fact and then prove from it; use a cleaner theorem target")
    if not any(term in lower_solution for term in ("alternate segment", "tangent", "radius")):
        issues.append("solutionText should use a relevant circle theorem")
    if "placeholder" in lower_question or "placeholder" in lower_solution:
        issues.append("output contains placeholder text")
    if "\\[" in question_text or "\\]" in question_text or "\\[" in solution_text or "\\]" in solution_text:
        issues.append("use $$...$$ display maths, not \\[...\\] delimiters")
    return issues


def diagram_graph_config(args: dict[str, Any]) -> dict[str, Any]:
    diagram = args.get("diagram")
    if isinstance(diagram, dict):
        graph_config = diagram.get("graphConfig", diagram.get("config"))
        if isinstance(graph_config, dict):
            return graph_config
    graph_config = args.get("graphConfig")
    return graph_config if isinstance(graph_config, dict) else {}


def assert_diagram_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.addDiagram":
        issues.append(f"expected mauth.author.addDiagram, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    if args.get("questionNumber") != 1:
        issues.append("questionNumber should be 1")
    graph_config = diagram_graph_config(args)
    if graph_config.get("type") != "geometricConstruction":
        issues.append("circle theorem diagrams should use a geometricConstruction/Penrose graphConfig")
    substance = str(graph_config.get("options", {}).get("substanceSource", ""))
    if "Tangent(" not in substance or "CircleThrough(" not in substance:
        issues.append("Penrose Substance should include circle and tangent predicates")
    return issues


def assert_parallel_chord_diagram_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.addDiagram":
        issues.append(f"expected mauth.author.addDiagram, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    if args.get("questionNumber") != 1:
        issues.append("questionNumber should be 1")
    graph_config = diagram_graph_config(args)
    if graph_config.get("type") != "geometricConstruction":
        issues.append("tangent-parallel-chord diagrams should use a geometricConstruction/Penrose graphConfig")
    substance = str(graph_config.get("options", {}).get("substanceSource", ""))
    if "ParallelToSegment(" not in substance:
        issues.append("Penrose Substance should use ParallelToSegment for a tangent parallel to a chord")
    if "Label O $O$" in substance or "Label O" in substance:
        issues.append("auxiliary centre points should not be visibly labelled unless the question names them")
    return issues


def assert_multipart_probability_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.replaceQuestion":
        issues.append(f"expected mauth.author.replaceQuestion, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    parts = args.get("parts")
    if not isinstance(parts, list) or len(parts) < 2:
        issues.append("multipart request should use a structured parts array with at least two parts")
    if "(a)" in str(args.get("questionText") or "").lower():
        issues.append("questionText should not contain typed part labels")
    if parts:
        for index, part in enumerate(parts):
            if not isinstance(part, dict):
                issues.append(f"parts[{index}] should be an object")
                continue
            if not str(part.get("text") or "").strip():
                issues.append(f"parts[{index}].text should be non-empty")
            if not str(part.get("solutionText") or "").strip():
                issues.append(f"parts[{index}].solutionText should be non-empty")
            if not isinstance(part.get("studentSpaceLines"), int) or part["studentSpaceLines"] < 3:
                issues.append(f"parts[{index}].studentSpaceLines should be at least 3")
            if "\\[" in str(part.get("text") or "") or "\\]" in str(part.get("text") or ""):
                issues.append(f"parts[{index}].text should use $$...$$ display maths, not \\[...\\]")
            if "\\[" in str(part.get("solutionText") or "") or "\\]" in str(part.get("solutionText") or ""):
                issues.append(f"parts[{index}].solutionText should use $$...$$ display maths, not \\[...\\]")
    if "\\[" in str(args.get("questionText") or "") or "\\]" in str(args.get("questionText") or ""):
        issues.append("questionText should use $$...$$ display maths, not \\[...\\]")
    return issues


def assert_solution_call(call: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if call.get("mauthToolName") != "mauth.author.ensureSolutions":
        issues.append(f"expected mauth.author.ensureSolutions, got {call.get('mauthToolName')!r}")
    args = call.get("mauthArguments")
    if not isinstance(args, dict):
        return [*issues, "mauthArguments was not an object"]
    questions = args.get("questions")
    if not isinstance(questions, list) or len(questions) != 1:
        issues.append("ensureSolutions should include exactly one question payload")
        return issues
    item = questions[0]
    if not isinstance(item, dict):
        return [*issues, "questions[0] should be an object"]
    if item.get("questionNumber") != 1:
        issues.append("questions[0].questionNumber should be 1")
    solution = str(item.get("solutionText") or "")
    if len(solution) < 80:
        issues.append("solutionText is too short")
    if not isinstance(item.get("studentSpaceLines"), int) or item["studentSpaceLines"] < 6:
        issues.append("studentSpaceLines should be at least 6")
    if "\\[" in solution or "\\]" in solution:
        issues.append("solutionText should use $$...$$ display maths, not \\[...\\]")
    return issues


EVAL_CASES: dict[str, dict[str, Any]] = {
    "circle-question": {
        "prompt": (
            "Can you write question 1 for me? I would like a circle geometry proof question "
            "involving a tangent to a circle and an angle subtended at the circumference. "
            "Also write the solution for me."
        ),
        "summary": sample_document_summary,
        "assert": assert_authoring_call,
    },
    "circle-diagram": {
        "prompt": "Please add a diagram for the circle tangent proof question in question 1.",
        "summary": sample_circle_document_summary,
        "assert": assert_diagram_call,
    },
    "circle-parallel-diagram": {
        "prompt": "Please add the diagram to question 1 that goes along with the question.",
        "summary": sample_parallel_chord_circle_document_summary,
        "assert": assert_parallel_chord_diagram_call,
    },
    "multipart-probability": {
        "prompt": (
            "Replace question 1 with a two-part probability question about a discrete random variable. "
            "Part a should ask students to determine k and part b should ask for E(X). Include solutions."
        ),
        "summary": sample_probability_document_summary,
        "assert": assert_multipart_probability_call,
    },
    "ensure-solution": {
        "prompt": "Write the worked solution for question 1 and keep enough student answer space.",
        "summary": sample_probability_document_summary,
        "assert": assert_solution_call,
    },
}


async def run_single_eval(
    case_name: str, model: str | None = None, final_message: bool = False
) -> tuple[int, float, int]:
    case = EVAL_CASES[case_name]
    prompt = str(case["prompt"])
    summary = case["summary"]()
    assert_call = case["assert"]

    print(f"\n=== {case_name} ===")
    first = await create_assistant_response(
        AssistantChatRequest(
            model=model,
            messages=[AssistantChatMessage(role="user", content=prompt)],
            documentSummary=summary,
        )
    )
    first_calls = [as_dict(call) for call in first.get("toolCalls", [])]
    total_cost = usage_cost(first.get("usage"))
    total_tokens = usage_tokens(first.get("usage"))

    print("First response:")
    print(
        json.dumps({"message": first.get("message"), "usage": first.get("usage"), "toolCalls": first_calls}, indent=2)
    )

    if len(first_calls) != 1:
        print(f"FAIL: expected exactly one tool call, got {len(first_calls)}", file=sys.stderr)
        return 1, total_cost, total_tokens

    issues = assert_call(first_calls[0])
    if issues:
        print("FAIL:")
        for issue in issues:
            print(f"- {issue}")
        return 1, total_cost, total_tokens

    if final_message:
        tool_output = {
            "ok": True,
            "toolName": first_calls[0].get("mauthToolName"),
            "kind": "document",
            "message": "Tool completed.",
            "changedIds": ["q1"],
            "changedPaths": [],
            "warnings": [],
            "committedDocument": True,
        }
        second = await create_assistant_response(
            AssistantChatRequest(
                model=model,
                previousResponseId=first.get("responseId"),
                toolOutputs=[
                    AssistantToolOutput(
                        callId=first_calls[0]["callId"],
                        name=first_calls[0]["name"],
                        output=tool_output,
                    )
                ],
                documentSummary=summary,
            )
        )
        second_calls = [as_dict(call) for call in second.get("toolCalls", [])]
        total_cost += usage_cost(second.get("usage"))
        total_tokens += usage_tokens(second.get("usage"))
        print("Final response:")
        print(
            json.dumps(
                {"message": second.get("message"), "usage": second.get("usage"), "toolCalls": second_calls}, indent=2
            )
        )
        if second_calls:
            print("FAIL: final response should not need another tool call.", file=sys.stderr)
            return 1, total_cost, total_tokens
        if not str(second.get("message") or "").strip():
            print("FAIL: final response should contain a teacher-facing summary.", file=sys.stderr)
            return 1, total_cost, total_tokens

    print(f"PASS: {case_name} succeeded. Estimated total: ${total_cost:.4f}, {total_tokens:,} tokens.")
    return 0, total_cost, total_tokens


async def run_eval(case_name: str = "circle-question", model: str | None = None, final_message: bool = False) -> int:
    if not assistant_configured():
        print("OPENAI_API_KEY is not configured; live eval skipped.", file=sys.stderr)
        return 2

    selected_cases = list(EVAL_CASES) if case_name == "all" else [case_name]
    total_cost = 0.0
    total_tokens = 0
    failed = False
    for selected_case in selected_cases:
        status, cost, tokens = await run_single_eval(selected_case, model=model, final_message=final_message)
        total_cost += cost
        total_tokens += tokens
        failed = failed or status != 0
    print(f"\nTOTAL: ${total_cost:.4f}, {total_tokens:,} tokens.")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a live Mauth assistant eval against OpenAI.")
    parser.add_argument("--model", default=None, help="Override OPENAI_MODEL for this eval.")
    parser.add_argument(
        "--case", choices=[*EVAL_CASES.keys(), "all"], default="circle-question", help="Eval case to run."
    )
    parser.add_argument(
        "--final", action="store_true", help="Also test the optional final tool-output continuation call."
    )
    args = parser.parse_args()
    return asyncio.run(run_eval(case_name=args.case, model=args.model, final_message=args.final))


if __name__ == "__main__":
    raise SystemExit(main())
