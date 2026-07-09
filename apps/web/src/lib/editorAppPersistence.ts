import type { FormattingConfig } from "@mauth-studio/shared";

import {
  createEditorPersistence,
  type AutosavedEditorSnapshot as PersistedEditorSnapshot,
  type SavedDocumentSnapshot,
} from "./editorPersistence.ts";
import {
  defaultDocumentFlow,
  type DocumentFlowItem,
  type DocumentSectionHeading,
  type QuestionBlock,
} from "./editorDocumentNormalization.ts";
import { isBlankStarterQuestion } from "./editorStarterDocuments.ts";
import { normalizeFormattingConfig } from "./editorFormattingConfig.ts";
import { normalizeFrontMatter, type FrontMatterConfig } from "./frontMatterConfig.ts";
import { normalizeLogoAsset, type LogoAsset } from "./logoLibrary.ts";

const SAVED_TEST_STORAGE_KEY = "mauth-studio.saved-tests.v1";
const CURRENT_DRAFT_STORAGE_KEY = "mauth-studio.current-draft.v1";
const LEGACY_SAVED_TEST_STORAGE_KEY = "math-app.saved-tests.v1";
const LEGACY_CURRENT_DRAFT_STORAGE_KEY = "math-app.current-draft.v1";

export const PROJECT_FILE_REVISION_MISSING_ERROR = "PROJECT_FILE_REVISION_MISSING";

export type AutosavedEditorSnapshot = PersistedEditorSnapshot<
  FrontMatterConfig,
  QuestionBlock,
  DocumentSectionHeading,
  DocumentFlowItem,
  FormattingConfig,
  LogoAsset
>;

export type SavedTest = SavedDocumentSnapshot<
  FrontMatterConfig,
  QuestionBlock,
  DocumentSectionHeading,
  DocumentFlowItem,
  FormattingConfig,
  LogoAsset
>;

export interface CreateSavedTestSnapshotOptions {
  testId: string;
  name: string;
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings?: DocumentSectionHeading[];
  documentFlow?: DocumentFlowItem[];
  formattingConfig: FormattingConfig;
  logo?: LogoAsset;
  createdAt?: string;
}

export interface EditorAppPersistenceRuntimeOptions {
  normalizeQuestionBlocks: (value: unknown) => QuestionBlock[];
  normalizeSectionHeadings: (value: unknown) => DocumentSectionHeading[];
  normalizeDocumentFlow: (value: unknown, questions: QuestionBlock[], sectionHeadings: DocumentSectionHeading[]) => DocumentFlowItem[];
}

export function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createEditorAppPersistence({
  normalizeQuestionBlocks,
  normalizeSectionHeadings,
  normalizeDocumentFlow,
}: EditorAppPersistenceRuntimeOptions) {
  const editorPersistence = createEditorPersistence<
    FrontMatterConfig,
    QuestionBlock,
    DocumentSectionHeading,
    DocumentFlowItem,
    FormattingConfig,
    LogoAsset
  >({
    normalizeFrontMatter,
    normalizeQuestions: normalizeQuestionBlocks,
    normalizeSectionHeadings,
    normalizeDocumentFlow,
    normalizeFormattingConfig,
    normalizeLogoAsset,
    cloneSerializable,
    defaultDocumentFlow,
    isBlankStarterQuestion,
  });

  function normalizeEditorSnapshot(value: unknown): AutosavedEditorSnapshot | null {
    return editorPersistence.normalizeEditorSnapshot(value);
  }

  function loadCurrentDraft(): AutosavedEditorSnapshot | null {
    return editorPersistence.loadCurrentDraft({
      key: CURRENT_DRAFT_STORAGE_KEY,
      legacyKey: LEGACY_CURRENT_DRAFT_STORAGE_KEY,
    });
  }

  let initialEditorDraftCache: AutosavedEditorSnapshot | null | undefined;

  function loadInitialEditorDraft() {
    if (initialEditorDraftCache !== undefined) return initialEditorDraftCache;
    initialEditorDraftCache = loadCurrentDraft();
    return initialEditorDraftCache;
  }

  function persistCurrentDraft(snapshot: AutosavedEditorSnapshot) {
    editorPersistence.persistCurrentDraft({ key: CURRENT_DRAFT_STORAGE_KEY, snapshot });
  }

  function loadLegacySavedTests(): SavedTest[] {
    return editorPersistence.loadLegacySavedTests({
      key: SAVED_TEST_STORAGE_KEY,
      legacyKey: LEGACY_SAVED_TEST_STORAGE_KEY,
    });
  }

  function normalizeSavedTests(value: unknown): SavedTest[] {
    return editorPersistence.normalizeSavedTests(value);
  }

  function normalizeSavedTest(value: unknown): SavedTest | null {
    return editorPersistence.normalizeSavedTest(value);
  }

  function mergeLegacySavedTests(primary: SavedTest[], fallback: SavedTest[]) {
    return editorPersistence.mergeLegacySavedTests(primary, fallback);
  }

  function newerAutosave(left: AutosavedEditorSnapshot | null, right: AutosavedEditorSnapshot | null) {
    return editorPersistence.newerAutosave(left, right);
  }

  function persistLegacySavedTests(legacyTests: SavedTest[]) {
    editorPersistence.persistLegacySavedTests({
      key: SAVED_TEST_STORAGE_KEY,
      savedDocuments: legacyTests,
    });
  }

  function createSavedTestSnapshot({
    testId,
    name,
    frontMatter,
    questions,
    sectionHeadings,
    documentFlow,
    formattingConfig,
    logo,
    createdAt,
  }: CreateSavedTestSnapshotOptions): SavedTest {
    return editorPersistence.createSavedTestSnapshot({
      testId,
      name,
      frontMatter,
      questions,
      sectionHeadings,
      documentFlow,
      formattingConfig,
      logo,
      createdAt,
    });
  }

  function editorDocumentFingerprint(
    frontMatter: FrontMatterConfig,
    questions: QuestionBlock[],
    formattingConfig: FormattingConfig,
    logo?: LogoAsset | null,
    sectionHeadings: DocumentSectionHeading[] = [],
    documentFlow: DocumentFlowItem[] = defaultDocumentFlow(questions),
  ) {
    return editorPersistence.editorDocumentFingerprint({
      frontMatter,
      questions,
      formattingConfig,
      logo,
      sectionHeadings,
      documentFlow,
    });
  }

  return {
    normalizeEditorSnapshot,
    loadCurrentDraft,
    loadInitialEditorDraft,
    persistCurrentDraft,
    loadLegacySavedTests,
    normalizeSavedTests,
    normalizeSavedTest,
    mergeLegacySavedTests,
    newerAutosave,
    persistLegacySavedTests,
    createSavedTestSnapshot,
    editorDocumentFingerprint,
  };
}
