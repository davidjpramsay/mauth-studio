from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


GEOMETRY_SPEC = {
    "type": "geometricConstruction",
    "data": {
        "objects": [
            {"type": "point", "name": "A"},
            {"type": "point", "name": "B"},
            {"type": "point", "name": "C"},
        ],
        "relationships": [
            {"type": "triangle", "points": ["A", "B", "C"]},
            {"type": "rightAngle", "at": "B"},
            {"type": "labelLength", "between": ["A", "B"], "value": "5"},
            {"type": "labelLength", "between": ["B", "C"], "value": "12"},
        ],
    },
    "style": "geometry",
    "options": {"penrosePreset": "geometry", "scalePercent": 100},
}

SET_SPEC = {
    "type": "setDiagram",
    "data": {},
    "style": "sets",
    "options": {"penrosePreset": "sets", "scalePercent": 100},
}


def test_penrose_endpoint_renders_triangle_svg():
    response = client.post("/api/diagram/penrose", json=GEOMETRY_SPEC)

    assert response.status_code == 200
    data = response.json()
    assert data["svg"].startswith("<svg")
    assert "rightAngleMark" in data["svg"]
    assert data["metadata"]["preset"] == "geometry"
    assert "Triangle(A, B, C)" in data["metadata"]["substance"]
    assert "LabelsSegment(sideLabel1, A, B)" in data["metadata"]["substance"]
    assert "override" not in data["metadata"]["styleSource"]
    assert "ensure perpendicular(a.dot.center, b.dot.center, c.dot.center)" in data["metadata"]["styleSource"]


def test_penrose_endpoint_colours_structured_solution_points_segments_and_labels():
    response = client.post(
        "/api/diagram/penrose",
        json={
            "type": "network",
            "data": {
                "objects": [
                    {"type": "point", "name": "A", "label": "A"},
                    {"type": "point", "name": "B", "label": "B", "solutionOnly": True},
                ],
                "relationships": [
                    {
                        "type": "segment",
                        "name": "AB",
                        "points": ["A", "B"],
                        "label": "5",
                        "solutionOnly": True,
                    }
                ],
            },
            "options": {"variation": "solution-colour"},
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "SolutionPoint(B)" in data["metadata"]["substance"]
    assert "SolutionSegment(AB)" in data["metadata"]["substance"]
    assert "SolutionLengthLabel(segmentLabel1)" in data["metadata"]["substance"]
    assert data["svg"].count("#1d4ed8") >= 3


def test_penrose_endpoint_colours_solution_venn_region_text_and_shading():
    response = client.post(
        "/api/diagram/penrose",
        json={
            "type": "setDiagram",
            "data": {
                "universe": {"name": "U", "label": "U"},
                "sets": [{"name": "A", "label": "A"}, {"name": "B", "label": "B"}],
                "regions": [
                    {"name": "onlyA", "label": "7", "shaded": True, "solutionOnly": True},
                    {"name": "intersection", "label": "2"},
                    {"name": "onlyB", "label": "3"},
                    {"name": "outside", "label": "1"},
                ],
            },
        },
    )

    assert response.status_code == 200
    svg = response.json()["svg"]
    assert 'data-mauth-penrose-kind="region"' in svg
    assert 'data-mauth-penrose-id="onlyA"' in svg
    assert 'fill="#1d4ed8"' in svg
    assert "rgba(29, 78, 216, 0.3)" in svg


def test_penrose_endpoint_renders_default_two_set_diagram():
    response = client.post("/api/diagram/penrose", json=SET_SPEC)

    assert response.status_code == 200
    data = response.json()
    assert data["metadata"]["preset"] == "sets"
    assert data["svg"].startswith("<svg")
    assert "Venn(U, A, B)" in data["metadata"]["substance"]
    assert "LabelsLeftOnly(onlyA, A, B)" in data["metadata"]["substance"]
    assert "LabelsIntersection(intersection, A, B)" in data["metadata"]["substance"]
    assert "LabelsRightOnly(onlyB, A, B)" in data["metadata"]["substance"]
    assert "LabelsOutside(outside, U, A, B)" in data["metadata"]["substance"]
    assert "A \\cap B'" in data["metadata"]["substance"]
    assert "A \\cap B" in data["metadata"]["substance"]


def test_penrose_variation_resamples_geometry_layout():
    first = client.post("/api/diagram/penrose", json={**GEOMETRY_SPEC, "options": {"variation": "layout-a"}})
    second = client.post("/api/diagram/penrose", json={**GEOMETRY_SPEC, "options": {"variation": "layout-b"}})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["svg"] != second.json()["svg"]


def test_penrose_diagram_uses_original_canvas_and_test_text_labels():
    response = client.post(
        "/api/diagram/penrose",
        json={**GEOMETRY_SPEC, "options": {"scalePercent": 150, "width": 600, "height": 420}},
    )

    assert response.status_code == 200
    data = response.json()
    assert 'viewBox="' in data["svg"]
    assert 'width="420"' not in data["svg"]
    assert 'height="300"' not in data["svg"]
    assert data["metadata"]["width"] == 420
    assert data["metadata"]["height"] == 300
    assert data["metadata"]["displayWidth"] <= 420
    assert data["metadata"]["displayHeight"] <= 300
    assert data["metadata"]["viewBox"] != "0 0 420 300"
    assert data["metadata"]["scalePercent"] == 150
    assert "font-size: 10.755px" in data["svg"]


def test_penrose_endpoint_accepts_source_inputs():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "substanceSource": (
                    "Point A, B, C\n"
                    "Label A $A$\n"
                    "Label B $B$\n"
                    "Label C $C$\n"
                    "LengthLabel sideLabel1, sideLabel2\n"
                    "Triangle(A, B, C)\n"
                    "RightAngle(A, B, C)\n"
                    "Label sideLabel1 $9$\n"
                    "LabelsSegment(sideLabel1, A, B)\n"
                    "Label sideLabel2 $12$\n"
                    "LabelsSegment(sideLabel2, B, C)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "Label sideLabel1 $9$" in data["metadata"]["substance"]
    assert "`sideLabel1`.text" in data["svg"]
    assert 'data-c="39"' in data["svg"]


def test_penrose_endpoint_repairs_common_agent_geometry_source_aliases():
    response = client.post(
        "/api/diagram/penrose",
        json={
            "type": "geometricConstruction",
            "data": {
                "objects": [
                    {"type": "point", "name": "O", "label": "O"},
                    {"type": "point", "name": "A", "label": "A"},
                    {"type": "point", "name": "B", "label": "B"},
                    {"type": "point", "name": "C", "label": "C"},
                    {"type": "circle", "name": "omega", "label": ""},
                    {"type": "line", "name": "t", "label": "tangent at $A$"},
                ],
                "relationships": [],
            },
            "style": "geometry",
            "options": {
                "scalePercent": 100,
                "substanceSource": (
                    "Point O, A, B, C\n"
                    "Circle omega\n"
                    "Line t\n"
                    "Segment AB, AC, BC, OA\n"
                    "On(A, omega)\n"
                    "On(B, omega)\n"
                    "On(C, omega)\n"
                    "Segment(AB, A, B)\n"
                    "Segment(AC, A, C)\n"
                    "Segment(BC, B, C)\n"
                    "Segment(OA, O, A)\n"
                    "Perpendicular(t, OA)\n"
                    "Parallel(t, BC)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    substance = response.json()["metadata"]["substance"]
    assert "NamedSegment AB, AC, BC, OA" in substance
    assert "OnCircle(A, omega)" in substance
    assert "PerpendicularToSegment(t, O, A)" in substance
    assert "ParallelToSegment(t, B, C)" in substance
    assert "Label A $A$" in substance
    assert "Label t $\\,$" in substance


def test_penrose_source_inputs_drive_generated_layout_helpers():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "substanceSource": (
                    "Point A, B, C, D\n"
                    "Label A $A$\n"
                    "Label B $B$\n"
                    "Label C $C$\n"
                    "Label D $D$\n"
                    "LengthLabel sideLabel1, sideLabel2\n"
                    "Triangle(A, B, D)\n"
                    "RightAngle(A, B, D)\n"
                    "Label sideLabel1 $5 cm$\n"
                    "LabelsSegment(sideLabel1, A, B)\n"
                    "Label sideLabel2 $12 cm$\n"
                    "LabelsSegment(sideLabel2, B, D)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "Triangle(A, B, D)" in data["metadata"]["substance"]
    assert "Point `B`; Point `D`" in data["metadata"]["styleSource"]
    assert "Point `B`; Point `C`" not in data["metadata"]["styleSource"]


def test_penrose_geometry_preset_accepts_inline_angle_label_between_named_segments():
    response = client.post(
        "/api/diagram/penrose",
        json={
            "type": "geometricConstruction",
            "data": {},
            "style": "geometry",
            "options": {
                "scalePercent": 100,
                "substanceSource": (
                    "Point O, C, D\n"
                    "NamedSegment OC, OD\n"
                    "Segment(OC, O, C)\n"
                    "Segment(OD, O, D)\n"
                    "LabelsAngle(OC, OD, $45^\\circ$)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    substance = response.json()["metadata"]["substance"]
    assert "Label angleLabel1 $45^\\circ$" in substance
    assert "LengthLabel angleLabel1" in substance
    assert "LabelsAngle(angleLabel1, C, O, D)" in substance
    assert "LengthLabel OC" not in substance


def test_penrose_geometry_preset_supports_common_constructions():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "substanceSource": (
                    "Point O, A, B, C\n"
                    "Line tangentA, bisectorABC, perpAB\n"
                    "Circle omega\n"
                    "LengthLabel angleLabel, circleLabel\n"
                    "Label O $O$\n"
                    "Label A $A$\n"
                    "Label B $B$\n"
                    "Label C $C$\n"
                    "Label omega $\\omega$\n"
                    "Label angleLabel $45^\\circ$\n"
                    "Label circleLabel $r=5$\n"
                    "CircleThrough(omega, O, A)\n"
                    "OnCircle(B, omega)\n"
                    "Tangent(tangentA, omega, A)\n"
                    "AngleBisector(bisectorABC, A, B, C)\n"
                    "PerpendicularBisector(perpAB, A, B)\n"
                    "LabelsAngle(angleLabel, A, B, C)\n"
                    "LabelsCircle(circleLabel, omega)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "Tangent(tangentA, omega, A)" in data["metadata"]["substance"]
    assert "AngleBisector(bisectorABC, A, B, C)" in data["metadata"]["substance"]
    assert "rightAngleMark" not in data["svg"]


def test_penrose_geometry_preset_draws_equal_length_ticks():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "variation": "isosceles",
                "substanceSource": (
                    "Point L, V, R\n"
                    "Label L $\\,$\n"
                    "Label V $\\,$\n"
                    "Label R $\\,$\n"
                    "LengthLabel angleTheta\n"
                    "Label angleTheta $\\theta$\n"
                    "Triangle(L, V, R)\n"
                    "EqualLength(V, L, V, R)\n"
                    "LabelsAngle(angleTheta, L, V, R)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "EqualLength(V, L, V, R)" in data["metadata"]["substance"]
    assert "tickFirst" in data["svg"]
    assert "tickSecond" in data["svg"]
    assert "angleTheta" in data["svg"]
    assert "\\theta" not in data["svg"]


def test_penrose_geometry_preset_allows_unlabelled_points():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "variation": "unlabelled-points",
                "substanceSource": (
                    "Point L, V, R\n"
                    "LengthLabel angleTheta\n"
                    "Label angleTheta $\\theta$\n"
                    "Triangle(L, V, R)\n"
                    "EqualLength(V, L, V, R)\n"
                    "LabelsAngle(angleTheta, L, V, R)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "Label L $\\,$" in data["metadata"]["substance"]
    assert "Label V $\\,$" in data["metadata"]["substance"]
    assert "Label R $\\,$" in data["metadata"]["substance"]
    assert "tickFirst" in data["svg"]
    assert "\\theta" not in data["svg"]


def test_penrose_geometry_preset_supports_named_equal_lengths():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "variation": "named-segments",
                "substanceSource": (
                    "Point L, V, R\n"
                    "NamedSegment VL, VR\n"
                    "LengthLabel angleTheta\n"
                    "Label angleTheta $\\theta$\n"
                    "Triangle(L, V, R)\n"
                    "Segment(VL, V, L)\n"
                    "Segment(VR, V, R)\n"
                    "EqualLength(VL, VR)\n"
                    "LabelsAngle(angleTheta, L, V, R)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "NamedSegment VL, VR" in data["metadata"]["substance"]
    assert "Segment(VL, V, L)" in data["metadata"]["substance"]
    assert "EqualNamedLength(VL, VR)" in data["metadata"]["substance"]
    assert "EqualSegments" not in data["metadata"]["substance"]
    assert "tickFirst" in data["svg"]
    assert "tickSecond" in data["svg"]
    assert "\\theta" not in data["svg"]
    assert 'fontSize: "13.333px"' not in data["metadata"]["styleSource"]
    assert 'fontSize: "16.133px"' in data["metadata"]["styleSource"]


def test_penrose_geometry_preset_infers_named_segment_declarations():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "variation": "inferred-named-segments",
                "substanceSource": (
                    "Point L, V, R\n"
                    "LengthLabel angleTheta\n"
                    "Label angleTheta $\\theta$\n"
                    "Triangle(L, V, R)\n"
                    "EqualLength(VL, VR)\n"
                    "Segment(VL, V, L)\n"
                    "Segment(VR, V, R)\n"
                    "LabelsAngle(angleTheta, L, V, R)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "NamedSegment VL, VR" in data["metadata"]["substance"]
    assert "EqualNamedLength(VL, VR)" in data["metadata"]["substance"]
    assert "Segment(VL, V, L)" in data["metadata"]["substance"]
    assert "tickFirst" in data["svg"]
    assert "tickSecond" in data["svg"]
    assert "\\theta" not in data["svg"]


def test_penrose_geometry_preset_accepts_equal_length_alias_for_named_segments():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "variation": "equal-length-segment-alias",
                "substanceSource": (
                    "Point A, B, C\n"
                    "LengthLabel angleTheta\n"
                    "Label angleTheta $\\theta$\n"
                    "Triangle(A, B, C)\n"
                    "Segment(AB, A, B)\n"
                    "Segment(AC, A, C)\n"
                    "EqualLength(AB, AC)\n"
                    "LabelsAngle(angleTheta, B, A, C)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "NamedSegment AB, AC" in data["metadata"]["substance"]
    assert "EqualNamedLength(AB, AC)" in data["metadata"]["substance"]
    assert "EqualLength(AB, AC)" not in data["metadata"]["substance"]
    assert "EqualSegments" not in data["metadata"]["substance"]
    assert "tickFirst" in data["svg"]
    assert "tickSecond" in data["svg"]


def test_penrose_geometry_preset_labels_named_segments():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "variation": "label-named-segment",
                "substanceSource": (
                    "Point A, B, C\n"
                    "LengthLabel angleTheta\n"
                    "Label angleTheta $\\theta$\n"
                    "Label a $a$\n"
                    "Triangle(A, B, C)\n"
                    "Segment(AB, A, B)\n"
                    "Segment(AC, A, C)\n"
                    "EqualLength(AB, AC)\n"
                    "LabelsAngle(angleTheta, B, A, C)\n"
                    "LabelsSegment(a, AB)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "LengthLabel a" in data["metadata"]["substance"]
    assert "LabelsSegment(a, A, B)" in data["metadata"]["substance"]
    assert "LabelsSegment(a, AB)" not in data["metadata"]["substance"]
    assert "EqualNamedLength(AB, AC)" in data["metadata"]["substance"]
    assert "tickFirst" in data["svg"]
    assert "tickSecond" in data["svg"]


def test_penrose_geometry_preset_reuses_display_text_for_multiple_segment_labels():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "variation": "repeated-segment-labels",
                "substanceSource": (
                    "Point A, B, C\n"
                    "Label angleTheta $\\theta$\n"
                    "Label a $a$\n"
                    "Triangle(A, B, C)\n"
                    "Segment(AB, A, B)\n"
                    "Segment(AC, A, C)\n"
                    "EqualLength(AB, AC)\n"
                    "LabelsAngle(angleTheta, B, A, C)\n"
                    "LabelsSegment(a, AB)\n"
                    "LabelsSegment(a, AC)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "LengthLabel angleTheta, a, a_2" in data["metadata"]["substance"]
    assert "Label a_2 $a$" in data["metadata"]["substance"]
    assert "LabelsSegment(a, A, B)" in data["metadata"]["substance"]
    assert "LabelsSegment(a_2, A, C)" in data["metadata"]["substance"]
    assert "LabelsSegment(a, AB)" not in data["metadata"]["substance"]
    assert "LabelsSegment(a, AC)" not in data["metadata"]["substance"]
    assert "LengthLabel `a`; Point `A`; Point `B`; Point `C`" in data["metadata"]["styleSource"]
    assert "LengthLabel `a_2`; Point `A`; Point `C`; Point `B`" in data["metadata"]["styleSource"]
    assert "EqualNamedLength(AB, AC)" in data["metadata"]["substance"]
    assert "tickFirst" in data["svg"]
    assert "tickSecond" in data["svg"]


def test_penrose_geometry_preset_can_hide_point_dots():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "variation": "hide-point-dots",
                "substanceSource": (
                    "Point A, B, C\n"
                    "Label angleTheta $\\theta$\n"
                    "Label a $a$\n"
                    "Triangle(A, B, C)\n"
                    "Segment(AB, A, B)\n"
                    "Segment(AC, A, C)\n"
                    "EqualLength(AB, AC)\n"
                    "LabelsAngle(angleTheta, B, A, C)\n"
                    "LabelsSegment(a, AB)\n"
                    "LabelsSegment(a, AC)\n"
                    "HidePoints(A, B, C)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "HidePoint(A)" in data["metadata"]["substance"]
    assert "HidePoint(B)" in data["metadata"]["substance"]
    assert "HidePoint(C)" in data["metadata"]["substance"]
    assert "where HidePoint(p)" in data["metadata"]["styleSource"]


def test_penrose_vector_relationship_draws_arrows_and_can_hide_endpoints():
    response = client.post(
        "/api/diagram/penrose",
        json={
            "type": "network",
            "data": {
                "hidePoints": True,
                "hidePointLabels": True,
                "objects": [
                    {"type": "point", "name": "O"},
                    {"type": "point", "name": "A"},
                    {"type": "point", "name": "B"},
                ],
                "relationships": [
                    {"type": "vectorSegment", "name": "OA", "points": ["O", "A"], "label": "\\vec u"},
                    {"type": "vectorSegment", "name": "AB", "points": ["A", "B"], "label": "\\vec v"},
                    {"type": "vectorSegment", "name": "OB", "points": ["O", "B"], "label": "\\vec u+\\vec v"},
                ],
            },
            "style": "geometry",
            "options": {"penrosePreset": "geometry", "scalePercent": 100},
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "VectorSegment(OA, O, A)" in data["metadata"]["substance"]
    assert "VectorSegment(AB, A, B)" in data["metadata"]["substance"]
    assert "VectorSegment(OB, O, B)" in data["metadata"]["substance"]
    assert "HidePoint(O)" in data["metadata"]["substance"]
    assert "Label O $\\,$" in data["metadata"]["substance"]
    assert "<polygon" in data["svg"]


def test_penrose_set_diagram_supports_smooth_shading_and_count_badges():
    response = client.post(
        "/api/diagram/penrose",
        json={
            "type": "setDiagram",
            "data": {
                "universe": {"name": "U", "label": "U", "countLabel": "n(U)"},
                "sets": [
                    {"id": "A", "label": "A", "countLabel": "n(A)", "count": "18"},
                    {"id": "B", "label": "B", "countLabel": "n(B)", "count": "12"},
                ],
                "regions": [
                    {"id": "onlyA", "label": "A \\cap B'", "shaded": True, "count": "9"},
                    {"id": "intersection", "label": "A \\cap B", "count": "9"},
                    {"id": "onlyB", "label": "A' \\cap B", "count": "3"},
                    {"id": "outside", "label": "(A \\cup B)'", "shaded": True, "count": "9"},
                ],
            },
            "style": "sets",
            "options": {"penrosePreset": "sets", "scalePercent": 100},
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "ShadeLeftOnly(A, B)" in data["metadata"]["substance"]
    assert "ShadeOutside(U, A, B)" in data["metadata"]["substance"]
    assert "A \\cap B'" in data["metadata"]["substance"]
    assert "n(A)" in data["svg"]
    assert "n(U)" in data["svg"]
    assert 'paint-order="stroke"' not in data["svg"]
    assert 'stroke="#ffffff"' not in data["svg"]
    assert 'data-badge-kind="box"' in data["svg"]
    assert 'data-badge-kind="left-tab"' in data["svg"]
    assert 'data-badge-kind="right-tab"' in data["svg"]
    assert 'data-badge-kind="cap"' not in data["svg"]
    assert 'x="342" y="250"' in data["svg"]
    assert 'font-size="16.666"' in data["svg"]
    assert 'font-size="23"' not in data["svg"]
    assert " Z" not in data["svg"].split('data-badge-kind="left-tab"', 1)[1].split("</g>", 1)[0]
    assert " Z" not in data["svg"].split('data-badge-kind="right-tab"', 1)[1].split("</g>", 1)[0]
    assert data["metadata"]["displayWidth"] == 336
    assert data["metadata"]["displayHeight"] == 240
    assert 'x="126" y="150"' in data["svg"]
    assert 'x="210" y="150"' in data["svg"]
    assert 'x="294" y="150"' in data["svg"]

    scaled_response = client.post(
        "/api/diagram/penrose",
        json={
            "type": "setDiagram",
            "data": {
                "universe": {"name": "U", "label": "U", "countLabel": "30"},
                "sets": [
                    {"id": "A", "label": "A", "countLabel": "18"},
                    {"id": "B", "label": "B", "countLabel": "16"},
                ],
                "regions": [
                    {"id": "onlyA", "label": "8"},
                    {"id": "intersection", "label": "10"},
                    {"id": "onlyB", "label": "6"},
                    {"id": "outside", "label": "11"},
                ],
            },
            "style": "sets",
            "options": {"penrosePreset": "sets", "scalePercent": 200},
        },
    )

    assert scaled_response.status_code == 200
    scaled_svg = scaled_response.json()["svg"]
    assert 'font-size="8.333"' in scaled_svg
    assert 'x="96.018" y="150"' in scaled_svg
    assert 'x="144" y="150"' in scaled_svg
    assert 'x="210" y="150"' in scaled_svg
    assert 'x="276" y="150"' in scaled_svg
    assert 'x="323.982" y="150"' in scaled_svg


def test_penrose_geometry_preset_draws_repeated_ticks_and_angle_arcs():
    response = client.post(
        "/api/diagram/penrose",
        json={
            **GEOMETRY_SPEC,
            "options": {
                "scalePercent": 100,
                "variation": "repeated-marks",
                "substanceSource": (
                    "Point L, V, R\n"
                    "Label L $\\,$\n"
                    "Label V $\\,$\n"
                    "Label R $\\,$\n"
                    "LengthLabel angleTheta\n"
                    "Label angleTheta $\\theta$\n"
                    "Triangle(L, V, R)\n"
                    "EqualLength2(V, L, V, R)\n"
                    "AngleMark3(L, V, R)\n"
                    "LabelsAngle(angleTheta, L, V, R)\n"
                ),
            },
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "EqualLength2(V, L, V, R)" in data["metadata"]["substance"]
    assert "AngleMark3(L, V, R)" in data["metadata"]["substance"]
    assert "tickFirst" in data["svg"]
    assert "tickSecond" in data["svg"]
    assert "angleArc" in data["svg"]
    assert "\\theta" not in data["svg"]


def test_geometry_question_embeds_geometric_diagram():
    response = client.post("/api/questions/generate", json={"type": "right_triangle_geometry", "seed": 3})

    assert response.status_code == 200
    data = response.json()
    assert data["section"] == "Geometry"
    assert data["contentBlocks"][0]["kind"] == "diagram"
    assert data["contentBlocks"][0]["graphConfig"]["type"] == "geometricConstruction"
    assert data["diagram"]["data"]["relationships"][1]["type"] == "rightAngle"
