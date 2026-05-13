import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import type { MauthDocumentActionResult, MauthDocumentLike, MauthQuestionLike } from "./mauthActions.ts";
import {
  describeMauthAssistantTools,
  inspectMauthDocument,
  runMauthAssistantTool,
  type MauthAssistantToolDescription,
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

function diagramBlock(id: string, graphConfig: GraphConfig): ContentBlock {
  return { id, kind: "diagram", graphConfig };
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
    name: "mauth.author.replaceQuestion",
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

test("high-level question authoring can pair diagram answer surfaces without separate working space", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
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

test("high-level part authoring can pair completion tables as answer surfaces", () => {
  const result = runMauthAssistantTool(documentFixture(), {
    name: "mauth.author.replaceQuestion",
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
    name: "mauth.author.replaceQuestion",
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
          type: "vectorRelationship",
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
  const circleData = circleGeometryResult.data as { validationIssues?: Array<{ path: string; message: string; expected?: string }> };

  assert.equal(scalarProductResult.ok, false);
  assert(scalarData.validationIssues?.some((issue) => issue.path === "arguments.diagram.graphConfig.type"));
  assert(scalarData.validationIssues?.some((issue) => issue.expected === "geometricConstruction"));
  assert.match(scalarProductResult.error ?? "", /scalar-product ray diagram/);
  assert.equal(coordinateVectorResult.ok, false);
  assert(vectorData.validationIssues?.some((issue) => issue.expected === "vector2d"));
  assert.match(coordinateVectorResult.error ?? "", /coordinate vector diagram/);
  assert.equal(statsChartResult.ok, false);
  assert(statsData.validationIssues?.some((issue) => issue.expected === "statsChart"));
  assert.match(statsChartResult.error ?? "", /statistics chart/);
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
              "OppositeRays(A, O, B)",
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
  assert.match(messages, /SegmentLength/);
  assert.match(messages, /OppositeRays/);
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
