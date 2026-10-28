import test from "node:test";
import assert from "node:assert/strict";
import { renderGeometricConstructionDiagram as render } from "../src/index.mjs";
import { presentPenroseLabels } from "../src/labelPresentation.ts";
import { networkComparisonFixtures as fixtures } from "../fixtures/network-comparison.mjs";
import { boxesOverlap, segmentHitsBox, segmentsCross } from "../src/networkLayout.mjs";

test("crossing and rectangular collision checks distinguish shared endpoints and clear labels", () => {
  assert.equal(segmentsCross([0, 0], [10, 10], [0, 10], [10, 0]), true);
  assert.equal(segmentsCross([0, 0], [10, 10], [0, 0], [10, 0]), false);
  assert.equal(segmentHitsBox([0, 0], [10, 10], { x: 4, y: 4, w: 2, h: 2 }), true);
  assert.equal(segmentHitsBox([0, 0], [10, 0], { x: 4, y: 4, w: 2, h: 2 }), false);
  assert.equal(boxesOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 3, y: 3, w: 2, h: 2 }), false);
});

test("five-node network resamples keep weights attached and labels clear across deterministic seeds", async () => {
  const original = structuredClone(fixtures.showcase);
  for (let i = 0; i < 12; i++) {
    const spec = { ...original, options: { variation: `network-regression-${i}`, scalePercent: [75, 100, 150][i % 3] } };
    const out = await render(spec);
    assert.equal(out.metadata.constraintValidation.status, "satisfied");
    assert.equal(out.metadata.networkLayout.labelCollisions, 0, `seed ${i}`);
    assert.equal(out.metadata.networkLayout.ambiguousWeights, 0, `seed ${i}`);
    assert.equal(out.metadata.networkLayout.nodeEdgeObstructions, 0, `seed ${i}`);
    assert.equal(out.metadata.networkLayout.clippedLabels, 0, `seed ${i}`);
    assert.equal(out.metadata.labelIds.length, 12);
  }
  assert.deepEqual(fixtures.showcase, original);
});

test("automatic label placement is deterministic and survives manual presentation without moving geometry", async () => {
  const spec = { ...fixtures.directedLoop, options: { variation: "loop-label-regression" } };
  const first = await render(spec),
    second = await render(spec);
  assert.equal(first.svg, second.svg);
  const moved = presentPenroseLabels(first.svg, { "A.labelText": [12, -5] });
  const parse = (svg) => new DOMParser().parseFromString(svg, "image/svg+xml");
  const geometry = (svg) => [...parse(svg).querySelectorAll("circle, line, polygon")].map((n) => n.outerHTML);
  assert.deepEqual(geometry(moved.svg), geometry(first.svg));
  const base = (svg) => parse(svg).querySelector('[data-mauth-penrose-label="A.labelText"] > g').getAttribute("transform");
  assert.equal(base(moved.svg), base(first.svg));
  assert.match(parse(moved.svg).querySelector('[data-mauth-penrose-label="A.labelText"]').getAttribute("transform"), /12, -5/);
  assert.equal(presentPenroseLabels(moved.svg, {}).svg, first.svg);
});

test("Advanced Substance works while custom Style remains authoritative", async () => {
  const base = await render({ ...fixtures.showcase, options: { variation: "advanced-baseline" } });
  const advanced = await render({ type: "network", options: { variation: "advanced-network", substanceSource: base.metadata.substance } });
  assert.equal(advanced.metadata.labelIds.length, 12);
  assert.equal(advanced.metadata.networkLayout.labelCollisions, 0);
  const custom = await render({
    type: "network",
    options: { variation: "advanced-network", substanceSource: base.metadata.substance, styleSource: base.metadata.styleSource },
  });
  assert.equal(custom.metadata.networkLayout, undefined);
  assert.equal(custom.metadata.styleSource, base.metadata.styleSource);
});
