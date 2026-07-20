import assert from "node:assert/strict";
import test from "node:test";

import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import { DEFAULT_FORMATTING_CONFIG } from "./editorFormattingConfig.ts";
import { DEFAULT_FRONT_MATTER } from "./frontMatterConfig.ts";
import { createSavedTestSnapshot, editorDocumentFingerprint, type EditorDocumentState } from "./editorApplicationRuntime.ts";
import { createEditorProjectFileDuplicatePlan } from "./editorProjectFileDuplicate.ts";

function question(id: string): QuestionBlock {
  return {
    id,
    section: "Review",
    text: "Complete the table.",
    marks: 2,
    contentBlocks: [],
    parts: [],
    itemOrder: [],
    pageBreakAfter: false,
  };
}

test("active editor duplication writes the current structured document under the duplicate name", () => {
  const document: EditorDocumentState = {
    frontMatter: {
      ...DEFAULT_FRONT_MATTER,
      titlePageTemplate: "worksheet",
      assessmentTitle: "Original title",
      logoId: "school-logo",
    },
    questions: [question("q1")],
    sectionHeadings: [{ id: "h1", title: "Tables" }],
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
    ],
    formattingConfig: DEFAULT_FORMATTING_CONFIG,
  };
  const original = structuredClone(document);
  const logos = [{ id: "school-logo", name: "School", src: "/school.svg", schoolName: "SCHOOL" }];

  const plan = createEditorProjectFileDuplicatePlan({
    targetFilePath: "tests/Archive/Revision copy.test.json",
    targetTestPath: "Archive/Revision copy.test.json",
    document,
    logos,
    runtime: { createSavedTestSnapshot, editorDocumentFingerprint },
  });

  assert.equal(plan.filePath, "tests/Archive/Revision copy.test.json");
  assert.equal(plan.request.kind, "file");
  assert.equal(plan.request.fileType, "worksheet");
  assert.deepEqual(plan.request.metadata, {
    format: "saved-test-json",
    source: "mauth-studio",
  });
  assert.equal(typeof plan.fingerprint, "string");
  assert.ok(plan.fingerprint.length > 0);

  const saved = JSON.parse(String(plan.request.content)) as {
    id: string;
    name: string;
    frontMatter: EditorDocumentState["frontMatter"];
    questions: EditorDocumentState["questions"];
    sectionHeadings: EditorDocumentState["sectionHeadings"];
    documentFlow: EditorDocumentState["documentFlow"];
    logo?: (typeof logos)[number];
  };
  assert.equal(saved.id, "project-file:tests/Archive/Revision copy.test.json");
  assert.equal(saved.name, "Revision copy");
  assert.deepEqual(saved.frontMatter, document.frontMatter);
  assert.deepEqual(saved.questions, document.questions);
  assert.deepEqual(saved.sectionHeadings, document.sectionHeadings);
  assert.deepEqual(saved.documentFlow, document.documentFlow);
  assert.deepEqual(saved.logo, logos[0]);
  assert.deepEqual(document, original);
});
