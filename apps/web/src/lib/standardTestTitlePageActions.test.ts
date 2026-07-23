import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_FRONT_MATTER } from "./frontMatterConfig.ts";
import {
  normalizeStandardSectionTitlePage,
  standardSectionTitlePageChange,
  standardSectionTitlePageFrontMatter,
} from "./standardTestTitlePage.ts";

test("standard section title pages inherit shared identity and override page details", () => {
  const heading = {
    title: "Section Two: Calculator-Assumed",
    titlePage: { instructionsBody: "Calculator permitted.", markLabel: "Section mark" },
  };
  const effective = standardSectionTitlePageFrontMatter(DEFAULT_FRONT_MATTER, heading);

  assert.equal(effective.logoId, DEFAULT_FRONT_MATTER.logoId);
  assert.equal(effective.assessmentTitle, DEFAULT_FRONT_MATTER.assessmentTitle);
  assert.equal(effective.assessmentSubtitle, heading.title);
  assert.equal(effective.showAssessmentSubtitle, true);
  assert.equal(effective.instructionsBody, "Calculator permitted.");
  assert.equal(effective.markLabel, "Section mark");
});

test("standard title page edits separate shared identity from page-specific settings", () => {
  const change = standardSectionTitlePageChange(
    { title: "Section One", titlePage: { instructionsTitle: "Conditions" } },
    {
      schoolName: "Shared School",
      assessmentTitle: "Shared Test",
      assessmentSubtitle: "Section Two",
      showInstructions: true,
      instructionsBody: "Use a calculator.",
    },
  );

  assert.deepEqual(change.sharedPatch, { schoolName: "Shared School", assessmentTitle: "Shared Test" });
  assert.deepEqual(change.headingPatch, {
    title: "Section Two",
    titlePage: {
      instructionsTitle: "Conditions",
      showInstructions: true,
      instructionsBody: "Use a calculator.",
    },
  });
});

test("standard title page normalization preserves only supported fields", () => {
  assert.deepEqual(normalizeStandardSectionTitlePage({ showInstructions: false, instructionsBody: "", ignored: "value" }), {
    showInstructions: false,
    instructionsBody: "",
  });
  assert.equal(normalizeStandardSectionTitlePage({ ignored: true }), undefined);
});
