import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import type { MauthDocumentActionResult, MauthDocumentLike, MauthQuestionLike } from "./mauthActions.ts";
import {
  describeMauthAssistantTools,
  inspectMauthDocument,
  runMauthAssistantTool,
  type MauthAssistantToolDescription,
} from "./mauthAssistantTools.ts";

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
  assert.equal(space?.kind === "space" ? space.lines : 0, 12);
  assert.equal(space?.visibility, "student");
  assert.match(solution?.kind === "text" ? solution.text : "", /^\*\*Solution\.\*\*/);
  assert.equal(solution?.visibility, "solution");
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
    { kind: "part", id: "q1-part-1" },
    { kind: "part", id: "q1-part-2" },
  ]);
  assert.equal(question?.parts[0].label, "a");
  assert.equal(question?.parts[0].marks, 1);
  assert.equal(question?.parts[0].text, "State the number of trials.");
  assert.equal(question?.parts[0].contentBlocks[0].kind, "space");
  assert.equal(question?.parts[0].contentBlocks[0].visibility, "student");
  assert.equal(question?.parts[0].contentBlocks[1].kind, "text");
  assert.equal(question?.parts[0].contentBlocks[1].visibility, "solution");
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
