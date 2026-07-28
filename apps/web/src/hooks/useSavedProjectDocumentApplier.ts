import type { MutableRefObject } from "react";
import type { FormattingConfig, ProjectSummary } from "@mauth-studio/shared";

import { cloneSerializable, type SavedTest } from "../lib/editorAppPersistence.ts";
import { firstDocumentFlowAnchor, firstQuestionId } from "../lib/editorSectionHeadings.ts";
import type { DocumentFlowItem, DocumentSectionHeading, QuestionBlock } from "../lib/editorDocumentNormalization.ts";
import { normalizeFormattingConfig } from "../lib/editorFormattingConfig.ts";
import type { FrontMatterConfig } from "../lib/frontMatterConfig.ts";
import { selectedLogoFromLibrary, type LogoAsset } from "../lib/logoLibrary.ts";
import type { ProjectSaveConflict } from "./useProjectFilesController.ts";

export interface SavedProjectDocumentState {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  formattingConfig: FormattingConfig;
}

export interface SavedProjectDocumentStateRuntime {
  normalizeQuestionBlocks: (value: unknown) => QuestionBlock[];
  normalizeSectionHeadings: (value: unknown) => DocumentSectionHeading[];
  normalizeDocumentFlow: (value: unknown, questions: QuestionBlock[], sectionHeadings: DocumentSectionHeading[]) => DocumentFlowItem[];
}

export function savedProjectDocumentState(savedTest: SavedTest, runtime: SavedProjectDocumentStateRuntime): SavedProjectDocumentState {
  const frontMatter = cloneSerializable(savedTest.frontMatter);
  const questions = runtime.normalizeQuestionBlocks(savedTest.questions);
  const sectionHeadings = runtime.normalizeSectionHeadings(savedTest.sectionHeadings);
  const documentFlow = runtime.normalizeDocumentFlow(savedTest.documentFlow, questions, sectionHeadings);
  const formattingConfig = normalizeFormattingConfig(savedTest.formattingConfig);

  return {
    frontMatter,
    questions,
    sectionHeadings,
    documentFlow,
    formattingConfig,
  };
}

export function remapSavedProjectLogo(
  document: SavedProjectDocumentState,
  savedLogo: LogoAsset | null | undefined,
  importedLogo: LogoAsset | undefined,
) {
  if (!savedLogo || !importedLogo || document.frontMatter.logoId !== savedLogo.id || importedLogo.id === savedLogo.id) return document;
  return {
    ...document,
    frontMatter: {
      ...document.frontMatter,
      logoId: importedLogo.id,
      ...(typeof importedLogo.schoolName === "string" ? { schoolName: importedLogo.schoolName } : {}),
    },
  };
}

interface UseSavedProjectDocumentApplierOptions {
  logosRef: MutableRefObject<LogoAsset[]>;
  normalizeQuestionBlocks: SavedProjectDocumentStateRuntime["normalizeQuestionBlocks"];
  normalizeSectionHeadings: SavedProjectDocumentStateRuntime["normalizeSectionHeadings"];
  normalizeDocumentFlow: SavedProjectDocumentStateRuntime["normalizeDocumentFlow"];
  editorDocumentFingerprint: (
    frontMatter: FrontMatterConfig,
    questions: QuestionBlock[],
    formattingConfig: FormattingConfig,
    logo?: LogoAsset | null,
    sectionHeadings?: DocumentSectionHeading[],
    documentFlow?: DocumentFlowItem[],
  ) => string;
  clearEditorHistory: () => void;
  setEditorDocument: (document: SavedProjectDocumentState) => void;
  setEditorDocumentOpenState: (open: boolean) => void;
  setActiveQuestionId: (questionId: string) => void;
  setActiveTocItemId: (anchor: string) => void;
  setActiveRailItemId: (anchor: string) => void;
  clearEditorTransientState: () => void;
  setActiveProject: (project: ProjectSummary) => void;
  setActiveProjectFileState: (filePath: string | null, revision: number | null) => void;
  setProjectSaveConflict: (conflict: ProjectSaveConflict | null) => void;
  updateLastProjectSaveFingerprint: (fingerprint: string | null) => void;
  importLogo: (value: unknown) => LogoAsset | undefined;
}

export function useSavedProjectDocumentApplier({
  logosRef,
  normalizeQuestionBlocks,
  normalizeSectionHeadings,
  normalizeDocumentFlow,
  editorDocumentFingerprint,
  clearEditorHistory,
  setEditorDocument,
  setEditorDocumentOpenState,
  setActiveQuestionId,
  setActiveTocItemId,
  setActiveRailItemId,
  clearEditorTransientState,
  setActiveProject,
  setActiveProjectFileState,
  setProjectSaveConflict,
  updateLastProjectSaveFingerprint,
  importLogo,
}: UseSavedProjectDocumentApplierOptions) {
  function applySavedProjectDocument(project: ProjectSummary, filePath: string, savedTest: SavedTest, revision: number | null) {
    clearEditorHistory();
    let document = savedProjectDocumentState(savedTest, {
      normalizeQuestionBlocks,
      normalizeSectionHeadings,
      normalizeDocumentFlow,
    });
    const importedLogo = savedTest.logo ? importLogo(savedTest.logo) : undefined;
    document = remapSavedProjectLogo(document, savedTest.logo, importedLogo);

    setEditorDocument(document);
    setEditorDocumentOpenState(true);
    setActiveQuestionId(firstQuestionId(document.questions));
    setActiveTocItemId(firstDocumentFlowAnchor(document.documentFlow, document.questions));
    setActiveRailItemId(firstDocumentFlowAnchor(document.documentFlow, document.questions));
    clearEditorTransientState();
    setActiveProject(project);
    setActiveProjectFileState(filePath, revision);
    setProjectSaveConflict(null);
    updateLastProjectSaveFingerprint(
      editorDocumentFingerprint(
        document.frontMatter,
        document.questions,
        document.formattingConfig,
        importedLogo ?? savedTest.logo ?? selectedLogoFromLibrary(logosRef.current, document.frontMatter.logoId),
        document.sectionHeadings,
        document.documentFlow,
      ),
    );
  }

  return { applySavedProjectDocument };
}
