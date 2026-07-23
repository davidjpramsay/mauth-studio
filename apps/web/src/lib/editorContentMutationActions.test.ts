import assert from "node:assert/strict";
import test from "node:test";

import { createEditorContentMutationActions } from "./editorContentMutationActions.ts";
import type { EditorContentBlock, EditorPart, QuestionBlock } from "./editorDocumentNormalization.ts";
import type { MauthAction } from "./mauthActions.ts";

const textBlock = (id: string): EditorContentBlock => ({ id, kind: "text", text: "" });

const part: EditorPart = {
  id: "part-1",
  label: "",
  text: "",
  marks: 0,
  contentBlocks: [],
  subparts: [
    {
      id: "subpart-1",
      label: "i",
      text: "",
      marks: 0,
      contentBlocks: [],
    },
  ],
  itemOrder: [{ kind: "subpart", id: "subpart-1" }],
};

const question: QuestionBlock = {
  id: "question-1",
  text: "",
  marks: 0,
  contentBlocks: [],
  parts: [part],
  itemOrder: [{ kind: "part", id: "part-1" }],
};

function runtime() {
  const actions: MauthAction[] = [];
  const activated: string[] = [];
  const revealed: string[] = [];
  const pageBreaks: Array<{ target: unknown; enabled: boolean }> = [];
  let idCount = 0;
  const controller = createEditorContentMutationActions({
    questions: [question],
    activeAnchor: "p:question-1:part-1",
    createId: (prefix) => `${prefix}-new-${++idCount}`,
    insertedBlockVisibilityForKind: () => "always",
    contentBlockForKind: (kind, visibility) => ({ ...textBlock(`${kind}-new`), kind, visibility }) as EditorContentBlock,
    diagramBlockForType: (type, visibility) => ({
      id: `diagram-${type}`,
      kind: "diagram",
      visibility,
      graphConfig: { type },
    }),
    applyAction: (action) => {
      actions.push(action);
      return { ok: true };
    },
    activateAnchor: (anchor) => activated.push(anchor),
    revealAnchor: (anchor) => revealed.push(anchor),
    editorPageBreakDestinationHasBreak: () => false,
    setEditorPageBreak: (target, enabled) => pageBreaks.push({ target, enabled }),
  });
  return { controller, actions, activated, revealed, pageBreaks };
}

test("scoped update actions preserve question, part, subpart, and selected-column roots", () => {
  const { controller, actions } = runtime();
  controller.updateQuestion("question-1", { text: "Question wording", marks: 4 });
  controller.updatePart("question-1", "part-1", { text: "Part wording" });
  controller.updateSubpart("question-1", "part-1", "subpart-1", { text: "Subpart wording" });
  controller.updateContentBlock("question-1", "question-block", { text: "Question" });
  controller.updatePartContentBlock("question-1", "part-1", "part-block", { text: "Part" });
  controller.updateSubpartContentBlock("question-1", "part-1", "subpart-1", "subpart-block", { text: "Subpart" });
  controller.updateSelectedBlock(
    {
      scope: {
        kind: "column",
        rootScope: { kind: "part", questionId: "question-1", partId: "part-1" },
        rootBlockId: "columns-1",
        columnPath: [0, 0],
      },
      block: textBlock("nested-block"),
      parentBlock: textBlock("columns-1"),
    },
    { text: "Nested" },
  );

  assert.deepEqual(
    actions.map((action) => (action.type === "module.update" ? [action.type, action.scope.kind, action.blockId] : [action.type])),
    [
      ["question.update"],
      ["part.update"],
      ["subpart.update"],
      ["module.update", "question", "question-block"],
      ["module.update", "part", "part-block"],
      ["module.update", "subpart", "subpart-block"],
      ["module.update", "part", "nested-block"],
    ],
  );
});

test("module insertions target each hierarchy and focus the inserted block", () => {
  const { controller, actions, activated, revealed } = runtime();
  controller.addQuestionBlock("question-1", "text");
  controller.addPartDiagramBlock("question-1", part, "graph2d");
  controller.addSubpartBlock("question-1", part, part.subparts[0], "table");

  assert.deepEqual(
    actions.map((action) => (action.type === "module.add" ? action.scope.kind : action.type)),
    ["question", "part", "subpart"],
  );
  assert.deepEqual(activated, [
    "q:question-1/b:text-new",
    "q:question-1/p:part-1/b:diagram-graph2d",
    "q:question-1/p:part-1/s:subpart-1/b:table-new",
  ]);
  assert.deepEqual(revealed, activated);
});

test("part and subpart creation use stable factories and reject unknown questions", () => {
  const { controller, actions } = runtime();
  controller.addPart("question-1");
  controller.addSubpart("question-1", part);
  controller.addPart("missing-question");

  assert.equal(actions.length, 2);
  assert.equal(actions[0].type, "part.add");
  assert.equal(actions[0].type === "part.add" ? actions[0].part.id : "", "part-new-1");
  assert.equal(actions[1].type, "subpart.add");
  assert.equal(actions[1].type === "subpart.add" ? actions[1].subpart.id : "", "subpart-new-2");
});

test("page-break insertions choose the next hierarchy target and reveal it", () => {
  const { controller, pageBreaks, revealed } = runtime();
  controller.addPartPageBreak("question-1");
  controller.addSubpartPageBreak("question-1", part);

  assert.deepEqual(pageBreaks, [
    { target: { kind: "part", questionId: "question-1", partId: "part-1" }, enabled: true },
    {
      target: { kind: "subpart", questionId: "question-1", partId: "part-1", subpartId: "subpart-1" },
      enabled: true,
    },
  ]);
  assert.deepEqual(revealed, ["q:question-1/p:part-1", "q:question-1/p:part-1/s:subpart-1"]);
});

test("preview graph updates route to the matching content scope", () => {
  const { controller, actions } = runtime();
  const graphConfig = { type: "graph2d" };
  controller.updatePreviewGraphConfig({ questionId: "question-1", blockId: "q-graph", graphConfig });
  controller.updatePreviewGraphConfig({ questionId: "question-1", partId: "part-1", blockId: "p-graph", graphConfig });
  controller.updatePreviewGraphConfig({
    questionId: "question-1",
    partId: "part-1",
    subpartId: "subpart-1",
    blockId: "s-graph",
    graphConfig,
  });

  assert.deepEqual(
    actions.map((action) => (action.type === "module.update" ? [action.scope.kind, action.blockId] : [])),
    [
      ["question", "q-graph"],
      ["part", "p-graph"],
      ["subpart", "s-graph"],
    ],
  );
});
