export interface MauthDiagramIntent {
  id: string;
  expectedType: string;
  label: string;
  reason: string;
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

export function diagramIntentFromText(rawText: string): MauthDiagramIntent | undefined {
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
    /\bnetwork\b|\bnodes?\b|\bedges?\b|\bvertices\b|\badjacency\b|\bshortest path\b|\bcritical path\b|\bminimum spanning\b/i.test(rawText);
  if (hasNetworkLanguage) {
    return {
      id: "network",
      expectedType: "network",
      label: "network diagram",
      reason: "network diagrams should use network, which is the Penrose network renderer.",
    };
  }

  const hasSchematicGeometryLanguage =
    /\bpoints?\s+on\s+a\s+circle\b|\bchords?\b|\bcircle theorem\b|\bangle subtended\b|\bcircumference\b|\btangent\s+at\s+[a-z]\b|\bparallel\s+to\s+(?:the\s+)?chord\b/i.test(
      rawText,
    );
  if (hasSchematicGeometryLanguage) {
    return {
      id: "schematic-geometry",
      expectedType: "geometricConstruction",
      label: "schematic geometry diagram",
      reason: "circle, tangent, chord, and theorem-style geometry diagrams should use geometricConstruction.",
    };
  }

  const hasScalarProductLanguage =
    /\bscalar products?\b|\bdot products?\b|(?:\\mathbf\s*\{[a-z]\}|[a-z])\s*(?:\\cdot|·|•)\s*(?:\\mathbf\s*\{[a-z]\}|[a-z])/i.test(
      rawText,
    ) || /\b(?:a|b|c|d)\s*\.\s*(?:a|b|c|d)\b/.test(text);
  const hasCoordinateVectorLanguage =
    /\bcoordinate vectors?\b|\bcomponent vectors?\b|\bvectors?\b.{0,40}\b(?:components?|starting at|from the origin|from origin)\b|\b(?:components?|starting at|from the origin|from origin)\b.{0,40}\bvectors?\b|\\begin\s*\{\s*(?:pmatrix|bmatrix|matrix)\s*\}/i.test(
      rawText,
    ) || /\bvector\s+[a-z]\s*=\s*\(?\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)?/.test(text);
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
