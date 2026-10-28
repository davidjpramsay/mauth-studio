import type { DiagramToolId } from "./diagramTools.ts";

export const DIAGRAM_PURPOSES = ["geometry", "coordinates", "vectors", "spatial", "network", "sets", "statistics", "image"] as const;
export const DIAGRAM_FEATURES = [
  "planeGeometry",
  "coordinateAxes",
  "fixedCoordinates",
  "functions",
  "implicitRelations",
  "vectors",
  "spatialGeometry",
  "rotation3d",
  "constraintLayout",
  "angleMarks",
  "dimensions",
  "networkLinks",
  "vennRegions",
  "statistics",
  "densityShading",
  "imageAnnotations",
  "draggableLabels",
  "structuredEditing",
  "elementSolutions",
  "pairedSolutions",
] as const;
export const DIAGRAM_RELATIONSHIPS = [
  "incidence",
  "parallel",
  "perpendicular",
  "midpoint",
  "angleBisector",
  "perpendicularBisector",
  "equalLength",
  "circleMembership",
  "tangent",
  "secant",
] as const;
export type DiagramFeature = (typeof DIAGRAM_FEATURES)[number];
export interface DiagramRequirements {
  purpose?: (typeof DIAGRAM_PURPOSES)[number];
  requiredFeatures?: DiagramFeature[];
  relationships?: Array<(typeof DIAGRAM_RELATIONSHIPS)[number]>;
  relationshipMode?: "constrained" | "fixed";
  exactPositioning?: boolean;
  sourceFidelity?: boolean;
  draggableLabels?: boolean;
  teacherControls?: "structured" | "advanced" | "either";
  solutionAnnotations?: "elements" | "paired" | "either";
  otherRequirements?: string[];
}

const features = (...values: DiagramFeature[]) => values;
// These describe Mauth's adapters and controls, not the upstream libraries' full capabilities.
export const DIAGRAM_CAPABILITIES: Record<DiagramToolId, { features: DiagramFeature[]; limitations: string[] }> = {
  graph2d: {
    features: features(
      "coordinateAxes",
      "fixedCoordinates",
      "functions",
      "implicitRelations",
      "angleMarks",
      "draggableLabels",
      "structuredEditing",
      "elementSolutions",
      "pairedSolutions",
    ),
    limitations: ["Functions/features are editable; this adapter does not solve a general geometry constraint system."],
  },
  geometry2d: {
    features: features(
      "planeGeometry",
      "fixedCoordinates",
      "angleMarks",
      "dimensions",
      "draggableLabels",
      "structuredEditing",
      "elementSolutions",
      "pairedSolutions",
    ),
    limitations: ["Geometric relationships must be satisfied by the authored coordinates; marks alone do not enforce them."],
  },
  vector2d: {
    features: features(
      "coordinateAxes",
      "fixedCoordinates",
      "vectors",
      "angleMarks",
      "dimensions",
      "draggableLabels",
      "structuredEditing",
      "elementSolutions",
      "pairedSolutions",
    ),
    limitations: ["Uses numeric vector geometry, not automatic theorem-geometry layout."],
  },
  graph3d: {
    features: features(
      "coordinateAxes",
      "fixedCoordinates",
      "spatialGeometry",
      "rotation3d",
      "dimensions",
      "draggableLabels",
      "structuredEditing",
      "elementSolutions",
      "pairedSolutions",
    ),
    limitations: ["Independent label drags preserve 3D anchors; automatic hidden edges need a complete supported face model."],
  },
  geometricConstruction: {
    features: features(
      "planeGeometry",
      "constraintLayout",
      "draggableLabels",
      "angleMarks",
      "dimensions",
      "structuredEditing",
      "elementSolutions",
      "pairedSolutions",
    ),
    limitations: [
      "Geometry labels can be dragged within the preview frame. Saved label offsets are applied after automatic layout without moving the construction.",
      "The normal editor covers points/segments and basic relationships. General constraint constructions use Advanced Substance, with paired Student/Solutions diagrams for answer annotations.",
      "Absolute coordinates are unsupported. Relative orientation can be specified with Advanced Horizontal/Above constraints; solver layout may otherwise vary.",
    ],
  },
  network: {
    features: features("networkLinks", "structuredEditing", "elementSolutions", "pairedSolutions"),
    limitations: ["Conceptual node/link layout; exact coordinates and independent label dragging are unavailable."],
  },
  setDiagram: {
    features: features("vennRegions", "structuredEditing", "elementSolutions", "pairedSolutions"),
    limitations: [
      "Native two-/three-set regions, totals and shading; arbitrary set topologies and independent label dragging are unavailable.",
    ],
  },
  statsChart: {
    features: features("statistics", "densityShading", "structuredEditing", "elementSolutions", "pairedSolutions"),
    limitations: ["Structured chart data, series and regions are editable; individual chart labels are not draggable."],
  },
  image: {
    features: features("imageAnnotations", "structuredEditing", "elementSolutions", "pairedSolutions"),
    limitations: [
      "The bitmap's mathematical geometry is not editable. Teacher controls and answer layers apply to overlay annotations, size and placement.",
    ],
  },
};

const PURPOSE_FEATURE: Record<NonNullable<DiagramRequirements["purpose"]>, DiagramFeature> = {
  geometry: "planeGeometry",
  coordinates: "coordinateAxes",
  vectors: "vectors",
  spatial: "spatialGeometry",
  network: "networkLinks",
  sets: "vennRegions",
  statistics: "statistics",
  image: "imageAnnotations",
};
const TYPE_PURPOSE: Record<DiagramToolId, NonNullable<DiagramRequirements["purpose"]>> = {
  graph2d: "coordinates",
  geometry2d: "geometry",
  vector2d: "vectors",
  graph3d: "spatial",
  geometricConstruction: "geometry",
  network: "network",
  setDiagram: "sets",
  statsChart: "statistics",
  image: "image",
};
interface ToolEntry {
  id: DiagramToolId;
  label: string;
  engine: string;
  useFor: string;
}
export interface DiagramChoiceHint {
  expectedType: string;
  reason: string;
}

export function assessDiagramTools(
  catalog: readonly ToolEntry[],
  requirements: DiagramRequirements = {},
  hint?: DiagramChoiceHint,
  selectedType?: string,
  advancedSubstance = false,
) {
  const inferredPurpose = hint && TYPE_PURPOSE[hint.expectedType as DiagramToolId];
  const purpose = requirements.purpose ?? inferredPurpose;
  const required = new Set<DiagramFeature>(requirements.requiredFeatures ?? []);
  if (purpose) required.add(PURPOSE_FEATURE[purpose]);
  if (requirements.exactPositioning || requirements.sourceFidelity) required.add("fixedCoordinates");
  if (requirements.draggableLabels) required.add("draggableLabels");
  if (requirements.teacherControls === "structured") required.add("structuredEditing");
  if (requirements.solutionAnnotations === "elements") required.add("elementSolutions");
  if (requirements.solutionAnnotations === "paired" || requirements.solutionAnnotations === "either") required.add("pairedSolutions");
  const hasRelationships = Boolean(requirements.relationships?.length);
  if (hasRelationships) required.add("planeGeometry");
  if (hasRelationships && requirements.relationshipMode === "fixed") required.add("fixedCoordinates");
  if (hasRelationships && requirements.relationshipMode !== "fixed") required.add("constraintLayout");
  const unknown = (requirements.otherRequirements ?? []).filter((value) => value.trim());
  const candidates = catalog
    .map((tool) => {
      const profile = DIAGRAM_CAPABILITIES[tool.id];
      const advanced =
        tool.id === "geometricConstruction" &&
        (advancedSubstance ||
          hint?.expectedType === "geometricConstruction" ||
          (hasRelationships && requirements.relationshipMode !== "fixed"));
      const supported = profile.features.filter(
        (feature) => !advanced || (feature !== "structuredEditing" && feature !== "elementSolutions"),
      );
      const missingFeatures = [...required].filter((feature) => !supported.includes(feature));
      const score =
        (purpose && TYPE_PURPOSE[tool.id] === purpose ? 10 : 0) +
        (hint?.expectedType === tool.id ? 3 : 0) +
        (tool.id === "geometricConstruction" && hasRelationships ? 2 : 0);
      return {
        ...tool,
        eligible: missingFeatures.length === 0 && unknown.length === 0,
        missingFeatures,
        unassessedRequirements: unknown,
        authoringMode: advanced ? "advancedSubstance" : "structured",
        capabilities: supported,
        limitations: profile.limitations,
        score,
      };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.id.localeCompare(b.id));
  const eligible = candidates.filter((candidate) => candidate.eligible);
  const hasRequest = Boolean(purpose || required.size || unknown.length);
  const ambiguous = hasRequest && eligible.length > 1 && eligible[0].score === eligible[1].score;
  const status = !hasRequest ? "catalog" : !eligible.length ? "unsupported" : ambiguous ? "ambiguous" : "recommended";
  const chosen = status === "recommended" ? eligible[0] : undefined;
  const explicitPurpose = Boolean(requirements.purpose || hasRelationships);
  const confidence = !chosen ? "none" : explicitPurpose && eligible.length === 1 ? "high" : hint || explicitPurpose ? "medium" : "low";
  const selected = candidates.find((candidate) => candidate.id === selectedType);
  return {
    policyVersion: 2,
    status,
    confidence,
    requirements: { ...requirements, resolvedPurpose: purpose ?? null, requiredFeatures: [...required] },
    inference: {
      source: requirements.purpose ? "explicitRequirements" : hint ? "wordingHint" : "featuresOnly",
      reason: hint?.reason ?? null,
      note: "Confidence is a policy label, not a probability. Wording hints do not prove the requirements or construction.",
    },
    recommendation: chosen
      ? {
          id: chosen.id,
          label: chosen.label,
          engine: chosen.engine,
          reason: `Supports the assessed requirements in ${chosen.authoringMode} mode.${requirements.purpose ? ` Purpose: ${requirements.purpose}.` : hint ? ` Wording hint: ${hint.reason}` : ""}`,
          authoringMode: chosen.authoringMode,
        }
      : null,
    selectedToolAssessment: selected ?? null,
    alternatives: candidates,
    reviewRequired: !chosen || confidence !== "high" || chosen.authoringMode === "advancedSubstance",
    uncertainty: unknown.length
      ? [`Unassessed requirements: ${unknown.join("; ")}. No renderer is certified for these.`]
      : ambiguous
        ? ["Several renderers satisfy the request equally. Specify the mathematical purpose or the editing/positioning requirements."]
        : !eligible.length && hasRequest
          ? [
              "No current Mauth renderer satisfies every requirement. Relax a requirement explicitly or extend the app; do not silently drop it.",
            ]
          : !explicitPurpose
            ? ["The purpose was inferred or unspecified. Confirm the requirements before constructing the diagram."]
            : [],
    verification: {
      construction: "notRun",
      renderedLayout: "notRun",
      requiredChecks: [
        "Validate the native graphConfig and supported relationships during action preview.",
        "Verify coordinates/constraints against the mathematical givens, including lengths, angles and incidence; annotation text alone is not evidence.",
        "Render fresh Student and Solutions copies; inspect labels, clipping, collisions, annotation visibility and page flow.",
        "Check requested teacher controls in the actual editor. A chooser recommendation is not construction or layout validation.",
      ],
    },
  };
}

export function diagramRequirementIssues(value: unknown): string[] {
  if (value === undefined) return [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["requirements must be an object"];
  const record = value as Record<string, unknown>;
  const issues: string[] = [];
  const choices: Record<string, readonly string[]> = {
    purpose: DIAGRAM_PURPOSES,
    relationshipMode: ["constrained", "fixed"],
    teacherControls: ["structured", "advanced", "either"],
    solutionAnnotations: ["elements", "paired", "either"],
  };
  const arrays: Record<string, readonly string[] | undefined> = {
    requiredFeatures: DIAGRAM_FEATURES,
    relationships: DIAGRAM_RELATIONSHIPS,
    otherRequirements: undefined,
  };
  for (const [key, entry] of Object.entries(record)) {
    if (key in choices) {
      if (typeof entry !== "string" || !choices[key].includes(entry)) issues.push(`requirements.${key} is unsupported`);
    } else if (key in arrays) {
      if (!Array.isArray(entry) || entry.some((item) => typeof item !== "string" || (arrays[key] && !arrays[key]!.includes(item))))
        issues.push(`requirements.${key} must contain supported strings`);
    } else if (["exactPositioning", "sourceFidelity", "draggableLabels"].includes(key)) {
      if (typeof entry !== "boolean") issues.push(`requirements.${key} must be boolean`);
    } else issues.push(`requirements.${key} is unknown; describe unsupported needs in otherRequirements`);
  }
  return issues;
}
