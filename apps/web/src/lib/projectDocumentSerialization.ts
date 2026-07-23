import type { FormattingConfig } from "@mauth-studio/shared";

import { defaultSavedTestName, projectFileTypeForFrontMatter } from "./documentFileNaming.ts";
import type { CreateSavedTestSnapshotOptions, SavedTest } from "./editorAppPersistence.ts";
import type { DocumentFlowItem, DocumentSectionHeading, QuestionBlock } from "./editorDocumentNormalization.ts";
import { normalizeFormattingConfig } from "./editorFormattingConfig.ts";
import type { FrontMatterConfig } from "./frontMatterConfig.ts";
import { selectedLogoForFrontMatter, type LogoAsset } from "./logoLibrary.ts";
import { testFileDisplayName, testPathBasename, testPathFromProjectPath } from "./projectFiles.ts";

export const MAUTH_DOCUMENT_FORMAT = "mauth-studio-document";
export const MAUTH_DOCUMENT_SCHEMA_VERSION = 1;

export interface ProjectSerializableDocument {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  formattingConfig: FormattingConfig;
}

export interface ProjectFingerprintDocument extends ProjectSerializableDocument {
  logo?: LogoAsset | null;
}

export interface SerializedProjectDocumentSnapshot {
  content: string;
  fileType: ReturnType<typeof projectFileTypeForFrontMatter>;
  fingerprint: string;
}

export interface ProjectDocumentSerializationRuntime {
  createSavedTestSnapshot: (options: CreateSavedTestSnapshotOptions) => SavedTest;
  editorDocumentFingerprint: (
    frontMatter: FrontMatterConfig,
    questions: QuestionBlock[],
    formattingConfig: FormattingConfig,
    logo?: LogoAsset | null,
    sectionHeadings?: DocumentSectionHeading[],
    documentFlow?: DocumentFlowItem[],
  ) => string;
}

export function defaultProjectFileNameForDocument(activeProjectFilePath: string | null | undefined, frontMatter: FrontMatterConfig) {
  const activeTestPath = activeProjectFilePath ? testPathFromProjectPath(activeProjectFilePath) : null;
  if (activeTestPath !== null) return testFileDisplayName(testPathBasename(activeTestPath));
  return defaultSavedTestName(frontMatter);
}

export function serializeProjectDocumentSnapshot({
  filePath,
  testName,
  document,
  logos,
  runtime,
}: {
  filePath: string;
  testName: string;
  document: ProjectSerializableDocument;
  logos: LogoAsset[];
  runtime: ProjectDocumentSerializationRuntime;
}): SerializedProjectDocumentSnapshot {
  const nextFormattingConfig = normalizeFormattingConfig(document.formattingConfig);
  const currentLogo = selectedLogoForFrontMatter(logos, document.frontMatter);
  const savedTest = runtime.createSavedTestSnapshot({
    testId: `project-file:${filePath}`,
    name: testName,
    frontMatter: document.frontMatter,
    questions: document.questions,
    sectionHeadings: document.sectionHeadings,
    documentFlow: document.documentFlow,
    formattingConfig: nextFormattingConfig,
    logo: currentLogo,
  });

  const savedDocument = {
    format: MAUTH_DOCUMENT_FORMAT,
    schemaVersion: MAUTH_DOCUMENT_SCHEMA_VERSION,
    ...savedTest,
  };

  return {
    content: JSON.stringify(savedDocument, null, 2),
    fileType: projectFileTypeForFrontMatter(document.frontMatter),
    fingerprint: fingerprintProjectDocument({
      document: { ...document, formattingConfig: nextFormattingConfig, logo: currentLogo },
      logos,
      runtime,
    }),
  };
}

export function fingerprintProjectDocument({
  document,
  logos,
  runtime,
}: {
  document: ProjectFingerprintDocument;
  logos: LogoAsset[];
  runtime: Pick<ProjectDocumentSerializationRuntime, "editorDocumentFingerprint">;
}) {
  const currentLogo = document.logo ?? selectedLogoForFrontMatter(logos, document.frontMatter);
  return runtime.editorDocumentFingerprint(
    document.frontMatter,
    document.questions,
    document.formattingConfig,
    currentLogo,
    document.sectionHeadings,
    document.documentFlow,
  );
}

export function parseProjectSavedDocument(content: string | null | undefined, normalizeSavedTest: (value: unknown) => SavedTest | null) {
  const parsed = content ? (JSON.parse(content) as unknown) : null;
  return normalizeSavedTest(parsed);
}

export function parseProjectSavedDocumentSafely(
  content: string | null | undefined,
  normalizeSavedTest: (value: unknown) => SavedTest | null,
) {
  if (!content) return null;

  try {
    return parseProjectSavedDocument(content, normalizeSavedTest);
  } catch {
    return null;
  }
}
