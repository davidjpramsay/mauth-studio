import assert from "node:assert/strict";
import test from "node:test";

import {
  GRAPH3D_BOARD_BOUNDING_BOX,
  GRAPH3D_VIEW_ORIGIN,
  GRAPH3D_VIEW_SIZE,
  graph3dAxesVisible,
  graph3dAxisLabelsVisible,
  graph3dCircularSilhouetteAngles,
  graph3dDimensionDisplay,
  graph3dDimensionFaceRightAngleMarkerPoints,
  graph3dDimensionLabelScreenOffset,
  graph3dDraggedLabelScreenOffset,
  graph3dDimensionTickDirection,
  graph3dDimensionTickEndpoints,
  graph3dEqualScaleRanges,
  graph3dRadialLabelScreenOffset,
  graph3dRightAngleMarkerPoints,
  graph3dSphereCapSilhouetteArc,
  graph3dViewDirection,
  projectGraph3DPoint,
} from "./graph3dPresentation.ts";

const view = { az: 1, el: 0.3, bank: 0 };

test("3D viewport has even board padding on every side", () => {
  const [boardLeft, boardTop, boardRight, boardBottom] = GRAPH3D_BOARD_BOUNDING_BOX;
  const [viewLeft, viewBottom] = GRAPH3D_VIEW_ORIGIN;
  const [viewWidth, viewHeight] = GRAPH3D_VIEW_SIZE;
  assert.equal(viewLeft - boardLeft, boardRight - (viewLeft + viewWidth));
  assert.equal(viewBottom - boardBottom, boardTop - (viewBottom + viewHeight));
  assert.equal(viewLeft - boardLeft, 1);
  assert.equal(viewBottom - boardBottom, 1);
});

test("3D ranges expand to one equal-scale cube without moving their centres", () => {
  assert.deepEqual(
    graph3dEqualScaleRanges([
      [-2, 12],
      [-2, 7],
      [-4, 5],
    ]),
    [
      [-2, 12],
      [-4.5, 9.5],
      [-6.5, 7.5],
    ],
  );
});

test("measurement solids hide axes unless they are explicitly requested", () => {
  assert.equal(graph3dAxesVisible({ type: "graph3d", showAxes: false }, true), false);
  assert.equal(graph3dAxesVisible({ type: "graph3d", showAxes: true }, false), true);
  assert.equal(graph3dAxesVisible({ type: "graph3d" }, false), false);
  assert.equal(graph3dAxesVisible({ type: "graph3d" }, true), true);
  assert.equal(graph3dAxisLabelsVisible({ type: "graph3d", showAxisLabels: false }, true), false);
});

test("circular silhouette generators project to opposite outer edges", () => {
  const [firstAngle, secondAngle] = graph3dCircularSilhouetteAngles([0, 0, 0], [0, 0, 3], 2, view);
  const wrappedDifference = Math.abs(((secondAngle - firstAngle + Math.PI * 2) % (Math.PI * 2)) - Math.PI);
  assert.ok(wrappedDifference < 1e-9);
});

test("camera-facing sphere outline lies in a plane perpendicular to the view direction", () => {
  const direction = graph3dViewDirection(view);
  assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-9);
  const projected = projectGraph3DPoint(direction, view);
  assert.ok(Math.hypot(...projected) < 1e-9);
});

test("hemisphere silhouette keeps only the exposed cap-side half of the sphere outline", () => {
  const arc = graph3dSphereCapSilhouetteArc([0, 0, -1], 3, 0, { az: 5.42399, el: 0.53504, bank: 0 });
  assert.ok(Math.abs(arc.secondAngle - arc.firstAngle - Math.PI) < 1e-9);
});

test("sphere-cap silhouette clipping handles complete and empty camera-facing outlines", () => {
  const alignedView = { az: 0, el: Math.PI / 2, bank: 0 };
  assert.deepEqual(graph3dSphereCapSilhouetteArc([0, 0, -1], 3, 0, alignedView), {
    firstAngle: -Math.PI,
    secondAngle: Math.PI,
  });
  assert.deepEqual(graph3dSphereCapSilhouetteArc([0, 0, -1], 3, 1, alignedView), {
    firstAngle: 0,
    secondAngle: 0,
  });
});

test("dimension ticks project exactly perpendicular to their dimension line", () => {
  const from: [number, number, number] = [0, 0, 0];
  const to: [number, number, number] = [8, 0, 0];
  const tickDirection = graph3dDimensionTickDirection(from, to, view);
  const [tickStart, tickEnd] = graph3dDimensionTickEndpoints(from, tickDirection, 0.5);
  const projectedFrom = projectGraph3DPoint(from, view);
  const projectedTo = projectGraph3DPoint(to, view);
  const projectedTickStart = projectGraph3DPoint(tickStart, view);
  const projectedTickEnd = projectGraph3DPoint(tickEnd, view);
  const dimension = [projectedTo[0] - projectedFrom[0], projectedTo[1] - projectedFrom[1]];
  const tick = [projectedTickEnd[0] - projectedTickStart[0], projectedTickEnd[1] - projectedTickStart[1]];
  const cosine = Math.abs((dimension[0] * tick[0] + dimension[1] * tick[1]) / (Math.hypot(...dimension) * Math.hypot(...tick)));
  assert.ok(cosine < 1e-9);
});

test("dimension ticks remain perpendicular after camera banking", () => {
  const bankedView = { az: 0.72, el: 0.41, bank: 0.63 };
  const from: [number, number, number] = [1, -2, 0.5];
  const to: [number, number, number] = [7, 3, 4];
  const tickDirection = graph3dDimensionTickDirection(from, to, bankedView);
  const [tickStart, tickEnd] = graph3dDimensionTickEndpoints(to, tickDirection, 0.7);
  const projectedFrom = projectGraph3DPoint(from, bankedView);
  const projectedTo = projectGraph3DPoint(to, bankedView);
  const projectedTickStart = projectGraph3DPoint(tickStart, bankedView);
  const projectedTickEnd = projectGraph3DPoint(tickEnd, bankedView);
  const dimension = [projectedTo[0] - projectedFrom[0], projectedTo[1] - projectedFrom[1]];
  const tick = [projectedTickEnd[0] - projectedTickStart[0], projectedTickEnd[1] - projectedTickStart[1]];
  const dot = dimension[0] * tick[0] + dimension[1] * tick[1];
  assert.ok(Math.abs(dot) < 1e-9);
});

test("dimension ticks remain perpendicular with unequal rendered axis scales", () => {
  const screenScale = { x: 360 / 14, y: 230 / 9 };
  const from: [number, number, number] = [0, 6.2, -3];
  const to: [number, number, number] = [8, 6.2, -3];
  const tickDirection = graph3dDimensionTickDirection(from, to, view, screenScale);
  const [tickStart, tickEnd] = graph3dDimensionTickEndpoints(from, tickDirection, 0.7);
  const projectedFrom = projectGraph3DPoint(from, view, screenScale);
  const projectedTo = projectGraph3DPoint(to, view, screenScale);
  const projectedTickStart = projectGraph3DPoint(tickStart, view, screenScale);
  const projectedTickEnd = projectGraph3DPoint(tickEnd, view, screenScale);
  const dimension = [projectedTo[0] - projectedFrom[0], projectedTo[1] - projectedFrom[1]];
  const tick = [projectedTickEnd[0] - projectedTickStart[0], projectedTickEnd[1] - projectedTickStart[1]];
  const dot = dimension[0] * tick[0] + dimension[1] * tick[1];
  assert.ok(Math.abs(dot) < 1e-9);
});

test("dimension display preserves legacy brackets and accepts rotation-safe styles", () => {
  assert.equal(graph3dDimensionDisplay(undefined), "bracket");
  assert.equal(graph3dDimensionDisplay("label"), "label");
  assert.equal(graph3dDimensionDisplay("guide"), "guide");
  assert.equal(graph3dDimensionDisplay("unsupported"), "bracket");
});

test("right-angle markers derive a square from two dimensions with a shared endpoint", () => {
  const marker = graph3dRightAngleMarkerPoints([0, 0, 8], [0, 0, 0], [0, 0, 0], [3, 0, 0]);
  assert.deepEqual(marker?.vertex, [0, 0, 0]);
  assert.deepEqual(marker?.firstArm, [0, 0, 0.54]);
  assert.deepEqual(marker?.corner, [0.54, 0, 0.54]);
  assert.deepEqual(marker?.secondArm, [0.54, 0, 0]);
});

test("right-angle markers require connected dimensions and cap manual size to the shorter arm", () => {
  assert.equal(graph3dRightAngleMarkerPoints([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 2, 0]), null);
  const marker = graph3dRightAngleMarkerPoints([0, 0, 0], [1, 0, 0], [0, 0, 0], [0, 2, 0], 10);
  assert.deepEqual(marker?.firstArm, [0.45, 0, 0]);
  assert.deepEqual(marker?.secondArm, [0, 0.45, 0]);
});

test("line-to-face right-angle markers sit inside a perpendicular face on the corner bisector", () => {
  const face = [
    [0, 0, 0],
    [6, 0, 0],
    [6, 6, 0],
    [0, 6, 0],
  ] as [number, number, number][];
  const marker = graph3dDimensionFaceRightAngleMarkerPoints([0, 0, 10], [0, 0, 0], face);
  assert.deepEqual(marker?.vertex, [0, 0, 0]);
  assert.deepEqual(marker?.firstArm, [0, 0, 1.08]);
  assert.ok(marker);
  assert.ok(marker.secondArm[0] > 0 && marker.secondArm[1] > 0);
  assert.ok(Math.abs(marker.secondArm[0] - marker.secondArm[1]) < 1e-9);
  assert.ok(Math.abs(Math.hypot(marker.secondArm[0], marker.secondArm[1]) - 1.08) < 1e-9);
  assert.deepEqual(marker.corner, [marker.secondArm[0], marker.secondArm[1], 1.08]);
  assert.equal(graph3dDimensionFaceRightAngleMarkerPoints([0, 0, 0], [2, 0, 1], face), null);
  assert.equal(graph3dDimensionFaceRightAngleMarkerPoints([8, 8, 0], [8, 8, 10], face), null);
});

test("edge labels offset perpendicular to the edge and away from the scene centre", () => {
  const offset = graph3dDimensionLabelScreenOffset([40, 20], [140, 20], [90, 80], 12);
  assert.ok(Math.abs(offset[0]) < 1e-9);
  assert.equal(offset[1], -12);
});

test("central guide labels use a stable upward then right tie-break", () => {
  assert.deepEqual(graph3dDimensionLabelScreenOffset([0, 0], [100, 0], [50, 0], 10, 0.62), [0, -10]);
  assert.deepEqual(graph3dDimensionLabelScreenOffset([0, 100], [0, 0], [0, 50], 10, 0.62), [10, 0]);
});

test("radial labels move away from the projected scene centre", () => {
  assert.deepEqual(graph3dRadialLabelScreenOffset([80, 20], [40, 20], 12), [12, 0]);
  const centred = graph3dRadialLabelScreenOffset([40, 20], [40, 20], 10);
  assert.ok(Math.abs(Math.hypot(...centred) - 10) < 1e-9);
  assert.ok(centred[0] > 0 && centred[1] < 0);
});

test("dragged label offsets add pointer movement without accumulating precision noise", () => {
  assert.deepEqual(graph3dDraggedLabelScreenOffset(undefined, 34.126, -18.005), [34.13, -18]);
  assert.deepEqual(graph3dDraggedLabelScreenOffset([12, -4], -2.333, 9.777), [9.67, 5.78]);
});
