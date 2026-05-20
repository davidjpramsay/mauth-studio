import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import {
  applyMauthAction,
  applyMauthActions,
  applyMauthDocumentAction,
  applyMauthDocumentActions,
  previewMauthDocumentActions,
  type MauthPartLike,
  type MauthQuestionLike,
  type MauthSubpartLike,
} from "./mauthActions.ts";

function textBlock(id: string, text: string): ContentBlock {
  return { id, kind: "text", text };
}

function spaceBlock(id: string, lines: number): ContentBlock {
  return { id, kind: "space", lines };
}

function diagramBlock(id: string, graphConfig: GraphConfig): ContentBlock {
  return { id, kind: "diagram", graphConfig };
}

function question(id: string, blocks: ContentBlock[] = []): MauthQuestionLike {
  return {
    id,
    marks: 0,
    contentBlocks: blocks,
    itemOrder: blocks.map((block) => ({ kind: "block", id: block.id })),
    parts: [],
    pageBreakAfter: false,
  };
}

function part(id: string, subparts: MauthSubpartLike[] = []): MauthPartLike {
  return {
    id,
    label: "",
    text: "",
    marks: 0,
    pageBreakBefore: false,
    contentBlocks: [],
    subparts,
    itemOrder: subparts.map((subpart) => ({ kind: "subpart" as const, id: subpart.id })),
  };
}

function subpart(id: string): MauthSubpartLike {
  return {
    id,
    label: "",
    text: "",
    marks: 0,
    pageBreakBefore: false,
    contentBlocks: [],
  };
}

function normalizeLabels(question: MauthQuestionLike): MauthQuestionLike {
  return {
    ...question,
    parts: (question.parts ?? []).map((partItem, partIndex) => ({
      ...partItem,
      label: String.fromCharCode(97 + partIndex),
      subparts: (partItem.subparts ?? []).map((subpartItem, subpartIndex) => ({
        ...subpartItem,
        label: ["i", "ii", "iii", "iv"][subpartIndex] ?? `${subpartIndex + 1}`,
      })),
    })),
  };
}

interface TestFrontMatter {
  logoId: string;
  schoolName: string;
  assessmentTitle: string;
  startQuestionNumber: number;
}

interface TestFormattingConfig {
  page?: {
    widthPx?: number;
    heightPx?: number;
    paddingXPx?: number;
    paddingYPx?: number;
    showPageBreaks?: boolean;
  };
  showMarks?: boolean;
}

function normalizeTestFrontMatter(frontMatter: TestFrontMatter): TestFrontMatter {
  return {
    ...frontMatter,
    assessmentTitle: frontMatter.assessmentTitle.toUpperCase(),
    startQuestionNumber: Math.max(1, Math.floor(frontMatter.startQuestionNumber || 1)),
  };
}

test("adds, updates, deletes, and reorders questions", () => {
  const initial = [question("q1"), question("q2")];
  const q3 = question("q3");

  const added = applyMauthAction(initial, { type: "question.add", question: q3, afterQuestionId: "q1" });
  assert.equal(added.ok, true);
  assert.deepEqual(
    added.questions.map((item) => item.id),
    ["q1", "q3", "q2"],
  );
  assert.deepEqual(added.changedIds, ["q3"]);

  const updated = applyMauthAction(added.questions, { type: "question.update", questionId: "q3", patch: { marks: 4 } });
  assert.equal(updated.ok, true);
  assert.equal(updated.questions.find((item) => item.id === "q3")?.marks, 4);

  const reordered = applyMauthAction(updated.questions, {
    type: "question.reorder",
    questionId: "q3",
    targetQuestionId: "q1",
    placement: "before",
  });
  assert.equal(reordered.ok, true);
  assert.deepEqual(
    reordered.questions.map((item) => item.id),
    ["q3", "q1", "q2"],
  );

  const removed = applyMauthAction(reordered.questions, { type: "question.delete", questionId: "q1" });
  assert.equal(removed.ok, true);
  assert.deepEqual(
    removed.questions.map((item) => item.id),
    ["q3", "q2"],
  );
});

test("adds, updates, deletes, and reorders question modules", () => {
  const initial = [question("q1", [textBlock("b1", "First"), textBlock("b2", "Second")])];

  const added = applyMauthAction(initial, {
    type: "module.add",
    scope: { kind: "question", questionId: "q1" },
    blocks: [spaceBlock("b3", 5)],
    placement: { blockId: "b1", position: "after" },
  });
  assert.equal(added.ok, true);
  assert.deepEqual(
    added.questions[0].contentBlocks.map((block) => block.id),
    ["b1", "b3", "b2"],
  );
  assert.deepEqual(
    added.questions[0].itemOrder?.map((item) => item.id),
    ["b1", "b3", "b2"],
  );

  const updated = applyMauthAction(added.questions, {
    type: "module.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "b3",
    patch: { lines: 8 },
  });
  assert.equal(updated.ok, true);
  assert.deepEqual(
    updated.questions[0].contentBlocks.find((block) => block.id === "b3"),
    spaceBlock("b3", 8),
  );

  const reordered = applyMauthAction(updated.questions, {
    type: "module.reorder",
    scope: { kind: "question", questionId: "q1" },
    blockId: "b3",
    targetBlockId: "b2",
    placement: "after",
  });
  assert.equal(reordered.ok, true);
  assert.deepEqual(
    reordered.questions[0].contentBlocks.map((block) => block.id),
    ["b1", "b2", "b3"],
  );
  assert.deepEqual(
    reordered.questions[0].itemOrder?.map((item) => item.id),
    ["b1", "b2", "b3"],
  );

  const removed = applyMauthAction(reordered.questions, {
    type: "module.delete",
    scope: { kind: "question", questionId: "q1" },
    blockId: "b2",
  });
  assert.equal(removed.ok, true);
  assert.deepEqual(
    removed.questions[0].contentBlocks.map((block) => block.id),
    ["b1", "b3"],
  );
  assert.deepEqual(
    removed.questions[0].itemOrder?.map((item) => item.id),
    ["b1", "b3"],
  );
});

test("updates and deletes modules nested inside columns", () => {
  const columnsBlock: ContentBlock = {
    id: "cols",
    kind: "columns",
    columnCount: 2,
    columns: [[textBlock("c1", "Left")], [textBlock("c2", "Right")]],
  };
  const initial = [question("q1", [columnsBlock])];

  const updated = applyMauthAction(initial, {
    type: "module.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "c2",
    patch: { text: "Right updated" },
  });
  assert.equal(updated.ok, true);
  const updatedColumns = updated.questions[0].contentBlocks[0];
  assert.equal(updatedColumns.kind, "columns");
  assert.equal(updatedColumns.kind === "columns" ? updatedColumns.columns[1][0]?.kind : "", "text");
  assert.equal(
    updatedColumns.kind === "columns" && updatedColumns.columns[1][0]?.kind === "text" ? updatedColumns.columns[1][0].text : "",
    "Right updated",
  );

  const deleted = applyMauthAction(updated.questions, {
    type: "module.delete",
    scope: { kind: "question", questionId: "q1" },
    blockId: "c1",
  });
  assert.equal(deleted.ok, true);
  const deletedColumns = deleted.questions[0].contentBlocks[0];
  assert.equal(deletedColumns.kind, "columns");
  assert.deepEqual(deletedColumns.kind === "columns" ? deletedColumns.columns.map((column) => column.map((block) => block.id)) : [], [
    [],
    ["c2"],
  ]);
});

test("adds, deletes, and reorders parts while preserving itemOrder", () => {
  const initial = [
    normalizeLabels({
      ...question("q1"),
      parts: [part("p1"), part("p2")],
      itemOrder: [
        { kind: "part", id: "p1" },
        { kind: "part", id: "p2" },
      ],
    }),
  ];

  const added = applyMauthAction(
    initial,
    { type: "part.add", questionId: "q1", part: part("p3"), placement: { partId: "p1", position: "after" } },
    { normalizeQuestion: normalizeLabels },
  );
  assert.equal(added.ok, true);
  assert.deepEqual(
    added.questions[0].parts?.map((item) => item.id),
    ["p1", "p3", "p2"],
  );
  assert.deepEqual(
    added.questions[0].parts?.map((item) => item.label),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    added.questions[0].itemOrder?.map((item) => item.id),
    ["p1", "p3", "p2"],
  );

  const reordered = applyMauthAction(
    added.questions,
    { type: "part.reorder", questionId: "q1", partId: "p3", targetPartId: "p1", placement: "before" },
    { normalizeQuestion: normalizeLabels },
  );
  assert.equal(reordered.ok, true);
  assert.deepEqual(
    reordered.questions[0].parts?.map((item) => item.id),
    ["p3", "p1", "p2"],
  );
  assert.deepEqual(
    reordered.questions[0].parts?.map((item) => item.label),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    reordered.questions[0].itemOrder?.map((item) => item.id),
    ["p3", "p1", "p2"],
  );

  const removed = applyMauthAction(
    reordered.questions,
    { type: "part.delete", questionId: "q1", partId: "p1" },
    { normalizeQuestion: normalizeLabels },
  );
  assert.equal(removed.ok, true);
  assert.deepEqual(
    removed.questions[0].parts?.map((item) => item.id),
    ["p3", "p2"],
  );
  assert.deepEqual(
    removed.questions[0].parts?.map((item) => item.label),
    ["a", "b"],
  );
  assert.deepEqual(
    removed.questions[0].itemOrder?.map((item) => item.id),
    ["p3", "p2"],
  );
});

test("adds, deletes, and reorders subparts while preserving itemOrder", () => {
  const initial = [
    normalizeLabels({
      ...question("q1"),
      parts: [part("p1", [subpart("s1"), subpart("s2")])],
      itemOrder: [{ kind: "part", id: "p1" }],
    }),
  ];

  const added = applyMauthAction(
    initial,
    { type: "subpart.add", questionId: "q1", partId: "p1", subpart: subpart("s3"), placement: { subpartId: "s1", position: "after" } },
    { normalizeQuestion: normalizeLabels },
  );
  assert.equal(added.ok, true);
  const addedPart = added.questions[0].parts?.[0];
  assert.deepEqual(
    addedPart?.subparts?.map((item) => item.id),
    ["s1", "s3", "s2"],
  );
  assert.deepEqual(
    addedPart?.subparts?.map((item) => item.label),
    ["i", "ii", "iii"],
  );
  assert.deepEqual(
    addedPart?.itemOrder?.map((item) => item.id),
    ["s1", "s3", "s2"],
  );

  const reordered = applyMauthAction(
    added.questions,
    { type: "subpart.reorder", questionId: "q1", partId: "p1", subpartId: "s3", targetSubpartId: "s1", placement: "before" },
    { normalizeQuestion: normalizeLabels },
  );
  assert.equal(reordered.ok, true);
  const reorderedPart = reordered.questions[0].parts?.[0];
  assert.deepEqual(
    reorderedPart?.subparts?.map((item) => item.id),
    ["s3", "s1", "s2"],
  );
  assert.deepEqual(
    reorderedPart?.subparts?.map((item) => item.label),
    ["i", "ii", "iii"],
  );
  assert.deepEqual(
    reorderedPart?.itemOrder?.map((item) => item.id),
    ["s3", "s1", "s2"],
  );

  const removed = applyMauthAction(
    reordered.questions,
    { type: "subpart.delete", questionId: "q1", partId: "p1", subpartId: "s1" },
    { normalizeQuestion: normalizeLabels },
  );
  assert.equal(removed.ok, true);
  const removedPart = removed.questions[0].parts?.[0];
  assert.deepEqual(
    removedPart?.subparts?.map((item) => item.id),
    ["s3", "s2"],
  );
  assert.deepEqual(
    removedPart?.subparts?.map((item) => item.label),
    ["i", "ii"],
  );
  assert.deepEqual(
    removedPart?.itemOrder?.map((item) => item.id),
    ["s3", "s2"],
  );
});

test("moves modules across question, part, and subpart scopes", () => {
  const initial = [
    normalizeLabels({
      ...question("q1", [textBlock("q-text", "Question text")]),
      parts: [
        {
          ...part("p1", [{ ...subpart("s1"), contentBlocks: [textBlock("s-text", "Subpart text")] }]),
          contentBlocks: [textBlock("p-text", "Part text")],
          itemOrder: [
            { kind: "block", id: "p-text" },
            { kind: "subpart", id: "s1" },
          ],
        },
      ],
      itemOrder: [
        { kind: "block", id: "q-text" },
        { kind: "part", id: "p1" },
      ],
    }),
  ];

  const movedIntoPart = applyMauthAction(
    initial,
    {
      type: "module.move",
      fromScope: { kind: "question", questionId: "q1" },
      toScope: { kind: "part", questionId: "q1", partId: "p1" },
      blockId: "q-text",
      placement: { item: { kind: "subpart", id: "s1" }, position: "before" },
    },
    { normalizeQuestion: normalizeLabels },
  );
  assert.equal(movedIntoPart.ok, true);
  assert.deepEqual(
    movedIntoPart.questions[0].contentBlocks.map((block) => block.id),
    [],
  );
  assert.deepEqual(
    movedIntoPart.questions[0].itemOrder?.map((item) => item.id),
    ["p1"],
  );
  assert.deepEqual(
    movedIntoPart.questions[0].parts?.[0].contentBlocks.map((block) => block.id),
    ["p-text", "q-text"],
  );
  assert.deepEqual(
    movedIntoPart.questions[0].parts?.[0].itemOrder?.map((item) => item.id),
    ["p-text", "q-text", "s1"],
  );

  const movedIntoSubpart = applyMauthAction(
    movedIntoPart.questions,
    {
      type: "module.move",
      fromScope: { kind: "part", questionId: "q1", partId: "p1" },
      toScope: { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" },
      blockId: "p-text",
      placement: { item: { kind: "block", id: "s-text" }, position: "before" },
    },
    { normalizeQuestion: normalizeLabels },
  );
  assert.equal(movedIntoSubpart.ok, true);
  assert.deepEqual(
    movedIntoSubpart.questions[0].parts?.[0].contentBlocks.map((block) => block.id),
    ["q-text"],
  );
  assert.deepEqual(
    movedIntoSubpart.questions[0].parts?.[0].subparts?.[0].contentBlocks.map((block) => block.id),
    ["p-text", "s-text"],
  );
});

test("moves parts between questions and preserves mixed itemOrder placement", () => {
  const initial = [
    normalizeLabels({
      ...question("q1"),
      parts: [part("p1"), part("p2")],
      itemOrder: [
        { kind: "part", id: "p1" },
        { kind: "part", id: "p2" },
      ],
    }),
    normalizeLabels({
      ...question("q2", [textBlock("q2-text", "Second question")]),
      itemOrder: [{ kind: "block", id: "q2-text" }],
    }),
  ];

  const moved = applyMauthAction(
    initial,
    {
      type: "part.move",
      fromQuestionId: "q1",
      toQuestionId: "q2",
      partId: "p2",
      placement: { item: { kind: "block", id: "q2-text" }, position: "before" },
    },
    { normalizeQuestion: normalizeLabels },
  );

  assert.equal(moved.ok, true);
  assert.deepEqual(
    moved.questions[0].parts?.map((item) => item.id),
    ["p1"],
  );
  assert.deepEqual(
    moved.questions[1].itemOrder?.map((item) => `${item.kind}:${item.id}`),
    ["part:p2", "block:q2-text"],
  );
  assert.deepEqual(
    moved.questions[1].parts?.map((item) => item.label),
    ["a"],
  );
});

test("moves subparts between parts and preserves mixed itemOrder placement", () => {
  const initial = [
    normalizeLabels({
      ...question("q1"),
      parts: [
        part("p1", [subpart("s1"), subpart("s2")]),
        {
          ...part("p2"),
          contentBlocks: [textBlock("p2-text", "Part two")],
          itemOrder: [{ kind: "block", id: "p2-text" }],
        },
      ],
      itemOrder: [
        { kind: "part", id: "p1" },
        { kind: "part", id: "p2" },
      ],
    }),
  ];

  const moved = applyMauthAction(
    initial,
    {
      type: "subpart.move",
      from: { questionId: "q1", partId: "p1" },
      to: { questionId: "q1", partId: "p2" },
      subpartId: "s2",
      placement: { item: { kind: "block", id: "p2-text" }, position: "before" },
    },
    { normalizeQuestion: normalizeLabels },
  );

  assert.equal(moved.ok, true);
  assert.deepEqual(
    moved.questions[0].parts?.[0].subparts?.map((item) => item.id),
    ["s1"],
  );
  assert.deepEqual(
    moved.questions[0].parts?.[1].itemOrder?.map((item) => `${item.kind}:${item.id}`),
    ["subpart:s2", "block:p2-text"],
  );
  assert.deepEqual(
    moved.questions[0].parts?.[1].subparts?.map((item) => item.label),
    ["i"],
  );
});

test("adds paired solution slots", () => {
  const initial = [question("q1")];
  const studentSpace = spaceBlock("space-1", 8);
  studentSpace.visibility = "student";
  const solution = textBlock("solution-1", "**Solution.**");
  solution.visibility = "solution";

  const result = applyMauthAction(initial, {
    type: "solutionSlot.add",
    scope: { kind: "question", questionId: "q1" },
    blocks: [studentSpace, solution],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedIds, ["space-1", "solution-1"]);
  assert.deepEqual(
    result.questions[0].contentBlocks.map((block) => block.id),
    ["space-1", "solution-1"],
  );
  assert.deepEqual(
    result.questions[0].itemOrder?.map((item) => item.id),
    ["space-1", "solution-1"],
  );
});

test("updates marks and page breaks on questions, parts, and subparts", () => {
  const initial: MauthQuestionLike[] = [
    {
      ...question("q1"),
      parts: [
        {
          id: "p1",
          marks: 0,
          pageBreakBefore: false,
          contentBlocks: [],
          itemOrder: [],
          subparts: [{ id: "s1", marks: 0, pageBreakBefore: false, contentBlocks: [] }],
        },
      ],
    },
  ];

  const questionMarks = applyMauthAction(initial, { type: "marks.update", target: { kind: "question", questionId: "q1" }, marks: 3 });
  const partMarks = applyMauthAction(questionMarks.questions, {
    type: "marks.update",
    target: { kind: "part", questionId: "q1", partId: "p1" },
    marks: 2,
  });
  const subpartMarks = applyMauthAction(partMarks.questions, {
    type: "marks.update",
    target: { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" },
    marks: 1,
  });
  const questionBreak = applyMauthAction(subpartMarks.questions, {
    type: "pageBreak.set",
    target: { kind: "question", questionId: "q1" },
    enabled: true,
  });
  const partBreak = applyMauthAction(questionBreak.questions, {
    type: "pageBreak.set",
    target: { kind: "part", questionId: "q1", partId: "p1" },
    enabled: true,
  });
  const subpartBreak = applyMauthAction(partBreak.questions, {
    type: "pageBreak.set",
    target: { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" },
    enabled: true,
  });

  const finalQuestion = subpartBreak.questions[0];
  const finalPart = finalQuestion.parts?.[0];
  const finalSubpart = finalPart?.subparts?.[0];
  assert.equal(finalQuestion.marks, 3);
  assert.equal(finalPart?.marks, 2);
  assert.equal(finalSubpart?.marks, 1);
  assert.equal(finalQuestion.pageBreakAfter, true);
  assert.equal(finalPart?.pageBreakBefore, true);
  assert.equal(finalSubpart?.pageBreakBefore, true);
});

test("updates diagram config only on diagram modules", () => {
  const graphConfig: GraphConfig = { type: "graph2d", xMin: -1, xMax: 1 };
  const nextGraphConfig: GraphConfig = { type: "graph2d", xMin: -5, xMax: 5 };
  const initial = [question("q1", [diagramBlock("d1", graphConfig)])];

  const result = applyMauthAction(initial, {
    type: "diagram.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "d1",
    graphConfig: nextGraphConfig,
  });

  assert.equal(result.ok, true);
  assert.deepEqual((result.questions[0].contentBlocks[0] as Extract<ContentBlock, { kind: "diagram" }>).graphConfig, nextGraphConfig);

  const wrongKind = applyMauthAction([question("q1", [textBlock("t1", "Text")])], {
    type: "diagram.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "t1",
    graphConfig,
  });
  assert.equal(wrongKind.ok, false);
  assert.equal(wrongKind.error, "Target module is not a diagram.");
});

test("fails cleanly when ids are wrong", () => {
  const initial = [question("q1", [textBlock("b1", "First")])];

  const wrongQuestion = applyMauthAction(initial, { type: "question.update", questionId: "missing", patch: { marks: 2 } });
  assert.equal(wrongQuestion.ok, false);
  assert.equal(wrongQuestion.error, "Question was not found.");
  assert.deepEqual(wrongQuestion.questions, initial);

  const wrongPlacement = applyMauthAction(initial, {
    type: "module.add",
    scope: { kind: "question", questionId: "q1" },
    blocks: [textBlock("b2", "Second")],
    placement: { blockId: "missing", position: "after" },
  });
  assert.equal(wrongPlacement.ok, false);
  assert.equal(wrongPlacement.error, "Module placement target was not found.");
  assert.deepEqual(wrongPlacement.questions, initial);

  const wrongMovePlacement = applyMauthAction(
    [
      {
        ...question("q1", [textBlock("b1", "First")]),
        parts: [part("p1")],
        itemOrder: [
          { kind: "block", id: "b1" },
          { kind: "part", id: "p1" },
        ],
      },
    ],
    {
      type: "module.move",
      fromScope: { kind: "question", questionId: "q1" },
      toScope: { kind: "part", questionId: "q1", partId: "p1" },
      blockId: "b1",
      placement: { item: { kind: "block", id: "missing" }, position: "before" },
    },
  );
  assert.equal(wrongMovePlacement.ok, false);
  assert.equal(wrongMovePlacement.error, "Module move placement target was not found.");
});

test("applies action batches atomically", () => {
  const initial = [question("q1", [textBlock("b1", "First")])];

  const success = applyMauthActions(initial, [
    { type: "question.update", questionId: "q1", patch: { marks: 2 } },
    {
      type: "module.add",
      scope: { kind: "question", questionId: "q1" },
      blocks: [textBlock("b2", "Second")],
    },
  ]);
  assert.equal(success.ok, true);
  assert.equal(success.actionType, "batch");
  assert.deepEqual(success.changedIds, ["q1", "b2"]);
  assert.equal(success.questions[0].marks, 2);
  assert.deepEqual(
    success.questions[0].contentBlocks.map((block) => block.id),
    ["b1", "b2"],
  );

  const failure = applyMauthActions(initial, [
    { type: "question.update", questionId: "q1", patch: { marks: 2 } },
    { type: "module.delete", scope: { kind: "question", questionId: "q1" }, blockId: "missing" },
  ]);
  assert.equal(failure.ok, false);
  assert.equal(failure.actionType, "batch");
  assert.deepEqual(failure.questions, initial);
  assert.equal(failure.error, "Module was not found.");
});

test("batch creates a multipart question with blocks and solution slots", () => {
  const initial: MauthQuestionLike[] = [];
  const q1 = question("q1");
  const p1 = part("p1");
  const p2 = part("p2");
  const prompt = textBlock("text-1", "Differentiate the following.");
  const answerSpace = spaceBlock("space-1", 6);
  answerSpace.visibility = "student";
  const solution = textBlock("solution-1", "**Solution.**");
  solution.visibility = "solution";

  const result = applyMauthActions(
    initial,
    [
      { type: "question.add", question: q1 },
      { type: "part.add", questionId: "q1", part: p1 },
      { type: "part.add", questionId: "q1", part: p2 },
      { type: "module.add", scope: { kind: "part", questionId: "q1", partId: "p1" }, blocks: [prompt] },
      { type: "solutionSlot.add", scope: { kind: "part", questionId: "q1", partId: "p1" }, blocks: [answerSpace, solution] },
    ],
    { normalizeQuestion: normalizeLabels },
  );

  assert.equal(result.ok, true);
  assert.equal(result.actionType, "batch");
  assert.deepEqual(result.changedIds, ["q1", "p1", "p2", "text-1", "space-1", "solution-1"]);
  assert.deepEqual(
    result.questions[0].parts?.map((item) => item.label),
    ["a", "b"],
  );
  assert.deepEqual(
    result.questions[0].itemOrder?.map((item) => item.id),
    ["p1", "p2"],
  );
  assert.deepEqual(
    result.questions[0].parts?.[0].contentBlocks.map((block) => block.id),
    ["text-1", "space-1", "solution-1"],
  );
  assert.deepEqual(
    result.questions[0].parts?.[0].itemOrder?.map((item) => item.id),
    ["text-1", "space-1", "solution-1"],
  );
});

test("updates document front matter and logo selection", () => {
  const initial = {
    frontMatter: { logoId: "logo-1", schoolName: "Old School", assessmentTitle: "test 1", startQuestionNumber: 0 },
    questions: [question("q1")],
  };

  const updated = applyMauthDocumentAction(
    initial,
    { type: "frontMatter.update", patch: { assessmentTitle: "quiz 2", startQuestionNumber: 3 } },
    { normalizeFrontMatter: normalizeTestFrontMatter },
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.document.frontMatter.assessmentTitle, "QUIZ 2");
  assert.equal(updated.document.frontMatter.startQuestionNumber, 3);
  assert.deepEqual(updated.changedIds, ["frontMatter"]);

  const logoSelected = applyMauthDocumentAction(
    updated.document,
    { type: "frontMatter.logo.set", logoId: "logo-2", schoolName: "New School" },
    { normalizeFrontMatter: normalizeTestFrontMatter },
  );
  assert.equal(logoSelected.ok, true);
  assert.equal(logoSelected.document.frontMatter.logoId, "logo-2");
  assert.equal(logoSelected.document.frontMatter.schoolName, "New School");
  assert.deepEqual(logoSelected.changedIds, ["frontMatter", "logo-2"]);
});

test("updates document formatting and page format", () => {
  const initial: { frontMatter: TestFrontMatter; questions: MauthQuestionLike[]; formattingConfig: TestFormattingConfig } = {
    frontMatter: { logoId: "logo-1", schoolName: "School", assessmentTitle: "TEST", startQuestionNumber: 1 },
    questions: [question("q1")],
    formattingConfig: { showMarks: true, page: { widthPx: 794, heightPx: 1123, paddingXPx: 76, paddingYPx: 76 } },
  };

  const updated = applyMauthDocumentAction(initial, { type: "pageFormat.update", patch: { paddingXPx: 64, showPageBreaks: false } });
  assert.equal(updated.ok, true);
  assert.deepEqual(updated.document.formattingConfig?.page, {
    widthPx: 794,
    heightPx: 1123,
    paddingXPx: 64,
    paddingYPx: 76,
    showPageBreaks: false,
  });
  assert.deepEqual(updated.changedIds, ["formattingConfig", "pageFormat"]);

  const formatting = applyMauthDocumentAction(updated.document, { type: "formatting.update", patch: { showMarks: false } });
  assert.equal(formatting.ok, true);
  assert.equal(formatting.document.formattingConfig?.showMarks, false);
  assert.equal(formatting.document.formattingConfig?.page?.paddingXPx, 64);
});

test("document batches combine front matter and question actions atomically", () => {
  const initial = {
    frontMatter: { logoId: "logo-1", schoolName: "School", assessmentTitle: "test", startQuestionNumber: 1 },
    questions: [question("q1")],
  };

  const success = applyMauthDocumentActions(
    initial,
    [
      { type: "frontMatter.update", patch: { assessmentTitle: "test 2" } },
      { type: "question.add", question: question("q2"), afterQuestionId: "q1" },
    ],
    { normalizeFrontMatter: normalizeTestFrontMatter },
  );
  assert.equal(success.ok, true);
  assert.equal(success.actionType, "batch");
  assert.equal(success.document.frontMatter.assessmentTitle, "TEST 2");
  assert.deepEqual(
    success.questions.map((item) => item.id),
    ["q1", "q2"],
  );
  assert.deepEqual(success.changedIds, ["frontMatter", "q2"]);

  const failure = applyMauthDocumentActions(
    initial,
    [
      { type: "frontMatter.update", patch: { assessmentTitle: "changed" } },
      { type: "question.add", question: question("q2"), afterQuestionId: "missing" },
    ],
    { normalizeFrontMatter: normalizeTestFrontMatter },
  );
  assert.equal(failure.ok, false);
  assert.deepEqual(failure.document, initial);
  assert.equal(failure.document.frontMatter.assessmentTitle, "test");
  assert.deepEqual(
    failure.questions.map((item) => item.id),
    ["q1"],
  );
});

test("dry-runs document batches with a structured preview summary", () => {
  const initial = {
    frontMatter: { logoId: "logo-1", schoolName: "School", assessmentTitle: "test", startQuestionNumber: 1 },
    questions: [question("q1")],
    formattingConfig: { showMarks: true, page: { widthPx: 794, heightPx: 1123, paddingXPx: 76, paddingYPx: 76 } },
  };
  const initialSnapshot = JSON.stringify(initial);

  const result = previewMauthDocumentActions(
    initial,
    [
      { type: "frontMatter.update", patch: { assessmentTitle: "test 2" } },
      { type: "pageFormat.update", patch: { paddingXPx: 64 } },
      { type: "question.add", question: question("q2"), afterQuestionId: "q1" },
      { type: "question.reorder", questionId: "q2", targetQuestionId: "q1", placement: "before" },
      { type: "document.validation.run" },
    ],
    {
      normalizeFrontMatter: normalizeTestFrontMatter,
      validateDocument: (document) => ({ questions: document.questions.length }),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.preview?.dryRun, true);
  assert.equal(result.preview?.valid, true);
  assert.equal(result.preview?.requestedActionCount, 5);
  assert.equal(result.preview?.attemptedActionCount, 5);
  assert.deepEqual(result.preview?.actionCounts["frontMatter.update"], 1);
  assert.deepEqual(result.preview?.changedIds, ["frontMatter", "formattingConfig", "pageFormat", "q2"]);
  assert.deepEqual(result.preview?.addedIds, ["q2"]);
  assert.deepEqual(result.preview?.movedIds, []);
  assert.deepEqual(result.preview?.reorderedIds, ["q2"]);
  assert.deepEqual(result.preview?.frontMatterFields, ["assessmentTitle"]);
  assert.deepEqual(result.preview?.formattingFields, ["page"]);
  assert.deepEqual(result.preview?.pageFormatFields, ["paddingXPx"]);
  assert.deepEqual(result.preview?.counts, {
    actions: 5,
    added: 1,
    deleted: 0,
    moved: 0,
    reordered: 1,
    updated: 3,
    frontMatterFields: 1,
    formattingFields: 1,
    pageFormatFields: 1,
    warnings: 0,
  });
  assert.deepEqual(result.preview?.validation, { questions: 2 });
  assert.deepEqual(
    result.questions.map((item) => item.id),
    ["q2", "q1"],
  );
  assert.equal(JSON.stringify(initial), initialSnapshot);
});

test("dry-runs invalid document batches without returning a committed document", () => {
  const initial = {
    frontMatter: { logoId: "logo-1", schoolName: "School", assessmentTitle: "test", startQuestionNumber: 1 },
    questions: [question("q1")],
  };

  const result = applyMauthDocumentActions(
    initial,
    [
      { type: "frontMatter.update", patch: { assessmentTitle: "changed" } },
      { type: "question.add", question: question("q2"), afterQuestionId: "missing" },
    ],
    { dryRun: true, normalizeFrontMatter: normalizeTestFrontMatter },
  );

  assert.equal(result.ok, false);
  assert.equal(result.preview?.dryRun, true);
  assert.equal(result.preview?.valid, false);
  assert.equal(result.preview?.requestedActionCount, 2);
  assert.equal(result.preview?.attemptedActionCount, 2);
  assert.equal(result.preview?.error, "Question insertion target was not found.");
  assert.deepEqual(result.document, initial);
  assert.equal(result.document.frontMatter.assessmentTitle, "test");
  assert.deepEqual(
    result.questions.map((item) => item.id),
    ["q1"],
  );
});

test("dry-runs move actions as moved ids", () => {
  const initial = {
    frontMatter: { logoId: "logo-1", schoolName: "School", assessmentTitle: "test", startQuestionNumber: 1 },
    questions: [
      {
        ...question("q1", [textBlock("b1", "Move me")]),
        parts: [part("p1")],
        itemOrder: [
          { kind: "block", id: "b1" },
          { kind: "part", id: "p1" },
        ],
      },
    ],
  };

  const result = previewMauthDocumentActions(initial, [
    {
      type: "module.move",
      fromScope: { kind: "question", questionId: "q1" },
      toScope: { kind: "part", questionId: "q1", partId: "p1" },
      blockId: "b1",
    },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.preview?.movedIds, ["b1"]);
  assert.deepEqual(result.preview?.counts.moved, 1);
  assert.deepEqual(result.preview?.addedIds, []);
  assert.deepEqual(result.preview?.deletedIds, []);
});

test("runs whole-document validation", () => {
  const initial = {
    frontMatter: { logoId: "logo-1", schoolName: "School", assessmentTitle: "TEST", startQuestionNumber: 1 },
    questions: [question("q1")],
  };

  const result = applyMauthDocumentAction(
    initial,
    { type: "document.validation.run" },
    { validateDocument: (document) => document.questions.length },
  );
  assert.equal(result.ok, true);
  assert.equal(result.validation, 1);

  const missingValidator = applyMauthDocumentAction(initial, { type: "document.validation.run" });
  assert.equal(missingValidator.ok, false);
  assert.equal(missingValidator.error, "No document validator is configured.");
});
