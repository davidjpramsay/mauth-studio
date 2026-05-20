import process from "node:process";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import type { MauthDocumentLike, MauthPartLike, MauthQuestionLike } from "../apps/web/src/lib/mauthActions.ts";
import { runMauthAssistantAdapterTool, type MauthAssistantAdapterHost } from "../apps/web/src/lib/mauthAssistantAdapter.ts";
import { validateAssistantDiagramSemanticsBeforeCommit } from "../apps/web/src/lib/mauthAssistantPreflight.ts";
import { inspectMauthDocument, runMauthAssistantTool, type MauthAssistantToolCall } from "../apps/web/src/lib/mauthAssistantTools.ts";

interface TestFrontMatter {
  schoolName: string;
  assessmentTitle: string;
}

interface TestFormattingConfig {
  showMarks: boolean;
}

type TestDocument = MauthDocumentLike<MauthQuestionLike, TestFrontMatter, TestFormattingConfig>;
type SmokeToolResult = ReturnType<typeof runMauthAssistantTool> | Awaited<ReturnType<typeof runMauthAssistantAdapterTool>>;

interface ScenarioContext {
  document: TestDocument;
  results: SmokeToolResult[];
}

interface SmokeScenario {
  id: string;
  prompt: string;
  assistantPlan: string;
  start: () => TestDocument;
  calls: MauthAssistantToolCall[];
  useAdapterPreflight?: boolean;
  expectToolFailure?: boolean;
  evaluate: (context: ScenarioContext) => string[];
}

function textBlock(id: string, text: string, visibility?: ContentBlock["visibility"]): ContentBlock {
  return { id, kind: "text", text, ...(visibility ? { visibility } : {}) };
}

function spaceBlock(id: string, lines: number): ContentBlock {
  return { id, kind: "space", lines, visibility: "student" };
}

function diagramBlock(id: string, graphConfig: GraphConfig, diagramAlign?: "left" | "center" | "right"): ContentBlock {
  return { id, kind: "diagram", graphConfig, ...(diagramAlign ? { diagramAlign } : {}) };
}

function question(id: string, marks: number, blocks: ContentBlock[] = [], parts: MauthPartLike[] = []): MauthQuestionLike {
  return {
    id,
    marks,
    contentBlocks: blocks,
    parts,
    itemOrder: [
      ...blocks.map((block) => ({ kind: "block" as const, id: block.id })),
      ...parts.map((part) => ({ kind: "part" as const, id: part.id })),
    ],
  };
}

function part(id: string, label: string, marks: number, text: string, blocks: ContentBlock[] = []): MauthPartLike {
  return {
    id,
    label,
    marks,
    text,
    contentBlocks: blocks,
    subparts: [],
    itemOrder: blocks.map((block) => ({ kind: "block" as const, id: block.id })),
  };
}

function documentFixture(questions: MauthQuestionLike[], title = "AI Assistant Smoke Test"): TestDocument {
  return {
    frontMatter: {
      schoolName: "Mauth School",
      assessmentTitle: title,
    },
    formattingConfig: { showMarks: true },
    questions,
  };
}

function circleQuestionBlocks() {
  return [
    textBlock(
      "q1-text",
      "$A$, $B$ and $C$ are points on a circle. The tangent to the circle at $A$ is parallel to chord $BC$.\n\nProve that $AB=AC$.",
    ),
    diagramBlock("q1-diagram", circleTangentGraphConfig(), "right"),
    spaceBlock("q1-space", 14),
    textBlock(
      "q1-solution",
      [
        "**Solution.**",
        "",
        "Let $t$ be the tangent at $A$, with $t \\parallel BC$.",
        "",
        "$$\\angle(t,AB)=\\angle ACB.$$ [[marks:1]]",
        "$$\\angle(t,AB)=\\angle CBA.$$ [[marks:1]]",
        "$$\\angle ACB=\\angle CBA.$$ [[marks:1]]",
        "$$AB=AC.$$ [[marks:1]]",
      ].join("\n"),
      "solution",
    ),
  ];
}

function circleTangentGraphConfig(): GraphConfig {
  return {
    type: "geometricConstruction",
    data: {},
    options: {
      substanceSource: [
        "Point centre, A, B, C",
        "Circle omega",
        "Line tangentA",
        "NamedSegment AB, AC, BC",
        "Label centre $\\,$",
        "HidePoint(centre)",
        "CircleThrough(omega, centre, A)",
        "OnCircle(B, omega)",
        "OnCircle(C, omega)",
        "Tangent(tangentA, omega, A)",
        "Segment(AB, A, B)",
        "Segment(AC, A, C)",
        "Segment(BC, B, C)",
        "ParallelToSegment(tangentA, B, C)",
      ].join("\n"),
    },
    metadata: { renderer: "penrose" },
  } as unknown as GraphConfig;
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

function scalarProductVector2dGraphConfig(options: { includeAllLabels?: boolean; includeAngleMarkers?: boolean } = {}): GraphConfig {
  const includeAllLabels = options.includeAllLabels ?? true;
  const includeAngleMarkers = options.includeAngleMarkers ?? true;
  return {
    type: "vector2d",
    widthPx: 520,
    heightPx: 340,
    xMin: -2.6,
    xMax: 2.6,
    yMin: -2.1,
    yMax: 3.4,
    showAxes: false,
    showGrid: false,
    showAxisLabels: false,
    showAxisNumbers: false,
    metadata: {
      vector2d: {
        labelStyle: "custom",
        vectors: [
          { id: "a", name: "a", label: "\\mathbf{a}", start: [0, 0], components: [-1.65, -1.4] },
          { id: "b", name: "b", label: "\\mathbf{b}", start: [0, 0], components: [-1.29, 1.53] },
          ...(includeAllLabels ? [{ id: "c", name: "c", label: "\\mathbf{c}", start: [0, 0], components: [0.25, 2.9] }] : []),
          ...(includeAllLabels ? [{ id: "d", name: "d", label: "\\mathbf{d}", start: [0, 0], components: [1.65, 1.4] }] : []),
        ],
        segmentLabels: [
          { vectorId: "a", label: "2\\ \\text{units}", position: 0.55, offsetPx: 18 },
          { vectorId: "b", label: "2\\ \\text{units}", position: 0.55, offsetPx: 18 },
          { vectorId: "c", label: "3\\ \\text{units}", position: 0.55, offsetPx: 18 },
          { vectorId: "d", label: "2\\ \\text{units}", position: 0.55, offsetPx: 18 },
        ],
        angleMarkers: includeAngleMarkers
          ? [
              { from: "b", to: "d", rightAngle: true, radius: 0.48 },
              { from: "c", to: "d", label: "45^\\circ", radius: 0.64 },
            ]
          : [],
      },
    },
  } as unknown as GraphConfig;
}

function allBlocks(document: TestDocument) {
  const blocks: ContentBlock[] = [];
  const pushBlocks = (items: readonly ContentBlock[] | undefined) => {
    for (const block of items ?? []) {
      blocks.push(block);
      if (block.kind === "columns") {
        for (const column of block.columns) pushBlocks(column);
      }
    }
  };
  for (const item of document.questions) {
    pushBlocks(item.contentBlocks);
    for (const partItem of item.parts ?? []) {
      pushBlocks(partItem.contentBlocks);
      for (const subpart of partItem.subparts ?? []) pushBlocks(subpart.contentBlocks);
    }
  }
  return blocks;
}

function questionBlocks(document: TestDocument, questionIndex = 0) {
  return document.questions[questionIndex]?.contentBlocks ?? [];
}

function diagrams(document: TestDocument, questionIndex = 0) {
  const blocks: ContentBlock[] = [];
  const pushBlocks = (items: readonly ContentBlock[] | undefined) => {
    for (const block of items ?? []) {
      blocks.push(block);
      if (block.kind === "columns") {
        for (const column of block.columns) pushBlocks(column);
      }
    }
  };
  pushBlocks(questionBlocks(document, questionIndex));
  return blocks.filter((block) => block.kind === "diagram");
}

function studentSpaces(document: TestDocument, questionIndex = 0) {
  return questionBlocks(document, questionIndex).filter((block) => block.kind === "space" && block.visibility === "student");
}

function solutionTexts(document: TestDocument) {
  return allBlocks(document)
    .filter((block): block is Extract<ContentBlock, { kind: "text" }> => block.kind === "text" && block.visibility === "solution")
    .map((block) => block.text);
}

function markAnnotationTotal(text: string) {
  return [...text.matchAll(/\[\[\s*marks\s*:\s*(\d+)\s*\]\]/gi)].reduce((sum, match) => sum + Number(match[1] ?? 0), 0);
}

function hasVisibleMarkLanguage(text: string) {
  return /(?:Solution\s*\(\s*\d+\s*marks?\s*\)|\[\s*\d+\s*marks?(?:[^\]]*)\]|\(\s*\d+\s*marks?(?:[^)]*)\)|\b\d+\s*marks?\s+for\b)/i.test(
    text,
  );
}

function firstSolutionText(document: TestDocument) {
  return solutionTexts(document)[0] ?? "";
}

function failIf(condition: boolean, message: string) {
  return condition ? [message] : [];
}

function adapterHarness(initialDocument: TestDocument) {
  let document = initialDocument;
  const commits: TestDocument[] = [];
  const host: MauthAssistantAdapterHost<MauthQuestionLike, TestFrontMatter, TestFormattingConfig> = {
    getDocument: () => document,
    commitDocument: (nextDocument) => {
      document = nextDocument as TestDocument;
      commits.push(document);
    },
    validateDocumentBeforeCommit: (nextDocument, context, changedIds) =>
      validateAssistantDiagramSemanticsBeforeCommit(nextDocument, context, changedIds),
  };
  return {
    host,
    commits,
    get document() {
      return document;
    },
  };
}

const scenarios: SmokeScenario[] = [
  {
    id: "next-missing-question-is-appended",
    prompt: "Make me a Year 9 linear equations point-of-intersection question with a diagram for Question 2.",
    assistantPlan:
      "Use mauth.question.upsert for Question 2. Because the document currently ends at Question 1, the high-level tool should append Question 2 rather than refusing or falling back to broad actions.",
    start: () => documentFixture([question("q1", 2, [textBlock("q1-text", "Question 1."), spaceBlock("q1-space", 6)])]),
    calls: [
      {
        name: "mauth.question.upsert",
        arguments: {
          questionNumber: 2,
          marks: 4,
          questionText:
            "The graph below shows two straight lines, $y=x+1$ and $y=-2x+7$.\n\nUse the graph to estimate the point of intersection, then verify your answer algebraically.",
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
      },
    ],
    evaluate: ({ document }) => {
      const questionTwo = document.questions[1];
      const diagram = diagrams(document, 1)[0];
      const graphConfig =
        diagram?.kind === "diagram" ? (diagram.graphConfig as GraphConfig & { functions?: Array<{ expression?: string }> }) : null;
      const expressions = graphConfig?.functions?.map((entry) => entry.expression) ?? [];
      return [
        ...failIf(document.questions.length !== 2, "Question 2 should be appended"),
        ...failIf(questionTwo?.id !== "assistant-question-2", "appended question should use a deterministic assistant id"),
        ...failIf(questionTwo?.marks !== 4, "appended question should keep requested marks"),
        ...failIf(graphConfig?.type !== "graph2d", "linear intersection question should use graph2d"),
        ...failIf(expressions.length !== 2, "graph2d diagram should contain two functions"),
        ...failIf(
          expressions.some((expression) => /x\^2|pow|quadratic/i.test(expression ?? "")),
          "graph2d functions should not be quadratic",
        ),
      ];
    },
  },
  {
    id: "linear-question-graph-mismatch-is-flagged",
    prompt: "The assistant writes a linear-intersection question but accidentally draws a quadratic graph.",
    assistantPlan:
      "Use mauth.question.upsert, then preview-inspect the question. The diagram warnings should flag that the prompt asks for straight lines while the graph2d functions are nonlinear.",
    start: () => documentFixture([question("q1", 2, [textBlock("q1-text", "Question 1."), spaceBlock("q1-space", 6)])]),
    calls: [
      {
        name: "mauth.question.upsert",
        arguments: {
          questionNumber: 1,
          marks: 4,
          questionText:
            "The graph below shows two straight lines, $y=2x+1$ and $y=-x+7$.\n\nUse the graph to estimate the point of intersection, then verify your answer algebraically.",
          studentSpaceLines: 10,
          diagram: {
            graphConfig: {
              type: "graph2d",
              xMin: -5,
              xMax: 5,
              yMin: -2,
              yMax: 10,
              functions: [
                { expression: "2*x + 1", label: "$y=2x+1$", show: true },
                { expression: "x^2 - 4*x + 4", label: "$y=x^2-4x+4$", show: true },
              ],
            },
          },
        },
      },
      { name: "mauth.preview.inspect", arguments: { questionNumber: 1 } },
    ],
    evaluate: ({ results }) => {
      const inspection = results[1]?.data as { question?: { diagrams?: Array<{ warnings?: Array<{ code: string; message: string }> }> } };
      const warnings = inspection.question?.diagrams?.[0]?.warnings ?? [];
      return [
        ...failIf(
          !warnings.some((warning) => warning.code === "graph2d-straight-line-mismatch"),
          "preview inspection should flag nonlinear graph2d functions for a straight-line prompt",
        ),
      ];
    },
  },
  {
    id: "source-graph2d-consistency-blocks-bad-diagram",
    prompt: "The assistant converts a source modelling question but makes the graph plausible instead of source-faithful.",
    assistantPlan:
      "Use mauth.question.upsert for the source question. Commit preflight should reject a graph2d diagram whose equations, domains, coordinate points, or axis-label settings do not match the explicit source text, returning repairable graph2d-source-* issues.",
    start: () => documentFixture([question("q1", 2, [textBlock("q1-text", "Original question."), spaceBlock("q1-space", 6)])]),
    useAdapterPreflight: true,
    expectToolFailure: true,
    calls: [
      {
        name: "mauth.question.upsert",
        arguments: {
          questionNumber: 1,
          marks: 0,
          questionText: [
            "A skier leaves the ramp at point $E(100,120)$.",
            "The sloped ground is $y=170-0.5x$ for $100\\le x\\le340$.",
            "The Cartesian equation for the flight path is $y=120-1000\\left(\\ln\\left(\\frac{740-x}{640}\\right)\\right)^2$ for $100\\le x\\le255.916$.",
            "The landing point is $(255.916,42.042)$ on the coordinate graph.",
          ].join(" "),
          diagram: {
            graphConfig: {
              type: "graph2d",
              xMin: 0,
              xMax: 150,
              yMin: 0,
              yMax: 210,
              showAxes: true,
              showGrid: true,
              showAxisLabels: false,
              functions: [
                { kind: "expression", expression: "170 - x", domainMin: 0, domainMax: 100 },
                { kind: "expression", expression: "120 - 1000*(log((740 - x)/640))^2", domainMin: 100, domainMax: 340 },
              ],
              features: [{ kind: "point", x: 0, y: 180, label: "$B$" }],
            },
          },
          parts: [{ text: "Calculate the time taken for the skier to land.", marks: 3, studentSpaceLines: 6 }],
        },
      },
    ],
    evaluate: ({ document, results }) => {
      const result = results[0] as
        | {
            ok?: boolean;
            data?: { validationIssues?: Array<{ message?: string; expected?: string }> };
            warnings?: Array<{ code?: string; message?: string }>;
          }
        | undefined;
      const validationIssues = result?.data?.validationIssues ?? [];
      const warningCodes = result?.warnings?.map((warning) => warning.code) ?? [];
      const combinedRepairText = validationIssues.map((issue) => `${issue.message ?? ""} ${issue.expected ?? ""}`).join("\n");
      return [
        ...failIf(result?.ok !== false, "bad source graph2d payload should fail commit preflight"),
        ...failIf(
          document.questions[0].contentBlocks[0]?.kind !== "text",
          "failed source conversion should leave original question untouched",
        ),
        ...failIf(diagrams(document).length !== 0, "failed source conversion should not commit the bad graph2d diagram"),
        ...failIf(
          !warningCodes.includes("assistant-diagram-inspection-invalid"),
          "commit preflight should report assistant diagram inspection failure",
        ),
        ...failIf(
          !validationIssues.some((issue) => issue.message?.includes("no visible graph2d function or relation matches")),
          "validation issues should name the missing explicit graph2d equation",
        ),
        ...failIf(
          !validationIssues.some((issue) => issue.message?.includes("does not preserve that domain")),
          "validation issues should name the mismatched explicit graph2d domain",
        ),
        ...failIf(
          !validationIssues.some((issue) => issue.message?.includes("no matching point feature")),
          "validation issues should name the missing explicit graph2d point",
        ),
        ...failIf(
          !combinedRepairText.includes("Preserve each explicitly stated graph equation"),
          "repair expectation should tell the assistant to preserve stated equations/domains/points/axes",
        ),
      ];
    },
  },
  {
    id: "mark-edit-preserves-shared-diagram",
    prompt: "Reduce Question 1 to 4 marks and remove the QED/conclusion mark. Keep the diagram.",
    assistantPlan:
      "Use mauth.author.ensureSolutions because this is a solution/mark edit. Do not replace the question. Preserve shared diagrams.",
    start: () => documentFixture([question("q1", 5, circleQuestionBlocks())]),
    calls: [
      {
        name: "mauth.author.ensureSolutions",
        arguments: {
          questions: [
            {
              questionNumber: 1,
              marks: 4,
              studentSpaceLines: 14,
              solutionText: [
                "Let $t$ be the tangent at $A$, with $t \\parallel BC$.",
                "",
                "$$\\angle(t,AB)=\\angle ACB.$$ [[marks:1]]",
                "$$\\angle(t,AB)=\\angle CBA.$$ [[marks:1]]",
                "$$\\angle ACB=\\angle CBA.$$ [[marks:1]]",
                "$$AB=AC.$$ [[marks:1]]",
              ].join("\n"),
            },
          ],
        },
      },
    ],
    evaluate: ({ document }) => [
      ...failIf(document.questions[0].marks !== 4, "question marks should be 4"),
      ...failIf(diagrams(document).length !== 1, "existing shared diagram should still be present"),
      ...failIf(diagrams(document)[0]?.id !== "q1-diagram", "existing diagram id should be preserved"),
      ...failIf(markAnnotationTotal(firstSolutionText(document)) !== 4, "solution should have exactly 4 hidden mark ticks"),
      ...failIf(hasVisibleMarkLanguage(firstSolutionText(document)), "solution should not contain visible [1 mark] style notes"),
    ],
  },
  {
    id: "response-space-edit-preserves-shared-content",
    prompt: "Give Question 1 more working space. Make the answer space 12 lines and keep the existing diagram and solution.",
    assistantPlan: "Use mauth.author.adjustResponseSpaces because this is a layout/space edit, not a question rewrite or solution rewrite.",
    start: () => documentFixture([question("q1", 5, circleQuestionBlocks())]),
    calls: [
      {
        name: "mauth.author.adjustResponseSpaces",
        arguments: {
          targets: [{ questionNumber: 1, lines: 12, mode: "set" }],
        },
      },
    ],
    evaluate: ({ document }) => [
      ...failIf(studentSpaces(document)[0]?.kind !== "space", "question should still have a student space"),
      ...failIf(
        studentSpaces(document)[0]?.kind === "space" && studentSpaces(document)[0].lines !== 12,
        "student space should be 12 lines",
      ),
      ...failIf(diagrams(document).length !== 1, "existing diagram should be preserved"),
      ...failIf(solutionTexts(document).length !== 1, "existing solution should be preserved"),
    ],
  },
  {
    id: "diagram-follow-up-uses-native-penrose",
    prompt: "Please add the diagram to Question 1 that goes with the tangent/circle question.",
    assistantPlan:
      "Use mauth.author.addDiagram. Choose geometricConstruction and emit native Penrose Substance rather than a canned recipe or graph2d.",
    start: () =>
      documentFixture([
        question("q1", 5, [
          textBlock(
            "q1-text",
            "$A$, $B$ and $C$ are points on a circle. The tangent at $A$ is parallel to chord $BC$. Prove that $AB=AC$.",
          ),
          spaceBlock("q1-space", 14),
        ]),
      ]),
    calls: [
      {
        name: "mauth.author.addDiagram",
        arguments: {
          questionNumber: 1,
          placement: "afterQuestionText",
          diagram: {
            id: "q1-circle-diagram",
            diagramAlign: "right",
            graphConfig: circleTangentGraphConfig(),
          },
        },
      },
    ],
    evaluate: ({ document }) => {
      const diagram = diagrams(document)[0];
      const graphConfig = diagram?.kind === "diagram" ? diagram.graphConfig : undefined;
      const substanceSource =
        graphConfig && typeof graphConfig.options === "object" && graphConfig.options && "substanceSource" in graphConfig.options
          ? String((graphConfig.options as { substanceSource?: unknown }).substanceSource ?? "")
          : "";
      return [
        ...failIf(diagrams(document).length !== 1, "one diagram should be added"),
        ...failIf(graphConfig?.type !== "geometricConstruction", "diagram should use geometricConstruction"),
        ...failIf(!/Tangent\(tangentA,\s*omega,\s*A\)/.test(substanceSource), "Penrose Substance should include a tangent predicate"),
        ...failIf(
          !/ParallelToSegment\(tangentA,\s*B,\s*C\)/.test(substanceSource),
          "Penrose Substance should include a parallel-to-chord predicate",
        ),
        ...failIf(!/HidePoint\(centre\)/.test(substanceSource), "auxiliary centre point should be hidden unless named by the question"),
      ];
    },
  },
  {
    id: "penrose-circle-semantic-inspection-flags-wrong-diagram",
    prompt: "The assistant draws a circle theorem diagram that renders but forgets the actual tangent/chord relationship.",
    assistantPlan:
      "Preview inspection should report semantic warnings so the provider can repair the native Penrose Substance before claiming success.",
    start: () =>
      documentFixture([
        question("q1", 5, [
          textBlock(
            "q1-text",
            "$A$, $B$ and $C$ are points on a circle. The tangent to the circle at $A$ is parallel to chord $BC$. Prove that $AB=AC$.",
          ),
          spaceBlock("q1-space", 14),
        ]),
      ]),
    calls: [
      {
        name: "mauth.author.addDiagram",
        arguments: {
          questionNumber: 1,
          diagram: {
            id: "q1-bad-circle-diagram",
            graphConfig: {
              type: "geometricConstruction",
              data: {},
              options: {
                substanceSource: [
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
              },
            },
          },
        },
      },
      { name: "mauth.preview.inspect", arguments: { questionNumber: 1 } },
    ],
    evaluate: ({ results }) => {
      const inspection = results[1]?.data as { question?: { diagrams?: Array<{ semanticWarnings?: Array<{ code: string }> }> } };
      const warningCodes = inspection.question?.diagrams?.[0]?.semanticWarnings?.map((warning) => warning.code) ?? [];
      return [
        ...failIf(!warningCodes.includes("penrose-circle-tangent-missing"), "semantic inspection should flag the missing tangent"),
        ...failIf(
          !warningCodes.includes("penrose-circle-parallel-chord-missing"),
          "semantic inspection should flag the missing parallel-to-chord predicate",
        ),
        ...failIf(!warningCodes.includes("penrose-chord-segment-missing"), "semantic inspection should flag the missing chord segment"),
      ];
    },
  },
  {
    id: "question-rewrite-preserves-diagram-when-omitted",
    prompt: "Rewrite the wording of Question 1 but keep the existing diagram.",
    assistantPlan: "Use mauth.question.upsert and omit diagram fields so existing shared diagrams are preserved.",
    start: () =>
      documentFixture([
        question("q1", 3, [
          textBlock("q1-text", "Original wording."),
          diagramBlock("q1-graph", statsChartConfig()),
          spaceBlock("q1-space", 8),
        ]),
      ]),
    calls: [
      {
        name: "mauth.question.upsert",
        arguments: {
          questionNumber: 1,
          marks: 3,
          questionText: "The probability graph below shows $P(X=x)$ for a discrete random variable. State whether it is valid.",
          studentSpaceLines: 8,
          solutionText:
            "Check all probabilities are non-negative and that the total is $1$. [[marks:1]] State the conclusion clearly. [[marks:2]]",
        },
      },
    ],
    evaluate: ({ document }) => [
      ...failIf(diagrams(document).length !== 1, "omitted diagram fields should preserve the existing diagram"),
      ...failIf(diagrams(document)[0]?.id !== "q1-graph", "preserved diagram should keep its id"),
      ...failIf(!firstSolutionText(document).startsWith("**Solution.**\n\n"), "solution heading should be normalised onto its own line"),
    ],
  },
  {
    id: "explicit-empty-diagrams-removes-diagram",
    prompt: "Rewrite Question 1 and remove the diagram.",
    assistantPlan: "Use mauth.question.upsert with diagrams: [] only because the teacher explicitly asked to remove diagrams.",
    start: () =>
      documentFixture([
        question("q1", 2, [
          textBlock("q1-text", "Original wording."),
          diagramBlock("q1-graph", statsChartConfig()),
          spaceBlock("q1-space", 6),
        ]),
      ]),
    calls: [
      {
        name: "mauth.question.upsert",
        arguments: {
          questionNumber: 1,
          marks: 2,
          questionText: "State two reasons why the probability table is not valid.",
          diagrams: [],
          studentSpaceLines: 6,
          solutionText: "Repeated $x$ values are listed separately. [[marks:1]] The probabilities sum to more than $1$. [[marks:1]]",
        },
      },
    ],
    evaluate: ({ document }) => [...failIf(diagrams(document).length !== 0, "explicit diagrams: [] should remove the existing diagram")],
  },
  {
    id: "visible-mark-notes-are-sanitised",
    prompt: "Add a solution, but the model accidentally writes visible [1 mark] text.",
    assistantPlan: "The assistant should write hidden ticks directly; the tool boundary should still sanitise visible mark notes.",
    start: () => documentFixture([question("q1", 3, [textBlock("q1-text", "Find $P(X=3)$."), spaceBlock("q1-space", 6)])]),
    calls: [
      {
        name: "mauth.author.ensureSolutions",
        arguments: {
          questions: [
            {
              questionNumber: 1,
              marks: 3,
              solutionText:
                "**Solution (3 marks).** Use the binomial formula. [1 mark]\n\n$$P(X=3)=\\binom{6}{3}(0.8)^3(0.2)^3.$$ \\text{[1 mark]}\n\n$$P(X=3)=0.0819.$$ (1 mark)",
            },
          ],
        },
      },
    ],
    evaluate: ({ document }) => [
      ...failIf(hasVisibleMarkLanguage(firstSolutionText(document)), "visible mark notes should be removed from solution text"),
      ...failIf(markAnnotationTotal(firstSolutionText(document)) !== 3, "visible notes should become 3 hidden mark ticks"),
    ],
  },
  {
    id: "multipart-solutions-target-parts",
    prompt: "Write solutions for parts (a) and (b), keeping part marks and spaces correct.",
    assistantPlan: "Use mauth.author.ensureSolutions with part payloads, not one giant question-level solution.",
    start: () =>
      documentFixture([
        question(
          "q1",
          0,
          [textBlock("q1-text", "A discrete random variable has probability function $P(X=x)=k/x$.")],
          [
            part("q1-a", "a", 2, "Find $k$.", [spaceBlock("q1-a-space", 6)]),
            part("q1-b", "b", 1, "Find $E(X)$.", [spaceBlock("q1-b-space", 5)]),
          ],
        ),
      ]),
    calls: [
      {
        name: "mauth.author.ensureSolutions",
        arguments: {
          questions: [
            {
              questionNumber: 1,
              questionMarks: 0,
              solutionText: "Part solutions are provided below.",
              parts: [
                {
                  label: "a",
                  marks: 2,
                  solutionText: "$$k\\sum \\frac1x=1.$$ [[marks:1]] Therefore $k=\\frac{30}{11}$. [[marks:1]]",
                },
                {
                  label: "b",
                  marks: 1,
                  solutionText: "$$E(X)=\\sum x\\frac{k}{x}=3k=\\frac{90}{11}.$$ [[marks:1]]",
                },
              ],
            },
          ],
        },
      },
    ],
    evaluate: ({ document }) => {
      const parts = document.questions[0].parts ?? [];
      const partSolutions = parts.flatMap((item) =>
        item.contentBlocks.filter(
          (block): block is Extract<ContentBlock, { kind: "text" }> => block.kind === "text" && block.visibility === "solution",
        ),
      );
      return [
        ...failIf(document.questions[0].marks !== 0, "question-level marks should stay 0 when marks live on parts"),
        ...failIf(parts[0]?.marks !== 2 || parts[1]?.marks !== 1, "part marks should be updated/preserved"),
        ...failIf(partSolutions.length !== 2, "each part should receive its own solution block"),
        ...failIf(
          partSolutions.reduce((sum, block) => sum + markAnnotationTotal(block.text), 0) !== 3,
          "part solution ticks should total 3",
        ),
      ];
    },
  },
  {
    id: "whole-test-solutions-write-all-preserves-diagrams",
    prompt: "Write the full solution key for this whole test.",
    assistantPlan:
      "Use mauth.solutions.writeAll with payload coverage for every marked question/part/subpart, then let the tool validate hidden ticks and layout.",
    start: () =>
      documentFixture([
        question("q1", 2, [textBlock("q1-text", "Use the probability chart."), diagramBlock("q1-chart", statsChartConfig())]),
        question(
          "q2",
          0,
          [textBlock("q2-text", "A discrete random variable has probability function $P(X=x)=k/x$.")],
          [
            part("q2-a", "a", 2, "Find $k$.", [spaceBlock("q2-a-space", 6)]),
            part("q2-b", "b", 1, "Find $E(X)$.", [spaceBlock("q2-b-space", 5)]),
          ],
        ),
      ]),
    calls: [
      {
        name: "mauth.solutions.writeAll",
        arguments: {
          questions: [
            {
              questionNumber: 1,
              marks: 2,
              studentSpaceLines: 7,
              solutionText: "Read the probability value from the chart. [[marks:1]] State the answer clearly. [[marks:1]]",
            },
            {
              questionNumber: 2,
              questionMarks: 0,
              parts: [
                {
                  label: "a",
                  marks: 2,
                  solutionText: "$$k\\sum \\frac1x=1.$$ [[marks:1]] Therefore $k=\\frac{30}{11}$. [[marks:1]]",
                },
                {
                  label: "b",
                  marks: 1,
                  solutionText: "$$E(X)=\\sum x\\frac{k}{x}=\\frac{90}{11}.$$ [[marks:1]]",
                },
              ],
            },
          ],
        },
      },
    ],
    evaluate: ({ document, results }) => {
      const inspection = inspectMauthDocument(document);
      return [
        ...failIf(results[0]?.ok !== true, "writeAll tool should pass"),
        ...failIf(diagrams(document).length !== 1, "whole-test solution pass should preserve the existing diagram"),
        ...failIf(solutionTexts(document).length !== 3, "each marked scope should receive one solution block"),
        ...failIf(inspection.counts.studentOnlyModules < 3, "each marked scope should retain or receive a student answer space"),
        ...failIf(
          solutionTexts(document).reduce((sum, text) => sum + markAnnotationTotal(text), 0) !== 5,
          "hidden solution ticks should total the document marks",
        ),
      ];
    },
  },
  {
    id: "scalar-product-diagram-wrong-renderer-is-rejected",
    prompt: "Make Question 1 from a screenshot: evaluate scalar products with a four-vector ray diagram.",
    assistantPlan:
      "The intent validator should reject graph2d/network/geometricConstruction here and ask for a native hidden-axis vector2d ray diagram.",
    start: () => documentFixture([question("q1", 5, [textBlock("q1-text", "Original question."), spaceBlock("q1-space", 8)])]),
    expectToolFailure: true,
    calls: [
      {
        name: "mauth.question.upsert",
        arguments: {
          questionNumber: 1,
          marks: 5,
          questionText: "Evaluate the following scalar products exactly.",
          parts: [
            { text: "$\\mathbf{a}\\cdot\\mathbf{b}$", marks: 1, studentSpaceLines: 4 },
            { text: "$\\mathbf{a}\\cdot\\mathbf{d}$", marks: 2, studentSpaceLines: 4 },
            { text: "$\\mathbf{c}\\cdot\\mathbf{d}$", marks: 2, studentSpaceLines: 4 },
          ],
          diagram: {
            graphConfig: {
              type: "network",
              data: { nodes: [], edges: [] },
            },
          },
        },
      },
    ],
    evaluate: ({ document, results }) => [
      ...failIf(results[0]?.ok !== false, "wrong scalar-product renderer should fail validation"),
      ...failIf(document.questions[0].contentBlocks[0]?.kind !== "text", "failed action should leave original question untouched"),
      ...failIf(diagrams(document).length !== 0, "failed action should not add the wrong diagram"),
    ],
  },
  {
    id: "source-conversion-includes-native-diagram-and-real-part-text",
    prompt: "Make Question 1 from the attached screenshot, include the diagram underneath, then put the parts under the diagram.",
    assistantPlan:
      "Use mauth.question.upsert/convert-source with a native hidden-axis vector2d source diagram and non-empty part prompts; do not replace the diagram with prose.",
    start: () => documentFixture([question("q1", 5, [textBlock("q1-text", "Original question."), spaceBlock("q1-space", 8)])]),
    calls: [
      {
        name: "mauth.question.upsert",
        arguments: {
          questionNumber: 1,
          marks: 0,
          questionText: "Evaluate the following scalar products exactly.",
          diagram: {
            graphConfig: scalarProductVector2dGraphConfig(),
          },
          parts: [
            { text: "$\\mathbf{a}\\cdot\\mathbf{b}$", marks: 1, studentSpaceLines: 4 },
            { text: "$\\mathbf{a}\\cdot\\mathbf{d}$", marks: 2, studentSpaceLines: 4 },
            { text: "$\\mathbf{c}\\cdot\\mathbf{d}$", marks: 2, studentSpaceLines: 4 },
          ],
        },
      },
    ],
    evaluate: ({ document }) => {
      const parts = document.questions[0].parts ?? [];
      const graphConfig = diagrams(document)[0]?.kind === "diagram" ? diagrams(document)[0].graphConfig : undefined;
      const vector2d = graphConfig?.metadata?.vector2d as
        | { vectors?: unknown[]; segmentLabels?: unknown[]; angleMarkers?: Array<{ rightAngle?: boolean; label?: string }> }
        | undefined;
      return [
        ...failIf(document.questions[0].marks !== 0, "converted source question should put marks on parts"),
        ...failIf(parts.length !== 3, "converted screenshot should create the three visible parts"),
        ...failIf(
          parts.some((item) => !item.text.trim()),
          "converted parts should not be blank",
        ),
        ...failIf(graphConfig?.type !== "vector2d", "scalar-product screenshot should use native vector2d"),
        ...failIf(graphConfig?.showAxes !== false || graphConfig?.showGrid !== false, "source vector2d diagram should hide axes and grid"),
        ...failIf((vector2d?.vectors?.length ?? 0) < 4, "native vector2d diagram should include all four labelled vectors"),
        ...failIf((vector2d?.segmentLabels?.length ?? 0) < 4, "native vector2d diagram should preserve magnitude labels"),
        ...failIf(
          !vector2d?.angleMarkers?.some((marker) => marker.rightAngle === true),
          "native vector2d diagram should preserve right-angle marker",
        ),
        ...failIf(
          !vector2d?.angleMarkers?.some((marker) => typeof marker.label === "string"),
          "native vector2d diagram should preserve angle labels",
        ),
      ];
    },
  },
  {
    id: "scalar-product-diagram-inspection-flags-missing-vector-labels",
    prompt: "The assistant draws a scalar-product ray diagram but forgets labels for two vectors.",
    assistantPlan:
      "Preview inspection should flag missing vector labels so the provider repairs the native vector2d metadata before claiming success.",
    start: () =>
      documentFixture([
        question(
          "q1",
          5,
          [
            textBlock("q1-text", "Evaluate the following scalar products exactly."),
            diagramBlock("q1-diagram", scalarProductVector2dGraphConfig({ includeAllLabels: false })),
          ],
          [part("q1-a", "a", 1, "$\\mathbf{a}\\cdot\\mathbf{b}$"), part("q1-b", "b", 2, "$\\mathbf{c}\\cdot\\mathbf{d}$")],
        ),
      ]),
    calls: [{ name: "mauth.preview.inspect", arguments: { questionNumber: 1 } }],
    evaluate: ({ results }) => {
      const inspection = results[0]?.data as { question?: { diagrams?: Array<{ warnings?: Array<{ code: string; message: string }> }> } };
      const warnings = inspection.question?.diagrams?.[0]?.warnings ?? [];
      return [
        ...failIf(
          !warnings.some((warning) => warning.code === "scalar-product-vector-labels-missing"),
          "diagram inspection should flag missing vector labels",
        ),
        ...failIf(!warnings.some((warning) => warning.message.includes("$\\mathbf{c}$")), "warning should name the missing vector labels"),
      ];
    },
  },
  {
    id: "coordinate-vector-diagram-wrong-renderer-is-rejected",
    prompt: "Draw vector a=(2,3) and b=(4,-3) from the origin on coordinate axes.",
    assistantPlan: "The intent validator should require vector2d for coordinate/component vectors on axes.",
    start: () => documentFixture([question("q1", 2, [textBlock("q1-text", "Draw vector $\\mathbf{a}=(2,3)$ from the origin.")])]),
    expectToolFailure: true,
    calls: [
      {
        name: "mauth.author.addDiagram",
        arguments: {
          questionNumber: 1,
          diagram: {
            graphConfig: {
              type: "geometricConstruction",
              data: {},
              options: { substanceSource: "Point O, A\nSegment(OA, O, A)\n" },
            },
          },
        },
      },
    ],
    evaluate: ({ document, results }) => [
      ...failIf(results[0]?.ok !== false, "wrong coordinate-vector renderer should fail validation"),
      ...failIf(diagrams(document).length !== 0, "failed action should not add the wrong diagram"),
    ],
  },
  {
    id: "malformed-diagram-is-rejected",
    prompt: "The assistant tries to create a manual-probability chart with mismatched data arrays.",
    assistantPlan: "The tool boundary should reject malformed diagram config before mutating the document.",
    start: () => documentFixture([question("q1", 2, [textBlock("q1-text", "Read the chart."), spaceBlock("q1-space", 4)])]),
    expectToolFailure: true,
    calls: [
      {
        name: "mauth.author.addDiagram",
        arguments: {
          questionNumber: 1,
          diagram: {
            graphConfig: {
              type: "statsChart",
              data: {
                chartType: "histogram",
                dataMode: "manualProbabilities",
                xValues: [1, 2, 3],
                probabilities: [0.2, 0.8],
              },
            },
          },
        },
      },
    ],
    evaluate: ({ document, results }) => [
      ...failIf(results[0]?.ok !== false, "malformed diagram should fail validation"),
      ...failIf(diagrams(document).length !== 0, "rejected diagram action should not mutate the document"),
    ],
  },
  {
    id: "low-level-solution-visibility-is-rejected",
    prompt: "The assistant emits a raw visible Solution text block instead of a solution-only block.",
    assistantPlan: "The low-level action validator should reject ordinary visible solution text before applying.",
    start: () => documentFixture([question("q1", 1, [textBlock("q1-text", "Find $x$."), spaceBlock("q1-space", 4)])]),
    expectToolFailure: true,
    calls: [
      {
        name: "mauth.actions.apply",
        arguments: {
          action: {
            type: "module.add",
            scope: { kind: "question", questionId: "q1" },
            blocks: [{ id: "bad-solution", kind: "text", text: "Solution. $x=3$ [[marks:1]]" }],
          },
        },
      },
    ],
    evaluate: ({ document, results }) => [
      ...failIf(results[0]?.ok !== false, "visible raw solution text should fail validation"),
      ...failIf(
        allBlocks(document).some((block) => block.id === "bad-solution"),
        "failed action should not add the bad solution block",
      ),
    ],
  },
  {
    id: "validation-runs-after-authoring",
    prompt: "After authoring, check document and solution validation.",
    assistantPlan: "Run mauth.validation.run after high-level authoring and inspect compact document counts.",
    start: () => documentFixture([question("q1", 2, [textBlock("q1-text", "Calculate $2+3$."), spaceBlock("q1-space", 4)])]),
    calls: [
      {
        name: "mauth.author.ensureSolutions",
        arguments: {
          questions: [{ questionNumber: 1, marks: 2, solutionText: "$$2+3=5.$$ [[marks:2]]" }],
        },
      },
      { name: "mauth.validation.run", arguments: { mode: "both" } },
    ],
    evaluate: ({ document, results }) => {
      const inspection = inspectMauthDocument(document);
      return [
        ...failIf(results.at(-1)?.ok !== true, "validation tool should return ok"),
        ...failIf(inspection.counts.solutionOnlyModules !== 1, "inspection should see one solution-only module"),
        ...failIf(inspection.counts.studentOnlyModules < 1, "inspection should see a student-only answer space"),
        ...failIf(markAnnotationTotal(firstSolutionText(document)) !== 2, "solution ticks should match marks"),
      ];
    },
  },
  {
    id: "layout-check-flags-missing-answer-surface-and-oversized-diagram",
    prompt: "Check the whole document layout before printing.",
    assistantPlan:
      "Use mauth.layout.check to catch missing student answer surfaces, missing solutions, oversized diagrams, page overflow, and print-risk warnings.",
    start: () =>
      documentFixture([
        question("q1", 2, [textBlock("q1-text", "Find $x$."), textBlock("q1-solution", "**Solution.**\n$x=3$. [[marks:2]]", "solution")]),
        question("q2", 3, [
          textBlock("q2-text", "Use the diagram."),
          diagramBlock("q2-graph", {
            type: "graph2d",
            functions: [],
            options: { widthPx: 760, heightPx: 720 },
          } as unknown as GraphConfig),
          spaceBlock("q2-space", 8),
        ]),
      ]),
    calls: [{ name: "mauth.layout.check", arguments: { mode: "both" } }],
    evaluate: ({ results }) => {
      const check = results[0]?.data as { issues?: Array<{ code: string }> };
      const warningCodes = check.issues?.map((warning) => warning.code) ?? [];
      return [
        ...failIf(!warningCodes.includes("student-answer-surface-missing"), "layout check should flag a solution with no student surface"),
        ...failIf(!warningCodes.includes("solution-missing"), "layout check should flag marked scopes with no solution"),
        ...failIf(!warningCodes.includes("diagram-oversized-print-risk"), "layout check should flag oversized diagrams"),
      ];
    },
  },
];

async function runScenario(scenario: SmokeScenario) {
  let document = scenario.start();
  const results: SmokeToolResult[] = [];

  if (scenario.useAdapterPreflight) {
    const harness = adapterHarness(document);
    for (const call of scenario.calls) {
      const result = await runMauthAssistantAdapterTool(harness.host, call);
      results.push(result);
      document = harness.document;
    }
  } else {
    for (const call of scenario.calls) {
      const result = runMauthAssistantTool(document, call, {
        validateDocument: (nextDocument) => {
          const inspection = inspectMauthDocument(nextDocument);
          return {
            questions: inspection.counts.questions,
            marksTotal: inspection.counts.marksTotal,
            modules: inspection.counts.modules,
          };
        },
        validateSolutions: (questions) => {
          const solutionOnlyModules = questions
            .flatMap((item) => allBlocks(documentFixture([item])))
            .filter((block) => block.visibility === "solution").length;
          return {
            questions: questions.length,
            solutionOnlyModules,
          };
        },
      });
      results.push(result);
      if (result.ok && result.document) document = result.document as TestDocument;
    }
  }

  const unexpectedToolFailures = scenario.expectToolFailure
    ? []
    : results.flatMap((result, index) =>
        result.ok ? [] : [`tool ${index + 1} (${result.toolName}) failed: ${result.error ?? "unknown error"}`],
      );
  const expectedFailureMissing =
    scenario.expectToolFailure && results.every((result) => result.ok)
      ? ["expected at least one tool validation failure, but all calls passed"]
      : [];
  const evaluationFailures = scenario.evaluate({ document, results });

  return {
    scenario,
    document,
    results,
    failures: [...unexpectedToolFailures, ...expectedFailureMissing, ...evaluationFailures],
  };
}

const reports = [];
for (const scenario of scenarios) reports.push(await runScenario(scenario));
const failedReports = reports.filter((report) => report.failures.length);

for (const report of reports) {
  const status = report.failures.length ? "FAIL" : "PASS";
  console.log(`\n${status} ${report.scenario.id}`);
  console.log(`  prompt: ${report.scenario.prompt}`);
  console.log(`  assistant plan: ${report.scenario.assistantPlan}`);
  console.log(`  calls: ${report.results.map((result) => result.toolName).join(" -> ")}`);
  for (const failure of report.failures) console.log(`  - ${failure}`);
}

console.log(`\nAssistant self-smoke: ${reports.length - failedReports.length}/${reports.length} scenarios passed.`);

if (failedReports.length) {
  process.exitCode = 1;
}
