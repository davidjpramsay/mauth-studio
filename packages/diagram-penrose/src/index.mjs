import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile, optimize, showError, toSVG } from "@penrose/core";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window ??= dom.window;
globalThis.document ??= dom.window.document;
globalThis.DOMParser ??= dom.window.DOMParser;
globalThis.XMLSerializer ??= dom.window.XMLSerializer;

const canvasPrototype = dom.window.HTMLCanvasElement?.prototype;
if (canvasPrototype) {
  canvasPrototype.getContext = function getContext(type) {
    if (type !== "2d") return null;
    return {
      font: `${TEST_TEXT_FONT_SIZE_PX}px Inter`,
      textBaseline: "alphabetic",
      measureText(text) {
        const fontSize = Number(String(this.font).match(/([0-9.]+)px/)?.[1] ?? TEST_TEXT_FONT_SIZE_PX);
        return {
          width: String(text ?? "").length * fontSize * 0.56,
          actualBoundingBoxAscent: fontSize * 0.8,
          actualBoundingBoxDescent: fontSize * 0.2,
        };
      },
    };
  };
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(MODULE_DIR, "..");
const DOMAIN_PATH = resolve(PACKAGE_ROOT, "domain", "geometry.domain");
const STYLE_PATH = resolve(PACKAGE_ROOT, "style", "school.style");
const SETS_DOMAIN_PATH = resolve(PACKAGE_ROOT, "domain", "sets.domain");
const SETS_STYLE_PATH = resolve(PACKAGE_ROOT, "style", "sets.style");
const PENROSE_PRESETS = {
  geometry: {
    domainPath: DOMAIN_PATH,
    stylePath: STYLE_PATH,
    label: "Geometry",
  },
  sets: {
    domainPath: SETS_DOMAIN_PATH,
    stylePath: SETS_STYLE_PATH,
    label: "Sets",
  },
};
const PRESET_ALIASES = {
  school: "geometry",
  geometricConstruction: "geometry",
  set: "sets",
  sets: "sets",
  setDiagram: "sets",
};

const IDENTIFIER_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const DEFAULT_CANVAS_WIDTH = 420;
const DEFAULT_CANVAS_HEIGHT = 300;
const TEST_TEXT_FONT_SIZE_PX = 13.333;
const SVG_CROP_PADDING = 24;
const MIN_CROPPED_DIMENSION = 80;
const PENROSE_DIAGRAM_TYPES = new Set(["geometricConstruction", "vectorRelationship", "setDiagram"]);

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER_RE.test(value)) {
    throw new Error(`${label} must be a Penrose identifier`);
  }
  return value;
}

function escapeLatex(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}_%&#])/g, "\\$1");
}

function looksLikeLatex(value) {
  return /\\|[_^{}]/.test(String(value ?? ""));
}

function labelStatement(name, label) {
  if (label === undefined || label === null || label === "") return `Label ${name} $${name}$`;
  const source = String(label);
  if (source.startsWith("$") && source.endsWith("$")) return `Label ${name} ${source}`;
  if (looksLikeLatex(source)) return `Label ${name} $${source}$`;
  return `Label ${name} $${escapeLatex(source)}$`;
}

function relationshipPointNames(relation) {
  const pointSources = [relation?.points, relation?.between, relation?.first, relation?.second, relation?.segmentA, relation?.segmentB];
  const points = pointSources.flatMap((source) => (Array.isArray(source) ? source : []));
  [relation?.a, relation?.at, relation?.b, relation?.c].forEach((point) => {
    if (typeof point === "string") points.push(point);
  });
  [relation?.p, relation?.q].forEach((point) => {
    if (typeof point === "string") points.push(point);
  });
  if (Array.isArray(relation?.segments)) {
    relation.segments.forEach((segment) => {
      if (Array.isArray(segment)) points.push(...segment);
    });
  }
  return points.filter((point) => typeof point === "string");
}

function uniquePoints(spec) {
  const points = new Map();
  for (const object of spec?.data?.objects ?? []) {
    if (object?.type !== "point") continue;
    const name = assertIdentifier(object.name, "Point name");
    points.set(name, { ...object, name });
  }

  for (const relation of spec?.data?.relationships ?? []) {
    if (
      relation?.type === "triangle" ||
      relation?.type === "segment" ||
      relation?.type === "vectorSegment" ||
      relation?.type === "labelLength" ||
      relation?.type === "equalLength" ||
      relation?.type === "angleMark" ||
      relation?.type === "labelAngle"
    ) {
      for (const name of relationshipPointNames(relation)) {
        const pointName = assertIdentifier(name, "Relationship point");
        if (!points.has(pointName)) points.set(pointName, { type: "point", name: pointName });
      }
    }
  }

  return [...points.values()];
}

export function specToSubstance(spec) {
  const points = uniquePoints(spec);
  if (!points.length) throw new Error("A geometricConstruction diagram needs at least one point");

  const isVectorRelationship = spec?.type === "vectorRelationship";
  const hideVectorPoints = isVectorRelationship && spec?.data?.hidePoints === true;
  const hideVectorPointLabels = isVectorRelationship && spec?.data?.hidePointLabels === true;
  const lines = [`Point ${points.map((point) => point.name).join(", ")}`];
  points.forEach((point) => {
    const hideLabel = point.hideLabel === true || point.showLabel === false || hideVectorPointLabels;
    lines.push(labelStatement(point.name, hideLabel ? "\\," : (point.label ?? point.name)));
  });
  points.forEach((point) => {
    if (point.hidePoint === true || point.hidden === true || point.showPoint === false || hideVectorPoints) {
      lines.push(`HidePoint(${point.name})`);
    }
  });
  const namedSegments = namedSegmentEntries(spec);
  if (namedSegments.length) lines.push(`NamedSegment ${namedSegments.map((segment) => segment.name).join(", ")}`);
  const lengthLabels = lengthLabelEntries(spec);
  const segmentLabels = segmentLabelEntries(spec);
  const angleLabels = angleLabelEntries(spec);
  const labelDeclarations = [
    ...lengthLabels.map((_, index) => `sideLabel${index + 1}`),
    ...segmentLabels.map((_, index) => `segmentLabel${index + 1}`),
    ...angleLabels.map((_, index) => `angleLabel${index + 1}`),
  ];
  if (labelDeclarations.length) lines.push(`LengthLabel ${labelDeclarations.join(", ")}`);

  for (const relation of spec?.data?.relationships ?? []) {
    if (relation?.type === "triangle") {
      const names = relation.points ?? [];
      if (names.length !== 3) throw new Error("triangle relationship requires exactly three points");
      lines.push(`Triangle(${names.map((name) => assertIdentifier(name, "Triangle point")).join(", ")})`);
    }
    if (relation?.type === "rightAngle") {
      const ordered = rightAnglePoints(relation, spec);
      if (ordered) lines.push(`RightAngle(${ordered.join(", ")})`);
    }
    if (relation?.type === "equalLength") {
      const first = relation.first ?? relation.segmentA ?? relation.segments?.[0];
      const second = relation.second ?? relation.segmentB ?? relation.segments?.[1];
      if (Array.isArray(first) && Array.isArray(second) && first.length === 2 && second.length === 2) {
        const predicate = equalLengthPredicate(markCount(relation.marks ?? relation.markCount ?? relation.tickCount ?? relation.count));
        lines.push(`${predicate}(${[...first, ...second].map((name) => assertIdentifier(name, "Equal length point")).join(", ")})`);
      } else {
        const segmentNames = relation.segmentNames ?? [first, second];
        if (Array.isArray(segmentNames) && segmentNames.length === 2 && segmentNames.every((name) => typeof name === "string")) {
          const predicate = equalNamedLengthPredicate(
            markCount(relation.marks ?? relation.markCount ?? relation.tickCount ?? relation.count),
          );
          lines.push(`${predicate}(${segmentNames.map((name) => assertIdentifier(name, "Equal segment name")).join(", ")})`);
        }
      }
    }
    if (relation?.type === "segment") {
      const names = relation.points ?? relation.between ?? [];
      if (typeof relation.name === "string" && names.length === 2) {
        lines.push(
          `Segment(${assertIdentifier(relation.name, "Segment name")}, ${assertIdentifier(names[0], "Segment start point")}, ${assertIdentifier(
            names[1],
            "Segment end point",
          )})`,
        );
      }
    }
    if (relation?.type === "vectorSegment") {
      const names = relation.points ?? relation.between ?? [];
      if (typeof relation.name === "string" && names.length === 2) {
        lines.push(
          `VectorSegment(${assertIdentifier(relation.name, "Segment name")}, ${assertIdentifier(
            names[0],
            "Segment start point",
          )}, ${assertIdentifier(names[1], "Segment end point")})`,
        );
      }
    }
    if (relation?.type === "angleMark") {
      const points = anglePoints(relation);
      if (points) {
        const predicate = angleMarkPredicate(markCount(relation.marks ?? relation.markCount ?? relation.arcCount ?? relation.count));
        lines.push(`${predicate}(${points.join(", ")})`);
      }
    }
  }
  lengthLabels.forEach((entry, index) => {
    const labelName = `sideLabel${index + 1}`;
    lines.push(labelStatement(labelName, entry.value));
    lines.push(`LabelsSegment(${labelName}, ${entry.a}, ${entry.b})`);
  });
  segmentLabels.forEach((entry, index) => {
    const labelName = `segmentLabel${index + 1}`;
    lines.push(labelStatement(labelName, entry.value));
    lines.push(`LabelsSegment(${labelName}, ${entry.a}, ${entry.b})`);
  });
  angleLabels.forEach((entry, index) => {
    const labelName = `angleLabel${index + 1}`;
    lines.push(labelStatement(labelName, entry.value));
    lines.push(`LabelsAngle(${labelName}, ${entry.a}, ${entry.b}, ${entry.c})`);
  });

  return `${lines.join("\n")}\n`;
}

function defaultSetEntries(spec) {
  const data = spec?.data ?? {};
  const sets = Array.isArray(data.sets) && data.sets.length ? data.sets : data.objects;
  const setEntries = (Array.isArray(sets) ? sets : [])
    .filter((entry) => !entry?.type || entry.type === "set")
    .slice(0, 2)
    .map((entry, index) => ({
      name: assertIdentifier(entry?.name ?? (index === 0 ? "A" : "B"), "Set name"),
      label: entry?.label ?? (index === 0 ? "A" : "B"),
    }));

  while (setEntries.length < 2) {
    const index = setEntries.length;
    setEntries.push({ name: index === 0 ? "A" : "B", label: index === 0 ? "A" : "B" });
  }

  const universe = data.universe && typeof data.universe === "object" ? data.universe : {};
  const regionDefaults = [
    { name: "onlyA", label: `${setEntries[0].name} \\cap ${setEntries[1].name}'`, predicate: "LabelsLeftOnly" },
    { name: "intersection", label: `${setEntries[0].name} \\cap ${setEntries[1].name}`, predicate: "LabelsIntersection" },
    { name: "onlyB", label: `${setEntries[0].name}' \\cap ${setEntries[1].name}`, predicate: "LabelsRightOnly" },
    { name: "outside", label: `(${setEntries[0].name} \\cup ${setEntries[1].name})'`, predicate: "LabelsOutside" },
  ];
  const regions = Array.isArray(data.regions) && data.regions.length ? data.regions : regionDefaults;

  return {
    universe: {
      name: assertIdentifier(universe.name ?? "U", "Universe name"),
      label: universe.label ?? "U",
      countLabel: universe.countLabel ?? universe.count ?? universe.total ?? universe.totalLabel,
    },
    sets: setEntries.map((entry, index) => {
      const source = (Array.isArray(sets) ? sets : [])[index] ?? {};
      return {
        ...entry,
        countLabel: source.countLabel ?? source.count ?? source.total ?? source.totalLabel,
      };
    }),
    regions: regionDefaults.map((fallback, index) => {
      const source = regions[index] ?? fallback;
      return {
        ...fallback,
        name: assertIdentifier(source.name ?? fallback.name, "Region label name"),
        label: source.label ?? source.value ?? fallback.label,
        shaded: source.shaded === true || source.shade === true,
      };
    }),
  };
}

function setRegionShadePredicate(region, index) {
  if (!region?.shaded) return null;
  if (region.shadePredicate) return assertIdentifier(region.shadePredicate, "Set region shade predicate");
  if (index === 0 || region.predicate === "LabelsLeftOnly") return "ShadeLeftOnly";
  if (index === 1 || region.predicate === "LabelsIntersection") return "ShadeIntersection";
  if (index === 2 || region.predicate === "LabelsRightOnly") return "ShadeRightOnly";
  return "ShadeOutside";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeSetLabel(label) {
  return String(label ?? "")
    .trim()
    .replace(/^\$/, "")
    .replace(/\$$/, "")
    .replace(/\\setminus/g, "∩")
    .replace(/\\cap/g, "∩")
    .replace(/\\cup/g, "∪")
    .replace(/\\ /g, " ")
    .replace(/\\,/g, " ")
    .replace(/\\left|\\right/g, "")
    .replace(/\\operatorname\{([^}]*)\}/g, "$1")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\/g, "")
    .replace(/'/g, "′")
    .replace(/\s+/g, " ")
    .trim();
}

function setRegionText(label, fallback) {
  const text = normalizeSetLabel(label);
  if (!text) return fallback;
  if (/^[A-Za-z]\s*∩\s*[A-Za-z]$/.test(text)) return text;
  if (/^[A-Za-z]\s*∩\s*[A-Za-z]′$/.test(text)) return text;
  if (/^[A-Za-z]′\s*∩\s*[A-Za-z]$/.test(text)) return text;
  if (/^[A-Za-z]\s*∩\s*[A-Za-z]$/.test(fallback)) return text;
  return text;
}

function isCompactSetRegionValue(label) {
  return /^[0-9]+(?:\.[0-9]+)?$/.test(normalizeSetLabel(label));
}

function setLabelStatementsFromSubstance(substance) {
  const labels = new Map();
  for (const rawLine of String(substance ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const labelMatch = line.match(/^Label\s+([A-Za-z][A-Za-z0-9_]*)\s+(.+)$/);
    if (labelMatch) labels.set(labelMatch[1], labelMatch[2].trim());
  }
  return labels;
}

function setSpecFromSubstance(spec, substance) {
  const labels = setLabelStatementsFromSubstance(substance);
  const universeMatch = String(substance ?? "").match(/^Universe\s+(.+)$/m);
  const setMatch = String(substance ?? "").match(/^Set\s+(.+)$/m);
  const universeName = universeMatch ? substanceArgs(universeMatch[1])[0] : "U";
  const setNames = setMatch ? substanceArgs(setMatch[1]).slice(0, 2) : ["A", "B"];
  while (setNames.length < 2) setNames.push(setNames.length === 0 ? "A" : "B");

  const regionByPredicate = new Map([
    ["LabelsLeftOnly", { name: "onlyA", label: `${setNames[0]} \\cap ${setNames[1]}'`, predicate: "LabelsLeftOnly" }],
    ["LabelsIntersection", { name: "intersection", label: `${setNames[0]} \\cap ${setNames[1]}`, predicate: "LabelsIntersection" }],
    ["LabelsRightOnly", { name: "onlyB", label: `${setNames[0]}' \\cap ${setNames[1]}`, predicate: "LabelsRightOnly" }],
    ["LabelsOutside", { name: "outside", label: `(${setNames[0]} \\cup ${setNames[1]})'`, predicate: "LabelsOutside" }],
  ]);

  for (const rawLine of String(substance ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const labelPredicateMatch = line.match(/^(LabelsLeftOnly|LabelsIntersection|LabelsRightOnly|LabelsOutside)\(([^)]+)\)$/);
    if (labelPredicateMatch) {
      const args = substanceArgs(labelPredicateMatch[2]);
      const regionName = args[0];
      const region = regionByPredicate.get(labelPredicateMatch[1]);
      if (region && regionName) {
        region.name = assertIdentifier(regionName, "Region label name");
        region.label = labels.get(region.name) ?? region.label;
      }
      continue;
    }

    const shadePredicateMatch = line.match(/^(ShadeLeftOnly|ShadeIntersection|ShadeRightOnly|ShadeOutside)\(([^)]*)\)$/);
    if (shadePredicateMatch) {
      const predicate = shadePredicateMatch[1];
      const labelPredicate =
        predicate === "ShadeLeftOnly"
          ? "LabelsLeftOnly"
          : predicate === "ShadeIntersection"
            ? "LabelsIntersection"
            : predicate === "ShadeRightOnly"
              ? "LabelsRightOnly"
              : "LabelsOutside";
      const region = regionByPredicate.get(labelPredicate);
      if (region) region.shaded = true;
    }
  }

  const base = defaultSetEntries({
    ...spec,
    data: {
      universe: { name: universeName ?? "U", label: labels.get(universeName) ?? universeName ?? "U" },
      sets: setNames.map((name, index) => ({ type: "set", name, label: labels.get(name) ?? name ?? (index === 0 ? "A" : "B") })),
      regions: [
        regionByPredicate.get("LabelsLeftOnly"),
        regionByPredicate.get("LabelsIntersection"),
        regionByPredicate.get("LabelsRightOnly"),
        regionByPredicate.get("LabelsOutside"),
      ],
    },
  });
  return base;
}

function setDiagramSourceEntries(spec, substance) {
  return substance ? setSpecFromSubstance(spec, substance) : defaultSetEntries(spec);
}

const SET_DIAGRAM_DEFAULT_DISPLAY_SCALE = 0.8;
const SET_DIAGRAM_SIDE_TAB_HALF_HEIGHT = 34;
const SET_DIAGRAM_SIDE_TAB_RADIUS = 38;
const SET_DIAGRAM_COMPACT_REGION_LABEL_POSITIONS = {
  onlyA: { x: 144, y: 150 },
  intersection: { x: 210, y: 150 },
  onlyB: { x: 276, y: 150 },
};

function setDiagramArcSagitta(radius, halfHeight) {
  return radius - Math.sqrt(Math.max(0, radius * radius - halfHeight * halfHeight));
}

function setDiagramSideTabTextOffset(setRadius, tabHalfHeight) {
  const setCircleSagitta = setDiagramArcSagitta(setRadius, tabHalfHeight);
  const tabArcSagitta = setDiagramArcSagitta(SET_DIAGRAM_SIDE_TAB_RADIUS, tabHalfHeight);
  return Math.max(0, (tabArcSagitta - setCircleSagitta) / 2);
}

function setDiagramTextScale(scalePercent) {
  const scale = Number(scalePercent) / 100;
  const displayScale = Number.isFinite(scale) && scale > 0 ? scale * SET_DIAGRAM_DEFAULT_DISPLAY_SCALE : SET_DIAGRAM_DEFAULT_DISPLAY_SCALE;
  return displayScale > 0 ? 1 / displayScale : 1;
}

function setSvgText(text, x, y, options = {}) {
  const fontSize = formatSvgNumber((options.fontSize ?? 13.333) * (options.textScale ?? 1));
  const weight = options.weight ? ` font-weight="${options.weight}"` : "";
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Cambria, 'Times New Roman', serif" font-size="${fontSize}" font-style="italic"${weight} fill="#111827">${escapeHtml(text)}</text>`;
}

function setCountBadge(text, x, y, type = "box", options = {}) {
  if (text === undefined || text === null || text === "") return "";
  const label = normalizeSetLabel(text);
  if (!label) return "";
  const fontSize = formatSvgNumber(13.333 * (options.textScale ?? 1));
  if (type === "left-tab" || type === "right-tab") {
    const radius = options.radius ?? 86;
    const dy = options.tabHalfHeight ?? SET_DIAGRAM_SIDE_TAB_HALF_HEIGHT;
    const inset = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    const edgeX = type === "left-tab" ? x - radius + (radius - inset) : x + radius - (radius - inset);
    const textOffset = options.textOffset ?? setDiagramSideTabTextOffset(radius, dy);
    const textX = type === "left-tab" ? edgeX + textOffset : edgeX - textOffset;
    const sweep = type === "left-tab" ? 1 : 0;
    return `<g data-role="set-count-badge" data-badge-kind="${type}"><path d="M ${formatSvgNumber(edgeX)} ${y - dy} A ${SET_DIAGRAM_SIDE_TAB_RADIUS} ${SET_DIAGRAM_SIDE_TAB_RADIUS} 0 0 ${sweep} ${formatSvgNumber(edgeX)} ${y + dy}" fill="none" stroke="#111827" stroke-width="2.1"/><text x="${formatSvgNumber(textX)}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Cambria, 'Times New Roman', serif" font-size="${fontSize}" fill="#111827">${escapeHtml(label)}</text></g>`;
  }
  const width = Math.max(34, label.length * 8 + 16);
  const height = 34;
  return `<g data-role="set-count-badge" data-badge-kind="box"><rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" fill="#ffffff" stroke="#111827" stroke-width="2.1"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Cambria, 'Times New Roman', serif" font-size="${fontSize}" fill="#111827">${escapeHtml(label)}</text></g>`;
}

function renderSetDiagramSvg(spec, substance) {
  const { universe, sets, regions } = setDiagramSourceEntries(spec, substance);
  const [leftSet, rightSet] = sets;
  const regionLabels = {
    onlyA: setRegionText(regions[0]?.label, `${leftSet.name} ∩ ${rightSet.name}′`),
    intersection: setRegionText(regions[1]?.label, `${leftSet.name} ∩ ${rightSet.name}`),
    onlyB: setRegionText(regions[2]?.label, `${leftSet.name}′ ∩ ${rightSet.name}`),
    outside: setRegionText(regions[3]?.label, `(${leftSet.name} ∪ ${rightSet.name})′`),
  };
  const shaded = {
    onlyA: regions[0]?.shaded === true,
    intersection: regions[1]?.shaded === true,
    onlyB: regions[2]?.shaded === true,
    outside: regions[3]?.shaded === true,
  };
  const width = DEFAULT_CANVAS_WIDTH;
  const height = DEFAULT_CANVAS_HEIGHT;
  const rect = { x: 26, y: 26, width: 368, height: 248 };
  const left = { cx: 168, cy: 150, r: 86 };
  const right = { cx: 252, cy: 150, r: 86 };
  const scalePercent = Number(spec?.options?.scalePercent ?? 100);
  const textScale = setDiagramTextScale(scalePercent);
  const compactRegionValues =
    isCompactSetRegionValue(regionLabels.onlyA) &&
    isCompactSetRegionValue(regionLabels.intersection) &&
    isCompactSetRegionValue(regionLabels.onlyB);
  const regionLabelPositions = compactRegionValues
    ? SET_DIAGRAM_COMPACT_REGION_LABEL_POSITIONS
    : {
        onlyA: { x: 126, y: 150 },
        intersection: { x: 210, y: 150 },
        onlyB: { x: 294, y: 150 },
      };
  const shadeColor = "rgba(15, 23, 42, 0.24)";
  const idPrefix = `set-${Math.random().toString(36).slice(2)}`;
  const shading = [
    shaded.outside
      ? `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${shadeColor}" mask="url(#${idPrefix}-outside)"/>`
      : "",
    shaded.onlyA
      ? `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${shadeColor}" mask="url(#${idPrefix}-left-only)"/>`
      : "",
    shaded.intersection
      ? `<g clip-path="url(#${idPrefix}-left-circle)"><circle cx="${right.cx}" cy="${right.cy}" r="${right.r}" fill="${shadeColor}"/></g>`
      : "",
    shaded.onlyB
      ? `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${shadeColor}" mask="url(#${idPrefix}-right-only)"/>`
      : "",
  ].join("");

  const svg = `<svg version="1.2" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <clipPath id="${idPrefix}-left-circle"><circle cx="${left.cx}" cy="${left.cy}" r="${left.r}"/></clipPath>
    <mask id="${idPrefix}-outside" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="#ffffff"/>
      <circle cx="${left.cx}" cy="${left.cy}" r="${left.r}" fill="#000000"/>
      <circle cx="${right.cx}" cy="${right.cy}" r="${right.r}" fill="#000000"/>
    </mask>
    <mask id="${idPrefix}-left-only" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#000000"/>
      <circle cx="${left.cx}" cy="${left.cy}" r="${left.r}" fill="#ffffff"/>
      <circle cx="${right.cx}" cy="${right.cy}" r="${right.r}" fill="#000000"/>
    </mask>
    <mask id="${idPrefix}-right-only" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#000000"/>
      <circle cx="${right.cx}" cy="${right.cy}" r="${right.r}" fill="#ffffff"/>
      <circle cx="${left.cx}" cy="${left.cy}" r="${left.r}" fill="#000000"/>
    </mask>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
  ${shading}
  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="none" stroke="#111827" stroke-width="2.4"/>
  <circle cx="${left.cx}" cy="${left.cy}" r="${left.r}" fill="none" stroke="#111827" stroke-width="2.4"/>
  <circle cx="${right.cx}" cy="${right.cy}" r="${right.r}" fill="none" stroke="#111827" stroke-width="2.4"/>
  ${setSvgText(normalizeSetLabel(universe.label), 54, 58, { textScale })}
  ${setSvgText(normalizeSetLabel(leftSet.label), 116, 58, { textScale })}
  ${setSvgText(normalizeSetLabel(rightSet.label), 304, 58, { textScale })}
  ${setSvgText(regionLabels.onlyA, regionLabelPositions.onlyA.x, regionLabelPositions.onlyA.y, { textScale })}
  ${setSvgText(regionLabels.intersection, regionLabelPositions.intersection.x, regionLabelPositions.intersection.y, { textScale })}
  ${setSvgText(regionLabels.onlyB, regionLabelPositions.onlyB.x, regionLabelPositions.onlyB.y, { textScale })}
  ${setSvgText(regionLabels.outside, 342, 250, { textScale })}
  ${setCountBadge(universe.countLabel, rect.x + rect.width - 17, rect.y + 17, "box", { textScale })}
  ${setCountBadge(leftSet.countLabel, left.cx, left.cy, "left-tab", { textScale, radius: left.r })}
  ${setCountBadge(rightSet.countLabel, right.cx, right.cy, "right-tab", { textScale, radius: right.r })}
</svg>`;

  return {
    svg,
    metadata: {
      width,
      height,
      displayWidth: width * SET_DIAGRAM_DEFAULT_DISPLAY_SCALE,
      displayHeight: height * SET_DIAGRAM_DEFAULT_DISPLAY_SCALE,
      viewBox: `0 0 ${width} ${height}`,
      scalePercent,
      preset: "sets",
      presetLabel: "Sets",
      domainSource: "",
      substance: substance ?? specToSetSubstance(spec),
      styleSource: "custom-set-svg",
      style: spec?.style ?? "sets",
    },
  };
}

function specToSetSubstance(spec) {
  const { universe, sets, regions } = defaultSetEntries(spec);
  const [leftSet, rightSet] = sets;
  const lines = [
    `Universe ${universe.name}`,
    `Set ${leftSet.name}, ${rightSet.name}`,
    `RegionLabel ${regions.map((region) => region.name).join(", ")}`,
    labelStatement(universe.name, universe.label),
    labelStatement(leftSet.name, leftSet.label),
    labelStatement(rightSet.name, rightSet.label),
    ...regions.map((region) => labelStatement(region.name, region.label)),
    `Venn(${universe.name}, ${leftSet.name}, ${rightSet.name})`,
  ];

  regions.forEach((region) => {
    if (region.predicate === "LabelsOutside") {
      lines.push(`${region.predicate}(${region.name}, ${universe.name}, ${leftSet.name}, ${rightSet.name})`);
      return;
    }
    lines.push(`${region.predicate}(${region.name}, ${leftSet.name}, ${rightSet.name})`);
  });

  regions.forEach((region, index) => {
    const shadePredicate = setRegionShadePredicate(region, index);
    if (!shadePredicate) return;
    if (shadePredicate === "ShadeOutside") {
      lines.push(`${shadePredicate}(${universe.name}, ${leftSet.name}, ${rightSet.name})`);
      return;
    }
    lines.push(`${shadePredicate}(${leftSet.name}, ${rightSet.name})`);
  });

  return `${lines.join("\n")}\n`;
}

function specToPresetSubstance(spec, preset) {
  if (preset === "sets") return specToSetSubstance(spec);
  return specToSubstance(spec);
}

function markCount(value) {
  const count = Math.round(Number(value ?? 1));
  return Number.isFinite(count) ? Math.max(1, Math.min(3, count)) : 1;
}

function equalLengthPredicate(count) {
  if (count === 2) return "EqualLength2";
  if (count === 3) return "EqualLength3";
  return "EqualLength";
}

function equalNamedLengthPredicate(count) {
  if (count === 2) return "EqualNamedLength2";
  if (count === 3) return "EqualNamedLength3";
  return "EqualNamedLength";
}

function angleMarkPredicate(count) {
  if (count === 2) return "AngleMark2";
  if (count === 3) return "AngleMark3";
  return "AngleMark";
}

function anglePoints(relation) {
  const points = relation.points ?? [relation.a, relation.at ?? relation.b, relation.c];
  if (!Array.isArray(points) || points.length !== 3) return null;
  return points.map((name) => assertIdentifier(name, "Angle point"));
}

function rightAnglePoints(relation, spec) {
  const at = assertIdentifier(relation.at, "rightAngle.at");
  if (Array.isArray(relation.points) && relation.points.length === 3) {
    return relation.points.map((name) => assertIdentifier(name, "Right angle point"));
  }
  const triangle = (spec?.data?.relationships ?? []).find((candidate) => candidate?.type === "triangle");
  const points = triangle?.points ?? [];
  if (points.length !== 3 || !points.includes(at)) return null;
  const others = points.filter((name) => name !== at);
  return [others[0], at, others[1]].map((name) => assertIdentifier(name, "Right angle point"));
}

function lengthLabelEntries(spec) {
  const entries = [];
  for (const relation of spec?.data?.relationships ?? []) {
    if (relation?.type !== "labelLength") continue;
    const names = relation.between ?? [];
    if (names.length !== 2) continue;
    entries.push({
      name: typeof relation.name === "string" ? assertIdentifier(relation.name, "Length label name") : undefined,
      a: assertIdentifier(names[0], "Length point"),
      b: assertIdentifier(names[1], "Length point"),
      value: relation.value ?? "",
    });
  }
  return entries;
}

function namedSegmentEntries(spec) {
  const entries = new Map();
  for (const relation of spec?.data?.relationships ?? []) {
    if ((relation?.type !== "segment" && relation?.type !== "vectorSegment") || typeof relation.name !== "string") continue;
    const names = relation.points ?? relation.between ?? [];
    if (!Array.isArray(names) || names.length !== 2) continue;
    entries.set(assertIdentifier(relation.name, "Segment name"), {
      name: assertIdentifier(relation.name, "Segment name"),
      a: assertIdentifier(names[0], "Segment start point"),
      b: assertIdentifier(names[1], "Segment end point"),
    });
  }
  return [...entries.values()];
}

function segmentLabelEntries(spec) {
  const entries = [];
  for (const relation of spec?.data?.relationships ?? []) {
    if (relation?.type !== "segment" && relation?.type !== "vectorSegment") continue;
    const value = relation.label ?? relation.value;
    if (String(value ?? "").trim().length === 0) continue;
    const names = relation.points ?? relation.between ?? [];
    if (!Array.isArray(names) || names.length !== 2) continue;
    entries.push({
      a: assertIdentifier(names[0], "Segment label start point"),
      b: assertIdentifier(names[1], "Segment label end point"),
      value,
    });
  }
  return entries;
}

function angleLabelEntries(spec) {
  const entries = [];
  for (const relation of spec?.data?.relationships ?? []) {
    if (relation?.type !== "labelAngle") continue;
    const points = anglePoints(relation);
    if (!points) continue;
    entries.push({
      name: typeof relation.name === "string" ? assertIdentifier(relation.name, "Angle label name") : undefined,
      a: points[0],
      b: points[1],
      c: points[2],
      value: relation.value ?? relation.label ?? "",
    });
  }
  return entries;
}

function substanceArgs(source) {
  return String(source ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function substanceObjectLabels(spec) {
  const labels = new Map();
  for (const object of spec?.data?.objects ?? []) {
    if (!object || typeof object !== "object" || typeof object.name !== "string") continue;
    if (object.type && object.type !== "point" && object.type !== "circle") continue;
    if (object.hideLabel === true || object.showLabel === false) {
      labels.set(object.name, "\\,");
      continue;
    }
    if (typeof object.label === "string" && object.label.trim()) labels.set(object.name, object.label);
  }
  return labels;
}

function substanceWithImplicitInvisibleLabels(substance, preset = "geometry", spec = null) {
  const objectNames = new Set();
  const visibleObjectNames = new Set();
  const labelledNames = new Set();
  const namedSegments = new Set();
  const namedSegmentEndpoints = new Map();
  const declaredNamedSegments = new Set();
  const declaredLengthLabels = new Set();
  const usedLengthLabels = new Set();
  const lengthLabelUsageCounts = new Map();
  const labelValues = new Map();
  const specLabels = substanceObjectLabels(spec);
  const circleNames = new Set();
  const objectTypes = preset === "sets" ? "Universe|Set|RegionLabel" : "Point|Circle|Line|Ray";
  const visibleLabelTypes = preset === "sets" ? new Set(["Universe", "Set"]) : new Set();
  let generatedSegmentIndex = 1;
  const lines = String(substance ?? "")
    .split(/\r?\n/)
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("--")) return rawLine;

      const segmentDeclarationMatch = line.match(/^Segment\s+(.+)$/);
      if (segmentDeclarationMatch) {
        return `NamedSegment ${substanceArgs(segmentDeclarationMatch[1])
          .map((name) => assertIdentifier(name, "NamedSegment name"))
          .join(", ")}`;
      }

      const hidePointsMatch = line.match(/^HidePoints\(([^)]*)\)$/);
      if (hidePointsMatch) {
        return substanceArgs(hidePointsMatch[1])
          .map((name) => `HidePoint(${assertIdentifier(name, "Hidden point name")})`)
          .join("\n");
      }

      const equalLengthAliasMatch = line.match(/^(EqualLength2|EqualLength3|EqualLength)\(([^)]+)\)$/);
      if (equalLengthAliasMatch) {
        const args = substanceArgs(equalLengthAliasMatch[2]);
        if (args.length === 2) {
          const predicate = equalLengthAliasMatch[1].replace("EqualLength", "EqualNamedLength");
          return `${predicate}(${args.map((name) => assertIdentifier(name, "Equal segment name")).join(", ")})`;
        }
      }

      const segmentMatch = line.match(/^(Segment|VectorSegment)\(([^)]+)\)$/);
      if (!segmentMatch) return rawLine;

      const args = substanceArgs(segmentMatch[2]);
      if (args.length !== 2) return rawLine;

      const start = assertIdentifier(args[0], "Segment start point");
      const end = assertIdentifier(args[1], "Segment end point");
      const name = `autoSegment${generatedSegmentIndex++}`;
      namedSegments.add(name);
      objectNames.add(start);
      objectNames.add(end);
      return `${segmentMatch[1]}(${name}, ${start}, ${end})`;
    });

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("--")) continue;

    const namedSegmentDeclarationMatch = line.match(/^NamedSegment\s+(.+)$/);
    if (namedSegmentDeclarationMatch) {
      for (const name of substanceArgs(namedSegmentDeclarationMatch[1])) {
        declaredNamedSegments.add(assertIdentifier(name, "NamedSegment name"));
      }
      continue;
    }

    const lengthLabelDeclarationMatch = line.match(/^LengthLabel\s+(.+)$/);
    if (lengthLabelDeclarationMatch) {
      for (const name of substanceArgs(lengthLabelDeclarationMatch[1])) {
        declaredLengthLabels.add(assertIdentifier(name, "LengthLabel name"));
      }
      continue;
    }

    const objectMatch = line.match(new RegExp(`^(${objectTypes})\\s+(.+)$`));
    if (objectMatch) {
      for (const name of substanceArgs(objectMatch[2])) {
        const objectName = assertIdentifier(name, `${objectMatch[1]} name`);
        objectNames.add(objectName);
        if (objectMatch[1] === "Circle") circleNames.add(objectName);
        if (visibleLabelTypes.has(objectMatch[1])) visibleObjectNames.add(objectName);
      }
      continue;
    }

    const hidePointMatch = line.match(/^HidePoint\(([^)]+)\)$/);
    if (hidePointMatch) {
      const [pointName] = substanceArgs(hidePointMatch[1]);
      if (pointName) objectNames.add(assertIdentifier(pointName, "Hidden point name"));
      continue;
    }

    const namedSegmentMatch = line.match(/^(Segment|VectorSegment)\(([^)]+)\)$/);
    if (namedSegmentMatch) {
      const args = substanceArgs(namedSegmentMatch[2]);
      if (args.length === 3) {
        const segmentName = assertIdentifier(args[0], "Segment name");
        const start = assertIdentifier(args[1], "Segment start point");
        const end = assertIdentifier(args[2], "Segment end point");
        namedSegments.add(segmentName);
        namedSegmentEndpoints.set(segmentName, [start, end]);
        objectNames.add(start);
        objectNames.add(end);
      }
      if (args.length === 2) {
        objectNames.add(assertIdentifier(args[0], "Segment start point"));
        objectNames.add(assertIdentifier(args[1], "Segment end point"));
      }
      continue;
    }

    const labelConsumerMatch = line.match(/^(LabelsSegment|LabelsAngle|LabelsCircle|LabelsLine)\(([^)]+)\)$/);
    if (labelConsumerMatch) {
      const [labelName] = substanceArgs(labelConsumerMatch[2]);
      if (labelName) {
        const lengthLabelName = assertIdentifier(labelName, "LengthLabel name");
        usedLengthLabels.add(lengthLabelName);
        lengthLabelUsageCounts.set(lengthLabelName, (lengthLabelUsageCounts.get(lengthLabelName) ?? 0) + 1);
      }
      continue;
    }

    const labelMatch = line.match(/^Label\s+([A-Za-z][A-Za-z0-9_]*)\s+(.+)$/);
    if (labelMatch) {
      labelledNames.add(labelMatch[1]);
      labelValues.set(labelMatch[1], labelMatch[2]);
    }
  }

  const labelUseIndexes = new Map();
  const generatedLengthLabelNames = new Set();
  const generatedLengthLabelLines = [];
  const reservedLabelNames = new Set([
    ...objectNames,
    ...declaredNamedSegments,
    ...declaredLengthLabels,
    ...labelledNames,
    ...namedSegments,
    ...usedLengthLabels,
  ]);

  function generatedRepeatedLengthLabelName(sourceName, useIndex) {
    let suffix = useIndex;
    let candidate = `${sourceName}_${suffix}`;
    while (reservedLabelNames.has(candidate) || generatedLengthLabelNames.has(candidate)) {
      suffix += 1;
      candidate = `${sourceName}_${suffix}`;
    }
    reservedLabelNames.add(candidate);
    generatedLengthLabelNames.add(candidate);
    usedLengthLabels.add(candidate);
    const labelValue = labelValues.get(sourceName);
    if (labelValue) generatedLengthLabelLines.push(`Label ${candidate} ${labelValue}`);
    return candidate;
  }

  function placedLengthLabelName(sourceName) {
    if ((lengthLabelUsageCounts.get(sourceName) ?? 0) <= 1) return sourceName;
    const useIndex = (labelUseIndexes.get(sourceName) ?? 0) + 1;
    labelUseIndexes.set(sourceName, useIndex);
    if (useIndex === 1) return sourceName;
    return generatedRepeatedLengthLabelName(sourceName, useIndex);
  }

  const rewrittenLines = lines.map((rawLine) => {
    if (preset !== "geometry") return rawLine;
    const line = rawLine.trim();

    const onAliasMatch = line.match(/^On\(([^)]+)\)$/);
    if (onAliasMatch) {
      const args = substanceArgs(onAliasMatch[1]);
      if (args.length === 2 && circleNames.has(args[1])) {
        return `OnCircle(${assertIdentifier(args[0], "Circle point")}, ${assertIdentifier(args[1], "Circle name")})`;
      }
    }

    const parallelAliasMatch = line.match(/^Parallel\(([^)]+)\)$/);
    if (parallelAliasMatch) {
      const args = substanceArgs(parallelAliasMatch[1]);
      if (args.length === 2) {
        const firstSegment = namedSegmentEndpoints.get(args[0]);
        const secondSegment = namedSegmentEndpoints.get(args[1]);
        if (!firstSegment && secondSegment) {
          return `ParallelToSegment(${assertIdentifier(args[0], "Line name")}, ${secondSegment[0]}, ${secondSegment[1]})`;
        }
        if (firstSegment && !secondSegment) {
          return `ParallelToSegment(${assertIdentifier(args[1], "Line name")}, ${firstSegment[0]}, ${firstSegment[1]})`;
        }
      }
    }

    const perpendicularAliasMatch = line.match(/^Perpendicular\(([^)]+)\)$/);
    if (perpendicularAliasMatch) {
      const args = substanceArgs(perpendicularAliasMatch[1]);
      if (args.length === 2) {
        const firstSegment = namedSegmentEndpoints.get(args[0]);
        const secondSegment = namedSegmentEndpoints.get(args[1]);
        if (!firstSegment && secondSegment) {
          return `PerpendicularToSegment(${assertIdentifier(args[0], "Line name")}, ${secondSegment[0]}, ${secondSegment[1]})`;
        }
        if (firstSegment && !secondSegment) {
          return `PerpendicularToSegment(${assertIdentifier(args[1], "Line name")}, ${firstSegment[0]}, ${firstSegment[1]})`;
        }
      }
    }

    const labelConsumerMatch = line.match(/^(LabelsSegment|LabelsAngle|LabelsCircle|LabelsLine)\(([^)]+)\)$/);
    if (!labelConsumerMatch) return rawLine;
    const predicate = labelConsumerMatch[1];
    const args = substanceArgs(labelConsumerMatch[2]);
    if (!args.length) return rawLine;

    const labelName = placedLengthLabelName(assertIdentifier(args[0], "LengthLabel name"));
    if (predicate === "LabelsSegment" && args.length === 2) {
      const endpoints = namedSegmentEndpoints.get(assertIdentifier(args[1], "Segment name"));
      if (endpoints) return `LabelsSegment(${labelName}, ${endpoints[0]}, ${endpoints[1]})`;
    }

    return `${predicate}(${[labelName, ...args.slice(1)].join(", ")})`;
  });

  const implicitLabels = [...objectNames]
    .filter((name) => !labelledNames.has(name))
    .map((name) => {
      if (visibleObjectNames.has(name)) return `Label ${name} $${name}$`;
      if (specLabels.has(name)) return labelStatement(name, specLabels.get(name));
      return `Label ${name} $\\,$`;
    });
  const implicitSegments = [...namedSegments].filter((name) => !declaredNamedSegments.has(name));
  const implicitSegmentDeclaration = implicitSegments.length ? `NamedSegment ${implicitSegments.join(", ")}\n` : "";
  const implicitLengthLabels = [...usedLengthLabels].filter((name) => !declaredLengthLabels.has(name));
  const implicitLengthLabelDeclaration = implicitLengthLabels.length ? `LengthLabel ${implicitLengthLabels.join(", ")}\n` : "";
  const generatedLengthLabelDeclaration = generatedLengthLabelLines.length ? `${generatedLengthLabelLines.join("\n")}\n` : "";

  return `${implicitSegmentDeclaration}${implicitLengthLabelDeclaration}${generatedLengthLabelDeclaration}${rewrittenLines.join("\n").trimEnd()}${
    implicitLabels.length ? `\n${implicitLabels.join("\n")}` : ""
  }\n`;
}

function parseSubstanceDiagramSpec(substance) {
  const points = new Map();
  const labels = new Map();
  const namedSegments = new Map();
  const relationships = [];

  for (const rawLine of String(substance ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("--")) continue;

    const pointMatch = line.match(/^Point\s+(.+)$/);
    if (pointMatch) {
      for (const name of substanceArgs(pointMatch[1])) {
        const pointName = assertIdentifier(name, "Point name");
        points.set(pointName, { type: "point", name: pointName });
      }
      continue;
    }

    const labelMatch = line.match(/^Label\s+([A-Za-z][A-Za-z0-9_]*)\s+(.+)$/);
    if (labelMatch) {
      labels.set(labelMatch[1], labelMatch[2].trim());
      continue;
    }

    const triangleMatch = line.match(/^Triangle\(([^)]+)\)$/);
    if (triangleMatch) {
      const trianglePoints = substanceArgs(triangleMatch[1]).map((name) => assertIdentifier(name, "Triangle point"));
      if (trianglePoints.length === 3) {
        trianglePoints.forEach((name) => points.set(name, points.get(name) ?? { type: "point", name }));
        relationships.push({ type: "triangle", points: trianglePoints });
      }
      continue;
    }

    const rightAngleMatch = line.match(/^RightAngle\(([^)]+)\)$/);
    if (rightAngleMatch) {
      const anglePoints = substanceArgs(rightAngleMatch[1]).map((name) => assertIdentifier(name, "Right angle point"));
      if (anglePoints.length === 3) {
        anglePoints.forEach((name) => points.set(name, points.get(name) ?? { type: "point", name }));
        relationships.push({ type: "rightAngle", points: anglePoints, at: anglePoints[1] });
      }
      continue;
    }

    const segmentLabelMatch = line.match(/^LabelsSegment\(([^)]+)\)$/);
    if (segmentLabelMatch) {
      const [labelName, a, b] = substanceArgs(segmentLabelMatch[1]);
      if (!labelName || !a || !b) continue;
      const label = assertIdentifier(labelName, "Length label");
      const start = assertIdentifier(a, "Length point");
      const end = assertIdentifier(b, "Length point");
      points.set(start, points.get(start) ?? { type: "point", name: start });
      points.set(end, points.get(end) ?? { type: "point", name: end });
      relationships.push({
        type: "labelLength",
        name: label,
        between: [start, end],
        value: labels.get(label) ?? "",
      });
      continue;
    }

    const namedSegmentMatch = line.match(/^(Segment|VectorSegment)\(([^)]+)\)$/);
    if (namedSegmentMatch) {
      const args = substanceArgs(namedSegmentMatch[2]);
      if (args.length === 3) {
        const [segmentName, a, b] = args;
        const start = assertIdentifier(a, "Segment start point");
        const end = assertIdentifier(b, "Segment end point");
        points.set(start, points.get(start) ?? { type: "point", name: start });
        points.set(end, points.get(end) ?? { type: "point", name: end });
        namedSegments.set(assertIdentifier(segmentName, "Segment name"), [start, end]);
      }
      if (args.length === 2) {
        const [a, b] = args;
        const start = assertIdentifier(a, "Segment start point");
        const end = assertIdentifier(b, "Segment end point");
        points.set(start, points.get(start) ?? { type: "point", name: start });
        points.set(end, points.get(end) ?? { type: "point", name: end });
        relationships.push({ type: "segment", points: [start, end] });
      }
      continue;
    }

    const equalLengthMatch = line.match(/^(EqualLength2|EqualLength3|EqualLength)\(([^)]+)\)$/);
    if (equalLengthMatch) {
      const names = substanceArgs(equalLengthMatch[2]).map((name) => assertIdentifier(name, "Equal length point"));
      if (names.length === 4) {
        names.forEach((name) => points.set(name, points.get(name) ?? { type: "point", name }));
        relationships.push({
          type: "equalLength",
          segments: [
            [names[0], names[1]],
            [names[2], names[3]],
          ],
          marks: equalLengthMatch[1] === "EqualLength2" ? 2 : equalLengthMatch[1] === "EqualLength3" ? 3 : 1,
        });
      }
      continue;
    }

    const equalNamedLengthMatch = line.match(/^(EqualNamedLength2|EqualNamedLength3|EqualNamedLength)\(([^)]+)\)$/);
    if (equalNamedLengthMatch) {
      const names = substanceArgs(equalNamedLengthMatch[2]).map((name) => assertIdentifier(name, "Equal segment name"));
      const first = namedSegments.get(names[0]);
      const second = namedSegments.get(names[1]);
      if (first && second) {
        [...first, ...second].forEach((name) => points.set(name, points.get(name) ?? { type: "point", name }));
        relationships.push({
          type: "equalLength",
          segments: [first, second],
          namedSegments: names,
          marks: equalNamedLengthMatch[1] === "EqualNamedLength2" ? 2 : equalNamedLengthMatch[1] === "EqualNamedLength3" ? 3 : 1,
        });
      }
      continue;
    }

    const angleMarkMatch = line.match(/^(AngleMark2|AngleMark3|AngleMark)\(([^)]+)\)$/);
    if (angleMarkMatch) {
      const names = substanceArgs(angleMarkMatch[2]).map((name) => assertIdentifier(name, "Angle mark point"));
      if (names.length === 3) {
        names.forEach((name) => points.set(name, points.get(name) ?? { type: "point", name }));
        relationships.push({
          type: "angleMark",
          points: names,
          marks: angleMarkMatch[1] === "AngleMark2" ? 2 : angleMarkMatch[1] === "AngleMark3" ? 3 : 1,
        });
      }
      continue;
    }

    const angleLabelMatch = line.match(/^LabelsAngle\(([^)]+)\)$/);
    if (angleLabelMatch) {
      const [labelName, a, b, c] = substanceArgs(angleLabelMatch[1]);
      if (!labelName || !a || !b || !c) continue;
      const label = assertIdentifier(labelName, "Angle label");
      const angleNames = [a, b, c].map((name) => assertIdentifier(name, "Angle label point"));
      angleNames.forEach((name) => points.set(name, points.get(name) ?? { type: "point", name }));
      relationships.push({
        type: "labelAngle",
        name: label,
        points: angleNames,
        value: labels.get(label) ?? "",
      });
    }
  }

  if (!points.size) return null;

  return {
    type: "geometricConstruction",
    data: {
      objects: [...points.values()],
      relationships,
    },
  };
}

function diagramDimensions() {
  return {
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
  };
}

function canvasStyle() {
  const { width, height } = diagramDimensions();
  return `canvas {\n  width = ${width}\n  height = ${height}\n}`;
}

function applyCanvasSize(styleBase) {
  return styleBase.replace(/canvas\s*\{[\s\S]*?\}/, canvasStyle());
}

function numericLength(value) {
  if (value === undefined || value === null) return null;
  const source = String(value).trim();
  if (!source) return null;
  const normalized = source.replace(/^\$/, "").replace(/\$$/, "").trim();
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)(?:\s*(?:cm|mm|m|units?|u))?$/i);
  const numeric = match ? Number(match[1]) : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function formatPenroseNumber(value) {
  return String(Number(value.toFixed(3)));
}

function triangleOppositePoint(spec, a, b) {
  const side = new Set([a, b]);
  for (const relation of spec?.data?.relationships ?? []) {
    if (relation?.type !== "triangle") continue;
    const points = relation.points ?? [];
    if (points.length !== 3 || !points.includes(a) || !points.includes(b)) continue;
    return assertIdentifier(
      points.find((point) => !side.has(point)),
      "Triangle opposite point",
    );
  }
  return null;
}

function triangleSideLabelStyle(labelName, entry, opposite) {
  return [
    `forall LengthLabel \`${labelName}\`; Point \`${entry.a}\`; Point \`${entry.b}\`; Point \`${opposite}\` {`,
    `  \`${labelName}\`.text.center = midpoint(\`${entry.a}\`.dot.center, \`${entry.b}\`.dot.center) + unit(midpoint(\`${entry.a}\`.dot.center, \`${entry.b}\`.dot.center) - \`${opposite}\`.dot.center + (0.001, 0.001)) * 18`,
    `  ensure disjoint(\`${labelName}\`.text, \`${opposite}\`.dot, 12)`,
    "}",
  ];
}

function generatedStyle(spec) {
  const allLengthEntries = lengthLabelEntries(spec);
  const lengthEntries = allLengthEntries
    .map((entry) => ({ ...entry, numericValue: numericLength(entry.value) }))
    .filter((entry) => entry.numericValue);
  const lines = [];

  allLengthEntries.forEach((entry, index) => {
    const opposite = triangleOppositePoint(spec, entry.a, entry.b);
    if (!opposite) return;
    lines.push(...triangleSideLabelStyle(entry.name ?? `sideLabel${index + 1}`, entry, opposite));
  });

  if (lengthEntries.length) {
    const maxLength = Math.max(...lengthEntries.map((entry) => entry.numericValue));
    const scale = maxLength > 0 ? 220 / maxLength : 1;

    lengthEntries.forEach((entry) => {
      const targetPixels = Math.max(55, Math.min(230, entry.numericValue * scale));
      lines.push(`forall Point \`${entry.a}\`; Point \`${entry.b}\` {`);
      lines.push(`  encourage equal(vdist(\`${entry.a}\`.dot.center, \`${entry.b}\`.dot.center), ${formatPenroseNumber(targetPixels)})`);
      lines.push("}");
    });
  }

  return lines.join("\n");
}

function stringOption(spec, key) {
  const value = spec?.options?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function defaultPresetForType(type) {
  return type === "setDiagram" ? "sets" : "geometry";
}

function presetName(spec) {
  const stylePreset = spec?.style && spec.style !== "school" ? spec.style : undefined;
  const requested = String(spec?.options?.penrosePreset ?? spec?.options?.preset ?? stylePreset ?? defaultPresetForType(spec?.type));
  const normalized = PRESET_ALIASES[requested] ?? requested;
  return PENROSE_PRESETS[normalized] ? normalized : defaultPresetForType(spec?.type);
}

function generatedStyleSource(styleBase, spec) {
  const style = generatedStyle(spec);
  return `${applyCanvasSize(styleBase)}${style ? `\n\n${style}\n` : "\n"}`;
}

function svgElementToString(svg) {
  if (typeof svg === "string") return svg;
  if (svg?.outerHTML) return svg.outerHTML;
  if (typeof XMLSerializer !== "undefined") return new XMLSerializer().serializeToString(svg);
  throw new Error("Penrose returned an SVG element that cannot be serialized in this runtime");
}

function parseCroppedViewBox(svg) {
  const match = String(svg).match(/<croppedViewBox>([^<]+)<\/croppedViewBox>/);
  if (!match) return null;
  const [x, y, width, height] = match[1]
    .trim()
    .split(/\s+/)
    .map((value) => Number(value));

  if (![x, y, width, height].every((value) => Number.isFinite(value)) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function visibleViewBox(svg, canvasWidth, canvasHeight) {
  const crop = parseCroppedViewBox(svg);
  if (!crop) return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };

  const minX = Math.max(0, crop.x - SVG_CROP_PADDING);
  const minY = Math.max(0, crop.y - SVG_CROP_PADDING);
  const maxX = Math.min(canvasWidth, crop.x + crop.width + SVG_CROP_PADDING);
  const maxY = Math.min(canvasHeight, crop.y + crop.height + SVG_CROP_PADDING);
  const width = Math.max(MIN_CROPPED_DIMENSION, maxX - minX);
  const height = Math.max(MIN_CROPPED_DIMENSION, maxY - minY);

  return {
    x: minX,
    y: minY,
    width: Math.min(width, canvasWidth - minX),
    height: Math.min(height, canvasHeight - minY),
  };
}

function viewBoxString(viewBox) {
  return [viewBox.x, viewBox.y, viewBox.width, viewBox.height].map((value) => formatSvgNumber(value)).join(" ");
}

function svgWithDimensions(svg, viewBox) {
  return svg.replace(/^<svg\b([^>]*)>/, (_match, attributes) => {
    const cleanedAttributes = String(attributes)
      .replace(/\swidth="[^"]*"/g, "")
      .replace(/\sheight="[^"]*"/g, "")
      .replace(/\sviewBox="[^"]*"/g, "")
      .replace(/\spreserveAspectRatio="[^"]*"/g, "");
    return `<svg${cleanedAttributes} viewBox="${viewBoxString(viewBox)}" width="${formatSvgNumber(
      viewBox.width,
    )}" height="${formatSvgNumber(viewBox.height)}" preserveAspectRatio="xMidYMid meet">`;
  });
}

function formatSvgNumber(value) {
  return String(Number(value.toFixed(3)));
}

function scaledPx(value, scale) {
  const number = Number(value);
  return Number.isFinite(number) ? formatSvgNumber(number / scale) : value;
}

function scaleCssPixels(source, scale) {
  return String(source).replace(/([0-9]+(?:\.[0-9]+)?)px/g, (_match, value) => `${scaledPx(value, scale)}px`);
}

function directTitle(element) {
  return [...element.children].find((child) => child.tagName.toLowerCase() === "title")?.textContent ?? "";
}

function fixedSizeLabelSvg(svg, scalePercent) {
  const scale = Number(scalePercent) / 100;
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.001) return svg;

  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const svgElement = document.documentElement;

  for (const text of [...svgElement.querySelectorAll("text")]) {
    const style = text.getAttribute("style");
    if (style) text.setAttribute("style", scaleCssPixels(style, scale));
    const fontSize = text.getAttribute("font-size");
    if (fontSize) text.setAttribute("font-size", scaledPx(fontSize, scale));
  }

  for (const group of [...svgElement.querySelectorAll("g")]) {
    if (!directTitle(group)) continue;
    const equationSvg = [...group.children].find((child) => child.tagName.toLowerCase() === "svg");
    if (!equationSvg) continue;

    const originalWidth = Number(equationSvg.getAttribute("width"));
    const originalHeight = Number(equationSvg.getAttribute("height"));
    const nextWidth = Number.isFinite(originalWidth) ? originalWidth / scale : NaN;
    const nextHeight = Number.isFinite(originalHeight) ? originalHeight / scale : NaN;

    const style = equationSvg.getAttribute("style");
    if (style) equationSvg.setAttribute("style", scaleCssPixels(style, scale));
    if (Number.isFinite(nextWidth)) equationSvg.setAttribute("width", formatSvgNumber(nextWidth));
    if (Number.isFinite(nextHeight)) equationSvg.setAttribute("height", formatSvgNumber(nextHeight));

    const transform = group.getAttribute("transform") ?? "";
    if (!Number.isFinite(originalWidth) || !Number.isFinite(originalHeight) || !transform.includes("translate(")) continue;
    group.setAttribute(
      "transform",
      transform.replace(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/, (_match, x, y) => {
        const nextX = Number(x) + (originalWidth - nextWidth) / 2;
        const nextY = Number(y) + (originalHeight - nextHeight) / 2;
        return `translate(${formatSvgNumber(nextX)}, ${formatSvgNumber(nextY)})`;
      }),
    );
  }

  return new XMLSerializer().serializeToString(svgElement);
}

export async function renderGeometricConstructionDiagram(spec) {
  if (!PENROSE_DIAGRAM_TYPES.has(spec?.type)) {
    throw new Error('Penrose renderer only accepts type "geometricConstruction", "vectorRelationship", or "setDiagram"');
  }

  const preset = presetName(spec);
  const substanceSource = stringOption(spec, "substanceSource");
  if (spec?.type === "setDiagram" && !stringOption(spec, "styleSource") && !stringOption(spec, "domainSource")) {
    const substance = substanceSource ? substanceWithImplicitInvisibleLabels(substanceSource, preset, spec) : null;
    return renderSetDiagramSvg(spec, substance);
  }

  const presetConfig = PENROSE_PRESETS[preset];
  const [domain, styleBase] = await Promise.all([readFile(presetConfig.domainPath, "utf8"), readFile(presetConfig.stylePath, "utf8")]);
  const substance = substanceSource
    ? substanceWithImplicitInvisibleLabels(substanceSource, preset, spec)
    : specToPresetSubstance(spec, preset);
  const { width, height } = diagramDimensions();
  const styleSpec = substanceSource ? (parseSubstanceDiagramSpec(substance) ?? spec) : spec;
  const styleSource = stringOption(spec, "styleSource") ?? generatedStyleSource(styleBase, styleSpec);
  const domainSource = stringOption(spec, "domainSource") ?? domain;
  const variation = String(spec?.options?.variation ?? "geometry-default");
  const compiled = await compile({ domain: domainSource, style: styleSource, substance, variation });
  if (compiled.isErr()) throw new Error(showError(compiled.error));

  const optimized = optimize(compiled.value);
  if (optimized.isErr()) throw new Error(showError(optimized.error));

  const scalePercent = Number(spec?.options?.scalePercent ?? 100);
  const rawSvg = svgElementToString(await toSVG(optimized.value));
  const displayViewBox = visibleViewBox(rawSvg, width, height);
  const svg = fixedSizeLabelSvg(svgWithDimensions(rawSvg, displayViewBox), scalePercent);
  return {
    svg,
    metadata: {
      width,
      height,
      displayWidth: displayViewBox.width,
      displayHeight: displayViewBox.height,
      viewBox: viewBoxString(displayViewBox),
      scalePercent,
      preset,
      presetLabel: presetConfig.label,
      domainSource,
      substance,
      styleSource,
      style: spec?.style ?? "school",
    },
  };
}
