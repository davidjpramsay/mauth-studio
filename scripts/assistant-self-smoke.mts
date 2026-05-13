import process from "node:process";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import type { MauthDocumentLike, MauthPartLike, MauthQuestionLike } from "../apps/web/src/lib/mauthActions.ts";
import { inspectMauthDocument, runMauthAssistantTool, type MauthAssistantToolCall } from "../apps/web/src/lib/mauthAssistantTools.ts";

interface TestFrontMatter {
  schoolName: string;
  assessmentTitle: string;
}

interface TestFormattingConfig {
  showMarks: boolean;
}

type TestDocument = MauthDocumentLike<MauthQuestionLike, TestFrontMatter, TestFormattingConfig>;

interface ScenarioContext {
  document: TestDocument;
  results: ReturnType<typeof runMauthAssistantTool>[];
}

interface SmokeScenario {
  id: string;
  prompt: string;
  assistantPlan: string;
  start: () => TestDocument;
  calls: MauthAssistantToolCall[];
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

function allBlocks(document: TestDocument) {
  const blocks: ContentBlock[] = [];
  for (const item of document.questions) {
    blocks.push(...item.contentBlocks);
    for (const partItem of item.parts ?? []) {
      blocks.push(...partItem.contentBlocks);
      for (const subpart of partItem.subparts ?? []) blocks.push(...subpart.contentBlocks);
    }
  }
  return blocks;
}

function questionBlocks(document: TestDocument, questionIndex = 0) {
  return document.questions[questionIndex]?.contentBlocks ?? [];
}

function diagrams(document: TestDocument, questionIndex = 0) {
  return questionBlocks(document, questionIndex).filter((block) => block.kind === "diagram");
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

const scenarios: SmokeScenario[] = [
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
    assistantPlan: "Use mauth.author.replaceQuestion and omit diagram fields so existing shared diagrams are preserved.",
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
        name: "mauth.author.replaceQuestion",
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
    assistantPlan: "Use mauth.author.replaceQuestion with diagrams: [] only because the teacher explicitly asked to remove diagrams.",
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
        name: "mauth.author.replaceQuestion",
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
    id: "scalar-product-diagram-wrong-renderer-is-rejected",
    prompt: "Make Question 1 from a screenshot: evaluate scalar products with a four-vector ray diagram.",
    assistantPlan:
      "The intent validator should reject graph2d/vectorRelationship here and ask for a native geometricConstruction ray diagram.",
    start: () => documentFixture([question("q1", 5, [textBlock("q1-text", "Original question."), spaceBlock("q1-space", 8)])]),
    expectToolFailure: true,
    calls: [
      {
        name: "mauth.author.replaceQuestion",
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
              type: "vectorRelationship",
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
    id: "scalar-product-diagram-inspection-flags-missing-vector-labels",
    prompt: "The assistant draws a scalar-product ray diagram but forgets labels for two vectors.",
    assistantPlan:
      "Preview inspection should flag missing vector labels so the provider repairs the native Penrose Substance before claiming success.",
    start: () =>
      documentFixture([
        question(
          "q1",
          5,
          [textBlock("q1-text", "Evaluate the following scalar products exactly.")],
          [part("q1-a", "a", 1, "$\\mathbf{a}\\cdot\\mathbf{b}$"), part("q1-b", "b", 2, "$\\mathbf{c}\\cdot\\mathbf{d}$")],
        ),
      ]),
    calls: [
      {
        name: "mauth.author.addDiagram",
        arguments: {
          questionNumber: 1,
          diagram: {
            graphConfig: {
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
];

function runScenario(scenario: SmokeScenario) {
  let document = scenario.start();
  const results: ReturnType<typeof runMauthAssistantTool>[] = [];

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

const reports = scenarios.map(runScenario);
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
