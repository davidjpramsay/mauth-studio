import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import {
  LEGACY_STARTER_DOCUMENT_STORAGE_KEY,
  SCREENSHOT_STARTER_DOCUMENT_ID,
  STARTER_DOCUMENT_STORAGE_KEY,
  createNotesSection,
  createQuestion,
  createScreenshotStarterFrontMatter,
  createScreenshotStarterQuestions,
  isBlankStarterQuestion,
  shouldSeedScreenshotStarter,
  type ScreenshotStarterRuntime,
} from "./editorStarterDocuments.ts";

function createIdFactory() {
  const counters = new Map<string, number>();
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${next}`;
  };
}

function createMemoryStorage(initialEntries: [string, string][] = []) {
  const values = new Map(initialEntries);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

function createRuntime(): ScreenshotStarterRuntime {
  const id = createIdFactory();
  return {
    id,
    textBlock: (text = ""): ContentBlock => ({ id: id("text"), kind: "text", text }),
    choiceListBlock: (choices = ["", "", "", ""]): ContentBlock => ({
      id: id("choices"),
      kind: "choices",
      choices,
      answerIndex: 0,
      layout: "vertical",
    }),
    spaceBlock: (lines = 3): Extract<ContentBlock, { kind: "space" }> => ({
      id: id("space"),
      kind: "space",
      lines,
    }),
    withGraphDefaults: (graphConfig?: GraphConfig | null): GraphConfig => graphConfig ?? ({ type: "graph2d" } as GraphConfig),
  };
}

test("createQuestion creates the blank starter question shape", () => {
  const question = createQuestion(createIdFactory());

  assert.equal(question.section, "Algebra");
  assert.equal(question.text, "");
  assert.equal(question.marks, 0);
  assert.deepEqual(question.contentBlocks, []);
  assert.deepEqual(question.parts, []);
  assert.deepEqual(question.itemOrder, []);
  assert.equal(question.pageBreakAfter, false);
  assert.equal(isBlankStarterQuestion(question), true);
});

test("createNotesSection creates an editable notes heading with a starter text block", () => {
  const section = createNotesSection(createIdFactory());

  assert.equal(section.section, "Introduction");
  assert.equal(section.marks, 0);
  assert.equal(section.contentBlocks.length, 1);
  assert.equal(section.contentBlocks[0]?.kind, "text");
  assert.equal(section.itemOrder[0]?.kind, "block");
  assert.equal(isBlankStarterQuestion(section), false);
});

test("shouldSeedScreenshotStarter is guarded by browser storage markers and blank state", () => {
  const blank = createQuestion(createIdFactory());

  assert.equal(shouldSeedScreenshotStarter([blank], createMemoryStorage()), true);
  assert.equal(
    shouldSeedScreenshotStarter([blank], createMemoryStorage([[STARTER_DOCUMENT_STORAGE_KEY, SCREENSHOT_STARTER_DOCUMENT_ID]])),
    false,
  );
  assert.equal(shouldSeedScreenshotStarter([blank], createMemoryStorage([[LEGACY_STARTER_DOCUMENT_STORAGE_KEY, "legacy"]])), false);
  assert.equal(shouldSeedScreenshotStarter([createNotesSection(createIdFactory())], createMemoryStorage()), false);
  assert.equal(shouldSeedScreenshotStarter([blank, createQuestion(createIdFactory())], createMemoryStorage()), false);
});

test("shouldSeedScreenshotStarter does not seed from a server-side default storage context", () => {
  const blank = createQuestion(createIdFactory());

  assert.equal(shouldSeedScreenshotStarter([blank]), false);
});

test("createScreenshotStarterFrontMatter configures the screenshot starter as a test", () => {
  const frontMatter = createScreenshotStarterFrontMatter();

  assert.equal(frontMatter.subjectTitle, "YEAR 12 MATHEMATICS");
  assert.equal(frontMatter.assessmentTitle, "TEST 2");
  assert.equal(frontMatter.showDeclaration, false);
  assert.equal(frontMatter.showInstructions, true);
  assert.match(frontMatter.instructionsBody, /working/i);
});

test("createScreenshotStarterQuestions creates the expected starter assessment sections and marks", () => {
  const questions = createScreenshotStarterQuestions(createRuntime());

  assert.equal(questions.length, 4);
  assert.deepEqual(
    questions.map((question) => question.section),
    ["Calculus", "Calculus", "Statistics", "Statistics"],
  );
  assert.deepEqual(
    questions.map((question) => question.marks),
    [0, 4, 2, 1],
  );

  const firstQuestion = questions[0];
  assert.equal(firstQuestion?.parts.length, 4);
  assert.deepEqual(
    firstQuestion?.parts.map((part) => part.marks),
    [5, 2, 1, 2],
  );
  assert.deepEqual(
    firstQuestion?.itemOrder.map((item) => item.kind),
    ["block", "part", "part", "part", "part"],
  );

  const areaQuestion = questions[1];
  assert.equal(
    areaQuestion?.contentBlocks.some((block) => block.kind === "diagram"),
    true,
  );
  assert.equal(
    areaQuestion?.contentBlocks.some((block) => block.kind === "space"),
    true,
  );

  const distributionQuestion = questions[3];
  assert.equal(
    distributionQuestion?.contentBlocks.some((block) => block.kind === "choices"),
    true,
  );
  assert.equal(
    distributionQuestion?.contentBlocks.some((block) => block.kind === "diagram"),
    true,
  );
});
