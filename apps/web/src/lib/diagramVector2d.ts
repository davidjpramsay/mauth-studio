import type { GraphConfig } from "@mauth-studio/shared";

export type Vector2DLabelStyle = "boldLower" | "arrow" | "custom";

export type Vector2DControlEntry = {
  id: string;
  name: string;
  label: string;
  start: [number, number];
  components: [number, number];
  color: string;
  showComponents: boolean;
  labelX?: number;
  labelY?: number;
};

export const VECTOR_2D_COLORS = ["#0f766e", "#b45309", "#1d4ed8", "#be123c", "#7c3aed"];

export const DEFAULT_VECTOR_2D_METADATA = {
  vector2d: {
    labelStyle: "boldLower",
    vectors: [
      { id: "a", name: "a", label: "", start: [0, 0], components: [2, 3], color: VECTOR_2D_COLORS[0], showComponents: false },
      { id: "b", name: "b", label: "", start: [0, 0], components: [4, -3], color: VECTOR_2D_COLORS[1], showComponents: false },
    ],
  },
};

export const DEFAULT_VECTOR_2D_GRAPH: GraphConfig = {
  type: "vector2d",
  expression: "x^2 - 5*x + 6",
  latex: "x^2 - 5x + 6",
  functions: [],
  features: [],
  xMin: -1,
  xMax: 6,
  yMin: -4,
  yMax: 4,
  widthPx: 520,
  heightPx: 320,
  lockAspectRatio: false,
  equalScale: false,
  showGrid: true,
  showMajorGrid: true,
  showMinorGrid: false,
  showGridBorder: false,
  showAxes: true,
  showArrows: true,
  showAxisLabels: true,
  showAxisNumbers: true,
  axisLabelIntervalMode: "auto",
  axisLabelStepX: undefined,
  axisLabelStepY: undefined,
  axisLabelMinSpacingPx: 48,
  showFunctionArrows: true,
  gridMajorStep: 1,
  gridMinorStep: 0.5,
  gridMajorStepX: 1,
  gridMajorStepY: 1,
  gridMinorStepX: 0.5,
  gridMinorStepY: 0.5,
  gridMajorColor: "#b9b9b9",
  gridMinorColor: "#dddddd",
  axisExtensionMode: "auto",
  functionExtensionMode: "auto",
  axisExtension: 0.5,
  functionExtension: 0.25,
  functionExtensionLeft: 0.25,
  functionExtensionRight: 0.25,
  metadata: DEFAULT_VECTOR_2D_METADATA,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finiteVectorNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function vectorPair(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value)) return fallback;
  return [finiteVectorNumber(value[0], fallback[0]), finiteVectorNumber(value[1], fallback[1])];
}

function finiteOptionalVectorNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export function vector2dMetadata(config?: GraphConfig | null) {
  const metadata = config?.metadata ?? {};
  const vector2d = asRecord(metadata.vector2d) ?? {};
  return vector2d;
}

export function vector2dLabelStyle(value: unknown, fallback: Vector2DLabelStyle = "boldLower"): Vector2DLabelStyle {
  return value === "boldLower" || value === "arrow" || value === "custom" ? value : fallback;
}

export function defaultVector2DName(index: number, labelStyle: Vector2DLabelStyle) {
  if (labelStyle === "arrow") {
    const arrowNames = ["AB", "CD", "EF", "GH", "PQ", "RS", "UV", "WX"];
    return arrowNames[index] ?? `AB_${index + 1}`;
  }

  if (index >= 0 && index < 26) return String.fromCharCode(97 + index);
  return `v_${index + 1}`;
}

export function normalizedVector2DEntries(config: GraphConfig): Vector2DControlEntry[] {
  const vector2d = vector2dMetadata(config);
  const rawVectors = Array.isArray(vector2d.vectors)
    ? vector2d.vectors
    : Array.isArray(config.metadata?.vectors)
      ? config.metadata.vectors
      : undefined;

  if (rawVectors?.length) {
    return rawVectors.map((entry, index) => {
      const record = asRecord(entry) ?? {};
      const fallback = DEFAULT_VECTOR_2D_METADATA.vector2d.vectors[index % DEFAULT_VECTOR_2D_METADATA.vector2d.vectors.length];
      const name = String(record.name ?? record.id ?? fallback.name);
      return {
        id: String(record.id ?? name ?? `v${index + 1}`),
        name,
        label: String(record.label ?? ""),
        start: vectorPair(record.start, fallback.start as [number, number]),
        components: vectorPair(record.components ?? record.vector, fallback.components as [number, number]),
        color: String(record.color ?? VECTOR_2D_COLORS[index % VECTOR_2D_COLORS.length]),
        showComponents: record.showComponents === true,
        labelX: finiteOptionalVectorNumber(record.labelX),
        labelY: finiteOptionalVectorNumber(record.labelY),
      };
    });
  }

  if (Array.isArray(config.metadata?.vector)) {
    return [
      {
        id: "a",
        name: "a",
        label: "",
        start: [0, 0],
        components: vectorPair(config.metadata.vector, [2, 3]),
        color: VECTOR_2D_COLORS[0],
        showComponents: false,
      },
    ];
  }

  return DEFAULT_VECTOR_2D_METADATA.vector2d.vectors.map((vector) => ({
    ...vector,
    start: vector.start as [number, number],
    components: vector.components as [number, number],
  }));
}

export function vector2dMetadataFromEntries(config: GraphConfig, vectors: Vector2DControlEntry[]) {
  return {
    ...(config.metadata ?? {}),
    vector2d: {
      ...vector2dMetadata(config),
      vectors,
    },
  };
}
