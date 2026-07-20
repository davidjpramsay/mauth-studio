import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FORMATTING_CONFIG,
  DEFAULT_NOTES_FORMATTING_CONFIG,
  DEFAULT_WORKSHEET_FORMATTING_CONFIG,
  formattingConfigForPresetId,
  normalizeFormattingConfig,
  normalizePageFormattingConfig,
} from "./editorFormattingConfig.ts";

test("normalizeFormattingConfig falls back to the default test format", () => {
  assert.deepEqual(normalizeFormattingConfig(null), {
    ...DEFAULT_FORMATTING_CONFIG,
    page: DEFAULT_FORMATTING_CONFIG.page,
  });
});

test("normalizeFormattingConfig preserves supported scalar fields and normalizes page settings", () => {
  const normalized = normalizeFormattingConfig({
    id: "exam-booklet",
    showMarks: false,
    marksStyle: "inline",
    questionSpacing: "compact",
    diagramPosition: "side",
    fontSize: "11pt",
    numbering: "alpha",
    sectionHeaders: false,
    page: {
      size: "A4",
      orientation: "landscape",
      widthPx: 900,
      heightPx: 700,
      paddingXPx: 44,
      paddingYPx: 55,
      showPageBreaks: false,
    },
  });

  assert.equal(normalized.id, "exam-booklet");
  assert.equal(normalized.showMarks, false);
  assert.equal(normalized.marksStyle, "inline");
  assert.equal(normalized.questionSpacing, "compact");
  assert.equal(normalized.diagramPosition, "side");
  assert.equal(normalized.fontSize, "11pt");
  assert.equal(normalized.numbering, "alpha");
  assert.equal(normalized.sectionHeaders, false);
  assert.deepEqual(normalized.page, {
    size: "A4",
    orientation: "landscape",
    widthPx: 900,
    heightPx: 700,
    paddingXPx: 44,
    paddingYPx: 55,
    showPageBreaks: false,
  });
});

test("normalizePageFormattingConfig rejects invalid numeric fields individually", () => {
  const normalized = normalizePageFormattingConfig({
    widthPx: Number.NaN,
    heightPx: 800,
    paddingXPx: "wide",
    paddingYPx: 42,
  });

  assert.equal(normalized.widthPx, DEFAULT_FORMATTING_CONFIG.page?.widthPx);
  assert.equal(normalized.heightPx, 800);
  assert.equal(normalized.paddingXPx, DEFAULT_FORMATTING_CONFIG.page?.paddingXPx);
  assert.equal(normalized.paddingYPx, 42);
});

test("formattingConfigForPresetId returns independent worksheet and notes presets", () => {
  const worksheet = formattingConfigForPresetId("worksheet");
  const notes = formattingConfigForPresetId("math-notes");

  assert.deepEqual(worksheet, DEFAULT_WORKSHEET_FORMATTING_CONFIG);
  assert.deepEqual(notes, DEFAULT_NOTES_FORMATTING_CONFIG);

  worksheet.page!.paddingXPx = 999;
  assert.notEqual(DEFAULT_WORKSHEET_FORMATTING_CONFIG.page?.paddingXPx, 999);
});

test("formattingConfigForPresetId keeps unknown ids on the standard shape", () => {
  const custom = formattingConfigForPresetId("exam-booklet");

  assert.equal(custom.id, "exam-booklet");
  assert.equal(custom.showMarks, DEFAULT_FORMATTING_CONFIG.showMarks);
  assert.deepEqual(custom.page, DEFAULT_FORMATTING_CONFIG.page);
});
