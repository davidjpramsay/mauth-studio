import assert from "node:assert/strict";
import test from "node:test";

import { previewFitScaleForViewport, previewMaxZoomForViewport } from "./previewZoom.ts";

const A4_PAGE_WIDTH_PX = 793.700787;

test("preview zoom can fill the remaining pane width while authoring tools are visible", () => {
  const previewFitScale = previewFitScaleForViewport(2000, A4_PAGE_WIDTH_PX);

  assert.equal(previewFitScale, 1);
  const maxZoom = previewMaxZoomForViewport({
    viewportWidth: 2000,
    pageWidth: A4_PAGE_WIDTH_PX,
    previewFitScale,
  });

  assert.equal(maxZoom, 2.5198);
  assert.ok(Math.abs(A4_PAGE_WIDTH_PX * previewFitScale * maxZoom - 2000) < 0.1);
});

test("preview maximum follows the width left beside the editor or inspector", () => {
  const previewFitScale = previewFitScaleForViewport(900, A4_PAGE_WIDTH_PX);
  const maxZoom = previewMaxZoomForViewport({
    viewportWidth: 900,
    pageWidth: A4_PAGE_WIDTH_PX,
    previewFitScale,
  });

  assert.equal(maxZoom, 1.1339);
  assert.ok(Math.abs(A4_PAGE_WIDTH_PX * previewFitScale * maxZoom - 900) < 0.1);
});

test("preview zoom preserves the existing narrow-pane zoom range", () => {
  const previewFitScale = previewFitScaleForViewport(440, A4_PAGE_WIDTH_PX);

  assert.equal(previewFitScale, 0.55);
  assert.equal(previewMaxZoomForViewport({ viewportWidth: 440, pageWidth: A4_PAGE_WIDTH_PX, previewFitScale }), 1.0079);
});
