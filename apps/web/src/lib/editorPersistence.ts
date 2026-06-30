import { loadBrowserJson, newerAutosaveSnapshot, persistBrowserSnapshot, type BrowserStorageLike } from "./browserStorage.ts";

interface LogoSnapshotLike {
  id: string;
  name: string;
  src: string;
  schoolName?: string;
}

export interface EditorPersistenceConfig<
  TFrontMatter,
  TQuestion,
  TSectionHeading,
  TDocumentFlow,
  TFormatting,
  TLogo extends LogoSnapshotLike,
> {
  normalizeFrontMatter: (value: unknown) => TFrontMatter | null;
  normalizeQuestions: (value: unknown) => TQuestion[];
  normalizeSectionHeadings: (value: unknown) => TSectionHeading[];
  normalizeDocumentFlow: (value: unknown, questions: TQuestion[], sectionHeadings: TSectionHeading[]) => TDocumentFlow[];
  normalizeFormattingConfig: (value: unknown) => TFormatting;
  normalizeLogoAsset: (value: unknown) => TLogo | undefined;
  cloneSerializable: <T>(value: T) => T;
  defaultDocumentFlow: (questions: TQuestion[]) => TDocumentFlow[];
  isBlankStarterQuestion: (question?: TQuestion) => boolean;
}

export interface AutosavedEditorSnapshot<
  TFrontMatter,
  TQuestion,
  TSectionHeading,
  TDocumentFlow,
  TFormatting,
  TLogo extends LogoSnapshotLike,
> {
  frontMatter: TFrontMatter;
  questions: TQuestion[];
  sectionHeadings: TSectionHeading[];
  documentFlow: TDocumentFlow[];
  formattingConfig: TFormatting;
  logo?: TLogo;
  activeProjectFilePath?: string;
  activeProjectFileRevision?: number;
  documentOpen?: boolean;
  updatedAt?: string;
}

export interface SavedDocumentSnapshot<
  TFrontMatter,
  TQuestion,
  TSectionHeading,
  TDocumentFlow,
  TFormatting,
  TLogo extends LogoSnapshotLike,
> {
  id: string;
  name: string;
  frontMatter: TFrontMatter;
  questions: TQuestion[];
  sectionHeadings: TSectionHeading[];
  documentFlow: TDocumentFlow[];
  formattingConfig: TFormatting;
  logo?: TLogo;
  createdAt: string;
  updatedAt: string;
}

interface CurrentDraftOptions {
  key: string;
  legacyKey?: string;
  storage?: BrowserStorageLike | null;
}

interface PersistDraftOptions<TSnapshot extends object> {
  key: string;
  snapshot: TSnapshot;
  storage?: BrowserStorageLike | null;
  now?: () => string;
}

interface PersistSavedDocumentsOptions<TSavedDocument extends object> {
  key: string;
  savedDocuments: TSavedDocument[];
  storage?: BrowserStorageLike | null;
}

type CreateSavedDocumentSnapshotOptions<
  TFrontMatter,
  TQuestion,
  TSectionHeading,
  TDocumentFlow,
  TFormatting,
  TLogo extends LogoSnapshotLike,
> = {
  testId: string;
  name: string;
  frontMatter: TFrontMatter;
  questions: TQuestion[];
  sectionHeadings?: TSectionHeading[];
  documentFlow?: TDocumentFlow[];
  formattingConfig: TFormatting;
  logo?: TLogo;
  createdAt?: string;
};

type EditorDocumentFingerprintOptions<
  TFrontMatter,
  TQuestion,
  TSectionHeading,
  TDocumentFlow,
  TFormatting,
  TLogo extends LogoSnapshotLike,
> = {
  frontMatter: TFrontMatter;
  questions: TQuestion[];
  sectionHeadings?: TSectionHeading[];
  documentFlow?: TDocumentFlow[];
  formattingConfig: TFormatting;
  logo?: TLogo | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function savedLogoSnapshot<TLogo extends LogoSnapshotLike>(logo?: TLogo | null): TLogo | undefined {
  return logo
    ? ({
        id: logo.id,
        name: logo.name,
        src: logo.src,
        ...(typeof logo.schoolName === "string" ? { schoolName: logo.schoolName } : {}),
      } as TLogo)
    : undefined;
}

export function createEditorPersistence<
  TFrontMatter,
  TQuestion,
  TSectionHeading,
  TDocumentFlow,
  TFormatting,
  TLogo extends LogoSnapshotLike,
>({
  normalizeFrontMatter,
  normalizeQuestions,
  normalizeSectionHeadings,
  normalizeDocumentFlow,
  normalizeFormattingConfig,
  normalizeLogoAsset,
  cloneSerializable,
  defaultDocumentFlow,
  isBlankStarterQuestion,
}: EditorPersistenceConfig<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo>) {
  type Autosave = AutosavedEditorSnapshot<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo>;
  type SavedDocument = SavedDocumentSnapshot<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo>;

  function normalizeEditorSnapshot(value: unknown): Autosave | null {
    const record = asRecord(value);
    if (!record) return null;
    const frontMatter = normalizeFrontMatter(record.frontMatter);
    const questions = normalizeQuestions(record.questions);
    const sectionHeadings = normalizeSectionHeadings(record.sectionHeadings);
    const documentFlow = normalizeDocumentFlow(record.documentFlow, questions, sectionHeadings);
    const formattingConfig = normalizeFormattingConfig(record.formattingConfig);
    if (!frontMatter || !questions.length) return null;

    return {
      frontMatter,
      questions,
      sectionHeadings,
      documentFlow,
      formattingConfig,
      logo: normalizeLogoAsset(record.logo),
      activeProjectFilePath: typeof record.activeProjectFilePath === "string" ? record.activeProjectFilePath : undefined,
      activeProjectFileRevision:
        typeof record.activeProjectFileRevision === "number" && Number.isInteger(record.activeProjectFileRevision)
          ? record.activeProjectFileRevision
          : undefined,
      documentOpen: typeof record.documentOpen === "boolean" ? record.documentOpen : undefined,
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    };
  }

  function loadCurrentDraft(options: CurrentDraftOptions): Autosave | null {
    return loadBrowserJson({
      key: options.key,
      legacyKey: options.legacyKey,
      normalize: normalizeEditorSnapshot,
      storage: options.storage,
    });
  }

  function persistCurrentDraft({ key, snapshot, storage, now }: PersistDraftOptions<Autosave>) {
    return persistBrowserSnapshot({ key, snapshot, storage, now });
  }

  function normalizeSavedTests(value: unknown): SavedDocument[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((test): SavedDocument[] => {
      const record = asRecord(test);
      if (!record) return [];
      const frontMatter = normalizeFrontMatter(record.frontMatter);
      if (!frontMatter || typeof record.id !== "string" || typeof record.name !== "string") return [];
      const createdAt = typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString();
      const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : createdAt;
      const questions = normalizeQuestions(record.questions);
      const sectionHeadings = normalizeSectionHeadings(record.sectionHeadings);
      const documentFlow = normalizeDocumentFlow(record.documentFlow, questions, sectionHeadings);

      return [
        {
          id: record.id,
          name: record.name,
          frontMatter,
          questions,
          sectionHeadings,
          documentFlow,
          formattingConfig: normalizeFormattingConfig(record.formattingConfig),
          logo: normalizeLogoAsset(record.logo),
          createdAt,
          updatedAt,
        },
      ];
    });
  }

  function normalizeSavedTest(value: unknown): SavedDocument | null {
    return normalizeSavedTests([value])[0] ?? null;
  }

  function loadLegacySavedTests(options: CurrentDraftOptions): SavedDocument[] {
    return (
      loadBrowserJson({
        key: options.key,
        legacyKey: options.legacyKey,
        normalize: normalizeSavedTests,
        storage: options.storage,
      }) ?? []
    );
  }

  function mergeLegacySavedTests(primary: SavedDocument[], fallback: SavedDocument[]) {
    const byId = new Map<string, SavedDocument>();
    for (const test of fallback) byId.set(test.id, test);
    for (const test of primary) {
      const existing = byId.get(test.id);
      byId.set(test.id, !existing || test.updatedAt >= existing.updatedAt ? test : existing);
    }
    return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  function newerAutosave(left: Autosave | null, right: Autosave | null) {
    return newerAutosaveSnapshot(
      left,
      right,
      (autosave) => autosave.questions.length === 1 && isBlankStarterQuestion(autosave.questions[0]),
    );
  }

  function persistLegacySavedTests({
    key,
    savedDocuments,
    storage = typeof window === "undefined" ? null : window.localStorage,
  }: PersistSavedDocumentsOptions<SavedDocument>) {
    if (!storage) return false;

    try {
      storage.setItem(key, JSON.stringify(savedDocuments));
      return true;
    } catch {
      return false;
    }
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
  }: CreateSavedDocumentSnapshotOptions<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo>): SavedDocument {
    const now = new Date().toISOString();
    const normalizedQuestions = normalizeQuestions(questions);
    const normalizedHeadings = normalizeSectionHeadings(sectionHeadings);
    const normalizedFlow = normalizeDocumentFlow(documentFlow, normalizedQuestions, normalizedHeadings);

    return {
      id: testId,
      name,
      frontMatter: cloneSerializable(frontMatter),
      questions: cloneSerializable(normalizedQuestions),
      sectionHeadings: cloneSerializable(normalizedHeadings),
      documentFlow: cloneSerializable(normalizedFlow),
      formattingConfig: cloneSerializable(normalizeFormattingConfig(formattingConfig)),
      logo: savedLogoSnapshot(logo),
      createdAt: createdAt ?? now,
      updatedAt: now,
    };
  }

  function editorDocumentFingerprint({
    frontMatter,
    questions,
    sectionHeadings = [],
    documentFlow,
    formattingConfig,
    logo,
  }: EditorDocumentFingerprintOptions<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo>) {
    const normalizedQuestions = normalizeQuestions(questions);
    const normalizedHeadings = normalizeSectionHeadings(sectionHeadings);
    return JSON.stringify({
      frontMatter: cloneSerializable(frontMatter),
      questions: cloneSerializable(normalizedQuestions),
      sectionHeadings: cloneSerializable(normalizedHeadings),
      documentFlow: cloneSerializable(
        normalizeDocumentFlow(documentFlow ?? defaultDocumentFlow(questions), normalizedQuestions, normalizedHeadings),
      ),
      formattingConfig: cloneSerializable(normalizeFormattingConfig(formattingConfig)),
      logo: savedLogoSnapshot(logo),
    });
  }

  return {
    normalizeEditorSnapshot,
    loadCurrentDraft,
    persistCurrentDraft,
    normalizeSavedTests,
    normalizeSavedTest,
    loadLegacySavedTests,
    mergeLegacySavedTests,
    newerAutosave,
    persistLegacySavedTests,
    createSavedTestSnapshot,
    editorDocumentFingerprint,
  };
}
