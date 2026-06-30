import test from "node:test";
import assert from "node:assert/strict";

import { defaultSavedTestName, printFileNameForDocument, projectFileTypeForFrontMatter } from "./documentFileNaming.ts";

test("projectFileTypeForFrontMatter maps document templates to project file types", () => {
  assert.equal(projectFileTypeForFrontMatter({ titlePageTemplate: "notes" }), "notes");
  assert.equal(projectFileTypeForFrontMatter({ titlePageTemplate: "worksheet" }), "worksheet");
  assert.equal(projectFileTypeForFrontMatter({ titlePageTemplate: "exam" }), "test");
  assert.equal(projectFileTypeForFrontMatter({ titlePageTemplate: "standard" }), "test");
  assert.equal(projectFileTypeForFrontMatter({}), "test");
});

test("defaultSavedTestName joins subject and assessment title", () => {
  assert.equal(defaultSavedTestName({ subjectTitle: "Mathematics", assessmentTitle: "Test 4" }), "Mathematics - Test 4");
  assert.equal(defaultSavedTestName({ subjectTitle: "  Mathematics  ", assessmentTitle: "" }), "Mathematics");
  assert.equal(defaultSavedTestName({ subjectTitle: "", assessmentTitle: "Revision" }), "Revision");
  assert.equal(defaultSavedTestName({}), "Untitled test");
});

test("printFileNameForDocument creates student and solution PDF names", () => {
  const frontMatter = { subjectTitle: "Mathematics", assessmentTitle: "Test: 4", titlePageTemplate: "exam" };

  assert.equal(printFileNameForDocument(frontMatter, "", false), "Mathematics - Test 4 - Student");
  assert.equal(printFileNameForDocument(frontMatter, "", true), "Mathematics - Test 4 - Solutions");
  assert.equal(printFileNameForDocument(frontMatter, "Y10 / Exam?", false), "Y10 Exam - Student");
});

test("printFileNameForDocument leaves notes names unsuffixed", () => {
  assert.equal(
    printFileNameForDocument({ titlePageTemplate: "notes", subjectTitle: "Math", assessmentTitle: "Notes" }, "", true),
    "Math - Notes",
  );
});
