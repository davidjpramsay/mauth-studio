import type { GraphConfig } from "@mauth-studio/shared";

export const PENROSE_ORIGINAL_WIDTH = 420;
export const DEFAULT_PENROSE_SCALE_PERCENT = 100;
export const DEFAULT_PENROSE_PRESET = "geometry";
export const SETS_PENROSE_PRESET = "sets";

function defaultPenrosePresetForGraphConfig(graphConfig?: GraphConfig | null) {
  return graphConfig?.type === "setDiagram" ? SETS_PENROSE_PRESET : DEFAULT_PENROSE_PRESET;
}

export function penroseScalePercent(graphConfig?: GraphConfig | null) {
  const scale = Number(graphConfig?.scalePercent ?? graphConfig?.options?.scalePercent);
  return Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_PENROSE_SCALE_PERCENT;
}

export function penrosePreset(graphConfig?: GraphConfig | null) {
  const explicitPreset = graphConfig?.penrosePreset ?? graphConfig?.options?.penrosePreset ?? graphConfig?.options?.preset;
  const stylePreset = graphConfig?.type === "setDiagram" && graphConfig?.style === DEFAULT_PENROSE_PRESET ? undefined : graphConfig?.style;
  const preset = String(explicitPreset ?? stylePreset ?? "");
  return preset === DEFAULT_PENROSE_PRESET || preset === SETS_PENROSE_PRESET ? preset : defaultPenrosePresetForGraphConfig(graphConfig);
}

export function penroseOptions(graphConfig?: GraphConfig | null) {
  const options = { ...(graphConfig?.options ?? {}) };
  delete options.width;
  delete options.height;
  delete options.preset;
  options.scalePercent = penroseScalePercent(graphConfig);
  options.penrosePreset = penrosePreset(graphConfig);
  return options;
}

export function removePenroseSubstanceOverride(config: GraphConfig) {
  const options = { ...penroseOptions(config) };
  delete options.substanceSource;
  return options;
}
