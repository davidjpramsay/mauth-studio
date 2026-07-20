import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectFileVersion } from "@mauth-studio/shared";

import {
  buildProjectFileVersionPreview,
  projectFileVersionRawPreview,
  type VersionPreviewQuestionLike,
} from "./projectFileVersionPreview.ts";

function version(content: string, patch: Partial<ProjectFileVersion> = {}): ProjectFileVersion {
  return {
    id: "v1",
    projectId: "project",
    filePath: "tests/Test.test.json",
    fileType: "test-json",
    metadata: {},
    revision: 7,
    content,
    createdAt: "2026-06-30T02:00:00.000Z",
    ...patch,
  };
}

function question(marks: number, parts: VersionPreviewQuestionLike["parts"] = [], blockCount = 1): VersionPreviewQuestionLike {
  return {
    marks,
    contentBlocks: Array.from({ length: blockCount }, () => ({})),
    parts,
  };
}

test("projectFileVersionRawPreview truncates long content", () => {
  const content = "x".repeat(6001);

  assert.equal(projectFileVersionRawPreview(content), `${"x".repeat(6000)}\n...`);
});

test("buildProjectFileVersionPreview summarizes saved test snapshots", () => {
  const savedTest = {
    name: "Year 10 Exam",
    frontMatter: { subjectTitle: "Mathematics", assessmentTitle: "Calculator-free" },
    questions: [
      question(3),
      question(5, [
        {
          contentBlocks: [{}],
          subparts: [{ contentBlocks: [{}] }],
        },
        {
          contentBlocks: [],
          subparts: [],
        },
      ]),
    ],
  };

  const preview = buildProjectFileVersionPreview(version(JSON.stringify(savedTest)), {
    parseSavedTest: (value) => value as typeof savedTest,
    questionMarks: (value) => Number(value.marks) || 0,
    formatCreatedAt: () => "30 Jun 2026, 10:00 am",
  });

  assert.equal(preview.kind, "test");
  assert.equal(preview.title, "Year 10 Exam");
  assert.equal(preview.subtitle, "Mathematics - Calculator-free");
  assert.deepEqual(preview.details, ["2 questions", "8 marks", "Saved 30 Jun 2026, 10:00 am"]);
  assert.deepEqual(preview.questions, ["Question 1: 3 marks, 1 module", "Question 2: 5 marks, 2 parts"]);
});

test("buildProjectFileVersionPreview falls back to raw snapshots", () => {
  const preview = buildProjectFileVersionPreview(version("not json", { fileType: null }), {
    parseSavedTest: () => null,
    questionMarks: () => 0,
    formatCreatedAt: () => "30 Jun 2026, 10:00 am",
  });

  assert.equal(preview.kind, "raw");
  assert.equal(preview.title, "Revision 7");
  assert.equal(preview.subtitle, "File snapshot");
  assert.deepEqual(preview.details, ["Saved 30 Jun 2026, 10:00 am", "8 B text"]);
  assert.deepEqual(preview.questions, []);
  assert.equal(preview.rawPreview, "not json");
});
