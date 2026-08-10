import assert from "node:assert/strict";
import test from "node:test";
import type { FormattingConfig } from "@mauth-studio/shared";

import { DEFAULT_PAGE_FORMAT, pageFormatFromConfig, pageStyle, printPageRule } from "./previewPageFormat.ts";

test("pageFormatFromConfig falls back to the default A4 preview format", () => {
  assert.deepEqual(pageFormatFromConfig(), DEFAULT_PAGE_FORMAT);
});

test("pageFormatFromConfig preserves custom page dimensions and break display", () => {
  const formatting: FormattingConfig = {
    id: "custom",
    page: {
      size: "A4",
      orientation: "portrait",
      widthPx: 700,
      heightPx: 900,
      paddingXPx: 40,
      paddingYPx: 50,
      showPageBreaks: false,
    },
  };

  assert.deepEqual(pageFormatFromConfig(formatting), {
    widthPx: 700,
    heightPx: 900,
    paddingXPx: 40,
    paddingYPx: 50,
    showPageBreaks: false,
  });
});

test("pageStyle publishes scaled preview CSS variables", () => {
  const style = pageStyle(
    {
      widthPx: 700,
      heightPx: 900,
      paddingXPx: 40,
      paddingYPx: 50,
      showPageBreaks: true,
    },
    0.5,
  );

  assert.equal(style["--a4-page-width"], "700px");
  assert.equal(style["--a4-page-height"], "900px");
  assert.equal(style["--a4-page-padding-x"], "40px");
  assert.equal(style["--a4-page-padding-y"], "50px");
  assert.equal(style["--a4-preview-scale"], "0.5");
  assert.equal(style["--a4-preview-page-width"], "350px");
  assert.equal(style["--a4-preview-page-height"], "450px");
  assert.equal(style["--a4-preview-page-gap"], "8px");
  assert.equal(style["--a4-print-content-width"], "186mm");
  assert.equal(style["--a4-print-content-height"], "264mm");
});

test("printPageRule keeps physical print margins aligned with the configured preview padding", () => {
  assert.equal(
    printPageRule({
      widthPx: 793.700787,
      heightPx: 1122.519685,
      paddingXPx: 52,
      paddingYPx: 44,
      showPageBreaks: true,
    }),
    "@page { size: A4; margin: 11.641667mm 13.758333mm; }",
  );
});
