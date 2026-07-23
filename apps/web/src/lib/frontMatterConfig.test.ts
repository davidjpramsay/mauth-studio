import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EXAM_TITLE_PAGE,
  DEFAULT_FRONT_MATTER,
  DEFAULT_INVESTIGATION,
  assessmentTitleText,
  examSectionPresetPatch,
  investigationTotalMarks,
  normalizeExamTitlePage,
  normalizeFrontMatter,
  normalizeInvestigation,
} from "./frontMatterConfig.ts";

test("assessmentTitleText uppercases prose while preserving maths segments", () => {
  assert.equal(assessmentTitleText("Year 10 $x^2$ test"), "YEAR 10 $x^2$ TEST");
  assert.equal(assessmentTitleText("Area $$A=\\pi r^2$$ task"), "AREA $$A=\\pi r^2$$ TASK");
});

test("normalizeFrontMatter keeps worksheet, notes, and investigation titles as authored", () => {
  assert.equal(
    normalizeFrontMatter({ titlePageTemplate: "worksheet", assessmentTitle: "Linear Graphs" })?.assessmentTitle,
    "Linear Graphs",
  );
  assert.equal(normalizeFrontMatter({ titlePageTemplate: "notes", assessmentTitle: "Math Notes" })?.assessmentTitle, "Math Notes");
  assert.equal(
    normalizeFrontMatter({ titlePageTemplate: "investigation", assessmentTitle: "Investigation 1" })?.assessmentTitle,
    "Investigation 1",
  );
});

test("investigation criteria share stable guidance and derive their total from allocations", () => {
  const investigation = normalizeInvestigation({
    criteria: [
      {
        id: "reasoning",
        heading: "Reasoning",
        guidance: "Justify the conclusion.",
        scoringMode: "additive",
        allocations: [
          { id: "r1", marks: 2.4, description: "Uses evidence." },
          { id: "r2", marks: 3, description: "Justifies the conclusion." },
        ],
      },
    ],
  });

  assert.equal(investigation.criteria[0]?.heading, "Reasoning");
  assert.equal(investigation.criteria[0]?.allocations[0]?.marks, 2);
  assert.equal(investigationTotalMarks(investigation), 5);
  assert.equal(investigationTotalMarks(DEFAULT_INVESTIGATION), 20);
});

test("holistic investigation criteria use the highest performance level as the criterion total", () => {
  const investigation = normalizeInvestigation({
    criteria: [
      {
        id: "reasoning",
        heading: "Reasoning",
        guidance: "Justify the conclusion.",
        scoringMode: "holistic",
        allocations: [
          { id: "level-4", marks: 4, description: "Comprehensive reasoning." },
          { id: "level-3", marks: 3, description: "Sound reasoning." },
          { id: "level-2", marks: 2, description: "Some reasoning." },
          { id: "level-1", marks: 1, description: "Limited reasoning." },
        ],
      },
    ],
  });

  assert.equal(investigation.criteria[0]?.scoringMode, "holistic");
  assert.equal(investigationTotalMarks(investigation), 4);
});

test("normalizeFrontMatter uppercases standard test titles and preserves legacy section fields", () => {
  const normalized = normalizeFrontMatter({
    assessmentTitle: "Algebra $x+1$ test",
    showSectionHeading: true,
    sectionHeading: "Calculator free",
  });

  assert.equal(normalized?.assessmentTitle, "ALGEBRA $x+1$ TEST");
  assert.equal(normalized?.showAssessmentSubtitle, true);
  assert.equal(normalized?.assessmentSubtitle, "Calculator free");
});

test("normalizeFrontMatter returns null for invalid front matter", () => {
  assert.equal(normalizeFrontMatter(null), null);
  assert.equal(normalizeFrontMatter("front matter"), null);
});

test("normalizeExamTitlePage infers calculator-assumed preset from legacy section text", () => {
  const exam = normalizeExamTitlePage({
    sectionHeader: "Calculator-assumed",
    supplementaryPageCount: 2.6,
  });

  assert.equal(exam.sectionPreset, "section-two-calculator-assumed");
  assert.equal(exam.supplementaryPageCount, 3);
});

test("examSectionPresetPatch switches section metadata and current structure row", () => {
  const patch = examSectionPresetPatch(DEFAULT_EXAM_TITLE_PAGE, "section-two-calculator-assumed");
  const exam = patch.exam;

  assert.equal(patch.startQuestionNumber, 10);
  assert.equal(patch.assessmentSubtitle, "Section Two:\nCalculator-assumed");
  assert.equal(exam?.sectionPreset, "section-two-calculator-assumed");
  assert.equal(exam?.sectionHeader, "CALCULATOR-ASSUMED");
  assert.deepEqual(
    exam?.structureRows.map((row) => ({ id: row.id, current: row.useCurrentDocument })),
    [
      { id: "section-one", current: false },
      { id: "section-two", current: true },
    ],
  );
});

test("default front matter remains a standard school test", () => {
  assert.equal(DEFAULT_FRONT_MATTER.titlePageTemplate, "standard");
  assert.equal(DEFAULT_FRONT_MATTER.startQuestionNumber, 1);
});
