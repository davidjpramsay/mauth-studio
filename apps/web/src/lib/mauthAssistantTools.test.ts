import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import type { MauthDocumentActionResult, MauthDocumentLike, MauthQuestionLike } from "./mauthActions.ts";
import {
  describeMauthAssistantTools,
  inspectMauthDocument,
  runMauthAssistantTool,
  type MauthAssistantToolDescription,
  type MauthLayoutCheck,
  type MauthPreviewInspection,
} from "./mauthAssistantTools.ts";
import { inspectMauthDiagram, isAssistantDiagramInspectionWarningBlocking } from "./mauthDiagramInspection.ts";

interface TestFrontMatter {
  schoolName: string;
  assessmentTitle: string;
}

interface TestFormattingConfig {
  showMarks: boolean;
}

function textBlock(id: string, text: string, visibility?: ContentBlock["visibility"]): ContentBlock {
  return { id, kind: "text", text, ...(visibility ? { visibility } : {}) };
}

function spaceBlock(id: string, lines: number): ContentBlock {
  return { id, kind: "space", lines, visibility: "student" };
}

function hiddenMarkTotal(text: string) {
  return [...text.matchAll(/\[\[\s*marks\s*:\s*(\d+)\s*\]\]/gi)].reduce((sum, match) => sum + Number(match[1] ?? 0), 0);
}

function allQuestionText(questionItem?: MauthQuestionLike) {
  const parts = questionItem?.parts ?? [];
  const blocks = questionItem?.contentBlocks ?? [];
  return [
    ...blocks.map((block) => (block.kind === "text" ? block.text : "")),
    ...parts.flatMap((partItem) => [
      partItem.text ?? "",
      ...partItem.contentBlocks.map((block) => (block.kind === "text" ? block.text : "")),
      ...(partItem.subparts ?? []).flatMap((subpart) => [
        subpart.text ?? "",
        ...subpart.contentBlocks.map((block) => (block.kind === "text" ? block.text : "")),
      ]),
    ]),
  ].join("\n");
}

function allSolutionText(questionItem?: MauthQuestionLike) {
  const blocks = questionItem?.contentBlocks ?? [];
  const parts = questionItem?.parts ?? [];
  return [
    ...blocks.filter((block) => block.kind === "text" && block.visibility === "solution").map((block) => block.text),
    ...parts.flatMap((partItem) => [
      ...partItem.contentBlocks.filter((block) => block.kind === "text" && block.visibility === "solution").map((block) => block.text),
      ...(partItem.subparts ?? []).flatMap((subpart) =>
        subpart.contentBlocks.filter((block) => block.kind === "text" && block.visibility === "solution").map((block) => block.text),
      ),
    ]),
  ].join("\n");
}

function questionDiagrams(questionItem?: MauthQuestionLike) {
  return (questionItem?.contentBlocks ?? []).filter((block) => block.kind === "diagram");
}

function diagramBlock(id: string, graphConfig: GraphConfig): ContentBlock {
  return { id, kind: "diagram", graphConfig };
}

function statsChartConfig(): GraphConfig {
  return {
    type: "statsChart",
    data: {
      chartType: "histogram",
      dataMode: "manualProbabilities",
      xValues: [1, 2, 3],
      probabilities: [0.2, 0.5, 0.3],
      barType: "discrete",
      yAxisMode: "relativeFrequency",
    },
    options: { widthPx: 260, heightPx: 220 },
  } as unknown as GraphConfig;
}

function question(id: string, blocks: ContentBlock[] = []): MauthQuestionLike {
  return {
    id,
    marks: 2,
    contentBlocks: blocks,
    parts: [],
    itemOrder: blocks.map((block) => ({ kind: "block" as const, id: block.id })),
  };
}

function documentFixture(): MauthDocumentLike<MauthQuestionLike, TestFrontMatter, TestFormattingConfig> {
  return {
    frontMatter: {
      schoolName: "Mauth School",
      assessmentTitle: "Test 1",
    },
    formattingConfig: {
      showMarks: true,
    },
    questions: [
      question("q1", [
        textBlock("t1", "Find the value of $x$."),
        diagramBlock("d1", { type: "statsChart", data: { chartType: "histogram" } }),
        spaceBlock("s1", 4),
        textBlock("sol1", "**Solution.** $x=3$", "solution"),
      ]),
    ],
  };
}

test("describes the assistant tool surface and supported action types", () => {
  const description = describeMauthAssistantTools();

  assert(description.tools.some((tool) => tool.name === "mauth.actions.preview"));
  assert(description.tools.some((tool) => tool.name === "mauth.preview.inspect"));
  assert(description.tools.some((tool) => tool.name === "mauth.question.upsert"));
  assert(description.tools.some((tool) => tool.name === "mauth.solutions.writeAll"));
  assert(description.tools.some((tool) => tool.name === "mauth.layout.check"));
  assert(description.actionTypes.all.includes("question.add"));
  assert(description.actionTypes.all.includes("document.validation.run"));
  assert(description.documentRecipes.some((recipe) => recipe.id === "school-exam-front-matter"));
  assert(description.workflow.some((step) => step.includes("Preview")));
});

test("runs the tool description through the assistant dispatcher", () => {
  const result = runMauthAssistantTool(documentFixture(), { name: "mauth.tools.describe" });
  const description = result.data as MauthAssistantToolDescription;

  assert.equal(result.ok, true);
  assert.equal(result.changedIds.length, 0);
  assert(description.actionTypes.content.includes("module.update"));
});

test("previews the school exam front matter recipe", () => {
  const description = describeMauthAssistantTools();
  const recipe = description.documentRecipes.find((item) => item.id === "school-exam-front-matter");
  assert(recipe);

  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: { actions: recipe.actions },
  });
  const document = result.document as MauthDocumentLike<MauthQuestionLike, Record<string, unknown>, Record<string, unknown>>;

  assert.equal(result.ok, true);
  assert.equal(document.frontMatter.titlePageTemplate, "exam");
  assert.equal((document.frontMatter.exam as Record<string, unknown>).structureRows instanceof Array, true);
  assert.equal((document.frontMatter.exam as Record<string, unknown>).sectionPreset, "section-one-calculator-free");
  assert.equal((document.frontMatter.exam as Record<string, unknown>).sectionHeader, "CALCULATOR-FREE");
  assert.equal(document.formattingConfig?.id, "exam-booklet");
});

test("inspects a document with compact counts and question summaries", () => {
  const inspection = inspectMauthDocument(documentFixture());

  assert.equal(inspection.frontMatterFields.includes("assessmentTitle"), true);
  assert.equal(inspection.formattingConfigFields.includes("showMarks"), true);
  assert.equal(inspection.counts.questions, 1);
  assert.equal(inspection.counts.diagramModules, 1);
  assert.equal(inspection.counts.spaceModules, 1);
  assert.equal(inspection.counts.solutionOnlyModules, 1);
  assert.equal(inspection.counts.studentSpaceLines, 4);
  assert.equal(inspection.questions[0].modules[0].textPreview, "Find the value of $x$.");
  assert.equal(inspection.questions[0].modules[1].diagramType, "statsChart");
});

test("inspects diagram-specific semantic issues for assistant repair", () => {
  const statsWarnings = inspectMauthDiagram(
    {
      type: "statsChart",
      data: {
        chartType: "histogram",
        dataMode: "manualProbabilities",
        xValues: [1, 2, 3],
        probabilities: [0.2, 0.2, 0.2],
      },
    },
    "The following probability mass function $P(X=x)$ is shown.",
  ).warnings;
  assert(statsWarnings.some((warning) => warning.code === "stats-chart-probabilities-not-normalised"));

  const vectorWarnings = inspectMauthDiagram(
    {
      type: "vector2d",
      metadata: {
        vector2d: {
          vectors: [{ id: "a", name: "a", start: [0, 0], components: [2, 3], showComponents: false }],
        },
      },
    },
    "Draw vectors a=(2,3) and b=(4,-3) from the origin.",
  ).warnings;
  assert(vectorWarnings.some((warning) => warning.code === "vector2d-labels-missing"));

  const lineMismatchWarnings = inspectMauthDiagram(
    {
      type: "graph2d",
      functions: [
        { expression: "2*x + 1", label: "$y=2x+1$" },
        { expression: "x^2 - 4*x + 4", label: "$y=x^2-4x+4$" },
      ],
    },
    "The graph below shows two straight lines, $y=2x+1$ and $y=-x+7$.",
  ).warnings;
  const lineMismatch = lineMismatchWarnings.find((warning) => warning.code === "graph2d-straight-line-mismatch");
  assert(lineMismatch);
  assert.equal(isAssistantDiagramInspectionWarningBlocking(lineMismatch), true);

  const setWarnings = inspectMauthDiagram(
    {
      type: "setDiagram",
      data: {
        universe: { name: "U", label: "U" },
        sets: [
          { name: "A", label: "A" },
          { name: "B", label: "B" },
        ],
        regions: [
          { name: "onlyA", label: "A \\cap B'" },
          { name: "intersection", label: "A \\cap B" },
          { name: "onlyB", label: "A' \\cap B" },
          { name: "outside", label: "(A \\cup B)'" },
        ],
      },
    },
    "Shade the region $A \\cap B'$ on the Venn diagram.",
  ).warnings;
  assert(setWarnings.some((warning) => warning.code === "set-diagram-shading-missing"));

  const graphWarnings = inspectMauthDiagram(
    {
      type: "graph2d",
      functions: [{ expression: "1 / (x - 2)", label: "f", show: true }],
      features: [],
    },
    "Sketch the graph of $f(x)$ and show the vertical asymptote.",
  ).warnings;
  assert(graphWarnings.some((warning) => warning.code === "graph2d-asymptote-feature-missing"));

  const slopeFieldWarnings = inspectMauthDiagram(
    {
      type: "graph2d",
      xMin: -2,
      xMax: 2,
      yMin: -2,
      yMax: 2,
      functions: [],
    },
    "Part of the slope field given by $\\frac{dy}{dx}=\\frac{x-1}{2y}$ is shown. Calculate and draw the slope field at the point $(0.5,-1)$.",
  ).warnings;
  assert(slopeFieldWarnings.some((warning) => warning.code === "graph2d-slope-field-missing"));

  const implicitDerivativeWarnings = inspectMauthDiagram(
    {
      type: "graph2d",
      functions: [{ kind: "relation", expression: "x^3 + y^3 = 3xy + y" }],
      features: [
        { kind: "point", x: 0, y: 0, label: "$O$" },
        { kind: "point", x: -0.475, y: 0, label: "$A$" },
        { kind: "point", x: 0.225, y: 0, label: "$B$" },
      ],
    },
    "The curve is implicitly defined by $x^3+y^3=3xy+y$. Use implicit differentiation to find $\\frac{dy}{dx}$.",
  ).warnings;
  assert.equal(
    implicitDerivativeWarnings.some((warning) => warning.code === "graph2d-slope-field-missing"),
    false,
  );

  const graph3dWarnings = inspectMauthDiagram(
    {
      type: "graph3d",
      metadata: { view3d: { az: 1, el: 0.3, bank: 0 } },
    },
    "A rectangular prism is defined using the coordinate system shown. Determine the vector equation for main diagonal BT.",
  ).warnings;
  assert(graph3dWarnings.some((warning) => warning.code === "graph3d-points-missing"));
  assert(graph3dWarnings.some((warning) => warning.code === "graph3d-segments-missing"));

  const scalarWarnings = inspectMauthDiagram(
    {
      type: "geometricConstruction",
      options: {
        substanceSource: [
          "Point O, A, B",
          "Ray rayA, rayB",
          "RayFrom(rayA, O, A)",
          "RayFrom(rayB, O, B)",
          "Label A $\\mathbf{a}$",
          "Label B $\\mathbf{b}$",
        ].join("\n"),
      },
    },
    "Evaluate $\\mathbf{a}\\cdot\\mathbf{b}$ when the angle between them is $45^\\circ$.",
  ).warnings;
  assert(scalarWarnings.some((warning) => warning.code === "scalar-product-angle-marker-missing"));
  assert(
    statsWarnings.some(
      (warning) => warning.code === "stats-chart-probabilities-not-normalised" && isAssistantDiagramInspectionWarningBlocking(warning),
    ),
  );
  assert(
    vectorWarnings.some((warning) => warning.code === "vector2d-labels-missing" && isAssistantDiagramInspectionWarningBlocking(warning)),
  );
  assert(
    setWarnings.some((warning) => warning.code === "set-diagram-shading-missing" && isAssistantDiagramInspectionWarningBlocking(warning)),
  );
  assert(
    scalarWarnings.some(
      (warning) => warning.code === "scalar-product-angle-marker-missing" && isAssistantDiagramInspectionWarningBlocking(warning),
    ),
  );
  assert(
    graph3dWarnings.some((warning) => warning.code === "graph3d-points-missing" && isAssistantDiagramInspectionWarningBlocking(warning)),
  );
  assert(
    slopeFieldWarnings.some(
      (warning) => warning.code === "graph2d-slope-field-missing" && isAssistantDiagramInspectionWarningBlocking(warning),
    ),
  );
});

test("inspects focused preview context for the selected module", () => {
  const result = runMauthAssistantTool(
    documentFixture(),
    { name: "mauth.preview.inspect", arguments: { scope: "selection" } },
    { assistantContext: { activeAnchor: "q:q1/b:s1" } },
  );
  const inspection = result.data as MauthPreviewInspection;

  assert.equal(result.ok, true);
  assert.equal(inspection.scope, "selection");
  assert.equal(inspection.target.questionId, "q1");
  assert.equal(inspection.target.blockId, "s1");
  assert.equal(inspection.question?.questionNumber, 1);
  assert.equal(inspection.question?.selectedBlock?.id, "s1");
  assert.equal(inspection.question?.diagrams[0].graphType, "statsChart");
  assert.equal(inspection.question?.solutionScopes[0].studentSpaceLines, 4);
  assert.equal(inspection.question?.solutionScopes[0].solutionModuleCount, 1);
  assert(inspection.question?.warnings.some((warning) => warning.code === "solution-hidden-mark-total-mismatch"));
});

test("includes browser-rendered preview metrics when supplied by the host", () => {
  const result = runMauthAssistantTool(
    documentFixture(),
    { name: "mauth.preview.inspect", arguments: { scope: "selection" } },
    {
      assistantContext: {
        activeAnchor: "q:q1/b:s1",
        renderedMetrics: {
          available: true,
          source: "browser-preview",
          activeAnchor: "q:q1/b:s1",
          pageCount: 1,
          pages: [
            {
              pageIndex: 0,
              pageNumber: 1,
              usedHeightPx: 520,
              totalHeightPx: 1000,
              remainingHeightPx: 480,
              usedPercent: 52,
              anchorCount: 4,
              overflow: false,
            },
          ],
          anchors: [
            {
              anchor: "q:q1/b:s1",
              kind: "questionBlock",
              role: "module",
              pageIndex: 0,
              pageNumber: 1,
              selected: true,
              viewportRect: { left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100, x: 10, y: 20 },
              solutionSlot: {
                found: true,
                studentHeightPx: 100,
                solutionHeightPx: 92,
                solutionFitsStudentSpace: true,
              },
              warnings: [],
            },
            {
              anchor: "q:other",
              kind: "question",
              role: "structure",
              pageIndex: 0,
              pageNumber: 1,
              selected: false,
              viewportRect: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, x: 0, y: 0 },
              warnings: [],
            },
          ],
          warnings: [],
        },
      },
    },
  );
  const inspection = result.data as MauthPreviewInspection;

  assert.equal(result.ok, true);
  assert.equal(inspection.renderedMetrics.available, true);
  if (inspection.renderedMetrics.available) {
    assert.equal(inspection.renderedMetrics.pageCount, 1);
    assert.equal(inspection.renderedMetrics.anchors.length, 1);
    assert.equal(inspection.renderedMetrics.anchors[0].anchor, "q:q1/b:s1");
    assert.equal(inspection.renderedMetrics.anchors[0].solutionSlot?.solutionFitsStudentSpace, true);
  }
});

function circleGeometryDocument(source: string): MauthDocumentLike<MauthQuestionLike, TestFrontMatter, TestFormattingConfig> {
  return {
    frontMatter: {
      schoolName: "Mauth School",
      assessmentTitle: "Circle Test",
    },
    formattingConfig: {
      showMarks: true,
    },
    questions: [
      {
        id: "circle-q",
        marks: 5,
        text: "A, B and C are points on a circle. The tangent to the circle at A is parallel to the chord BC. Prove that AB = AC.",
        contentBlocks: [
          diagramBlock("circle-d", {
            type: "geometricConstruction",
            data: {},
            options: { substanceSource: source },
          }),
          spaceBlock("circle-space", 10),
        ],
        parts: [],
        itemOrder: [
          { kind: "block", id: "circle-d" },
          { kind: "block", id: "circle-space" },
        ],
      },
    ],
  };
}

test("inspects Penrose circle geometry semantics for obvious theorem mismatches", () => {
  const result = runMauthAssistantTool(
    circleGeometryDocument(
      [
        "Point O, A, B, C",
        "Circle omega",
        "Line drawnLine",
        "NamedSegment AB, AC",
        "Label O $O$",
        "Label A $A$",
        "Label B $B$",
        "Label C $C$",
        "CircleThrough(omega, O, A)",
        "OnCircle(B, omega)",
        "Segment(AB, A, B)",
        "Segment(AC, A, C)",
      ].join("\n"),
    ),
    {
      name: "mauth.preview.inspect",
      arguments: { questionNumber: 1 },
    },
  );
  const inspection = result.data as MauthPreviewInspection;
  const warningCodes = (inspection.question?.diagrams[0].semanticWarnings ?? []).map((warning) => warning.code);

  assert.equal(result.ok, true);
  assert(inspection.question?.diagrams[0].semanticChecks.includes("penrose-circle-geometry"));
  assert(warningCodes.includes("penrose-circle-tangent-missing"));
  assert(warningCodes.includes("penrose-circle-parallel-chord-missing"));
  assert(warningCodes.includes("penrose-chord-segment-missing"));
  assert(warningCodes.includes("penrose-circle-points-missing"));
  assert(warningCodes.includes("penrose-visible-auxiliary-label"));
  assert(inspection.warnings.some((warning) => warning.code === "penrose-circle-tangent-missing"));
});

test("accepts a Penrose tangent-parallel-chord diagram semantically", () => {
  const result = runMauthAssistantTool(
    circleGeometryDocument(
      [
        "Point O, A, B, C",
        "Circle omega",
        "Line tangentA",
        "NamedSegment AB, AC, BC",
        "Label O $\\,$",
        "Label A $A$",
        "Label B $B$",
        "Label C $C$",
        "HidePoint(O)",
        "CircleThrough(omega, O, A)",
        "OnCircle(B, omega)",
        "OnCircle(C, omega)",
        "Tangent(tangentA, omega, A)",
        "ParallelToSegment(tangentA, B, C)",
        "Segment(AB, A, B)",
        "Segment(AC, A, C)",
        "Segment(BC, B, C)",
      ].join("\n"),
    ),
    {
      name: "mauth.preview.inspect",
      arguments: { questionNumber: 1 },
    },
  );
  const inspection = result.data as MauthPreviewInspection;
  const semanticWarnings = inspection.question?.diagrams[0].semanticWarnings ?? [];

  assert.equal(result.ok, true);
  assert(inspection.question?.diagrams[0].semanticChecks.includes("penrose-circle-geometry"));
  assert.deepEqual(semanticWarnings, []);
});

test("inspects scalar-product ray diagram labels", () => {
  const result = runMauthAssistantTool(
    {
      frontMatter: {
        schoolName: "Mauth School",
        assessmentTitle: "Vector Test",
      },
      formattingConfig: {
        showMarks: true,
      },
      questions: [
        {
          id: "vector-q",
          marks: 5,
          text: "Evaluate the following scalar products exactly.",
          contentBlocks: [
            diagramBlock("vector-d", {
              type: "geometricConstruction",
              data: {},
              options: {
                substanceSource: [
                  "Point O, A, B, C, D",
                  "NamedSegment OA, OB, OC, OD",
                  "Segment(OA, O, A)",
                  "Segment(OB, O, B)",
                  "Segment(OC, O, C)",
                  "Segment(OD, O, D)",
                  "Label A $\\mathbf{a}$",
                  "Label B $\\mathbf{b}$",
                ].join("\n"),
              },
            }),
            spaceBlock("vector-space", 10),
          ],
          parts: [
            {
              id: "part-a",
              label: "a",
              marks: 1,
              text: "$\\mathbf{a}\\cdot\\mathbf{b}$",
              contentBlocks: [],
              subparts: [],
              itemOrder: [],
            },
            {
              id: "part-b",
              label: "b",
              marks: 2,
              text: "$\\mathbf{c}\\cdot\\mathbf{d}$",
              contentBlocks: [],
              subparts: [],
              itemOrder: [],
            },
          ],
          itemOrder: [
            { kind: "block", id: "vector-d" },
            { kind: "block", id: "vector-space" },
            { kind: "part", id: "part-a" },
            { kind: "part", id: "part-b" },
          ],
        },
      ],
    },
    {
      name: "mauth.preview.inspect",
      arguments: { questionNumber: 1 },
    },
  );
  const inspection = result.data as MauthPreviewInspection;
  const diagram = inspection.question?.diagrams[0];
  const warningCodes = diagram?.warnings.map((warning) => warning.code) ?? [];

  assert.equal(result.ok, true);
  assert.equal(diagram?.expectedIntent?.id, "scalar-product-rays");
  assert(warningCodes.includes("scalar-product-vector-labels-missing"));
  assert(diagram?.warnings.some((warning) => warning.message.includes("$\\mathbf{c}$")));
  assert(inspection.warnings.some((warning) => warning.code === "scalar-product-vector-labels-missing"));
});

test("attaches rendered diagram failures to diagram inspection", () => {
  const result = runMauthAssistantTool(
    documentFixture(),
    { name: "mauth.preview.inspect", arguments: { questionNumber: 1 } },
    {
      assistantContext: {
        renderedMetrics: {
          available: true,
          source: "browser-preview",
          activeAnchor: "q:q1/b:d1",
          pageCount: 1,
          pages: [
            {
              pageIndex: 0,
              pageNumber: 1,
              usedHeightPx: 200,
              totalHeightPx: 1000,
              remainingHeightPx: 800,
              usedPercent: 20,
              anchorCount: 1,
              overflow: false,
            },
          ],
          anchors: [
            {
              anchor: "q:q1/b:d1",
              kind: "questionBlock",
              role: "module",
              pageIndex: 0,
              pageNumber: 1,
              selected: false,
              viewportRect: { left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100, x: 10, y: 20 },
              diagram: {
                found: true,
                rendered: false,
                errorText: "Geometry diagram could not render.",
                viewportRect: { left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100, x: 10, y: 20 },
              },
              warnings: [
                {
                  code: "rendered-diagram-failed",
                  severity: "error",
                  anchor: "q:q1/b:d1",
                  message: "The selected diagram failed to render: Geometry diagram could not render.",
                },
              ],
            },
          ],
          warnings: [],
        },
      },
    },
  );
  const inspection = result.data as MauthPreviewInspection;
  const diagram = inspection.question?.diagrams[0];

  assert.equal(result.ok, true);
  assert.equal(diagram?.rendered?.available, true);
  assert.equal(diagram?.rendered?.rendered, false);
  assert(diagram?.warnings.some((warning) => warning.code === "rendered-diagram-failed"));
});

test("previews actions without mutating the original document", () => {
  const document = documentFixture();
  const result = runMauthAssistantTool(document, {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.update",
          scope: { kind: "question", questionId: "q1" },
          blockId: "t1",
          patch: { text: "Updated wording." },
        },
      ],
    },
  });
  const actionResult = result.data as MauthDocumentActionResult<MauthQuestionLike, TestFrontMatter, TestFormattingConfig>;

  assert.equal(result.ok, true);
  assert.equal(actionResult.preview?.dryRun, true);
  assert.deepEqual(result.changedIds, ["t1"]);
  assert.equal(document.questions[0].contentBlocks[0].kind, "text");
  assert.equal(
    document.questions[0].contentBlocks[0].kind === "text" ? document.questions[0].contentBlocks[0].text : "",
    "Find the value of $x$.",
  );
  assert.equal(result.document?.questions[0].contentBlocks[0].kind, "text");
  assert.equal(
    result.document?.questions[0].contentBlocks[0].kind === "text" ? result.document.questions[0].contentBlocks[0].text : "",
    "Updated wording.",
  );
});

test("applies actions and returns the next document for the editor history path", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.apply",
    arguments: {
      action: {
        type: "frontMatter.update",
        patch: { assessmentTitle: "Final Test" },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedIds, ["frontMatter"]);
  assert.equal(result.document?.frontMatter.assessmentTitle, "Final Test");
});

test("applies high-level formatting operations without rewriting content", () => {
  const document = documentFixture();
  document.questions[0] = {
    ...document.questions[0],
    parts: [
      {
        id: "p-a",
        label: "a",
        marks: 1,
        text: "Part A",
        contentBlocks: [textBlock("p-a-text", "Part A")],
        subparts: [],
        itemOrder: [{ kind: "block", id: "p-a-text" }],
      },
      {
        id: "p-b",
        label: "b",
        marks: 1,
        text: "Part B",
        contentBlocks: [spaceBlock("p-b-space", 3)],
        subparts: [],
        itemOrder: [{ kind: "block", id: "p-b-space" }],
      },
    ],
    itemOrder: [
      { kind: "block", id: "t1" },
      { kind: "block", id: "d1" },
      { kind: "block", id: "s1" },
      { kind: "block", id: "sol1" },
      { kind: "part", id: "p-a" },
      { kind: "part", id: "p-b" },
    ],
  };

  const result = runMauthAssistantTool(document, {
    name: "mauth.format.apply",
    arguments: {
      operations: [
        { type: "setPageBreakBefore", target: { questionNumber: 1, partLabel: "b" } },
        { type: "setDiagramAlignment", target: { questionNumber: 1, diagramId: "d1" }, diagramAlign: "right" },
        { type: "adjustAnswerSpace", target: { questionNumber: 1 }, lines: 9, mode: "set" },
      ],
    },
  });
  const question = result.document?.questions[0];
  const diagram = question?.contentBlocks.find((block) => block.id === "d1");
  const space = question?.contentBlocks.find((block) => block.id === "s1");

  assert.equal(result.ok, true);
  assert.equal(question?.parts[1].pageBreakBefore, true);
  assert.equal(diagram?.kind === "diagram" ? diagram.diagramAlign : "", "right");
  assert.equal(space?.kind === "space" ? space.lines : 0, 9);
  assert.equal(question?.contentBlocks[0].kind === "text" ? question.contentBlocks[0].text : "", "Find the value of $x$.");
});

test("moves modules and fits solution space through high-level formatting", () => {
  const document = documentFixture();
  document.questions[0] = {
    ...document.questions[0],
    contentBlocks: [
      textBlock("t1", "Find the value of $x$."),
      diagramBlock("d1", { type: "statsChart", data: { chartType: "histogram" } }),
      spaceBlock("s1", 2),
      textBlock("sol1", "**Solution.**\nLine 1.\nLine 2.\nLine 3.\nLine 4.\nLine 5. [[marks:2]]", "solution"),
    ],
    itemOrder: [
      { kind: "block", id: "t1" },
      { kind: "block", id: "d1" },
      { kind: "block", id: "s1" },
      { kind: "block", id: "sol1" },
    ],
  };

  const result = runMauthAssistantTool(document, {
    name: "mauth.format.apply",
    arguments: {
      operations: [
        { type: "moveModule", blockId: "d1", to: { questionNumber: 1 }, afterBlockId: "s1" },
        { type: "fitSolutionToSpace", target: { questionNumber: 1 }, extraLines: 2 },
      ],
    },
  });
  const blocks = result.document?.questions[0].contentBlocks ?? [];
  const space = blocks.find((block) => block.id === "s1");

  assert.equal(result.ok, true);
  assert.deepEqual(
    blocks.map((block) => block.id),
    ["t1", "s1", "d1", "sol1"],
  );
  assert.equal(space?.kind === "space" ? space.lines : 0, 7);
});

test("replaces a question from a compact high-level authoring payload", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 4,
      questionText: "A circle has centre $O$ and tangent $AT$. Prove the required angle result.",
      studentSpaceLines: 12,
      solutionText: "Use the tangent-radius theorem, then apply angles in the same segment. Therefore the two angles are equal.",
      diagram: {
        diagramAlign: "center",
        graphConfig: {
          type: "statsChart",
          data: {
            chartType: "histogram",
            dataMode: "manualProbabilities",
            xValues: [1, 2],
            probabilities: [0.4, 0.6],
          },
        },
      },
    },
  });
  const question = result.document?.questions[0];
  const blocks = question?.contentBlocks ?? [];
  const text = blocks.find((block) => block.kind === "text" && block.visibility !== "solution");
  const diagram = blocks.find((block) => block.kind === "diagram");
  const space = blocks.find((block) => block.kind === "space");
  const solution = blocks.find((block) => block.kind === "text" && block.visibility === "solution");

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedIds, ["q1"]);
  assert.equal(question?.marks, 4);
  assert.equal(question?.parts.length, 0);
  assert.equal(text?.kind === "text" ? text.text : "", "A circle has centre $O$ and tangent $AT$. Prove the required angle result.");
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.type : "", "statsChart");
  assert.equal(space?.kind === "space" ? space.lines : 0, 14);
  assert.equal(space?.visibility, "student");
  assert.match(solution?.kind === "text" ? solution.text : "", /^\*\*Solution\.\*\*/);
  assert.equal(solution?.visibility, "solution");
});

test("high-level question authoring appends the next missing question", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 2,
      marks: 4,
      questionText: "The graph below shows two straight lines, $y=x+1$ and $y=-2x+7$.",
      studentSpaceLines: 10,
      diagram: {
        graphConfig: {
          type: "graph2d",
          xMin: -1,
          xMax: 6,
          yMin: -1,
          yMax: 9,
          functions: [
            { expression: "x+1", label: "$y=x+1$", show: true },
            { expression: "-2*x+7", label: "$y=-2x+7$", show: true },
          ],
        },
      },
    },
  });
  const questions = result.document?.questions ?? [];
  const appended = questions[1];

  assert.equal(result.ok, true);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].id, "q1");
  assert.equal(appended.id, "assistant-question-2");
  assert.equal(appended.marks, 4);
  assert.equal(appended.contentBlocks[0].kind, "text");
  assert.equal(appended.contentBlocks[1].kind, "diagram");
  assert.equal(appended.contentBlocks[1].kind === "diagram" ? appended.contentBlocks[1].graphConfig.type : "", "graph2d");
  assert.equal(appended.contentBlocks[2].kind, "space");
  assert.equal(appended.contentBlocks[2].visibility, "student");
});

test("real-exam style source payloads survive authoring, inspection, and layout checks", () => {
  const cases: Array<{
    id: string;
    arguments: Record<string, unknown>;
    diagramType: GraphConfig["type"];
    partCount: number;
    hiddenMarks: number;
    requiredText: string[];
  }> = [
    {
      id: "methods-earthquake",
      diagramType: "graph2d",
      partCount: 4,
      hiddenMarks: 9,
      requiredText: ["earthquake", "seismic moment", "M_w", "10^{15}"],
      arguments: {
        questionNumber: 1,
        marks: 0,
        questionText:
          "An earthquake has seismic moment $M_0=3.16\\times10^{13}$. The graph shows the relationship between moment magnitude $M_w$ and $\\log_{10}(M_0)$.",
        diagram: {
          graphConfig: {
            type: "graph2d",
            xMin: 8,
            xMax: 16,
            yMin: 0,
            yMax: 5,
            xAxisLabel: "$\\log_{10}(M_0)$",
            yAxisLabel: "$M_w$",
            functions: [{ expression: "y=(2/3)x-6", color: "#1d4ed8", strokeWidth: 2 }],
          },
        },
        parts: [
          {
            text: "For $M_0=3.16\\times10^{13}$, determine $\\log_{10}(M_0)$.",
            marks: 2,
            studentSpaceLines: 4,
            solutionText: "$$\\log_{10}(3.16\\times10^{13})=13.5.$$ [[marks:2]]",
          },
          {
            text: "Use points A and B on the graph to determine the gradient.",
            marks: 2,
            studentSpaceLines: 4,
            solutionText: "$$m=\\frac{4-2}{15-12}=\\frac23.$$ [[marks:2]]",
          },
          {
            text: "Find the relationship in the form $M_w=a\\log_{10}(M_0)+b$.",
            marks: 3,
            studentSpaceLines: 6,
            solutionText: "$$M_w=\\frac23\\log_{10}(M_0)-6,$$ so $M_w=3$ when $M_0=10^{13.5}$. [[marks:3]]",
          },
          {
            text: "Find the seismic moment for an earthquake of magnitude 4.",
            marks: 2,
            studentSpaceLines: 5,
            solutionText: "When $M_w=4$, $M_0=10^{15}$. When $M_w=0$, $M_0=10^9$. [[marks:2]]",
          },
        ],
      },
    },
    {
      id: "specialist-stats",
      diagramType: "statsChart",
      partCount: 3,
      hiddenMarks: 9,
      requiredText: ["text message", "standard deviation", "0.904", "not accepted"],
      arguments: {
        questionNumber: 1,
        marks: 0,
        questionText:
          "Anika claims that teenagers send me a text message with response times that have mean 3 minutes and standard deviation 2.4 minutes. A sample of 64 responses is recorded.",
        diagram: {
          graphConfig: {
            type: "statsChart",
            data: {
              chartType: "density",
              xLabel: "response time",
              points: [
                { x: 1, y: 0.03 },
                { x: 2.1, y: 0.2 },
                { x: 2.7, y: 0.18 },
                { x: 5, y: 0.02 },
              ],
            },
          },
        },
        parts: [
          {
            text: "Estimate the probability that a response time is between 150 and 210 seconds.",
            marks: 3,
            studentSpaceLines: 5,
            solutionText: "$$P(150<X<210)=0.904.$$ [[marks:3]]",
          },
          {
            text: "Describe the sample mean distribution for samples of size 64.",
            marks: 2,
            studentSpaceLines: 4,
            solutionText: "$$\\mu_{\\bar X}=3,\\quad \\sigma_{\\bar X}=\\frac{2.4}{8}=0.3.$$ [[marks:2]]",
          },
          {
            text: "Anika collected a table with sample size 100, mean 2.1 and standard deviation 2.7. Comment on Anika's claim.",
            marks: 4,
            studentSpaceLines: 6,
            solutionText:
              "The interval from the normal calculation is $1.5708$ to $2.6292$. [[marks:2]]\nThe claim is not accepted because the sample is biased. [[marks:2]]",
          },
        ],
      },
    },
    {
      id: "specialist-slope-field",
      diagramType: "graph2d",
      partCount: 3,
      hiddenMarks: 8,
      requiredText: ["slope field", "dy", "0.25", "x^2"],
      arguments: {
        questionNumber: 1,
        marks: 0,
        questionText: "The diagram shows a slope field for $\\frac{dy}{dx}=\\frac{x-1}{2y}$ and a solution curve through $(0,0.5)$.",
        diagram: {
          graphConfig: {
            type: "graph2d",
            xMin: -1,
            xMax: 3,
            yMin: -2,
            yMax: 2,
            functions: [{ kind: "relation", expression: "y^2 = x^2/2 - x + 1/4", color: "#1d4ed8" }],
            features: [{ kind: "tangent", functionIndex: 0, x: 0.5, label: "gradient 0.25" }],
            data: {
              slopeField: {
                expression: "(x - 1) / (2*y)",
                xRange: [-1, 3],
                yRange: [-2, 2],
                xStep: 0.5,
                yStep: 0.5,
                highlightedPoints: [{ x: 0.5, y: -1, label: "$(0.5,-1)$" }],
              },
            },
          },
        },
        parts: [
          {
            text: "Calculate $\\frac{dy}{dx}$ at $(0.5,-1)$ and draw the tangent direction on the slope field.",
            marks: 3,
            studentSpaceLines: 5,
            solutionText: "$$\\frac{dy}{dx}=0.25.$$ [[marks:3]]",
          },
          {
            text: "Find the equation of the solution curve through $(0,0.5)$.",
            marks: 3,
            studentSpaceLines: 6,
            solutionText: "$$y^2=\\frac{x^2}{2}-x+\\frac14.$$ [[marks:3]]",
          },
          {
            text: "Draw the solution curve on the slope-field diagram.",
            marks: 2,
            studentSpaceLines: 3,
            solutionText: "Draw the relation $y^2=x^2/2-x+1/4$ on the slope field. [[marks:2]]",
          },
        ],
      },
    },
    {
      id: "specialist-argand",
      diagramType: "graph2d",
      partCount: 4,
      hiddenMarks: 9,
      requiredText: ["Argand", "locus", "5\\pi", "z-i"],
      arguments: {
        questionNumber: 1,
        marks: 0,
        questionText:
          "On the Argand diagram, complex numbers $z_1$ and $z_2$ are shown. Describe the locus satisfying the circle and argument inequalities.",
        diagram: {
          graphConfig: {
            type: "graph2d",
            xMin: -4,
            xMax: 4,
            yMin: -2,
            yMax: 5,
            xAxisLabel: "Re",
            yAxisLabel: "Im",
            functions: [{ kind: "relation", expression: "x^2 + (y - 1)^2 = 4", color: "#2563eb" }],
            features: [
              { kind: "point", x: -1, y: 1.732, label: "$z_1$" },
              { kind: "point", x: 2, y: 0, label: "$z_2$" },
              { kind: "region_clipped_by_curve", baseFeatureIndex: 0, clipFunctionIndex: 0, clipSide: "inside", fillOpacity: 0.2 },
            ],
          },
        },
        parts: [
          { text: "Express $z_1$ in polar form.", marks: 2, studentSpaceLines: 4, solutionText: "$$z_1=2cis(5\\pi/6).$$ [[marks:2]]" },
          { text: "Write $z_2$ in Cartesian form.", marks: 1, studentSpaceLines: 3, solutionText: "$$z_2=2+0i.$$ [[marks:1]]" },
          {
            text: "Plot $z_1$ and $z_2$ on an Argand diagram.",
            marks: 2,
            studentSpaceLines: 3,
            solutionText: "Plot both points. [[marks:2]]",
          },
          {
            text: "Write equations or inequalities for the indicated locus whose upper boundary is part of a circle centred at $z=i$.",
            marks: 4,
            studentSpaceLines: 6,
            solutionText: "The locus is $|z-i|\\le2$ with $\\pi/6\\le\\arg(z)\\le5\\pi/6$. [[marks:4]]",
          },
        ],
      },
    },
    {
      id: "specialist-prism",
      diagramType: "graph3d",
      partCount: 3,
      hiddenMarks: 8,
      requiredText: ["rectangular prism", "BT", "sphere", "does not intersect"],
      arguments: {
        questionNumber: 1,
        marks: 0,
        questionText:
          "A rectangular prism is defined using the coordinate system shown with $A(2,0,0)$, $C(0,4,0)$ and $T(0,0,3)$. Point $M$ is the centre of face $OCFT$.",
        diagram: {
          graphConfig: {
            type: "graph3d",
            metadata: { view3d: { az: 1.1, el: 0.35, bank: 0 } },
            data: {
              points: [
                { id: "O", coords: [0, 0, 0] },
                { id: "A", coords: [2, 0, 0] },
                { id: "B", coords: [2, 4, 0] },
                { id: "C", coords: [0, 4, 0] },
                { id: "T", coords: [0, 0, 3] },
                { id: "M", coords: [0, 2, 1.5] },
              ],
              segments: [
                { from: "O", to: "A" },
                { from: "A", to: "B" },
                { from: "B", to: "C" },
                { from: "O", to: "T", strokeStyle: "dashed" },
                { from: "B", to: "T", label: "$BT$" },
                { from: "A", to: "M", label: "$AM$" },
              ],
            },
          },
        },
        parts: [
          {
            text: "Determine the vector equation for $BT$.",
            marks: 2,
            studentSpaceLines: 6,
            solutionText: "$$\\vec d=(-2,-4,3).$$ [[marks:2]]",
          },
          {
            text: "Determine the Cartesian equation of the sphere.",
            marks: 3,
            studentSpaceLines: 8,
            solutionText: "$$(x-1)^2+(y-2)^2+(z-1.5)^2=7.25.$$ [[marks:3]]",
          },
          {
            text: "Prove that $AM$ does not intersect $BT$.",
            marks: 3,
            studentSpaceLines: 10,
            solutionText: "The equations produce a contradiction, so $AM$ does not intersect $BT$. [[marks:3]]",
          },
        ],
      },
    },
    {
      id: "specialist-implicit",
      diagramType: "graph2d",
      partCount: 2,
      hiddenMarks: 6,
      requiredText: ["implicitly defines", "x^4", "-0.475", "0.225"],
      arguments: {
        questionNumber: 1,
        marks: 0,
        questionText: "The equation $x^3+y^3=3xy+y$ implicitly defines a curve with points A and B on the $x$-axis.",
        diagram: {
          graphConfig: {
            type: "graph2d",
            xMin: -1.5,
            xMax: 2.5,
            yMin: -1.5,
            yMax: 2.5,
            functions: [{ kind: "relation", expression: "x^3 + y^3 = 3xy + y", color: "#1d4ed8" }],
            features: [
              { kind: "point", x: 0, y: 0, label: "$O$" },
              { kind: "point", x: -0.475, y: 0, label: "$A$" },
              { kind: "point", x: 0.225, y: 0, label: "$B$" },
            ],
          },
        },
        parts: [
          {
            text: "Use implicit differentiation to find $\\frac{dy}{dx}$.",
            marks: 3,
            studentSpaceLines: 6,
            solutionText: "$$\\frac{dy}{dx}=\\frac{3y-3x^2}{3y^2-3x-1}.$$ [[marks:3]]",
          },
          {
            text: "Find the $x$ coordinates of A and B.",
            marks: 3,
            studentSpaceLines: 6,
            solutionText: "$$x^4-2x^2-x=0,$$ giving $x=-0.475$ and $x=0.225$. [[marks:3]]",
          },
        ],
      },
    },
  ];

  for (const item of cases) {
    const result = runMauthAssistantTool(documentFixture(), { name: "mauth.question.upsert", arguments: item.arguments });
    assert.equal(result.ok, true, item.id);
    const authored = result.document?.questions[0];
    assert.equal(authored?.parts?.length ?? 0, item.partCount, item.id);
    assert.equal(
      questionDiagrams(authored)[0]?.kind === "diagram" ? questionDiagrams(authored)[0].graphConfig.type : "",
      item.diagramType,
      item.id,
    );
    const combinedText = `${allQuestionText(authored)}\n${allSolutionText(authored)}`;
    for (const expectedText of item.requiredText)
      assert.match(combinedText, new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), item.id);
    assert.equal(hiddenMarkTotal(allSolutionText(authored)), item.hiddenMarks, item.id);

    const previewResult = runMauthAssistantTool(result.document!, { name: "mauth.preview.inspect", arguments: { questionNumber: 1 } });
    const preview = previewResult.data as MauthPreviewInspection;
    assert.equal(previewResult.ok, true, item.id);
    assert.equal(preview.question?.diagrams[0]?.graphType, item.diagramType, item.id);
    assert.equal(preview.question?.diagrams.flatMap((diagram) => diagram.warnings).length ?? 0, 0, item.id);

    const layoutResult = runMauthAssistantTool(result.document!, { name: "mauth.layout.check", arguments: { mode: "both" } });
    const layout = layoutResult.data as MauthLayoutCheck;
    const blockingLayoutCodes = new Set(["student-space-missing", "solution-hidden-mark-total-mismatch", "solution-visible-mark-note"]);
    assert.equal(layout.issues.filter((issue) => blockingLayoutCodes.has(issue.code)).length, 0, item.id);
  }
});

test("high-level question authoring builds source scalar-product vector diagrams from compact vector intent", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 2,
      marks: 0,
      questionText: "Evaluate the following scalar products exactly.",
      diagram: {
        diagramAlign: "center",
        vectorRayDiagram: {
          widthPx: 560,
          heightPx: 380,
          vectors: [
            { id: "a", length: 2, angleDeg: 215, lengthLabel: "2\\ \\text{units}", labelX: -2.25, labelY: -1.45 },
            { id: "b", length: 2, angleDeg: 135, lengthLabel: "2\\ \\text{units}", labelX: -1.7, labelY: 1.55 },
            { id: "c", length: 3, angleDeg: 80, lengthLabel: "3\\ \\text{units}", labelX: 0.38, labelY: 3.1 },
            { id: "d", length: 2, angleDeg: 35, lengthLabel: "2\\ \\text{units}", labelX: 2.2, labelY: 1.35 },
          ],
          angleMarkers: [
            { from: "b", to: "d", rightAngle: true, radius: 0.42 },
            { from: "c", to: "d", label: "45^\\circ", radius: 0.72, labelX: 0.95, labelY: 0.78 },
          ],
        },
      },
      parts: [
        { text: "$\\mathbf{a}\\cdot\\mathbf{b}$", marks: 1, answerSurface: "none" },
        { text: "$\\mathbf{a}\\cdot\\mathbf{d}$", marks: 2, answerSurface: "none" },
        { text: "$\\mathbf{c}\\cdot\\mathbf{d}$", marks: 2, answerSurface: "none" },
      ],
    },
  });
  const appended = result.document?.questions[1];
  const diagram = appended?.contentBlocks.find((block) => block.kind === "diagram");
  const graphConfig = diagram?.kind === "diagram" ? diagram.graphConfig : undefined;
  const vector2d = graphConfig?.metadata?.vector2d as
    | {
        vectors?: Array<Record<string, unknown>>;
        segmentLabels?: Array<Record<string, unknown>>;
        angleMarkers?: Array<Record<string, unknown>>;
      }
    | undefined;
  const warnings = graphConfig
    ? inspectMauthDiagram(
        graphConfig,
        "Evaluate $\\mathbf{a}\\cdot\\mathbf{b}$, $\\mathbf{a}\\cdot\\mathbf{d}$ and $\\mathbf{c}\\cdot\\mathbf{d}$.",
      ).warnings
    : [];

  assert.equal(result.ok, true);
  assert.equal(appended?.marks, 0);
  assert.equal(appended?.parts.length, 3);
  assert.equal(graphConfig?.type, "vector2d");
  assert.equal(graphConfig?.showAxes, false);
  assert.equal(graphConfig?.showGrid, false);
  assert.equal(graphConfig?.showAxisLabels, false);
  assert.equal(graphConfig?.showAxisNumbers, false);
  assert.equal(graphConfig?.equalScale, true);
  assert.equal(vector2d?.vectors?.length, 4);
  assert.deepEqual(
    vector2d?.vectors?.map((vector) => vector.id),
    ["a", "b", "c", "d"],
  );
  assert.equal(vector2d?.segmentLabels?.length, 4);
  assert.equal(vector2d?.angleMarkers?.length, 2);
  assert.equal(
    vector2d?.angleMarkers?.some((marker) => marker.rightAngle === true),
    true,
  );
  assert.equal(
    vector2d?.angleMarkers?.some((marker) => marker.label === "45^\\circ"),
    true,
  );
  assert.equal(
    warnings.some((warning) => isAssistantDiagramInspectionWarningBlocking(warning)),
    false,
  );
});

test("high-level question authoring rejects incomplete compact vector diagrams before apply", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 2,
      marks: 5,
      questionText: "Evaluate the following scalar products exactly.",
      diagram: {
        vectorRayDiagram: {
          vectors: [
            { length: 2, angleDeg: 215 },
            { id: "b", length: 2 },
          ],
          angleMarkers: [{ from: "b", to: "d", label: "45^\\circ" }],
        },
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; expected?: string }> };

  assert.equal(result.ok, false);
  assert.equal(result.document, undefined);
  assert(data.validationIssues?.some((issue) => issue.path === "arguments.diagram.vectorRayDiagram.vectors[0].id"));
  assert(data.validationIssues?.some((issue) => issue.path === "arguments.diagram.vectorRayDiagram.vectors[1].length"));
  assert(data.validationIssues?.some((issue) => issue.path === "arguments.diagram.vectorRayDiagram.angleMarkers[0].to"));
});

test("high-level question authoring can pair diagram answer surfaces without separate working space", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 1,
      marks: 2,
      questionText: "Sketch the graph on the grid and identify all intercepts.",
      answerSurface: "diagram",
      studentSpaceLines: 8,
      diagram: {
        graphConfig: {
          type: "graph2d",
          xMin: -4,
          xMax: 4,
          yMin: -12,
          yMax: 10,
          functions: [],
        },
      },
      solutionDiagram: {
        graphConfig: {
          type: "graph2d",
          xMin: -4,
          xMax: 4,
          yMin: -12,
          yMax: 10,
          functions: [{ expression: "-2*(x+2)*(x-2)", label: "$y=-2(x+2)(x-2)$", show: true }],
        },
      },
      solutionText: "Intercepts are $(-2,0)$, $(2,0)$ and $(0,8)$. [[marks:2]]",
    },
  });
  const blocks = result.document?.questions[0].contentBlocks ?? [];

  assert.equal(result.ok, true);
  assert.equal(
    blocks.some((block) => block.kind === "space"),
    false,
  );
  assert.equal(blocks[1].kind, "diagram");
  assert.equal(blocks[1].visibility, "student");
  assert.equal(blocks[2].kind, "diagram");
  assert.equal(blocks[2].visibility, "solution");
  assert.equal(blocks[2].markTicks, 2);
  assert.equal(blocks[3].kind, "text");
  assert.equal(blocks[3].visibility, "solution");
  assert.match(blocks[3].kind === "text" ? blocks[3].text : "", /^\*\*Solution\.\*\*/);
  assert.equal(blocks[3].kind === "text" ? blocks[3].text.includes("[[marks:") : true, false);
});

test("high-level question authoring infers sketch diagrams are answer surfaces", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 1,
      marks: 2,
      questionText: "Sketch the graph on the grid and identify all intercepts.",
      studentSpaceLines: 8,
      diagram: {
        graphConfig: {
          type: "graph2d",
          xMin: -4,
          xMax: 4,
          yMin: -12,
          yMax: 10,
          functions: [],
        },
      },
      solutionDiagram: {
        graphConfig: {
          type: "graph2d",
          xMin: -4,
          xMax: 4,
          yMin: -12,
          yMax: 10,
          functions: [{ expression: "x^2-4", label: "$y=x^2-4$", show: true }],
        },
      },
      solutionText: "Intercepts are $(-2,0)$ and $(2,0)$. [[marks:2]]",
    },
  });
  const blocks = result.document?.questions[0].contentBlocks ?? [];

  assert.equal(result.ok, true);
  assert.equal(
    blocks.some((block) => block.kind === "space"),
    false,
  );
  assert.equal(blocks[1].kind, "diagram");
  assert.equal(blocks[1].visibility, "student");
  assert.equal(blocks[2].kind, "diagram");
  assert.equal(blocks[2].visibility, "solution");
  assert.equal(blocks[2].markTicks, 2);
});

test("high-level part authoring can pair completion tables as answer surfaces", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 1,
      marks: 0,
      questionText: "Complete the table.",
      parts: [
        {
          text: "Fill in the missing values.",
          marks: 2,
          answerSurface: "table",
          table: {
            headers: ["$x$", "1", "2", "3"],
            rows: [["$P(X=x)$", "", "", ""]],
            showHeader: false,
          },
          solutionTable: {
            headers: ["$x$", "1", "2", "3"],
            rows: [["$P(X=x)$", "$\\\\frac{1}{6}$", "$\\\\frac{1}{3}$", "$\\\\frac{1}{2}$"]],
            showHeader: false,
          },
          solutionText: "The probabilities sum to $1$. [[marks:2]]",
        },
      ],
    },
  });
  const partBlocks = result.document?.questions[0].parts[0].contentBlocks ?? [];

  assert.equal(result.ok, true);
  assert.equal(
    partBlocks.some((block) => block.kind === "space"),
    false,
  );
  assert.equal(partBlocks[1].kind, "table");
  assert.equal(partBlocks[1].visibility, "student");
  assert.equal(partBlocks[2].kind, "table");
  assert.equal(partBlocks[2].visibility, "solution");
  assert.equal(partBlocks[2].markTicks, 2);
  assert.equal(partBlocks[3].kind, "text");
  assert.equal(partBlocks[3].visibility, "solution");
  assert.equal(partBlocks[3].kind === "text" ? partBlocks[3].text.includes("[[marks:") : true, false);
});

test("high-level part authoring infers completion tables are answer surfaces", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 1,
      marks: 0,
      questionText: "Complete the table.",
      parts: [
        {
          text: "For $y=x^2-4$, complete the table of values.",
          marks: 2,
          table: {
            headers: ["$x$", "$-2$", "$0$", "$2$"],
            rows: [["$y$", "", "", ""]],
            showHeader: false,
          },
          solutionTable: {
            headers: ["$x$", "$-2$", "$0$", "$2$"],
            rows: [["$y$", "$0$", "$-4$", "$0$"]],
            showHeader: false,
          },
          solutionText: "The completed table is shown. [[marks:2]]",
        },
      ],
    },
  });
  const partBlocks = result.document?.questions[0].parts[0].contentBlocks ?? [];

  assert.equal(result.ok, true);
  assert.equal(
    partBlocks.some((block) => block.kind === "space"),
    false,
  );
  assert.equal(partBlocks[1].kind, "table");
  assert.equal(partBlocks[1].visibility, "student");
  assert.equal(partBlocks[2].kind, "table");
  assert.equal(partBlocks[2].visibility, "solution");
  assert.equal(partBlocks[2].markTicks, 2);
});

test("high-level question authoring rejects skipped question numbers", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 4,
      marks: 2,
      questionText: "Find $x$.",
      studentSpaceLines: 6,
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; expected?: string; message: string }> };

  assert.equal(result.ok, false);
  assert.equal(result.document, undefined);
  assert(data.validationIssues?.some((issue) => issue.path === "arguments.questionNumber" && issue.expected === "1 to 2"));
});

test("preserves existing diagrams when replacing question text without diagram arguments", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 1,
      marks: 4,
      questionText: "Find the new value of $x$.",
      studentSpaceLines: 8,
      solutionText: "$x=4$. [[marks:4]]",
    },
  });
  const blocks = result.document?.questions[0].contentBlocks ?? [];
  const diagram = blocks.find((block) => block.kind === "diagram");

  assert.equal(result.ok, true);
  assert.equal(result.document?.questions[0].marks, 4);
  assert.equal(diagram?.id, "d1");
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.type : "", "statsChart");
});

test("allows explicit diagram removal when replace question supplies an empty diagram list", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 3,
      questionText: "Find the value without a diagram.",
      studentSpaceLines: 6,
      diagrams: [],
    },
  });
  const blocks = result.document?.questions[0].contentBlocks ?? [];

  assert.equal(result.ok, true);
  assert.equal(
    blocks.some((block) => block.kind === "diagram"),
    false,
  );
});

test("rejects unwrapped high-level diagram payloads before applying", () => {
  const topLevelResult = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 5,
      questionText: "Evaluate the following scalar products exactly.",
      studentSpaceLines: 8,
      diagram: {
        type: "geometricConstruction",
        options: {
          substanceSource: "Point O, A\nLabel O $O$\nLabel A $A$\n",
        },
      },
    },
  });
  const aliasResult = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagram: {
        config: {
          type: "geometricConstruction",
          options: {
            substanceSource: "Point O, A\nLabel O $O$\nLabel A $A$\n",
          },
        },
      },
    },
  });
  const topLevelData = topLevelResult.data as { validationIssues?: Array<{ path: string; message: string }> };
  const aliasData = aliasResult.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(topLevelResult.ok, false);
  assert.equal(aliasResult.ok, false);
  assert(topLevelData.validationIssues?.some((issue) => issue.path === "arguments.diagram.graphConfig"));
  assert(topLevelData.validationIssues?.some((issue) => issue.message.includes("wrap renderer field type")));
  assert(aliasData.validationIssues?.some((issue) => issue.path === "arguments.diagram.graphConfig"));
  assert(aliasData.validationIssues?.some((issue) => issue.message.includes("must be named graphConfig")));
});

test("addDiagram points new-question misuse back to question upsert", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 2,
      diagram: {
        graphConfig: {
          type: "vector2d",
          data: {},
        },
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; expected?: string }> };

  assert.equal(result.ok, false);
  assert(
    data.validationIssues?.some((issue) => issue.path === "arguments.questionNumber" && issue.expected?.includes("mauth.question.upsert")),
  );
});

test("rejects obvious diagram renderer mismatches before applying", () => {
  const scalarProductResult = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 5,
      questionText: "Evaluate the following scalar products exactly.",
      parts: [
        { text: "$\\mathbf{a}\\cdot\\mathbf{b}$", marks: 1, studentSpaceLines: 3 },
        { text: "$\\mathbf{a}\\cdot\\mathbf{d}$", marks: 2, studentSpaceLines: 4 },
      ],
      diagram: {
        graphConfig: {
          type: "network",
          data: { nodes: [], edges: [] },
        },
      },
    },
  });
  const coordinateVectorResult = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 2,
      questionText: "Draw vector $\\mathbf{a}=(2,3)$ from the origin on the coordinate axes.",
      diagram: {
        graphConfig: {
          type: "geometricConstruction",
          data: {},
          options: { substanceSource: "Point O, A\nSegment(OA, O, A)\n" },
        },
      },
    },
  });
  const statsChartResult = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 2,
      questionText: "The probability graph below shows $P(X=x)$ for a discrete random variable.",
      diagram: {
        graphConfig: {
          type: "graph2d",
          functions: [],
        },
      },
    },
  });
  const densityCurveResult = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 3,
      questionText:
        "The distribution is given by the probability density function shown below. Sketch the likely distribution of the sample mean.",
      diagram: {
        graphConfig: {
          type: "graph2d",
          functions: [{ expression: "exp(-x^2)" }],
        },
      },
    },
  });
  const circleGeometryResult = runMauthAssistantTool(
    {
      ...documentFixture(),
      questions: [
        question("q1", [textBlock("t1", "$A$, $B$ and $C$ are points on a circle. The tangent at $A$ is parallel to chord $BC$.")]),
      ],
    },
    {
      name: "mauth.author.addDiagram",
      arguments: {
        questionNumber: 1,
        diagram: {
          graphConfig: {
            type: "graph2d",
            functions: [],
          },
        },
      },
    },
  );
  const scalarData = scalarProductResult.data as { validationIssues?: Array<{ path: string; message: string; expected?: string }> };
  const vectorData = coordinateVectorResult.data as { validationIssues?: Array<{ path: string; message: string; expected?: string }> };
  const statsData = statsChartResult.data as { validationIssues?: Array<{ path: string; message: string; expected?: string }> };
  const densityData = densityCurveResult.data as { validationIssues?: Array<{ path: string; message: string; expected?: string }> };
  const circleData = circleGeometryResult.data as { validationIssues?: Array<{ path: string; message: string; expected?: string }> };

  assert.equal(scalarProductResult.ok, false);
  assert(scalarData.validationIssues?.some((issue) => issue.path === "arguments.diagram.graphConfig.type"));
  assert(scalarData.validationIssues?.some((issue) => issue.expected === "vector2d"));
  assert.match(scalarProductResult.error ?? "", /scalar-product ray diagram/);
  assert.equal(coordinateVectorResult.ok, false);
  assert(vectorData.validationIssues?.some((issue) => issue.expected === "vector2d"));
  assert.match(coordinateVectorResult.error ?? "", /coordinate vector diagram/);
  assert.equal(statsChartResult.ok, false);
  assert(statsData.validationIssues?.some((issue) => issue.expected === "statsChart"));
  assert.match(statsChartResult.error ?? "", /statistics chart/);
  assert.equal(densityCurveResult.ok, false);
  assert(densityData.validationIssues?.some((issue) => issue.expected === "statsChart"));
  assert.match(densityCurveResult.error ?? "", /statistics chart/);
  assert.equal(circleGeometryResult.ok, false);
  assert(circleData.validationIssues?.some((issue) => issue.expected === "geometricConstruction"));
  assert.match(circleGeometryResult.error ?? "", /schematic geometry diagram/);
});

test("replaces a question with structured parts from a high-level authoring payload", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 0,
      questionText: "A random variable $X$ has the following binomial distribution.",
      studentSpaceLines: 1,
      parts: [
        {
          text: "State the number of trials.",
          marks: 1,
          studentSpaceLines: 3,
          solutionText: "$n=6$.",
        },
        {
          text: "Calculate $P(X=3)$.",
          marks: 2,
          studentSpaceLines: 6,
          solutionText: "$P(X=3)=\\binom{6}{3}(0.8)^3(0.2)^3=0.08192$.",
        },
      ],
    },
  });
  const question = result.document?.questions[0];

  assert.equal(result.ok, true);
  assert.equal(question?.marks, 0);
  assert.equal(question?.parts.length, 2);
  assert.deepEqual(question?.itemOrder, [
    { kind: "block", id: "q1-question-text" },
    { kind: "block", id: "d1" },
    { kind: "part", id: "q1-part-1" },
    { kind: "part", id: "q1-part-2" },
  ]);
  assert.equal(question?.parts[0].label, "a");
  assert.equal(question?.parts[0].marks, 1);
  assert.equal(question?.parts[0].text, "State the number of trials.");
  assert.equal(question?.parts[0].contentBlocks[0].kind, "text");
  assert.equal(
    question?.parts[0].contentBlocks[0].kind === "text" ? question.parts[0].contentBlocks[0].text : "",
    "State the number of trials.",
  );
  assert.equal(question?.parts[0].contentBlocks[1].kind, "space");
  assert.equal(question?.parts[0].contentBlocks[1].visibility, "student");
  assert.equal(question?.parts[0].contentBlocks[2].kind, "text");
  assert.equal(question?.parts[0].contentBlocks[2].visibility, "solution");
});

test("rejects high-level authoring parts with blank or label-only prompts", () => {
  const blankResult = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 0,
      questionText: "Evaluate the following scalar products exactly.",
      studentSpaceLines: 1,
      parts: [{ text: "   ", marks: 1, studentSpaceLines: 3 }],
    },
  });
  const labelOnlyResult = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 0,
      questionText: "Evaluate the following scalar products exactly.",
      studentSpaceLines: 1,
      parts: [{ text: "(a)", marks: 1, studentSpaceLines: 3 }],
    },
  });
  const labelOnlyData = labelOnlyResult.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(blankResult.ok, false);
  assert.match(blankResult.error ?? "", /non-empty string/);
  assert.equal(labelOnlyResult.ok, false);
  assert(labelOnlyData.validationIssues?.some((issue) => issue.message.includes("actual part prompt")));
});

test("adds a renderer-specific diagram graphConfig to a question", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagramAlign: "left",
      diagram: {
        graphConfig: {
          type: "geometricConstruction",
          data: {},
          options: {
            substanceSource: "Point A\nLabel A $A$\n",
          },
          metadata: {
            assistantDiagramRole: "main-question-diagram",
          },
        },
      },
      placement: "beforeStudentSpace",
    },
  });
  const question = result.document?.questions[0];
  const blocks = question?.contentBlocks ?? [];
  const diagram = blocks.find((block) => block.kind === "diagram" && block.graphConfig.type === "geometricConstruction");
  const spaceIndex = blocks.findIndex((block) => block.kind === "space");
  const diagramIndex = blocks.findIndex((block) => block.kind === "diagram");

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedIds, ["q1"]);
  assert.equal(diagram?.kind === "diagram" ? diagram.diagramAlign : "", "left");
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.metadata?.assistantDiagramRole : "", "main-question-diagram");
  assert(diagramIndex >= 0);
  assert(spaceIndex >= 0);
  assert(diagramIndex < spaceIndex);
});

test("replaces an existing diagram through high-level addDiagram when diagramId is supplied", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagramId: "d1",
      diagramAlign: "left",
      diagram: {
        graphConfig: {
          type: "geometricConstruction",
          data: {},
          options: {
            substanceSource: "Point A\nLabel A $A$\n",
          },
        },
      },
    },
  });
  const diagrams = result.document?.questions[0].contentBlocks.filter((block) => block.kind === "diagram") ?? [];
  const diagram = diagrams[0];

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedIds, ["q1"]);
  assert.equal(diagrams.length, 1);
  assert.equal(diagram.id, "d1");
  assert.equal(diagram.kind === "diagram" ? diagram.graphConfig.type : "", "geometricConstruction");
  assert.equal(diagram.kind === "diagram" ? diagram.diagramAlign : "", "left");
});

test("rejects high-level diagram replacement when the diagramId is not in the target question", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagramId: "missing-diagram",
      diagram: {
        graphConfig: {
          type: "geometricConstruction",
          data: {},
          options: {
            substanceSource: "Point A\nLabel A $A$\n",
          },
        },
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert.equal(data.validationIssues?.[0]?.path, "arguments.diagramId");
  assert.match(data.validationIssues?.[0]?.message ?? "", /existing top-level diagram/);
});

test("adds a custom Penrose tangent-parallel-chord diagram", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagram: {
        graphConfig: {
          type: "geometricConstruction",
          data: {
            objects: [
              { type: "point", name: "O", label: "\\,", hidePoint: true, hideLabel: true },
              { type: "point", name: "A", label: "A" },
              { type: "point", name: "B", label: "B" },
              { type: "point", name: "C", label: "C" },
            ],
            relationships: [
              { type: "segment", name: "AB", points: ["A", "B"] },
              { type: "segment", name: "AC", points: ["A", "C"] },
              { type: "segment", name: "BC", points: ["B", "C"] },
            ],
          },
          options: {
            substanceSource: [
              "Point O, A, B, C",
              "Line tangentA",
              "Circle omega",
              "NamedSegment AB, AC, BC",
              "Label O $\\,$",
              "Label A $A$",
              "Label B $B$",
              "Label C $C$",
              "CircleThrough(omega, O, A)",
              "OnCircle(B, omega)",
              "OnCircle(C, omega)",
              "Tangent(tangentA, omega, A)",
              "ParallelToSegment(tangentA, B, C)",
              "HidePoint(O)",
              "Segment(AB, A, B)",
              "Segment(AC, A, C)",
              "Segment(BC, B, C)",
            ].join("\n"),
          },
          metadata: { renderer: "penrose" },
        },
      },
      placement: "beforeStudentSpace",
    },
  });
  const question = result.document?.questions[0];
  const blocks = question?.contentBlocks ?? [];
  const diagram = blocks.find((block) => block.kind === "diagram" && block.graphConfig.type === "geometricConstruction");
  const substanceSource = diagram?.kind === "diagram" ? String(diagram.graphConfig.options?.substanceSource ?? "") : "";

  assert.equal(result.ok, true);
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.type : "", "geometricConstruction");
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.metadata?.renderer : "", "penrose");
  assert.match(substanceSource, /Tangent\(tangentA, omega, A\)/);
  assert.match(substanceSource, /ParallelToSegment\(tangentA, B, C\)/);
  assert.match(substanceSource, /Segment\(BC, B, C\)/);
});

test("ensures top-level solution and student space for a question", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.ensureSolutions",
    arguments: {
      questions: [
        {
          questionNumber: 1,
          studentSpaceLines: 9,
          solutionText: "Apply the alternate segment theorem to obtain the required angle equality.",
        },
      ],
    },
  });
  const blocks = result.document?.questions[0].contentBlocks ?? [];
  const studentSpace = blocks.find((block) => block.kind === "space");
  const solution = blocks.find((block) => block.kind === "text" && block.visibility === "solution");

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedIds, ["q1"]);
  assert.equal(studentSpace?.kind === "space" ? studentSpace.lines : 0, 9);
  assert.match(solution?.kind === "text" ? solution.text : "", /^\*\*Solution\.\*\*/);
});

test("updates top-level marks through the solution authoring wrapper without removing diagrams", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.ensureSolutions",
    arguments: {
      questions: [
        {
          questionNumber: 1,
          marks: 4,
          studentSpaceLines: 10,
          solutionText:
            "First valid step. [[marks:1]]\nSecond valid step. [[marks:1]]\nThird valid step. [[marks:1]]\nConclusion. [[marks:1]]",
        },
      ],
    },
  });
  const question = result.document?.questions[0];
  const blocks = question?.contentBlocks ?? [];
  const solution = blocks.find((block) => block.kind === "text" && block.visibility === "solution");

  assert.equal(result.ok, true);
  assert.equal(question?.marks, 4);
  assert.equal(
    blocks.some((block) => block.kind === "diagram" && block.id === "d1"),
    true,
  );
  assert.equal(solution?.kind === "text" ? solution.text.includes("[[marks:1]]") : false, true);
});

test("writes all marked solutions and preserves existing diagrams", () => {
  const document = documentFixture();
  document.questions = [
    question("q1", [textBlock("q1-text", "Use the chart to calculate the probability."), diagramBlock("q1-diagram", statsChartConfig())]),
    {
      id: "q2",
      marks: 0,
      contentBlocks: [textBlock("q2-text", "A discrete random variable has probability function $P(X=x)=k/x$.")],
      parts: [
        {
          id: "q2-a",
          label: "a",
          marks: 1,
          text: "Find $k$.",
          contentBlocks: [],
          subparts: [],
          itemOrder: [],
        },
        {
          id: "q2-b",
          label: "b",
          marks: 0,
          text: "Use your value of $k$.",
          contentBlocks: [],
          subparts: [
            {
              id: "q2-b-i",
              label: "i",
              marks: 2,
              text: "Find $E(X)$.",
              contentBlocks: [],
              itemOrder: [],
            },
          ],
          itemOrder: [{ kind: "subpart", id: "q2-b-i" }],
        },
      ],
      itemOrder: [
        { kind: "block", id: "q2-text" },
        { kind: "part", id: "q2-a" },
        { kind: "part", id: "q2-b" },
      ],
    },
  ];

  const result = runMauthAssistantTool(document, {
    name: "mauth.solutions.writeAll",
    arguments: {
      questions: [
        {
          questionNumber: 1,
          marks: 2,
          studentSpaceLines: 8,
          solutionText: "Read the chart value. [[marks:1]] State the probability clearly. [[marks:1]]",
        },
        {
          questionNumber: 2,
          questionMarks: 0,
          parts: [
            {
              label: "a",
              marks: 1,
              solutionText: "$$k\\sum \\frac1x=1.$$ [[marks:1]]",
            },
            {
              label: "b",
              marks: 0,
              subparts: [
                {
                  label: "i",
                  marks: 2,
                  solutionText: "$$E(X)=\\sum x\\frac{k}{x}.$$ [[marks:1]] Substitute $k$. [[marks:1]]",
                },
              ],
            },
          ],
        },
      ],
    },
  });
  const next = result.document;
  const q1Blocks = next?.questions[0].contentBlocks ?? [];
  const q2Parts = next?.questions[1].parts ?? [];
  const q1Solution = q1Blocks.find((block) => block.kind === "text" && block.visibility === "solution");
  const q2PartSolution = q2Parts[0]?.contentBlocks.find((block) => block.kind === "text" && block.visibility === "solution");
  const q2SubpartSolution = q2Parts[1]?.subparts?.[0]?.contentBlocks.find(
    (block) => block.kind === "text" && block.visibility === "solution",
  );
  const allSolutionText = [q1Solution, q2PartSolution, q2SubpartSolution]
    .map((block) => (block?.kind === "text" ? block.text : ""))
    .join("\n");

  assert.equal(result.ok, true);
  assert.equal(
    q1Blocks.some((block) => block.kind === "diagram" && block.id === "q1-diagram"),
    true,
  );
  assert.equal(
    q1Blocks.some((block) => block.kind === "space" && block.visibility === "student" && block.lines >= 8),
    true,
  );
  assert.equal(
    q2Parts[0]?.contentBlocks.some((block) => block.kind === "space" && block.visibility === "student"),
    true,
  );
  assert.equal(
    q2Parts[1]?.subparts?.[0]?.contentBlocks.some((block) => block.kind === "space" && block.visibility === "student"),
    true,
  );
  assert.equal(hiddenMarkTotal(allSolutionText), 5);
  assert.equal(result.data && typeof result.data === "object" && "layout" in result.data, true);
});

test("requires whole-test solution payload coverage for every marked scope", () => {
  const document = documentFixture();
  document.questions.push(question("q2", [textBlock("q2-text", "Find $E(X)$.")]));

  const result = runMauthAssistantTool(document, {
    name: "mauth.solutions.writeAll",
    arguments: {
      questions: [
        {
          questionNumber: 1,
          solutionText: "First solution. [[marks:2]]",
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /every marked question/);
  assert(data.validationIssues?.some((issue) => issue.path === "questions[1]" && issue.message.includes("Question 2")));
});

test("runs a document-wide layout check for missing solution and answer-space risks", () => {
  const document = documentFixture();
  document.questions = [
    question("q1", [textBlock("q1-text", "Find $x$."), textBlock("q1-solution", "**Solution.**\n$x=3$. [[marks:2]]", "solution")]),
    question("q2", [
      textBlock("q2-text", "Use the oversized diagram."),
      diagramBlock("q2-diagram", {
        type: "graph2d",
        xMin: -10,
        xMax: 10,
        yMin: -10,
        yMax: 10,
        functions: [],
        options: { widthPx: 760, heightPx: 720 },
      } as unknown as GraphConfig),
      spaceBlock("q2-space", 6),
    ]),
  ];

  const result = runMauthAssistantTool(document, { name: "mauth.layout.check", arguments: { mode: "both" } });
  const check = result.data as MauthLayoutCheck;
  const warningCodes = check.issues.map((warning) => warning.code);

  assert.equal(result.ok, true);
  assert.equal(check.ok, false);
  assert(warningCodes.includes("student-answer-surface-missing"));
  assert(warningCodes.includes("diagram-oversized-print-risk"));
  assert(warningCodes.includes("solution-missing"));
});

test("normalises visible assistant mark notes into hidden solution tick annotations", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.ensureSolutions",
    arguments: {
      questions: [
        {
          questionNumber: 1,
          studentSpaceLines: 9,
          solutionText:
            "Solution (5 marks). Let $\\ell$ be the tangent.\n" +
            "$\\angle(\\ell,AB)=\\angle ACB$. [1 mark]\n" +
            "$\\angle(\\ell,AB)=\\angle CBA$. [1 mark]\n" +
            "$AB=AC$. [1 mark for clear conclusion]",
        },
      ],
    },
  });
  const solution = result.document?.questions[0].contentBlocks.find((block) => block.kind === "text" && block.visibility === "solution");
  const text = solution?.kind === "text" ? solution.text : "";

  assert.equal(result.ok, true);
  assert.match(text, /^\*\*Solution\.\*\*\n\nLet \$\\ell\$ be the tangent\./);
  assert(!text.includes("[1 mark]"));
  assert(!text.includes("Solution (5 marks)"));
  assert.equal((text.match(/\[\[marks:1\]\]/g) ?? []).length, 3);
});

test("moves standalone visible mark notes onto solution lines", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.ensureSolutions",
    arguments: {
      questions: [
        {
          questionNumber: 1,
          solutionText: "First theorem step.\n[1 mark]\n\nSecond theorem step.\n1 mark for conclusion",
        },
      ],
    },
  });
  const solution = result.document?.questions[0].contentBlocks.find((block) => block.kind === "text" && block.visibility === "solution");
  const text = solution?.kind === "text" ? solution.text : "";

  assert.equal(result.ok, true);
  assert.match(text, /First theorem step\. \[\[marks:1\]\]/);
  assert.match(text, /Second theorem step\. \[\[marks:1\]\]/);
  assert(!text.includes("[1 mark]"));
  assert(!text.includes("1 mark for"));
});

test("adds fallback hidden mark ticks when high-level solution text omits mark annotations", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.ensureSolutions",
    arguments: {
      questions: [
        {
          questionNumber: 1,
          studentSpaceLines: 4,
          solutionText: "Use the tangent theorem.\nConclude the required result.",
        },
      ],
    },
  });
  const blocks = result.document?.questions[0].contentBlocks ?? [];
  const studentSpace = blocks.find((block) => block.kind === "space");
  const solution = blocks.find((block) => block.kind === "text" && block.visibility === "solution");
  const text = solution?.kind === "text" ? solution.text : "";

  assert.equal(result.ok, true);
  assert.equal((text.match(/\[\[marks:1\]\]/g) ?? []).length, 2);
  assert.equal(studentSpace?.kind === "space" ? studentSpace.lines : 0, 8);
});

test("adjusts response spaces without rewriting diagrams or solutions", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.adjustResponseSpaces",
    arguments: {
      targets: [{ questionNumber: 1, lines: 12 }],
    },
  });
  const blocks = result.document?.questions[0].contentBlocks ?? [];
  const studentSpace = blocks.find((block) => block.kind === "space");

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedIds, ["q1"]);
  assert.equal(studentSpace?.kind === "space" ? studentSpace.lines : 0, 12);
  assert.equal(
    blocks.some((block) => block.kind === "diagram" && block.id === "d1"),
    true,
  );
  assert.equal(
    blocks.some((block) => block.kind === "text" && block.visibility === "solution" && block.id === "sol1"),
    true,
  );
});

test("adds part response space through the high-level response-space tool", () => {
  const document = documentFixture();
  document.questions[0] = {
    ...document.questions[0],
    contentBlocks: [textBlock("t1", "Use the diagram.")],
    parts: [
      {
        id: "p1",
        label: "a",
        text: "Find $x$.",
        marks: 2,
        contentBlocks: [textBlock("pt1", "Find $x$.")],
        subparts: [],
        itemOrder: [{ kind: "block", id: "pt1" }],
      },
    ],
    itemOrder: [
      { kind: "block", id: "t1" },
      { kind: "part", id: "p1" },
    ],
  };
  const result = runMauthAssistantTool(document, {
    name: "mauth.author.adjustResponseSpaces",
    arguments: {
      targets: [{ questionNumber: 1, partLabel: "a", lines: 6 }],
    },
  });
  const part = result.document?.questions[0].parts?.[0];

  assert.equal(result.ok, true);
  assert.equal(part?.contentBlocks[1]?.kind, "space");
  assert.equal(part?.contentBlocks[1]?.kind === "space" ? part.contentBlocks[1].lines : 0, 6);
  assert.deepEqual(part?.itemOrder, [
    { kind: "block", id: "pt1" },
    { kind: "block", id: "p1-student-space" },
  ]);
});

test("normalises low-level assistant solution patches before applying them", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.apply",
    arguments: {
      actions: [
        {
          type: "module.update",
          scope: { kind: "question", questionId: "q1" },
          blockId: "sol1",
          patch: {
            text:
              "**Solution (5 marks).** Let $\\ell$ be the tangent.\n\n" +
              "$$\n\\angle(\\ell,AB)=\\angle ACB. \\qquad \\text{[1 mark]}\n$$\n" +
              "$$AB=AC.$$ \\text{[1 mark]}\n" +
              "This proves the result. $\\qquad$ **[1 mark for clear conclusion]**",
          },
        },
      ],
    },
  });
  const solution = result.document?.questions[0].contentBlocks.find((block) => block.id === "sol1");
  const text = solution?.kind === "text" ? solution.text : "";

  assert.equal(result.ok, true);
  assert.match(text, /^\*\*Solution\.\*\*\n\nLet \$\\ell\$ be the tangent\./);
  assert(!text.includes("[1 mark]"));
  assert(!text.includes("Solution (5 marks)"));
  assert.match(text, /\$\$\n\\angle\(\\ell,AB\)=\\angle ACB\.\n\$\$ \[\[marks:1\]\]/);
  assert.match(text, /\$\$AB=AC\.\$\$ \[\[marks:1\]\]/);
  assert.equal((text.match(/\[\[marks:1\]\]/g) ?? []).length, 3);
});

test("rejects malformed high-level authoring payloads before editing the document", () => {
  const document = documentFixture();
  const result = runMauthAssistantTool(document, {
    name: "mauth.author.replaceQuestion",
    arguments: {
      questionNumber: 1,
      marks: 2,
      questionText: "Find the distribution.",
      diagram: {
        graphConfig: {
          type: "statsChart",
          data: {
            chartType: "histogram",
            dataMode: "manualProbabilities",
            xValues: [1, 2],
            probabilities: [0.5],
          },
        },
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Mauth action validation failed/);
  assert(data.validationIssues?.some((issue) => issue.path.includes("probabilities")));
  assert.equal(document.questions[0].contentBlocks.length, 4);
});

test("unwraps provider-style nested action tool calls", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      name: "mauth.actions.preview",
      arguments: {
        actions: [
          {
            type: "frontMatter.update",
            patch: { assessmentTitle: "Nested Provider Test" },
          },
        ],
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedIds, ["frontMatter"]);
  assert.equal(result.document?.frontMatter.assessmentTitle, "Nested Provider Test");
});

test("rejects unsupported action types before they reach the action engine", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: { action: { type: "dangerous.rawPatch", value: true } },
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Unsupported Mauth action type/);
});

test("rejects malformed action payload fields before they reach the action engine", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [{ id: "s2", kind: "space", lines: "4" }],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Mauth action validation failed/);
  assert.match(result.error ?? "", /actions\[0\]\.blocks\[0\]\.lines/);
  assert.equal(data.validationIssues?.[0]?.path, "actions[0].blocks[0].lines");
});

test("rejects malformed document action payload fields before they reach the action engine", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      action: {
        type: "frontMatter.update",
        patch: "assessmentTitle: Bad Shape",
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert.equal(data.validationIssues?.[0]?.path, "actions[0].patch");
  assert.match(result.error ?? "", /patch must be an object/);
});

test("rejects answer spaces and solution text with the wrong visibility", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      action: {
        type: "module.add",
        scope: { kind: "question", questionId: "q1" },
        blocks: [
          { id: "space2", kind: "space", lines: 8 },
          { id: "solution2", kind: "text", text: "Solution. $x=3$ [[marks:1]]" },
        ],
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].blocks[0].visibility"));
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].blocks[1].visibility"));
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].blocks[1].text"));
});

test("rejects malformed diagram configs before they reach the action engine", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-chart",
              kind: "diagram",
              graphConfig: {
                type: "statsChart",
                data: {
                  chartType: "histogram",
                  dataMode: "manualProbabilities",
                  xValues: [1, 2, 3],
                  probabilities: [0.4, "0.6"],
                },
                options: { widthPx: -1 },
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].blocks[0].graphConfig.options.widthPx"));
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].blocks[0].graphConfig.data.probabilities[1]"));
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].blocks[0].graphConfig.data.probabilities"));
});

test("accepts native statistics density curves and blank axes", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "density-chart",
              kind: "diagram",
              graphConfig: {
                type: "statsChart",
                data: {
                  chartType: "density",
                  points: [
                    { x: 150, y: 0 },
                    { x: 180, y: 0.02 },
                    { x: 210, y: 0 },
                  ],
                  range: [150, 210],
                  yRange: [0, 0.03],
                },
              },
            },
            {
              id: "blank-axes-chart",
              kind: "diagram",
              graphConfig: {
                type: "statsChart",
                data: {
                  chartType: "blankAxes",
                  range: [2.1, 2.7],
                  yRange: [0, 4],
                  xLabel: "Sample mean",
                  yLabel: "Density",
                },
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  const blockIds = result.document?.questions[0].contentBlocks.map((block) => block.id) ?? [];
  assert(blockIds.includes("density-chart"));
  assert(blockIds.includes("blank-axes-chart"));
});

test("accepts native graph2d slope fields", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "slope-field",
              kind: "diagram",
              graphConfig: {
                type: "graph2d",
                xMin: -2,
                xMax: 2,
                yMin: -2,
                yMax: 2,
                data: {
                  slopeField: {
                    expression: "(x - 1) / (2*y)",
                    xValues: [-1.5, -0.5, 0.5, 1.5],
                    yValues: [-1.5, -0.5, 0.5, 1.5],
                    highlightedPoints: [{ x: 0.5, y: -1, slope: 0.25, label: "$(0.5,-1)$" }],
                  },
                },
                functions: [{ kind: "relation", expression: "y^2 = x^2/2 - x + 1/4", label: "solution", show: true }],
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  const diagram = result.document?.questions[0].contentBlocks.find((block) => block.id === "slope-field");
  assert.equal(diagram?.kind, "diagram");
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.type : "", "graph2d");
});

test("rejects malformed graph2d slope fields", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-slope-field",
              kind: "diagram",
              graphConfig: {
                type: "graph2d",
                data: {
                  slopeField: {
                    expression: "(x - 1) / (2*y)",
                    xValues: [-1, "0", 1],
                    highlightedPoints: [{ x: 0.5, y: "bad" }],
                  },
                },
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].blocks[0].graphConfig.data.slopeField.xValues[1]"));
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].blocks[0].graphConfig.data.slopeField.highlightedPoints[0].y"));
});

test("rejects graph2d fields misplaced under data and options", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-graph2d-placement",
              kind: "diagram",
              graphConfig: {
                type: "graph2d",
                data: {
                  xRange: [-2, 2],
                  yRange: [-2, 2],
                  functions: [{ expression: "sqrt(0.5*x^2 - x + 0.25)" }],
                  features: [{ type: "point", x: 0.5, y: -1, style: { color: "#111827", size: 5 } }],
                  slopeField: {
                    expression: "(x - 1) / (2*y)",
                    xValues: [-1, 0, 1],
                    yValues: [-1, 0, 1],
                  },
                },
                options: {
                  showGrid: true,
                  width: 420,
                  axisLabels: { x: "x", y: "y" },
                },
                functions: [
                  {
                    expression: "sqrt(0.5*x^2 - x + 0.25)",
                    domain: [0, 4],
                    style: { color: "#dc2626", strokeWidth: 2 },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };
  const issuePaths = new Set(data.validationIssues?.map((issue) => issue.path));

  assert.equal(result.ok, false);
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.data.functions"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.data.features"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.data.xRange"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.options.showGrid"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.options.width"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.options.axisLabels"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.functions[0].domain"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.functions[0].style"));
});

test("rejects graph2d feature type and style wrapper fields", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-graph2d-features",
              kind: "diagram",
              graphConfig: {
                type: "graph2d",
                features: [
                  {
                    type: "point",
                    x: 0,
                    y: 0.5,
                    style: { color: "#111827", size: 5 },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };
  const issuePaths = new Set(data.validationIssues?.map((issue) => issue.path));

  assert.equal(result.ok, false);
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.features[0].type"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.features[0].style"));
});

test("rejects graph2d invented region expression fields", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-argand-region",
              kind: "diagram",
              graphConfig: {
                type: "graph2d",
                functions: [{ expression: "1 + sqrt(4 - x^2)" }, { expression: "abs(x)/sqrt(3)" }],
                features: [
                  {
                    kind: "region_clipped_by_curve",
                    expressionTop: "1 + sqrt(4 - x^2)",
                    expressionBottom: "abs(x)/sqrt(3)",
                    opacity: 0.25,
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };
  const issuePaths = new Set(data.validationIssues?.map((issue) => issue.path));

  assert.equal(result.ok, false);
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.features[0].expressionTop"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.features[0].expressionBottom"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.features[0].opacity"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.features[0].clipSide"));
});

test("accepts structured graph3d point and segment data", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "prism-3d",
              kind: "diagram",
              graphConfig: {
                type: "graph3d",
                data: {
                  points: [
                    { id: "O", coords: [0, 0, 0] },
                    { id: "A", coords: [2, 0, 0] },
                    { id: "B", coords: [2, 4, 0] },
                    { id: "T", coords: [0, 0, 3] },
                  ],
                  segments: [
                    { from: "O", to: "A" },
                    { from: "A", to: "B" },
                    { from: "B", to: "T", label: "$BT$" },
                  ],
                },
                metadata: { view3d: { az: 1.2, el: 0.35, bank: 0 } },
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  const diagram = result.document?.questions[0].contentBlocks.find((block) => block.id === "prism-3d");
  assert.equal(diagram?.kind, "diagram");
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.type : "", "graph3d");
});

test("rejects unsupported graph3d camera metadata shape", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-prism-camera",
              kind: "diagram",
              graphConfig: {
                type: "graph3d",
                data: {
                  points: [
                    { id: "A", coords: [2, 0, 0] },
                    { id: "B", coords: [2, 4, 0] },
                  ],
                  segments: [{ from: "A", to: "B" }],
                },
                metadata: {
                  view3d: { camera: { eye: { x: 5, y: -7, z: 4 } } },
                  axisLabels: { x: "$x$", y: "$y$", z: "$z$" },
                  showAxes: true,
                  showGrid: false,
                },
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };
  const issuePaths = new Set(data.validationIssues?.map((issue) => issue.path));

  assert.equal(result.ok, false);
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.metadata.view3d.camera"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.metadata.view3d.az"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.metadata.view3d.el"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.metadata.view3d.bank"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.metadata.axisLabels"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.metadata.showAxes"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.metadata.showGrid"));
});

test("rejects graph3d axis helper points and segments", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-prism-axis-points",
              kind: "diagram",
              graphConfig: {
                type: "graph3d",
                data: {
                  points: [
                    { id: "O", coords: [0, 0, 0] },
                    { id: "xAxis", label: "$x$", coords: [3, 0, 0] },
                  ],
                  segments: [{ from: "O", to: "xAxis", label: "$x$" }],
                },
                metadata: { view3d: { az: 1.2, el: 0.35, bank: 0 } },
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };
  const issuePaths = new Set(data.validationIssues?.map((issue) => issue.path));

  assert.equal(result.ok, false);
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.data.points[1].id"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.data.segments[0].to"));
});

test("rejects graph3d degree-like view metadata values", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-prism-degree-view",
              kind: "diagram",
              graphConfig: {
                type: "graph3d",
                data: {
                  points: [
                    { id: "A", coords: [2, 0, 0] },
                    { id: "B", coords: [2, 4, 0] },
                  ],
                  segments: [{ from: "A", to: "B" }],
                },
                metadata: { view3d: { az: -52, el: 22, bank: 0 } },
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };
  const issuePaths = new Set(data.validationIssues?.map((issue) => issue.path));

  assert.equal(result.ok, false);
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.metadata.view3d.az"));
  assert(issuePaths.has("actions[0].blocks[0].graphConfig.metadata.view3d.el"));
});

test("rejects ignored graph3d segment style field", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-prism-segment-style",
              kind: "diagram",
              graphConfig: {
                type: "graph3d",
                data: {
                  points: [
                    { id: "O", coords: [0, 0, 0] },
                    { id: "A", coords: [2, 0, 0] },
                  ],
                  segments: [{ from: "O", to: "A", style: "dashed" }],
                },
                metadata: { view3d: { az: 1.2, el: 0.35, bank: 0 } },
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].blocks[0].graphConfig.data.segments[0].style"));
});

test("rejects malformed graph3d segment references", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-prism-3d",
              kind: "diagram",
              graphConfig: {
                type: "graph3d",
                data: {
                  points: [{ id: "A", coords: [2, 0, 0] }],
                  segments: [{ from: "A", to: "B" }],
                },
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].blocks[0].graphConfig.data.segments[0].to"));
});

test("rejects unsupported Penrose Substance predicates before applying diagrams", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagram: {
        graphConfig: {
          type: "geometricConstruction",
          data: {},
          options: {
            substanceSource: [
              "Point O, A, B",
              "NamedSegment OA, OB",
              "LabelsPoint(A, $A$)",
              "SegmentLength(OA, 2)",
              "Label(A, $A$)",
              "OppositeRays(A, O, B)",
              "Collinear(A, O, B)",
              "Connect(AB, A, B)",
              "LabelsAngle(A, O, B, $45^\\circ$)",
              "VectorSegment vecA O A",
              "Segment chordAB A B",
              "Ray(rayA, O, A)",
              "PerpendicularToSegment(OB, OC)",
            ].join("\n"),
          },
        },
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };
  const messages = (data.validationIssues ?? []).map((issue) => issue.message).join("\n");

  assert.equal(result.ok, false);
  assert.match(messages, /LabelsPoint/);
  assert.match(messages, /Label\(\.\.\.\)/);
  assert.match(messages, /SegmentLength/);
  assert.match(messages, /OppositeRays/);
  assert.match(messages, /Collinear/);
  assert.match(messages, /Connect/);
  assert.match(messages, /LabelsAngle/);
  assert.match(messages, /non-parenthesized/);
  assert.match(messages, /Segment predicate/);
  assert.match(messages, /Ray\(\.\.\.\)/);
  assert.match(messages, /PerpendicularToSegment must receive/);
});

test("rejects malformed coordinate vector and set diagram action payloads", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      actions: [
        {
          type: "diagram.update",
          scope: { kind: "question", questionId: "q1" },
          blockId: "d1",
          graphConfig: {
            type: "vector2d",
            metadata: {
              vector2d: {
                labelStyle: "boldLower",
                vectors: [{ id: "a", name: "a", start: [0, 0], components: [2, "3"] }],
              },
            },
          },
        },
        {
          type: "module.add",
          scope: { kind: "question", questionId: "q1" },
          blocks: [
            {
              id: "bad-set",
              kind: "diagram",
              graphConfig: {
                type: "setDiagram",
                data: {
                  universe: { name: "U" },
                  sets: [
                    { name: "A set", label: "A" },
                    { name: "B", label: "B" },
                  ],
                  regions: [{ name: "middle", label: "A \\cap B" }],
                },
              },
            },
          ],
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert(data.validationIssues?.some((issue) => issue.path === "actions[0].graphConfig.metadata.vector2d.vectors[0].components[1]"));
  assert(data.validationIssues?.some((issue) => issue.path === "actions[1].blocks[0].graphConfig.data.sets[0].name"));
  assert(data.validationIssues?.some((issue) => issue.path === "actions[1].blocks[0].graphConfig.data.regions[0].name"));
});

test("validates diagram graphConfig patches on module.update", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.actions.preview",
    arguments: {
      action: {
        type: "module.update",
        scope: { kind: "question", questionId: "q1" },
        blockId: "d1",
        patch: {
          graphConfig: {
            type: "binomialChart",
            data: { chartType: "binomial", trials: 6, probability: 0.8 },
          },
        },
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert.equal(data.validationIssues?.[0]?.path, "actions[0].patch.graphConfig.type");
});

test("runs document and solution validation through the assistant tool", () => {
  const result = runMauthAssistantTool(
    documentFixture(),
    { name: "mauth.validation.run", arguments: { mode: "both" } },
    {
      validateDocument: (document) => ({ questionCount: document.questions.length }),
      validateSolutions: (questions) => ({ questionCount: questions.length, missingSolutions: 0 }),
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    document: { questionCount: 1 },
    solutions: { questionCount: 1, missingSolutions: 0 },
  });
});
