import type { GraphConfig } from "@mauth-studio/shared";

import { vector2dLabelStyle, vector2dMetadata } from "./diagramVector2d.ts";

export function vector2dInspectorSelection(graphConfig: GraphConfig) {
  return {
    title: "Vector settings" as const,
    labelStyle: vector2dLabelStyle(vector2dMetadata(graphConfig).labelStyle),
    showAxes: graphConfig.showAxes ?? true,
    showGrid: graphConfig.showGrid ?? true,
    showMinorGrid: graphConfig.showMinorGrid ?? false,
    equalScale: graphConfig.equalScale ?? false,
  };
}

export function vector2dAxesVisibilityPatch(graphConfig: GraphConfig, showAxes: boolean): Partial<GraphConfig> {
  return {
    showAxes,
    showArrows: showAxes ? graphConfig.showArrows : false,
  };
}

export function vector2dGridVisibilityPatch(showGrid: boolean): Partial<GraphConfig> {
  return {
    showGrid,
    showMajorGrid: showGrid,
  };
}

export function vector2dMajorGridStepPatch(axis: "x" | "y", value: number | undefined): Partial<GraphConfig> {
  return axis === "x" ? { gridMajorStepX: value, axisLabelStepX: value } : { gridMajorStepY: value, axisLabelStepY: value };
}

export function vector2dMinorGridStepPatch(axis: "x" | "y", value: number | undefined): Partial<GraphConfig> {
  return axis === "x" ? { gridMinorStepX: value } : { gridMinorStepY: value };
}
