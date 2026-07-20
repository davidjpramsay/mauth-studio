import assert from "node:assert/strict";
import test from "node:test";

import type { FormattingConfig } from "@mauth-studio/shared";

import type { SavedTest } from "../lib/editorAppPersistence.ts";
import { type DocumentFlowItem, type DocumentSectionHeading, type QuestionBlock } from "../lib/editorDocumentNormalization.ts";
import { DEFAULT_FORMATTING_CONFIG } from "../lib/editorFormattingConfig.ts";
import { DEFAULT_FRONT_MATTER } from "../lib/frontMatterConfig.ts";

import { savedProjectDocumentState, type SavedProjectDocumentStateRuntime } from "./useSavedProjectDocumentApplier.ts";

function question(id: string): QuestionBlock {
  return {
    id,
    section: "Algebra",
    text: "",
    marks: 0,
    contentBlocks: [],
    parts: [],
    itemOrder: [],
  };
}

function savedTest(overrides: Partial<SavedTest> = {}): SavedTest {
  return {
    id: "saved-test",
    name: "Saved Test",
    frontMatter: { ...DEFAULT_FRONT_MATTER, assessmentTitle: "Saved Test" },
    questions: [question("q1")],
    sectionHeadings: [{ id: "h1", title: "Section A" }],
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
    ],
    formattingConfig: DEFAULT_FORMATTING_CONFIG,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const runtime = {
  normalizeQuestionBlocks: (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): QuestionBlock[] => {
      const record = item && typeof item === "object" ? (item as { id?: unknown }) : null;
      return typeof record?.id === "string" && record.id.startsWith("q") ? [question(record.id)] : [];
    });
  },
  normalizeSectionHeadings: (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): DocumentSectionHeading[] => {
      const record = item && typeof item === "object" ? (item as { id?: unknown; title?: unknown }) : null;
      return typeof record?.id === "string" && record.id.startsWith("h")
        ? [{ id: record.id, title: typeof record.title === "string" ? record.title : "" }]
        : [];
    });
  },
  normalizeDocumentFlow: (value: unknown, questions: QuestionBlock[], sectionHeadings: DocumentSectionHeading[]) => {
    const questionIds = new Set(questions.map((currentQuestion) => currentQuestion.id));
    const headingIds = new Set(sectionHeadings.map((heading) => heading.id));
    if (!Array.isArray(value)) return [];

    return value.flatMap((item): DocumentFlowItem[] => {
      const record = item && typeof item === "object" ? (item as { kind?: unknown; id?: unknown }) : null;
      if (record?.kind === "question" && typeof record.id === "string" && questionIds.has(record.id)) {
        return [{ kind: "question", id: record.id }];
      }
      if (record?.kind === "sectionHeading" && typeof record.id === "string" && headingIds.has(record.id)) {
        return [{ kind: "sectionHeading", id: record.id }];
      }
      return [];
    });
  },
} satisfies SavedProjectDocumentStateRuntime;

test("savedProjectDocumentState normalizes saved project document state", () => {
  const source = savedTest({
    questions: [question("q1"), { ...question("stale"), id: "stale" }],
    sectionHeadings: [{ id: "h1", title: "Section A" }],
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
      { kind: "question", id: "missing" },
    ],
  });

  const state = savedProjectDocumentState(source, runtime);

  assert.notEqual(state.frontMatter, source.frontMatter);
  assert.deepEqual(
    state.questions.map((currentQuestion) => currentQuestion.id),
    ["q1"],
  );
  assert.deepEqual(state.documentFlow, [
    { kind: "sectionHeading", id: "h1" },
    { kind: "question", id: "q1" },
  ]);
});

test("savedProjectDocumentState falls back for invalid formatting config", () => {
  const state = savedProjectDocumentState(
    savedTest({
      formattingConfig: { id: "custom", page: { widthPx: 999 } } as FormattingConfig,
    }),
    runtime,
  );

  assert.equal(state.formattingConfig.id, "custom");
  assert.equal(state.formattingConfig.showMarks, DEFAULT_FORMATTING_CONFIG.showMarks);
  assert.equal(state.formattingConfig.page?.widthPx, 999);
});
