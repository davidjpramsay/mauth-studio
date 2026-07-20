import type { GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_PENROSE_SCALE_PERCENT, SETS_PENROSE_PRESET } from "./diagramPenrose.ts";

export const DEFAULT_SET_DATA = {
  setCount: 2,
  universe: { name: "U", label: "U" },
  sets: [
    { type: "set", name: "A", label: "A" },
    { type: "set", name: "B", label: "B" },
  ],
  regions: [
    { name: "onlyA", label: "A \\cap B'" },
    { name: "intersection", label: "A \\cap B" },
    { name: "onlyB", label: "A' \\cap B" },
    { name: "outside", label: "(A \\cup B)'" },
  ],
};

export const DEFAULT_THREE_SET_DATA = {
  setCount: 3,
  universe: { name: "U", label: "U" },
  sets: [
    { type: "set", name: "A", label: "A" },
    { type: "set", name: "B", label: "B" },
    { type: "set", name: "C", label: "C" },
  ],
  regions: [
    { name: "onlyA", label: "A only" },
    { name: "onlyB", label: "B only" },
    { name: "onlyC", label: "C only" },
    { name: "onlyAB", label: "A \\cap B only" },
    { name: "onlyAC", label: "A \\cap C only" },
    { name: "onlyBC", label: "B \\cap C only" },
    { name: "intersection", label: "A \\cap B \\cap C" },
    { name: "outside", label: "(A \\cup B \\cup C)'" },
  ],
};

export const DEFAULT_SET_DIAGRAM: GraphConfig = {
  type: "setDiagram",
  data: DEFAULT_SET_DATA,
  style: SETS_PENROSE_PRESET,
  options: { scalePercent: DEFAULT_PENROSE_SCALE_PERCENT, penrosePreset: SETS_PENROSE_PRESET },
  scalePercent: DEFAULT_PENROSE_SCALE_PERCENT,
  penrosePreset: SETS_PENROSE_PRESET,
  functions: [],
  features: [],
  metadata: {},
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function penroseIdentifier(value: unknown, fallback: string) {
  const source = String(value ?? "").trim();
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(source) ? source : fallback;
}

function penroseLabelValue(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}_%&#])/g, "\\$1");
}

function looksLikePenroseLatex(value: unknown) {
  return /\\|[_^{}]/.test(String(value ?? ""));
}

function penroseLabelStatement(name: string, label?: unknown) {
  if (label === undefined || label === null || label === "") return `Label ${name} $${name}$`;
  const source = String(label);
  if (source.startsWith("$") && source.endsWith("$")) return `Label ${name} ${source}`;
  if (looksLikePenroseLatex(source)) return `Label ${name} $${source}$`;
  return `Label ${name} $${penroseLabelValue(source)}$`;
}

export type SetDiagramSetCount = 2 | 3;

export interface NormalizedSetDiagramRegion extends Record<string, unknown> {
  name: string;
  label: unknown;
  shaded: boolean;
  solutionOnly?: boolean;
}

export interface NormalizedSetDiagramData extends Record<string, unknown> {
  setCount: SetDiagramSetCount;
  universe: Record<string, unknown> & { name: string; label: unknown; countLabel: string };
  sets: Array<Record<string, unknown> & { name: string; label: unknown; countLabel: string }>;
  regions: NormalizedSetDiagramRegion[];
}

export function setDiagramSetCountFromData(data?: Record<string, unknown> | null): SetDiagramSetCount {
  const explicitCount = Number(data?.setCount ?? data?.setsCount ?? data?.vennSetCount);
  if (explicitCount >= 3) return 3;
  const sets = recordArray(data?.sets);
  const objectSets = recordArray(data?.objects).filter((object) => object.type === "set");
  const regions = recordArray(data?.regions);
  return sets.length >= 3 || objectSets.length >= 3 || regions.length >= 8 ? 3 : 2;
}

export function setDiagramRegionEditorLabels(setCount: SetDiagramSetCount) {
  return setCount === 3
    ? ["A only", "B only", "C only", "A and B only", "A and C only", "B and C only", "A and B and C", "Outside"]
    : ["A only", "A and B", "B only", "Outside"];
}

export function setDiagramCountLabels(setCount: SetDiagramSetCount) {
  return setCount === 3 ? ["8", "6", "5", "4", "3", "2", "1", "1"] : ["8", "10", "6", "6"];
}

export function setDiagramSetTotalLabels(setCount: SetDiagramSetCount) {
  return setCount === 3 ? ["16", "13", "11"] : ["18", "16"];
}

function setDiagramRegionDefaults(setCount: SetDiagramSetCount) {
  return setCount === 3 ? DEFAULT_THREE_SET_DATA.regions : DEFAULT_SET_DATA.regions;
}

export function setDiagramRegionNameAt(setCount: SetDiagramSetCount, index: number, fallback?: unknown) {
  return String(setDiagramRegionDefaults(setCount)[index]?.name ?? fallback ?? "");
}

function setDiagramSetDefaults(setCount: SetDiagramSetCount) {
  return setCount === 3 ? DEFAULT_THREE_SET_DATA.sets : DEFAULT_SET_DATA.sets;
}

export function setSourceData(config: GraphConfig) {
  const data = asRecord(config.data) ?? asRecord(DEFAULT_SET_DATA);
  const setCount = setDiagramSetCountFromData(data);
  const defaults = setDiagramSetDefaults(setCount);
  const objectSets = recordArray(data?.objects).filter((object) => object.type === "set");
  const sets = recordArray(data?.sets);
  const regions = recordArray(data?.regions);
  return {
    setCount,
    universe: asRecord(data?.universe) ?? asRecord(DEFAULT_SET_DATA.universe),
    sets: sets.length ? sets : objectSets.length ? objectSets : (defaults as Array<Record<string, unknown>>),
    regions: regions.length ? regions : (setDiagramRegionDefaults(setCount) as Array<Record<string, unknown>>),
  };
}

function setCountLabel(source?: Record<string, unknown> | null) {
  const value = source?.countLabel ?? source?.count ?? source?.total ?? source?.totalLabel;
  return value === undefined || value === null ? "" : String(value);
}

export function normalizedSetDiagramData(config: GraphConfig): NormalizedSetDiagramData {
  const { setCount, universe, sets, regions } = setSourceData(config);
  const setDefaults = setDiagramSetDefaults(setCount);
  const regionDefaults = setDiagramRegionDefaults(setCount);
  const normalizedRegions = regionDefaults.map((fallback, index) => {
    const source = regions[index] ?? fallback;
    return {
      ...fallback,
      ...source,
      name: penroseIdentifier(source.name, String(fallback.name)),
      label: source.label ?? source.value ?? fallback.label,
      shaded: source.shaded === true || source.shade === true,
      solutionOnly: source.solutionOnly === true,
    };
  });
  return {
    setCount,
    universe: {
      ...DEFAULT_SET_DATA.universe,
      ...universe,
      name: penroseIdentifier(universe?.name, "U"),
      label: universe?.label ?? "U",
      countLabel: setCountLabel(universe),
    },
    sets: setDefaults.map((fallback, index) => {
      const source = sets[index] ?? fallback;
      return {
        ...fallback,
        ...source,
        name: penroseIdentifier(source.name, String(fallback.name)),
        label: source.label ?? fallback.label,
        countLabel: setCountLabel(source),
      };
    }),
    regions: normalizedRegions,
  };
}

export function setDiagramNotationLabel(regionName: string, sets: Array<{ name?: string }>) {
  const [leftSet, rightSet, thirdSet] = sets;
  const a = penroseIdentifier(leftSet?.name, "A");
  const b = penroseIdentifier(rightSet?.name, "B");
  const c = penroseIdentifier(thirdSet?.name, "C");
  if (thirdSet) {
    if (regionName === "onlyA") return `${a} \\cap ${b}' \\cap ${c}'`;
    if (regionName === "onlyB") return `${a}' \\cap ${b} \\cap ${c}'`;
    if (regionName === "onlyC") return `${a}' \\cap ${b}' \\cap ${c}`;
    if (regionName === "onlyAB") return `${a} \\cap ${b} \\cap ${c}'`;
    if (regionName === "onlyAC") return `${a} \\cap ${b}' \\cap ${c}`;
    if (regionName === "onlyBC") return `${a}' \\cap ${b} \\cap ${c}`;
    if (regionName === "intersection") return `${a} \\cap ${b} \\cap ${c}`;
    return `(${a} \\cup ${b} \\cup ${c})'`;
  }
  if (regionName === "onlyA") return `${a} \\cap ${b}'`;
  if (regionName === "intersection") return `${a} \\cap ${b}`;
  if (regionName === "onlyB") return `${a}' \\cap ${b}`;
  return `(${a} \\cup ${b})'`;
}

export function generatedSetPenroseSubstance(config: GraphConfig) {
  const { universe, regions } = setSourceData(config);
  const universeName = penroseIdentifier(universe?.name, "U");
  const normalized = normalizedSetDiagramData(config);
  const setEntries = normalized.sets;
  const regionEntries = setDiagramRegionDefaults(normalized.setCount).map((fallback, index) => {
    const source = regions[index] ?? fallback;
    return {
      name: penroseIdentifier(source.name, fallback.name),
      label: source.label ?? source.value ?? fallback.label,
      shaded: source.shaded === true || source.shade === true,
      shadePredicate: typeof source.shadePredicate === "string" ? source.shadePredicate : undefined,
    };
  });
  const lines = [
    `Universe ${universeName}`,
    `Set ${setEntries.map((set) => set.name).join(", ")}`,
    `RegionLabel ${regionEntries.map((region) => region.name).join(", ")}`,
    penroseLabelStatement(universeName, universe?.label ?? "U"),
    ...setEntries.map((set) => penroseLabelStatement(set.name, set.label ?? set.name)),
    ...regionEntries.map((region) => penroseLabelStatement(region.name, region.label)),
  ];
  return `${lines.join("\n")}\n`;
}
