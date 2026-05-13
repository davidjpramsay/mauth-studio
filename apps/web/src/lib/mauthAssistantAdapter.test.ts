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
import type { MauthPreviewRenderedMetrics } from "./mauthAssistantTools.ts";

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
    setActiveFilePath: (path) => {
      activeFilePath = path;
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
    name: "mauth.author.replaceQuestion",
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
  assert.equal(result.toolName, "mauth.author.replaceQuestion");
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
    semanticReview?: { required?: boolean };
    postEditInspection?: { question?: { diagrams?: Array<{ summary?: { functions?: Array<{ expression?: string }> } }> } };
  };

  assert.equal(result.ok, true);
  assert.equal(data.semanticReview?.required, true);
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
    {},
    {
      frontMatter: { assessmentTitle: "Vector Test" },
      formattingConfig: { showMarks: true },
      questions: [question("q1", [textBlock("t1", "Evaluate $\\mathbf{a}\\cdot\\mathbf{b}$ and $\\mathbf{c}\\cdot\\mathbf{d}$ exactly.")])],
    },
  );

  const result = await runMauthAssistantAdapterTool(harness.host, {
    name: "mauth.author.addDiagram",
    arguments: {
      questionNumber: 1,
      diagram: {
        graphConfig: {
          type: "geometricConstruction",
          data: {},
          options: {
            substanceSource: [
              "Point O, A, B, C, D",
              "NamedSegment OA, OB, OC, OD",
              "Segment(OA, O, A)",
              "Segment(OB, O, B)",
              "Segment(OC, O, C)",
              "Segment(OD, O, D)",
              "Label A $\\mathbf{a}$",
              "Label B $\\mathbf{b}$",
            ].join("\n"),
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
  assert(data.validationIssues?.some((issue) => issue.expected?.includes("mauth.author.addDiagram")));
  assert(data.validationIssues?.some((issue) => issue.expected?.includes("diagramId")));
  assert(data.validationIssues?.some((issue) => issue.message.includes("$\\mathbf{c}$")));
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
