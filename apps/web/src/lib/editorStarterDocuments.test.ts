import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import {
  createScreenshotStarterDocumentPlan,
  createNotesSection,
  createQuestion,
  createScreenshotStarterFrontMatter,
  createScreenshotStarterQuestions,
  createTemplateEditorDocumentPlan,
  frontMatterForTemplate,
  isBlankStarterQuestion,
  type ScreenshotStarterRuntime,
} from "./editorStarterDocuments.ts";
import { STARTER_LOGOS, type LogoAsset } from "./logoLibrary.ts";

function createIdFactory() {
  const counters = new Map<string, number>();
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${next}`;
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

test("createScreenshotStarterDocumentPlan creates a complete starter document plan", () => {
  const plan = createScreenshotStarterDocumentPlan(createRuntime());

  assert.equal(plan.document.frontMatter.assessmentTitle, "TEST 2");
  assert.equal(plan.document.questions.length, 4);
  assert.deepEqual(plan.document.sectionHeadings, []);
  assert.deepEqual(
    plan.document.documentFlow,
    plan.document.questions.map((question) => ({ kind: "question", id: question.id })),
  );
  assert.equal(plan.document.formattingConfig.id, "high-school-mathematics-test");
  assert.equal(plan.activeQuestionId, plan.document.questions[0]?.id);
  assert.equal(plan.anchor, `q:${plan.activeQuestionId}`);
});

test("frontMatterForTemplate returns cloned template front matter", () => {
  const examFrontMatter = frontMatterForTemplate("exam");
  const freshExamFrontMatter = frontMatterForTemplate("exam");
  examFrontMatter.assessmentTitle = "Changed";

  assert.equal(examFrontMatter.titlePageTemplate, "exam");
  assert.equal(frontMatterForTemplate("worksheet").titlePageTemplate, "worksheet");
  assert.equal(frontMatterForTemplate("notes").titlePageTemplate, "notes");
  assert.equal(frontMatterForTemplate("investigation").titlePageTemplate, "investigation");
  assert.equal(frontMatterForTemplate("standard").titlePageTemplate, "standard");
  assert.notEqual(freshExamFrontMatter.assessmentTitle, "Changed");
});

test("createTemplateEditorDocumentPlan preserves logo context and records a clean fingerprint", () => {
  const logos: LogoAsset[] = [
    {
      id: "custom-logo",
      name: "Custom School",
      src: "/custom.svg",
      schoolName: "CUSTOM SCHOOL",
    },
  ];
  const fingerprintCalls: Array<{
    template: string;
    questionCount: number;
    formattingId: string;
    logoId: string | undefined;
    flowCount: number;
  }> = [];

  const plan = createTemplateEditorDocumentPlan({
    template: "notes",
    formatPresetId: "math-notes",
    id: createIdFactory(),
    logos,
    currentFrontMatter: { ...createScreenshotStarterFrontMatter(), logoId: "custom-logo", schoolName: "Old School" },
    editorDocumentFingerprint: (frontMatter, questions, formattingConfig, logo, _sectionHeadings, documentFlow) => {
      fingerprintCalls.push({
        template: frontMatter.titlePageTemplate,
        questionCount: questions.length,
        formattingId: formattingConfig.id,
        logoId: logo?.id,
        flowCount: documentFlow?.length ?? 0,
      });
      return "clean-fingerprint";
    },
  });

  assert.equal(plan.document.frontMatter.titlePageTemplate, "notes");
  assert.equal(plan.document.frontMatter.logoId, "custom-logo");
  assert.equal(plan.document.frontMatter.schoolName, "CUSTOM SCHOOL");
  assert.equal(plan.document.questions[0]?.section, "Introduction");
  assert.equal(plan.document.formattingConfig.id, "math-notes");
  assert.equal(plan.cleanFingerprint, "clean-fingerprint");
  assert.equal(plan.anchor, `q:${plan.activeQuestionId}`);
  assert.deepEqual(fingerprintCalls, [
    {
      template: "notes",
      questionCount: 1,
      formattingId: "math-notes",
      logoId: "custom-logo",
      flowCount: 1,
    },
  ]);

  const standardPlan = createTemplateEditorDocumentPlan({
    template: "standard",
    id: createIdFactory(),
    logos: STARTER_LOGOS,
    currentFrontMatter: { ...createScreenshotStarterFrontMatter(), logoId: "missing-logo", schoolName: "Fallback" },
    editorDocumentFingerprint: () => "standard-fingerprint",
  });
  assert.deepEqual(standardPlan.document.questions, []);
  assert.deepEqual(standardPlan.document.documentFlow, []);
  assert.equal(standardPlan.activeQuestionId, "");
  assert.equal(standardPlan.anchor, "");
  assert.equal(standardPlan.document.formattingConfig.id, "high-school-mathematics-test");
});

test("new tests, exams, worksheets, and investigations start without questions", () => {
  for (const template of ["standard", "exam", "worksheet", "investigation"] as const) {
    const plan = createTemplateEditorDocumentPlan({
      template,
      id: createIdFactory(),
      logos: STARTER_LOGOS,
      currentFrontMatter: createScreenshotStarterFrontMatter(),
      editorDocumentFingerprint: () => `${template}-fingerprint`,
    });

    assert.deepEqual(plan.document.questions, []);
    assert.deepEqual(plan.document.documentFlow, []);
    assert.equal(plan.activeQuestionId, "");
    assert.equal(plan.anchor, "");
    if (template === "investigation") {
      assert.equal(plan.document.formattingConfig.id, "investigation");
      assert.equal(plan.document.frontMatter.investigation?.criteria.length, 4);
    }
  }
});
