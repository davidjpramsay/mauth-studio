import assert from "node:assert/strict";
import test from "node:test";

import type {
  ContentBlock,
  ProjectFileDocument,
  ProjectFileSaveRequest,
  ProjectFileSummary,
  ProjectFileVersion,
} from "@mauth-studio/shared";

import type { MauthDocumentLike, MauthQuestionLike } from "./mauthActions.ts";
import { runMauthAssistantAdapterTool, type MauthAssistantAdapterHost } from "./mauthAssistantAdapter.ts";
import type { MauthProjectFileDriver } from "./mauthAssistantFileTools.ts";
import type { MauthLayoutCheck, MauthPreviewRenderedMetrics } from "./mauthAssistantTools.ts";

interface TestFrontMatter {
  assessmentTitle: string;
}

interface TestFormattingConfig {
  showMarks: boolean;
}

type TestDocument = MauthDocumentLike<MauthQuestionLike, TestFrontMatter, TestFormattingConfig>;

interface StoredFile {
  summary: ProjectFileSummary;
  content: string | null;
  versions: ProjectFileVersion[];
}

function textBlock(id: string, text: string): ContentBlock {
  return { id, kind: "text", text };
}

function spaceBlock(id: string, lines: number): ContentBlock {
  return { id, kind: "space", lines, visibility: "student" };
}

function diagramBlock(id: string): ContentBlock {
  return {
    id,
    kind: "diagram",
    graphConfig: {
      type: "statsChart",
      data: { chartType: "histogram" },
      options: { widthPx: 260, heightPx: 220 },
    },
  } as ContentBlock;
}

function question(id: string, blocks: ContentBlock[] = []): MauthQuestionLike {
  return {
    id,
    marks: 1,
    contentBlocks: blocks,
    parts: [],
    itemOrder: blocks.map((block) => ({ kind: "block" as const, id: block.id })),
  };
}

function documentFixture(title = "Original"): TestDocument {
  return {
    frontMatter: { assessmentTitle: title },
    formattingConfig: { showMarks: true },
    questions: [question("q1", [textBlock("t1", "Original wording.")])],
  };
}

function fileSummary(path: string, kind: "file" | "folder", revision = 1): ProjectFileSummary {
  const name = path.split("/").at(-1) ?? path;
  return {
    id: `id:${path}`,
    projectId: "project-1",
    parentPath: path.split("/").slice(0, -1).join("/") || null,
    path,
    name,
    kind,
    fileType: kind === "folder" ? "folder" : "test",
    metadata: {},
    sortOrder: 0,
    revision,
    sizeBytes: 0,
    createdAt: "2026-05-08T00:00:00Z",
    updatedAt: "2026-05-08T00:00:00Z",
  };
}

function documentFromStored(file: StoredFile): ProjectFileDocument {
  return {
    ...file.summary,
    content: file.content,
    versionCount: file.versions.length,
  };
}

function createMemoryDriver(seed: StoredFile[] = []): MauthProjectFileDriver {
  const files = new Map(seed.map((file) => [file.summary.path, file]));

  function ensureParentFolders(path: string) {
    const parts = path.split("/").filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      const folderPath = parts.slice(0, index).join("/");
      if (!files.has(folderPath)) {
        files.set(folderPath, {
          summary: fileSummary(folderPath, "folder"),
          content: null,
          versions: [],
        });
      }
    }
  }

  return {
    async listFiles() {
      return [...files.values()].map((file) => file.summary).sort((left, right) => left.path.localeCompare(right.path));
    },
    async getFile(_projectId, path) {
      const file = files.get(path);
      if (!file) throw new Error(`File not found: ${path}`);
      return documentFromStored(file);
    },
    async saveFile(_projectId, path, request: ProjectFileSaveRequest) {
      ensureParentFolders(path);
      const existing = files.get(path);
      const kind = request.kind === "folder" ? "folder" : "file";
      const summary: ProjectFileSummary = {
        ...(existing?.summary ?? fileSummary(path, kind)),
        path,
        name: path.split("/").at(-1) ?? path,
        kind,
        fileType: request.fileType ?? (kind === "folder" ? "folder" : "test"),
        metadata: request.metadata ?? {},
        revision: existing ? existing.summary.revision + 1 : 1,
        sizeBytes: typeof request.content === "string" ? request.content.length : 0,
      };
      const stored = { summary, content: kind === "folder" ? null : (request.content ?? ""), versions: existing?.versions ?? [] };
      files.set(path, stored);
      return documentFromStored(stored);
    },
    async deleteFile(_projectId, path) {
      for (const key of [...files.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) files.delete(key);
      }
    },
  };
}

function adapterHost(
  overrides: Partial<MauthAssistantAdapterHost<MauthQuestionLike, TestFrontMatter, TestFormattingConfig>> = {},
  initialDocument: TestDocument = documentFixture(),
) {
  let document = initialDocument;
  let activeFilePath: string | null = "tests/Open.test.json";
  let activeFileRevision: number | null = 1;
  const commits: TestDocument[] = [];
  const activePaths: Array<string | null> = [];

  const host: MauthAssistantAdapterHost<MauthQuestionLike, TestFrontMatter, TestFormattingConfig> = {
    getDocument: () => document,
    commitDocument: (nextDocument) => {
      document = nextDocument;
      commits.push(nextDocument);
    },
    getProjectId: () => "project-1",
    getActiveFilePath: () => activeFilePath,
    getActiveFileRevision: () => activeFileRevision,
    setActiveFilePath: (path, context) => {
      activeFilePath = path;
      const data = context.data as { document?: ProjectFileDocument } | undefined;
      activeFileRevision = path ? (data?.document?.revision ?? activeFileRevision) : null;
      activePaths.push(path);
    },
    serializeDocument: (document) => JSON.stringify(document),
    parseProjectFileDocument: (file) => JSON.parse(file.content ?? "{}") as TestDocument,
    ...overrides,
  };

  return {
    host,
    get document() {
      return document;
    },
    commits,
    activePaths,
    setActiveFile(path: string | null, revision: number | null) {
      activeFilePath = path;
      activeFileRevision = revision;
    },
  };
}

function failedDiagramMetrics(anchor: string, errorText = "Diagram could not render."): MauthPreviewRenderedMetrics {
  return {
    available: true,
    source: "browser-preview",
    activeAnchor: anchor,
    pageCount: 1,
    pages: [
      {
        pageIndex: 0,
        pageNumber: 1,
        usedHeightPx: 300,
        totalHeightPx: 1000,
        remainingHeightPx: 700,
        usedPercent: 30,
        anchorCount: 1,
        overflow: false,
      },
    ],
    anchors: [
      {
        anchor,
        kind: "questionBlock",
        role: "module",
        pageIndex: 0,
        pageNumber: 1,
        selected: true,
        viewportRect: { left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100, x: 10, y: 20 },
        diagram: {
          found: true,
          rendered: false,
          errorText,
          viewportRect: { left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100, x: 10, y: 20 },
        },
        warnings: [
          {
            code: "rendered-diagram-failed",
            severity: "error",
            anchor,
            message: `The selected diagram failed to render: ${errorText}`,
          },
        ],
      },
    ],
    warnings: [],
  };
}

test("commits only accepted document apply results", async () => {
  const harness = adapterHost();

  const preview = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.actions.preview",
    arguments: { action: { type: "frontMatter.update", patch: { assessmentTitle: "Previewed" } } },
  });
  const applied = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.actions.apply",
    arguments: { action: { type: "frontMatter.update", patch: { assessmentTitle: "Applied" } } },
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.committedDocument, false);
  assert.equal(applied.ok, true);
  assert.equal(applied.committedDocument, true);
  assert.equal(harness.document.frontMatter.assessmentTitle, "Applied");
  assert.equal(harness.commits.length, 1);
});

test("commits high-level authoring results through the same editor history path", async () => {
  const harness = adapterHost();

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 1,
      marks: 3,
      questionText: "Write a circle geometry proof using a tangent.",
      studentSpaceLines: 9,
      solutionText: "Use the tangent-radius theorem and angles in the same segment.",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.committedDocument, true);
  assert.equal(harness.commits.length, 1);
  assert.equal(harness.document.questions[0].marks, 3);
  assert.equal(
    harness.document.questions[0].contentBlocks[0].kind === "text" ? harness.document.questions[0].contentBlocks[0].text : "",
    "Write a circle geometry proof using a tangent.",
  );
  assert.equal(result.toolName, "mauth.question.upsert");
});

test("commits selected settings results through the same editor history path", async () => {
  const initialDocument = documentFixture();
  initialDocument.questions[0].contentBlocks = [textBlock("t1", "Use the chart."), diagramBlock("d1"), spaceBlock("s1", 4)];
  initialDocument.questions[0].itemOrder = initialDocument.questions[0].contentBlocks.map((block) => ({
    kind: "block" as const,
    id: block.id,
  }));
  const harness = adapterHost({ getActiveAnchor: () => "q:q1/b:d1" }, initialDocument);

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.settings.apply",
    arguments: {
      module: { diagramAlign: "right" },
      diagram: { widthPx: 380, showGrid: false },
    },
  });
  const diagram = harness.document.questions[0].contentBlocks.find((block) => block.id === "d1");

  assert.equal(result.ok, true, result.error);
  assert.equal(result.committedDocument, true);
  assert.equal(harness.commits.length, 1);
  assert.equal(diagram?.kind, "diagram");
  assert.equal(diagram?.kind === "diagram" ? diagram.diagramAlign : undefined, "right");
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.widthPx : undefined, 380);
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.options?.showGrid : undefined, false);
});

test("question upserts report semantic graph and question mismatches after commit", async () => {
  const harness = adapterHost();

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 1,
      marks: 4,
      questionText: "The graph below shows two straight lines, $y=2x+1$ and $y=-x+7$.",
      studentSpaceLines: 8,
      diagram: {
        graphConfig: {
          type: "graph2d",
          xMin: -5,
          xMax: 5,
          yMin: -2,
          yMax: 10,
          functions: [{ expression: "x^2 - 4*x + 4", label: "$y=x^2-4x+4$", show: true }],
        },
      },
    },
  });
  const data = result.data as {
    repairTarget?: { questionNumber?: number; questionId?: string; diagramId?: string; instruction?: string };
    validationIssues?: Array<{ expected?: string; message: string; targetId?: string }>;
  };

  assert.equal(result.ok, false);
  assert.equal(result.committedDocument, true);
  assert.equal(harness.commits.length, 1);
  assert.match(result.error ?? "", /post-edit inspection/i);
  assert(data.validationIssues?.some((issue) => issue.message.includes("straight lines")));
  assert(data.validationIssues?.some((issue) => issue.expected?.includes("mauth.author.addDiagram")));
});

test("commits high-level diagram and solution authoring results through editor history", async () => {
  const harness = adapterHost();

  const diagramResult = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagram: {
        graphConfig: {
          type: "geometricConstruction",
          options: {
            substanceSource: "Point A\nLabel A $A$\n",
          },
        },
      },
    },
  });
  const solutionResult = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.author.ensureSolutions",
    arguments: {
      questions: [
        {
          questionNumber: 1,
          studentSpaceLines: 8,
          solutionText: "Use the tangent-radius theorem and angle facts.",
        },
      ],
    },
  });

  assert.equal(diagramResult.ok, true);
  assert.equal(diagramResult.committedDocument, true);
  assert.equal(solutionResult.ok, true);
  assert.equal(solutionResult.committedDocument, true);
  assert.equal(harness.commits.length, 2);
  assert(harness.document.questions[0].contentBlocks.some((block) => block.kind === "diagram"));
  assert(harness.document.questions[0].contentBlocks.some((block) => block.kind === "text" && block.visibility === "solution"));
});

test("commits automatic layout-check repairs through editor history", async () => {
  const harness = adapterHost(undefined, {
    frontMatter: { assessmentTitle: "Original" },
    formattingConfig: { showMarks: true },
    questions: [
      question("q1", [
        textBlock("t1", "Find $x$."),
        { id: "sol1", kind: "text", text: "**Solution.**\n$x=3$. [[marks:1]]", visibility: "solution" } as ContentBlock,
      ]),
    ],
  });

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.layout.check",
    arguments: { mode: "both", autoRepair: true },
  });
  const data = result.data as { repair?: { applied?: boolean; afterIssueCount?: number } };

  assert.equal(result.ok, true);
  assert.equal(result.committedDocument, true);
  assert.equal(data.repair?.applied, true);
  assert.equal(data.repair?.afterIssueCount, 0);
  assert.equal(harness.commits.length, 1);
  assert.equal(
    harness.document.questions[0].contentBlocks.some((block) => block.kind === "space"),
    true,
  );
});

test("refreshes rendered layout metrics after automatic layout-check repair commits", async () => {
  let waitedForPaint = false;
  const initialMetrics: MauthPreviewRenderedMetrics = {
    available: true,
    source: "browser-preview",
    activeAnchor: "q:q1/b:space1",
    pageCount: 1,
    pages: [
      {
        pageIndex: 0,
        pageNumber: 1,
        usedHeightPx: 1000,
        totalHeightPx: 1000,
        remainingHeightPx: 0,
        usedPercent: 100,
        anchorCount: 2,
        overflow: true,
        overflowByPx: 80,
        overflowTargetAnchor: "q:q1/b:space1",
      },
    ],
    anchors: [
      {
        anchor: "q:q1",
        kind: "question",
        role: "structure",
        pageIndex: 0,
        pageNumber: 1,
        selected: false,
        viewportRect: { left: 0, top: 0, right: 600, bottom: 1080, width: 600, height: 1080, x: 0, y: 0 },
        pageRelativeRect: { left: 0, top: 0, right: 600, bottom: 1080, width: 600, height: 1080, x: 0, y: 0 },
        warnings: [],
      },
      {
        anchor: "q:q1/b:space1",
        kind: "questionBlock",
        role: "module",
        pageIndex: 0,
        pageNumber: 1,
        selected: true,
        viewportRect: { left: 40, top: 580, right: 560, bottom: 1080, width: 520, height: 500, x: 40, y: 580 },
        pageRelativeRect: { left: 40, top: 580, right: 560, bottom: 1080, width: 520, height: 500, x: 40, y: 580 },
        warnings: [],
      },
    ],
    warnings: [
      {
        code: "rendered-page-overflow",
        severity: "warning",
        anchor: "q:q1/b:space1",
        targetId: "space1",
        message: "Preview page 1 appears to overflow its A4 page box.",
      },
    ],
  };
  const freshMetrics: MauthPreviewRenderedMetrics = {
    available: true,
    source: "browser-preview",
    activeAnchor: "q:q1/b:space1",
    pageCount: 1,
    pages: [
      {
        pageIndex: 0,
        pageNumber: 1,
        usedHeightPx: 860,
        totalHeightPx: 1000,
        remainingHeightPx: 140,
        usedPercent: 86,
        anchorCount: 2,
        overflow: false,
      },
    ],
    anchors: [
      {
        anchor: "q:q1",
        kind: "question",
        role: "structure",
        pageIndex: 0,
        pageNumber: 1,
        selected: false,
        viewportRect: { left: 0, top: 0, right: 600, bottom: 860, width: 600, height: 860, x: 0, y: 0 },
        pageRelativeRect: { left: 0, top: 0, right: 600, bottom: 860, width: 600, height: 860, x: 0, y: 0 },
        warnings: [],
      },
    ],
    warnings: [],
  };
  const harness = adapterHost(
    {
      getRenderedPreviewMetrics: () => initialMetrics,
      waitForRenderedPreviewMetrics: async () => {
        waitedForPaint = true;
        return freshMetrics;
      },
    },
    {
      frontMatter: { assessmentTitle: "Original" },
      formattingConfig: { showMarks: true },
      questions: [question("q1", [textBlock("t1", "Original wording."), spaceBlock("space1", 20)])],
    },
  );

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.layout.check",
    arguments: { mode: "student", autoRepair: true },
  });
  const data = result.data as MauthLayoutCheck;

  assert.equal(waitedForPaint, true);
  assert.equal(result.ok, true);
  assert.equal(result.committedDocument, true);
  assert.equal(data.repair?.applied, true);
  assert.equal(data.repair?.afterIssueCount, 0);
  assert.equal(data.repair?.repairedIssueCount, 1);
  assert.equal(result.warnings.length, 0);
});

test("refreshes rendered diagram metrics after automatic diagram-size repair commits", async () => {
  let waitedForPaint = false;
  const diagramAnchor = "q:q1/b:d1";
  const initialMetrics: MauthPreviewRenderedMetrics = {
    available: true,
    source: "browser-preview",
    activeAnchor: diagramAnchor,
    pageCount: 1,
    pages: [
      {
        pageIndex: 0,
        pageNumber: 1,
        usedHeightPx: 940,
        totalHeightPx: 1000,
        remainingHeightPx: 60,
        usedPercent: 94,
        anchorCount: 1,
        overflow: false,
      },
    ],
    anchors: [
      {
        anchor: diagramAnchor,
        kind: "questionBlock",
        role: "module",
        pageIndex: 0,
        pageNumber: 1,
        selected: true,
        viewportRect: { left: 20, top: 40, right: 740, bottom: 920, width: 720, height: 880, x: 20, y: 40 },
        pageRelativeRect: { left: 20, top: 40, right: 740, bottom: 920, width: 720, height: 880, x: 20, y: 40 },
        diagram: {
          found: true,
          rendered: true,
          tooLarge: true,
          viewportRect: { left: 20, top: 40, right: 740, bottom: 920, width: 720, height: 880, x: 20, y: 40 },
        },
        warnings: [
          {
            code: "rendered-diagram-too-large",
            severity: "info",
            anchor: diagramAnchor,
            message: "The selected diagram occupies almost the whole rendered page.",
          },
        ],
      },
    ],
    warnings: [],
  };
  const freshMetrics: MauthPreviewRenderedMetrics = {
    available: true,
    source: "browser-preview",
    activeAnchor: diagramAnchor,
    pageCount: 1,
    pages: [
      {
        pageIndex: 0,
        pageNumber: 1,
        usedHeightPx: 720,
        totalHeightPx: 1000,
        remainingHeightPx: 280,
        usedPercent: 72,
        anchorCount: 1,
        overflow: false,
      },
    ],
    anchors: [
      {
        anchor: diagramAnchor,
        kind: "questionBlock",
        role: "module",
        pageIndex: 0,
        pageNumber: 1,
        selected: true,
        viewportRect: { left: 20, top: 40, right: 650, bottom: 720, width: 630, height: 680, x: 20, y: 40 },
        pageRelativeRect: { left: 20, top: 40, right: 650, bottom: 720, width: 630, height: 680, x: 20, y: 40 },
        diagram: {
          found: true,
          rendered: true,
          viewportRect: { left: 20, top: 40, right: 650, bottom: 720, width: 630, height: 680, x: 20, y: 40 },
        },
        warnings: [],
      },
    ],
    warnings: [],
  };
  const initialDocument = documentFixture();
  initialDocument.questions = [
    {
      ...question("q1", [
        {
          id: "d1",
          kind: "diagram",
          graphConfig: {
            type: "graph2d",
            widthPx: 700,
            heightPx: 300,
            functions: [],
          },
        } as ContentBlock,
      ]),
      marks: 0,
    },
  ];
  const harness = adapterHost(
    {
      getRenderedPreviewMetrics: () => initialMetrics,
      waitForRenderedPreviewMetrics: async () => {
        waitedForPaint = true;
        return freshMetrics;
      },
    },
    initialDocument,
  );

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.layout.check",
    arguments: { mode: "student", autoRepair: true },
  });
  const data = result.data as MauthLayoutCheck;
  const diagram = harness.document.questions[0].contentBlocks.find((block) => block.id === "d1");

  assert.equal(waitedForPaint, true);
  assert.equal(result.ok, true);
  assert.equal(result.committedDocument, true);
  assert.equal(data.repair?.applied, true);
  assert.equal(data.repair?.afterIssueCount, 0);
  assert.equal(data.repair?.repairedIssueCount, 1);
  assert.equal(result.warnings.length, 0);
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.widthPx : undefined, 630);
  assert.equal(diagram?.kind === "diagram" ? diagram.graphConfig.heightPx : undefined, 270);
});

test("successful diagram edits return compact semantic review context", async () => {
  const harness = adapterHost();

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagram: {
        graphConfig: {
          type: "graph2d",
          functions: [{ expression: "x^2 - 4*x + 4", label: "f" }],
          xMin: -5,
          xMax: 5,
          yMin: -2,
          yMax: 8,
          showAxes: true,
          showGrid: true,
        },
      },
    },
  });
  const data = result.data as {
    semanticReview?: { required?: boolean; checklist?: string[] };
    postEditInspection?: { question?: { diagrams?: Array<{ summary?: { functions?: Array<{ expression?: string }> } }> } };
  };

  assert.equal(result.ok, true);
  assert.equal(data.semanticReview?.required, true);
  assert.ok(data.semanticReview?.checklist?.some((item) => item.includes("graph2d")));
  assert.equal(data.postEditInspection?.question?.diagrams?.[0]?.summary?.functions?.[0]?.expression, "x^2 - 4*x + 4");
});

test("does not commit assistant document changes when preflight rejects them", async () => {
  const harness = adapterHost({
    validateDocumentBeforeCommit: () => ({
      ok: false,
      error: "Penrose diagram did not render.",
      warnings: [{ code: "assistant-penrose-render-failed", message: "Fix graphConfig.options.substanceSource and retry." }],
      validationIssues: [
        {
          path: "questions[0].contentBlocks[1].graphConfig",
          message: "Penrose diagram did not render.",
          expected: "A renderable Penrose graphConfig.",
        },
      ],
    }),
  });

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagram: {
        graphConfig: {
          type: "geometricConstruction",
          options: {
            substanceSource: "Point A\nLabel A $A$\n",
          },
        },
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ path: string; message: string }> };

  assert.equal(result.ok, false);
  assert.equal(result.committedDocument, false);
  assert.equal(harness.commits.length, 0);
  assert.match(result.error ?? "", /Penrose diagram did not render/);
  assert.equal(data.validationIssues?.[0]?.path, "questions[0].contentBlocks[1].graphConfig");
  assert.equal(
    harness.document.questions[0].contentBlocks.some((block) => block.kind === "diagram"),
    false,
  );
});

test("commits diagram edits then reports preview inspection warnings for one repair pass", async () => {
  const harness = adapterHost(
    {
      waitForRenderedPreviewMetrics: async () => failedDiagramMetrics("q:q1/b:d1", "Stats chart could not render."),
    },
    {
      frontMatter: { assessmentTitle: "Vector Test" },
      formattingConfig: { showMarks: true },
      questions: [question("q1", [textBlock("t1", "Use the chart to answer the question.")])],
    },
  );

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagram: {
        id: "d1",
        graphConfig: {
          type: "statsChart",
          data: {
            chartType: "histogram",
            dataMode: "manualProbabilities",
            xValues: [1, 2],
            probabilities: [0.4, 0.6],
          },
        },
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ expected?: string; message: string; targetId?: string }> };

  assert.equal(result.ok, false);
  assert.equal(result.committedDocument, true);
  assert.equal(harness.commits.length, 1);
  assert.equal(
    harness.document.questions[0].contentBlocks.some((block) => block.kind === "diagram"),
    true,
  );
  assert.match(result.error ?? "", /post-edit inspection/i);
  assert.equal(data.repairTarget?.questionNumber, 1);
  assert.equal(data.repairTarget?.questionId, "q1");
  assert.match(data.repairTarget?.instruction ?? "", /do not append/i);
  assert(data.validationIssues?.some((issue) => issue.expected?.includes("mauth.author.addDiagram")));
  assert(data.validationIssues?.some((issue) => issue.expected?.includes("diagramId")));
  assert(data.validationIssues?.some((issue) => issue.expected?.includes("do not append")));
  assert(data.validationIssues?.some((issue) => issue.message.includes("failed to render")));
});

test("post-edit repair target pins failed appended question instead of allowing duplicate append", async () => {
  const harness = adapterHost(
    {
      waitForRenderedPreviewMetrics: async () =>
        failedDiagramMetrics("q:assistant-question-2/b:source-diagram", "Source diagram could not render."),
    },
    {
      frontMatter: { assessmentTitle: "Vector Test" },
      formattingConfig: { showMarks: true },
      questions: [question("q1", [textBlock("t1", "Existing question.")])],
    },
  );

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.question.upsert",
    arguments: {
      questionNumber: 2,
      marks: 5,
      questionText: "Use the chart to answer the question.",
      diagram: {
        id: "source-diagram",
        graphConfig: {
          type: "statsChart",
          data: {
            chartType: "histogram",
            dataMode: "manualProbabilities",
            xValues: [1, 2],
            probabilities: [0.4, 0.6],
          },
        },
      },
    },
  });
  const data = result.data as {
    repairTarget?: { questionNumber?: number; questionId?: string; diagramId?: string; instruction?: string };
    postEditInspection?: { repairTarget?: { questionNumber?: number; diagramId?: string } };
    validationIssues?: Array<{ expected?: string; targetId?: string }>;
  };

  assert.equal(result.ok, false);
  assert.equal(result.committedDocument, true);
  assert.equal(harness.commits.length, 1);
  assert.equal(harness.document.questions.length, 2);
  assert.equal(harness.document.questions[1].id, "assistant-question-2");
  assert.equal(data.repairTarget?.questionNumber, 2);
  assert.equal(data.repairTarget?.questionId, "assistant-question-2");
  assert.equal(data.repairTarget?.diagramId, "source-diagram");
  assert.equal(data.postEditInspection?.repairTarget?.questionNumber, 2);
  assert.match(data.repairTarget?.instruction ?? "", /do not append another question/i);
  assert(data.validationIssues?.some((issue) => issue.expected?.includes("Question 2")));
  assert(data.validationIssues?.some((issue) => issue.expected?.includes("do not append")));
});

test("waits for painted preview metrics before accepting diagram edits", async () => {
  let waitedForPaint = false;
  const paintedMetrics: MauthPreviewRenderedMetrics = {
    available: true,
    source: "browser-preview",
    activeAnchor: "q:q1/b:d1",
    pageCount: 1,
    pages: [
      {
        pageIndex: 0,
        pageNumber: 1,
        usedHeightPx: 300,
        totalHeightPx: 1000,
        remainingHeightPx: 700,
        usedPercent: 30,
        anchorCount: 1,
        overflow: false,
      },
    ],
    anchors: [
      {
        anchor: "q:q1/b:d1",
        kind: "questionBlock",
        role: "module",
        pageIndex: 0,
        pageNumber: 1,
        selected: true,
        viewportRect: { left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100, x: 10, y: 20 },
        diagram: {
          found: true,
          rendered: false,
          errorText: "Geometry diagram could not render.",
          viewportRect: { left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100, x: 10, y: 20 },
        },
        warnings: [
          {
            code: "rendered-diagram-failed",
            severity: "error",
            anchor: "q:q1/b:d1",
            message: "The selected diagram failed to render: Geometry diagram could not render.",
          },
        ],
      },
    ],
    warnings: [],
  };
  const harness = adapterHost({
    waitForRenderedPreviewMetrics: async () => {
      waitedForPaint = true;
      return paintedMetrics;
    },
  });

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagram: {
        id: "d1",
        graphConfig: {
          type: "statsChart",
          data: {
            chartType: "histogram",
            dataMode: "manualProbabilities",
            xValues: [1, 2],
            probabilities: [0.4, 0.6],
          },
        },
      },
    },
  });
  const data = result.data as { validationIssues?: Array<{ expected?: string; message: string; targetId?: string }> };

  assert.equal(waitedForPaint, true);
  assert.equal(result.ok, false);
  assert.equal(result.committedDocument, true);
  assert.match(result.error ?? "", /post-edit .*inspection/i);
  assert(data.validationIssues?.some((issue) => issue.targetId === "d1"));
  assert(data.validationIssues?.some((issue) => issue.message.includes("failed to render")));
});

test("waits for painted preview metrics before accepting solution layout edits", async () => {
  let waitedForPaint = false;
  const paintedMetrics: MauthPreviewRenderedMetrics = {
    available: true,
    source: "browser-preview",
    activeAnchor: "q:q1/b:q1-student-space",
    pageCount: 1,
    pages: [
      {
        pageIndex: 0,
        pageNumber: 1,
        usedHeightPx: 900,
        totalHeightPx: 1000,
        remainingHeightPx: 100,
        usedPercent: 90,
        anchorCount: 1,
        overflow: false,
      },
    ],
    anchors: [
      {
        anchor: "q:q1/b:q1-student-space",
        kind: "questionBlock",
        role: "module",
        pageIndex: 0,
        pageNumber: 1,
        selected: true,
        viewportRect: { left: 10, top: 20, right: 610, bottom: 220, width: 600, height: 200, x: 10, y: 20 },
        solutionSlot: {
          found: true,
          studentHeightPx: 120,
          solutionHeightPx: 220,
          solutionFitsStudentSpace: false,
          warningText: "Solution needs about 5 more lines than the student space.",
        },
        warnings: [
          {
            code: "rendered-solution-space-overflow",
            severity: "warning",
            anchor: "q:q1/b:q1-student-space",
            message: "Solution needs about 5 more lines than the student space.",
          },
        ],
      },
    ],
    warnings: [],
  };
  const harness = adapterHost({
    waitForRenderedPreviewMetrics: async () => {
      waitedForPaint = true;
      return paintedMetrics;
    },
  });

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.author.ensureSolutions",
    arguments: {
      questions: [
        {
          questionNumber: 1,
          studentSpaceLines: 2,
          solutionText: "Line one.\nLine two.\nLine three.\nLine four.\nLine five.",
        },
      ],
    },
  });
  const data = result.data as { validationIssues?: Array<{ expected?: string; message: string; targetId?: string }> };

  assert.equal(waitedForPaint, true);
  assert.equal(result.ok, false);
  assert.equal(result.committedDocument, true);
  assert.match(result.error ?? "", /post-edit .*inspection/i);
  assert(data.validationIssues?.some((issue) => issue.targetId === "q1-student-space"));
  assert(data.validationIssues?.some((issue) => issue.expected?.includes("mauth.author.adjustResponseSpaces")));
});

test("waits for painted preview metrics before accepting response-space edits", async () => {
  let waitedForPaint = false;
  const paintedMetrics: MauthPreviewRenderedMetrics = {
    available: true,
    source: "browser-preview",
    activeAnchor: "q:q1/b:s1",
    pageCount: 1,
    pages: [
      {
        pageIndex: 0,
        pageNumber: 1,
        usedHeightPx: 1040,
        totalHeightPx: 1000,
        remainingHeightPx: 0,
        usedPercent: 104,
        anchorCount: 1,
        overflow: true,
      },
    ],
    anchors: [
      {
        anchor: "q:q1/b:s1",
        kind: "questionBlock",
        role: "module",
        pageIndex: 0,
        pageNumber: 1,
        selected: true,
        viewportRect: { left: 10, top: 20, right: 610, bottom: 920, width: 600, height: 900, x: 10, y: 20 },
        warnings: [],
      },
    ],
    warnings: [
      {
        code: "rendered-page-overflow",
        severity: "warning",
        message: "Preview page 1 appears to overflow its A4 page box.",
      },
    ],
  };
  const harness = adapterHost(
    {
      waitForRenderedPreviewMetrics: async () => {
        waitedForPaint = true;
        return paintedMetrics;
      },
    },
    {
      frontMatter: { assessmentTitle: "Original" },
      formattingConfig: { showMarks: true },
      questions: [question("q1", [textBlock("t1", "Original wording."), { id: "s1", kind: "space", lines: 4, visibility: "student" }])],
    },
  );

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.author.adjustResponseSpaces",
    arguments: {
      targets: [{ questionNumber: 1, lines: 20, mode: "set" }],
    },
  });
  const data = result.data as { validationIssues?: Array<{ expected?: string; message: string }> };

  assert.equal(waitedForPaint, true);
  assert.equal(result.ok, false);
  assert.equal(result.committedDocument, true);
  assert.match(result.error ?? "", /post-edit .*inspection/i);
  assert(data.validationIssues?.some((issue) => issue.message.includes("overflow")));
});

test("injects serialized current document when saving through file tools", async () => {
  const driver = createMemoryDriver([{ summary: fileSummary("tests", "folder"), content: null, versions: [] }]);
  const harness = adapterHost({ fileDriver: driver });

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.files.saveAs",
    arguments: { path: "Saved Test" },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedPaths, ["tests/Saved Test.test.json"]);
  assert.deepEqual(harness.activePaths, ["tests/Saved Test.test.json"]);
  const saved = await driver.getFile("project-1", "tests/Saved Test.test.json");
  assert.equal(JSON.parse(saved.content ?? "{}").frontMatter.assessmentTitle, "Original");
});

test("saves the active file through file tools without an explicit path", async () => {
  const driver = createMemoryDriver([
    { summary: fileSummary("tests", "folder"), content: null, versions: [] },
    { summary: fileSummary("tests/Open.test.json", "file"), content: JSON.stringify(documentFixture("Old")), versions: [] },
  ]);
  const harness = adapterHost({ fileDriver: driver }, documentFixture("Updated"));

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.files.save",
    arguments: {},
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedPaths, ["tests/Open.test.json"]);
  assert.deepEqual(harness.activePaths, ["tests/Open.test.json"]);
  const saved = await driver.getFile("project-1", "tests/Open.test.json");
  assert.equal(JSON.parse(saved.content ?? "{}").frontMatter.assessmentTitle, "Updated");
  assert.equal(saved.revision, 2);
});

test("reports that unsaved current tests need save-as before current save", async () => {
  const driver = createMemoryDriver([{ summary: fileSummary("tests", "folder"), content: null, versions: [] }]);
  const harness = adapterHost({ fileDriver: driver });
  harness.setActiveFile(null, null);

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.files.save",
    arguments: {},
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /save as/i);
  assert.deepEqual(result.changedPaths, []);
});

test("opens a file by parsing and committing the project-file content", async () => {
  const openedDocument = documentFixture("Opened");
  const driver = createMemoryDriver([
    { summary: fileSummary("tests", "folder"), content: null, versions: [] },
    { summary: fileSummary("tests/Opened.test.json", "file"), content: JSON.stringify(openedDocument), versions: [] },
  ]);
  const harness = adapterHost({ fileDriver: driver });

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.files.open",
    arguments: { path: "Opened" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.committedDocument, true);
  assert.equal(harness.document.frontMatter.assessmentTitle, "Opened");
  assert.deepEqual(harness.activePaths, ["tests/Opened.test.json"]);
});

test("clears active file path when deleting the active file", async () => {
  const driver = createMemoryDriver([
    { summary: fileSummary("tests", "folder"), content: null, versions: [] },
    { summary: fileSummary("tests/Open.test.json", "file"), content: JSON.stringify(documentFixture()), versions: [] },
  ]);
  const harness = adapterHost({ fileDriver: driver });

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.files.delete",
    arguments: { path: "Open" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.activeFilePath, null);
  assert.deepEqual(harness.activePaths, [null]);
});

test("reports missing file driver before file operations run", async () => {
  const harness = adapterHost();
  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.files.list",
    arguments: {},
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /file driver/i);
});
