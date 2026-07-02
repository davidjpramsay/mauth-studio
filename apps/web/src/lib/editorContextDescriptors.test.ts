import assert from "node:assert/strict";
import test from "node:test";

import { createEditorContextDescriptorRuntime, fallbackContextLabel } from "./editorContextDescriptors.ts";
import type { SelectedEditorBlock } from "./editorBlockSelection.ts";
import type { DocumentTocItem } from "./documentNavigation.ts";
import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import { columnPathScrollAnchor, questionBlockScrollAnchor } from "./scrollAnchors.ts";

const questions: QuestionBlock[] = [
  {
    id: "q1",
    section: "",
    marks: 2,
    contentBlocks: [
      { id: "text-1", kind: "text", text: "Question prompt" },
      { id: "diagram-1", kind: "diagram", graphConfig: { type: "graph2d", functions: [], features: [], metadata: {} } },
    ],
    parts: [],
    itemOrder: [
      { kind: "block", id: "text-1" },
      { kind: "block", id: "diagram-1" },
    ],
  },
];

const tocItems: DocumentTocItem[] = [
  {
    id: "q:q1",
    label: "Question 1",
    summary: "$x$ prompt",
    kind: "question",
    depth: 0,
    editorAnchor: "q:q1",
    previewAnchor: "q:q1",
  },
  {
    id: "q:q1/b:text-1",
    label: "Text 1",
    summary: "Question prompt",
    kind: "text",
    depth: 1,
    editorAnchor: "q:q1/b:text-1",
    previewAnchor: "preview:q1:text-1",
  },
  {
    id: "q:q1/b:diagram-1",
    label: "Diagram 2",
    summary: "Coordinate grid",
    kind: "diagram",
    depth: 1,
    editorAnchor: "q:q1/b:diagram-1",
    previewAnchor: "preview:q1:diagram-1",
  },
];

function selectedEditorBlockFromAnchor(_questions: QuestionBlock[], anchor: string): SelectedEditorBlock | null {
  if (anchor !== "q:q1/b:columns-1/c:1/b:space-1") return null;
  return {
    scope: {
      kind: "column",
      rootScope: { kind: "question", questionId: "q1" },
      rootBlockId: "columns-1",
      path: [{ columnIndex: 1, blockId: "space-1" }],
    },
    block: { id: "space-1", kind: "space", lines: 3 },
    label: "Column 2 space 1",
    summary: "$x$ working space",
  };
}

const runtime = createEditorContextDescriptorRuntime({
  documentTocItems: tocItems,
  questions,
  selectedEditorBlockFromAnchor,
  summaryText: (source) => source.replace(/\$/g, "").replace(/\s+/g, " ").trim(),
});

test("fallbackContextLabel names known anchor kinds", () => {
  assert.equal(fallbackContextLabel("front-matter"), "Title Page");
  assert.equal(fallbackContextLabel("sh:section-1"), "Section heading");
  assert.equal(fallbackContextLabel("pb:q1"), "Page break");
  assert.equal(fallbackContextLabel("q:q1/p:p1/s:s1"), "Subpart");
  assert.equal(fallbackContextLabel("q:q1/b:block-1"), "Module");
});

test("contextDescriptorForAnchor returns exact TOC items and graph child parents", () => {
  assert.equal(runtime.contextDescriptorForAnchor("q:q1/b:text-1").label, "Text 1");

  const graphChild = runtime.contextDescriptorForAnchor("q:q1/b:diagram-1/gfeat:0");
  assert.equal(graphChild.label, "Diagram 2");
  assert.equal(graphChild.previewAnchor, "preview:q1:diagram-1");
});

test("contextDescriptorForAnchor uses selected blocks for nested column modules", () => {
  const columnAnchor = columnPathScrollAnchor(questionBlockScrollAnchor("q1", "columns-1"), [{ columnIndex: 1, blockId: "space-1" }]);
  const descriptor = runtime.contextDescriptorForAnchor(columnAnchor);

  assert.equal(descriptor.label, "Column 2 space 1");
  assert.equal(descriptor.kind, "space");
  assert.equal(descriptor.summary, "$x$ working space");
  assert.equal(descriptor.previewAnchor, columnAnchor);
});

test("contextReferenceText emits stable agent references", () => {
  assert.equal(
    runtime.contextReferenceText("q:q1/b:text-1"),
    ["Mauth target: @mauth[q:q1/b:text-1]", "Item: Question 1 · Text 1", "Type: text", "Summary: Question prompt"].join("\n"),
  );

  assert.equal(
    runtime.contextReferenceText("q:q1"),
    ["Mauth target: @mauth[q:q1]", "Item: Question 1", "Type: question", "Summary: x prompt"].join("\n"),
  );
});
