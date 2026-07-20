import assert from "node:assert/strict";
import test from "node:test";

import { createEditorBlockContextRuntime } from "./editorBlockContexts.ts";
import { createEditorContextCommandRuntime } from "./editorContextCommandRuntime.ts";
import { createEditorDocumentDuplicator } from "./editorDocumentDuplication.ts";
import type {
  DocumentFlowItem,
  DocumentSectionHeading,
  EditorContentBlock,
  EditorPart,
  EditorSubpart,
  QuestionBlock,
} from "./editorDocumentNormalization.ts";
import type { MauthAction } from "./mauthActions.ts";
import {
  columnPathScrollAnchor,
  pageBreakScrollAnchor,
  partBlockScrollAnchor,
  partScrollAnchor,
  questionBlockScrollAnchor,
  questionScrollAnchor,
  sectionHeadingScrollAnchor,
  subpartBlockScrollAnchor,
  subpartScrollAnchor,
} from "./scrollAnchors.ts";

function subpart(id: string, blocks: EditorContentBlock[]): EditorSubpart {
  return { id, label: "", text: "", marks: 0, contentBlocks: blocks };
}

function part(id: string, blocks: EditorContentBlock[], subparts: EditorSubpart[]): EditorPart {
  return { id, label: "", text: "", marks: 0, contentBlocks: blocks, subparts, itemOrder: [] };
}

const columnRoot: Extract<EditorContentBlock, { kind: "columns" }> = {
  id: "columns-1",
  kind: "columns",
  columnCount: 2,
  columns: [[{ id: "column-child", kind: "text", text: "Nested" }], [{ id: "column-space", kind: "space", lines: 2 }]],
};

const questions: QuestionBlock[] = [
  {
    id: "q1",
    section: "Algebra",
    text: "",
    marks: 0,
    contentBlocks: [{ id: "question-text", kind: "text", text: "Prompt" }, columnRoot],
    parts: [
      part(
        "p1",
        [{ id: "part-text", kind: "text", text: "Part" }],
        [subpart("s1", [{ id: "subpart-text", kind: "text", text: "Subpart" }])],
      ),
      part("p2", [], []),
    ],
    itemOrder: [
      { kind: "block", id: "question-text" },
      { kind: "block", id: "columns-1" },
      { kind: "part", id: "p1" },
      { kind: "part", id: "p2" },
    ],
  },
  { id: "q2", section: "Algebra", text: "", marks: 0, contentBlocks: [], parts: [], itemOrder: [] },
];

const sectionHeadings: DocumentSectionHeading[] = [{ id: "heading-1", title: "Section" }];
const documentFlow: DocumentFlowItem[] = [
  { kind: "sectionHeading", id: "heading-1" },
  { kind: "question", id: "q1" },
  { kind: "question", id: "q2" },
];

function runtime(showEditor = false) {
  const actions: MauthAction[] = [];
  const events: Array<[string, ...unknown[]]> = [];
  const contexts = createEditorBlockContextRuntime(questions);
  const duplicator = createEditorDocumentDuplicator({
    id: (prefix) => `${prefix}-copy`,
    cloneSerializable: <T>(value: T) => JSON.parse(JSON.stringify(value)) as T,
  });
  const commands = createEditorContextCommandRuntime({
    questions,
    documentFlow,
    sectionHeadings,
    showEditor,
    contextDescriptorForAnchor: (anchor) => ({ id: anchor, editorAnchor: anchor, previewAnchor: `preview:${anchor}` }),
    normalizeDocumentFlow: (value) => value as DocumentFlowItem[],
    ...contexts,
    ...duplicator,
    applyAction: (action) => {
      actions.push(action);
      return { ok: true };
    },
    selectQuestion: (questionId) => events.push(["selectQuestion", questionId]),
    setActiveTocItem: (anchor) => events.push(["toc", anchor]),
    setActiveRailItem: (anchor) => events.push(["rail", anchor]),
    openInspector: () => events.push(["openInspector"]),
    openEditor: () => events.push(["openEditor"]),
    revealEditorAnchor: (anchor) => events.push(["reveal", anchor]),
    queuePreviewJump: (anchor) => events.push(["preview", anchor]),
    queueDocumentJump: (editorAnchor, previewAnchor, options) => events.push(["document", editorAnchor, previewAnchor, options]),
    moveSectionHeading: (id, direction) => events.push(["moveHeading", id, direction]),
    moveQuestion: (id, direction) => events.push(["moveQuestion", id, direction]),
    moveSubsection: (target, direction, anchor) => {
      events.push(["moveSubsection", target, direction, anchor]);
      return true;
    },
    removeSectionHeading: (id) => events.push(["removeHeading", id]),
    removePageBreakAfterQuestion: (id) => events.push(["removePageBreak", id]),
    removeQuestion: (id) => events.push(["removeQuestion", id]),
    removeQuestionBlock: (questionId, blockId) => events.push(["removeQuestionBlock", questionId, blockId]),
    removePart: (questionId, partId) => events.push(["removePart", questionId, partId]),
    removePartBlock: (questionId, currentPart, blockId) => events.push(["removePartBlock", questionId, currentPart.id, blockId]),
    removeSubpart: (questionId, currentPart, subpartId) => events.push(["removeSubpart", questionId, currentPart.id, subpartId]),
    removeSubpartBlock: (questionId, currentPart, currentSubpart, blockId) =>
      events.push(["removeSubpartBlock", questionId, currentPart.id, currentSubpart.id, blockId]),
    activateEditorAnchor: (anchor) => events.push(["activate", anchor]),
  });
  return { commands, actions, events };
}

test("context selection owns editor, inspector, and preview navigation", () => {
  const { commands, events } = runtime(false);
  const anchor = questionBlockScrollAnchor("q1", "question-text");

  commands.selectContextAnchor(anchor, { openEditor: true, openInspector: true });

  assert.deepEqual(events, [
    ["selectQuestion", "q1"],
    ["toc", anchor],
    ["rail", anchor],
    ["openInspector"],
    ["openEditor"],
    ["reveal", anchor],
    ["document", anchor, `preview:${anchor}`, { preservePaneMode: false }],
  ]);

  events.length = 0;
  commands.selectContextAnchor(anchor, { previewOnly: true });
  assert.deepEqual(events.at(-1), ["preview", `preview:${anchor}`]);
  assert.equal(
    events.some(([kind]) => kind === "document"),
    false,
  );
});

test("duplicate commands preserve hierarchy and select each copy", () => {
  const { commands, actions, events } = runtime(true);

  assert.equal(commands.duplicateAnchorTarget(questionScrollAnchor("q1")), true);
  assert.equal(commands.duplicateAnchorTarget(partScrollAnchor("q1", "p1")), true);
  assert.equal(commands.duplicateAnchorTarget(subpartScrollAnchor("q1", "p1", "s1")), true);
  assert.equal(commands.duplicateAnchorTarget(questionBlockScrollAnchor("q1", "question-text")), true);

  assert.deepEqual(
    actions.map((action) => action.type),
    ["question.add", "part.add", "subpart.add", "module.add"],
  );
  assert.equal(
    events.some((event) => event.includes(questionScrollAnchor("question-copy"))),
    true,
  );
  assert.equal(
    events.some((event) => event.includes(partScrollAnchor("q1", "part-copy"))),
    true,
  );
  assert.equal(
    events.some((event) => event.includes(subpartScrollAnchor("q1", "p1", "subpart-copy"))),
    true,
  );
  assert.equal(
    events.some((event) => event.includes(questionBlockScrollAnchor("q1", "text-copy"))),
    true,
  );
});

test("nested column duplication updates the root and selects only the copied child", () => {
  const { commands, actions, events } = runtime(true);
  const rootAnchor = questionBlockScrollAnchor("q1", "columns-1");
  const anchor = columnPathScrollAnchor(rootAnchor, [{ columnIndex: 0, blockId: "column-child" }]);

  assert.equal(commands.duplicateAnchorTarget(anchor), true);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, "module.update");
  if (actions[0]?.type !== "module.update") assert.fail("expected module.update");
  assert.equal(actions[0].blockId, "columns-1");
  assert.equal(
    events.some((event) => event.includes(`${rootAnchor}/c:0/b:text-copy`)),
    true,
  );
});

test("move and capability commands route top-level and nested targets", () => {
  const { commands, events } = runtime();

  assert.equal(commands.moveAnchorTarget(sectionHeadingScrollAnchor("heading-1"), 1), true);
  assert.equal(commands.moveAnchorTarget(questionScrollAnchor("q1"), 1), true);
  assert.equal(commands.moveAnchorTarget(partScrollAnchor("q1", "p1"), 1), true);
  assert.equal(commands.canMoveAnchorTarget(questionScrollAnchor("q1"), 1), true);
  assert.equal(commands.canMoveAnchorTarget(questionScrollAnchor("q2"), 1), false);
  assert.equal(commands.canDuplicateAnchorTarget(sectionHeadingScrollAnchor("heading-1")), false);
  assert.equal(commands.canDuplicateAnchorTarget(questionBlockScrollAnchor("q1", "question-text")), true);
  assert.equal(commands.canDeleteAnchorTarget("front-matter"), false);
  assert.equal(commands.canDeleteAnchorTarget(partScrollAnchor("q1", "p1")), true);
  assert.deepEqual(events.slice(0, 2), [
    ["moveHeading", "heading-1", 1],
    ["moveQuestion", "q1", 1],
  ]);
  assert.equal(events[2]?.[0], "moveSubsection");
});

test("delete commands preserve hierarchy focus and delete only a selected column child", () => {
  const { commands, actions, events } = runtime();
  const rootAnchor = questionBlockScrollAnchor("q1", "columns-1");
  const columnAnchor = columnPathScrollAnchor(rootAnchor, [{ columnIndex: 0, blockId: "column-child" }]);

  assert.equal(commands.deleteEditorSelection(sectionHeadingScrollAnchor("heading-1")), true);
  assert.equal(commands.deleteEditorSelection(pageBreakScrollAnchor("q1")), true);
  assert.equal(commands.deleteEditorSelection(questionBlockScrollAnchor("q1", "question-text")), true);
  assert.equal(commands.deleteEditorSelection(partBlockScrollAnchor("q1", "p1", "part-text")), true);
  assert.equal(commands.deleteEditorSelection(subpartScrollAnchor("q1", "p1", "s1")), true);
  assert.equal(commands.deleteEditorSelection(subpartBlockScrollAnchor("q1", "p1", "s1", "subpart-text")), true);
  assert.equal(commands.deleteEditorSelection(columnAnchor), true);

  const columnDelete = actions.at(-1);
  assert.equal(columnDelete?.type, "module.delete");
  if (columnDelete?.type !== "module.delete") assert.fail("expected module.delete");
  assert.equal(columnDelete.blockId, "column-child");
  assert.equal(
    events.some((event) => event[0] === "removeHeading"),
    true,
  );
  assert.equal(
    events.some((event) => event[0] === "removePageBreak"),
    true,
  );
  assert.equal(
    events.some((event) => event[0] === "removeQuestionBlock"),
    true,
  );
  assert.equal(
    events.some((event) => event[0] === "removePartBlock"),
    true,
  );
  assert.equal(
    events.some((event) => event[0] === "removeSubpart"),
    true,
  );
  assert.equal(
    events.some((event) => event[0] === "removeSubpartBlock"),
    true,
  );
  assert.equal(
    events.some((event) => event[0] === "activate" && event[1] === rootAnchor),
    true,
  );
});
