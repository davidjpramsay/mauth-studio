import assert from "node:assert/strict";
import test from "node:test";

import type { FrontMatterConfig } from "./frontMatterConfig.ts";
import { buildPreviewSegments, contentBlocksHaveDiagram, previewPartBlockRowIds, promptTextBlock } from "./editorPreviewSegments.ts";
import type {
  DocumentFlowItem,
  DocumentSectionHeading,
  EditorContentBlock,
  EditorPart,
  OrderedPartItem,
  QuestionBlock,
} from "./editorDocumentNormalization.ts";

function text(id: string, textValue = "Text", patch: Partial<Extract<EditorContentBlock, { kind: "text" }>> = {}) {
  return { id, kind: "text", text: textValue, ...patch } as EditorContentBlock;
}

function space(id: string, patch: Partial<Extract<EditorContentBlock, { kind: "space" }>> = {}) {
  return { id, kind: "space", lines: 2, showLines: true, ...patch } as EditorContentBlock;
}

function diagram(id: string, patch: Partial<Extract<EditorContentBlock, { kind: "diagram" }>> = {}) {
  return {
    id,
    kind: "diagram",
    graphConfig: { type: "graph2d", data: {}, options: {}, functions: [], features: [], metadata: {} },
    diagramAlign: "center",
    ...patch,
  } as EditorContentBlock;
}

function columns(id: string, columnBlocks: EditorContentBlock[][]) {
  return { id, kind: "columns", columnCount: columnBlocks.length, columns: columnBlocks } as EditorContentBlock;
}

function part(id: string, contentBlocks: EditorContentBlock[] = [], subparts: EditorPart["subparts"] = []): EditorPart {
  return {
    id,
    label: "",
    text: "",
    marks: 0,
    contentBlocks,
    subparts,
    itemOrder: [
      ...contentBlocks.map((block) => ({ kind: "block" as const, id: block.id })),
      ...subparts.map((subpart) => ({ kind: "subpart" as const, id: subpart.id })),
    ],
  };
}

function question(id: string, contentBlocks: EditorContentBlock[] = [], parts: EditorPart[] = []): QuestionBlock {
  return {
    id,
    section: "",
    text: "",
    marks: 0,
    contentBlocks,
    parts,
    itemOrder: [
      ...contentBlocks.map((block) => ({ kind: "block" as const, id: block.id })),
      ...parts.map((questionPart) => ({ kind: "part" as const, id: questionPart.id })),
    ],
  };
}

function normalizeDocumentFlow(value: unknown, questions: QuestionBlock[], headings: DocumentSectionHeading[]): DocumentFlowItem[] {
  const questionIds = new Set(questions.map((current) => current.id));
  const headingIds = new Set(headings.map((heading) => heading.id));
  return (Array.isArray(value) ? value : []).filter((item): item is DocumentFlowItem =>
    Boolean(
      item &&
      typeof item === "object" &&
      "kind" in item &&
      "id" in item &&
      ((item.kind === "question" && questionIds.has(String(item.id))) ||
        (item.kind === "sectionHeading" && headingIds.has(String(item.id)))),
    ),
  );
}

test("promptTextBlock trims prompts and ignores empty text", () => {
  assert.deepEqual(promptTextBlock("prompt", "  Sketch the graph.  "), { id: "prompt", kind: "text", text: "Sketch the graph." });
  assert.equal(promptTextBlock("prompt", "   "), null);
  assert.equal(promptTextBlock("prompt"), null);
});

test("contentBlocksHaveDiagram respects solution visibility inside columns", () => {
  const blocks = [columns("cols", [[diagram("student-diagram")], [diagram("solution-diagram", { visibility: "solution" })]])];

  assert.equal(contentBlocksHaveDiagram(blocks, false), true);
  assert.equal(
    contentBlocksHaveDiagram([columns("solution-cols", [[diagram("solution-diagram", { visibility: "solution" })]])], false),
    false,
  );
  assert.equal(
    contentBlocksHaveDiagram([columns("solution-cols", [[diagram("solution-diagram", { visibility: "solution" })]])], true),
    true,
  );
});

test("buildPreviewSegments follows document flow and adds compact template headers", () => {
  const heading = { id: "h1", title: "Multiple choice" };
  const segments = buildPreviewSegments({
    frontMatter: { titlePageTemplate: "worksheet" } as FrontMatterConfig,
    questions: [question("q1", [text("b1")])],
    sectionHeadings: [heading],
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
    ],
    showSolutions: false,
    normalizeDocumentFlow,
  });

  assert.deepEqual(
    segments.map((segment) => [segment.kind, segment.id]),
    [
      ["worksheet-header", "worksheet-header"],
      ["section-heading", "section-heading:h1"],
      ["question-start", "q1:start"],
      ["question-block", "q1:block:b1"],
    ],
  );
  assert.equal(segments[1].spacingTop, 0);
  assert.equal(segments[2].spacingTop > 0, true);
});

test("buildPreviewSegments splits part groups around subpart page breaks", () => {
  const questionPart = part(
    "p1",
    [text("part-block")],
    [
      {
        id: "s1",
        label: "",
        text: "",
        marks: 0,
        pageBreakBefore: true,
        contentBlocks: [text("subpart-block")],
      },
    ],
  );
  const segments = buildPreviewSegments({
    frontMatter: { titlePageTemplate: "exam" } as FrontMatterConfig,
    questions: [question("q1", [], [questionPart])],
    sectionHeadings: [],
    documentFlow: [{ kind: "question", id: "q1" }],
    showSolutions: false,
    normalizeDocumentFlow,
  });

  assert.deepEqual(
    segments.map((segment) => [segment.kind, segment.id, segment.showPartLabel]),
    [
      ["question-start", "q1:start", undefined],
      ["part-group", "q1:part-group:p1:0", true],
      ["page-break", "q1:part-group:p1:page-break:before-subpart-s1", undefined],
      ["part-group", "q1:part-group:p1:1", false],
    ],
  );
});

test("previewPartBlockRowIds keeps paired diagram rows and replacement slots together", () => {
  const pairedItems: OrderedPartItem[] = [
    { kind: "block", id: "diagram", block: diagram("diagram", { diagramAlign: "left" }) },
    { kind: "block", id: "beside-text", block: text("beside-text") },
  ];
  assert.deepEqual(previewPartBlockRowIds(pairedItems, false), ["diagram"]);

  const replacementItems: OrderedPartItem[] = [
    { kind: "block", id: "answer-space", block: space("answer-space", { visibility: "student" }) },
    { kind: "block", id: "solution", block: text("solution", "42", { visibility: "solution" }) },
  ];
  assert.deepEqual(previewPartBlockRowIds(replacementItems, true), ["answer-space"]);
});
