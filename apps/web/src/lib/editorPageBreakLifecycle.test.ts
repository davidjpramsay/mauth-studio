import assert from "node:assert/strict";
import test from "node:test";

import type { EditorPart, QuestionBlock } from "./editorDocumentNormalization.ts";
import {
  editorPageBreakTargetHasBreak,
  firstInsertableEditorPageBreakTarget,
  mauthTargetFromEditorPageBreak,
  orderedPartPageBreakTargets,
  orderedSubpartPageBreakTargets,
  partPageBreakInsertTarget,
  subpartPageBreakInsertTarget,
} from "./editorPageBreakLifecycle.ts";
import type { EditorPageBreakTarget } from "./editorSubsectionDrag.ts";

function part(id: string, overrides: Partial<EditorPart> = {}): EditorPart {
  return {
    id,
    label: "",
    text: "",
    marks: 0,
    contentBlocks: [],
    subparts: [],
    itemOrder: [],
    ...overrides,
  };
}

function question(id: string, parts: EditorPart[], itemOrder: QuestionBlock["itemOrder"] = []): QuestionBlock {
  return {
    id,
    section: "Algebra",
    text: "",
    marks: 0,
    contentBlocks: [],
    parts,
    itemOrder,
  };
}

test("mauthTargetFromEditorPageBreak returns page-break action targets", () => {
  assert.deepEqual(mauthTargetFromEditorPageBreak({ kind: "part", questionId: "q1", partId: "p1" }), {
    kind: "part",
    questionId: "q1",
    partId: "p1",
  });
  assert.deepEqual(mauthTargetFromEditorPageBreak({ kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" }), {
    kind: "subpart",
    questionId: "q1",
    partId: "p1",
    subpartId: "s1",
  });
});

test("ordered page-break targets follow mixed item order", () => {
  const p1 = part("p1");
  const p2 = part("p2");
  const p3 = part("p3");
  const q1 = question(
    "q1",
    [p1, p2, p3],
    [
      { kind: "part", id: "p2" },
      { kind: "block", id: "b1" },
      { kind: "part", id: "p1" },
    ],
  );

  assert.deepEqual(orderedPartPageBreakTargets(q1), [
    { kind: "part", questionId: "q1", partId: "p2" },
    { kind: "part", questionId: "q1", partId: "p1" },
    { kind: "part", questionId: "q1", partId: "p3" },
  ]);

  const partWithSubparts = part("p1", {
    subparts: [
      { id: "s1", label: "i", text: "", marks: 0, contentBlocks: [] },
      { id: "s2", label: "ii", text: "", marks: 0, contentBlocks: [] },
    ],
    itemOrder: [
      { kind: "subpart", id: "s2" },
      { kind: "block", id: "b1" },
    ],
  });
  assert.deepEqual(orderedSubpartPageBreakTargets("q1", partWithSubparts), [
    { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s2" },
    { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" },
  ]);
});

test("editorPageBreakTargetHasBreak reads part and subpart page-break flags", () => {
  const q1 = question("q1", [
    part("p1", {
      pageBreakBefore: true,
      subparts: [
        { id: "s1", label: "i", text: "", marks: 0, contentBlocks: [] },
        { id: "s2", label: "ii", text: "", marks: 0, pageBreakBefore: true, contentBlocks: [] },
      ],
    }),
  ]);

  assert.equal(editorPageBreakTargetHasBreak([q1], { kind: "part", questionId: "q1", partId: "p1" }), true);
  assert.equal(editorPageBreakTargetHasBreak([q1], { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s1" }), false);
  assert.equal(editorPageBreakTargetHasBreak([q1], { kind: "subpart", questionId: "q1", partId: "p1", subpartId: "s2" }), true);
  assert.equal(editorPageBreakTargetHasBreak([q1], { kind: "part", questionId: "missing", partId: "p1" }), false);
});

test("firstInsertableEditorPageBreakTarget prefers targets after the active target then wraps", () => {
  const targets: EditorPageBreakTarget[] = [
    { kind: "part", questionId: "q1", partId: "p1" },
    { kind: "part", questionId: "q1", partId: "p2" },
    { kind: "part", questionId: "q1", partId: "p3" },
  ];
  const blocked = new Set(["p2"]);
  const hasBreak = (target: EditorPageBreakTarget) => target.kind === "part" && blocked.has(target.partId);

  assert.deepEqual(firstInsertableEditorPageBreakTarget({ targets, hasBreak, preferredAfterIndex: 0 }), targets[2]);
  assert.deepEqual(firstInsertableEditorPageBreakTarget({ targets, hasBreak, preferredAfterIndex: 2 }), targets[0]);
  blocked.add("p1");
  blocked.add("p3");
  assert.equal(firstInsertableEditorPageBreakTarget({ targets, hasBreak }), null);
});

test("part and subpart insertion targets use the active editor anchor", () => {
  const p1 = part("p1");
  const p2 = part("p2");
  const p3 = part("p3");
  const q1 = question("q1", [p1, p2, p3]);
  const hasPartBreak = (target: { partId: string }) => target.partId === "p3";

  assert.deepEqual(partPageBreakInsertTarget({ question: q1, activeAnchor: "q:q1/p:p1", hasBreak: hasPartBreak }), {
    kind: "part",
    questionId: "q1",
    partId: "p2",
  });
  assert.deepEqual(partPageBreakInsertTarget({ question: q1, activeAnchor: "q:q1/p:p2", hasBreak: hasPartBreak }), {
    kind: "part",
    questionId: "q1",
    partId: "p1",
  });

  const p4 = part("p4", {
    subparts: [
      { id: "s1", label: "i", text: "", marks: 0, contentBlocks: [] },
      { id: "s2", label: "ii", text: "", marks: 0, contentBlocks: [] },
      { id: "s3", label: "iii", text: "", marks: 0, contentBlocks: [] },
    ],
  });
  assert.deepEqual(
    subpartPageBreakInsertTarget({
      questionId: "q1",
      part: p4,
      activeAnchor: "q:q1/p:p4/s:s1",
      hasBreak: (target) => target.subpartId === "s2",
    }),
    { kind: "subpart", questionId: "q1", partId: "p4", subpartId: "s3" },
  );
});
