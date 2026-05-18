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

interface BrowserDiagramMetric {
  caseName: string;
  type: string;
  width: number;
  height: number;
  primitiveCount: number;
  labelCount: number;
  renderedGraphic: boolean;
  text: string;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ROOT = path.join(ROOT, "apps", "web");
const API_ROOT = path.join(ROOT, "apps", "api");
const TEMP_ROOT = path.join(WEB_ROOT, ".tmp", `assistant-preview-replay-smoke-${process.pid}`);
const WORKBENCH_ROOT = path.resolve(ROOT, "..", "mauth-workbench");
const OUTPUT_ROOT =
  process.env.MAUTH_ASSISTANT_PREVIEW_SMOKE_OUTPUT ?? path.join(WORKBENCH_ROOT, "verification", "assistant-preview-replay-smoke");
const DEFAULT_CASE_GROUP = "local-real-exams-graph3d";

function argValue(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : fallback;
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
  const single = graphTypeFromDiagram(args.diagram);
  if (single) types.push(single);
  if (Array.isArray(args.diagrams)) {
    for (const diagram of args.diagrams) {
      const diagramType = graphTypeFromDiagram(diagram);
      if (diagramType) types.push(diagramType);
    }
  }
  return types;
}

function collectDocumentDiagrams(document: TestDocument) {
  const diagrams: Array<{ block: Extract<ContentBlock, { kind: "diagram" }>; graphConfig: GraphConfig }> = [];
  const visitBlocks = (blocks: readonly ContentBlock[] | undefined) => {
    for (const block of blocks ?? []) {
      if (block.kind === "diagram" && block.graphConfig) diagrams.push({ block, graphConfig: block.graphConfig });
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
  for (const questionItem of questions) {
    blocks.push(...questionItem.contentBlocks);
    for (const part of questionItem.parts ?? []) {
      blocks.push(...part.contentBlocks);
      for (const subpart of part.subparts ?? []) blocks.push(...subpart.contentBlocks);
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
  height: var(--a4-page-height, 1122.519685px);
  line-height: 1.48;
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
  let content: React.ReactNode;
  if (type === "statsChart") content = <StatsChartDiagram graphConfig={config} />;
  else if (type === "vector2d") content = <Vector2DGraph graphConfig={config} />;
  else if (type === "graph3d" || type === "basic3d") content = <Basic3DGraph graphConfig={config} />;
  else content = <FunctionGraph graphConfig={config} />;
  return (
    <div className="replay-diagram-frame" data-replay-diagram-frame="true" data-diagram-type={type}>
      {content}
    </div>
  );
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
      <div className="a4-page replay-page">
        <div className="a4-page-content" data-preview-root="true">
          {(replayCase.document.questions ?? []).map((question: any, index: number) => (
            <QuestionPreview key={question.id} question={question} index={index} showSolutions={true} />
          ))}
        </div>
      </div>
    </section>
  );
}

function App() {
  return (
    <main className="replay-stage" id="preview-root" data-replay-ready="true">
      {replayCases.map((replayCase) => (
        <ReplayCase key={replayCase.caseName} replayCase={replayCase} />
      ))}
    </main>
  );
}

Object.assign(window, {
  collectAssistantPreviewReplayMetrics: () => collectRenderedPreviewMetrics(document.getElementById("preview-root")),
});

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
`,
  );
}

function blockingMetricWarnings(metrics: { warnings?: Array<{ code?: string; message?: string; severity?: string }> }) {
  const blockingCodes = new Set(["rendered-diagram-failed", "rendered-diagram-clipped", "rendered-diagram-clipped-by-page"]);
  return (metrics.warnings ?? []).filter((warning) => warning.code && blockingCodes.has(warning.code));
}

function failDiagramMetric(metric: BrowserDiagramMetric) {
  const failures: string[] = [];
  if (!metric.renderedGraphic) failures.push(`${metric.caseName} ${metric.type} did not produce a rendered graphic`);
  if (metric.width < 80 || metric.height < 60) {
    failures.push(`${metric.caseName} ${metric.type} rendered too small at ${metric.width}x${metric.height}`);
  }
  if ((metric.type === "graph3d" || metric.type === "basic3d") && metric.primitiveCount < 12) {
    failures.push(`${metric.caseName} ${metric.type} rendered only ${metric.primitiveCount} SVG primitives`);
  }
  if ((metric.type === "graph2d" || metric.type === "2d_graph" || metric.type === "function") && metric.primitiveCount < 8) {
    failures.push(`${metric.caseName} ${metric.type} rendered only ${metric.primitiveCount} SVG primitives`);
  }
  if (metric.type === "vector2d" && metric.primitiveCount < 8) {
    failures.push(`${metric.caseName} ${metric.type} rendered only ${metric.primitiveCount} SVG primitives`);
  }
  if (metric.type === "statsChart" && metric.primitiveCount < 4) {
    failures.push(`${metric.caseName} ${metric.type} rendered only ${metric.primitiveCount} SVG primitives`);
  }
  if (/could not render|mathjax-error|error rendering|failed to render/i.test(metric.text)) {
    failures.push(`${metric.caseName} ${metric.type} contains render error text: ${metric.text}`);
  }
  if (/\$[^$\n]{1,40}\$/.test(metric.text)) {
    failures.push(`${metric.caseName} ${metric.type} rendered raw LaTeX delimiters in labels: ${metric.text}`);
  }
  return failures;
}

async function runBrowserReplay(cases: AppliedReplayCase[], outputDir: string) {
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
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-replay-ready='true']", { state: "attached", timeout: 20_000 });
    await page.waitForFunction(
      () => {
        const frames = Array.from(document.querySelectorAll("[data-replay-diagram-frame]"));
        return frames.length > 0 && frames.every((frame) => frame.querySelector("svg, canvas, img, .js-plotly-plot, .jxgbox"));
      },
      null,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(1200);

    await fs.mkdir(outputDir, { recursive: true });
    for (const replayCase of cases) {
      await page.locator(`[data-replay-case="${replayCase.caseName}"] .replay-page`).screenshot({
        path: path.join(outputDir, `${replayCase.caseName}.png`),
      });
    }

    const renderedMetrics = await page.evaluate(() => {
      const collector = (
        window as typeof window & {
          collectAssistantPreviewReplayMetrics?: () => { warnings?: Array<{ code?: string; message?: string; severity?: string }> };
        }
      ).collectAssistantPreviewReplayMetrics;
      return collector ? collector() : { warnings: [{ code: "metrics-missing", message: "preview metrics collector was not installed" }] };
    });
    const diagramMetrics = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-replay-diagram-frame]")).map((frame) => {
        const caseName = frame.closest("[data-replay-case]")?.getAttribute("data-replay-case") ?? "";
        const type = frame.getAttribute("data-diagram-type") ?? "";
        const rect = frame.getBoundingClientRect();
        const primitives = Array.from(
          frame.querySelectorAll("svg path, svg line, svg polyline, svg polygon, svg ellipse, svg circle, svg rect"),
        ).filter((element) => {
          const box = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return box.width + box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
        });
        return {
          caseName,
          type,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          primitiveCount: primitives.length,
          labelCount: frame.querySelectorAll(".jxg-latex-label, foreignObject, text, .annotation-text").length,
          renderedGraphic: Boolean(frame.querySelector("svg, canvas, img, .js-plotly-plot, .jxgbox")),
          text: (frame.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 240),
        };
      }),
    );

    const failures = [
      ...blockingMetricWarnings(renderedMetrics).map((warning) => `${warning.code}: ${warning.message ?? ""}`),
      ...diagramMetrics.flatMap(failDiagramMetric),
      ...consoleErrors.map((error) => `console error: ${error}`),
      ...pageErrors.map((error) => `page error: ${error}`),
    ];
    if (failures.length) {
      throw new Error(`Assistant preview replay smoke failed. Screenshots: ${outputDir}\n${failures.join("\n")}`);
    }
    const warningCount = renderedMetrics.warnings?.length ?? 0;
    const nonBlockingWarnings = (renderedMetrics.warnings ?? [])
      .filter((warning) => !blockingMetricWarnings({ warnings: [warning] }).length)
      .map((warning) => warning.code)
      .filter((code): code is string => Boolean(code));
    const warningSummary = nonBlockingWarnings.length ? ` Non-blocking warnings: ${[...new Set(nonBlockingWarnings)].join(", ")}.` : "";
    console.log(
      `Assistant preview replay smoke passed for ${cases.length} case(s), ${diagramMetrics.length} diagram(s). Screenshots: ${outputDir}. Rendered warning count: ${warningCount}.${warningSummary}`,
    );
  } finally {
    await browser.close();
    await stopProcess(vite);
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  }
}

async function main() {
  const caseGroup = argValue("--case", process.env.MAUTH_ASSISTANT_PREVIEW_CASE ?? DEFAULT_CASE_GROUP);
  const replayCases = loadReplayCases(caseGroup);
  const appliedCases = replayCases.map(applyReplayCase);
  const outputDir = path.join(OUTPUT_ROOT, timestampSlug());
  await runBrowserReplay(appliedCases, outputDir);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
