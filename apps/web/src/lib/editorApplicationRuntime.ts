import type { FormattingConfig } from "@mauth-studio/shared";

import { CHOICE_NUMBERING_STYLES, DIAGRAM_TYPES } from "../components/editor/editorOptions.ts";
import { DEFAULT_2D_GRAPH, graphHeight } from "./diagramGraph2d.ts";
import { createEditorAppPersistence, cloneSerializable } from "./editorAppPersistence.ts";
import { createEditorBlockSelectionRuntime, type SelectedEditorBlock } from "./editorBlockSelection.ts";
import { createEditorBlockSummaryRuntime } from "./editorBlockSummaries.ts";
import { createEditorContentBlockFactory } from "./editorContentBlocks.ts";
import { createEditorContentBlockNormalizer } from "./editorContentBlockNormalization.ts";
import { createEditorDocumentDuplicator } from "./editorDocumentDuplication.ts";
import {
  createEditorDocumentNormalizer,
  type DocumentFlowItem,
  type DocumentSectionHeading,
  type QuestionBlock,
} from "./editorDocumentNormalization.ts";
import {
  diagramTypePatch,
  normalizeDiagramTextSide,
  normalizeDiagramType,
  updateGraphConfig,
  withGraphDefaults,
} from "./editorDiagramConfig.ts";
import { questionMarks } from "./editorDocumentToc.ts";
import { createEditorSolutionValidationRuntime } from "./editorSolutionValidationRuntime.ts";
import { createNotesSection as createNotesSectionDocument, createQuestion as createBlankQuestion } from "./editorStarterDocuments.ts";
import { buildProjectFileVersionPreview } from "./projectFileVersionPreview.ts";
import type { FrontMatterConfig } from "./frontMatterConfig.ts";

export interface EditorHistorySnapshot {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  formattingConfig: FormattingConfig;
}

export type EditorDocumentState = EditorHistorySnapshot;

export const EDITOR_HISTORY_LIMIT = 80;

function createEditorId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const {
  textBlock,
  choiceListBlock,
  diagramBlockForType,
  spaceBlock,
  solutionSlotBlocks,
  solutionTextBlock,
  studentSpaceBlock,
  contentBlockForKind,
} = createEditorContentBlockFactory({
  id: createEditorId,
  defaultGraphConfig: DEFAULT_2D_GRAPH,
  withGraphDefaults,
  updateGraphConfig,
  diagramTypePatch,
});

export function createQuestion() {
  return createBlankQuestion(createEditorId);
}

export function createNotesSection() {
  return createNotesSectionDocument(createEditorId);
}

export const { normalizeContentBlocks } = createEditorContentBlockNormalizer({
  id: createEditorId,
  defaultGraphConfig: DEFAULT_2D_GRAPH,
  withGraphDefaults,
  normalizeDiagramTextSide,
});

export const { normalizeQuestionBlocks, normalizeSectionHeadings, normalizeDocumentFlow, documentFlowFromQuestionChange } =
  createEditorDocumentNormalizer({
    id: createEditorId,
    normalizeContentBlocks,
  });

export const { tocBlockSummary } = createEditorBlockSummaryRuntime({
  withGraphDefaults,
  normalizeDiagramType,
  diagramTypes: DIAGRAM_TYPES,
  choiceNumberingStyles: CHOICE_NUMBERING_STYLES,
});

export const { selectedEditorBlockFromAnchor } = createEditorBlockSelectionRuntime({ tocBlockSummary });

export type { SelectedEditorBlock };

export const {
  duplicatedContentBlock,
  duplicatedSubpart,
  duplicatedPart,
  duplicatedQuestion,
  duplicateColumnBlockAtPath,
  solutionSurfaceContentBlock,
  solutionSurfaceColumnBlockCopyAtPath,
} = createEditorDocumentDuplicator({
  id: createEditorId,
  cloneSerializable,
});

export const editorAppPersistence = createEditorAppPersistence({
  normalizeQuestionBlocks,
  normalizeSectionHeadings,
  normalizeDocumentFlow,
});

export const {
  loadInitialEditorDraft,
  persistCurrentDraft,
  loadLegacySavedTests,
  normalizeSavedTest,
  createSavedTestSnapshot,
  editorDocumentFingerprint,
} = editorAppPersistence;

export function keyboardTargetConsumesGlobalDelete(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("a, button, input, textarea, select, [contenteditable='true'], [role='textbox'], [data-delete-key-ignore]"))
  );
}

export const solutionValidationRuntime = createEditorSolutionValidationRuntime({ graphHeight, withGraphDefaults });

export function projectFileVersionPreview(version: Parameters<typeof buildProjectFileVersionPreview>[0]) {
  return buildProjectFileVersionPreview<QuestionBlock>(version, {
    parseSavedTest: normalizeSavedTest,
    questionMarks,
  });
}
