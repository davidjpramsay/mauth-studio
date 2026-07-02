import type { GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_NETWORK_DATA } from "./diagramNetwork.ts";
import { generatedSetPenroseSubstance } from "./diagramSet.ts";

export const DEFAULT_GEOMETRIC_DATA = {
  objects: [
    { type: "point", name: "A" },
    { type: "point", name: "B" },
    { type: "point", name: "C" },
  ],
  relationships: [
    { type: "triangle", points: ["A", "B", "C"] },
    { type: "rightAngle", at: "B" },
    { type: "labelLength", between: ["A", "B"], value: "5" },
    { type: "labelLength", between: ["B", "C"], value: "12" },
  ],
};

export function penroseSubstanceSource(graphConfig: GraphConfig) {
  const key = "substanceSource";
  const value = graphConfig.options?.[key];
  return typeof value === "string" && value.trim() ? value : generatedPenroseSubstance(graphConfig);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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

function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function geometricSourceData(config: GraphConfig) {
  const fallback = config.type === "network" ? DEFAULT_NETWORK_DATA : DEFAULT_GEOMETRIC_DATA;
  const data = asRecord(config.data) ?? asRecord(fallback);
  const objects = recordArray(data?.objects);
  const relationships = recordArray(data?.relationships);
  return { data: data ?? {}, objects, relationships };
}

function relationshipPointNames(relationship: Record<string, unknown>) {
  const pointSources = [
    relationship.points,
    relationship.between,
    relationship.first,
    relationship.second,
    relationship.segmentA,
    relationship.segmentB,
  ];
  const points = pointSources.flatMap((source) => (Array.isArray(source) ? source : []));
  [relationship.a, relationship.at, relationship.b, relationship.c].forEach((point) => {
    if (typeof point === "string") points.push(point);
  });
  if (Array.isArray(relationship.segments)) {
    relationship.segments.forEach((segment) => {
      if (Array.isArray(segment)) points.push(...segment);
    });
  }
  return points.filter((point): point is string => typeof point === "string");
}

function trianglePoints(relationships: Array<Record<string, unknown>>, fallback: string[]) {
  const triangle = relationships.find((relationship) => relationship.type === "triangle");
  const points = Array.isArray(triangle?.points)
    ? triangle.points.map((point, index) => penroseIdentifier(point, fallback[index] ?? `P${index + 1}`))
    : [];
  return points.length === 3 ? points : fallback.slice(0, 3);
}

function rightAnglePointsForSource(relationships: Array<Record<string, unknown>>, triangle: string[]) {
  const rightAngle = relationships.find((relationship) => relationship.type === "rightAngle");
  if (Array.isArray(rightAngle?.points) && rightAngle.points.length === 3) {
    return rightAngle.points.map((point, index) => penroseIdentifier(point, triangle[index] ?? `P${index + 1}`));
  }
  const at = penroseIdentifier(rightAngle?.at, triangle[1] ?? "B");
  const others = triangle.filter((point) => point !== at);
  return others.length >= 2 ? [others[0], at, others[1]] : null;
}

function penroseMarkCount(value: unknown) {
  const count = Math.round(Number(value ?? 1));
  return Number.isFinite(count) ? Math.max(1, Math.min(3, count)) : 1;
}

function penroseEqualLengthPredicate(count: number) {
  if (count === 2) return "EqualLength2";
  if (count === 3) return "EqualLength3";
  return "EqualLength";
}

function penroseAngleMarkPredicate(count: number) {
  if (count === 2) return "AngleMark2";
  if (count === 3) return "AngleMark3";
  return "AngleMark";
}

function penroseAnglePoints(relationship: Record<string, unknown>) {
  const points = Array.isArray(relationship.points)
    ? relationship.points
    : [relationship.a, relationship.at ?? relationship.b, relationship.c];
  return points.length === 3 ? points.map((point, index) => penroseIdentifier(point, `P${index + 1}`)) : null;
}

export function generatedPenroseSubstance(config: GraphConfig) {
  if (config.type === "setDiagram") return generatedSetPenroseSubstance(config);

  const { data, objects, relationships } = geometricSourceData(config);
  const isNetworkDiagram = config.type === "network";
  const hideNetworkPoints = isNetworkDiagram && data.hidePoints === true;
  const hideNetworkPointLabels = isNetworkDiagram && data.hidePointLabels === true;
  const points = new Map<string, Record<string, unknown>>();
  objects.forEach((object, index) => {
    if (object?.type !== "point") return;
    const name = penroseIdentifier(object.name, `P${index + 1}`);
    points.set(name, { ...object, name });
  });
  relationships.forEach((relationship) => {
    const equalLengthRelatedPoints =
      relationship?.type === "equalLength"
        ? (() => {
            const first =
              relationship.first ?? relationship.segmentA ?? (Array.isArray(relationship.segments) ? relationship.segments[0] : undefined);
            const second =
              relationship.second ?? relationship.segmentB ?? (Array.isArray(relationship.segments) ? relationship.segments[1] : undefined);
            return Array.isArray(first) && Array.isArray(second) ? [...first, ...second] : [];
          })()
        : [];
    const relatedPoints =
      relationship?.type === "triangle" && Array.isArray(relationship.points)
        ? relationship.points
        : relationship?.type === "equalLength"
          ? equalLengthRelatedPoints.filter(Boolean)
          : relationship?.type === "segment" || relationship?.type === "vectorSegment" || relationship?.type === "labelLength"
            ? relationshipPointNames(relationship)
            : relationship?.type === "angleMark" || relationship?.type === "labelAngle"
              ? (penroseAnglePoints(relationship) ?? [])
              : [];
    relatedPoints.forEach((point, index) => {
      const name = penroseIdentifier(point, `P${index + 1}`);
      if (!points.has(name)) points.set(name, { type: "point", name });
    });
  });
  const pointEntries = [...points.values()];
  const pointNames = pointEntries.map((point, index) => penroseIdentifier(point.name, `P${index + 1}`));
  const lines = [`Point ${pointNames.length ? pointNames.join(", ") : "A, B, C"}`];
  pointEntries.forEach((point, index) => {
    const pointName = pointNames[index] ?? `P${index + 1}`;
    const hideLabel = point.hideLabel === true || point.showLabel === false || hideNetworkPointLabels;
    lines.push(penroseLabelStatement(pointName, hideLabel ? "\\," : (point.label ?? pointName)));
  });
  pointEntries.forEach((point, index) => {
    if (point.hidePoint === true || point.hidden === true || point.showPoint === false || hideNetworkPoints) {
      lines.push(`HidePoint(${pointNames[index] ?? `P${index + 1}`})`);
    }
  });
  const namedSegments = relationships
    .filter(
      (relationship) => (relationship.type === "segment" || relationship.type === "vectorSegment") && typeof relationship.name === "string",
    )
    .map((relationship, index) => penroseIdentifier(relationship.name, `s${index + 1}`));
  if (namedSegments.length) lines.push(`NamedSegment ${namedSegments.join(", ")}`);
  const lengthLabels = relationships.filter((relationship) => relationship.type === "labelLength" && Array.isArray(relationship.between));
  const segmentLabels = relationships.filter(
    (relationship) =>
      (relationship.type === "segment" || relationship.type === "vectorSegment") &&
      String(relationship.label ?? relationship.value ?? "").trim().length > 0,
  );
  const angleLabels = relationships.filter((relationship) => relationship.type === "labelAngle" && penroseAnglePoints(relationship));
  const labelDeclarations = [
    ...lengthLabels.map((_, index) => `sideLabel${index + 1}`),
    ...segmentLabels.map((_, index) => `segmentLabel${index + 1}`),
    ...angleLabels.map((_, index) => `angleLabel${index + 1}`),
  ];
  if (labelDeclarations.length) lines.push(`LengthLabel ${labelDeclarations.join(", ")}`);
  relationships.forEach((relationship) => {
    if (relationship.type === "triangle" && Array.isArray(relationship.points) && relationship.points.length === 3) {
      lines.push(`Triangle(${relationship.points.map((point, index) => penroseIdentifier(point, `P${index + 1}`)).join(", ")})`);
    }
    if (relationship.type === "rightAngle") {
      const ordered = rightAnglePointsForSource(relationships, trianglePoints(relationships, pointNames));
      if (ordered) lines.push(`RightAngle(${ordered.join(", ")})`);
    }
    if (relationship.type === "equalLength") {
      const first =
        relationship.first ?? relationship.segmentA ?? (Array.isArray(relationship.segments) ? relationship.segments[0] : undefined);
      const second =
        relationship.second ?? relationship.segmentB ?? (Array.isArray(relationship.segments) ? relationship.segments[1] : undefined);
      if (Array.isArray(first) && Array.isArray(second) && first.length === 2 && second.length === 2) {
        const predicate = penroseEqualLengthPredicate(
          penroseMarkCount(relationship.marks ?? relationship.markCount ?? relationship.tickCount ?? relationship.count),
        );
        lines.push(`${predicate}(${[...first, ...second].map((point, index) => penroseIdentifier(point, `P${index + 1}`)).join(", ")})`);
      } else {
        const segmentNames = Array.isArray(relationship.segmentNames) ? relationship.segmentNames : [first, second];
        if (segmentNames.length !== 2 || !segmentNames.every((name) => typeof name === "string")) return;
        const predicate = penroseEqualLengthPredicate(
          penroseMarkCount(relationship.marks ?? relationship.markCount ?? relationship.tickCount ?? relationship.count),
        );
        lines.push(`${predicate}(${segmentNames.map((name, index) => penroseIdentifier(name, `s${index + 1}`)).join(", ")})`);
      }
    }
    if (relationship.type === "segment") {
      const segmentName = typeof relationship.name === "string" ? penroseIdentifier(relationship.name, "s") : null;
      const points = Array.isArray(relationship.points)
        ? relationship.points
        : Array.isArray(relationship.between)
          ? relationship.between
          : [];
      if (segmentName && points.length === 2) {
        lines.push(`Segment(${segmentName}, ${penroseIdentifier(points[0], "A")}, ${penroseIdentifier(points[1], "B")})`);
      }
    }
    if (relationship.type === "vectorSegment") {
      const segmentName = typeof relationship.name === "string" ? penroseIdentifier(relationship.name, "s") : null;
      const points = Array.isArray(relationship.points)
        ? relationship.points
        : Array.isArray(relationship.between)
          ? relationship.between
          : [];
      if (segmentName && points.length === 2) {
        lines.push(`VectorSegment(${segmentName}, ${penroseIdentifier(points[0], "A")}, ${penroseIdentifier(points[1], "B")})`);
      }
    }
    if (relationship.type === "angleMark") {
      const points = penroseAnglePoints(relationship);
      if (!points) return;
      const predicate = penroseAngleMarkPredicate(
        penroseMarkCount(relationship.marks ?? relationship.markCount ?? relationship.arcCount ?? relationship.count),
      );
      lines.push(`${predicate}(${points.join(", ")})`);
    }
  });
  lengthLabels.forEach((relationship, index) => {
    const between = Array.isArray(relationship.between) ? relationship.between : [];
    if (between.length !== 2) return;
    const labelName = `sideLabel${index + 1}`;
    lines.push(penroseLabelStatement(labelName, relationship.value));
    lines.push(`LabelsSegment(${labelName}, ${penroseIdentifier(between[0], "A")}, ${penroseIdentifier(between[1], "B")})`);
  });
  segmentLabels.forEach((relationship, index) => {
    const points = Array.isArray(relationship.points)
      ? relationship.points
      : Array.isArray(relationship.between)
        ? relationship.between
        : [];
    if (points.length !== 2) return;
    const labelName = `segmentLabel${index + 1}`;
    lines.push(penroseLabelStatement(labelName, relationship.label ?? relationship.value));
    lines.push(`LabelsSegment(${labelName}, ${penroseIdentifier(points[0], "A")}, ${penroseIdentifier(points[1], "B")})`);
  });
  angleLabels.forEach((relationship, index) => {
    const points = penroseAnglePoints(relationship);
    if (!points) return;
    const labelName = `angleLabel${index + 1}`;
    lines.push(penroseLabelStatement(labelName, relationship.value ?? relationship.label));
    lines.push(`LabelsAngle(${labelName}, ${points.join(", ")})`);
  });
  return `${lines.join("\n")}\n`;
}
