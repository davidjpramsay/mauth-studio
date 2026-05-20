import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import type { MauthDocumentLike, MauthPartLike, MauthQuestionLike, MauthSubpartLike } from "../apps/web/src/lib/mauthActions.ts";
import {
  inspectMauthDocument,
  runMauthAssistantTool,
  type MauthAssistantToolCall,
  type MauthAssistantToolOptions,
} from "../apps/web/src/lib/mauthAssistantTools.ts";

interface TestFrontMatter {
  schoolName: string;
  assessmentTitle: string;
}

interface TestFormattingConfig {
  showMarks: boolean;
}

type TestDocument = MauthDocumentLike<MauthQuestionLike, TestFrontMatter, TestFormattingConfig>;

interface DumpedReplayCase {
  case: string;
  toolCall: unknown;
}

interface AppliedReplayCase {
  caseName: string;
  document: TestDocument;
  expectedDiagramTypes: string[];
}

type PreviewReplayView = "student" | "solutions";
type PreviewPageMode = "flow" | "a4";

interface BrowserDiagramMetric {
  view?: PreviewReplayView;
  caseName: string;
  type: string;
  chartType: string;
  hasSlopeField: boolean;
  width: number;
  height: number;
  primitiveCount: number;
  labelCount: number;
  plotlyBarCount: number;
  plotlyLineCount: number;
  expectedFunctionColors: string[];
  functionStrokeCount: number;
  expectedGraph3DPointCount: number;
  expectedGraph3DSegmentCount: number;
  expectedGraph3DFaceCount: number;
  expectedGraph3DPointLabelCount: number;
  expectedGraph3DSegmentLabelCount: number;
  expectedGraph3DFaceLabelCount: number;
  expectedGraph3DDimensionLabelCount: number;
  graph3DPointLabelCount: number;
  graph3DSegmentLabelCount: number;
  graph3DFaceLabelCount: number;
  graph3DDimensionLabelCount: number;
  expectedGraph3DSolidKinds: string[];
  renderedGraphic: boolean;
  text: string;
  requiredLabels: string[];
  missingLabels: string[];
  labelCollisionCount: number;
  labelCollisionPairs: string[];
  vector2dAngleMarkerIssues: string[];
  graph3DLabelQualityIssues: string[];
}

interface BrowserRenderedWarning {
  view?: PreviewReplayView;
  code?: string;
  message?: string;
  severity?: string;
  anchor?: string;
  caseName?: string;
}

interface BrowserRenderedMetrics {
  warnings?: BrowserRenderedWarning[];
  anchors?: Array<{
    anchor?: string;
    warnings?: BrowserRenderedWarning[];
  }>;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ROOT = path.join(ROOT, "apps", "web");
const API_ROOT = path.join(ROOT, "apps", "api");
const TEMP_ROOT = path.join(WEB_ROOT, ".tmp", `assistant-preview-replay-smoke-${process.pid}`);
const WORKBENCH_ROOT = path.resolve(ROOT, "..", "mauth-workbench");
const OUTPUT_ROOT =
  process.env.MAUTH_ASSISTANT_PREVIEW_SMOKE_OUTPUT ?? path.join(WORKBENCH_ROOT, "verification", "assistant-preview-replay-smoke");
const DEFAULT_CASE_GROUP = "local-real-exams-preview";

function argValue(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : fallback;
}

function previewViews() {
  const rawValue = argValue("--view", process.env.MAUTH_ASSISTANT_PREVIEW_VIEW ?? "both")
    .trim()
    .toLowerCase();
  if (rawValue === "student") return ["student"] as const;
  if (rawValue === "solutions" || rawValue === "solution") return ["solutions"] as const;
  if (rawValue === "both") return ["student", "solutions"] as const;
  throw new Error(`Unsupported --view ${JSON.stringify(rawValue)}. Use student, solutions, or both.`);
}

function previewPageMode(): PreviewPageMode {
  const rawValue = argValue("--page-mode", process.env.MAUTH_ASSISTANT_PREVIEW_PAGE_MODE ?? "flow")
    .trim()
    .toLowerCase();
  if (rawValue === "flow" || rawValue === "a4") return rawValue;
  throw new Error(`Unsupported --page-mode ${JSON.stringify(rawValue)}. Use flow or a4.`);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a free local port"));
      });
    });
  });
}

async function waitForServer(url: string, child: ReturnType<typeof spawn>, logs: string[]) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before serving ${url}\n${logs.join("")}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite may still be pre-bundling dependencies.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}\n${logs.join("")}`);
}

async function stopProcess(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(2500).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textBlock(id: string, text: string): ContentBlock {
  return { id, kind: "text", text };
}

function question(id: string, marks: number, blocks: ContentBlock[] = [], parts: MauthPartLike[] = []): MauthQuestionLike {
  return {
    id,
    marks,
    contentBlocks: blocks,
    parts,
    itemOrder: [
      ...blocks.map((block) => ({ kind: "block" as const, id: block.id })),
      ...parts.map((part) => ({ kind: "part" as const, id: part.id })),
    ],
  };
}

function documentFixture(title: string): TestDocument {
  const blocks = [textBlock("q1-placeholder", "Placeholder question.")];
  return {
    frontMatter: {
      schoolName: "Mauth School",
      assessmentTitle: title,
    },
    formattingConfig: { showMarks: true },
    questions: [question("q1", 0, blocks)],
  };
}

function normalizeToolCall(rawCall: unknown): MauthAssistantToolCall {
  if (!isRecord(rawCall)) throw new Error("Local fixture returned a non-object tool call");
  const toolName = typeof rawCall.mauthToolName === "string" ? rawCall.mauthToolName : rawCall.name;
  if (typeof toolName !== "string") throw new Error("Local fixture tool call is missing mauthToolName/name");
  return {
    name: toolName as MauthAssistantToolCall["name"],
    arguments: rawCall.mauthArguments ?? rawCall.arguments,
  };
}

function graphTypeFromDiagram(value: unknown) {
  if (!isRecord(value)) return null;
  const graphConfig = value.graphConfig;
  if (!isRecord(graphConfig) || typeof graphConfig.type !== "string") return null;
  return graphConfig.type;
}

function expectedDiagramTypes(args: unknown) {
  if (!isRecord(args)) return [];
  const types: string[] = [];
  const collectFromRecord = (record: Record<string, unknown>) => {
    for (const key of ["diagram", "solutionDiagram"]) {
      const single = graphTypeFromDiagram(record[key]);
      if (single) types.push(single);
    }
    for (const key of ["diagrams", "solutionDiagrams"]) {
      if (!Array.isArray(record[key])) continue;
      for (const diagram of record[key]) {
        const diagramType = graphTypeFromDiagram(diagram);
        if (diagramType) types.push(diagramType);
      }
    }
    for (const key of ["parts", "subparts"]) {
      if (!Array.isArray(record[key])) continue;
      for (const item of record[key]) {
        if (isRecord(item)) collectFromRecord(item);
      }
    }
  };
  collectFromRecord(args);
  return types;
}

function collectDocumentDiagrams(document: TestDocument) {
  const diagrams: Array<{ block: Extract<ContentBlock, { kind: "diagram" }>; graphConfig: GraphConfig }> = [];
  const visitBlocks = (blocks: readonly ContentBlock[] | undefined) => {
    for (const block of blocks ?? []) {
      if (block.kind === "diagram" && block.graphConfig) diagrams.push({ block, graphConfig: block.graphConfig });
      if (block.kind === "columns") {
        for (const column of block.columns) visitBlocks(column);
      }
    }
  };
  const visitSubparts = (subparts: readonly MauthSubpartLike[] | undefined) => {
    for (const subpart of subparts ?? []) visitBlocks(subpart.contentBlocks);
  };
  const visitParts = (parts: readonly MauthPartLike[] | undefined) => {
    for (const part of parts ?? []) {
      visitBlocks(part.contentBlocks);
      visitSubparts(part.subparts);
    }
  };
  for (const item of document.questions) {
    visitBlocks(item.contentBlocks);
    visitParts(item.parts);
  }
  return diagrams;
}

function blocksFromQuestions(questions: readonly MauthQuestionLike[]) {
  const blocks: ContentBlock[] = [];
  const pushBlocks = (items: readonly ContentBlock[] | undefined) => {
    for (const block of items ?? []) {
      blocks.push(block);
      if (block.kind === "columns") {
        for (const column of block.columns) pushBlocks(column);
      }
    }
  };
  for (const questionItem of questions) {
    pushBlocks(questionItem.contentBlocks);
    for (const part of questionItem.parts ?? []) {
      pushBlocks(part.contentBlocks);
      for (const subpart of part.subparts ?? []) pushBlocks(subpart.contentBlocks);
    }
  }
  return blocks;
}

function toolOptions(): MauthAssistantToolOptions<MauthQuestionLike, TestFrontMatter, TestFormattingConfig> {
  return {
    validateDocument: (nextDocument) => {
      const inspection = inspectMauthDocument(nextDocument);
      return {
        questions: inspection.counts.questions,
        marksTotal: inspection.counts.marksTotal,
        modules: inspection.counts.modules,
      };
    },
    validateSolutions: (questions) => ({
      questions: questions.length,
      solutionOnlyModules: blocksFromQuestions(questions).filter((block) => block.visibility === "solution").length,
    }),
  };
}

function formatToolFailure(result: ReturnType<typeof runMauthAssistantTool>) {
  return [
    result.error ?? "tool returned ok=false",
    ...(Array.isArray((result.data as { validationIssues?: unknown[] } | undefined)?.validationIssues)
      ? ((result.data as { validationIssues?: unknown[] }).validationIssues ?? []).map((issue) => JSON.stringify(issue))
      : []),
  ].join("\n");
}

function loadReplayCases(caseGroup: string): DumpedReplayCase[] {
  const result = spawnSync("uv", ["run", "python", "../../scripts/assistant-live-eval.py", "--case", caseGroup, "--dump-local-calls"], {
    cwd: API_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not load local replay fixtures for ${caseGroup}\n${result.stdout}\n${result.stderr}`);
  }
  const jsonStart = result.stdout.indexOf("{");
  if (jsonStart < 0) throw new Error(`Local replay fixture dump did not contain JSON:\n${result.stdout}`);
  const payload = JSON.parse(result.stdout.slice(jsonStart)) as { cases?: DumpedReplayCase[] };
  if (!Array.isArray(payload.cases)) throw new Error("Local replay fixture dump is missing cases[]");
  return payload.cases;
}

function applyReplayCase(replayCase: DumpedReplayCase): AppliedReplayCase {
  const call = normalizeToolCall(replayCase.toolCall);
  const document = documentFixture(`Assistant preview replay: ${replayCase.case}`);
  const options = toolOptions();
  const result = runMauthAssistantTool(document, call, options);
  if (!result.ok || !result.document) {
    throw new Error(`Replay ${replayCase.case} failed at tool boundary:\n${formatToolFailure(result)}`);
  }

  const validation = runMauthAssistantTool(result.document, { name: "mauth.validation.run", arguments: { mode: "both" } }, options);
  if (!validation.ok) {
    throw new Error(`Replay ${replayCase.case} failed document validation:\n${formatToolFailure(validation)}`);
  }

  const inspection = inspectMauthDocument(result.document);
  const actualTypes = collectDocumentDiagrams(result.document).map((diagram) => diagram.graphConfig.type);
  const expectedTypes = expectedDiagramTypes(call.arguments);
  const failures: string[] = [];
  for (const expectedType of expectedTypes) {
    if (!actualTypes.includes(expectedType))
      failures.push(`expected rendered document to contain ${expectedType}; got ${actualTypes.join(", ")}`);
  }
  if (expectedTypes.length && actualTypes.length !== expectedTypes.length) {
    failures.push(`expected ${expectedTypes.length} diagram(s); got ${actualTypes.length}`);
  }
  if (!inspection.counts.questions) failures.push("document inspection found no questions after replay");
  if (failures.length) throw new Error(`Replay ${replayCase.case} failed deterministic document checks:\n${failures.join("\n")}`);

  return {
    caseName: replayCase.case,
    document: result.document,
    expectedDiagramTypes: expectedTypes,
  };
}

function safeEmbeddedJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

async function writeFixture(port: number, cases: AppliedReplayCase[]) {
  await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  await fs.mkdir(path.join(TEMP_ROOT, "src"), { recursive: true });
  await fs.writeFile(
    path.join(TEMP_ROOT, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8" /><title>assistant preview replay smoke</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
  );
  await fs.writeFile(
    path.join(TEMP_ROOT, "vite.config.mjs"),
    `import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: ${JSON.stringify(TEMP_ROOT)},
  plugins: [react()],
  resolve: {
    alias: {
      "@": ${JSON.stringify(path.join(WEB_ROOT, "src"))},
      "@mauth-studio/shared": ${JSON.stringify(path.join(ROOT, "packages", "shared", "src", "index.ts"))},
      "@mauth-studio/diagram-plotly": ${JSON.stringify(path.join(ROOT, "packages", "diagram-plotly", "src", "index.ts"))}
    }
  },
  server: {
    host: "127.0.0.1",
    port: ${port},
    strictPort: true,
    fs: { allow: [${JSON.stringify(ROOT)}, ${JSON.stringify(WEB_ROOT)}] }
  }
});
`,
  );
  await fs.writeFile(
    path.join(TEMP_ROOT, "src", "replay.css"),
    `.replay-stage {
  background: #f1f5f9;
  display: flex;
  flex-direction: column;
  gap: 32px;
  min-height: 100vh;
  padding: 24px;
}

.replay-case-title {
  color: #334155;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0 0 8px;
}

.replay-page {
  --test-content-gap: 0.62rem;
  --test-solution-border-color: #c1121f;
  --test-solution-color: #c1121f;
  box-sizing: border-box;
  font-family: "Times New Roman", Georgia, serif;
  font-size: 11pt;
  line-height: 1.48;
  min-height: var(--a4-page-height, 1122.519685px);
  overflow: visible;
}

.replay-page[data-replay-page-mode="a4"] {
  height: var(--a4-page-height, 1122.519685px);
  min-height: 0;
  overflow: hidden;
}

.replay-page .a4-page-content {
  min-height: 0;
}

.replay-question {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.test-question-header,
.test-question-part,
.test-question-subpart {
  align-items: baseline;
  display: grid;
  gap: 1rem;
  grid-template-columns: 2.6rem minmax(0, 1fr) max-content;
}

.test-question-header {
  align-items: start;
}

.test-question-mark,
.test-part-mark {
  white-space: nowrap;
}

.test-question-row-with-diagram {
  align-items: start;
}

.test-part-content,
.test-question-content {
  min-width: 0;
}

.test-space-block {
  border-bottom: 1px solid transparent;
  height: calc(var(--space-lines, 3) * 1.55em);
}

.replay-diagram-frame {
  max-width: 100%;
  overflow: hidden;
}
`,
  );
  await fs.writeFile(
    path.join(TEMP_ROOT, "src", "main.tsx"),
    `import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import "./replay.css";
import { StatsChartDiagram } from "@/components/diagrams/StatsChartDiagram";
import { PreviewContentBlocks as PreviewContentBlocksBase, type PreviewContentRenderers, type PreviewContentRuntime } from "@/components/preview/PreviewContentBlocks";
import { FunctionGraph } from "@/components/graphs/FunctionGraph";
import { Basic3DGraph } from "@/components/graphs/Basic3DGraph";
import { Vector2DGraph } from "@/components/graphs/Vector2DGraph";
import { Latex } from "@/components/Latex";
import { collectRenderedPreviewMetrics } from "@/lib/mauthPreviewMetrics";
import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

const replayCases = ${safeEmbeddedJson(cases)} as Array<{ caseName: string; document: any; expectedDiagramTypes: string[] }>;
const searchParams = new URLSearchParams(window.location.search);
const previewView = searchParams.get("view") === "student" ? "student" : "solutions";
const pageMode = searchParams.get("pageMode") === "a4" ? "a4" : "flow";
const showSolutions = previewView === "solutions";
const MARK_PATTERN = /\\[\\[\\s*marks\\s*:\\s*(\\d+)\\s*\\]\\]/gi;

function alphaLabel(index: number) {
  return String.fromCharCode(97 + Math.max(0, index));
}

function romanLabel(index: number) {
  return ["i", "ii", "iii", "iv", "v", "vi"][Math.max(0, index)] ?? String(index + 1);
}

function choiceLabel(style: string | undefined, index: number) {
  if (style === "lower-alpha") return alphaLabel(index);
  if (style === "roman") return romanLabel(index);
  return String.fromCharCode(65 + Math.max(0, index));
}

function diagramAlignmentClass(alignment?: string) {
  if (alignment === "left") return "justify-start";
  if (alignment === "right") return "justify-end";
  return "justify-center";
}

function graphHeight(graphConfig?: GraphConfig | null) {
  return Number(graphConfig?.heightPx ?? 300);
}

function isContentBlockVisible(block: ContentBlock, showSolutions: boolean) {
  if (block.visibility === "solution") return showSolutions;
  return true;
}

function isSolutionTextBlock(block: ContentBlock) {
  return block.kind === "text" && block.visibility === "solution";
}

function measuredLineHeightPx(element: HTMLElement) {
  const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
  return Number.isFinite(lineHeight) ? lineHeight : 18;
}

function normalizeChoiceItems(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function normalizeChoiceListLayout(value: unknown) {
  return value === "two-column" || value === "inline" ? value : "one-column";
}

function normalizeTableBlock(block: any) {
  return {
    tableAlign: block.tableAlign ?? "center",
    cellAlignment: block.cellAlignment ?? "center",
    headers: Array.isArray(block.headers) ? block.headers.map(String) : [],
    rows: Array.isArray(block.rows) ? block.rows.map((row: unknown[]) => (Array.isArray(row) ? row.map(String) : [])) : [],
    showHeader: block.showHeader !== false,
  };
}

function plainTableRows(table: { showHeader: boolean; headers: string[]; rows: string[][] }) {
  return table.showHeader && table.headers.length ? [table.headers, ...table.rows] : table.rows;
}

function previewSelectionAttr(anchor: string | undefined, activeAnchor?: string) {
  return anchor && activeAnchor === anchor ? "true" : undefined;
}

function spaceLines(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 3;
}

function SolutionMarkTicks({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="solution-mark-ticks" aria-label={count + " mark ticks"}>
      {Array.from({ length: count }).map((_, index) => (
        <span key={index}>✓</span>
      ))}
    </span>
  );
}

function MathSvg({ source, display }: { source: string; display: boolean }) {
  if (display) {
    return (
      <div className="test-display-math">
        <Latex latex={source} block />
      </div>
    );
  }
  return <Latex latex={source} />;
}

function renderMathPieces(source: string, keyPrefix: string) {
  const parts: React.ReactNode[] = [];
  const pattern = /\\$\\$([\\s\\S]+?)\\$\\$|\\$([^$\\n]+?)\\$/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (match.index > cursor) parts.push(<span key={keyPrefix + "-t-" + cursor}>{source.slice(cursor, match.index)}</span>);
    const display = match[1] !== undefined;
    parts.push(<MathSvg key={keyPrefix + "-m-" + match.index} source={display ? match[1] : match[2]} display={display} />);
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) parts.push(<span key={keyPrefix + "-t-" + cursor}>{source.slice(cursor)}</span>);
  return parts;
}

function MixedMath({ source, showSolutionMarks = false }: { source: string; showSolutionMarks?: boolean }) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  MARK_PATTERN.lastIndex = 0;
  while ((match = MARK_PATTERN.exec(source))) {
    if (match.index > cursor) nodes.push(...renderMathPieces(source.slice(cursor, match.index), "chunk-" + cursor));
    if (showSolutionMarks) nodes.push(<SolutionMarkTicks key={"mark-" + match.index} count={Number(match[1]) || 0} />);
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) nodes.push(...renderMathPieces(source.slice(cursor), "chunk-" + cursor));
  return <div className="mixed-math">{nodes}</div>;
}

function MauthDiagram({ graphConfig }: { graphConfig?: GraphConfig | null }) {
  const config = graphConfig ?? ({ type: "graph2d" } as GraphConfig);
  const type = String(config.type ?? "graph2d");
  const data = (config as any).data && typeof (config as any).data === "object" ? (config as any).data : {};
  const chartType = type === "statsChart" ? String(data.chartType ?? "") : "";
  const hasSlopeField = type === "graph2d" && Boolean(data.slopeField);
  const requiredLabels = expectedDiagramLabels(config);
  const expectedFunctionColors = expectedGraph2DFunctionColors(config);
  const graph3dExpectations = expectedGraph3DExpectations(config);
  const vector2dAngleMarkers = expectedVector2DAngleMarkers(config);
  let content: React.ReactNode;
  if (type === "statsChart") content = <StatsChartDiagram graphConfig={config} />;
  else if (type === "vector2d") content = <Vector2DGraph graphConfig={config} />;
  else if (type === "graph3d" || type === "basic3d") content = <Basic3DGraph graphConfig={config} />;
  else content = <FunctionGraph graphConfig={config} />;
  return (
    <div
      className="replay-diagram-frame"
      data-replay-diagram-frame="true"
      data-diagram-type={type}
      data-chart-type={chartType}
      data-has-slope-field={hasSlopeField ? "true" : undefined}
      data-required-labels={JSON.stringify(requiredLabels)}
      data-function-colors={JSON.stringify(expectedFunctionColors)}
      data-graph3d-point-count={graph3dExpectations.pointCount}
      data-graph3d-segment-count={graph3dExpectations.segmentCount}
      data-graph3d-face-count={graph3dExpectations.faceCount}
      data-graph3d-point-label-count={graph3dExpectations.pointLabelCount}
      data-graph3d-segment-label-count={graph3dExpectations.segmentLabelCount}
      data-graph3d-face-label-count={graph3dExpectations.faceLabelCount}
      data-graph3d-dimension-label-count={graph3dExpectations.dimensionLabelCount}
      data-graph3d-solid-kinds={JSON.stringify(graph3dExpectations.solidKinds)}
      data-vector2d-angle-markers={JSON.stringify(vector2dAngleMarkers)}
    >
      {content}
    </div>
  );
}

function stripLatexDelimiters(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) return trimmed.slice(2, -2).trim();
  if (trimmed.startsWith("$") && trimmed.endsWith("$")) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function expectedLabelText(value: unknown) {
  if (typeof value !== "string") return "";
  return stripLatexDelimiters(value)
    .replace(/\\\\+underset\\s*\\{\\s*\\\\+sim\\s*\\}\\s*\\{\\s*([^}]*)\\s*\\}/g, "$1")
    .replace(/\\\\+(?:mathbf|vec|overrightarrow|overleftrightarrow)\\s*\\{([^}]*)\\}/g, "$1")
    .replace(/\\\\+(?:text|mathrm)\\s*\\{([^}]*)\\}/g, "$1")
    .replace(/\\\\+(?:mathbf|vec|text|mathrm)\\s+([A-Za-z0-9]+)/g, "$1")
    .replace(/\\\\+(?:left|right|displaystyle|textstyle)\\b/g, "")
    .replace(/[{}$]/g, " ")
    .replace(/\\\\+[,;:! ]/g, " ")
    .replace(/\\\\+_/g, "_")
    .replace(/\\\\+/g, " ")
    .trim();
}

function expectedDiagramLabels(graphConfig?: GraphConfig | null) {
  const config = (graphConfig ?? {}) as any;
  const type = String(config.type ?? "");
  const labels: string[] = [];
  if (type === "graph2d" || type === "2d_graph" || type === "function") {
    for (const key of ["xAxisLabel", "yAxisLabel"]) {
      const label = expectedLabelText(config[key]);
      if (label) labels.push(label);
    }
    for (const feature of Array.isArray(config.features) ? config.features : []) {
      if (feature?.kind !== "point") continue;
      if (feature?.show === false) continue;
      const label = expectedLabelText(feature.label);
      if (label) labels.push(label);
    }
    const highlightedPoints = config.data?.slopeField?.highlightedPoints;
    for (const point of Array.isArray(highlightedPoints) ? highlightedPoints : []) {
      const label = expectedLabelText(point?.label);
      if (label) labels.push(label);
    }
  }
  if (type === "graph3d" || type === "basic3d") {
    for (const point of Array.isArray(config.data?.points) ? config.data.points : []) {
      if (point?.show === false) continue;
      const label = expectedLabelText(point?.label);
      if (label) labels.push(label);
    }
    for (const segment of Array.isArray(config.data?.segments) ? config.data.segments : []) {
      if (segment?.show === false) continue;
      const label = expectedLabelText(segment?.label);
      if (label) labels.push(label);
    }
    const dimensions = Array.isArray(config.data?.dimensions)
      ? config.data.dimensions
      : Array.isArray(config.data?.dimensionLines)
        ? config.data.dimensionLines
        : [];
    for (const dimension of dimensions) {
      if (dimension?.show === false) continue;
      const label = expectedLabelText(dimension?.label);
      if (label) labels.push(label);
    }
  }
  if (type === "vector2d") {
    const vector2d = config.metadata?.vector2d ?? {};
    for (const vector of Array.isArray(vector2d.vectors) ? vector2d.vectors : []) {
      if (vector?.show === false) continue;
      const label = expectedLabelText(vector?.label ?? vector?.name ?? vector?.id);
      if (label) labels.push(label);
    }
    for (const segmentLabel of Array.isArray(vector2d.segmentLabels) ? vector2d.segmentLabels : []) {
      if (segmentLabel?.show === false) continue;
      const label = expectedLabelText(segmentLabel?.label);
      if (label) labels.push(label);
    }
    for (const angleMarker of Array.isArray(vector2d.angleMarkers) ? vector2d.angleMarkers : []) {
      if (angleMarker?.show === false) continue;
      const label = expectedLabelText(angleMarker?.label);
      if (label) labels.push(label);
    }
  }
  if (type === "statsChart") {
    for (const key of ["title", "xLabel", "yLabel"]) {
      const label = expectedLabelText(config.data?.[key]);
      if (label) labels.push(label);
    }
  }
  return [...new Set(labels)].filter((label) => label.length <= 48);
}

function expectedVector2DAngleMarkers(graphConfig?: GraphConfig | null) {
  const config = (graphConfig ?? {}) as any;
  const vector2d = config.metadata?.vector2d ?? {};
  if (String(config.type ?? "") !== "vector2d") return [];
  return (Array.isArray(vector2d.angleMarkers) ? vector2d.angleMarkers : [])
    .filter((marker: any) => marker?.show !== false)
    .map((marker: any, index: number) => ({
      id: String(marker?.id ?? "angle-marker-" + (index + 1)),
      from: String(marker?.from ?? marker?.vectorA ?? ""),
      to: String(marker?.to ?? marker?.vectorB ?? ""),
      rightAngle: marker?.rightAngle === true || marker?.kind === "rightAngle" || marker?.type === "rightAngle",
      label: expectedLabelText(marker?.label),
    }))
    .filter((marker: any) => marker.from && marker.to);
}

function expectedGraph2DFunctionColors(graphConfig?: GraphConfig | null) {
  const config = (graphConfig ?? {}) as any;
  const type = String(config.type ?? "");
  if (type !== "graph2d" && type !== "2d_graph" && type !== "function") return [];
  const neutralColors = new Set(["#000", "#000000", "#111", "#111111", "#111827"]);
  return [
    ...new Set(
      (Array.isArray(config.functions) ? config.functions : [])
        .filter((entry: any) => entry?.show !== false && typeof entry?.color === "string" && !neutralColors.has(entry.color.toLowerCase()))
        .map((entry: any) => entry.color),
    ),
  ];
}

function expectedGraph3DExpectations(graphConfig?: GraphConfig | null) {
  const config = (graphConfig ?? {}) as any;
  const type = String(config.type ?? "");
  const data = config.data && typeof config.data === "object" ? config.data : {};
  if (type !== "graph3d" && type !== "basic3d") {
    return {
      pointCount: 0,
      segmentCount: 0,
      faceCount: 0,
      pointLabelCount: 0,
      segmentLabelCount: 0,
      faceLabelCount: 0,
      dimensionLabelCount: 0,
      solidKinds: [] as string[],
    };
  }
  const points = Array.isArray(data.points) ? data.points : Array.isArray(data.vertices) ? data.vertices : [];
  const segments = Array.isArray(data.segments) ? data.segments : Array.isArray(data.edges) ? data.edges : [];
  const faces = Array.isArray(data.faces) ? data.faces : [];
  const dimensions = Array.isArray(data.dimensions) ? data.dimensions : Array.isArray(data.dimensionLines) ? data.dimensionLines : [];
  const solids = Array.isArray(data.solids) ? data.solids : Array.isArray(data.surfaces) ? data.surfaces : [];
  return {
    pointCount: points.length,
    segmentCount: segments.length,
    faceCount: faces.length,
    pointLabelCount: points.filter((point: any) => point?.show !== false && expectedLabelText(point?.label)).length,
    segmentLabelCount: segments.filter((segment: any) => segment?.show !== false && expectedLabelText(segment?.label)).length,
    faceLabelCount: faces.filter((face: any) => face?.show !== false && expectedLabelText(face?.label)).length,
    dimensionLabelCount: dimensions.filter((dimension: any) => dimension?.show !== false && expectedLabelText(dimension?.label)).length,
    solidKinds: [
      ...new Set(
        solids
          .map((solid: any) => (typeof solid?.kind === "string" ? solid.kind : typeof solid?.type === "string" ? solid.type : ""))
          .filter(Boolean)
          .map((kind: string) => kind.toLowerCase().replace(/[^a-z]/g, "")),
      ),
    ],
  };
}

const previewContentRuntime: PreviewContentRuntime = {
  choiceLabel,
  diagramAlignmentClass,
  effectiveDiagramTextSide: (block, hasBesideContent) => block.diagramTextSide ?? (hasBesideContent ? "right" : "none"),
  graphHeight,
  isContentBlockVisible,
  isDiagramBesideContentBlock: (block, showSolutions) => Boolean(block && block.kind === "text" && isContentBlockVisible(block, showSolutions)),
  isSolutionTextBlock,
  measuredLineHeightPx,
  normalizeChoiceItems,
  normalizeChoiceListLayout,
  normalizeTableBlock,
  plainTableRows,
  previewSelectionAttr,
  solutionSlotToleranceLines: () => 1,
  spaceLines,
  visibilityReplacementSlotAt: () => null,
};

const previewContentRenderers: PreviewContentRenderers = {
  renderDiagram: (props) => <MauthDiagram graphConfig={props.graphConfig} />,
  renderMath: (source, options) => <MixedMath source={source} showSolutionMarks={Boolean(options?.showSolutionMarks)} />,
  renderSolutionMarkTicks: (count) => <SolutionMarkTicks count={count} />,
};

function PreviewContentBlocks(props: Omit<React.ComponentProps<typeof PreviewContentBlocksBase>, "runtime" | "renderers">) {
  return <PreviewContentBlocksBase {...props} runtime={previewContentRuntime} renderers={previewContentRenderers} />;
}

function markLabel(marks: unknown) {
  const numeric = Number(marks);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return "[" + numeric + (numeric === 1 ? " mark" : " marks") + "]";
}

function PartPreview({ question, part, index, showSolutions }: { question: any; part: any; index: number; showSolutions: boolean }) {
  const blocks = Array.isArray(part.contentBlocks) ? part.contentBlocks : [];
  const subparts = Array.isArray(part.subparts) ? part.subparts : [];
  const firstVisibleBlockId = blocks.find((block: ContentBlock) => isContentBlockVisible(block, showSolutions))?.id;
  return (
    <section className="test-preview-segment test-part-group" data-scroll-anchor={"q:" + question.id + "/p:" + part.id} data-preview-structure-anchor="true">
      {blocks.map((block: ContentBlock) => {
        if (!isContentBlockVisible(block, showSolutions)) return null;
        return (
          <div
            key={block.id}
            className={"test-question-part " + (block.kind === "diagram" ? "test-question-row-with-diagram" : "")}
            data-scroll-anchor={"q:" + question.id + "/p:" + part.id + "/b:" + block.id}
          >
            <span className="test-part-label">{block.id === firstVisibleBlockId ? "(" + alphaLabel(index) + ")" : ""}</span>
            <div className="test-part-content">
              <PreviewContentBlocks
                blocks={[block]}
                showSolutions={showSolutions}
                blockAnchorFor={(item) => "q:" + question.id + "/p:" + part.id + "/b:" + item.id}
              />
            </div>
            <span className="test-part-mark">{block.id === firstVisibleBlockId ? markLabel(part.marks) : ""}</span>
          </div>
        );
      })}
      {subparts.map((subpart: any, subpartIndex: number) => (
        <div
          key={subpart.id}
          className="test-question-subpart"
          data-scroll-anchor={"q:" + question.id + "/p:" + part.id + "/s:" + subpart.id}
          data-preview-structure-anchor="true"
        >
          <span className="test-part-label">({romanLabel(subpartIndex)})</span>
          <div className="test-part-content">
            <PreviewContentBlocks
              blocks={subpart.contentBlocks ?? []}
              showSolutions={showSolutions}
              blockAnchorFor={(item) => "q:" + question.id + "/p:" + part.id + "/s:" + subpart.id + "/b:" + item.id}
            />
          </div>
          <span className="test-part-mark">{markLabel(subpart.marks)}</span>
        </div>
      ))}
    </section>
  );
}

function QuestionPreview({ question, index, showSolutions }: { question: any; index: number; showSolutions: boolean }) {
  return (
    <section className="test-preview-question-group replay-question" data-scroll-anchor={"q:" + question.id} data-preview-structure-anchor="true">
      <div className="test-question-header">
        <span>{index + 1}.</span>
        <div className="test-question-content">
          <PreviewContentBlocks
            blocks={question.contentBlocks ?? []}
            showSolutions={showSolutions}
            blockAnchorFor={(block) => "q:" + question.id + "/b:" + block.id}
          />
        </div>
        <span className="test-question-mark">{markLabel(question.marks)}</span>
      </div>
      {(question.parts ?? []).map((part: any, partIndex: number) => (
        <PartPreview key={part.id} question={question} part={part} index={partIndex} showSolutions={showSolutions} />
      ))}
    </section>
  );
}

function ReplayCase({ replayCase }: { replayCase: (typeof replayCases)[number] }) {
  return (
    <section data-replay-case={replayCase.caseName}>
      <p className="replay-case-title">{replayCase.caseName}</p>
      <div className="a4-page replay-page" data-replay-page-mode={pageMode}>
        <div className="a4-page-content" data-preview-root="true">
          {(replayCase.document.questions ?? []).map((question: any, index: number) => (
            <QuestionPreview key={question.id} question={question} index={index} showSolutions={showSolutions} />
          ))}
        </div>
      </div>
    </section>
  );
}

function App() {
  return (
    <main className="replay-stage" id="preview-root" data-preview-view={previewView} data-preview-page-mode={pageMode} data-replay-ready="true">
      {replayCases.map((replayCase) => (
        <ReplayCase key={replayCase.caseName} replayCase={replayCase} />
      ))}
    </main>
  );
}

Object.assign(window, {
  collectAssistantPreviewReplayMetrics: () => {
    const root = document.getElementById("preview-root");
    const metrics = collectRenderedPreviewMetrics(root);
    const caseByAnchor = new Map<string, string>();
    const warnings: Array<Record<string, unknown>> = [];
    for (const caseElement of Array.from(document.querySelectorAll<HTMLElement>("[data-replay-case]"))) {
      const caseName = caseElement.getAttribute("data-replay-case") ?? "";
      const caseMetrics = collectRenderedPreviewMetrics(caseElement);
      for (const anchor of caseMetrics.anchors ?? []) caseByAnchor.set(anchor.anchor, caseName);
      for (const warning of caseMetrics.warnings ?? []) warnings.push({ ...warning, caseName });
    }
    return {
      ...metrics,
      warnings: warnings.length
        ? warnings
        : (metrics.warnings ?? []).map((warning) => ({ ...warning, caseName: caseByAnchor.get(warning.anchor ?? "") })),
    };
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
`,
  );
}

function warningCaseName(warning: BrowserRenderedWarning) {
  if (warning.caseName) return warning.caseName;
  const match = typeof warning.anchor === "string" ? warning.anchor.match(/^case:([^/]+)/) : null;
  return match?.[1] ?? null;
}

function warningSummary(warnings: readonly BrowserRenderedWarning[]) {
  const counts = new Map<string, number>();
  for (const warning of warnings) {
    const key = warning.code ?? "unknown-warning";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => `${code}:${count}`)
    .join(", ");
}

function dedupeWarnings(warnings: readonly BrowserRenderedWarning[]) {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.view ?? ""}:${warning.caseName ?? ""}:${warning.code ?? ""}:${warning.anchor ?? ""}:${warning.message ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function blockingMetricWarnings(metrics: { warnings?: BrowserRenderedWarning[] }) {
  const blockingCodes = new Set([
    "rendered-diagram-failed",
    "rendered-diagram-clipped",
    "rendered-diagram-label-collision",
    "rendered-graph3d-label-quality",
  ]);
  return (metrics.warnings ?? []).filter((warning) => warning.code && blockingCodes.has(warning.code));
}

function failDiagramMetric(metric: BrowserDiagramMetric) {
  const failures: string[] = [];
  const label = `${metric.view ?? "preview"} ${metric.caseName} ${metric.type}`;
  if (!metric.renderedGraphic) failures.push(`${label} did not produce a rendered graphic`);
  if (metric.width < 80 || metric.height < 60) {
    failures.push(`${label} rendered too small at ${metric.width}x${metric.height}`);
  }
  if ((metric.type === "graph3d" || metric.type === "basic3d") && metric.primitiveCount < 12) {
    failures.push(`${label} rendered only ${metric.primitiveCount} SVG primitives`);
  }
  if ((metric.type === "graph3d" || metric.type === "basic3d") && metric.expectedGraph3DSegmentCount >= 8 && metric.primitiveCount < 20) {
    failures.push(`${label} rendered too few primitives for ${metric.expectedGraph3DSegmentCount} expected 3D segments`);
  }
  if ((metric.type === "graph3d" || metric.type === "basic3d") && metric.expectedGraph3DFaceCount >= 5 && metric.primitiveCount < 20) {
    failures.push(`${label} rendered too few primitives for ${metric.expectedGraph3DFaceCount} expected 3D faces`);
  }
  const richGraph3DSolids = metric.expectedGraph3DSolidKinds.filter(
    (kind) => kind !== "sphere" && kind !== "circle" && kind !== "spherecap" && kind !== "sphericalcap",
  );
  if ((metric.type === "graph3d" || metric.type === "basic3d") && richGraph3DSolids.length > 0 && metric.primitiveCount < 18) {
    failures.push(`${label} rendered too few primitives for expected 3D solid(s): ${richGraph3DSolids.join(", ")}`);
  }
  if ((metric.type === "graph2d" || metric.type === "2d_graph" || metric.type === "function") && metric.primitiveCount < 8) {
    failures.push(`${label} rendered only ${metric.primitiveCount} SVG primitives`);
  }
  if (metric.type === "vector2d" && metric.primitiveCount < 8) {
    failures.push(`${label} rendered only ${metric.primitiveCount} SVG primitives`);
  }
  if (metric.type === "statsChart" && metric.primitiveCount < 4) {
    failures.push(`${label} rendered only ${metric.primitiveCount} SVG primitives`);
  }
  if (metric.type === "statsChart" && ["histogram", "binomial"].includes(metric.chartType) && metric.plotlyBarCount < 1) {
    failures.push(`${metric.view ?? "preview"} ${metric.caseName} ${metric.chartType} statsChart rendered no Plotly bars`);
  }
  if (metric.type === "statsChart" && ["density", "normal"].includes(metric.chartType) && metric.plotlyLineCount < 1) {
    failures.push(`${metric.view ?? "preview"} ${metric.caseName} ${metric.chartType} statsChart rendered no Plotly curve line`);
  }
  if (metric.hasSlopeField && metric.primitiveCount < 30) {
    failures.push(
      `${metric.view ?? "preview"} ${metric.caseName} slope-field graph2d rendered only ${metric.primitiveCount} SVG primitives`,
    );
  }
  if (metric.expectedFunctionColors.length > 0 && metric.functionStrokeCount < 1) {
    failures.push(`${label} rendered no function strokes matching expected color(s): ${metric.expectedFunctionColors.join(", ")}`);
  }
  if (metric.requiredLabels.length > 0 && metric.labelCount === 0) {
    failures.push(`${label} rendered no label surfaces for expected labels: ${metric.requiredLabels.join(", ")}`);
  }
  if (metric.missingLabels.length > 0) {
    failures.push(`${label} missing expected label text: ${metric.missingLabels.join(", ")}`);
  }
  if (metric.type === "vector2d" && metric.labelCollisionCount > 0) {
    failures.push(`${label} has overlapping vector labels: ${metric.labelCollisionPairs.join("; ")}`);
  }
  if (metric.type === "vector2d" && metric.vector2dAngleMarkerIssues.length > 0) {
    failures.push(`${label} has angle-marker render issues: ${metric.vector2dAngleMarkerIssues.join("; ")}`);
  }
  if ((metric.type === "graph3d" || metric.type === "basic3d") && metric.labelCollisionCount > 0) {
    failures.push(`${label} has overlapping graph3d labels: ${metric.labelCollisionPairs.join("; ")}`);
  }
  if ((metric.type === "graph3d" || metric.type === "basic3d") && metric.graph3DLabelQualityIssues.length > 0) {
    failures.push(`${label} has graph3d label quality issues: ${metric.graph3DLabelQualityIssues.join("; ")}`);
  }
  if (/could not render|mathjax-error|error rendering|failed to render/i.test(metric.text)) {
    failures.push(`${label} contains render error text: ${metric.text}`);
  }
  if (/\$[^$\n]{1,40}\$/.test(metric.text)) {
    failures.push(`${label} rendered raw LaTeX delimiters in labels: ${metric.text}`);
  }
  return failures;
}

async function runBrowserReplay(
  cases: AppliedReplayCase[],
  outputDir: string,
  views: readonly PreviewReplayView[],
  pageMode: PreviewPageMode,
) {
  const port = await findFreePort();
  await writeFixture(port, cases);
  const logs: string[] = [];
  const vite = spawn("pnpm", ["--dir", "apps/web", "exec", "vite", "--config", path.join(TEMP_ROOT, "vite.config.mjs")], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  vite.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));

  try {
    const url = `http://127.0.0.1:${port}`;
    await waitForServer(url, vite, logs);
    await fs.mkdir(outputDir, { recursive: true });
    const viewResults: Array<{
      view: PreviewReplayView;
      renderedMetrics: BrowserRenderedMetrics;
      diagramMetrics: BrowserDiagramMetric[];
    }> = [];

    for (const view of views) {
      await page.goto(`${url}?view=${view}&pageMode=${pageMode}`, { waitUntil: "networkidle" });
      try {
        await page.waitForSelector(`[data-replay-ready='true'][data-preview-view='${view}'][data-preview-page-mode='${pageMode}']`, {
          state: "attached",
          timeout: 20_000,
        });
        await page.waitForFunction(
          () => {
            const frames = Array.from(document.querySelectorAll("[data-replay-diagram-frame]"));
            return frames.length > 0 && frames.every((frame) => frame.querySelector("svg, canvas, img, .js-plotly-plot, .jxgbox"));
          },
          null,
          { timeout: 20_000 },
        );
      } catch (error) {
        const bodyText = (
          (await page
            .locator("body")
            .textContent()
            .catch(() => "")) ?? ""
        ).trim();
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\nView: ${view}\nConsole errors:\n${consoleErrors.join(
            "\n",
          )}\nPage mode: ${pageMode}\nPage errors:\n${pageErrors.join("\n")}\nVite logs:\n${logs.join("")}\nBody text:\n${bodyText}`,
        );
      }
      await page.waitForTimeout(1200);

      const viewOutputDir = path.join(outputDir, view);
      await fs.mkdir(viewOutputDir, { recursive: true });
      for (const replayCase of cases) {
        await page.locator(`[data-replay-case="${replayCase.caseName}"] .replay-page`).screenshot({
          path: path.join(viewOutputDir, `${replayCase.caseName}.png`),
        });
      }

      const renderedMetrics = await page.evaluate(() => {
        const collector = (
          window as typeof window & {
            collectAssistantPreviewReplayMetrics?: () => BrowserRenderedMetrics;
          }
        ).collectAssistantPreviewReplayMetrics;
        return collector
          ? collector()
          : { warnings: [{ code: "metrics-missing", message: "preview metrics collector was not installed" }] };
      });
      const diagramMetrics = (
        await page.evaluate(() =>
          Array.from(document.querySelectorAll("[data-replay-diagram-frame]")).map((frame) => {
            const caseName = frame.closest("[data-replay-case]")?.getAttribute("data-replay-case") ?? "";
            const type = frame.getAttribute("data-diagram-type") ?? "";
            const chartType = frame.getAttribute("data-chart-type") ?? "";
            const hasSlopeField = frame.getAttribute("data-has-slope-field") === "true";
            const requiredLabels = JSON.parse(frame.getAttribute("data-required-labels") || "[]") as string[];
            const expectedFunctionColors = JSON.parse(frame.getAttribute("data-function-colors") || "[]") as string[];
            const expectedGraph3DSolidKinds = JSON.parse(frame.getAttribute("data-graph3d-solid-kinds") || "[]") as string[];
            const expectedVector2DAngleMarkers = JSON.parse(frame.getAttribute("data-vector2d-angle-markers") || "[]") as Array<{
              id: string;
              from: string;
              to: string;
              rightAngle: boolean;
              label: string;
            }>;
            const rect = frame.getBoundingClientRect();
            const primitives = Array.from(
              frame.querySelectorAll("svg path, svg line, svg polyline, svg polygon, svg ellipse, svg circle, svg rect"),
            ).filter((element) => {
              const box = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              return box.width + box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
            });
            const normalizeLabel = (value: string) =>
              value
                .toLowerCase()
                .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (match) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(match)))
                .replace(/[^a-z0-9]+/g, "");
            const normalizedNumericLabel = (value: string) => {
              const normalized = value.trim().replace(/−/g, "-").replace(/\s+/g, "");
              return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
            };
            const isDuplicateNumericTickCollision = (left: string, right: string) => {
              const leftValue = normalizedNumericLabel(left);
              const rightValue = normalizedNumericLabel(right);
              return Boolean(leftValue && rightValue && leftValue === rightValue);
            };
            const collisionArea = (left: DOMRect, right: DOMRect) => {
              const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
              const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
              return width * height;
            };
            const rectDistance = (left: DOMRect, right: DOMRect) => {
              const dx = Math.max(0, Math.max(left.left, right.left) - Math.min(left.right, right.right));
              const dy = Math.max(0, Math.max(left.top, right.top) - Math.min(left.bottom, right.bottom));
              return Math.hypot(dx, dy);
            };
            const visibleElement = (element: Element) => {
              const box = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              return box.width > 4 && box.height > 4 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
            };
            const labelSearchText = (value: string) =>
              value
                .replace(/\\+underset\s*\{\s*\\+sim\s*\}\s*\{\s*([^}]*)\s*\}/g, "$1")
                .replace(/\\+(?:mathbf|vec|overrightarrow|overleftrightarrow)\s*\{([^}]*)\}/g, "$1")
                .replace(/\\+(?:text|mathrm)\s*\{([^}]*)\}/g, "$1")
                .replace(/\\+(?:mathbf|vec|text|mathrm)\s+([A-Za-z0-9]+)/g, "$1")
                .replace(/\\+(?:left|right|displaystyle|textstyle)\b/g, "")
                .replace(/[{}$]/g, " ")
                .replace(/\\+[,;:! ]/g, " ")
                .replace(/\\+_/g, "_")
                .replace(/\\+/g, " ");
            const labelSources = Array.from(frame.querySelectorAll("[data-mauth-label-text]")).map(
              (element) => element.getAttribute("data-mauth-label-text") ?? "",
            );
            const labelEntries = Array.from(frame.querySelectorAll("[data-mauth-label-text]"))
              .filter(visibleElement)
              .map((element) => {
                const box = element.getBoundingClientRect();
                return {
                  text: labelSearchText(element.getAttribute("data-mauth-label-text") ?? ""),
                  normalizedText: normalizeLabel(labelSearchText(element.getAttribute("data-mauth-label-text") ?? "")),
                  role: element.getAttribute("data-mauth-label-role") ?? "",
                  markerId: element.getAttribute("data-mauth-angle-marker-id") ?? "",
                  rect: box,
                  area: Math.max(1, box.width * box.height),
                };
              });
            const labelCollisionPairs: string[] = [];
            for (let i = 0; i < labelEntries.length; i += 1) {
              for (let j = i + 1; j < labelEntries.length; j += 1) {
                const overlapArea = collisionArea(labelEntries[i].rect, labelEntries[j].rect);
                const overlapRatio = overlapArea / Math.min(labelEntries[i].area, labelEntries[j].area);
                if (
                  overlapArea > 8 &&
                  overlapRatio > 0.06 &&
                  !isDuplicateNumericTickCollision(labelEntries[i].text, labelEntries[j].text)
                ) {
                  labelCollisionPairs.push(`${labelEntries[i].text || "label"} overlaps ${labelEntries[j].text || "label"}`);
                }
              }
            }
            const renderedAngleMarkers = Array.from(frame.querySelectorAll("[data-mauth-vector-angle-marker]")).map((element) => ({
              id: element.getAttribute("data-mauth-angle-marker-id") ?? "",
              from: element.getAttribute("data-mauth-angle-marker-from") ?? "",
              to: element.getAttribute("data-mauth-angle-marker-to") ?? "",
              rightAngle: element.getAttribute("data-mauth-angle-marker-right-angle") === "true",
            }));
            const angleLabelIds = new Set(labelEntries.filter((entry) => entry.role === "angle-label").map((entry) => entry.markerId));
            const vector2dAngleMarkerIssues = expectedVector2DAngleMarkers.flatMap((marker) => {
              const issues: string[] = [];
              const rendered = renderedAngleMarkers.some(
                (entry) =>
                  entry.id === marker.id && entry.from === marker.from && entry.to === marker.to && entry.rightAngle === marker.rightAngle,
              );
              if (!rendered) issues.push(`missing rendered ${marker.rightAngle ? "right-angle" : "angle"} marker ${marker.id}`);
              if (marker.label && !angleLabelIds.has(marker.id)) issues.push(`missing rendered angle label for marker ${marker.id}`);
              return issues;
            });
            const graph3DLabels = labelEntries.filter((entry) => entry.role.startsWith("graph3d-"));
            const graph3DPointLabelCount = graph3DLabels.filter((entry) => entry.role === "graph3d-point-label").length;
            const graph3DSegmentLabelCount = graph3DLabels.filter((entry) => entry.role === "graph3d-segment-label").length;
            const graph3DFaceLabelCount = graph3DLabels.filter((entry) => entry.role === "graph3d-face-label").length;
            const graph3DDimensionLabelCount = graph3DLabels.filter((entry) => entry.role === "graph3d-dimension-label").length;
            const expectedGraph3DPointLabelCount = Number(frame.getAttribute("data-graph3d-point-label-count") || 0);
            const expectedGraph3DSegmentLabelCount = Number(frame.getAttribute("data-graph3d-segment-label-count") || 0);
            const expectedGraph3DFaceLabelCount = Number(frame.getAttribute("data-graph3d-face-label-count") || 0);
            const expectedGraph3DDimensionLabelCount = Number(frame.getAttribute("data-graph3d-dimension-label-count") || 0);
            const graph3DLabelQualityIssues: string[] = [];
            if (type === "graph3d" || type === "basic3d") {
              if (graph3DPointLabelCount < expectedGraph3DPointLabelCount) {
                graph3DLabelQualityIssues.push(
                  `rendered ${graph3DPointLabelCount}/${expectedGraph3DPointLabelCount} expected point labels`,
                );
              }
              if (graph3DSegmentLabelCount < expectedGraph3DSegmentLabelCount) {
                graph3DLabelQualityIssues.push(
                  `rendered ${graph3DSegmentLabelCount}/${expectedGraph3DSegmentLabelCount} expected segment labels`,
                );
              }
              if (graph3DFaceLabelCount < expectedGraph3DFaceLabelCount) {
                graph3DLabelQualityIssues.push(`rendered ${graph3DFaceLabelCount}/${expectedGraph3DFaceLabelCount} expected face labels`);
              }
              if (graph3DDimensionLabelCount < expectedGraph3DDimensionLabelCount) {
                graph3DLabelQualityIssues.push(
                  `rendered ${graph3DDimensionLabelCount}/${expectedGraph3DDimensionLabelCount} expected dimension labels`,
                );
              }
              for (const entry of graph3DLabels) {
                if (
                  entry.rect.left < rect.left - 1 ||
                  entry.rect.right > rect.right + 1 ||
                  entry.rect.top < rect.top - 1 ||
                  entry.rect.bottom > rect.bottom + 1
                ) {
                  graph3DLabelQualityIssues.push(`label ${entry.text || "label"} extends outside the diagram frame`);
                }
              }
              for (let i = 0; i < graph3DLabels.length; i += 1) {
                for (let j = i + 1; j < graph3DLabels.length; j += 1) {
                  const distance = rectDistance(graph3DLabels[i].rect, graph3DLabels[j].rect);
                  if (distance > 0 && distance < 3) {
                    graph3DLabelQualityIssues.push(
                      `label ${graph3DLabels[i].text || "label"} is crowded near ${graph3DLabels[j].text || "label"} (${Math.round(distance * 10) / 10}px)`,
                    );
                  }
                }
              }
            }
            const labelSurfaceText = Array.from(frame.querySelectorAll(".jxg-latex-label, foreignObject, text, .annotation-text"))
              .map((element) => element.textContent ?? "")
              .join(" ");
            const text = (frame.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 240);
            const normalizedLabelText = normalizeLabel([labelSurfaceText, ...labelSources.map(labelSearchText)].join(" "));
            const colorProbe = document.createElement("span");
            colorProbe.style.display = "none";
            document.body.appendChild(colorProbe);
            const normalizeColor = (value: string) => {
              colorProbe.style.color = value;
              return window.getComputedStyle(colorProbe).color;
            };
            const expectedColors = new Set(expectedFunctionColors.map(normalizeColor));
            const functionStrokeCount = primitives.filter((element) => {
              const stroke = window.getComputedStyle(element).stroke || element.getAttribute("stroke") || "";
              return expectedColors.has(normalizeColor(stroke));
            }).length;
            colorProbe.remove();
            return {
              caseName,
              type,
              chartType,
              hasSlopeField,
              width: Math.round(rect.width * 10) / 10,
              height: Math.round(rect.height * 10) / 10,
              primitiveCount: primitives.length,
              plotlyBarCount: frame.querySelectorAll(".barlayer path").length,
              plotlyLineCount: frame.querySelectorAll(".scatterlayer .js-line, .scatterlayer path.js-line").length,
              expectedFunctionColors,
              functionStrokeCount,
              expectedGraph3DPointCount: Number(frame.getAttribute("data-graph3d-point-count") || 0),
              expectedGraph3DSegmentCount: Number(frame.getAttribute("data-graph3d-segment-count") || 0),
              expectedGraph3DFaceCount: Number(frame.getAttribute("data-graph3d-face-count") || 0),
              expectedGraph3DPointLabelCount,
              expectedGraph3DSegmentLabelCount,
              expectedGraph3DFaceLabelCount,
              expectedGraph3DDimensionLabelCount,
              expectedGraph3DSolidKinds,
              graph3DPointLabelCount,
              graph3DSegmentLabelCount,
              graph3DFaceLabelCount,
              graph3DDimensionLabelCount,
              labelCount: frame.querySelectorAll(".jxg-latex-label, foreignObject, text, .annotation-text").length,
              renderedGraphic: Boolean(frame.querySelector("svg, canvas, img, .js-plotly-plot, .jxgbox")),
              text,
              requiredLabels,
              missingLabels: requiredLabels.filter((label) => !normalizedLabelText.includes(normalizeLabel(label))),
              labelCollisionCount: labelCollisionPairs.length,
              labelCollisionPairs: labelCollisionPairs.slice(0, 6),
              vector2dAngleMarkerIssues,
              graph3DLabelQualityIssues: graph3DLabelQualityIssues.slice(0, 8),
            };
          }),
        )
      ).map((metric) => ({ ...metric, view }));
      const renderedWarnings = dedupeWarnings((renderedMetrics.warnings ?? []).map((warning) => ({ ...warning, view })));
      renderedMetrics.warnings = renderedWarnings;
      await fs.writeFile(path.join(viewOutputDir, "rendered-metrics.json"), JSON.stringify(renderedMetrics, null, 2));
      await fs.writeFile(path.join(viewOutputDir, "diagram-metrics.json"), JSON.stringify(diagramMetrics, null, 2));
      viewResults.push({ view, renderedMetrics, diagramMetrics });
    }

    const allRenderedWarnings = dedupeWarnings(viewResults.flatMap((result) => result.renderedMetrics.warnings ?? []));
    const allDiagramMetrics = viewResults.flatMap((result) => result.diagramMetrics);
    await fs.writeFile(
      path.join(outputDir, "rendered-metrics.json"),
      JSON.stringify(
        {
          pageMode,
          views: viewResults.map((result) => ({
            view: result.view,
            metrics: result.renderedMetrics,
          })),
          warnings: allRenderedWarnings,
        },
        null,
        2,
      ),
    );
    await fs.writeFile(path.join(outputDir, "diagram-metrics.json"), JSON.stringify(allDiagramMetrics, null, 2));

    const failures = [
      ...blockingMetricWarnings({ warnings: allRenderedWarnings }).map(
        (warning) => `${warning.view ?? "preview"} ${warning.caseName ?? ""} ${warning.code}: ${warning.message ?? ""}`,
      ),
      ...allDiagramMetrics.flatMap(failDiagramMetric),
      ...consoleErrors.map((error) => `console error: ${error}`),
      ...pageErrors.map((error) => `page error: ${error}`),
    ];
    if (failures.length) {
      throw new Error(`Assistant preview replay smoke failed. Screenshots: ${outputDir}\n${failures.join("\n")}`);
    }
    const warningCount = allRenderedWarnings.length;
    const nonBlockingWarnings = allRenderedWarnings
      .filter((warning) => !blockingMetricWarnings({ warnings: [warning] }).length)
      .map((warning) => warning.code)
      .filter((code): code is string => Boolean(code));
    const nonBlockingSummary = warningCount ? ` Warning summary: ${warningSummary(allRenderedWarnings)}.` : "";
    const warningCases = [
      ...new Set(
        allRenderedWarnings
          .map((warning) => {
            const caseName = warningCaseName(warning);
            return caseName ? `${warning.view ?? "preview"}:${caseName}` : null;
          })
          .filter((caseName): caseName is string => Boolean(caseName)),
      ),
    ];
    const warningCaseSummary = warningCases.length ? ` Warning cases: ${warningCases.join(", ")}.` : "";
    const nonBlockingKinds = nonBlockingWarnings.length ? ` Non-blocking warnings: ${[...new Set(nonBlockingWarnings)].join(", ")}.` : "";
    const viewSummary = viewResults
      .map((result) => `${result.view}:${cases.length} case(s), ${result.diagramMetrics.length} diagram(s)`)
      .join("; ");
    console.log(
      `Assistant preview replay smoke passed for ${viewSummary}. Page mode: ${pageMode}. Screenshots: ${outputDir}. Rendered warning count: ${warningCount}.${nonBlockingKinds}${nonBlockingSummary}${warningCaseSummary}`,
    );
  } finally {
    await browser.close();
    await stopProcess(vite);
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  }
}

async function main() {
  const caseGroup = argValue("--case", process.env.MAUTH_ASSISTANT_PREVIEW_CASE ?? DEFAULT_CASE_GROUP);
  const views = previewViews();
  const pageMode = previewPageMode();
  const replayCases = loadReplayCases(caseGroup);
  const appliedCases = replayCases.map(applyReplayCase);
  const outputDir = path.join(OUTPUT_ROOT, timestampSlug());
  await runBrowserReplay(appliedCases, outputDir, views, pageMode);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
