import assert from "node:assert/strict";
import test from "node:test";

import { imageInspectorDimensionPatch, imageInspectorSelection } from "./imageInspectorSelection.ts";

test("image inspector selection normalizes metadata and dimensions", () => {
  const selection = imageInspectorSelection({
    type: "image",
    data: {
      src: "data:image/png;base64,abc",
      name: "Triangle",
      alt: "A right-angled triangle",
      mimeType: "image/png",
      naturalWidth: 800,
      naturalHeight: 600,
    },
    widthPx: 360,
    heightPx: 220,
  });

  assert.equal(selection.title, "Image settings");
  assert.equal(selection.data.name, "Triangle");
  assert.equal(selection.data.alt, "A right-angled triangle");
  assert.equal(selection.data.naturalWidth, 800);
  assert.equal(selection.widthPx, 360);
  assert.equal(selection.heightPx, 220);
});

test("image inspector selection and dimension patches preserve current fallbacks", () => {
  const selection = imageInspectorSelection({ type: "image", data: { name: 12, alt: null }, widthPx: 0, heightPx: "bad" });

  assert.equal(selection.data.name, "");
  assert.equal(selection.data.alt, "");
  assert.equal(selection.widthPx, 420);
  assert.equal(selection.heightPx, 260);
  assert.deepEqual(imageInspectorDimensionPatch("widthPx", "480"), { widthPx: 480 });
  assert.deepEqual(imageInspectorDimensionPatch("heightPx", ""), { heightPx: 260 });
});
