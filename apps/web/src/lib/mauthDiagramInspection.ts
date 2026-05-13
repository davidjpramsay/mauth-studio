import type { GraphConfig } from "@mauth-studio/shared";

import { diagramIntentFromText, type MauthDiagramIntent } from "./mauthDiagramIntent.ts";
import { inspectDiagramSemantics, type MauthDiagramSemanticWarning } from "./mauthDiagramSemanticInspection.ts";

export interface MauthDiagramInspectionWarning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
}

export interface MauthDiagramInspection {
  graphType: string;
  expectedIntent?: MauthDiagramIntent;
  checks: string[];
  semanticChecks: string[];
  semanticWarnings: MauthDiagramSemanticWarning[];
  warnings: MauthDiagramInspectionWarning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function graphOptions(config: GraphConfig) {
  return isRecord(config.options) ? config.options : {};
}

function graphData(config: GraphConfig) {
  return isRecord(config.data) ? config.data : {};
}

function graphMetadata(config: GraphConfig) {
  return isRecord(config.metadata) ? config.metadata : {};
}

function graphSubstanceSource(config: GraphConfig) {
  const options = graphOptions(config);
  return typeof options.substanceSource === "string" ? options.substanceSource : "";
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function expectedScalarVectorLabels(rawText: string) {
  const labels: string[] = [];
  for (const match of rawText.matchAll(
    /(?:\\mathbf\s*\{\s*([a-z])\s*\}|\\vec\s*\{\s*([a-z])\s*\}|(?<![A-Za-z])([a-z]))\s*(?:\\cdot|·|•|\.)\s*(?:\\mathbf\s*\{\s*([a-z])\s*\}|\\vec\s*\{\s*([a-z])\s*\}|([a-z]))/gi,
  )) {
    for (const item of match.slice(1)) {
      if (item) labels.push(item.toLowerCase());
    }
  }
  return uniqueSorted(labels);
}

function hasLatexLabel(source: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\bLabel\\s+\\w+\\s+\\$[^\\n$]*(?:\\\\mathbf\\s*\\{\\s*${escaped}\\s*\\}|\\\\vec\\s*\\{\\s*${escaped}\\s*\\}|\\b${escaped}\\b)`,
    "i",
  ).test(source);
}

function inspectScalarProductLabels(config: GraphConfig, contextText: string): MauthDiagramInspectionWarning[] {
  if (config.type !== "geometricConstruction") return [];
  const source = graphSubstanceSource(config);
  if (!source.trim()) return [];
  const expectedLabels = expectedScalarVectorLabels(contextText);
  if (!expectedLabels.length) return [];
  const missing = expectedLabels.filter((label) => !hasLatexLabel(source, label));
  if (!missing.length) return [];
  return [
    {
      code: "scalar-product-vector-labels-missing",
      severity: "warning",
      message: `Scalar-product ray diagram is missing visible vector label${missing.length === 1 ? "" : "s"} ${missing
        .map((label) => `$\\mathbf{${label}}$`)
        .join(", ")}.`,
      path: "graphConfig.options.substanceSource",
    },
  ];
}

function inspectImageSource(config: GraphConfig): MauthDiagramInspectionWarning[] {
  if (config.type !== "image") return [];
  const data = graphData(config);
  const src = data.src;
  if (typeof src === "string" && src.trim()) return [];
  return [
    {
      code: "image-diagram-missing-source",
      severity: "warning",
      message: "Image diagram has no uploaded image source.",
      path: "graphConfig.data.src",
    },
  ];
}

function inspectStatsChart(config: GraphConfig): MauthDiagramInspectionWarning[] {
  if (config.type !== "statsChart") return [];
  const data = graphData(config);
  const chartType = typeof data.chartType === "string" ? data.chartType : "";
  const dataMode = typeof data.dataMode === "string" ? data.dataMode : "";
  const warnings: MauthDiagramInspectionWarning[] = [];
  if (!chartType) {
    warnings.push({
      code: "stats-chart-type-missing",
      severity: "warning",
      message: "Statistics chart has no chartType.",
      path: "graphConfig.data.chartType",
    });
  }
  if (dataMode === "manualProbabilities") {
    const xValues = Array.isArray(data.xValues) ? data.xValues : [];
    const probabilities = Array.isArray(data.probabilities) ? data.probabilities : [];
    if (!xValues.length || !probabilities.length || xValues.length !== probabilities.length) {
      warnings.push({
        code: "stats-chart-manual-probability-data-mismatch",
        severity: "warning",
        message: "Manual probability chart should have matching xValues and probabilities arrays.",
        path: "graphConfig.data.probabilities",
      });
    }
  }
  return warnings;
}

function inspectVector2d(config: GraphConfig): MauthDiagramInspectionWarning[] {
  if (config.type !== "vector2d") return [];
  const metadata = graphMetadata(config);
  const vector2d = isRecord(metadata.vector2d) ? metadata.vector2d : {};
  const vectors = Array.isArray(vector2d.vectors) ? vector2d.vectors : [];
  if (vectors.length) return [];
  return [
    {
      code: "vector2d-vectors-missing",
      severity: "info",
      message: "2D vector diagram has no vector metadata entries.",
      path: "graphConfig.metadata.vector2d.vectors",
    },
  ];
}

function intentWarnings(config: GraphConfig, contextText: string) {
  const intent = diagramIntentFromText(contextText);
  if (!intent || config.type === intent.expectedType) return { intent, warnings: [] as MauthDiagramInspectionWarning[] };
  return {
    intent,
    warnings: [
      {
        code: "diagram-renderer-mismatch",
        severity: "warning" as const,
        message: `${intent.label} appears to use ${config.type}; ${intent.reason}`,
        path: "graphConfig.type",
      },
    ],
  };
}

export function inspectMauthDiagram(config: GraphConfig, contextText: string): MauthDiagramInspection {
  const intent = intentWarnings(config, contextText);
  const semantic = inspectDiagramSemantics(config, contextText);
  const warnings = [
    ...intent.warnings,
    ...inspectImageSource(config),
    ...inspectStatsChart(config),
    ...inspectVector2d(config),
    ...inspectScalarProductLabels(config, contextText),
    ...semantic.warnings,
  ];
  return {
    graphType: config.type,
    expectedIntent: intent.intent,
    checks: [...(intent.intent ? [`intent:${intent.intent.id}`] : []), ...semantic.checks],
    semanticChecks: semantic.checks,
    semanticWarnings: semantic.warnings,
    warnings,
  };
}

export function isAssistantDiagramInspectionWarningBlocking(warning: MauthDiagramInspectionWarning) {
  return (
    warning.code === "diagram-renderer-mismatch" ||
    warning.code === "image-diagram-missing-source" ||
    warning.code === "scalar-product-vector-labels-missing" ||
    warning.code.startsWith("penrose-")
  );
}
