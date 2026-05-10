import { useEffect, useMemo, useRef } from "react";
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

  useEffect(() => {
    graphConfigRef.current = graphConfig;
  }, [graphConfig]);

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
          [
            [-5, 5],
            [-5, 5],
            [-5, 5],
          ],
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
      view.create("point3d", [2, 2, 2], { name: "P", ...POINT_3D_ATTRIBUTES });
      view.create("text3d", [[2.35, 2.35, 2.35], render3DLatexLabel("P")], {
        ...LATEX_3D_LABEL_ATTRIBUTES,
        anchorX: "left",
        anchorY: "bottom",
      });
      view.create("text3d", [[5.35, 0, 0], render3DLatexLabel("x")], LATEX_3D_LABEL_ATTRIBUTES);
      view.create("text3d", [[0, 5.35, 0], render3DLatexLabel("y")], LATEX_3D_LABEL_ATTRIBUTES);
      view.create("text3d", [[0, 0, 5.35], render3DLatexLabel("z")], LATEX_3D_LABEL_ATTRIBUTES);
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
  }, [boardId, initialAz, initialBank, initialEl, onGraphConfigChange]);

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
