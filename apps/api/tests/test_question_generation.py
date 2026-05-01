from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_quadratic_question_generation_is_structured():
    response = client.post("/api/questions/generate", json={"type": "quadratic_factor", "seed": 10})

    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "quadratic_factor"
    assert data["questionText"].startswith("Factorise:")
    assert data["answerLatex"]
    assert data["workedSolution"]
    assert data["marksBreakdown"] == {"method": 2, "answer": 1}
    assert data["totalMarks"] == 3


def test_test_generation_counts_and_total_marks():
    response = client.post(
        "/api/tests/generate",
        json={
            "title": "High School Mathematics",
            "questions": [
                {"type": "quadratic_factor", "count": 3},
                {"type": "differentiate_poly", "count": 2},
            ],
            "formatting": "default",
            "marking": "default",
            "seed": 5,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["questions"]) == 5
    assert data["totalMarks"] == 13
    assert "High School Mathematics" in data["renderedHtml"]
    assert len(data["blocks"]) == 5
    assert data["formattingConfig"]["page"]["size"] == "A4"


def test_test_build_accepts_authored_questions_and_rules():
    response = client.post(
        "/api/tests/build",
        json={
            "title": "Custom Algebra Quiz",
            "testRule": "high_school_mathematics",
            "formatting": "default",
            "marking": "default",
            "sections": [
                {
                    "title": "Algebra",
                    "questions": [
                        {
                            "questionText": "Factorise the expression.",
                            "questionLatex": "x^2 - 5x + 6",
                            "answerLatex": "(x - 2)(x - 3)",
                            "marksBreakdown": {"method": 2, "answer": 1},
                            "graphConfig": {
                                "type": "2d_graph",
                                "expression": "x^2 - 5*x + 6",
                                "latex": "x^2 - 5x + 6",
                                "xMin": -5,
                                "xMax": 4,
                                "yMin": -10,
                                "yMax": 10,
                                "widthPx": 620,
                                "heightPx": 280,
                                "showGrid": False,
                                "showMajorGrid": True,
                                "showMinorGrid": False,
                                "showGridBorder": True,
                                "showAxes": True,
                                "showArrows": False,
                                "gridMajorColor": "#aaaaaa",
                                "gridMinorColor": "#eeeeee",
                            },
                            "tableConfig": {
                                "headers": ["x", "y"],
                                "rows": [["2", "0"], ["3", "0"]],
                            },
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Custom Algebra Quiz"
    assert data["testRule"] == "high_school_mathematics"
    assert data["totalMarks"] == 3
    assert data["questions"][0]["questionText"] == "Factorise the expression."
    assert "Graphs and Diagrams" in data["renderedHtml"]
    assert "question-table" in data["renderedHtml"]
    assert data["formattingConfig"]["page"]["showPageBreaks"] is True


def test_test_build_auto_calculates_marks_from_parts():
    response = client.post(
        "/api/tests/build",
        json={
            "title": "Parts Test",
            "testRule": "high_school_mathematics",
            "sections": [
                {
                    "title": "Algebra",
                    "questions": [
                        {
                            "questionText": "Solve $x + 1 = 4$ and show $$x = 3$$",
                            "totalMarks": 99,
                            "marksBreakdown": {"question": 99},
                            "parts": [
                                {"label": "a", "text": "Find $x$.", "marks": 2},
                                {"label": "b", "text": "Check the solution.", "marks": 1},
                            ],
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["totalMarks"] == 3
    assert data["questions"][0]["totalMarks"] == 3
    assert data["questions"][0]["marksBreakdown"] == {"a": 2, "b": 1}
    assert "question-parts" in data["renderedHtml"]
    assert "(2 marks)" in data["renderedHtml"]
    assert "[2 marks]" not in data["renderedHtml"]
    assert "inline-latex" in data["renderedHtml"]
    assert "display-latex" in data["renderedHtml"]


def test_test_build_preserves_ordered_question_and_part_content_blocks():
    response = client.post(
        "/api/tests/build",
        json={
            "title": "Diagram Blocks Test",
            "testRule": "high_school_mathematics",
            "sections": [
                {
                    "title": "Graphs and Diagrams",
                    "questions": [
                        {
                            "questionText": "Fallback text",
                            "contentBlocks": [
                                {"kind": "text", "text": "The graph of $y=f(x)$ is shown."},
                                {
                                    "kind": "diagram",
                                    "diagramAlign": "right",
                                    "graphConfig": {
                                        "type": "2d_graph",
                                        "expression": "x^2 - 5*x + 6",
                                        "latex": "x^2 - 5x + 6",
                                        "functions": [
                                            {
                                                "id": "f1",
                                                "expression": "x^2 - 5*x + 6",
                                                "label": "f",
                                                "color": "#0f766e",
                                            },
                                            {
                                                "id": "g1",
                                                "kind": "piecewise",
                                                "expression": "",
                                                "label": "g",
                                                "color": "#b45309",
                                                "pieces": [
                                                    {
                                                        "id": "g1a",
                                                        "expression": "-x + 2",
                                                        "xMin": -5,
                                                        "xMax": 0,
                                                        "includeStart": True,
                                                        "includeEnd": False,
                                                    },
                                                    {
                                                        "id": "g1b",
                                                        "expression": "x + 2",
                                                        "xMin": 0,
                                                        "xMax": 4,
                                                        "includeStart": True,
                                                        "includeEnd": True,
                                                    },
                                                ],
                                            },
                                        ],
                                        "xMin": -5,
                                        "xMax": 4,
                                        "yMin": -10,
                                        "yMax": 10,
                                        "widthPx": 640,
                                        "heightPx": 280,
                                        "showGrid": False,
                                        "showMajorGrid": False,
                                        "showMinorGrid": True,
                                        "showGridBorder": False,
                                        "showAxes": True,
                                        "showArrows": False,
                                        "showFunctionArrows": True,
                                        "axisExtension": 0.5,
                                        "functionExtension": 0.25,
                                        "gridMajorStep": 1,
                                        "gridMinorStep": 0.5,
                                    },
                                },
                            ],
                            "parts": [
                                {
                                    "label": "a",
                                    "text": "fallback",
                                    "marks": 1,
                                    "contentBlocks": [
                                        {"kind": "text", "text": "Find $$\\int_2^4 f(x)\\,dx$$"},
                                        {
                                            "kind": "diagram",
                                            "diagramAlign": "left",
                                            "graphConfig": {
                                                "type": "2d_graph",
                                                "expression": "x",
                                                "latex": "y=x",
                                                "xMin": -3,
                                                "xMax": 3,
                                                "yMin": -3,
                                                "yMax": 3,
                                                "showGrid": True,
                                                "showAxes": False,
                                                "showArrows": True,
                                            },
                                        },
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    html = data["renderedHtml"]
    assert data["questions"][0]["contentBlocks"][1]["kind"] == "diagram"
    assert data["questions"][0]["parts"][0]["contentBlocks"][1]["kind"] == "diagram"
    assert data["questions"][0]["contentBlocks"][1]["diagramAlign"] == "right"
    assert data["questions"][0]["parts"][0]["contentBlocks"][1]["diagramAlign"] == "left"
    assert data["questions"][0]["contentBlocks"][1]["graphConfig"]["type"] == "2d_graph"
    assert data["questions"][0]["contentBlocks"][1]["graphConfig"]["showGrid"] is False
    assert data["questions"][0]["contentBlocks"][1]["graphConfig"]["showMajorGrid"] is False
    assert data["questions"][0]["contentBlocks"][1]["graphConfig"]["showMinorGrid"] is True
    assert data["questions"][0]["contentBlocks"][1]["graphConfig"]["showGridBorder"] is False
    assert data["questions"][0]["contentBlocks"][1]["graphConfig"]["widthPx"] == 640
    assert data["questions"][0]["contentBlocks"][1]["graphConfig"]["heightPx"] == 280
    assert len(data["questions"][0]["contentBlocks"][1]["graphConfig"]["functions"]) == 2
    assert data["questions"][0]["contentBlocks"][1]["graphConfig"]["functions"][1]["kind"] == "piecewise"
    assert len(data["questions"][0]["contentBlocks"][1]["graphConfig"]["functions"][1]["pieces"]) == 2
    assert data["questions"][0]["parts"][0]["contentBlocks"][1]["graphConfig"]["showAxes"] is False
    assert html.index("The graph") < html.index("Diagram:")
    assert html.count('<div class="question-diagram') == 2
    assert "question-diagram-right" in html
    assert "question-diagram-left" in html
    assert "Domain:" in html
    assert "Size:" in html
    assert "major 1" in html
    assert "grid off" in html
    assert "major grid off" in html
    assert "minor grid on" in html
    assert "-x + 2" in html
    assert "function arrows on" in html


def test_test_build_accepts_stats_chart_content_block():
    response = client.post(
        "/api/tests/build",
        json={
            "title": "Statistics Test",
            "testRule": "high_school_mathematics",
            "sections": [
                {
                    "title": "Statistics",
                    "questions": [
                        {
                            "questionText": "Use the histogram to answer the question.",
                            "marksBreakdown": {"answer": 1},
                            "contentBlocks": [
                                {"kind": "text", "text": "Use the histogram to answer the question."},
                                {
                                    "kind": "diagram",
                                    "diagramAlign": "center",
                                    "graphConfig": {
                                        "type": "statsChart",
                                        "data": {
                                            "chartType": "histogram",
                                            "values": [3, 5, 7, 7, 8, 10],
                                            "xLabel": "Score",
                                            "yLabel": "Frequency",
                                        },
                                        "options": {
                                            "widthPx": 560,
                                            "heightPx": 320,
                                            "showGrid": True,
                                            "blackAndWhite": True,
                                            "interactive": False,
                                        },
                                    },
                                },
                            ],
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    chart_block = data["questions"][0]["contentBlocks"][1]
    assert chart_block["kind"] == "diagram"
    assert chart_block["graphConfig"]["type"] == "statsChart"
    assert chart_block["graphConfig"]["data"]["chartType"] == "histogram"


def test_test_build_rolls_up_subpart_marks_and_renders_roman_labels():
    response = client.post(
        "/api/tests/build",
        json={
            "title": "Subpart Test",
            "testRule": "high_school_mathematics",
            "sections": [
                {
                    "title": "Algebra",
                    "questions": [
                        {
                            "questionText": "Answer each part.",
                            "contentBlocks": [{"kind": "text", "text": "Answer **each** *part*."}],
                            "parts": [
                                {
                                    "label": "a",
                                    "text": "",
                                    "marks": 0,
                                    "contentBlocks": [{"kind": "text", "text": "For $f(x)=x^2$:"}],
                                    "subparts": [
                                        {
                                            "label": "i",
                                            "text": "",
                                            "marks": 1,
                                            "contentBlocks": [{"kind": "text", "text": "Find $f(2)$."}],
                                        },
                                        {
                                            "label": "ii",
                                            "text": "",
                                            "marks": 2,
                                            "contentBlocks": [{"kind": "text", "text": "Find $f'(x)$."}],
                                        },
                                    ],
                                },
                                {
                                    "label": "b",
                                    "text": "",
                                    "marks": 0,
                                    "contentBlocks": [{"kind": "text", "text": "For $g(x)=x+1$:"}],
                                    "subparts": [
                                        {
                                            "label": "i",
                                            "text": "",
                                            "marks": 1,
                                            "contentBlocks": [{"kind": "text", "text": "Find $g(3)$."}],
                                        },
                                    ],
                                },
                            ],
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    html = data["renderedHtml"]
    assert data["totalMarks"] == 4
    assert data["questions"][0]["totalMarks"] == 4
    assert data["questions"][0]["marksBreakdown"] == {"a": 3, "b": 1}
    assert "(i)" in html
    assert "(ii)" in html
    assert "question-subparts" in html
    assert "<strong>each</strong>" in html
    assert "<em>part</em>" in html
