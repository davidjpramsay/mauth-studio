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
import { DEFAULT_NETWORK_DATA } from "./diagramNetwork.ts";

function textBlock(id: string, text: string): ContentBlock {
  return { id, kind: "text", text };
}

function spaceBlock(id: string, lines: number): ContentBlock {
  return { id, kind: "space", lines };
}

function diagramBlock(id: string, graphConfig: GraphConfig): ContentBlock {
  return { id, kind: "diagram", graphConfig };
}

function tableBlock(id: string): ContentBlock {
  return {
    id,
    kind: "table",
    headers: ["A", "B"],
    rows: [
      ["1", "2"],
      ["3", "4"],
    ],
    showHeader: true,
    tableAlign: "center",
    cellAlignment: "center",
  };
}

function findContentBlock(blocks: readonly ContentBlock[], blockId: string): ContentBlock | undefined {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.kind === "columns") {
      for (const column of block.columns) {
        const nested = findContentBlock(column, blockId);
        if (nested) return nested;
      }
    }
  }
  return undefined;
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

test("applies named module settings updates deterministically", () => {
  const columnsBlock: ContentBlock = {
    id: "cols",
    kind: "columns",
    columnCount: 2,
    columns: [[textBlock("left", "Left")], [textBlock("right", "Right")]],
  };
  let questions = [
    question("q1", [
      spaceBlock("space", 3),
      tableBlock("table"),
      columnsBlock,
      { id: "choices", kind: "choices", choices: ["A", "B"], numberingStyle: "upper-alpha", layout: "vertical" },
      diagramBlock("diagram", { type: "graph2d", widthPx: 420, heightPx: 260 }),
    ]),
  ];

  let result = applyMauthAction(questions, {
    type: "module.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "space",
    settings: { kind: "space", lines: 7.4 },
  });
  assert.equal(result.ok, true, result.error);
  questions = result.questions;
  assert.equal((findContentBlock(questions[0].contentBlocks, "space") as Extract<ContentBlock, { kind: "space" }>).lines, 7);

  result = applyMauthAction(questions, {
    type: "module.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "space",
    settings: { kind: "space", showLines: false },
  });
  assert.equal(result.ok, true, result.error);
  questions = result.questions;
  assert.equal((findContentBlock(questions[0].contentBlocks, "space") as Extract<ContentBlock, { kind: "space" }>).showLines, false);

  result = applyMauthAction(questions, {
    type: "module.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "table",
    settings: { kind: "table", rows: 3, columns: 3, tableAlign: "right", cellAlignment: "left", showHeader: false },
  });
  assert.equal(result.ok, true, result.error);
  questions = result.questions;
  const updatedTable = findContentBlock(questions[0].contentBlocks, "table");
  assert.equal(updatedTable?.kind, "table");
  assert.equal(updatedTable?.kind === "table" ? updatedTable.rows.length : undefined, 3);
  assert.deepEqual(updatedTable?.kind === "table" ? updatedTable.rows.map((row) => row.length) : [], [3, 3, 3]);
  assert.equal(updatedTable?.kind === "table" ? updatedTable.tableAlign : undefined, "right");
  assert.equal(updatedTable?.kind === "table" ? updatedTable.cellAlignment : undefined, "left");
  assert.equal(updatedTable?.kind === "table" ? updatedTable.showHeader : undefined, false);

  result = applyMauthAction(questions, {
    type: "module.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "cols",
    settings: { kind: "columns", columnCount: 4 },
  });
  assert.equal(result.ok, true, result.error);
  questions = result.questions;
  const updatedColumns = findContentBlock(questions[0].contentBlocks, "cols");
  assert.equal(updatedColumns?.kind, "columns");
  assert.equal(updatedColumns?.kind === "columns" ? updatedColumns.columnCount : undefined, 4);
  assert.deepEqual(updatedColumns?.kind === "columns" ? updatedColumns.columns.map((column) => column[0]?.id) : [], [
    "left",
    "right",
    "cols-column-3-text",
    "cols-column-4-text",
  ]);

  result = applyMauthAction(questions, {
    type: "module.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "choices",
    settings: { kind: "choices", numberingStyle: "roman", layout: "inline" },
  });
  assert.equal(result.ok, true, result.error);
  questions = result.questions;
  const updatedChoices = findContentBlock(questions[0].contentBlocks, "choices");
  assert.equal(updatedChoices?.kind, "choices");
  assert.equal(updatedChoices?.kind === "choices" ? updatedChoices.numberingStyle : undefined, "roman");
  assert.equal(updatedChoices?.kind === "choices" ? updatedChoices.layout : undefined, "inline");

  result = applyMauthAction(questions, {
    type: "module.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "diagram",
    settings: { kind: "diagram", diagramAlign: "left", diagramTextSide: "right" },
  });
  assert.equal(result.ok, true, result.error);
  const updatedDiagram = findContentBlock(result.questions[0].contentBlocks, "diagram");
  assert.equal(updatedDiagram?.kind, "diagram");
  assert.equal(updatedDiagram?.kind === "diagram" ? updatedDiagram.diagramAlign : undefined, "left");
  assert.equal(updatedDiagram?.kind === "diagram" ? updatedDiagram.diagramTextSide : undefined, "right");
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
  const solution = textBlock("solution-1", "\n");
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

test("applies named diagram settings updates across supported renderers", () => {
  const initial = [
    question("q1", [
      diagramBlock("graph", {
        type: "graph2d",
        widthPx: 400,
        heightPx: 200,
        lockAspectRatio: true,
        equalScale: false,
        showAxes: true,
      }),
      diagramBlock("vector", {
        type: "vector2d",
        metadata: {
          vector2d: {
            labelStyle: "boldLower",
            vectors: [{ id: "v1", name: "a", start: [0, 0], components: [2, 3] }],
          },
        },
      }),
      diagramBlock("three", { type: "graph3d", widthPx: 320, heightPx: 240, metadata: { keep: true } }),
      diagramBlock("chart", {
        type: "statsChart",
        data: { chartType: "histogram", values: [1, 2, 2, 3] },
        options: { widthPx: 300, heightPx: 220, showGrid: true, showFill: true },
      }),
      diagramBlock("geometry", {
        type: "geometricConstruction",
        options: { scalePercent: 80, substanceSource: "custom" },
        widthPx: 500,
        heightPx: 320,
      }),
      diagramBlock("network", {
        type: "network",
        data: { ...DEFAULT_NETWORK_DATA, hidePoints: false, hidePointLabels: false },
        options: { scalePercent: 100, substanceSource: "custom" },
      }),
      diagramBlock("set", {
        type: "setDiagram",
        data: {
          universe: { name: "U", label: "U" },
          sets: [
            { type: "set", name: "A", label: "A" },
            { type: "set", name: "B", label: "B" },
          ],
          regions: [{ name: "onlyA" }, { name: "both" }, { name: "onlyB" }, { name: "outside" }],
        },
      }),
      diagramBlock("image", {
        type: "image",
        data: { src: "data:image/png;base64,abc", name: "Original", alt: "Original alt", naturalWidth: 640, naturalHeight: 480 },
        widthPx: 420,
        heightPx: 260,
        functions: [{ expression: "x" }],
        features: [{ kind: "point", x: 1, y: 2 }],
      }),
    ]),
  ];

  const actions = [
    {
      type: "diagram.settings.update" as const,
      scope: { kind: "question" as const, questionId: "q1" },
      blockId: "graph",
      settings: { renderer: "graph2d" as const, widthPx: 800, xMin: -4, showAxes: false, equalScale: true },
    },
    {
      type: "diagram.settings.update" as const,
      scope: { kind: "question" as const, questionId: "q1" },
      blockId: "vector",
      settings: { renderer: "vector2d" as const, labelStyle: "arrow" as const, showGrid: false, equalScale: true },
    },
    {
      type: "diagram.settings.update" as const,
      scope: { kind: "question" as const, questionId: "q1" },
      blockId: "three",
      settings: { renderer: "graph3d" as const, widthPx: 520, view: { az: 1.2 } },
    },
    {
      type: "diagram.settings.update" as const,
      scope: { kind: "question" as const, questionId: "q1" },
      blockId: "chart",
      settings: { renderer: "statsChart" as const, widthPx: 360, showGrid: false, fillOpacity: 0.35 },
    },
    {
      type: "diagram.settings.update" as const,
      scope: { kind: "question" as const, questionId: "q1" },
      blockId: "geometry",
      settings: { renderer: "geometricConstruction" as const, scalePercent: 125, resample: true, variation: "fixed-layout" },
    },
    {
      type: "diagram.settings.update" as const,
      scope: { kind: "question" as const, questionId: "q1" },
      blockId: "network",
      settings: { renderer: "network" as const, preset: true, showNodeDots: false, showNodeLabels: false },
    },
    {
      type: "diagram.settings.update" as const,
      scope: { kind: "question" as const, questionId: "q1" },
      blockId: "set",
      settings: { renderer: "setDiagram" as const, labels: "countsWithTotals" as const, shading: "outside" as const },
    },
    {
      type: "diagram.settings.update" as const,
      scope: { kind: "question" as const, questionId: "q1" },
      blockId: "image",
      settings: { renderer: "image" as const, name: "Updated", alt: "Updated alt", widthPx: 360, heightPx: 220 },
    },
  ];

  const result = applyMauthActions(initial, actions);
  assert.equal(result.ok, true, result.error);
  const blocks = result.questions[0].contentBlocks;

  const graph = findContentBlock(blocks, "graph");
  assert.equal(graph?.kind, "diagram");
  assert.equal(graph?.kind === "diagram" ? graph.graphConfig.widthPx : undefined, 800);
  assert.equal(graph?.kind === "diagram" ? graph.graphConfig.heightPx : undefined, 400);
  assert.equal(graph?.kind === "diagram" ? graph.graphConfig.xMin : undefined, -4);
  assert.equal(graph?.kind === "diagram" ? graph.graphConfig.showAxes : undefined, false);
  assert.equal(graph?.kind === "diagram" ? graph.graphConfig.equalScale : undefined, true);
  assert.equal(graph?.kind === "diagram" ? graph.graphConfig.lockAspectRatio : undefined, false);

  const vector = findContentBlock(blocks, "vector");
  assert.equal(vector?.kind, "diagram");
  const vectorMetadata =
    vector?.kind === "diagram" ? (vector.graphConfig.metadata?.vector2d as { labelStyle: string; vectors: Array<{ name: string }> }) : null;
  assert.equal(vectorMetadata?.labelStyle, "arrow");
  assert.equal(vectorMetadata?.vectors[0]?.name, "AB");
  assert.equal(vector?.kind === "diagram" ? vector.graphConfig.showGrid : undefined, false);
  assert.equal(vector?.kind === "diagram" ? vector.graphConfig.showMajorGrid : undefined, false);

  const three = findContentBlock(blocks, "three");
  assert.equal(three?.kind, "diagram");
  const threeView = three?.kind === "diagram" ? (three.graphConfig.metadata?.view3d as { az?: number } | undefined) : undefined;
  assert.equal(three?.kind === "diagram" ? three.graphConfig.widthPx : undefined, 520);
  assert.equal(threeView?.az, 1.2);
  assert.equal(three?.kind === "diagram" ? three.graphConfig.metadata?.keep : undefined, true);

  const chart = findContentBlock(blocks, "chart");
  assert.equal(chart?.kind, "diagram");
  assert.equal(chart?.kind === "diagram" ? chart.graphConfig.widthPx : undefined, 360);
  assert.equal(chart?.kind === "diagram" ? chart.graphConfig.options?.showGrid : undefined, false);
  assert.equal(chart?.kind === "diagram" ? chart.graphConfig.options?.fillOpacity : undefined, 0.35);

  const geometry = findContentBlock(blocks, "geometry");
  assert.equal(geometry?.kind, "diagram");
  assert.equal(geometry?.kind === "diagram" ? geometry.graphConfig.scalePercent : undefined, 125);
  assert.equal(geometry?.kind === "diagram" ? geometry.graphConfig.options?.variation : undefined, "fixed-layout");
  assert.equal(geometry?.kind === "diagram" ? geometry.graphConfig.widthPx : "not-cleared", undefined);

  const network = findContentBlock(blocks, "network");
  assert.equal(network?.kind, "diagram");
  assert.equal(
    network?.kind === "diagram" && typeof network.graphConfig.data === "object"
      ? (network.graphConfig.data as { hidePoints?: boolean }).hidePoints
      : undefined,
    true,
  );
  assert.equal(
    network?.kind === "diagram" && typeof network.graphConfig.data === "object"
      ? (network.graphConfig.data as { hidePointLabels?: boolean }).hidePointLabels
      : undefined,
    true,
  );
  assert.equal(network?.kind === "diagram" ? network.graphConfig.options?.substanceSource : undefined, undefined);

  const set = findContentBlock(blocks, "set");
  const setData =
    set?.kind === "diagram"
      ? (set.graphConfig.data as { universe: { countLabel: string }; regions: Array<{ label: string; shaded: boolean }> })
      : null;
  assert.equal(setData?.universe.countLabel, "30");
  assert.deepEqual(
    setData?.regions.map((region) => region.label),
    ["8", "10", "6", "6"],
  );
  assert.deepEqual(
    setData?.regions.map((region) => region.shaded),
    [false, false, false, true],
  );

  const image = findContentBlock(blocks, "image");
  assert.equal(image?.kind, "diagram");
  assert.equal(image?.kind === "diagram" ? image.graphConfig.widthPx : undefined, 360);
  assert.equal(image?.kind === "diagram" ? image.graphConfig.heightPx : undefined, 220);
  assert.equal(
    image?.kind === "diagram" && typeof image.graphConfig.data === "object"
      ? (image.graphConfig.data as { name?: string }).name
      : undefined,
    "Updated",
  );
  assert.deepEqual(image?.kind === "diagram" ? image.graphConfig.functions : undefined, []);

  const partialNetwork = applyMauthAction(result.questions, {
    type: "diagram.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "network",
    settings: { renderer: "network", showNodeDots: true },
  });
  assert.equal(partialNetwork.ok, true, partialNetwork.error);
  const networkAfterPartial = findContentBlock(partialNetwork.questions[0].contentBlocks, "network");
  assert.equal(
    networkAfterPartial?.kind === "diagram" && typeof networkAfterPartial.graphConfig.data === "object"
      ? (networkAfterPartial.graphConfig.data as { hidePoints?: boolean }).hidePoints
      : undefined,
    false,
  );
  assert.equal(
    networkAfterPartial?.kind === "diagram" && typeof networkAfterPartial.graphConfig.data === "object"
      ? (networkAfterPartial.graphConfig.data as { hidePointLabels?: boolean }).hidePointLabels
      : undefined,
    true,
  );

  const partialImage = applyMauthAction(partialNetwork.questions, {
    type: "diagram.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "image",
    settings: { renderer: "image", name: "Renamed only" },
  });
  assert.equal(partialImage.ok, true, partialImage.error);
  const imageAfterPartial = findContentBlock(partialImage.questions[0].contentBlocks, "image");
  assert.equal(
    imageAfterPartial?.kind === "diagram" && typeof imageAfterPartial.graphConfig.data === "object"
      ? (imageAfterPartial.graphConfig.data as { name?: string }).name
      : undefined,
    "Renamed only",
  );
  assert.equal(
    imageAfterPartial?.kind === "diagram" && typeof imageAfterPartial.graphConfig.data === "object"
      ? (imageAfterPartial.graphConfig.data as { alt?: string }).alt
      : undefined,
    "Updated alt",
  );
});

test("settings actions fail cleanly on wrong module kind or renderer", () => {
  const initial = [question("q1", [textBlock("t1", "Text"), diagramBlock("d1", { type: "graph2d" })])];

  const wrongModuleKind = applyMauthAction(initial, {
    type: "module.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "t1",
    settings: { kind: "space", lines: 4 },
  });
  assert.equal(wrongModuleKind.ok, false);
  assert.equal(wrongModuleKind.error, "module.settings.update expected a space module, but target module is text.");
  assert.deepEqual(wrongModuleKind.questions, initial);

  const wrongRenderer = applyMauthAction(initial, {
    type: "diagram.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "d1",
    settings: { renderer: "network", showNodeDots: false },
  });
  assert.equal(wrongRenderer.ok, false);
  assert.equal(wrongRenderer.error, "diagram.settings.update expected a network diagram, but target diagram renderer is graph2d.");
  assert.deepEqual(wrongRenderer.questions, initial);
});

test("updates selected geometry2d primitive settings without replacing the diagram", () => {
  const geometryConfig: GraphConfig = {
    type: "geometry2d",
    widthPx: 320,
    heightPx: 240,
    data: {
      points: [
        { id: "O", x: 0, y: 0, label: "$O$" },
        { id: "A", x: 2, y: 0, label: "$A$" },
        { id: "B", x: 0, y: 2, label: "$B$" },
      ],
      segments: [
        { id: "OA", from: "O", to: "A", strokeWidth: 2 },
        { id: "OB", from: "O", to: "B", strokeWidth: 2 },
      ],
      angles: [{ id: "AOB", points: ["A", "O", "B"], label: "$90^\\circ$", radius: 0.4, strokeStyle: "solid" }],
      decorations: [{ kind: "rightAngle", id: "right-angle", angle: "AOB", size: 0.35 }],
    },
  };
  const initial = [question("q1", [diagramBlock("d1", geometryConfig)])];

  const result = applyMauthAction(initial, {
    type: "diagram.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "d1",
    settings: {
      renderer: "geometry2d",
      primitive: { kind: "angle", index: 0, label: "$45^\\circ$", strokeStyle: "dashed", radius: 0.65 },
    },
  });

  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.changedIds, ["d1"]);
  const diagram = result.questions[0].contentBlocks[0];
  assert.equal(diagram.kind, "diagram");
  const data = diagram.kind === "diagram" ? diagram.graphConfig.data : undefined;
  assert.deepEqual(data?.points, geometryConfig.data?.points);
  assert.deepEqual(data?.segments, geometryConfig.data?.segments);
  assert.equal(data?.angles?.[0]?.label, "$45^\\circ$");
  assert.equal(data?.angles?.[0]?.strokeStyle, "dashed");
  assert.equal(data?.angles?.[0]?.radius, 0.65);
  assert.equal(data?.decorations?.[0]?.kind, "rightAngle");

  const missingPrimitive = applyMauthAction(initial, {
    type: "diagram.settings.update",
    scope: { kind: "question", questionId: "q1" },
    blockId: "d1",
    settings: { renderer: "geometry2d", primitive: { kind: "angle", index: 3, label: "$30^\\circ$" } },
  });
  assert.equal(missingPrimitive.ok, false);
  assert.match(missingPrimitive.error ?? "", /outside angles/);
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
  const solution = textBlock("solution-1", "\n");
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

test("adds, updates, deletes, and reorders section headings", () => {
  const initial = {
    frontMatter: { logoId: "logo-1", schoolName: "School", assessmentTitle: "worksheet", startQuestionNumber: 1 },
    questions: [question("q1"), question("q2")],
    sectionHeadings: [],
    documentFlow: [
      { kind: "question" as const, id: "q1" },
      { kind: "question" as const, id: "q2" },
    ],
  };

  const added = applyMauthDocumentAction(initial, {
    type: "sectionHeading.add",
    heading: { id: "section-1", title: "Multiple choice" },
    beforeItem: { kind: "question", id: "q1" },
  });
  assert.equal(added.ok, true);
  assert.deepEqual(added.changedIds, ["section-1"]);
  assert.deepEqual(added.document.sectionHeadings, [{ id: "section-1", title: "Multiple choice" }]);
  assert.deepEqual(added.document.documentFlow, [
    { kind: "sectionHeading", id: "section-1" },
    { kind: "question", id: "q1" },
    { kind: "question", id: "q2" },
  ]);

  const updated = applyMauthDocumentAction(added.document, {
    type: "sectionHeading.update",
    sectionHeadingId: "section-1",
    patch: { title: "Short answer" },
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.document.sectionHeadings?.[0]?.title, "Short answer");

  const reordered = applyMauthDocumentAction(updated.document, {
    type: "sectionHeading.reorder",
    sectionHeadingId: "section-1",
    targetItem: { kind: "question", id: "q2" },
    placement: "after",
  });
  assert.equal(reordered.ok, true);
  assert.deepEqual(reordered.document.documentFlow, [
    { kind: "question", id: "q1" },
    { kind: "question", id: "q2" },
    { kind: "sectionHeading", id: "section-1" },
  ]);

  const removed = applyMauthDocumentAction(reordered.document, {
    type: "sectionHeading.delete",
    sectionHeadingId: "section-1",
  });
  assert.equal(removed.ok, true);
  assert.deepEqual(removed.document.sectionHeadings, []);
  assert.deepEqual(removed.document.documentFlow, [
    { kind: "question", id: "q1" },
    { kind: "question", id: "q2" },
  ]);
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
