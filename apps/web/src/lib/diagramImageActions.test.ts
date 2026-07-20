import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConfig } from "@mauth-studio/shared";

import {
  createImageAnnotation,
  imageAnnotationAt,
  imageConfigForSolutionVisibility,
  imageConfigHasSolutionOnly,
  imageDiagramAnnotations,
  normalizeImageDiagramAnnotations,
  updateImageAnnotation,
} from "./diagramImage.ts";

function imageConfig(): GraphConfig {
  return {
    type: "image",
    data: {
      src: "data:image/png;base64,abc",
      name: "Triangle",
      annotations: [
        { id: "shared", kind: "label", xPercent: 20, yPercent: 30, text: "$A$", color: "#111827" },
        {
          id: "answer",
          kind: "ellipse",
          xPercent: 60,
          yPercent: 70,
          widthPercent: 20,
          heightPercent: 12,
          color: "#dc2626",
          solutionOnly: true,
        },
      ],
    },
    widthPx: 420,
    heightPx: 260,
  };
}

test("image annotations normalize ids, geometry, and display defaults", () => {
  const annotations = normalizeImageDiagramAnnotations([
    { id: "note", kind: "arrow", xPercent: -2, yPercent: 110, endXPercent: 80, endYPercent: 25 },
    { id: "note", kind: "unknown", xPercent: 40, yPercent: 50 },
  ]);

  assert.deepEqual(
    annotations.map((entry) => ({ id: entry.id, kind: entry.kind, x: entry.xPercent, y: entry.yPercent })),
    [
      { id: "note", kind: "arrow", x: 0, y: 100 },
      { id: "note-2", kind: "label", x: 40, y: 50 },
    ],
  );
  assert.equal(annotations[0]?.show, true);
  assert.equal(annotations[0]?.strokeWidth, 2);
});

test("solutions-mode image annotations default to the solution layer", () => {
  const annotation = createImageAnnotation(imageDiagramAnnotations(imageConfig()), "arrow", true);

  assert.equal(annotation.id, "annotation-3");
  assert.equal(annotation.kind, "arrow");
  assert.equal(annotation.solutionOnly, true);
  assert.equal(annotation.color, "#1d4ed8");
});

test("image visibility hides solution annotations from students and colours only answer annotations in solutions", () => {
  const config = imageConfig();
  const student = imageConfigForSolutionVisibility(config, false, "#1d4ed8");
  const solution = imageConfigForSolutionVisibility(config, true, "#1d4ed8");

  assert.deepEqual(
    imageDiagramAnnotations(student).map((entry) => entry.id),
    ["shared"],
  );
  assert.deepEqual(
    imageDiagramAnnotations(solution).map((entry) => [entry.id, entry.color]),
    [
      ["shared", "#111827"],
      ["answer", "#1d4ed8"],
    ],
  );
  assert.equal(imageConfigHasSolutionOnly(config), true);
});

test("image annotations can be targeted and updated without replacing the image", () => {
  const config = imageConfig();
  const data = updateImageAnnotation(config, { id: "answer" }, { xPercent: 75, widthPercent: 30 });

  assert.ok(data);
  assert.equal(data.src, "data:image/png;base64,abc");
  const updated = { ...config, data };
  assert.equal(imageAnnotationAt(updated, { id: "answer" })?.xPercent, 75);
  assert.equal(imageAnnotationAt(updated, { id: "answer" })?.widthPercent, 30);
  assert.equal(imageAnnotationAt(updated, { id: "shared" })?.text, "$A$");
});
