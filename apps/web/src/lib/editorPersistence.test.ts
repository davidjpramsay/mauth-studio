import test from "node:test";
import assert from "node:assert/strict";

import { createEditorPersistence } from "./editorPersistence.ts";
import type { BrowserStorageLike } from "./browserStorage.ts";

interface TestQuestion {
  id: string;
  blank?: boolean;
}

interface TestHeading {
  id: string;
  title: string;
}

interface TestFlowItem {
  kind: "question" | "sectionHeading";
  id: string;
}

interface TestLogo {
  id: string;
  name: string;
  src: string;
  schoolName?: string;
}

function memoryStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    value(key: string) {
      const stored = values.get(key);
      return stored ? (JSON.parse(stored) as unknown) : null;
    },
  } satisfies BrowserStorageLike & { value(key: string): unknown };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

const persistence = createEditorPersistence<{ title: string }, TestQuestion, TestHeading, TestFlowItem, { mode: string }, TestLogo>({
  normalizeFrontMatter: (value) => {
    const record = asRecord(value);
    return typeof record?.title === "string" ? { title: record.title } : null;
  },
  normalizeQuestions: (value) =>
    Array.isArray(value)
      ? value.flatMap((question): TestQuestion[] => {
          const record = asRecord(question);
          return typeof record?.id === "string" ? [{ id: record.id, ...(record.blank === true ? { blank: true } : {}) }] : [];
        })
      : [],
  normalizeSectionHeadings: (value) =>
    Array.isArray(value)
      ? value.flatMap((heading): TestHeading[] => {
          const record = asRecord(heading);
          return typeof record?.id === "string" && typeof record.title === "string" ? [{ id: record.id, title: record.title }] : [];
        })
      : [],
  normalizeDocumentFlow: (value, questions, sectionHeadings) => {
    const questionIds = new Set(questions.map((question) => question.id));
    const headingIds = new Set(sectionHeadings.map((heading) => heading.id));
    if (!Array.isArray(value)) return questions.map((question) => ({ kind: "question", id: question.id }));
    return value.flatMap((item): TestFlowItem[] => {
      const record = asRecord(item);
      if (record?.kind === "question" && typeof record.id === "string" && questionIds.has(record.id))
        return [{ kind: "question", id: record.id }];
      if (record?.kind === "sectionHeading" && typeof record.id === "string" && headingIds.has(record.id)) {
        return [{ kind: "sectionHeading", id: record.id }];
      }
      return [];
    });
  },
  normalizeFormattingConfig: (value) => {
    const record = asRecord(value);
    return { mode: typeof record?.mode === "string" ? record.mode : "default" };
  },
  normalizeLogoAsset: (value) => {
    const record = asRecord(value);
    if (typeof record?.id !== "string" || typeof record.name !== "string" || typeof record.src !== "string") return undefined;
    return {
      id: record.id,
      name: record.name,
      src: record.src,
      ...(typeof record.schoolName === "string" ? { schoolName: record.schoolName } : {}),
    };
  },
  cloneSerializable: (value) => JSON.parse(JSON.stringify(value)) as typeof value,
  defaultDocumentFlow: (questions) => questions.map((question) => ({ kind: "question", id: question.id })),
  isBlankStarterQuestion: (question) => question?.blank === true,
});

test("normalizes autosave snapshots and filters stale flow entries", () => {
  const snapshot = persistence.normalizeEditorSnapshot({
    frontMatter: { title: "Exam" },
    questions: [{ id: "q1" }],
    sectionHeadings: [{ id: "h1", title: "Part A" }],
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
      { kind: "question", id: "missing" },
    ],
    formattingConfig: { mode: "exam" },
    logo: { id: "logo-1", name: "Logo", src: "/logo.svg", extra: "ignored" },
    activeProjectFilePath: "Tests/demo.test.json",
    activeProjectFileRevision: 7,
    documentOpen: false,
    updatedAt: "2026-06-30T01:00:00.000Z",
  });

  assert.deepEqual(snapshot, {
    frontMatter: { title: "Exam" },
    questions: [{ id: "q1" }],
    sectionHeadings: [{ id: "h1", title: "Part A" }],
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
    ],
    formattingConfig: { mode: "exam" },
    logo: { id: "logo-1", name: "Logo", src: "/logo.svg" },
    activeProjectFilePath: "Tests/demo.test.json",
    activeProjectFileRevision: 7,
    documentOpen: false,
    updatedAt: "2026-06-30T01:00:00.000Z",
  });

  assert.deepEqual(persistence.normalizeEditorSnapshot({ frontMatter: { title: "Exam" }, questions: [] }), {
    frontMatter: { title: "Exam" },
    questions: [],
    sectionHeadings: [],
    documentFlow: [],
    formattingConfig: { mode: "default" },
    logo: undefined,
    activeProjectFilePath: undefined,
    activeProjectFileRevision: undefined,
    documentOpen: undefined,
    updatedAt: undefined,
  });
});

test("loads a persisted draft with no questions", () => {
  const storage = memoryStorage({
    draft: JSON.stringify({
      frontMatter: { title: "Blank test" },
      questions: [],
      sectionHeadings: [],
      documentFlow: [],
      formattingConfig: { mode: "test" },
    }),
  });

  assert.deepEqual(persistence.loadCurrentDraft({ key: "draft", storage })?.questions, []);
  assert.deepEqual(persistence.loadCurrentDraft({ key: "draft", storage })?.documentFlow, []);
});

test("loads and persists current drafts through primary and legacy keys", () => {
  const storage = memoryStorage({
    legacy: JSON.stringify({
      frontMatter: { title: "Legacy draft" },
      questions: [{ id: "q1" }],
      formattingConfig: { mode: "legacy" },
    }),
  });

  assert.deepEqual(persistence.loadCurrentDraft({ key: "draft", legacyKey: "legacy", storage })?.frontMatter, { title: "Legacy draft" });
  assert.equal(
    persistence.persistCurrentDraft({
      key: "draft",
      snapshot: {
        frontMatter: { title: "Saved draft" },
        questions: [{ id: "q2" }],
        sectionHeadings: [],
        documentFlow: [{ kind: "question", id: "q2" }],
        formattingConfig: { mode: "saved" },
      },
      storage,
      now: () => "2026-06-30T02:00:00.000Z",
    }),
    true,
  );
  assert.deepEqual(storage.value("draft"), {
    frontMatter: { title: "Saved draft" },
    questions: [{ id: "q2" }],
    sectionHeadings: [],
    documentFlow: [{ kind: "question", id: "q2" }],
    formattingConfig: { mode: "saved" },
    updatedAt: "2026-06-30T02:00:00.000Z",
  });
});

test("merges legacy saved tests by id and keeps the newest updatedAt", () => {
  const older = persistence.normalizeSavedTest({
    id: "test-1",
    name: "Old",
    frontMatter: { title: "Old" },
    questions: [{ id: "q1" }],
    updatedAt: "2026-06-30T01:00:00.000Z",
  });
  const newer = persistence.normalizeSavedTest({
    id: "test-1",
    name: "New",
    frontMatter: { title: "New" },
    questions: [{ id: "q2" }],
    updatedAt: "2026-06-30T02:00:00.000Z",
  });
  const other = persistence.normalizeSavedTest({
    id: "test-2",
    name: "Other",
    frontMatter: { title: "Other" },
    questions: [{ id: "q3" }],
    updatedAt: "2026-06-30T03:00:00.000Z",
  });

  assert.ok(older);
  assert.ok(newer);
  assert.ok(other);
  assert.deepEqual(
    persistence.mergeLegacySavedTests([newer], [older, other]).map((savedTest) => savedTest.name),
    ["Other", "New"],
  );
});

test("prefers real autosave work over newer blank starter drafts", () => {
  const blankNew = persistence.normalizeEditorSnapshot({
    frontMatter: { title: "Blank" },
    questions: [{ id: "q1", blank: true }],
    updatedAt: "2026-06-30T03:00:00.000Z",
  });
  const realOld = persistence.normalizeEditorSnapshot({
    frontMatter: { title: "Real" },
    questions: [{ id: "q2" }],
    updatedAt: "2026-06-30T01:00:00.000Z",
  });

  assert.equal(persistence.newerAutosave(blankNew, realOld), realOld);
});

test("creates saved snapshots and stable document fingerprints from normalized content", () => {
  const saved = persistence.createSavedTestSnapshot({
    testId: "test-1",
    name: "Test 1",
    frontMatter: { title: "Test" },
    questions: [{ id: "q1" }],
    sectionHeadings: [{ id: "h1", title: "A" }],
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
    ],
    formattingConfig: { mode: "exam" },
    logo: { id: "logo", name: "Logo", src: "/logo.svg", schoolName: "School" },
    createdAt: "2026-06-29T00:00:00.000Z",
  });

  assert.equal(saved.createdAt, "2026-06-29T00:00:00.000Z");
  assert.deepEqual(saved.logo, { id: "logo", name: "Logo", src: "/logo.svg", schoolName: "School" });

  const fingerprint = persistence.editorDocumentFingerprint({
    frontMatter: { title: "Test" },
    questions: [{ id: "q1" }],
    sectionHeadings: [{ id: "h1", title: "A" }],
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
      { kind: "question", id: "missing" },
    ],
    formattingConfig: { mode: "exam" },
    logo: { id: "logo", name: "Logo", src: "/logo.svg", schoolName: "School" },
  });

  assert.deepEqual(JSON.parse(fingerprint), {
    frontMatter: { title: "Test" },
    questions: [{ id: "q1" }],
    sectionHeadings: [{ id: "h1", title: "A" }],
    documentFlow: [
      { kind: "sectionHeading", id: "h1" },
      { kind: "question", id: "q1" },
    ],
    formattingConfig: { mode: "exam" },
    logo: { id: "logo", name: "Logo", src: "/logo.svg", schoolName: "School" },
  });
});
