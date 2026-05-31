import type { GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_PENROSE_SCALE_PERCENT, SETS_PENROSE_PRESET } from "./diagramPenrose.ts";

export const DEFAULT_SET_DATA = {
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

export function setSourceData(config: GraphConfig) {
  const data = asRecord(config.data) ?? asRecord(DEFAULT_SET_DATA);
  const objectSets = recordArray(data?.objects).filter((object) => object.type === "set");
  const sets = recordArray(data?.sets);
  const regions = recordArray(data?.regions);
  return {
    universe: asRecord(data?.universe) ?? asRecord(DEFAULT_SET_DATA.universe),
    sets: sets.length ? sets : objectSets.length ? objectSets : (DEFAULT_SET_DATA.sets as Array<Record<string, unknown>>),
    regions: regions.length ? regions : (DEFAULT_SET_DATA.regions as Array<Record<string, unknown>>),
  };
}

function setCountLabel(source?: Record<string, unknown> | null) {
  const value = source?.countLabel ?? source?.count ?? source?.total ?? source?.totalLabel;
  return value === undefined || value === null ? "" : String(value);
}

export function normalizedSetDiagramData(config: GraphConfig) {
  const { universe, sets, regions } = setSourceData(config);
  const leftSet = sets[0] ?? DEFAULT_SET_DATA.sets[0];
  const rightSet = sets[1] ?? DEFAULT_SET_DATA.sets[1];
  const normalizedRegions = DEFAULT_SET_DATA.regions.map((fallback, index) => {
    const source = regions[index] ?? fallback;
    return {
      ...fallback,
      ...source,
      name: penroseIdentifier(source.name, String(fallback.name)),
      label: source.label ?? source.value ?? fallback.label,
      shaded: source.shaded === true || source.shade === true,
    };
  });
  return {
    universe: {
      ...DEFAULT_SET_DATA.universe,
      ...universe,
      name: penroseIdentifier(universe?.name, "U"),
      label: universe?.label ?? "U",
      countLabel: setCountLabel(universe),
    },
    sets: [
      {
        ...DEFAULT_SET_DATA.sets[0],
        ...leftSet,
        name: penroseIdentifier(leftSet.name, "A"),
        label: leftSet.label ?? "A",
        countLabel: setCountLabel(leftSet),
      },
      {
        ...DEFAULT_SET_DATA.sets[1],
        ...rightSet,
        name: penroseIdentifier(rightSet.name, "B"),
        label: rightSet.label ?? "B",
        countLabel: setCountLabel(rightSet),
      },
    ],
    regions: normalizedRegions,
  };
}

function setRegionShadePredicate(region: { shaded?: unknown; shade?: unknown; shadePredicate?: unknown }, index: number) {
  if (region.shaded !== true && region.shade !== true) return null;
  if (typeof region.shadePredicate === "string" && region.shadePredicate.trim()) {
    return penroseIdentifier(region.shadePredicate, "ShadeIntersection");
  }
  if (index === 0) return "ShadeLeftOnly";
  if (index === 1) return "ShadeIntersection";
  if (index === 2) return "ShadeRightOnly";
  return "ShadeOutside";
}

export function generatedSetPenroseSubstance(config: GraphConfig) {
  const { universe, sets, regions } = setSourceData(config);
  const universeName = penroseIdentifier(universe?.name, "U");
  const leftSet = sets[0] ?? DEFAULT_SET_DATA.sets[0];
  const rightSet = sets[1] ?? DEFAULT_SET_DATA.sets[1];
  const leftName = penroseIdentifier(leftSet.name, "A");
  const rightName = penroseIdentifier(rightSet.name, "B");
  const regionEntries = DEFAULT_SET_DATA.regions.map((fallback, index) => {
    const source = regions[index] ?? fallback;
    return {
      name: penroseIdentifier(source.name, fallback.name),
      label: source.label ?? source.value ?? fallback.label,
      shaded: source.shaded === true || source.shade === true,
      shadePredicate: typeof source.shadePredicate === "string" ? source.shadePredicate : undefined,
    };
  });
  const [onlyA, intersection, onlyB, outside] = regionEntries;
  const lines = [
    `Universe ${universeName}`,
    `Set ${leftName}, ${rightName}`,
    `RegionLabel ${regionEntries.map((region) => region.name).join(", ")}`,
    penroseLabelStatement(universeName, universe?.label ?? "U"),
    penroseLabelStatement(leftName, leftSet.label ?? leftName),
    penroseLabelStatement(rightName, rightSet.label ?? rightName),
    ...regionEntries.map((region) => penroseLabelStatement(region.name, region.label)),
    `Venn(${universeName}, ${leftName}, ${rightName})`,
    `LabelsLeftOnly(${onlyA.name}, ${leftName}, ${rightName})`,
    `LabelsIntersection(${intersection.name}, ${leftName}, ${rightName})`,
    `LabelsRightOnly(${onlyB.name}, ${leftName}, ${rightName})`,
    `LabelsOutside(${outside.name}, ${universeName}, ${leftName}, ${rightName})`,
  ];
  regionEntries.forEach((region, index) => {
    const shadePredicate = setRegionShadePredicate(region, index);
    if (!shadePredicate) return;
    if (shadePredicate === "ShadeOutside") {
      lines.push(`${shadePredicate}(${universeName}, ${leftName}, ${rightName})`);
      return;
    }
    lines.push(`${shadePredicate}(${leftName}, ${rightName})`);
  });
  return `${lines.join("\n")}\n`;
}
