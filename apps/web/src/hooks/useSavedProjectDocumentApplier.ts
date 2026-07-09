import type { MutableRefObject } from "react";
import type { FormattingConfig, ProjectSummary } from "@mauth-studio/shared";

import { cloneSerializable, type SavedTest } from "../lib/editorAppPersistence.ts";
import { firstDocumentFlowAnchor, firstQuestionId } from "../lib/editorSectionHeadings.ts";
import type { DocumentFlowItem, DocumentSectionHeading, QuestionBlock } from "../lib/editorDocumentNormalization.ts";
import { normalizeFormattingConfig } from "../lib/editorFormattingConfig.ts";
import type { FrontMatterConfig } from "../lib/frontMatterConfig.ts";
import { mergeLogoAssets, persistLogoLibrary, selectedLogoFromLibrary, type LogoAsset } from "../lib/logoLibrary.ts";
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
  pushEditorHistory: () => void;
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
  setLogos: (updater: (current: LogoAsset[]) => LogoAsset[]) => void;
  writeLogoToDisk: (logo: LogoAsset) => void;
}

export function useSavedProjectDocumentApplier({
  logosRef,
  normalizeQuestionBlocks,
  normalizeSectionHeadings,
  normalizeDocumentFlow,
  editorDocumentFingerprint,
  pushEditorHistory,
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
  setLogos,
  writeLogoToDisk,
}: UseSavedProjectDocumentApplierOptions) {
  function applySavedProjectDocument(project: ProjectSummary, filePath: string, savedTest: SavedTest, revision: number | null) {
    pushEditorHistory();
    const document = savedProjectDocumentState(savedTest, {
      normalizeQuestionBlocks,
      normalizeSectionHeadings,
      normalizeDocumentFlow,
    });

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
        savedTest.logo ?? selectedLogoFromLibrary(logosRef.current, document.frontMatter.logoId),
        document.sectionHeadings,
        document.documentFlow,
      ),
    );

    if (savedTest.logo) {
      setLogos((current) => {
        const next = mergeLogoAssets(current, [savedTest.logo]);
        if (next !== current) {
          logosRef.current = next;
          persistLogoLibrary(next);
        }
        return next;
      });
      writeLogoToDisk(savedTest.logo);
    }
  }

  return { applySavedProjectDocument };
}
