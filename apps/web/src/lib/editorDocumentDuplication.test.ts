import test from "node:test";
import assert from "node:assert/strict";

import { canCreateSolutionSurfaceCopy, createEditorDocumentDuplicator, studentSurfaceBlockPatch } from "./editorDocumentDuplication.ts";
import type { EditorContentBlock, EditorPart, QuestionBlock } from "./editorDocumentNormalization.ts";

function testDuplicator() {
  let count = 0;
  return createEditorDocumentDuplicator({
    id: (prefix) => `${prefix}-${++count}`,
    cloneSerializable: (value) => JSON.parse(JSON.stringify(value)),
  });
}

function textBlock(id: string, text = id): EditorContentBlock {
  return { id, kind: "text", text };
}

test("duplicatedContentBlock deep-clones columns and preserves solution-layer fields", () => {
  const { duplicatedContentBlock } = testDuplicator();
  const block: EditorContentBlock = {
    id: "columns-original",
    kind: "columns",
    columnCount: 2,
    visibility: "solution",
    solutionOnly: true,
    columns: [
      [
        {
          id: "solution-table",
          kind: "table",
          headers: ["x"],
          rows: [["1"]],
          visibility: "solution",
          solutionOnly: true,
          markTicks: 2,
        },
      ],
      [textBlock("student-text")],
    ],
  };

  const duplicated = duplicatedContentBlock(block);

  assert.equal(duplicated.kind, "columns");
  assert.notEqual(duplicated.id, block.id);
  assert.equal(duplicated.visibility, "solution");
  assert.equal(duplicated.solutionOnly, true);
  assert.equal(duplicated.kind === "columns" ? duplicated.columns[0][0]?.kind : undefined, "table");
  assert.notEqual(duplicated.kind === "columns" ? duplicated.columns[0][0]?.id : undefined, "solution-table");
  assert.equal(
    duplicated.kind === "columns" && duplicated.columns[0][0]?.kind === "table" ? duplicated.columns[0][0].markTicks : undefined,
    2,
  );
  assert.equal(block.kind === "columns" ? block.columns[0][0]?.id : undefined, "solution-table");
});

test("solutionSurfaceContentBlock makes an editable solution-only copy", () => {
  const { solutionSurfaceContentBlock } = testDuplicator();
  const block: EditorContentBlock = {
    id: "table-original",
    kind: "table",
    headers: ["x", "y"],
    rows: [
      ["0", ""],
      ["1", ""],
    ],
    solutionEntries: [
      ["", "2"],
      ["", "3"],
    ],
    visibility: "always",
    markTicks: 2,
  };

  const solutionBlock = solutionSurfaceContentBlock(block);

  assert.ok(solutionBlock);
  assert.equal(solutionBlock.kind, "table");
  assert.notEqual(solutionBlock.id, block.id);
  assert.equal(solutionBlock.visibility, "solution");
  assert.equal(solutionBlock.solutionOnly, true);
  assert.equal(solutionBlock.studentOnly, undefined);
  assert.equal(solutionBlock.markTicks, undefined);
  assert.equal(solutionBlock.kind === "table" ? solutionBlock.solutionEntries : undefined, undefined);
  assert.deepEqual(solutionBlock.kind === "table" ? solutionBlock.rows : [], block.rows);
  assert.equal(block.visibility, "always");
});

test("solutionSurfaceContentBlock preserves an independently editable diagram config", () => {
  const { solutionSurfaceContentBlock } = testDuplicator();
  const block: EditorContentBlock = {
    id: "diagram-original",
    kind: "diagram",
    graphConfig: {
      type: "setDiagram",
      data: {
        setCount: 3,
        regions: [{ id: "intersection", label: "" }],
      },
    },
    visibility: "always",
    markTicks: 2,
  };

  const solutionBlock = solutionSurfaceContentBlock(block);

  assert.ok(solutionBlock);
  assert.equal(solutionBlock.kind, "diagram");
  assert.notEqual(solutionBlock.id, block.id);
  assert.equal(solutionBlock.visibility, "solution");
  assert.equal(solutionBlock.solutionOnly, true);
  assert.equal(solutionBlock.markTicks, undefined);
  assert.deepEqual(solutionBlock.kind === "diagram" ? solutionBlock.graphConfig : null, block.graphConfig);
  assert.notEqual(solutionBlock.kind === "diagram" ? solutionBlock.graphConfig : null, block.graphConfig);
});

test("solutionSurfaceContentBlock recursively marks copied columns as solution-only", () => {
  const { solutionSurfaceContentBlock } = testDuplicator();
  const block: EditorContentBlock = {
    id: "columns-original",
    kind: "columns",
    columnCount: 2,
    columns: [
      [textBlock("student-text")],
      [
        {
          id: "student-table",
          kind: "table",
          headers: ["x"],
          rows: [[""]],
          visibility: "student",
          studentOnly: true,
        },
      ],
    ],
  };

  const solutionBlock = solutionSurfaceContentBlock(block);

  assert.ok(solutionBlock);
  assert.equal(solutionBlock.kind, "columns");
  assert.equal(solutionBlock.visibility, "solution");
  assert.equal(solutionBlock.solutionOnly, true);
  const firstChild = solutionBlock.kind === "columns" ? solutionBlock.columns[0][0] : null;
  const secondChild = solutionBlock.kind === "columns" ? solutionBlock.columns[1][0] : null;
  assert.equal(firstChild?.visibility, "solution");
  assert.equal(firstChild?.solutionOnly, true);
  assert.equal(secondChild?.visibility, "solution");
  assert.equal(secondChild?.solutionOnly, true);
  assert.notEqual(firstChild?.id, "student-text");
  assert.notEqual(secondChild?.id, "student-table");
});

test("solutionSurfaceColumnBlockCopyAtPath pairs nested column block copies", () => {
  const { columnBlockAtPath, solutionSurfaceColumnBlockCopyAtPath } = testDuplicator();
  const root: Extract<EditorContentBlock, { kind: "columns" }> = {
    id: "root-columns",
    kind: "columns",
    columnCount: 1,
    columns: [
      [
        {
          id: "inner-columns",
          kind: "columns",
          columnCount: 1,
          columns: [[textBlock("target")]],
        },
      ],
    ],
  };
  const path = [
    { columnIndex: 0, blockId: "inner-columns" },
    { columnIndex: 0, blockId: "target" },
  ];

  const result = solutionSurfaceColumnBlockCopyAtPath(root, path);

  assert.ok(result);
  const original = columnBlockAtPath(result.rootBlock, path);
  const solutionCopy = columnBlockAtPath(result.rootBlock, result.solutionPath);
  assert.equal(original?.visibility, "student");
  assert.equal(original?.studentOnly, true);
  assert.equal(solutionCopy?.visibility, "solution");
  assert.equal(solutionCopy?.solutionOnly, true);
  assert.notEqual(solutionCopy?.id, "target");
});

test("solution surface copy helpers reject answer spaces and page breaks", () => {
  assert.equal(canCreateSolutionSurfaceCopy({ id: "choices", kind: "choices", choices: ["A", "B"] }), false);
  assert.equal(canCreateSolutionSurfaceCopy({ id: "space", kind: "space", lines: 4 }), false);
  assert.equal(canCreateSolutionSurfaceCopy({ id: "break", kind: "pageBreak" }), false);
  assert.deepEqual(studentSurfaceBlockPatch(), {
    visibility: "student",
    studentOnly: true,
    solutionOnly: false,
    markTicks: undefined,
  });
});

test("duplicateColumnBlockAtPath duplicates nested blocks and returns the new path", () => {
  const { columnBlockAtPath, duplicateColumnBlockAtPath } = testDuplicator();
  const root: Extract<EditorContentBlock, { kind: "columns" }> = {
    id: "root-columns",
    kind: "columns",
    columnCount: 1,
    columns: [
      [
        {
          id: "inner-columns",
          kind: "columns",
          columnCount: 1,
          columns: [[textBlock("target")]],
        },
      ],
    ],
  };
  const path = [
    { columnIndex: 0, blockId: "inner-columns" },
    { columnIndex: 0, blockId: "target" },
  ];

  const result = duplicateColumnBlockAtPath(root, path);

  assert.ok(result);
  assert.notEqual(result.duplicatedPath[1].blockId, "target");
  assert.equal(columnBlockAtPath(result.rootBlock, result.duplicatedPath)?.kind, "text");
  const inner = result.rootBlock.columns[0][0];
  assert.equal(inner.kind, "columns");
  assert.deepEqual(inner.kind === "columns" ? inner.columns[0].map((block) => block.id) : [], ["target", result.duplicatedPath[1].blockId]);
});

test("duplicatedPart remaps block and subpart item order", () => {
  const { duplicatedPart } = testDuplicator();
  const part: EditorPart = {
    id: "part-original",
    label: "a",
    text: "Part",
    marks: 2,
    contentBlocks: [textBlock("part-block")],
    subparts: [
      {
        id: "subpart-original",
        label: "i",
        text: "Subpart",
        marks: 1,
        contentBlocks: [textBlock("subpart-block")],
      },
    ],
    itemOrder: [
      { kind: "block", id: "part-block" },
      { kind: "subpart", id: "subpart-original" },
    ],
  };

  const duplicated = duplicatedPart(part);

  assert.notEqual(duplicated.id, part.id);
  assert.notEqual(duplicated.contentBlocks[0].id, "part-block");
  assert.notEqual(duplicated.subparts[0].id, "subpart-original");
  assert.notEqual(duplicated.subparts[0].contentBlocks[0].id, "subpart-block");
  assert.deepEqual(duplicated.itemOrder, [
    { kind: "block", id: duplicated.contentBlocks[0].id },
    { kind: "subpart", id: duplicated.subparts[0].id },
  ]);
});

test("duplicatedQuestion remaps question content and part item order", () => {
  const { duplicatedQuestion } = testDuplicator();
  const question: QuestionBlock = {
    id: "question-original",
    section: "Algebra",
    text: "Question",
    marks: 3,
    contentBlocks: [textBlock("question-block")],
    parts: [
      {
        id: "part-original",
        label: "a",
        text: "Part",
        marks: 1,
        contentBlocks: [],
        subparts: [],
        itemOrder: [],
      },
    ],
    itemOrder: [
      { kind: "part", id: "part-original" },
      { kind: "block", id: "question-block" },
    ],
  };

  const duplicated = duplicatedQuestion(question);

  assert.notEqual(duplicated.id, question.id);
  assert.notEqual(duplicated.contentBlocks[0].id, "question-block");
  assert.notEqual(duplicated.parts[0].id, "part-original");
  assert.deepEqual(duplicated.itemOrder, [
    { kind: "part", id: duplicated.parts[0].id },
    { kind: "block", id: duplicated.contentBlocks[0].id },
  ]);
});
