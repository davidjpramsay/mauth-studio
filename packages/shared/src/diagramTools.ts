import { assessDiagramTools, DIAGRAM_CAPABILITIES, type DiagramRequirements } from "./diagramCapabilities.ts";

export interface MauthDiagramIntent {
  id: string;
  expectedType: string;
  label: string;
  reason: string;
}

export const DIAGRAM_TOOLS_URI = "mauth://authoring/diagram-tools/v1";

export const DIAGRAM_TOOLS = [
  {
    id: "graph2d",
    label: "2D graph (JSXGraph)",
    engine: "JSXGraph",
    useFor: "Functions, equations, axes, coordinate-plane plots and calculus graphs.",
  },
  {
    id: "geometry2d",
    label: "2D geometry (JSXGraph)",
    engine: "JSXGraph",
    useFor: "Precisely positioned plane geometry, measurements, composite areas and source-faithful coordinate layouts.",
  },
  {
    id: "vector2d",
    label: "Vectors (JSXGraph)",
    engine: "JSXGraph",
    useFor: "Coordinate vectors, vector sums and scalar-product rays with fixed lengths and angles.",
  },
  { id: "graph3d", label: "3D graph (JSXGraph)", engine: "JSXGraph", useFor: "Rotatable solids, spatial geometry and 3D coordinates." },
  {
    id: "image",
    label: "Image with annotations",
    engine: "Image",
    useFor: "An imported image when a native mathematical diagram cannot reasonably reproduce the source.",
  },
  {
    id: "geometricConstruction",
    label: "Geometric (Penrose)",
    engine: "Penrose",
    useFor:
      "Relationship-based plane geometry: incidence, parallel/perpendicular lines, midpoints, bisectors, equal lengths, circles, tangents and proofs.",
  },
  { id: "network", label: "Network (Penrose)", engine: "Penrose", useFor: "Networks, nodes, links, shortest paths and spanning trees." },
  {
    id: "setDiagram",
    label: "Venn diagram (Penrose)",
    engine: "Penrose",
    useFor: "Two-set or three-set regions, counts, totals and shading.",
  },
  {
    id: "statsChart",
    label: "Statistics chart (Plotly)",
    engine: "Plotly",
    useFor: "Statistical charts, histograms, probability distributions and shaded density curves.",
  },
] as const;

export type DiagramToolId = (typeof DIAGRAM_TOOLS)[number]["id"];
export type DiagramToolSummary = { id: string; label: string; engine: string };

export function diagramToolForType(type?: string | null) {
  const normalized = type === "function" || type === "2d_graph" ? "graph2d" : type === "basic3d" ? "graph3d" : type;
  return DIAGRAM_TOOLS.find((tool) => tool.id === normalized);
}

export function diagramToolSummary(type?: string | null): DiagramToolSummary {
  const tool = diagramToolForType(type);
  return tool
    ? { id: tool.id, label: tool.label, engine: tool.engine }
    : { id: type ?? "unknown", label: `Unknown diagram tool (${type ?? "unspecified"})`, engine: "Unknown" };
}

export const DIAGRAM_TOOL_EXAMPLES = {
  graph2d: {
    type: "graph2d",
    xMin: -3,
    xMax: 3,
    yMin: -1,
    yMax: 5,
    showAxes: true,
    showGrid: true,
    showMinorGrid: false,
    functions: [{ id: "f", expression: "x^2", label: "f", show: true }],
    features: [],
  },
  geometricConstruction: {
    type: "geometricConstruction",
    style: "geometry",
    data: {},
    options: {
      penrosePreset: "geometry",
      substanceSource: [
        "Point O, A, B, C",
        "Circle omega",
        "NamedSegment AB, AC, BC",
        "CircleThrough(omega, O, A)",
        "OnCircle(B, omega)",
        "OnCircle(C, omega)",
        "Midpoint(O, A, B)",
        "Segment(AB, A, B)",
        "Segment(AC, A, C)",
        "Segment(BC, B, C)",
        "EqualLength(A, C, B, C)",
        "Label omega $\\,$",
        "Label O $O$",
        "Label A $A$",
        "Label B $B$",
        "Label C $C$",
      ].join("\n"),
    },
  },
  geometry2d: {
    type: "geometry2d",
    showAxes: false,
    showGrid: false,
    equalScale: true,
    xMin: -1,
    xMax: 5,
    yMin: -1,
    yMax: 4,
    functions: [],
    features: [],
    data: {
      points: [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: 4, y: 0 },
        { id: "C", x: 0, y: 3 },
      ],
      segments: [
        { id: "AB", from: "A", to: "B" },
        { id: "BC", from: "B", to: "C" },
        { id: "CA", from: "C", to: "A" },
      ],
    },
  },
  vector2d: {
    type: "vector2d",
    metadata: {
      vector2d: {
        labelStyle: "boldLower",
        vectors: [{ id: "a", name: "a", label: "a", start: [0, 0], components: [4, 1], labelX: 2.7, labelY: 0.25 }],
      },
    },
  },
  graph3d: {
    type: "graph3d",
    data: {
      hiddenEdges: "auto",
      points: [
        { id: "A", coords: [0, 0, 0] },
        { id: "B", coords: [3, 0, 0] },
        { id: "C", coords: [0, 2, 0] },
        { id: "D", coords: [0, 0, 3] },
      ],
      faces: [
        { id: "ABC", points: ["A", "B", "C"] },
        { id: "ABD", points: ["A", "B", "D"] },
        { id: "ACD", points: ["A", "C", "D"] },
        { id: "BCD", points: ["B", "C", "D"] },
      ],
    },
    metadata: { view3d: { az: 0.52, el: 0.35, bank: 0, zoom: 1 } },
  },
  network: {
    type: "network",
    style: "geometry",
    options: { penrosePreset: "geometry" },
    data: {
      objects: [
        { type: "point", name: "A", label: "A" },
        { type: "point", name: "B", label: "B" },
      ],
      relationships: [{ type: "segment", name: "AB", points: ["A", "B"], label: "5" }],
    },
  },
  setDiagram: {
    type: "setDiagram",
    style: "sets",
    options: { penrosePreset: "sets" },
    data: {
      setCount: 2,
      universe: { name: "U", label: "U" },
      sets: [
        { type: "set", name: "A", label: "A" },
        { type: "set", name: "B", label: "B" },
      ],
      regions: [
        { name: "onlyA", label: "7" },
        { name: "intersection", label: "3", shaded: true },
        { name: "onlyB", label: "5" },
        { name: "outside", label: "2" },
      ],
    },
  },
  statsChart: {
    type: "statsChart",
    style: "exam",
    data: { chartType: "histogram", dataMode: "raw", values: [1, 2, 2, 3, 3, 3, 4, 5], xLabel: "Value", yLabel: "Frequency" },
    options: { widthPx: 420, heightPx: 300, showGrid: true },
  },
  image: { type: "image", data: { src: "<teacher-supplied-image-data-url>", alt: "Describe the supplied image", annotations: [] } },
};

export function diagramToolGuide(
  intent = "",
  renderer?: string,
  coordinateFidelity = false,
  requirements: DiagramRequirements = {},
  advancedSubstance = false,
) {
  const inferred = diagramIntentFromText(intent, { coordinateFidelity });
  const assessment = assessDiagramTools(
    DIAGRAM_TOOLS,
    { ...requirements, ...(coordinateFidelity ? { sourceFidelity: true } : {}) },
    inferred,
    renderer,
    advancedSubstance,
  );
  const selected = renderer
    ? diagramToolForType(renderer)
    : assessment.recommendation
      ? diagramToolForType(assessment.recommendation.id)
      : undefined;
  const selectedAssessment = assessment.alternatives.find((tool) => tool.id === selected?.id);
  return {
    version: 1,
    catalogUri: DIAGRAM_TOOLS_URI,
    recommendation: assessment.recommendation,
    selectedTool: selected ?? null,
    assessment,
    tools: DIAGRAM_TOOLS.map((tool) => ({ ...tool, ...DIAGRAM_CAPABILITIES[tool.id] })),
    examples: renderer || assessment.recommendation ? undefined : DIAGRAM_TOOL_EXAMPLES,
    guidance: [
      "Describe mathematical purpose, relationships, exact positioning/source fidelity, teacher controls, label dragging and solution annotations in requirements before constructing graphConfig.",
      "Requirements are assessed against Mauth's actual adapters. Unsupported combinations and unknown requirements remain unresolved; never silently drop them or substitute a different renderer schema.",
      "Penrose supports general relationship-based geometry, not only circle theorems. Its SVG labels are static; advanced constraint constructions require Advanced Substance and paired solution diagrams.",
      "Recommendations are planning guidance. Follow assessment.verification.requiredChecks, dry-run native actions, validate the construction mathematically, then inspect fresh Student/Solutions renders and teacher controls.",
      "Examples are starting points. Replace image src with the teacher-supplied asset; custom Penrose Substance must use Mauth's supported domain/style.",
    ],
    ...(selected && selectedAssessment?.eligible && selected.id in DIAGRAM_TOOL_EXAMPLES
      ? { exampleGraphConfig: DIAGRAM_TOOL_EXAMPLES[selected.id as keyof typeof DIAGRAM_TOOL_EXAMPLES] }
      : {}),
  };
}

export function normalizedDiagramIntentText(value: string) {
  return value
    .toLowerCase()
    .replace(/\\mathbf\s*\{([a-z])\}/g, "$1")
    .replace(/\\vec\s*\{([a-z])\}/g, "$1")
    .replace(/\\overrightarrow\s*\{([^}]+)\}/g, "$1")
    .replace(/[{}$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function diagramIntentFromText(rawText: string, options: { coordinateFidelity?: boolean } = {}): MauthDiagramIntent | undefined {
  const text = normalizedDiagramIntentText(rawText);
  if (!text) return undefined;

  const hasSetLanguage =
    /\bvenn\b|\bset diagram\b|\buniversal set\b|\bset notation\b|\\cap|\\cup|∩|∪|a\s*['’]?\s*\\?\s*cap|a\s*['’]?\s*∩/i.test(rawText) ||
    /\bsets?\b.*\b(intersection|union|complement)\b/.test(text);
  if (hasSetLanguage) {
    return {
      id: "set-diagram",
      expectedType: "setDiagram",
      label: "Venn/set diagram",
      reason: "Venn and set-region diagrams should use the setDiagram Penrose renderer.",
    };
  }

  const hasStatsLanguage =
    /\bhistogram\b|\bcolumn graph\b|\bbar chart\b|\brelative frequenc(?:y|ies)\b|\bmanual probabilities\b|\bprobability mass\b|\bprobability density\b|\bprobability density function\b|\bnormal curve\b|\bnormal distribution\b|\bsample mean distribution\b|\bdistribution of the sample mean\b|\blikely distribution\b|\bp\s*\(\s*x\s*=\s*x\s*\)|\bp\s*\(\s*x\s*\)/i.test(
      rawText,
    ) || /\bprobability graph\b|\bfrequency graph\b|\bpmf\b|\bpdf\b|\bstats chart\b/.test(text);
  if (hasStatsLanguage) {
    return {
      id: "statistics-chart",
      expectedType: "statsChart",
      label: "statistics chart",
      reason:
        "histograms, column graphs, probability graphs, density curves, normal distributions, and relative-frequency charts should use statsChart.",
    };
  }

  const hasGraph3DLanguage =
    /\brectangular prism\b|\bprism\b|\bpyramid\b|\bcone\b|\bcylinder\b|\bspherical cap\b|\b3[-\s]?d\b|\bthree-dimensional\b|\bmain diagonal\b/i.test(
      rawText,
    ) ||
    /\bcoordinate system shown\b.*\b(?:prism|pyramid|solid|vertices|sphere)\b|\b(?:prism|pyramid|solid|vertices|sphere)\b.*\bcoordinate system shown\b/i.test(
      rawText,
    ) ||
    /\bvertices\b.{0,80}\b(?:prism|pyramid|solid)\b|\b(?:prism|pyramid|solid)\b.{0,80}\bvertices\b/i.test(rawText);
  if (hasGraph3DLanguage) {
    return {
      id: "graph3d",
      expectedType: "graph3d",
      label: "3D geometry diagram",
      reason: "3D solids, coordinate prisms, pyramids, cones, cylinders, spheres, and spherical caps should use graph3d.",
    };
  }

  const hasNetworkLanguage =
    /\bnetwork\b|\bnodes?\b|\badjacency\b|\bdijkstra\b|\bshortest (?:path|route)\b|\bcritical path\b|\bminimum spanning\b/i.test(rawText);
  if (hasNetworkLanguage) {
    return {
      id: "network",
      expectedType: "network",
      label: "network diagram",
      reason: "network diagrams should use network, which is the Penrose network renderer.",
    };
  }

  const hasCoordinateCircle =
    /\bcircle\b/i.test(text) && /\b(?:coordinate (?:plane|axes)|cartesian|equation|plot)\b|\([+-]?\d+\s*,\s*[+-]?\d+\)/i.test(text);
  if (hasCoordinateCircle) {
    return {
      id: "coordinate-circle",
      expectedType: options.coordinateFidelity ? "geometry2d" : "graph2d",
      label: "coordinate circle diagram",
      reason: options.coordinateFidelity
        ? "The requested fixed coordinates/source fidelity call for 2D geometry (JSXGraph)."
        : "A circle specified by an equation or plotted on coordinate axes belongs to 2D graph (JSXGraph).",
    };
  }
  const hasSchematicGeometryLanguage =
    /\bpoints?\s+on\s+a\s+circle\b|\b(?:lie|lies|lying)\s+on\s+(?:the\s+)?(?:same\s+)?circle\b|\bon\s+(?:the\s+)?circumference\b|\bcyclic\s+quadrilateral\b|\bchords?\b|\bcircle theorem\b|\bcircle geometry\b|\bcircle proof\b|\bangle subtended\b|\bangles?\s+in\s+the\s+same\s+segment\b|\balternate\s+segment\b|\bangle\s+in\s+a\s+semicircle\b|\bcircumference\b|\bcircle\b.{0,80}\btangents?\b|\btangents?\b.{0,80}\bcircle\b|\btangent\s+at\s+[a-z]\b|\bparallel\s+to\s+(?:the\s+)?chord\b/i.test(
      rawText,
    );
  if (
    hasSchematicGeometryLanguage ||
    /\bcircle (?:diagram|construction)\b|\bdiameter\b.{0,70}\bcircle\b|\b(?:ruler|compass|geometric proof|circle theorem|angle bisector|perpendicular bisector|midpoint construction|parallel line construction|perpendicular line construction|congruent triangles)\b/i.test(
      text,
    )
  ) {
    return {
      id: "schematic-geometry",
      expectedType: options.coordinateFidelity ? "geometry2d" : "geometricConstruction",
      label: options.coordinateFidelity ? "source-faithful 2D geometry" : "geometric construction",
      reason: options.coordinateFidelity
        ? "The requested fixed coordinates/source fidelity call for 2D geometry (JSXGraph)."
        : "Circle theorems, tangents, chords and geometric proofs should use Geometric (Penrose); use 2D geometry only for deliberate coordinate/source-fidelity requirements.",
    };
  }

  const hasScalarProductLanguage =
    /\bscalar products?\b|\bdot products?\b|(?:\\mathbf\s*\{[a-z]\}|[a-z])\s*(?:\\cdot|·|•)\s*(?:\\mathbf\s*\{[a-z]\}|[a-z])/i.test(
      rawText,
    ) || /\b(?:a|b|c|d)\s*\.\s*(?:a|b|c|d)\b/.test(text);
  const hasCoordinateVectorLanguage =
    /\bcoordinate vectors?\b|\bcomponent vectors?\b|\bvectors?\b.{0,40}\b(?:components?|starting at|from the origin|from origin)\b|\b(?:components?|starting at|from the origin|from origin)\b.{0,40}\bvectors?\b|\\begin\s*\{\s*(?:pmatrix|bmatrix|matrix)\s*\}/i.test(
      rawText,
    ) ||
    /\bvector (?:diagram|sum|addition|subtraction)\b|\bvector\s+[a-z]\s*=\s*\(?\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)?/.test(text);
  if (hasCoordinateVectorLanguage) {
    return {
      id: "coordinate-vector",
      expectedType: "vector2d",
      label: "coordinate vector diagram",
      reason: "coordinate/component vectors on axes should use vector2d, not Penrose geometry or networks.",
    };
  }
  if (hasScalarProductLanguage) {
    return {
      id: "scalar-product-rays",
      expectedType: "vector2d",
      label: "scalar-product ray diagram",
      reason:
        "scalar-product ray diagrams need geometry-preserving labelled vectors, lengths, and angle markers; use vector2d with axes/grid hidden for no-axis source diagrams.",
    };
  }

  const hasTextbookGeometry2DLanguage =
    /\b2d diagram\b|\b2-d diagram\b|\bgeometry diagram\b|\bgeometric diagram\b|\bangle marker\b|\bright[-\s]?angle marker\b|\bequal[-\s]?length\b|\bsame[-\s]?length\b|\bequal[-\s]?angle\b|\bsame[-\s]?angle\b|\bsector\b|\barc length\b|\btriangle diagram\b|\bcomposite area\b|\brelated rates?\b|\blighthouse\b/i.test(
      rawText,
    ) || /\b(?:triangle|sector|arc|angle)\b.{0,80}\b(?:cm|mm|m|degrees?|°)\b/i.test(rawText);
  if (hasTextbookGeometry2DLanguage) {
    return {
      id: "geometry2d",
      expectedType: "geometry2d",
      label: "2D geometry diagram",
      reason: "no-axis textbook geometry diagrams should use geometry2d primitives rather than graph functions or low-level feature rows.",
    };
  }

  const hasFunctionGraphLanguage =
    /\bgraph of\b|\bsketch(?: the)? graph\b|\bfunction\b|\basymptote\b|\bx-axis\b|\by-axis\b|\bcoordinate plane\b|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\)/i.test(
      rawText,
    );
  if (hasFunctionGraphLanguage) {
    return {
      id: "function-graph",
      expectedType: "graph2d",
      label: "2D function/coordinate graph",
      reason: "coordinate-plane function graphs should use graph2d.",
    };
  }

  return undefined;
}
