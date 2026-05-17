import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { GraphConfig } from "@mauth-studio/shared";
import JXG from "jsxgraph";

import { renderMathJaxSvg } from "@/lib/mathjax";
import { GRAPH_LABEL_FONT_CSS, graphLabelAttributes } from "./graphTypography";

const DEFAULT_GRAPH_WIDTH = 680;
const DEFAULT_GRAPH_HEIGHT = 300;
const LABEL_ATTRIBUTES = graphLabelAttributes();
const DEFAULT_3D_VIEW_STATE = {
  az: 1,
  el: 0.3,
  bank: 0,
};
type Point3DCoords = [number, number, number];
type Graph3DPointEntry = {
  id: string;
  label: string;
  coords: Point3DCoords;
  show: boolean;
  color?: string;
};
type Graph3DSegmentEntry = {
  from: string;
  to: string;
  label?: string;
  color?: string;
  dashed?: boolean;
  show: boolean;
};
const AXIS_3D_LABEL_ATTRIBUTES = {
  label: LABEL_ATTRIBUTES,
  ticks3d: { label: LABEL_ATTRIBUTES },
};
const HIDDEN_3D_PLANE_ATTRIBUTES = {
  visible: false,
  mesh3d: { visible: false },
};
const HIDDEN_3D_PLANE_AXIS_ATTRIBUTES = {
  visible: false,
};
const POINT_3D_ATTRIBUTES = {
  fillColor: "#2563eb",
  strokeColor: "#0f172a",
  highlightFillColor: "#60a5fa",
  highlightStrokeColor: "#0f172a",
  size: 4,
  label: LABEL_ATTRIBUTES,
  withLabel: false,
};
const LATEX_3D_LABEL_ATTRIBUTES = {
  ...LABEL_ATTRIBUTES,
  display: "html",
  anchorX: "middle",
  anchorY: "middle",
  fixed: true,
  highlight: false,
};

interface Basic3DViewState {
  az: number;
  el: number;
  bank: number;
}

interface Basic3DSlider {
  Value: () => number;
}

interface Basic3DView {
  create: (type: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown;
  az_slide?: Basic3DSlider;
  el_slide?: Basic3DSlider;
  bank_slide?: Basic3DSlider;
}

function finiteNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finiteTuple3(value: unknown): Point3DCoords | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function graph3dData(graphConfig?: GraphConfig | null) {
  return asRecord(graphConfig?.data) ?? {};
}

function graph3dPoints(graphConfig?: GraphConfig | null): Graph3DPointEntry[] {
  const data = graph3dData(graphConfig);
  const rawPoints = Array.isArray(data.points) ? data.points : Array.isArray(data.vertices) ? data.vertices : [];
  const points = rawPoints.flatMap((rawPoint): Graph3DPointEntry[] => {
    const point = asRecord(rawPoint);
    if (!point) return [];
    const id = stringValue(point.id, stringValue(point.name));
    if (!id) return [];
    const coords =
      finiteTuple3(point.coords) ??
      finiteTuple3(point.coordinates) ??
      finiteTuple3(point.position) ??
      (Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)) && Number.isFinite(Number(point.z))
        ? [Number(point.x), Number(point.y), Number(point.z)]
        : null);
    if (!coords) return [];
    return [
      {
        id,
        label: typeof point.label === "string" ? point.label : id,
        coords,
        show: point.show !== false,
        color: typeof point.color === "string" ? point.color : undefined,
      },
    ];
  });
  return points.length ? points : [{ id: "P", label: "P", coords: [2, 2, 2], show: true }];
}

function graph3dSegments(graphConfig: GraphConfig | null | undefined, pointIds: Set<string>): Graph3DSegmentEntry[] {
  const data = graph3dData(graphConfig);
  const rawSegments = Array.isArray(data.segments) ? data.segments : Array.isArray(data.edges) ? data.edges : [];
  return rawSegments.flatMap((rawSegment): Graph3DSegmentEntry[] => {
    const segment = asRecord(rawSegment);
    if (!segment) return [];
    const pointPair = Array.isArray(segment.points) ? segment.points : undefined;
    const from = stringValue(segment.from, stringValue(pointPair?.[0]));
    const to = stringValue(segment.to, stringValue(pointPair?.[1]));
    if (!from || !to || !pointIds.has(from) || !pointIds.has(to)) return [];
    return [
      {
        from,
        to,
        label: typeof segment.label === "string" ? segment.label : undefined,
        color: typeof segment.color === "string" ? segment.color : undefined,
        dashed: segment.dashed === true || segment.strokeStyle === "dashed",
        show: segment.show !== false,
      },
    ];
  });
}

function rangeFromValue(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const left = Number(value[0]);
  const right = Number(value[1]);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return null;
  return left < right ? [left, right] : [right, left];
}

function rangeFromPoints(points: Graph3DPointEntry[], axisIndex: number, fallback: [number, number]) {
  const values = points.map((point) => point.coords[axisIndex]).filter(Number.isFinite);
  if (!values.length) return fallback;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  if (min === max) return [min - 1, max + 1] as [number, number];
  const pad = Math.max(0.5, (max - min) * 0.15);
  return [Number((min - pad).toFixed(6)), Number((max + pad).toFixed(6))] as [number, number];
}

function graph3dRanges(graphConfig: GraphConfig | null | undefined, points: Graph3DPointEntry[]) {
  const data = graph3dData(graphConfig);
  return [
    rangeFromValue(data.xRange) ?? rangeFromPoints(points, 0, [-5, 5]),
    rangeFromValue(data.yRange) ?? rangeFromPoints(points, 1, [-5, 5]),
    rangeFromValue(data.zRange) ?? rangeFromPoints(points, 2, [-5, 5]),
  ] as [[number, number], [number, number], [number, number]];
}

function roundedViewValue(value: number) {
  return Number(value.toFixed(6));
}

function graph3dViewState(graphConfig?: GraphConfig | null): Basic3DViewState {
  const metadata = graphConfig?.metadata;
  const viewState = metadata && typeof metadata === "object" && "view3d" in metadata ? metadata.view3d : undefined;
  const viewRecord = viewState && typeof viewState === "object" ? (viewState as Record<string, unknown>) : {};
  return {
    az: finiteNumber(viewRecord.az, DEFAULT_3D_VIEW_STATE.az),
    el: finiteNumber(viewRecord.el, DEFAULT_3D_VIEW_STATE.el),
    bank: finiteNumber(viewRecord.bank, DEFAULT_3D_VIEW_STATE.bank),
  };
}

function currentViewState(view: Basic3DView): Basic3DViewState {
  return {
    az: roundedViewValue(finiteNumber(view.az_slide?.Value(), DEFAULT_3D_VIEW_STATE.az)),
    el: roundedViewValue(finiteNumber(view.el_slide?.Value(), DEFAULT_3D_VIEW_STATE.el)),
    bank: roundedViewValue(finiteNumber(view.bank_slide?.Value(), DEFAULT_3D_VIEW_STATE.bank)),
  };
}

function sameViewState(left: Basic3DViewState, right: Basic3DViewState) {
  return left.az === right.az && left.el === right.el && left.bank === right.bank;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function render3DLatexLabel(latex: string) {
  const interactionCss = "pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;";
  try {
    const html = renderMathJaxSvg(latex, false);
    return `<span class="jxg-latex-label" style="${GRAPH_LABEL_FONT_CSS} color:#0f172a;${interactionCss}">${html}</span>`;
  } catch {
    return `<span class="jxg-latex-label" style="${GRAPH_LABEL_FONT_CSS} color:#0f172a;${interactionCss}">${escapeHtml(latex)}</span>`;
  }
}

export function Basic3DGraph({
  graphConfig,
  onGraphConfigChange,
}: {
  graphConfig?: GraphConfig | null;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
}) {
  const boardId = useMemo(() => `jxg-3d-${Math.random().toString(36).slice(2)}`, []);
  const graphConfigRef = useRef(graphConfig);
  const initialViewState = graph3dViewState(graphConfig);
  const initialAz = initialViewState.az;
  const initialEl = initialViewState.el;
  const initialBank = initialViewState.bank;
  const renderSignature = JSON.stringify({
    data: graphConfig?.data ?? null,
    widthPx: graphConfig?.widthPx ?? null,
    heightPx: graphConfig?.heightPx ?? null,
  });

  useLayoutEffect(() => {
    graphConfigRef.current = graphConfig;
  });

  useEffect(() => {
    const persistedViewState = { az: initialAz, el: initialEl, bank: initialBank };
    let commitTimer = 0;
    let lastCommittedViewState = persistedViewState;
    let pointerActive = false;
    const board = JXG.JSXGraph.initBoard(boardId, {
      boundingbox: [-6, 6, 6, -6],
      axis: false,
      showCopyright: false,
      showNavigation: false,
      text: LABEL_ATTRIBUTES,
    } as Record<string, unknown>);
    let view: Basic3DView | null = null;
    const renderGraphConfig = graphConfigRef.current;
    const graphPoints = graph3dPoints(renderGraphConfig);
    const graphRanges = graph3dRanges(renderGraphConfig, graphPoints);

    const commitViewState = () => {
      if (!view || !onGraphConfigChange) return;
      const nextViewState = currentViewState(view);
      if (sameViewState(nextViewState, lastCommittedViewState)) return;
      lastCommittedViewState = nextViewState;
      const currentGraphConfig = graphConfigRef.current;
      onGraphConfigChange({
        ...(currentGraphConfig ?? { type: "graph3d" }),
        type: currentGraphConfig?.type ?? "graph3d",
        metadata: {
          ...(currentGraphConfig?.metadata ?? {}),
          view3d: nextViewState,
        },
      });
    };

    const scheduleViewStateCommit = () => {
      if (!onGraphConfigChange) return;
      if (pointerActive) return;
      window.clearTimeout(commitTimer);
      commitTimer = window.setTimeout(commitViewState, 120);
    };

    const commitViewStateSoon = () => {
      if (!onGraphConfigChange) return;
      pointerActive = false;
      window.clearTimeout(commitTimer);
      commitTimer = window.setTimeout(commitViewState, 0);
    };

    try {
      view = board.create(
        "view3d",
        [
          [-4, -3],
          [8, 8],
          [graphRanges[0], graphRanges[1], graphRanges[2]],
        ],
        {
          az: { slider: { visible: false, start: persistedViewState.az } },
          el: { slider: { visible: false, start: persistedViewState.el } },
          bank: { slider: { visible: false, start: persistedViewState.bank } },
          xAxis: { point2: { name: "", withLabel: false } },
          yAxis: { point2: { name: "", withLabel: false } },
          zAxis: { point2: { name: "", withLabel: false } },
          xAxisBorder: AXIS_3D_LABEL_ATTRIBUTES,
          yAxisBorder: AXIS_3D_LABEL_ATTRIBUTES,
          zAxisBorder: AXIS_3D_LABEL_ATTRIBUTES,
          xPlaneRear: HIDDEN_3D_PLANE_ATTRIBUTES,
          yPlaneRear: HIDDEN_3D_PLANE_ATTRIBUTES,
          zPlaneRear: HIDDEN_3D_PLANE_ATTRIBUTES,
          xPlaneFront: HIDDEN_3D_PLANE_ATTRIBUTES,
          yPlaneFront: HIDDEN_3D_PLANE_ATTRIBUTES,
          zPlaneFront: HIDDEN_3D_PLANE_ATTRIBUTES,
          xPlaneRearYAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          xPlaneRearZAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          xPlaneFrontYAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          xPlaneFrontZAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          yPlaneRearXAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          yPlaneRearZAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          yPlaneFrontXAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          yPlaneFrontZAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          zPlaneRearXAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          zPlaneRearYAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          zPlaneFrontXAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          zPlaneFrontYAxis: HIDDEN_3D_PLANE_AXIS_ATTRIBUTES,
          ticks3d: { label: LABEL_ATTRIBUTES },
        } as Record<string, unknown>,
      ) as unknown as Basic3DView;
      const points = graphPoints;
      const pointMap = new Map(points.map((point) => [point.id, point]));
      const segments = graph3dSegments(renderGraphConfig, new Set(pointMap.keys()));
      const ranges = graphRanges;
      const labelOffset = Math.max(
        0.18,
        Math.max(ranges[0][1] - ranges[0][0], ranges[1][1] - ranges[1][0], ranges[2][1] - ranges[2][0]) * 0.035,
      );

      segments
        .filter((segment) => segment.show)
        .forEach((segment) => {
          const from = pointMap.get(segment.from);
          const to = pointMap.get(segment.to);
          if (!from || !to) return;
          view?.create(
            "curve3d",
            [
              (t: number) => from.coords[0] + t * (to.coords[0] - from.coords[0]),
              (t: number) => from.coords[1] + t * (to.coords[1] - from.coords[1]),
              (t: number) => from.coords[2] + t * (to.coords[2] - from.coords[2]),
              [0, 1],
            ],
            {
              strokeColor: segment.color ?? "#111827",
              strokeWidth: 1.8,
              dash: segment.dashed ? 2 : 0,
              highlight: false,
            },
          );
          if (segment.label?.trim()) {
            const midpoint: Point3DCoords = [
              (from.coords[0] + to.coords[0]) / 2,
              (from.coords[1] + to.coords[1]) / 2,
              (from.coords[2] + to.coords[2]) / 2,
            ];
            view?.create(
              "text3d",
              [[midpoint[0] + labelOffset, midpoint[1] + labelOffset, midpoint[2] + labelOffset], render3DLatexLabel(segment.label)],
              LATEX_3D_LABEL_ATTRIBUTES,
            );
          }
        });

      points
        .filter((point) => point.show)
        .forEach((point) => {
          view?.create("point3d", point.coords, {
            name: point.id,
            ...POINT_3D_ATTRIBUTES,
            fillColor: point.color ?? POINT_3D_ATTRIBUTES.fillColor,
          });
          if (point.label.trim()) {
            view?.create(
              "text3d",
              [
                [point.coords[0] + labelOffset, point.coords[1] + labelOffset, point.coords[2] + labelOffset],
                render3DLatexLabel(point.label),
              ],
              {
                ...LATEX_3D_LABEL_ATTRIBUTES,
                anchorX: "left",
                anchorY: "bottom",
              },
            );
          }
        });
      view.create("text3d", [[ranges[0][1] + labelOffset, 0, 0], render3DLatexLabel("x")], LATEX_3D_LABEL_ATTRIBUTES);
      view.create("text3d", [[0, ranges[1][1] + labelOffset, 0], render3DLatexLabel("y")], LATEX_3D_LABEL_ATTRIBUTES);
      view.create("text3d", [[0, 0, ranges[2][1] + labelOffset], render3DLatexLabel("z")], LATEX_3D_LABEL_ATTRIBUTES);
    } catch {
      board.create("text", [-4.8, 4.8, "3D graph adapter"], LABEL_ATTRIBUTES);
    }

    const eventBoard = board as JXG.Board & {
      on?: (eventName: string, handler: () => void) => void;
      off?: (eventName: string, handler: () => void) => void;
    };
    eventBoard.on?.("update", scheduleViewStateCommit);

    const container = document.getElementById(boardId);
    const handlePointerDown = () => {
      pointerActive = true;
      window.addEventListener("pointerup", commitViewStateSoon, { once: true });
      window.addEventListener("pointercancel", commitViewStateSoon, { once: true });
    };
    container?.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("beforeprint", commitViewState);

    return () => {
      window.clearTimeout(commitTimer);
      eventBoard.off?.("update", scheduleViewStateCommit);
      container?.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", commitViewStateSoon);
      window.removeEventListener("pointercancel", commitViewStateSoon);
      window.removeEventListener("beforeprint", commitViewState);
      JXG.JSXGraph.freeBoard(board);
    };
  }, [boardId, initialAz, initialBank, initialEl, onGraphConfigChange, renderSignature]);

  return (
    <div
      id={boardId}
      className="overflow-hidden bg-white"
      style={{
        height: graphConfig?.heightPx ?? DEFAULT_GRAPH_HEIGHT,
        maxWidth: "100%",
        width: graphConfig?.widthPx ?? DEFAULT_GRAPH_WIDTH,
      }}
    />
  );
}
