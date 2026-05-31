import type { GraphConfig } from "@mauth-studio/shared";

export const DEFAULT_3D_VIEW_STATE = {
  az: 1,
  el: 0.3,
  bank: 0,
};

export type Graph3DViewState = typeof DEFAULT_3D_VIEW_STATE;

export const DEFAULT_3D_GRAPH: GraphConfig = {
  type: "graph3d",
  widthPx: 420,
  heightPx: 320,
  functions: [],
  features: [],
  metadata: {
    view3d: DEFAULT_3D_VIEW_STATE,
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finiteNumberOrDefault(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function graph3dViewState(config: GraphConfig): Graph3DViewState {
  const viewRecord = asRecord(config.metadata?.view3d) ?? {};
  return {
    az: finiteNumberOrDefault(viewRecord.az, DEFAULT_3D_VIEW_STATE.az),
    el: finiteNumberOrDefault(viewRecord.el, DEFAULT_3D_VIEW_STATE.el),
    bank: finiteNumberOrDefault(viewRecord.bank, DEFAULT_3D_VIEW_STATE.bank),
  };
}
