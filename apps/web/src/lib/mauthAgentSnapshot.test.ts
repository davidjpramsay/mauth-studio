import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import { buildMauthAgentSnapshot } from "./mauthAgentSnapshot.ts";
import type { MauthQuestionLike } from "./mauthActions.ts";

interface TestFrontMatter {
  assessmentTitle: string;
  logoId: string;
}

interface TestFormattingConfig {
  showMarks: boolean;
}

function textBlock(id: string, text: string): ContentBlock {
  return { id, kind: "text", text };
}

function spaceBlock(id: string, lines: number): ContentBlock {
  return { id, kind: "space", lines };
}

function diagramBlock(id: string, graphConfig: GraphConfig): ContentBlock {
  return { id, kind: "diagram", graphConfig };
}

function question(blocks: ContentBlock[]): MauthQuestionLike {
  return {
    id: "q1",
    marks: 4,
    text: "Differentiate the function.",
    contentBlocks: blocks,
    itemOrder: blocks.map((block) => ({ kind: "block", id: block.id })),
    parts: [],
  };
}

function snapshotFor(blocks: ContentBlock[]) {
  return buildMauthAgentSnapshot<MauthQuestionLike, TestFrontMatter, TestFormattingConfig>({
    document: {
      frontMatter: { assessmentTitle: "Calculus", logoId: "school" },
      formattingConfig: { showMarks: true },
      questions: [question(blocks)],
    },
    file: {
      projectId: "project-1",
      projectName: "Project",
      activePath: "tests/calculus.test.json",
      activeRevision: 7,
      dirty: false,
      saveStatus: "saved",
    },
    generatedAt: "2026-05-31T00:00:00.000Z",
  });
}

test("buildMauthAgentSnapshot emits a stable mutation base for unchanged document state", () => {
  const first = snapshotFor([textBlock("b1", "Find $f'(x)$."), spaceBlock("s1", 4)]);
  const second = snapshotFor([textBlock("b1", "Find $f'(x)$."), spaceBlock("s1", 4)]);

  assert.equal(first.snapshotId, second.snapshotId);
  assert.equal(first.mutationBase.snapshotId, first.snapshotId);
  assert.equal(first.mutationBase.activeProjectFilePath, "tests/calculus.test.json");
  assert.equal(first.mutationBase.activeProjectFileRevision, 7);
});

test("buildMauthAgentSnapshot changes snapshot id when editable content changes", () => {
  const first = snapshotFor([textBlock("b1", "Find $f'(x)$.")]);
  const second = snapshotFor([textBlock("b1", "Find $g'(x)$.")]);

  assert.notEqual(first.snapshotId, second.snapshotId);
});

test("buildMauthAgentSnapshot summarizes modules for agent planning", () => {
  const snapshot = snapshotFor([diagramBlock("d1", { type: "graph2d", expression: "x^2" }), spaceBlock("s1", 6)]);

  assert.equal(snapshot.questionCount, 1);
  assert.equal(snapshot.totalMarks, 4);
  assert.equal(snapshot.questions[0].modules[0].graphType, "graph2d");
  assert.equal(snapshot.questions[0].modules[1].lines, 6);
});

test("buildMauthAgentSnapshot reports holistic investigation marks without questions", () => {
  const snapshot = buildMauthAgentSnapshot<MauthQuestionLike, TestFrontMatter & Record<string, unknown>, TestFormattingConfig>({
    document: {
      frontMatter: {
        assessmentTitle: "Investigation 2",
        logoId: "school",
        titlePageTemplate: "investigation",
        investigation: {
          criteria: [
            {
              id: "criterion-1",
              heading: "Criterion 1",
              guidance: "Evidence",
              scoringMode: "holistic",
              allocations: [
                { id: "level-4", marks: 4, description: "Complete" },
                { id: "level-3", marks: 3, description: "Substantial" },
                { id: "level-2", marks: 2, description: "Partial" },
                { id: "level-1", marks: 1, description: "Limited" },
              ],
            },
          ],
        },
      },
      formattingConfig: { showMarks: true },
      questions: [],
    },
    file: {
      projectId: "project-1",
      projectName: "Project",
      activePath: null,
      activeRevision: null,
      dirty: false,
      saveStatus: "draft",
    },
  });

  assert.equal(snapshot.questionCount, 0);
  assert.equal(snapshot.totalMarks, 4);
});

test("buildMauthAgentSnapshot exposes a shared selected choice answer and its ticks", () => {
  const snapshot = snapshotFor([
    {
      id: "choices",
      kind: "choices",
      choices: ["$2$", "$4$", "$6$"],
      solutionAnswerIndex: 1,
      markTicks: 1,
    },
  ]);

  assert.equal(snapshot.questions[0]?.modules[0]?.choiceCount, 3);
  assert.equal(snapshot.questions[0]?.modules[0]?.visibility, "always");
  assert.equal(snapshot.questions[0]?.modules[0]?.solutionAnswerIndex, 1);
  assert.equal(snapshot.questions[0]?.modules[0]?.marks, 1);
});

test("buildMauthAgentSnapshot reports shared table answer entry counts", () => {
  const snapshot = snapshotFor([
    {
      id: "table",
      kind: "table",
      headers: ["x", "0", "1"],
      rows: [["y", "", ""]],
      solutionEntries: [["", "6", "4"]],
      markTicks: 2,
    },
  ]);

  assert.equal(snapshot.questions[0]?.modules[0]?.rowCount, 1);
  assert.equal(snapshot.questions[0]?.modules[0]?.columnCount, 3);
  assert.equal(snapshot.questions[0]?.modules[0]?.solutionEntryCount, 2);
  assert.equal(snapshot.questions[0]?.modules[0]?.marks, 2);
});

test("buildMauthAgentSnapshot exposes section headings and document flow", () => {
  const snapshot = buildMauthAgentSnapshot<MauthQuestionLike, TestFrontMatter, TestFormattingConfig>({
    document: {
      frontMatter: { assessmentTitle: "Calculus", logoId: "school" },
      formattingConfig: { showMarks: true },
      questions: [question([textBlock("b1", "Choose the correct response.")])],
      sectionHeadings: [
        {
          id: "section-1",
          title: "Multiple choice",
          titlePage: { instructionsBody: "No calculator.", showInstructions: true },
        },
      ],
      documentFlow: [
        { kind: "sectionHeading", id: "section-1" },
        { kind: "question", id: "q1" },
      ],
    },
    file: {
      projectId: "project-1",
      projectName: "Project",
      activePath: "tests/calculus.test.json",
      activeRevision: 7,
      dirty: false,
      saveStatus: "saved",
    },
    generatedAt: "2026-05-31T00:00:00.000Z",
  });

  assert.deepEqual(snapshot.sectionHeadings, [
    {
      id: "section-1",
      title: "Multiple choice",
      titlePage: { instructionsBody: "No calculator.", showInstructions: true },
    },
  ]);
  assert.deepEqual(snapshot.documentFlow, [
    { kind: "sectionHeading", id: "section-1", title: "Multiple choice" },
    { kind: "question", id: "q1", label: "Question 1" },
  ]);
});

test("buildMauthAgentSnapshot preserves measured preview warnings", () => {
  const snapshot = buildMauthAgentSnapshot<MauthQuestionLike, TestFrontMatter, TestFormattingConfig>({
    document: {
      frontMatter: { assessmentTitle: "Calculus", logoId: "school" },
      formattingConfig: { showMarks: true },
      questions: [question([textBlock("b1", "Differentiate $x^2$.")])],
    },
    file: {
      projectId: "project-1",
      projectName: "Project",
      activePath: "tests/calculus.test.json",
      activeRevision: 7,
      dirty: false,
      saveStatus: "saved",
    },
    warnings: [
      {
        code: "rendered-page-overflow",
        message: "Student preview page 2 contains a block taller than the printable A4 content area.",
        targetId: "q1",
      },
    ],
  });

  assert.deepEqual(snapshot.warnings, [
    {
      code: "rendered-page-overflow",
      message: "Student preview page 2 contains a block taller than the printable A4 content area.",
      targetId: "q1",
    },
  ]);
});
