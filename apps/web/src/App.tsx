import { Fragment, memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { ChoiceNumberingStyle, FormattingConfig, MauthAgentFileState, ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  CopyPlus,
  FileText,
  FolderOpen,
  GitBranch,
  ImagePlus,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  PlusCircle,
  Redo2,
  Save,
  Server,
  Sun,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { ActionProposalPanel } from "@/components/actions/ActionProposalPanel";
import { FrontMatterInlineText, InlineSummaryTitle, MixedMath, SolutionMarkTicks } from "@/components/MathText";
import { ChoiceListBlockEditor } from "@/components/editor/ChoiceListBlockEditor";
import { ColumnsBlockEditor } from "@/components/editor/ColumnsBlockEditor";
import { DiagramBlockEditor } from "@/components/editor/DiagramBlockEditor";
import { CollapsiblePanel, ContentInsertionActions, EDITOR_ACTIVE_PANEL_CLASS, RemoveActionButton } from "@/components/editor/EditorPanels";
import { EditorPageBreakRow } from "@/components/editor/EditorPageBreakRow";
import {
  EditorSubsectionContainerDropZone,
  EditorSubsectionDragHandle,
  EditorSubsectionItemDropZone,
} from "@/components/editor/EditorSubsectionDragControls";
import { SelectionInspector } from "@/components/editor/SelectionInspector";
import { SpaceBlockEditor } from "@/components/editor/SpaceBlockEditor";
import { PageBreakStructurePanel, SectionHeadingStructurePanel } from "@/components/editor/StructurePanels";
import { TableBlockEditor } from "@/components/editor/TableBlockEditor";
import { TextBlockEditor } from "@/components/editor/TextBlockEditor";
import { quickDiagramInsertActions } from "@/components/editor/diagramInsertionActions";
import {
  CHOICE_LIST_LAYOUTS,
  CHOICE_NUMBERING_STYLES,
  DIAGRAM_ALIGNMENTS,
  DIAGRAM_TYPES,
  TABLE_CELL_ALIGNMENTS,
} from "@/components/editor/editorOptions";
import { FileManagementDrawer } from "@/components/files/FileManagementDrawer";
import { ProjectFileConflictBanner } from "@/components/files/ProjectFileConflictBanner";
import { ExamCoverEditor, ExamInstructionsEditor, ExamTimeMaterialsEditor } from "@/components/front-matter/ExamDetailsEditors";
import { ExamStructureEditor } from "@/components/front-matter/ExamStructureEditor";
import { HeaderFileControls } from "@/components/header/HeaderFileControls";
import { DocumentNavigator, tocSummaryText } from "@/components/navigation/DocumentNavigator";
import { DocumentNavigatorRail } from "@/components/navigation/DocumentNavigatorRail";
import { NEW_TEST_TEMPLATES, NewTestDialog } from "@/components/new-document/NewTestDialog";
import {
  PreviewContentBlocks as PreviewContentBlocksBase,
  type PreviewContentBlocksProps as PreviewContentBlocksBaseProps,
  type PreviewContentRenderers,
  type PreviewContentRuntime,
} from "@/components/preview/PreviewContentBlocks";
import { PreviewDiagram } from "@/components/preview/PreviewDiagram";
import {
  FrontMatterPreviewPages,
  NotesHeaderPreview,
  SchoolExamPageFooter,
  SchoolExamRunningHeader,
  SchoolExamSupplementaryPage,
  WorksheetHeaderPreview,
} from "@/components/preview/FrontMatterPreviewPages";
import { A4PreviewPageFrame } from "@/components/preview/PreviewPageFrame";
import { SolutionModeControls } from "@/components/solutions/SolutionModeControls";
import { SolutionValidationPanel } from "@/components/solutions/SolutionValidationPanel";
import { EmptyDocumentStart } from "@/components/shell/EmptyDocumentStart";
import { SystemStatusPanel, systemStatusTone } from "@/components/system/SystemStatusPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextMenu, type ContextMenuAction } from "@/components/ui/context-menu";
import { Textarea } from "@/components/ui/textarea";
import { useActiveProjectFileStateController } from "@/hooks/useActiveProjectFileStateController";
import { useDocumentSessionController } from "@/hooks/useDocumentSessionController";
import { useDocumentsFolderController } from "@/hooks/useDocumentsFolderController";
import { useEditorDocumentStateController } from "@/hooks/useEditorDocumentStateController";
import { useEditorDocumentActionsController } from "@/hooks/useEditorDocumentActionsController";
import { useInitialStorageHydrationController } from "@/hooks/useInitialStorageHydrationController";
import { useProjectBackupController } from "@/hooks/useProjectBackupController";
import { useNewDocumentController } from "@/hooks/useNewDocumentController";
import { useProjectAutosaveResolutionController } from "@/hooks/useProjectAutosaveResolutionController";
import { useProjectFileOperationsController } from "@/hooks/useProjectFileOperationsController";
import { useProjectFolderController } from "@/hooks/useProjectFolderController";
import { useProjectVersionsController } from "@/hooks/useProjectVersionsController";
import {
  deleteStoredLogo,
  getDefaultProject,
  getStorageAutosave,
  listProjectFiles,
  listStoredLogos,
  listStoredTests as listLegacyStoredTests,
  saveProjectFile,
  saveStorageAutosave,
  saveStoredLogo,
} from "@/lib/api";
import { type MauthAction, type MauthContentScope, type MauthDocumentLike } from "@/lib/mauthActions";
import { parseMauthDocumentActionProposal } from "@/lib/mauthActionProposal";
import { useDraftAutosaveController } from "@/hooks/useDraftAutosaveController";
import { useMauthAgentBridgeController } from "@/hooks/useMauthAgentBridgeController";
import { useMauthDialogController } from "@/hooks/useMauthDialogController";
import { useProjectFileStatus, type DraftAutosaveStatus } from "@/hooks/useProjectFileStatus";
import { usePrintController } from "@/hooks/usePrintController";
import { usePreviewZoomController } from "@/hooks/usePreviewZoomController";
import { useEditorNavigationController } from "@/hooks/useEditorNavigationController";
import { useEditorContextMenuController } from "@/hooks/useEditorContextMenuController";
import { useEditorGlobalDeleteController } from "@/hooks/useEditorGlobalDeleteController";
import { useEditorAutosaveSnapshotController } from "@/hooks/useEditorAutosaveSnapshotController";
import { useEditorSectionHeadingController } from "@/hooks/useEditorSectionHeadingController";
import { useEditorSelectionController } from "@/hooks/useEditorSelectionController";
import { useMauthActionProposalController } from "@/hooks/useMauthActionProposalController";
import { useProjectFileConflictController } from "@/hooks/useProjectFileConflictController";
import { useSolutionModeController } from "@/hooks/useSolutionModeController";
import { useSolutionSlotController } from "@/hooks/useSolutionSlotController";
import { useSolutionSurfaceCopyController } from "@/hooks/useSolutionSurfaceCopyController";
import { useSolutionValidationController } from "@/hooks/useSolutionValidationController";
import { useSystemStatusController } from "@/hooks/useSystemStatusController";
import { useThemeController } from "@/hooks/useThemeController";
import { useUnsavedChangesBeforeUnloadController } from "@/hooks/useUnsavedChangesBeforeUnloadController";
import { useProjectFilesController } from "@/hooks/useProjectFilesController";
import { missingProjectRevisionConflict, projectFileConflictFromError } from "@/lib/projectSaveConflicts";
import {
  isProjectTestFile,
  projectPathForTestPath,
  testFileDisplayName,
  testFilePathKey,
  testPathBasename,
  testPathFromProjectPath,
  uniqueTestPath,
} from "@/lib/projectFiles";
import { buildProjectFileVersionPreview } from "@/lib/projectFileVersionPreview";
import { defaultSavedTestName, printFileNameForDocument, projectFileTypeForFrontMatter } from "@/lib/documentFileNaming";
import { editorDraftChangeKey } from "@/lib/editorSessionSnapshots";
import { buildMauthAgentFileState } from "@/lib/mauthAgentFileState";
import { tableSolutionEntryMasksForBlocks } from "@/lib/tableSolutionEntries";
import { createEditorContextDescriptorRuntime } from "@/lib/editorContextDescriptors";
import {
  createEditorPersistence,
  type AutosavedEditorSnapshot as PersistedEditorSnapshot,
  type SavedDocumentSnapshot,
} from "@/lib/editorPersistence";
import { createEditorContentBlockFactory } from "@/lib/editorContentBlocks";
import { createEditorBlockSelectionRuntime, type SelectedEditorBlock } from "@/lib/editorBlockSelection";
import {
  columnsBlockSummary,
  createEditorBlockSummaryRuntime,
  spaceBlockSummary,
  tableBlockSummary,
  textBlockSummary,
} from "@/lib/editorBlockSummaries";
import {
  buildDocumentToc,
  isOrderedBlockVisible,
  isOrderedDiagramBesideContentBlock,
  markLabel,
  notesSectionTitle,
  partMarks,
  partPanelSummary,
  questionMarks,
  visibilityReplacementSlotAtOrderedItems,
} from "@/lib/editorDocumentToc";
import { existingOrFirstQuestionId, firstDocumentFlowAnchor, firstQuestionAnchor, firstQuestionId } from "@/lib/editorSectionHeadings";
import {
  buildPreviewSegments,
  contentBlocksHaveDiagram,
  contentBlocksHaveVisibilityReplacementSlot,
  previewPartBlockRowIds,
  promptTextBlock,
  type PreviewGraphConfigChange,
  type PreviewSegment,
} from "@/lib/editorPreviewSegments";
import { createEditorContentBlockNormalizer, spaceLines } from "@/lib/editorContentBlockNormalization";
import {
  alphaLabel,
  createEditorDocumentNormalizer,
  defaultDocumentFlow,
  orderItemKey,
  orderedPartItems,
  orderedQuestionItems,
  romanLabel,
  withNormalizedPartOrder,
  withNormalizedQuestionOrder,
  type ContainerOrderItem,
  type DocumentFlowItem,
  type DocumentSectionHeading,
  type EditorContentBlock,
  type EditorPart,
  type EditorSubpart,
  type OrderedPartItem,
  type OrderedQuestionItem,
  type QuestionBlock,
} from "@/lib/editorDocumentNormalization";
import { createEditorSolutionValidationRuntime, questionDisplayNumber } from "@/lib/editorSolutionValidationRuntime";
import { createEditorDocumentDuplicator } from "@/lib/editorDocumentDuplication";
import { solutionSlotInsertionPlan } from "@/lib/solutionSlotInsertionActions";
import { defaultSolutionSlotLinesForDocument } from "@/lib/solutionSlotDefaults";
import { DEFAULT_FORMATTING_CONFIG, formattingConfigForPresetId, normalizeFormattingConfig } from "@/lib/editorFormattingConfig";
import {
  DEFAULT_EXAM_FRONT_MATTER,
  DEFAULT_FRONT_MATTER,
  DEFAULT_NOTES_FRONT_MATTER,
  DEFAULT_WORKSHEET_FRONT_MATTER,
  EXAM_SECTION_PRESETS,
  assessmentTitleText,
  examSectionPresetById,
  examSectionPresetFromValue,
  examSectionPresetPatch,
  normalizeExamTitlePage,
  normalizeFrontMatter,
  nonNegativeNumberOrDefault,
  titlePageTemplateFromValue,
  titlePageTemplateLabel,
  type ExamStructureRowConfig,
  type ExamTitlePageConfig,
  type FrontMatterConfig,
  type TitlePageTemplate,
} from "@/lib/frontMatterConfig";
import {
  normalizeChoiceItems,
  normalizeChoiceListLayout,
  normalizeChoiceNumberingStyle,
  normalizeTableBlock,
  plainTableRows,
} from "@/lib/contentBlockNormalization";
import {
  STARTER_LOGOS,
  appendMissingLogoAssets,
  frontMatterPatchForLogo,
  loadLogoLibrary,
  logoNameFromFile,
  markStarterLogosSeeded,
  mergeLogoAssets,
  normalizeLogoAsset,
  normalizeLogoAssets,
  persistLogoLibrary,
  selectedLogoForFrontMatter,
  selectedLogoFromLibrary,
  shouldSeedStarterLogos,
  type LogoAsset,
} from "@/lib/logoLibrary";
import {
  type DocumentTocItem,
  type DropPlacement,
  type MoveDirection,
  type PageBreakDropPreview,
  type QuestionDropPreview,
} from "@/lib/documentNavigation";
import { DEFAULT_2D_GRAPH, graphHeight } from "@/lib/diagramGraph2d";
import {
  diagramAlignmentClass,
  diagramTypePatch,
  effectiveDiagramTextSide,
  normalizeDiagramTextSide,
  normalizeDiagramType,
  updateGraphConfig,
  withGraphDefaults,
} from "@/lib/editorDiagramConfig";
import {
  SCREENSHOT_STARTER_DOCUMENT_ID,
  STARTER_DOCUMENT_STORAGE_KEY,
  createNotesSection as createNotesSectionDocument,
  createQuestion as createBlankQuestion,
  createScreenshotStarterFrontMatter,
  createScreenshotStarterQuestions,
  isBlankStarterQuestion,
  shouldSeedScreenshotStarter,
  type ScreenshotStarterRuntime,
} from "@/lib/editorStarterDocuments";
import { nativeKeyboardDeleteRequested } from "@/lib/editorKeyboardShortcuts";
import { pageFormatFromConfig, pageStyle } from "@/lib/previewPageFormat";
import {
  bookletSupplementaryPageCount,
  buildExplicitBreakPages,
  buildMeasuredPages,
  examQuestionPageReservedHeight,
  frontMatterPageCount,
  groupPreviewPageSegments,
  pagesAreEqual,
  type PreviewPage,
  type PreviewPageSegmentEntry,
  type PreviewQuestionSegmentGroup,
} from "@/lib/previewPagination";
import { measuredLineHeightPx, solutionSlotToleranceLines, validateSolutionCompleteness } from "@/lib/solutionValidation";
import {
  isContentBlockVisibleInScope,
  isDiagramBesideContentBlockInScope,
  isSolutionTextBlock,
  visibilityReplacementSlotAt,
  type SolutionInsertionBlockKind,
} from "@/lib/solutionBlockVisibility";
import {
  EDITOR_PAGE_BREAK_DRAG_MIME,
  EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX,
  PAGE_BREAK_DRAG_MIME,
  PAGE_BREAK_DRAG_TEXT_PREFIX,
  SUBSECTION_DRAG_MIME,
  SUBSECTION_DRAG_TEXT_PREFIX,
  containerDropKey,
  containerDropZoneLabel,
  dropIntentForContainer,
  dropIntentBeforeOrderItem,
  editorPageBreakKey,
  editorPageBreakTargetKey,
  findPartInQuestions,
  firstOrderItemInContainer,
  isContainerOrderItemKind,
  itemDropKey,
  itemDropZoneLabel,
  orderItemsForContainer,
  parseEditorPageBreakDrag,
  parsePageBreakDrag,
  parseSubsectionDrag,
  serializeEditorPageBreakDrag,
  serializeSubsectionDrag,
  subsectionContainerFromDataset,
  subsectionDropIntent,
  subsectionDropPreviewTargetKey,
  subsectionItemKind,
  subsectionKey,
  subsectionOrderItem,
  subsectionSourceContainer,
  subsectionTargetDataAttributes,
  subsectionTargetFromDataset,
  type EditorPageBreakDropPreview,
  type EditorPageBreakTarget,
  type SubsectionContainerRef,
  type SubsectionDragTarget,
  type SubsectionDropIntent,
  type SubsectionDropPreview,
} from "@/lib/editorSubsectionDrag";
import { editorSubsectionDragClassName, editorSubsectionDropZoneLabel } from "@/lib/editorSubsectionDragControls";
import {
  SCROLL_ANCHOR_FRONT_MATTER,
  SCROLL_ANCHOR_SELECTOR,
  SCROLL_ANCHOR_TOP_OFFSET_PX,
  clamp,
  columnBlockParentScrollAnchor,
  columnPathScrollAnchor,
  graphChildParentScrollAnchor,
  pageBreakQuestionIdFromScrollAnchor,
  pageBreakScrollAnchor,
  parseScrollAnchor,
  partBlockScrollAnchor,
  partScrollAnchor,
  previewAnchorForEditorAnchor,
  previewAnchorFromEventTarget,
  previewSelectionAttr,
  questionBlockScrollAnchor,
  questionIdFromScrollAnchor,
  questionScrollAnchor,
  scrollAnchorContains,
  scrollAnchorFallbacks,
  scrollAnchorValue,
  scrollableRange,
  sectionHeadingIdFromScrollAnchor,
  sectionHeadingScrollAnchor,
  subpartBlockScrollAnchor,
  subpartScrollAnchor,
  type ParsedScrollAnchor,
  type ScrollAnchorPosition,
} from "@/lib/scrollAnchors";
import { cn } from "@/lib/utils";

const BRAND_LOGO_SRC = "/brand/mauth_logo_lockup.png";
const HEADER_GROUP_CLASS = "ml-2 flex shrink-0 items-center gap-1 rounded-md border border-blue-300/20 bg-white/[0.05] p-1";
const HEADER_ICON_BUTTON_CLASS = "size-8 text-blue-100 hover:bg-blue-500/15 hover:text-white disabled:opacity-40";
const HEADER_ICON_ACTIVE_CLASS = "bg-blue-500/20 text-white";
const PREVIEW_EDIT_CLICK_MOVE_TOLERANCE_PX = 6;
const SAVED_TEST_STORAGE_KEY = "mauth-studio.saved-tests.v1";
const CURRENT_DRAFT_STORAGE_KEY = "mauth-studio.current-draft.v1";
const LEGACY_SAVED_TEST_STORAGE_KEY = "math-app.saved-tests.v1";
const LEGACY_CURRENT_DRAFT_STORAGE_KEY = "math-app.current-draft.v1";
const AUTOSAVE_DEBOUNCE_MS = 900;
const LOCAL_DRAFT_DEBOUNCE_MS = 250;
const ACTIVE_PROJECT_FILE_SYNC_INTERVAL_MS = 4000;
type ContentBlockKind = SolutionInsertionBlockKind;

type PanelDragRegion = "header" | "body";

interface PointerSubsectionDragSession {
  target: SubsectionDragTarget;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  lastPreview: SubsectionDropPreview | null;
  handle: HTMLElement;
  cleanup: () => void;
}

type PaneMode = "split" | "preview";

interface EditorHistorySnapshot {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  formattingConfig: FormattingConfig;
}

type EditorDocumentState = EditorHistorySnapshot;

type AutosavedEditorSnapshot = PersistedEditorSnapshot<
  FrontMatterConfig,
  QuestionBlock,
  DocumentSectionHeading,
  DocumentFlowItem,
  FormattingConfig,
  LogoAsset
>;

const HISTORY_LIMIT = 80;
const PROJECT_FILE_REVISION_MISSING_ERROR = "PROJECT_FILE_REVISION_MISSING";

type SavedTest = SavedDocumentSnapshot<
  FrontMatterConfig,
  QuestionBlock,
  DocumentSectionHeading,
  DocumentFlowItem,
  FormattingConfig,
  LogoAsset
>;

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const {
  textBlock,
  choiceListBlock,
  diagramBlockForType,
  spaceBlock,
  solutionSlotBlocks,
  solutionTextBlock,
  studentSpaceBlock,
  contentBlockForKind,
} = createEditorContentBlockFactory({
  id,
  defaultGraphConfig: DEFAULT_2D_GRAPH,
  withGraphDefaults,
  updateGraphConfig,
  diagramTypePatch,
});

const screenshotStarterRuntime: ScreenshotStarterRuntime = {
  id,
  textBlock,
  choiceListBlock,
  spaceBlock,
  withGraphDefaults,
};

function createQuestion() {
  return createBlankQuestion(id);
}

function createNotesSection() {
  return createNotesSectionDocument(id);
}

const { normalizeContentBlocks } = createEditorContentBlockNormalizer({
  id,
  defaultGraphConfig: DEFAULT_2D_GRAPH,
  withGraphDefaults,
  normalizeDiagramTextSide,
});

const { normalizeQuestionBlocks, normalizeSectionHeadings, normalizeDocumentFlow, documentFlowFromQuestionChange } =
  createEditorDocumentNormalizer({
    id,
    normalizeContentBlocks,
  });

const { choiceListSummary, tocBlockSummary } = createEditorBlockSummaryRuntime({
  withGraphDefaults,
  normalizeDiagramType,
  diagramTypes: DIAGRAM_TYPES,
  choiceNumberingStyles: CHOICE_NUMBERING_STYLES,
});

const { selectedEditorBlockFromAnchor } = createEditorBlockSelectionRuntime({ tocBlockSummary });

const {
  duplicatedContentBlock,
  duplicatedSubpart,
  duplicatedPart,
  duplicatedQuestion,
  columnBlockAtPath,
  duplicateColumnBlockAtPath,
  solutionSurfaceContentBlock,
  solutionSurfaceColumnBlockCopyAtPath,
} = createEditorDocumentDuplicator({
  id,
  cloneSerializable,
});

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

// Legacy saved tests only exist so older browser/API saves can be migrated into project files.
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
}: {
  testId: string;
  name: string;
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings?: DocumentSectionHeading[];
  documentFlow?: DocumentFlowItem[];
  formattingConfig: FormattingConfig;
  logo?: LogoAsset;
  createdAt?: string;
}): SavedTest {
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

function keyboardTargetConsumesGlobalDelete(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("a, button, input, textarea, select, [contenteditable='true'], [role='textbox'], [data-delete-key-ignore]"))
  );
}

function visibleScrollAnchors(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(SCROLL_ANCHOR_SELECTOR))
    .filter((element) => {
      if (element.closest(".a4-measure")) return false;
      if (!element.getClientRects().length) return false;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    })
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
}

function scrollToAnchorPosition(container: HTMLElement, position: ScrollAnchorPosition) {
  const anchors = visibleScrollAnchors(container);
  if (!anchors.length) return false;

  let matchedIndex = -1;
  let matchedAnchor = "";
  for (const fallback of scrollAnchorFallbacks(position.anchor)) {
    const index = anchors.findIndex((anchor) => scrollAnchorValue(anchor) === fallback);
    if (index >= 0) {
      matchedIndex = index;
      matchedAnchor = fallback;
      break;
    }
  }

  if (matchedIndex < 0) return false;

  const currentAnchor = anchors[matchedIndex];
  const currentTop = currentAnchor.getBoundingClientRect().top;
  const nextTop =
    anchors[matchedIndex + 1]?.getBoundingClientRect().top ?? currentTop + Math.max(currentAnchor.getBoundingClientRect().height, 1);
  const progress = matchedAnchor === position.anchor ? position.progress : 0;
  const targetTop = currentTop + (nextTop - currentTop) * progress;
  const paneTop = container.getBoundingClientRect().top + SCROLL_ANCHOR_TOP_OFFSET_PX;
  const nextScrollTop = clamp(container.scrollTop + targetTop - paneTop, 0, scrollableRange(container));

  if (Math.abs(container.scrollTop - nextScrollTop) > 0.5) {
    container.scrollTop = nextScrollTop;
  }

  return true;
}

function subsectionTargetElementFromPoint(clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY);
  if (!(element instanceof Element)) return null;
  const targetElement = element.closest("[data-subsection-target-kind]");
  if (!(targetElement instanceof HTMLElement)) return null;
  const target = subsectionTargetFromDataset(targetElement.dataset);
  return target ? { element, targetElement, target } : null;
}

function dragPlacementFromRect(rect: DOMRect, clientY: number): Exclude<DropPlacement, "inside"> {
  if (rect.height <= 0) return "after";
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function dragPlacementFromEvent(event: DragEvent<HTMLElement>): Exclude<DropPlacement, "inside"> {
  return dragPlacementFromRect(event.currentTarget.getBoundingClientRect(), event.clientY);
}

function panelDragRegionFromElement(target: EventTarget | null, currentTarget: HTMLElement): PanelDragRegion | null {
  if (!(target instanceof Element)) return null;
  const region = target.closest("[data-panel-region]");
  if (!(region instanceof HTMLElement) || !currentTarget.contains(region)) return null;
  return region.dataset.panelRegion === "body" || region.dataset.panelRegion === "header" ? region.dataset.panelRegion : null;
}

function panelDragRegionFromEvent(event: DragEvent<HTMLElement>): PanelDragRegion | null {
  return panelDragRegionFromElement(event.target, event.currentTarget);
}

function panelInsideDropIntentForRegion(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  region: PanelDragRegion | null,
  questions: QuestionBlock[],
): SubsectionDropIntent | null {
  if (region !== "body") return null;
  const activeKind = subsectionItemKind(active);
  if (target.kind === "part" && (activeKind === "block" || activeKind === "subpart")) {
    return dropIntentForContainer(active, { kind: "part", questionId: target.questionId, partId: target.id }, questions, "end");
  }
  return null;
}

function panelInsideDropIntent(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  event: DragEvent<HTMLElement>,
  questions: QuestionBlock[],
): SubsectionDropIntent | null {
  return panelInsideDropIntentForRegion(active, target, panelDragRegionFromEvent(event), questions);
}

function subsectionDropPreviewForEvent(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  event: DragEvent<HTMLElement>,
  questions: QuestionBlock[],
): Pick<SubsectionDropPreview, "placement" | "intent"> | null {
  const insideIntent = panelInsideDropIntent(active, target, event, questions);
  if (insideIntent) return { placement: "inside", intent: insideIntent };
  const requestedPlacement = dragPlacementFromEvent(event);
  const placement = requestedPlacement;
  const intent = subsectionDropIntent(active, target, placement, questions);
  if (intent) return { placement, intent };
  if (placement !== requestedPlacement) {
    const requestedIntent = subsectionDropIntent(active, target, requestedPlacement, questions);
    return requestedIntent ? { placement: requestedPlacement, intent: requestedIntent } : null;
  }
  return null;
}

function subsectionDropPreviewForPointer(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  targetElement: HTMLElement,
  eventTarget: EventTarget | null,
  clientY: number,
  questions: QuestionBlock[],
): Pick<SubsectionDropPreview, "placement" | "intent"> | null {
  const insideIntent = panelInsideDropIntentForRegion(active, target, panelDragRegionFromElement(eventTarget, targetElement), questions);
  if (insideIntent) return { placement: "inside", intent: insideIntent };
  const requestedPlacement = dragPlacementFromRect(targetElement.getBoundingClientRect(), clientY);
  const placement = requestedPlacement;
  const intent = subsectionDropIntent(active, target, placement, questions);
  if (intent) return { placement, intent };
  if (placement !== requestedPlacement) {
    const requestedIntent = subsectionDropIntent(active, target, requestedPlacement, questions);
    return requestedIntent ? { placement: requestedPlacement, intent: requestedIntent } : null;
  }
  return null;
}

function choiceLabel(style: ChoiceNumberingStyle | undefined, index: number) {
  const normalizedStyle = normalizeChoiceNumberingStyle(style);
  if (normalizedStyle === "bullet") return "•";
  if (normalizedStyle === "decimal") return `${index + 1}.`;
  if (normalizedStyle === "upper-alpha") return `${alphaLabel(index).toUpperCase()}.`;
  if (normalizedStyle === "lower-alpha") return `${alphaLabel(index)}.`;
  return `${romanLabel(index)}.`;
}

const solutionValidationRuntime = createEditorSolutionValidationRuntime({ graphHeight, withGraphDefaults });

type AppPreviewContentBlocksProps = Omit<PreviewContentBlocksBaseProps, "runtime" | "renderers">;

const previewContentRuntime: PreviewContentRuntime = {
  choiceLabel,
  diagramAlignmentClass,
  effectiveDiagramTextSide,
  graphHeight,
  isContentBlockVisibleInScope,
  isDiagramBesideContentBlockInScope,
  isSolutionTextBlock,
  measuredLineHeightPx,
  normalizeChoiceItems,
  normalizeChoiceListLayout,
  normalizeTableBlock,
  plainTableRows: (table) => plainTableRows(table as ReturnType<typeof normalizeTableBlock>),
  previewSelectionAttr,
  solutionSlotToleranceLines: (studentBlock) => solutionSlotToleranceLines(studentBlock, { spaceLines }),
  spaceLines,
  visibilityReplacementSlotAt,
};

const previewContentRenderers: PreviewContentRenderers = {
  renderDiagram: (props) => <PreviewDiagram {...props} withGraphDefaults={withGraphDefaults} />,
  renderMath: (source, options) => (
    <MixedMath
      source={source}
      showSolutionMarks={Boolean(options?.showSolutionMarks)}
      plainSimpleInlineLatex={options?.plainSimpleInlineLatex ?? true}
    />
  ),
  renderSolutionMarkTicks: (count) => <SolutionMarkTicks count={count} />,
};

function PreviewContentBlocks(props: AppPreviewContentBlocksProps) {
  return <PreviewContentBlocksBase {...props} runtime={previewContentRuntime} renderers={previewContentRenderers} />;
}

type AppPreviewPageSegmentEntry = PreviewPageSegmentEntry<PreviewSegment>;
type AppPreviewQuestionSegmentGroup = PreviewQuestionSegmentGroup<PreviewSegment>;

function cssAttributeValue(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function syncPreviewSelection(previewPane: HTMLElement, activeAnchor?: string) {
  previewPane
    .querySelectorAll<HTMLElement>('[data-preview-selected="true"]')
    .forEach((element) => element.removeAttribute("data-preview-selected"));

  if (!activeAnchor) return;
  previewPane
    .querySelectorAll<HTMLElement>(`[data-scroll-anchor="${cssAttributeValue(activeAnchor)}"]`)
    .forEach((element) => element.setAttribute("data-preview-selected", "true"));
}

function useStableEvent<TArgs extends unknown[], TResult>(callback: (...args: TArgs) => TResult) {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback((...args: TArgs) => callbackRef.current(...args), []);
}

const TestPreviewSegment = memo(function TestPreviewSegment({
  segment,
  frontMatter,
  logo,
  totalMarks = 0,
  firstOnPage = false,
  measureOnly = false,
  showSolutions = true,
  showMarks = true,
  activePreviewAnchor,
  onGraphConfigChange,
}: {
  segment: PreviewSegment;
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  totalMarks?: number;
  firstOnPage?: boolean;
  measureOnly?: boolean;
  showSolutions?: boolean;
  showMarks?: boolean;
  activePreviewAnchor?: string;
  onGraphConfigChange?: (change: PreviewGraphConfigChange) => void;
}) {
  const questionNumber =
    typeof segment.questionIndex === "number" ? questionDisplayNumber(frontMatter, segment.questionIndex) : frontMatter.startQuestionNumber;
  const paddingTop = firstOnPage ? 0 : segment.spacingTop;

  if (segment.kind === "worksheet-header") {
    return (
      <div className="test-preview-segment worksheet-header-segment" data-measure-segment={measureOnly ? "true" : undefined}>
        <WorksheetHeaderPreview
          frontMatter={frontMatter}
          logo={logo}
          totalMarks={totalMarks}
          activePreviewAnchor={measureOnly ? undefined : activePreviewAnchor}
        />
      </div>
    );
  }

  if (segment.kind === "notes-header") {
    return (
      <div className="test-preview-segment notes-header-segment" data-measure-segment={measureOnly ? "true" : undefined}>
        <NotesHeaderPreview frontMatter={frontMatter} logo={logo} activePreviewAnchor={measureOnly ? undefined : activePreviewAnchor} />
      </div>
    );
  }

  if (segment.kind === "section-heading" && segment.sectionHeading) {
    const anchor = sectionHeadingScrollAnchor(segment.sectionHeading.id);
    return (
      <div
        className="test-preview-segment test-section-heading"
        data-scroll-anchor={measureOnly ? undefined : anchor}
        data-preview-structure-anchor={measureOnly ? undefined : "true"}
        data-preview-selected={previewSelectionAttr(measureOnly ? undefined : anchor, activePreviewAnchor)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        <h3>
          <FrontMatterInlineText text={segment.sectionHeading.title || "Section heading"} />
        </h3>
      </div>
    );
  }

  if (segment.kind === "question-start" && segment.question) {
    const isNotesTemplate = frontMatter.titlePageTemplate === "notes";
    const questionPromptBlock = isNotesTemplate ? null : promptTextBlock(`${segment.question.id}:prompt`, segment.question.text);
    return (
      <div
        className={cn("test-preview-segment test-question-start", isNotesTemplate && "notes-section-start")}
        data-scroll-anchor={measureOnly ? undefined : questionScrollAnchor(segment.question.id)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        <div className="test-question-header flex items-start justify-between gap-4">
          <h3 className="font-bold">
            {isNotesTemplate ? <FrontMatterInlineText text={notesSectionTitle(segment.question, segment.questionIndex ?? 0)} /> : null}
            {!isNotesTemplate ? `Question ${questionNumber}` : null}
          </h3>
          <span className="whitespace-nowrap font-bold">
            {showMarks && !isNotesTemplate ? markLabel(questionMarks(segment.question)) : ""}
          </span>
        </div>
        {questionPromptBlock ? (
          <div className="test-question-prompt-row">
            <PreviewContentBlocks
              blocks={[questionPromptBlock]}
              measureOnly={measureOnly}
              showSolutions={showSolutions}
              activePreviewAnchor={activePreviewAnchor}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (segment.kind === "question-block" && segment.question && segment.block) {
    const question = segment.question;
    return (
      <div
        className="test-preview-segment test-question-block"
        data-scroll-anchor={measureOnly ? undefined : questionBlockScrollAnchor(question.id, segment.block.id)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        <PreviewContentBlocks
          blocks={segment.blocks ?? (segment.block ? [segment.block] : [])}
          measureOnly={measureOnly}
          showSolutions={showSolutions}
          activePreviewAnchor={activePreviewAnchor}
          blockAnchorFor={(block) => questionBlockScrollAnchor(question.id, block.id)}
          onGraphConfigChange={(blockId, graphConfig) => onGraphConfigChange?.({ questionId: question.id, blockId, graphConfig })}
        />
      </div>
    );
  }

  if (segment.kind === "page-break") {
    return <div className="test-preview-segment" data-measure-segment={measureOnly ? "true" : undefined} />;
  }

  if (segment.kind === "part-group" && segment.question && segment.part) {
    const question = segment.question;
    const part = segment.part;
    const isNotesTemplate = frontMatter.titlePageTemplate === "notes";
    const hasSubparts = part.subparts.length > 0;
    const partLabel = alphaLabel(segment.partIndex ?? 0);
    const partItems = segment.partItems ?? orderedPartItems(part);
    const visiblePartBlockRowIds = previewPartBlockRowIds(partItems, showSolutions);
    const firstContentItemId = visiblePartBlockRowIds[0];
    const showPartLabel = !isNotesTemplate && segment.showPartLabel !== false;
    const partPromptBlock = promptTextBlock(`${part.id}:prompt`, part.text);
    return (
      <section
        className="test-preview-segment test-part-group"
        data-scroll-anchor={measureOnly ? undefined : partScrollAnchor(question.id, part.id)}
        data-preview-structure-anchor={measureOnly ? undefined : "true"}
        data-preview-selected={previewSelectionAttr(measureOnly ? undefined : partScrollAnchor(question.id, part.id), activePreviewAnchor)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        {showPartLabel && partPromptBlock ? (
          <div className="test-question-part">
            <span className="test-part-label">({partLabel})</span>
            <div className="test-part-content">
              <PreviewContentBlocks
                blocks={[partPromptBlock]}
                measureOnly={measureOnly}
                showSolutions={showSolutions}
                activePreviewAnchor={activePreviewAnchor}
              />
            </div>
            <span className="test-part-mark">{showMarks && !hasSubparts ? markLabel(part.marks) : ""}</span>
          </div>
        ) : showPartLabel && hasSubparts && !visiblePartBlockRowIds.length ? (
          <div className="test-question-part">
            <span className="test-part-label">({partLabel})</span>
            <div className="test-part-content" />
            <span className="test-part-mark" />
          </div>
        ) : null}
        <div
          className={cn(
            hasSubparts && "test-subpart-group",
            showPartLabel && hasSubparts && !visiblePartBlockRowIds.length && "test-subpart-group-after-label",
          )}
        >
          {(() => {
            const rows: ReactNode[] = [];
            for (let itemIndex = 0; itemIndex < partItems.length; itemIndex += 1) {
              const item = partItems[itemIndex];
              if (item.kind === "block") {
                const nextItem = partItems[itemIndex + 1];
                const replacementSlotFollows = visibilityReplacementSlotAtOrderedItems(partItems, itemIndex + 1);
                const diagramReplacementBlocks =
                  item.block.kind === "diagram" &&
                  isOrderedBlockVisible(partItems, itemIndex, showSolutions) &&
                  replacementSlotFollows &&
                  effectiveDiagramTextSide(item.block, true) !== "none"
                    ? [item.block, ...replacementSlotFollows.blocks]
                    : undefined;
                const replacementSlot = visibilityReplacementSlotAtOrderedItems(partItems, itemIndex);
                const replacementBlocks = replacementSlot?.blocks;
                if (!diagramReplacementBlocks && !replacementBlocks && !isOrderedBlockVisible(partItems, itemIndex, showSolutions))
                  continue;
                const pairedBlocks =
                  item.block.kind === "diagram" &&
                  nextItem?.kind === "block" &&
                  isOrderedDiagramBesideContentBlock(partItems, itemIndex + 1, showSolutions) &&
                  effectiveDiagramTextSide(item.block, true) !== "none"
                    ? [item.block, nextItem.block]
                    : undefined;
                const rowBlocks = diagramReplacementBlocks ?? replacementBlocks ?? pairedBlocks ?? [item.block];
                const rowHasVisibilitySlot = Boolean(diagramReplacementBlocks || replacementBlocks);
                rows.push(
                  <div
                    key={rowBlocks.length > 1 ? `${item.id}:${rowBlocks[1].id}` : item.id}
                    data-scroll-anchor={measureOnly ? undefined : partBlockScrollAnchor(question.id, part.id, item.block.id)}
                    className={cn(
                      "test-question-part",
                      item.block.kind === "diagram" && "test-question-row-with-diagram",
                      rowHasVisibilitySlot && "test-question-row-with-visibility-slot",
                      item.block.kind === "text" && isSolutionTextBlock(item.block) && "test-solution-row",
                    )}
                  >
                    <span className="test-part-label">
                      {showPartLabel && !partPromptBlock && item.id === firstContentItemId ? `(${partLabel})` : ""}
                    </span>
                    <div className="test-part-content">
                      <PreviewContentBlocks
                        blocks={rowBlocks}
                        measureOnly={measureOnly}
                        showSolutions={showSolutions}
                        activePreviewAnchor={activePreviewAnchor}
                        blockAnchorFor={(block) => partBlockScrollAnchor(question.id, part.id, block.id)}
                        onGraphConfigChange={(blockId, graphConfig) =>
                          onGraphConfigChange?.({ questionId: question.id, partId: part.id, blockId, graphConfig })
                        }
                      />
                    </div>
                    <span className="test-part-mark">
                      {showMarks && !hasSubparts && !partPromptBlock && item.id === firstContentItemId ? markLabel(part.marks) : ""}
                    </span>
                  </div>,
                );
                if (diagramReplacementBlocks && replacementSlotFollows) itemIndex = replacementSlotFollows.endItemIndex;
                else if (replacementBlocks && replacementSlot) itemIndex = replacementSlot.endItemIndex;
                else if (pairedBlocks) itemIndex += 1;
                continue;
              }

              const subpartIndex = part.subparts.findIndex((subpart) => subpart.id === item.subpart.id);
              const subpartPromptBlock = promptTextBlock(`${item.subpart.id}:prompt`, item.subpart.text);
              const subpartBlocks = subpartPromptBlock ? [subpartPromptBlock, ...item.subpart.contentBlocks] : item.subpart.contentBlocks;
              rows.push(
                <div
                  key={item.subpart.id}
                  data-scroll-anchor={measureOnly ? undefined : subpartScrollAnchor(question.id, part.id, item.subpart.id)}
                  data-preview-structure-anchor={measureOnly ? undefined : "true"}
                  data-preview-selected={previewSelectionAttr(
                    measureOnly ? undefined : subpartScrollAnchor(question.id, part.id, item.subpart.id),
                    activePreviewAnchor,
                  )}
                  className={cn(
                    "test-question-subpart",
                    contentBlocksHaveDiagram(item.subpart.contentBlocks, showSolutions) && "test-question-row-with-diagram",
                    contentBlocksHaveVisibilityReplacementSlot(item.subpart.contentBlocks) && "test-question-row-with-visibility-slot",
                  )}
                >
                  <span className="test-part-label">{isNotesTemplate ? "" : `(${romanLabel(Math.max(0, subpartIndex))})`}</span>
                  <div className="test-part-content">
                    <PreviewContentBlocks
                      blocks={subpartBlocks}
                      measureOnly={measureOnly}
                      showSolutions={showSolutions}
                      activePreviewAnchor={activePreviewAnchor}
                      blockAnchorFor={(block) =>
                        block.id === subpartPromptBlock?.id
                          ? undefined
                          : subpartBlockScrollAnchor(question.id, part.id, item.subpart.id, block.id)
                      }
                      onGraphConfigChange={(blockId, graphConfig) =>
                        onGraphConfigChange?.({
                          questionId: question.id,
                          partId: part.id,
                          subpartId: item.subpart.id,
                          blockId,
                          graphConfig,
                        })
                      }
                    />
                  </div>
                  <span className="test-part-mark">{showMarks ? markLabel(item.subpart.marks) : ""}</span>
                </div>,
              );
            }
            return rows;
          })()}
        </div>
      </section>
    );
  }

  return <div className="test-preview-segment" data-measure-segment={measureOnly ? "true" : undefined} style={{ paddingTop }} />;
});

interface PaginatedTestPreviewProps {
  frontMatter: FrontMatterConfig;
  logos: LogoAsset[];
  totalMarks: number;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  formattingConfig?: FormattingConfig;
  scale?: number;
  showSolutions?: boolean;
  activePreviewAnchor?: string;
  onGraphConfigChange?: (change: PreviewGraphConfigChange) => void;
}

const PaginatedTestPreview = memo(function PaginatedTestPreview({
  frontMatter,
  logos,
  totalMarks,
  questions,
  sectionHeadings,
  documentFlow,
  formattingConfig,
  scale = 1,
  showSolutions = true,
  activePreviewAnchor,
  onGraphConfigChange,
}: PaginatedTestPreviewProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const normalizedFormatting = useMemo(() => normalizeFormattingConfig(formattingConfig), [formattingConfig]);
  const pageFormat = useMemo(() => pageFormatFromConfig(normalizedFormatting), [normalizedFormatting]);
  const showMarks = normalizedFormatting.showMarks ?? DEFAULT_FORMATTING_CONFIG.showMarks ?? true;
  const previewStyle = useMemo(() => pageStyle(pageFormat, scale), [pageFormat, scale]);
  const segments = useMemo(
    () =>
      buildPreviewSegments({
        frontMatter,
        questions,
        sectionHeadings,
        documentFlow,
        showSolutions,
        formattingConfig: normalizedFormatting,
        normalizeDocumentFlow,
      }),
    [documentFlow, frontMatter, normalizedFormatting, questions, sectionHeadings, showSolutions],
  );
  const fallbackPages = useMemo<PreviewPage[]>(() => buildExplicitBreakPages(segments), [segments]);
  const [pages, setPages] = useState<PreviewPage[]>(fallbackPages);
  const frontMatterLogo = useMemo(() => selectedLogoForFrontMatter(logos, frontMatter), [frontMatter, logos]);
  const exam = useMemo(() => normalizeExamTitlePage(frontMatter.exam), [frontMatter.exam]);
  const isExamTemplate = frontMatter.titlePageTemplate === "exam";
  const reservedPageHeight = examQuestionPageReservedHeight(frontMatter);

  useLayoutEffect(() => {
    const measureRoot = measureRef.current;
    if (!measureRoot) return;

    const segmentHeights = Array.from(measureRoot.querySelectorAll<HTMLElement>("[data-measure-segment]")).map(
      (element) => element.getBoundingClientRect().height,
    );
    const nextPages = buildMeasuredPages(segmentHeights, segments, pageFormat, reservedPageHeight);
    setPages((currentPages) => (pagesAreEqual(currentPages, nextPages) ? currentPages : nextPages));
  }, [frontMatterLogo, pageFormat, reservedPageHeight, segments, showMarks]);

  const visiblePages = pages.length ? pages : fallbackPages;
  const supplementaryPageCount = bookletSupplementaryPageCount(frontMatter, visiblePages.length);
  const visiblePageGroups = useMemo(
    () =>
      visiblePages.map((page) => {
        const entries: AppPreviewPageSegmentEntry[] = [];
        page.segmentIndexes.forEach((segmentIndex, segmentPageIndex) => {
          const segment = segments[segmentIndex];
          if (segment) entries.push({ segment, segmentPageIndex });
        });

        return {
          page,
          groups: groupPreviewPageSegments(entries),
        };
      }),
    [segments, visiblePages],
  );

  const renderPreviewGroup = (group: AppPreviewQuestionSegmentGroup) => {
    const content = group.entries.map(({ segment, segmentPageIndex }) => (
      <TestPreviewSegment
        key={segment.id}
        segment={segment}
        frontMatter={frontMatter}
        logo={frontMatterLogo}
        totalMarks={totalMarks}
        firstOnPage={segmentPageIndex === 0}
        showSolutions={showSolutions}
        showMarks={showMarks}
        activePreviewAnchor={activePreviewAnchor}
        onGraphConfigChange={onGraphConfigChange}
      />
    ));

    if (!group.question) {
      return (
        <div key={group.id} className="test-preview-document-group">
          {content}
        </div>
      );
    }

    return (
      <div
        key={group.id}
        className="test-preview-question-group"
        data-scroll-anchor={questionScrollAnchor(group.question.id)}
        data-preview-structure-anchor="true"
        data-preview-selected={previewSelectionAttr(questionScrollAnchor(group.question.id), activePreviewAnchor)}
      >
        {content}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "a4-preview-root",
        frontMatter.titlePageTemplate === "worksheet" && "a4-preview-root-worksheet",
        frontMatter.titlePageTemplate === "notes" && "a4-preview-root-notes",
      )}
      style={previewStyle}
    >
      <div className="a4-preview-shell">
        <div className="a4-preview-stack">
          {frontMatter.titlePageTemplate !== "worksheet" && frontMatter.titlePageTemplate !== "notes" ? (
            <FrontMatterPreviewPages
              frontMatter={frontMatter}
              logo={frontMatterLogo}
              totalMarks={totalMarks}
              questionCount={questions.length}
              activePreviewAnchor={activePreviewAnchor}
              showPageBreaks={pageFormat.showPageBreaks}
            />
          ) : null}
          {frontMatter.titlePageTemplate !== "worksheet" && frontMatter.titlePageTemplate !== "notes" && pageFormat.showPageBreaks ? (
            <div className="a4-page-break" aria-hidden="true">
              <span>A4 page break</span>
            </div>
          ) : null}
          {visiblePageGroups.map(({ page, groups }, pageIndex) => {
            const isLastQuestionPage = pageIndex === visiblePages.length - 1;
            const isLastRenderedPage = isLastQuestionPage && supplementaryPageCount === 0;
            const pageNumber = frontMatterPageCount(frontMatter) + pageIndex + 1;
            return (
              <Fragment key={`page-${pageIndex}`}>
                <A4PreviewPageFrame last={isLastRenderedPage}>
                  <section className={cn("a4-page", isExamTemplate && "school-exam-question-page", isLastRenderedPage && "a4-page-last")}>
                    <div className="a4-page-content">
                      {isExamTemplate ? <SchoolExamRunningHeader exam={exam} pageNumber={pageNumber} /> : null}
                      <div className={cn("test-preview-flow", isExamTemplate && "school-exam-question-flow")}>
                        <div className="test-preview-question-list">{groups.map(renderPreviewGroup)}</div>
                      </div>
                      {page.overflow ? (
                        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                          A single block in this question is taller than the available A4 page space.
                        </div>
                      ) : null}
                      {isExamTemplate ? (
                        <SchoolExamPageFooter text={isLastQuestionPage ? exam.endOfQuestionsFooterText : exam.footerText} />
                      ) : null}
                    </div>
                  </section>
                </A4PreviewPageFrame>
                {pageFormat.showPageBreaks && !isLastRenderedPage ? (
                  <div className="a4-page-break" aria-hidden="true">
                    <span>A4 page break</span>
                  </div>
                ) : null}
              </Fragment>
            );
          })}
          {Array.from({ length: supplementaryPageCount }).map((_, supplementaryPageIndex) => {
            const finalPage = supplementaryPageIndex === supplementaryPageCount - 1;
            const pageNumber = frontMatterPageCount(frontMatter) + visiblePages.length + supplementaryPageIndex + 1;
            return (
              <Fragment key={`exam-supplementary-page-${supplementaryPageIndex}`}>
                <A4PreviewPageFrame last={finalPage}>
                  <SchoolExamSupplementaryPage frontMatter={frontMatter} pageNumber={pageNumber} />
                </A4PreviewPageFrame>
                {pageFormat.showPageBreaks && !finalPage ? (
                  <div className="a4-page-break" aria-hidden="true">
                    <span>A4 page break</span>
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div ref={measureRef} className="a4-measure" aria-hidden="true">
        <section className="a4-page">
          <div className="a4-page-content">
            <div className="test-preview-flow">
              {segments.map((segment) => (
                <TestPreviewSegment
                  key={segment.id}
                  segment={segment}
                  frontMatter={frontMatter}
                  logo={frontMatterLogo}
                  totalMarks={totalMarks}
                  measureOnly
                  showSolutions={showSolutions}
                  showMarks={showMarks}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
});

function ManualModeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7.5v9" strokeWidth="2" />
      <path d="M13 7.5v9" strokeWidth="2" />
      <path d="M7 12h12" strokeWidth="2" />
      <path d="M19 12V7.6" strokeWidth="2" />
      <circle cx="7" cy="5.5" r="2.1" strokeWidth="2" />
      <circle cx="7" cy="18.5" r="2.1" strokeWidth="2" />
      <circle cx="13" cy="5.5" r="2.1" strokeWidth="2" />
      <circle cx="13" cy="18.5" r="2.1" strokeWidth="2" />
      <circle cx="19" cy="5.5" r="2.1" strokeWidth="2" fill="currentColor" />
    </svg>
  );
}

function projectFileVersionPreview(version: Parameters<typeof buildProjectFileVersionPreview>[0]) {
  return buildProjectFileVersionPreview<QuestionBlock>(version, {
    parseSavedTest: normalizeSavedTest,
    questionMarks,
  });
}

function FrontMatterEditor({
  frontMatter,
  logos,
  openSignal,
  questionCount,
  totalMarks,
  onChange,
  onAddLogo,
  onUpdateLogo,
  onRemoveLogo,
}: {
  frontMatter: FrontMatterConfig;
  logos: LogoAsset[];
  openSignal?: number;
  questionCount: number;
  totalMarks: number;
  onChange: (patch: Partial<FrontMatterConfig>) => void;
  onAddLogo: (file: File) => void;
  onUpdateLogo: (logoId: string, patch: { name: string; schoolName: string }) => void;
  onRemoveLogo: (logoId: string) => void;
}) {
  const selectedLogo = selectedLogoFromLibrary(logos, frontMatter.logoId);
  const [logoNameDraft, setLogoNameDraft] = useState(selectedLogo.name);
  const normalizedLogoNameDraft = logoNameDraft.trim() || selectedLogo.name;
  const selectedLogoSchoolName = selectedLogo.schoolName ?? "";
  const logoHasDraftChanges = normalizedLogoNameDraft !== selectedLogo.name || frontMatter.schoolName !== selectedLogoSchoolName;

  useEffect(() => {
    setLogoNameDraft(selectedLogo.name);
  }, [selectedLogo.id, selectedLogo.name]);

  function handleUpdateLogo() {
    onUpdateLogo(selectedLogo.id, {
      name: normalizedLogoNameDraft,
      schoolName: frontMatter.schoolName,
    });
    setLogoNameDraft(normalizedLogoNameDraft);
  }

  const titlePageTemplate = frontMatter.titlePageTemplate ?? "standard";
  const isCompactDocumentTemplate = titlePageTemplate === "worksheet" || titlePageTemplate === "notes";
  const exam = normalizeExamTitlePage(frontMatter.exam);
  const activeExamSectionPreset = examSectionPresetById(exam.sectionPreset);
  const updateExam = (patch: Partial<ExamTitlePageConfig>) => onChange({ exam: { ...exam, ...patch } });
  const updateExamRow = (rowId: string, patch: Partial<ExamStructureRowConfig>) =>
    updateExam({
      structureRows: exam.structureRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    });
  const updateExamRowNumber = (
    rowId: string,
    key: keyof Pick<
      ExamStructureRowConfig,
      "questionsAvailable" | "questionsToBeAnswered" | "workingTimeMinutes" | "marksAvailable" | "percentage"
    >,
    value: string,
  ) => updateExamRow(rowId, { [key]: nonNegativeNumberOrDefault(Number(value), 0) } as Partial<ExamStructureRowConfig>);
  const addExamRow = () =>
    updateExam({
      structureRows: [
        ...exam.structureRows,
        {
          id: id("exam-section"),
          section: "Section",
          useCurrentDocument: false,
          questionsAvailable: 0,
          questionsToBeAnswered: 0,
          workingTimeMinutes: 0,
          marksAvailable: 0,
          percentage: 0,
        },
      ],
    });
  const removeExamRow = (rowId: string) =>
    updateExam({
      structureRows: exam.structureRows.length <= 1 ? exam.structureRows : exam.structureRows.filter((row) => row.id !== rowId),
    });

  return (
    <div className="flex flex-col gap-3">
      <CollapsiblePanel
        title={
          <InlineSummaryTitle
            label="Title"
            summary={`${frontMatter.subjectTitle} - ${
              isCompactDocumentTemplate ? frontMatter.assessmentTitle : assessmentTitleText(frontMatter.assessmentTitle)
            }`}
          />
        }
        defaultOpen={false}
        className="bg-muted/20"
        openSignal={openSignal}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
            Template
            <div
              className="flex min-h-9 items-center rounded-md border border-border bg-muted/30 px-2 text-sm font-normal text-muted-foreground"
              aria-label={`Document template: ${titlePageTemplateLabel(titlePageTemplate)}`}
            >
              {titlePageTemplateLabel(titlePageTemplate)}
            </div>
          </div>
          {titlePageTemplate === "exam" ? (
            <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
              Exam section
              <select
                value={activeExamSectionPreset.id}
                onChange={(event) => onChange(examSectionPresetPatch(exam, examSectionPresetFromValue(event.target.value)))}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              >
                {EXAM_SECTION_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {isCompactDocumentTemplate ? (
            <>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Logo
                <select
                  value={frontMatter.logoId}
                  onChange={(event) => onChange({ logoId: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  <option value="">No logo</option>
                  {logos.map((logoOption) => (
                    <option key={logoOption.id} value={logoOption.id}>
                      {logoOption.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                School name
                <input
                  value={frontMatter.schoolName}
                  onChange={(event) => onChange({ schoolName: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            </>
          ) : (
            <div className="rounded-md border bg-background p-3 md:col-span-2">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[88px_minmax(0,1fr)] md:items-center">
                <div className="flex h-24 items-center justify-center rounded-md border bg-white p-2">
                  {selectedLogo ? (
                    <img className="max-h-full max-w-full object-contain" src={selectedLogo.src} alt={`${selectedLogo.name} logo`} />
                  ) : (
                    <span className="text-xs text-muted-foreground">No logo</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                      Logo
                      <select
                        value={frontMatter.logoId}
                        onChange={(event) => onChange({ logoId: event.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      >
                        {logos.map((logoOption) => (
                          <option key={logoOption.id} value={logoOption.id}>
                            {logoOption.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Logo name
                      <input
                        value={logoNameDraft}
                        onChange={(event) => setLogoNameDraft(event.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      School name
                      <Textarea
                        value={frontMatter.schoolName}
                        onChange={(event) => onChange({ schoolName: event.target.value })}
                        className="min-h-16 font-mono text-sm"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                      <ImagePlus className="size-4" aria-hidden="true" />
                      Add logo
                      <input
                        type="file"
                        accept="image/*,.svg"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) onAddLogo(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <Button type="button" variant="outline" size="sm" disabled={!logoHasDraftChanges} onClick={handleUpdateLogo}>
                      <Save data-icon="inline-start" />
                      Update logo
                    </Button>
                    {selectedLogo && logos.length > 1 ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => onRemoveLogo(selectedLogo.id)}>
                        <Trash2 data-icon="inline-start" />
                        Remove logo
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}
          <label className="flex flex-col gap-2 text-xs font-medium">
            {isCompactDocumentTemplate ? "Course" : "Subject title"}
            <input
              value={frontMatter.subjectTitle}
              onChange={(event) => onChange({ subjectTitle: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            {titlePageTemplate === "notes" ? "Notes title" : titlePageTemplate === "worksheet" ? "Worksheet title" : "Assessment title"}
            <input
              value={isCompactDocumentTemplate ? frontMatter.assessmentTitle : assessmentTitleText(frontMatter.assessmentTitle)}
              onChange={(event) =>
                onChange({
                  assessmentTitle: isCompactDocumentTemplate ? event.target.value : assessmentTitleText(event.target.value),
                })
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          {titlePageTemplate !== "exam" ? (
            <>
              {!isCompactDocumentTemplate ? (
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Name label
                  <input
                    value={frontMatter.nameLabel}
                    onChange={(event) => onChange({ nameLabel: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              ) : null}
              {titlePageTemplate !== "notes" ? (
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Mark label
                  <input
                    value={frontMatter.markLabel}
                    onChange={(event) => onChange({ markLabel: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              ) : null}
            </>
          ) : null}
          {titlePageTemplate !== "notes" ? (
            <label className="flex flex-col gap-2 text-xs font-medium">
              Start questions at
              <input
                type="number"
                min={1}
                step={1}
                value={frontMatter.startQuestionNumber}
                onChange={(event) => onChange({ startQuestionNumber: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
          ) : null}
          {titlePageTemplate !== "worksheet" ? (
            <div className="grid grid-cols-1 gap-3 md:col-span-2 md:grid-cols-[auto_minmax(0,1fr)] md:items-end">
              <label className="flex h-9 items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={frontMatter.showAssessmentSubtitle}
                  onChange={(event) => onChange({ showAssessmentSubtitle: event.target.checked })}
                />
                Show assessment subtitle
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Assessment subtitle
                {titlePageTemplate === "exam" ? (
                  <Textarea
                    value={frontMatter.assessmentSubtitle}
                    onChange={(event) => onChange({ assessmentSubtitle: event.target.value })}
                    placeholder={"Section One:\nCalculator-free"}
                    className="min-h-16 text-sm"
                  />
                ) : (
                  <input
                    value={frontMatter.assessmentSubtitle}
                    onChange={(event) => onChange({ assessmentSubtitle: event.target.value })}
                    placeholder="Calculator Free Section"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                )}
              </label>
            </div>
          ) : null}
        </div>
      </CollapsiblePanel>

      {titlePageTemplate === "exam" ? (
        <>
          <ExamCoverEditor exam={exam} onUpdateExam={updateExam} />
          <ExamTimeMaterialsEditor exam={exam} onUpdateExam={updateExam} />

          <ExamStructureEditor
            exam={exam}
            questionCount={questionCount}
            totalMarks={totalMarks}
            onUpdateExam={updateExam}
            onAddRow={addExamRow}
            onRemoveRow={removeExamRow}
            onUpdateRow={updateExamRow}
            onUpdateRowNumber={updateExamRowNumber}
          />

          <ExamInstructionsEditor exam={exam} onUpdateExam={updateExam} />
        </>
      ) : null}

      {titlePageTemplate === "standard" ? (
        <>
          <CollapsiblePanel
            title={
              <InlineSummaryTitle
                label="Supervisor declaration"
                summary={frontMatter.showDeclaration ? frontMatter.declarationTitle : "Hidden"}
              />
            }
            defaultOpen={false}
            className="bg-muted/20"
            actions={
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={frontMatter.showDeclaration}
                  onChange={(event) => onChange({ showDeclaration: event.target.checked })}
                />
                Show
              </label>
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                Heading
                <input
                  value={frontMatter.declarationTitle}
                  onChange={(event) => onChange({ declarationTitle: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                Declaration text
                <Textarea
                  value={frontMatter.declarationBody}
                  onChange={(event) => onChange({ declarationBody: event.target.value })}
                  className="min-h-28 text-sm"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Signature label
                <input
                  value={frontMatter.signatureLabel}
                  onChange={(event) => onChange({ signatureLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Signature role
                <input
                  value={frontMatter.signatureRole}
                  onChange={(event) => onChange({ signatureRole: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            title={
              <InlineSummaryTitle label="Instructions" summary={frontMatter.showInstructions ? frontMatter.instructionsTitle : "Hidden"} />
            }
            defaultOpen={false}
            className="bg-muted/20"
            actions={
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={frontMatter.showInstructions}
                  onChange={(event) => onChange({ showInstructions: event.target.checked })}
                />
                Show
              </label>
            }
          >
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Heading
                <input
                  value={frontMatter.instructionsTitle}
                  onChange={(event) => onChange({ instructionsTitle: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Instructions text
                <Textarea
                  value={frontMatter.instructionsBody}
                  onChange={(event) => onChange({ instructionsBody: event.target.value })}
                  className="min-h-36 text-sm"
                />
              </label>
            </div>
          </CollapsiblePanel>
        </>
      ) : null}
    </div>
  );
}

function questionHasPageBreak(question: QuestionBlock) {
  return question.pageBreakAfter || question.contentBlocks.some((block) => block.kind === "pageBreak");
}

export default function App() {
  const mauthDialogs = useMauthDialogController();
  const initialEditorDraft = loadInitialEditorDraft();
  const initialEditorDocumentOpen = initialEditorDraft?.documentOpen !== false;
  const initialQuestions = useMemo(() => initialEditorDraft?.questions ?? [createQuestion()], [initialEditorDraft]);
  const initialSectionHeadings = useMemo(() => initialEditorDraft?.sectionHeadings ?? [], [initialEditorDraft]);
  const initialDocumentFlow = useMemo(
    () => normalizeDocumentFlow(initialEditorDraft?.documentFlow, initialQuestions, initialSectionHeadings),
    [initialEditorDraft, initialQuestions, initialSectionHeadings],
  );
  const [logos, setLogos] = useState<LogoAsset[]>(loadLogoLibrary);
  const logosRef = useRef(logos);
  const [legacySavedTests, setLegacySavedTests] = useState<SavedTest[]>(loadLegacySavedTests);
  const legacySavedTestsRef = useRef(legacySavedTests);
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestion, setDragOverQuestion] = useState<QuestionDropPreview | null>(null);
  const [draggedPageBreakQuestionId, setDraggedPageBreakQuestionId] = useState<string | null>(null);
  const [dragOverPageBreak, setDragOverPageBreak] = useState<PageBreakDropPreview | null>(null);
  const [draggedSubsection, setDraggedSubsection] = useState<SubsectionDragTarget | null>(null);
  const [dragOverSubsection, setDragOverSubsection] = useState<SubsectionDropPreview | null>(null);
  const [draggedEditorPageBreak, setDraggedEditorPageBreak] = useState<EditorPageBreakTarget | null>(null);
  const [dragOverEditorPageBreak, setDragOverEditorPageBreak] = useState<EditorPageBreakDropPreview | null>(null);
  const [paneMode, setPaneMode] = useState<PaneMode>("preview");
  const [tocOpen, setTocOpen] = useState(false);
  const [activeTocItemId, setActiveTocItemId] = useState(() => firstDocumentFlowAnchor(initialDocumentFlow, initialQuestions));
  const [activeRailItemId, setActiveRailItemId] = useState(() => firstDocumentFlowAnchor(initialDocumentFlow, initialQuestions));
  const [activeQuestionId, setActiveQuestionId] = useState(() => firstQuestionId(initialQuestions));
  function clearEditorTransientState() {
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
  }

  const {
    frontMatter,
    formattingConfig,
    editorDocumentOpen,
    setEditorDocumentOpenState,
    questions,
    sectionHeadings,
    documentFlow,
    frontMatterRef,
    formattingConfigRef,
    questionsRef,
    sectionHeadingsRef,
    documentFlowRef,
    editorDocumentOpenRef,
    currentEditorDocument,
    restoreEditorSnapshot,
    setEditorDocument,
    setQuestionsWithHistory,
    setEditorDocumentWithHistory,
    setSectionFlowWithHistory,
    canUndo,
    canRedo,
    pushEditorHistory,
    undoEdit,
    redoEdit,
  } = useEditorDocumentStateController<
    FrontMatterConfig,
    QuestionBlock,
    DocumentSectionHeading,
    DocumentFlowItem,
    FormattingConfig,
    EditorHistorySnapshot
  >({
    historyLimit: HISTORY_LIMIT,
    initialFrontMatter: initialEditorDraft?.frontMatter ?? DEFAULT_FRONT_MATTER,
    initialQuestions,
    initialSectionHeadings,
    initialDocumentFlow,
    initialFormattingConfig: initialEditorDraft?.formattingConfig ?? DEFAULT_FORMATTING_CONFIG,
    initialDocumentOpen: initialEditorDocumentOpen,
    normalizeQuestions: normalizeQuestionBlocks,
    normalizeSectionHeadings,
    normalizeDocumentFlow,
    normalizeFormattingConfig,
    documentFlowFromQuestionChange,
    getActiveQuestionId: () => activeQuestionId,
    getActiveTocItemId: () => activeTocItemId,
    existingOrFirstQuestionId,
    questionScrollAnchor,
    frontMatterAnchor: SCROLL_ANCHOR_FRONT_MATTER,
    firstDocumentFlowAnchor,
    sectionHeadingIdFromScrollAnchor,
    questionIdFromScrollAnchor,
    setActiveQuestionId,
    setActiveTocItemId,
    setActiveRailItemId,
    onRestoreSnapshotExtra: (snapshot) => {
      const snapshotLogo = "logo" in snapshot ? normalizeLogoAsset(snapshot.logo) : undefined;
      if (!snapshotLogo) return;
      setLogos((current) => {
        const next = mergeLogoAssets(current, [snapshotLogo]);
        if (next !== current) {
          logosRef.current = next;
          persistLogoLibrary(next);
        }
        return next;
      });
      writeLogoToDisk(snapshotLogo);
    },
    clearTransientEditorState: clearEditorTransientState,
  });
  const cleanUnsavedDocumentFingerprintRef = useRef<string | null>(
    initialEditorDraft
      ? null
      : editorDocumentFingerprint(
          DEFAULT_FRONT_MATTER,
          initialQuestions,
          DEFAULT_FORMATTING_CONFIG,
          selectedLogoForFrontMatter(logos, DEFAULT_FRONT_MATTER),
          initialSectionHeadings,
          initialDocumentFlow,
        ),
  );
  const [draftAutosaveStatus, setDraftAutosaveStatus] = useState<DraftAutosaveStatus>("loading");
  const [draftAutosaveMessage, setDraftAutosaveMessage] = useState("Loading draft autosave");
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [newTestDialogOpen, setNewTestDialogOpen] = useState(false);
  const [systemStatusPanelOpen, setSystemStatusPanelOpen] = useState(false);
  const {
    showSolutions,
    setShowSolutions,
    showSolutionsRef,
    isNotesTemplate,
    supportsSolutionTools,
    effectiveShowSolutions,
    previewShowSolutions,
    insertedBlockVisibilityForKind: solutionInsertedBlockVisibilityForKind,
    printModeLabel,
    printModeTitle,
  } = useSolutionModeController(frontMatter);
  const {
    status: systemStatus,
    state: systemStatusState,
    message: systemStatusMessage,
    webBuild,
    refresh: refreshSystemStatus,
  } = useSystemStatusController();
  const buildLegacySavedTestImport = useCallback((savedTest: SavedTest, filesForImport: ProjectFileSummary[]) => {
    const testPath = uniqueTestPath(filesForImport, "", savedTest.name, "file");
    return {
      path: projectPathForTestPath(testPath),
      content: JSON.stringify(savedTest, null, 2),
    };
  }, []);
  const isVisibleProjectTestFile = useCallback((file: ProjectFileSummary) => {
    const testPath = testFilePathKey(file);
    return testPath !== null && testPath !== "" && isProjectTestFile(file);
  }, []);
  const {
    fileManagerOpen,
    setFileManagerOpen,
    openFileManager,
    activeProject,
    setActiveProject,
    projectFiles,
    setProjectFiles,
    projectFilesStatus,
    setProjectFilesStatus,
    projectFilesMessage,
    setProjectFilesMessage,
    activeProjectFilePath,
    setActiveProjectFilePath,
    activeProjectFileRevision,
    setActiveProjectFileRevision,
    projectSaveConflict,
    setProjectSaveConflict,
    refreshProjectFiles,
  } = useProjectFilesController({
    initialActiveProjectFilePath: initialEditorDocumentOpen ? (initialEditorDraft?.activeProjectFilePath ?? null) : null,
    initialActiveProjectFileRevision: initialEditorDocumentOpen ? (initialEditorDraft?.activeProjectFileRevision ?? null) : null,
    legacySavedTests,
    storageHydrated,
    buildLegacySavedTestImport,
    isVisibleProjectFile: isVisibleProjectTestFile,
  });
  const [lastProjectSaveFingerprint, setLastProjectSaveFingerprint] = useState<string | null>(null);
  const lastProjectSaveFingerprintRef = useRef<string | null>(null);
  const { darkMode, toggleTheme } = useThemeController();
  const [printPreviewMounted, setPrintPreviewMounted] = useState(false);
  const [editorRevealRequest, setEditorRevealRequest] = useState<{ anchor: string; sequence: number } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const editorPaneRef = useRef<HTMLElement>(null);
  const previewPaneRef = useRef<HTMLElement>(null);
  const pointerSubsectionDragRef = useRef<PointerSubsectionDragSession | null>(null);

  function updateLastProjectSaveFingerprint(nextFingerprint: string | null) {
    lastProjectSaveFingerprintRef.current = nextFingerprint;
    setLastProjectSaveFingerprint(nextFingerprint);
  }

  const { activeProjectFilePathRef, activeProjectFileRevisionRef, setActiveProjectFileState, clearActiveProjectFileState } =
    useActiveProjectFileStateController({
      activeProjectFilePath,
      activeProjectFileRevision,
      setActiveProjectFilePath,
      setActiveProjectFileRevision,
      setProjectSaveConflict,
      updateLastProjectSaveFingerprint,
    });

  const currentDraftSnapshotForStorage = useEditorAutosaveSnapshotController({
    frontMatterRef,
    questionsRef,
    sectionHeadingsRef,
    documentFlowRef,
    formattingConfigRef,
    logosRef,
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    editorDocumentOpenRef,
    selectLogo: selectedLogoForFrontMatter,
  });

  useEffect(() => {
    return () => pointerSubsectionDragRef.current?.cleanup();
  }, []);

  const resolvePrintTitle = useCallback(() => {
    const activeFileName = activeProjectFilePathRef.current
      ? testFileDisplayName(testPathBasename(testPathFromProjectPath(activeProjectFilePathRef.current) ?? activeProjectFilePathRef.current))
      : defaultSavedTestName(frontMatterRef.current);
    return printFileNameForDocument(frontMatterRef.current, activeFileName, showSolutionsRef.current);
  }, [activeProjectFilePathRef, frontMatterRef, showSolutionsRef]);
  const printDocument = usePrintController({ resolvePrintTitle, setPrintPreviewMounted });

  async function refreshLogoLibraryFromDisk() {
    const logosResponse = await listStoredLogos<unknown>();
    const diskLogos = normalizeLogoAssets(logosResponse.logos);
    setLogos((current) => {
      const next = mergeLogoAssets(current, diskLogos);
      logosRef.current = next;
      persistLogoLibrary(next);
      return next;
    });
  }

  function upsertLogoFromDisk(logo: LogoAsset) {
    setLogos((current) => {
      const next = mergeLogoAssets(current, [logo]);
      if (next !== current) {
        logosRef.current = next;
        persistLogoLibrary(next);
      }
      return next;
    });
  }

  function writeLogoToDisk(logo: LogoAsset) {
    if (draftAutosaveStatus === "unavailable") return;
    saveStoredLogo<LogoAsset>(logo)
      .then((savedLogo) => {
        const normalizedLogo = normalizeLogoAsset(savedLogo);
        if (normalizedLogo) upsertLogoFromDisk(normalizedLogo);
      })
      .catch(() => {
        setDraftAutosaveStatus("unavailable");
        setDraftAutosaveMessage("Logo save failed: using browser backup only");
      });
  }

  const { resolveAutosaveAgainstProjectFile } = useProjectAutosaveResolutionController<AutosavedEditorSnapshot, SavedTest>({
    activeProject,
    parseSavedDocument: (content) => {
      if (!content) return null;
      try {
        return normalizeSavedTest(JSON.parse(content) as unknown);
      } catch {
        return null;
      }
    },
    savedDocumentFingerprint: (savedTest) =>
      editorDocumentFingerprint(
        savedTest.frontMatter,
        savedTest.questions,
        savedTest.formattingConfig,
        savedTest.logo ?? selectedLogoForFrontMatter(logosRef.current, savedTest.frontMatter),
        savedTest.sectionHeadings,
        savedTest.documentFlow,
      ),
    autosaveSnapshotFingerprint: (snapshot) =>
      editorDocumentFingerprint(
        snapshot.frontMatter,
        snapshot.questions,
        snapshot.formattingConfig,
        snapshot.logo ?? selectedLogoForFrontMatter(logosRef.current, snapshot.frontMatter),
        snapshot.sectionHeadings,
        snapshot.documentFlow,
      ),
    savedDocumentToAutosaveSnapshot: (savedTest, filePath, revision) => ({
      frontMatter: savedTest.frontMatter,
      questions: savedTest.questions,
      sectionHeadings: savedTest.sectionHeadings,
      documentFlow: savedTest.documentFlow,
      formattingConfig: savedTest.formattingConfig,
      logo: savedTest.logo,
      activeProjectFilePath: filePath,
      activeProjectFileRevision: revision ?? undefined,
      updatedAt: savedTest.updatedAt,
    }),
  });

  useInitialStorageHydrationController<SavedTest, LogoAsset, AutosavedEditorSnapshot>({
    loadDiskStorage: async () => {
      const [testsResponse, autosaveResponse, logosResponse] = await Promise.all([
        listLegacyStoredTests<unknown>(),
        getStorageAutosave<unknown>(),
        listStoredLogos<unknown>(),
      ]);
      return {
        legacySavedTests: normalizeSavedTests(testsResponse.tests),
        autosave: normalizeEditorSnapshot(autosaveResponse.autosave),
        logos: normalizeLogoAssets(logosResponse.logos),
      };
    },
    fallbackLegacySavedTests: legacySavedTests,
    currentLogos: () => logosRef.current,
    starterLogos: STARTER_LOGOS,
    legacySavedTestLogo: (test) => test.logo,
    shouldSeedStarterLogos,
    mergeLegacySavedTests,
    buildMergedLogos: ({ diskLogos, localLogos, starterLogos, legacySavedTestLogos }) =>
      appendMissingLogoAssets(
        appendMissingLogoAssets(appendMissingLogoAssets(diskLogos.length ? diskLogos : localLogos, starterLogos), localLogos),
        legacySavedTestLogos,
      ),
    persistMergedStorage: (mergedLegacySavedTests, mergedLogos) => {
      setLegacySavedTests(mergedLegacySavedTests);
      setLogos(mergedLogos);
      logosRef.current = mergedLogos;
      persistLogoLibrary(mergedLogos);
      markStarterLogosSeeded();
      persistLegacySavedTests(mergedLegacySavedTests);
    },
    saveLogoToDisk: (logo) => saveStoredLogo<LogoAsset>(logo),
    loadBrowserAutosave: () => loadCurrentDraft(),
    newerAutosave,
    isClosedAutosave: (autosave) => autosave.documentOpen === false,
    clearAutosaveProjectFile: (autosave) => ({
      ...autosave,
      activeProjectFilePath: undefined,
      activeProjectFileRevision: undefined,
    }),
    autosaveProjectFileRevision: (autosave) => ({
      filePath: autosave.activeProjectFilePath,
      revision: autosave.activeProjectFileRevision,
    }),
    resolveAutosaveAgainstProjectFile,
    restoreAutosave: ({ autosave, project, cleanFingerprint, conflict }) => {
      restoreEditorSnapshot(autosave);
      if (project) setActiveProject(project);
      setActiveProjectFileState(autosave.activeProjectFilePath ?? null, autosave.activeProjectFileRevision ?? null);
      setProjectSaveConflict(conflict);
      updateLastProjectSaveFingerprint(cleanFingerprint);
      setEditorDocumentOpenState(autosave.documentOpen !== false);
    },
    setStorageHydrated,
    setDraftAutosaveStatus,
    setDraftAutosaveMessage,
  });

  const previewFrontMatter = useDeferredValue(frontMatter);
  const previewQuestions = useDeferredValue(questions);
  const previewSectionHeadings = useDeferredValue(sectionHeadings);
  const previewDocumentFlow = useDeferredValue(documentFlow);
  const previewFormattingConfig = useDeferredValue(formattingConfig);
  const previewLogos = useDeferredValue(logos);
  const totalMarks = questions.reduce((sum, question) => sum + questionMarks(question), 0);
  const previewTotalMarks = useMemo(() => previewQuestions.reduce((sum, question) => sum + questionMarks(question), 0), [previewQuestions]);
  const showEditor = paneMode === "split";
  const showPreview = true;
  const showInspectorPane = showEditor && inspectorOpen;
  const currentPageFormat = useMemo(() => pageFormatFromConfig(formattingConfig), [formattingConfig]);
  const { previewFitScale, previewLayoutScale, resetPreviewZoom } = usePreviewZoomController({
    previewPaneRef,
    currentPageFormat,
    showPreview,
  });
  const workspaceStyle = useMemo(
    () => ({
      gridTemplateColumns:
        paneMode === "preview"
          ? "minmax(0, 1fr)"
          : showInspectorPane
            ? "minmax(17rem, 0.9fr) minmax(17rem, 19rem) minmax(0, 1.1fr)"
            : "minmax(0, 1fr) minmax(0, 1fr)",
    }),
    [paneMode, showInspectorPane],
  );
  const appShellStyle = useMemo(
    () => ({
      gridTemplateColumns: tocOpen ? "3.25rem minmax(15rem, 18rem) minmax(0, 1fr)" : "3.25rem minmax(0, 1fr)",
    }),
    [tocOpen],
  );
  const documentTocItems = useMemo(
    () =>
      buildDocumentToc({
        frontMatter,
        questions,
        sectionHeadings,
        documentFlow,
        showSolutions: effectiveShowSolutions,
        normalizeDocumentFlow,
        tocBlockSummary,
      }),
    [documentFlow, effectiveShowSolutions, frontMatter, questions, sectionHeadings],
  );
  const activePreviewAnchor = useMemo(() => {
    if (activeTocItemId.startsWith("pb:")) return undefined;
    return previewAnchorForEditorAnchor(activeTocItemId, documentTocItems);
  }, [activeTocItemId, documentTocItems]);
  const { contextDescriptorForAnchor, contextReferenceText } = useMemo(
    () =>
      createEditorContextDescriptorRuntime({
        documentTocItems,
        questions,
        selectedEditorBlockFromAnchor,
        summaryText: tocSummaryText,
      }),
    [documentTocItems, questions],
  );
  const currentDocumentFingerprint = useMemo(
    () =>
      editorDocumentFingerprint(
        frontMatter,
        questions,
        formattingConfig,
        selectedLogoForFrontMatter(logos, frontMatter),
        sectionHeadings,
        documentFlow,
      ),
    [documentFlow, formattingConfig, frontMatter, logos, questions, sectionHeadings],
  );
  const draftChangeKey = editorDraftChangeKey({
    documentOpen: editorDocumentOpen,
    activeProjectFilePath,
    activeProjectFileRevision,
    documentFingerprint: currentDocumentFingerprint,
  });
  useDraftAutosaveController<AutosavedEditorSnapshot>({
    storageHydrated,
    diskAutosaveAvailable: draftAutosaveStatus !== "unavailable",
    editorDocumentOpen,
    activeProjectFilePath,
    activeProjectFileRevision,
    draftChangeKey,
    createAutosaveSnapshot: currentDraftSnapshotForStorage,
    persistLocalDraft: persistCurrentDraft,
    saveDiskAutosave: async (snapshot) => {
      const autosaveResponse = await saveStorageAutosave<AutosavedEditorSnapshot>(snapshot);
      return autosaveResponse.autosave;
    },
    loadProjectFileSummary: async (filePath) => {
      const project = activeProject ?? (await getDefaultProject());
      const filesResponse = await listProjectFiles(project.id);
      setActiveProject(project);
      setProjectFiles(filesResponse.files);
      return filesResponse.files.find((file) => file.path === filePath && file.kind === "file");
    },
    isCurrentProjectFileClean: () => lastProjectSaveFingerprintRef.current === currentEditorDocumentFingerprint(),
    reloadActiveProjectFileFromDisk: () => {
      void syncActiveProjectFileFromDisk();
    },
    setDraftAutosaveStatus,
    setDraftAutosaveMessage,
    setProjectSaveConflict,
    setProjectFilesStatus,
    setProjectFilesMessage,
    localDraftDebounceMs: LOCAL_DRAFT_DEBOUNCE_MS,
    diskAutosaveDebounceMs: AUTOSAVE_DEBOUNCE_MS,
  });
  const {
    hasUnsavedProjectChanges,
    activeProjectPathLabel,
    activeProjectRevisionIssue,
    currentProjectFileName,
    fileOperationBusy,
    headerFileStatusMessage,
    headerFileStatusTitle,
    headerStorageStatus,
    hasUnsavedDraftChanges,
  } = useProjectFileStatus({
    editorDocumentOpen,
    activeProjectFilePath,
    activeProjectFileRevision,
    projectSaveConflict,
    projectFiles,
    projectFilesStatus,
    projectFilesMessage,
    currentDocumentFingerprint,
    lastProjectSaveFingerprint,
    cleanUnsavedDocumentFingerprint: cleanUnsavedDocumentFingerprintRef.current,
    draftAutosaveStatus,
    draftAutosaveMessage,
  });
  useUnsavedChangesBeforeUnloadController({
    editorDocumentOpen,
    fileOperationBusy,
    hasUnsavedProjectChanges,
    hasUnsavedDraftChanges,
  });
  const {
    activeQuestion,
    activeSectionHeading,
    editingSectionHeading,
    editingFrontMatter,
    pageBreakQuestionIds,
    activePageBreakQuestion,
    editingPageBreak,
    selectedEditorBlock,
    selectionInspectorVisible,
  } = useEditorSelectionController<QuestionBlock, DocumentSectionHeading, DocumentFlowItem, SelectedEditorBlock>({
    questions,
    sectionHeadings,
    documentFlow,
    activeQuestionId,
    setActiveQuestionId,
    activeTocItemId,
    setActiveTocItemId,
    setActiveRailItemId,
    showInspectorPane,
    frontMatterAnchor: SCROLL_ANCHOR_FRONT_MATTER,
    questionScrollAnchor,
    sectionHeadingIdFromScrollAnchor,
    pageBreakQuestionIdFromScrollAnchor,
    selectedEditorBlockFromAnchor,
    questionHasPageBreak,
    existingOrFirstQuestionId,
    normalizeDocumentFlow,
    firstDocumentFlowAnchor,
  });

  const {
    clearPendingDocumentJumps,
    queueDocumentJump,
    queuePreviewJump,
    handlePreviewPointerDown,
    handlePreviewClick,
    jumpToTocItem,
    jumpPreviewToTocItem,
    selectPageBreakInRail,
    toggleEditorAtTocItem,
    jumpPreviewToQuestion,
    toggleManualPane,
    toggleInspectorPane,
  } = useEditorNavigationController<DocumentTocItem>({
    editorPaneRef,
    previewPaneRef,
    documentTocItems,
    showEditor,
    showPreview,
    paneMode,
    activeQuestionId,
    activeTocItemId,
    editorRevealSequence: editorRevealRequest?.sequence,
    previewFitScale,
    documentLayoutKey: questions,
    previewEditClickMoveTolerancePx: PREVIEW_EDIT_CLICK_MOVE_TOLERANCE_PX,
    setPaneMode,
    setInspectorOpen,
    setActiveTocItemId,
    setActiveRailItemId,
    selectQuestionInEditor,
    revealEditorAnchor,
    resetPreviewZoom,
    scrollToAnchorPosition,
    scrollAnchorFallbacks,
    graphChildParentScrollAnchor,
    previewAnchorFromEventTarget,
    questionIdFromScrollAnchor,
    questionScrollAnchor,
  });

  const { contextMenu, closeContextMenu, openContextMenu, handlePreviewContextMenu, handleEditorHeaderContextMenu } =
    useEditorContextMenuController<DocumentTocItem>({
      previewPaneRef,
      contextDescriptorForAnchor,
      selectContextAnchor,
      contextActionsForAnchor,
      previewAnchorFromEventTarget,
    });

  useLayoutEffect(() => {
    logosRef.current = logos;
    legacySavedTestsRef.current = legacySavedTests;
  }, [legacySavedTests, logos]);

  useLayoutEffect(() => {
    const previewPane = previewPaneRef.current;
    if (!previewPane || !showPreview || paneMode !== "split") return;
    syncPreviewSelection(previewPane, activePreviewAnchor);
  }, [
    activePreviewAnchor,
    paneMode,
    previewDocumentFlow,
    previewFormattingConfig,
    previewFrontMatter,
    previewQuestions,
    previewSectionHeadings,
    previewShowSolutions,
    showPreview,
  ]);

  useLayoutEffect(() => {
    const editorPane = editorPaneRef.current;
    if (!editorPane || !showEditor) return;

    editorPane.scrollLeft = 0;

    const keepEditorPinnedLeft = () => {
      if (editorPane.scrollLeft !== 0) editorPane.scrollLeft = 0;
    };

    editorPane.addEventListener("scroll", keepEditorPinnedLeft, { passive: true });
    return () => editorPane.removeEventListener("scroll", keepEditorPinnedLeft);
  }, [showEditor]);

  function currentEditorDocumentFingerprint() {
    return editorDocumentFingerprint(
      frontMatterRef.current,
      questionsRef.current,
      formattingConfigRef.current,
      selectedLogoForFrontMatter(logosRef.current, frontMatterRef.current),
      sectionHeadingsRef.current,
      documentFlowRef.current,
    );
  }

  const {
    applyEditorAction,
    applyEditorActions,
    applyEditorDocumentAction,
    previewEditorDocumentActions,
    evaluateEditorDocumentActions,
    applyEditorDocumentActions,
  } = useEditorDocumentActionsController<QuestionBlock, FrontMatterConfig, FormattingConfig, EditorDocumentState>({
    currentQuestions: () => questionsRef.current,
    currentDocument: currentEditorDocument,
    currentTitlePageTemplate: () => titlePageTemplateFromValue(frontMatterRef.current.titlePageTemplate),
    titlePageTemplateFromValue,
    normalizeQuestion: withNormalizedQuestionOrder,
    normalizePart: (part) => withNormalizedPartOrder(part as EditorPart),
    normalizeFrontMatter: (nextFrontMatter) => normalizeFrontMatter(nextFrontMatter) ?? DEFAULT_FRONT_MATTER,
    normalizeFormattingConfig: normalizeFormattingConfig,
    validateSolutions: (nextQuestions) => validateSolutionCompleteness(nextQuestions, solutionValidationRuntime(frontMatterRef.current)),
    validateDocument: (document) => validateSolutionCompleteness(document.questions, solutionValidationRuntime(document.frontMatter)),
    setQuestionsWithHistory,
    setDocumentWithHistory: setEditorDocumentWithHistory,
  });

  const {
    actionProposalOpen,
    setActionProposalOpen,
    actionProposalText,
    setActionProposalText,
    actionProposalMessage,
    actionProposalResult,
    previewActionProposal,
    applyActionProposal,
    clearActionProposal,
    clearActionProposalFeedback,
  } = useMauthActionProposalController<QuestionBlock, FrontMatterConfig, FormattingConfig>({
    parseActions: parseMauthDocumentActionProposal,
    previewActions: previewEditorDocumentActions,
    applyActions: applyEditorDocumentActions,
  });

  const { addSectionHeading, updateSectionHeading, removeSectionHeading, moveSectionHeadingByKeyboard } = useEditorSectionHeadingController(
    {
      activeRailItemId,
      activeTocItemId,
      questionsRef,
      sectionHeadingsRef,
      documentFlowRef,
      normalizeDocumentFlow,
      createId: id,
      setSectionFlowWithHistory,
      setActiveTocItemId,
      setActiveRailItemId,
      setActiveQuestionId,
      revealEditorAnchor,
      queueDocumentJump,
    },
  );

  function updateQuestion(questionId: string, patch: Partial<QuestionBlock>) {
    applyEditorAction({ type: "question.update", questionId, patch: patch as Record<string, unknown> });
  }

  function updateLogo(logoId: string, patch: { name: string; schoolName: string }) {
    const existingLogo = logosRef.current.find((logo) => logo.id === logoId);
    if (!existingLogo) return;
    const updatedLogo = {
      ...existingLogo,
      name: patch.name.trim() || existingLogo.name,
      schoolName: patch.schoolName,
    };
    const nextLogos = logosRef.current.map((logo) => (logo.id === logoId ? updatedLogo : logo));
    logosRef.current = nextLogos;
    setLogos(nextLogos);
    persistLogoLibrary(nextLogos);
    writeLogoToDisk(updatedLogo);
    if (frontMatterRef.current.logoId === logoId) {
      applyEditorDocumentAction({ type: "frontMatter.update", patch: { schoolName: patch.schoolName } });
    }
  }

  function updateFrontMatter(patch: Partial<FrontMatterConfig>) {
    applyEditorDocumentAction({
      type: "frontMatter.update",
      patch: {
        ...(typeof patch.logoId === "string" ? frontMatterPatchForLogo(logosRef.current, patch.logoId) : {}),
        ...patch,
      } as Record<string, unknown>,
    });
  }

  function addLogo(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) return;

      const logo: LogoAsset = {
        id: id("logo"),
        name: logoNameFromFile(file.name),
        src,
        schoolName: frontMatterRef.current.schoolName,
      };
      const nextLogos = [...logosRef.current, logo];
      logosRef.current = nextLogos;
      setLogos(nextLogos);
      persistLogoLibrary(nextLogos);
      writeLogoToDisk(logo);
      applyEditorDocumentAction({ type: "frontMatter.logo.set", logoId: logo.id, schoolName: logo.schoolName });
    };
    reader.readAsDataURL(file);
  }

  function removeLogo(logoId: string) {
    const nextLogos = logosRef.current.filter((candidate) => candidate.id !== logoId);
    if (nextLogos.length === logosRef.current.length || !nextLogos.length) return;
    logosRef.current = nextLogos;
    setLogos(nextLogos);
    persistLogoLibrary(nextLogos);
    deleteStoredLogo(logoId).catch(() => {
      setDraftAutosaveStatus("unavailable");
      setDraftAutosaveMessage("Logo delete failed: using browser backup only");
    });
    if (frontMatterRef.current.logoId === logoId) {
      const nextLogo = selectedLogoFromLibrary(nextLogos, nextLogos[0].id);
      applyEditorDocumentAction({ type: "frontMatter.logo.set", logoId: nextLogo.id, schoolName: nextLogo.schoolName });
    }
  }

  function clearActiveProjectFile() {
    clearActiveProjectFileState();
  }

  const { createNewDocumentFromTemplate: createNewTestFromTemplate } = useNewDocumentController<
    TitlePageTemplate,
    QuestionBlock[],
    EditorDocumentState
  >({
    storageHydrated,
    editorDocumentOpen,
    starterChangeKey: questions,
    shouldSeedStarter: () => shouldSeedScreenshotStarter(questionsRef.current),
    createStarterDocument: () => {
      const nextQuestions = createScreenshotStarterQuestions(screenshotStarterRuntime);
      const nextSectionHeadings: DocumentSectionHeading[] = [];
      const nextDocumentFlow = defaultDocumentFlow(nextQuestions);
      return {
        document: {
          frontMatter: createScreenshotStarterFrontMatter(),
          questions: nextQuestions,
          sectionHeadings: nextSectionHeadings,
          documentFlow: nextDocumentFlow,
          formattingConfig: cloneSerializable(DEFAULT_FORMATTING_CONFIG),
        },
        activeQuestionId: firstQuestionId(nextQuestions),
        anchor: firstQuestionAnchor(nextQuestions),
        markSeeded: () => window.localStorage.setItem(STARTER_DOCUMENT_STORAGE_KEY, SCREENSHOT_STARTER_DOCUMENT_ID),
      };
    },
    createTemplateDocument: (template) => {
      const currentLogo = selectedLogoFromLibrary(logosRef.current, frontMatterRef.current.logoId);
      const frontMatterTemplate =
        template === "exam"
          ? DEFAULT_EXAM_FRONT_MATTER
          : template === "worksheet"
            ? DEFAULT_WORKSHEET_FRONT_MATTER
            : template === "notes"
              ? DEFAULT_NOTES_FRONT_MATTER
              : DEFAULT_FRONT_MATTER;
      const nextFrontMatter = {
        ...cloneSerializable(frontMatterTemplate),
        logoId: currentLogo.id,
        schoolName: currentLogo.schoolName ?? frontMatterRef.current.schoolName,
      };
      const nextQuestions = template === "notes" ? [createNotesSection()] : [createQuestion()];
      const nextSectionHeadings: DocumentSectionHeading[] = [];
      const nextDocumentFlow = defaultDocumentFlow(nextQuestions);
      const nextFormattingConfig = formattingConfigForPresetId(
        NEW_TEST_TEMPLATES.find((item) => item.id === template)?.formatPresetId ?? DEFAULT_FORMATTING_CONFIG.id,
      );
      const nextAnchor = questionScrollAnchor(nextQuestions[0].id);
      return {
        document: {
          frontMatter: nextFrontMatter,
          questions: nextQuestions,
          sectionHeadings: nextSectionHeadings,
          documentFlow: nextDocumentFlow,
          formattingConfig: nextFormattingConfig,
        },
        activeQuestionId: nextQuestions[0].id,
        anchor: nextAnchor,
        cleanFingerprint: editorDocumentFingerprint(
          nextFrontMatter,
          nextQuestions,
          nextFormattingConfig,
          currentLogo,
          nextSectionHeadings,
          nextDocumentFlow,
        ),
      };
    },
    setDocument: setEditorDocument,
    setDocumentOpen: setEditorDocumentOpenState,
    setCleanUnsavedDocumentFingerprint: (fingerprint) => {
      cleanUnsavedDocumentFingerprintRef.current = fingerprint;
    },
    clearActiveProjectFileState,
    setActiveQuestionId,
    setActiveTocItemId,
    setActiveRailItemId,
    pushHistory: pushEditorHistory,
    clearTransientEditorState: clearEditorTransientState,
    closeNewDocumentDialog: () => setNewTestDialogOpen(false),
    closeFileManager: () => setFileManagerOpen(false),
    queueDocumentJump,
  });

  const {
    writeEditorDocumentToProjectFile,
    writeCurrentTestProjectFile,
    saveCurrentProjectFileBeforeOpening,
    saveCurrentTestToProjectFile,
    saveCurrentTest,
    startNewTest,
    closeCurrentDocument,
    openProjectFile,
    syncActiveProjectFileFromDisk,
    reloadActiveProjectFileFromDisk,
    saveActiveFileRecoveryCopy,
  } = useDocumentSessionController<EditorDocumentState, SavedTest, AutosavedEditorSnapshot>({
    storageHydrated,
    activeProject,
    projectFiles,
    activeProjectFilePath,
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    editorDocumentOpenRef,
    lastProjectSaveFingerprintRef,
    fileOperationBusy,
    hasUnsavedProjectChanges,
    hasUnsavedDraftChanges,
    currentProjectFileName,
    draftAutosaveStatus,
    revisionMissingErrorMessage: PROJECT_FILE_REVISION_MISSING_ERROR,
    activeFileSyncIntervalMs: ACTIVE_PROJECT_FILE_SYNC_INTERVAL_MS,
    currentDocument: currentEditorDocument,
    createClosedSnapshot: () => ({
      ...currentDraftSnapshotForStorage(),
      activeProjectFilePath: undefined,
      activeProjectFileRevision: undefined,
      documentOpen: false,
    }),
    persistLocalDraft: persistCurrentDraft,
    saveDiskAutosave: (snapshot) => saveStorageAutosave<AutosavedEditorSnapshot>(snapshot).then((response) => response.autosave),
    defaultProjectFileName: () =>
      activeProjectFilePath && testPathFromProjectPath(activeProjectFilePath)
        ? testFileDisplayName(testPathBasename(testPathFromProjectPath(activeProjectFilePath) ?? ""))
        : defaultSavedTestName(frontMatter),
    serializeProjectDocument: ({ filePath, testName, document }) => {
      const nextFormattingConfig = normalizeFormattingConfig(document.formattingConfig);
      const currentLogo = selectedLogoForFrontMatter(logosRef.current, document.frontMatter);
      const savedTest = createSavedTestSnapshot({
        testId: `project-file:${filePath}`,
        name: testName,
        frontMatter: document.frontMatter,
        questions: document.questions,
        sectionHeadings: document.sectionHeadings,
        documentFlow: document.documentFlow,
        formattingConfig: nextFormattingConfig,
        logo: currentLogo,
      });
      return {
        content: JSON.stringify(savedTest, null, 2),
        fileType: projectFileTypeForFrontMatter(document.frontMatter),
        fingerprint: editorDocumentFingerprint(
          document.frontMatter,
          document.questions,
          nextFormattingConfig,
          currentLogo,
          document.sectionHeadings,
          document.documentFlow,
        ),
      };
    },
    parseSavedDocument: (content) => {
      const parsed = content ? (JSON.parse(content) as unknown) : null;
      return normalizeSavedTest(parsed);
    },
    applySavedProjectDocument,
    currentEditorDocumentFingerprint,
    projectFileConflictFromError,
    missingProjectRevisionConflict,
    setActiveProject,
    setProjectFiles,
    setActiveProjectFileState,
    clearActiveProjectFileState,
    setProjectSaveConflict,
    updateLastProjectSaveFingerprint,
    setEditorDocumentOpenState,
    setNewTestDialogOpen,
    setFileManagerOpen,
    closeContextMenu,
    setDraftAutosaveStatus,
    setDraftAutosaveMessage,
    setProjectFilesStatus,
    setProjectFilesMessage,
    refreshProjectFiles,
    dialogs: mauthDialogs,
    onOpened: () => setFileManagerOpen(false),
  });

  const { openDocumentsFolder, chooseDocumentsFolder, resetDocumentsFolder } = useDocumentsFolderController({
    activeProject,
    fileOperationBusy,
    saveCurrentProjectFileBeforeOpening,
    clearActiveProjectFile,
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
    setProjectSaveConflict,
    isProjectRevisionMissingError: (error) => error instanceof Error && error.message === PROJECT_FILE_REVISION_MISSING_ERROR,
  });

  const { saveConflictRecoveryCopy, reloadConflictFileFromDisk } = useProjectFileConflictController({
    conflict: activeProjectRevisionIssue,
    fileOperationBusy,
    currentProjectFileName,
    dialogs: mauthDialogs,
    saveRecoveryCopy: saveActiveFileRecoveryCopy,
    reloadFromDisk: reloadActiveProjectFileFromDisk,
  });

  function agentFileState(document: MauthDocumentLike<QuestionBlock, FrontMatterConfig, FormattingConfig>): MauthAgentFileState {
    const activePath = activeProjectFilePathRef.current;
    const activeRevision = activeProjectFileRevisionRef.current;
    const currentLogo = selectedLogoForFrontMatter(logosRef.current, document.frontMatter);
    const normalizedFormattingConfig = normalizeFormattingConfig(document.formattingConfig);
    const normalizedSectionHeadings = normalizeSectionHeadings(document.sectionHeadings);
    const normalizedDocumentFlow = normalizeDocumentFlow(document.documentFlow, document.questions, normalizedSectionHeadings);
    const documentFingerprint = editorDocumentFingerprint(
      document.frontMatter,
      document.questions,
      normalizedFormattingConfig,
      currentLogo,
      normalizedSectionHeadings,
      normalizedDocumentFlow,
    );
    return buildMauthAgentFileState({
      projectId: activeProject?.id ?? null,
      projectName: activeProject?.name ?? null,
      activePath,
      activeRevision,
      documentFingerprint,
      lastProjectSaveFingerprint: lastProjectSaveFingerprintRef.current,
      fileOperationBusy,
      hasRevisionIssue: Boolean(activeProjectRevisionIssue),
      autosaveStatus: draftAutosaveStatus,
      autosaveMessage: draftAutosaveMessage,
    });
  }

  useMauthAgentBridgeController<QuestionBlock, FrontMatterConfig, FormattingConfig>({
    enabled: storageHydrated,
    currentDocument: currentEditorDocument,
    fileState: agentFileState,
    validate: () => validateSolutionCompleteness(questionsRef.current, solutionValidationRuntime(frontMatterRef.current)),
    previewActions: previewEditorDocumentActions,
    applyActionsWithoutCommit: evaluateEditorDocumentActions,
    commitDocument: setEditorDocumentWithHistory,
    activeFilePath: () => activeProjectFilePathRef.current,
    saveAppliedDocument: (filePath, document) =>
      writeEditorDocumentToProjectFile(filePath, currentProjectFileName, document as EditorDocumentState),
    saveConflictMessage: (error, filePath) => {
      const conflict = projectFileConflictFromError(error, filePath, activeProjectFileRevisionRef.current);
      return conflict?.message || "Project file save failed; live editor state was not mutated.";
    },
  });

  function applySavedProjectDocument(project: ProjectSummary, filePath: string, savedTest: SavedTest, revision: number | null) {
    pushEditorHistory();
    const nextFrontMatter = cloneSerializable(savedTest.frontMatter);
    const nextQuestions = normalizeQuestionBlocks(savedTest.questions);
    const nextSectionHeadings = normalizeSectionHeadings(savedTest.sectionHeadings);
    const nextDocumentFlow = normalizeDocumentFlow(savedTest.documentFlow, nextQuestions, nextSectionHeadings);
    const nextFormattingConfig = normalizeFormattingConfig(savedTest.formattingConfig);
    setEditorDocument({
      frontMatter: nextFrontMatter,
      questions: nextQuestions,
      sectionHeadings: nextSectionHeadings,
      documentFlow: nextDocumentFlow,
      formattingConfig: nextFormattingConfig,
    });
    setEditorDocumentOpenState(true);
    setActiveQuestionId(firstQuestionId(nextQuestions));
    setActiveTocItemId(firstDocumentFlowAnchor(nextDocumentFlow, nextQuestions));
    setActiveRailItemId(firstDocumentFlowAnchor(nextDocumentFlow, nextQuestions));
    clearEditorTransientState();
    setActiveProject(project);
    setActiveProjectFileState(filePath, revision);
    setProjectSaveConflict(null);
    updateLastProjectSaveFingerprint(
      editorDocumentFingerprint(
        nextFrontMatter,
        nextQuestions,
        nextFormattingConfig,
        savedTest.logo ?? selectedLogoFromLibrary(logosRef.current, nextFrontMatter.logoId),
        nextSectionHeadings,
        nextDocumentFlow,
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

  const { loadProjectFileVersions, restoreProjectFileFromVersion } = useProjectVersionsController({
    activeProject,
    activeProjectFilePath,
    applyRestoredProjectDocument: (project, filePath, restoredDocument) => {
      const parsed = restoredDocument.content ? (JSON.parse(restoredDocument.content) as unknown) : null;
      const savedTest = normalizeSavedTest(parsed);
      if (!savedTest) throw new Error("Unsupported project file");
      applySavedProjectDocument(project, filePath, savedTest, restoredDocument.revision);
    },
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
  });

  const { createProjectFolder } = useProjectFolderController({
    activeProject,
    projectFiles,
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
    dialogs: mauthDialogs,
  });

  const { exportCurrentProjectBackup, importProjectBackupFile } = useProjectBackupController({
    activeProject,
    activeProjectFilePath,
    hasUnsavedProjectChanges,
    currentProjectFileName,
    writeCurrentTestProjectFile,
    saveCurrentTestToProjectFile,
    refreshLogoLibraryFromDisk,
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
    dialogs: mauthDialogs,
  });

  const { duplicateProjectFiles, renameProjectFile, moveProjectFiles, removeProjectFiles } = useProjectFileOperationsController({
    activeProject,
    projectFiles,
    activeProjectFilePath,
    hasUnsavedProjectChanges,
    currentProjectFileName,
    writeCurrentTestProjectFile,
    duplicateActiveProjectFile: async (project, targetFilePath, targetTestPath) => {
      const currentLogo = selectedLogoForFrontMatter(logosRef.current, frontMatter);
      const savedTest = createSavedTestSnapshot({
        testId: `project-file:${targetFilePath}`,
        name: testFileDisplayName(testPathBasename(targetTestPath)),
        frontMatter,
        questions,
        sectionHeadings,
        documentFlow,
        formattingConfig,
        logo: currentLogo,
      });
      const duplicatedDocument = await saveProjectFile(project.id, targetFilePath, {
        content: JSON.stringify(savedTest, null, 2),
        kind: "file",
        fileType: "test",
        metadata: {
          format: "saved-test-json",
          source: "mauth-studio",
        },
      });
      return {
        revision: duplicatedDocument.revision,
        fingerprint: editorDocumentFingerprint(frontMatter, questions, formattingConfig, currentLogo, sectionHeadings, documentFlow),
      };
    },
    setActiveProjectFileState,
    setActiveProject,
    setProjectFiles,
    setProjectFilesStatus,
    setProjectFilesMessage,
    setProjectSaveConflict,
    updateLastProjectSaveFingerprint,
    dialogs: mauthDialogs,
  });

  function updateContentBlock(questionId: string, blockId: string, patch: Partial<EditorContentBlock>) {
    applyEditorAction({
      type: "module.update",
      scope: { kind: "question", questionId },
      blockId,
      patch: patch as Record<string, unknown>,
    });
  }

  function updatePart(questionId: string, partId: string, patch: Partial<EditorPart>) {
    applyEditorAction({
      type: "part.update",
      questionId,
      partId,
      patch: patch as Record<string, unknown>,
    });
  }

  function updatePartContentBlock(questionId: string, partId: string, blockId: string, patch: Partial<EditorContentBlock>) {
    applyEditorAction({
      type: "module.update",
      scope: { kind: "part", questionId, partId },
      blockId,
      patch: patch as Record<string, unknown>,
    });
  }

  function updateSubpart(questionId: string, partId: string, subpartId: string, patch: Partial<EditorSubpart>) {
    applyEditorAction({
      type: "subpart.update",
      questionId,
      partId,
      subpartId,
      patch: patch as Record<string, unknown>,
    });
  }

  function updateSubpartContentBlock(
    questionId: string,
    partId: string,
    subpartId: string,
    blockId: string,
    patch: Partial<EditorContentBlock>,
  ) {
    applyEditorAction({
      type: "module.update",
      scope: { kind: "subpart", questionId, partId, subpartId },
      blockId,
      patch: patch as Record<string, unknown>,
    });
  }

  function updateSelectedBlock(selection: SelectedEditorBlock, patch: Partial<EditorContentBlock>) {
    const scope = selection.scope.kind === "column" ? selection.scope.rootScope : selection.scope;
    applyEditorAction({
      type: "module.update",
      scope,
      blockId: selection.block.id,
      patch: patch as Record<string, unknown>,
    });
  }

  function updatePreviewGraphConfig(change: PreviewGraphConfigChange) {
    if (change.partId && change.subpartId) {
      updateSubpartContentBlock(change.questionId, change.partId, change.subpartId, change.blockId, { graphConfig: change.graphConfig });
      return;
    }

    if (change.partId) {
      updatePartContentBlock(change.questionId, change.partId, change.blockId, { graphConfig: change.graphConfig });
      return;
    }

    updateContentBlock(change.questionId, change.blockId, { graphConfig: change.graphConfig });
  }

  const handlePreviewGraphConfigChange = useStableEvent(updatePreviewGraphConfig);

  function selectQuestionInEditor(questionId: string) {
    if (!questionId) return;
    setActiveQuestionId(questionId);
  }

  function activateEditorAnchor(anchor: string) {
    const questionId = questionIdFromScrollAnchor(anchor);
    if (questionId) selectQuestionInEditor(questionId);
    setActiveTocItemId(anchor);
    setActiveRailItemId(anchor);
    const graphChildParentAnchor = graphChildParentScrollAnchor(anchor);
    if (graphChildParentAnchor && showPreview) queuePreviewJump(previewAnchorForEditorAnchor(anchor, documentTocItems));
  }

  function revealEditorAnchor(anchor: string) {
    const questionId = questionIdFromScrollAnchor(anchor);
    if (questionId) {
      selectQuestionInEditor(questionId);
    }

    setEditorRevealRequest((current) => ({
      anchor,
      sequence: (current?.sequence ?? 0) + 1,
    }));
  }

  const {
    solutionValidation,
    solutionValidationOpen,
    setSolutionValidationOpen,
    jumpToSolutionValidationIssue,
    applySolutionValidationFix,
  } = useSolutionValidationController<QuestionBlock, EditorPart, EditorSubpart, EditorContentBlock, FrontMatterConfig>({
    frontMatter,
    questions,
    validationRuntime: solutionValidationRuntime,
    parseAnchor: parseScrollAnchor,
    applyActions: applyEditorActions,
    showSolutions: () => setShowSolutions(true),
    ensureEditorVisible: () => {
      if (!showEditor) setPaneMode("split");
    },
    activateEditorAnchor,
    revealEditorAnchor,
    queueDocumentJump,
    buildSolutionSlotBlocks: solutionSlotBlocks,
    buildSolutionTextBlock: solutionTextBlock,
    buildStudentSpaceBlock: studentSpaceBlock,
    spaceLines,
  });

  const { addQuestionSolutionSlot, addPartSolutionSlot, addSubpartSolutionSlot } = useSolutionSlotController<
    QuestionBlock,
    EditorPart,
    EditorSubpart,
    EditorContentBlock
  >({
    questions,
    dialogs: mauthDialogs,
    isEnabled: () => frontMatterRef.current.titlePageTemplate !== "notes",
    defaultLinesForMarks: (marks) => defaultSolutionSlotLinesForDocument(frontMatterRef.current, marks),
    normalizeLines: spaceLines,
    buildSolutionSlotBlocks: solutionSlotBlocks,
    applyAction: applyEditorAction,
    showSolutions: () => setShowSolutions(true),
  });

  function openSignalForAnchor(anchor: string) {
    return scrollAnchorContains(anchor, editorRevealRequest?.anchor) ? editorRevealRequest?.sequence : undefined;
  }

  function isActiveEditorAnchor(anchor: string) {
    return anchor === activeTocItemId;
  }

  function selectContextAnchor(anchor: string, options: { openEditor?: boolean; openInspector?: boolean; previewOnly?: boolean } = {}) {
    const item = contextDescriptorForAnchor(anchor);
    const editorAnchor = item.editorAnchor;
    const previewAnchor = item.previewAnchor;
    const activeAnchor = item.id;
    const questionId = questionIdFromScrollAnchor(editorAnchor);
    if (questionId) selectQuestionInEditor(questionId);
    setActiveTocItemId(activeAnchor);
    setActiveRailItemId(activeAnchor);

    if (options.openInspector) setInspectorOpen(true);
    if (options.openEditor && !showEditor) {
      setPaneMode("split");
    }

    revealEditorAnchor(editorAnchor);
    if (options.previewOnly) {
      queuePreviewJump(previewAnchor);
    } else {
      queueDocumentJump(editorAnchor, previewAnchor, { preservePaneMode: !options.openEditor });
    }
  }

  const { createSolutionCopyForSelectedBlock } = useSolutionSurfaceCopyController({
    questions,
    showEditor,
    applyAction: applyEditorAction,
    applyActions: applyEditorActions,
    showSolutions: () => setShowSolutions(true),
    selectContextAnchor,
    solutionSurfaceContentBlock,
    solutionSurfaceColumnBlockCopyAtPath,
  });

  function copyAnchorReference(anchor: string) {
    const reference = contextReferenceText(anchor);
    void navigator.clipboard?.writeText(reference).catch(() => undefined);
  }

  function rootBlockContextFromParsed(parsed: ParsedScrollAnchor) {
    const blockId = parsed.kind === "columnBlock" ? parsed.rootBlockId : parsed.blockId;
    if (!parsed.questionId || !blockId) return null;
    const question = questions.find((current) => current.id === parsed.questionId);
    if (!question) return null;

    if (parsed.partId && parsed.subpartId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
      const block = subpart?.contentBlocks.find((current) => current.id === blockId);
      return {
        block,
        scope: {
          kind: "subpart",
          questionId: parsed.questionId,
          partId: parsed.partId,
          subpartId: parsed.subpartId,
        } satisfies MauthContentScope,
        anchorForBlock: (nextBlockId: string) =>
          subpartBlockScrollAnchor(parsed.questionId ?? "", parsed.partId ?? "", parsed.subpartId ?? "", nextBlockId),
      };
    }

    if (parsed.partId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const block = part?.contentBlocks.find((current) => current.id === blockId);
      return {
        block,
        scope: { kind: "part", questionId: parsed.questionId, partId: parsed.partId } satisfies MauthContentScope,
        anchorForBlock: (nextBlockId: string) => partBlockScrollAnchor(parsed.questionId ?? "", parsed.partId ?? "", nextBlockId),
      };
    }

    const block = question.contentBlocks.find((current) => current.id === blockId);
    return {
      block,
      scope: { kind: "question", questionId: parsed.questionId } satisfies MauthContentScope,
      anchorForBlock: (nextBlockId: string) => questionBlockScrollAnchor(parsed.questionId ?? "", nextBlockId),
    };
  }

  function blockContextFromParsed(parsed: ParsedScrollAnchor) {
    if (!parsed.questionId || !parsed.blockId) return null;
    if (parsed.kind !== "questionBlock" && parsed.kind !== "partBlock" && parsed.kind !== "subpartBlock") return null;
    return rootBlockContextFromParsed(parsed);
  }

  function columnBlockContextFromParsed(parsed: ParsedScrollAnchor) {
    if (parsed.kind !== "columnBlock" || !parsed.columnPath?.length) return null;
    const rootContext = rootBlockContextFromParsed(parsed);
    if (!rootContext?.block || rootContext.block.kind !== "columns") return null;
    const block = columnBlockAtPath(rootContext.block, parsed.columnPath);
    if (!block) return null;
    return {
      ...rootContext,
      block,
      rootBlock: rootContext.block,
      rootAnchor: rootContext.anchorForBlock(rootContext.block.id),
    };
  }

  function duplicateColumnBlockTarget(parsed: ParsedScrollAnchor) {
    const context = columnBlockContextFromParsed(parsed);
    if (!context || context.rootBlock.kind !== "columns" || !parsed.columnPath?.length) return false;
    const duplicated = duplicateColumnBlockAtPath(context.rootBlock, parsed.columnPath);
    if (!duplicated) return false;
    const result = applyEditorAction({
      type: "module.update",
      scope: context.scope,
      blockId: context.rootBlock.id,
      patch: { columnCount: duplicated.rootBlock.columnCount, columns: duplicated.rootBlock.columns },
    });
    if (!result.ok) return false;
    selectContextAnchor(columnPathScrollAnchor(context.rootAnchor, duplicated.duplicatedPath), { openEditor: showEditor });
    return true;
  }

  function duplicateAnchorTarget(anchor: string) {
    const parsed = parseScrollAnchor(anchor);
    if (!parsed.questionId) return false;
    const question = questions.find((current) => current.id === parsed.questionId);
    if (!question) return false;

    if (parsed.kind === "question") {
      const nextQuestion = duplicatedQuestion(question);
      const result = applyEditorAction({ type: "question.add", question: nextQuestion, afterQuestionId: question.id });
      if (!result.ok) return false;
      const nextAnchor = questionScrollAnchor(nextQuestion.id);
      selectContextAnchor(nextAnchor, { openEditor: showEditor });
      return true;
    }

    if (parsed.kind === "part" && parsed.partId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      if (!part) return false;
      const nextPart = duplicatedPart(part);
      const result = applyEditorAction({
        type: "part.add",
        questionId: question.id,
        part: nextPart,
        placement: { partId: part.id, position: "after" },
      });
      if (!result.ok) return false;
      selectContextAnchor(partScrollAnchor(question.id, nextPart.id), { openEditor: showEditor });
      return true;
    }

    if (parsed.kind === "subpart" && parsed.partId && parsed.subpartId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
      if (!part || !subpart) return false;
      const nextSubpart = duplicatedSubpart(subpart);
      const result = applyEditorAction({
        type: "subpart.add",
        questionId: question.id,
        partId: part.id,
        subpart: nextSubpart,
        placement: { subpartId: subpart.id, position: "after" },
      });
      if (!result.ok) return false;
      selectContextAnchor(subpartScrollAnchor(question.id, part.id, nextSubpart.id), { openEditor: showEditor });
      return true;
    }

    if (parsed.kind === "columnBlock") return duplicateColumnBlockTarget(parsed);

    const blockContext = blockContextFromParsed(parsed);
    if (!blockContext?.block || !parsed.blockId) return false;
    const nextBlock = duplicatedContentBlock(blockContext.block);
    const result = applyEditorAction({
      type: "module.add",
      scope: blockContext.scope,
      blocks: [nextBlock],
      placement: { blockId: parsed.blockId, position: "after" },
    });
    if (!result.ok) return false;
    selectContextAnchor(blockContext.anchorForBlock(nextBlock.id), { openEditor: showEditor });
    return true;
  }

  function subsectionTargetFromParsed(parsed: ParsedScrollAnchor): SubsectionDragTarget | null {
    if (!parsed.questionId) return null;
    if (parsed.kind === "questionBlock" && parsed.blockId) {
      return { kind: "question-block", questionId: parsed.questionId, id: parsed.blockId };
    }
    if (parsed.kind === "part" && parsed.partId) return { kind: "part", questionId: parsed.questionId, id: parsed.partId };
    if (parsed.kind === "partBlock" && parsed.partId && parsed.blockId) {
      return { kind: "part-block", questionId: parsed.questionId, partId: parsed.partId, id: parsed.blockId };
    }
    if (parsed.kind === "subpart" && parsed.partId && parsed.subpartId) {
      return { kind: "subpart", questionId: parsed.questionId, partId: parsed.partId, id: parsed.subpartId };
    }
    if (parsed.kind === "subpartBlock" && parsed.partId && parsed.subpartId && parsed.blockId) {
      return {
        kind: "subpart-block",
        questionId: parsed.questionId,
        partId: parsed.partId,
        subpartId: parsed.subpartId,
        id: parsed.blockId,
      };
    }
    return null;
  }

  function moveAnchorTarget(anchor: string, direction: MoveDirection) {
    const parsed = parseScrollAnchor(anchor);
    if (parsed.kind === "sectionHeading" && parsed.sectionHeadingId) {
      moveSectionHeadingByKeyboard(parsed.sectionHeadingId, direction);
      return true;
    }

    if (parsed.kind === "question" && parsed.questionId) {
      moveQuestionByKeyboard(parsed.questionId, direction);
      return true;
    }

    const target = subsectionTargetFromParsed(parsed);
    if (!target) return false;
    const container = subsectionSourceContainer(target);
    const activeItem = subsectionOrderItem(target);
    if (!activeItem) return false;
    const items = orderItemsForContainer(questions, container);
    const index = items.findIndex((item) => orderItemKey(item) === orderItemKey(activeItem));
    if (index < 0 || !items[index + direction]) return false;
    const beforeItem = direction < 0 ? items[index + direction] : items[index + 2];
    const intent: SubsectionDropIntent =
      container.kind === "subpart"
        ? { container, beforeBlockId: beforeItem?.kind === "block" ? beforeItem.id : undefined }
        : { container, beforeItem };
    const action = subsectionMoveAction(target, intent);
    if (!action) return false;
    const result = applyEditorAction(action);
    if (!result.ok) return false;
    selectContextAnchor(anchor, { openEditor: showEditor });
    return true;
  }

  function canMoveAnchorTarget(anchor: string, direction: MoveDirection) {
    const parsed = parseScrollAnchor(anchor);
    if (parsed.kind === "sectionHeading" && parsed.sectionHeadingId) {
      const flow = normalizeDocumentFlow(documentFlow, questions, sectionHeadings);
      const index = flow.findIndex((item) => item.kind === "sectionHeading" && item.id === parsed.sectionHeadingId);
      return index >= 0 && Boolean(flow[index + direction]);
    }
    if (parsed.kind === "question" && parsed.questionId) {
      const index = questions.findIndex((question) => question.id === parsed.questionId);
      return index >= 0 && Boolean(questions[index + direction]);
    }
    const target = subsectionTargetFromParsed(parsed);
    if (!target) return false;
    const activeItem = subsectionOrderItem(target);
    if (!activeItem) return false;
    const items = orderItemsForContainer(questions, subsectionSourceContainer(target));
    const index = items.findIndex((item) => orderItemKey(item) === orderItemKey(activeItem));
    return index >= 0 && Boolean(items[index + direction]);
  }

  function canDeleteAnchorTarget(anchor: string) {
    const parsed = parseScrollAnchor(anchor);
    return parsed.kind !== "frontMatter" && parsed.kind !== "unknown";
  }

  function canDuplicateAnchorTarget(anchor: string) {
    const parsed = parseScrollAnchor(anchor);
    if (parsed.kind === "sectionHeading") return false;
    if (parsed.kind === "columnBlock") return Boolean(columnBlockContextFromParsed(parsed)?.block);
    return (
      parsed.kind === "question" || parsed.kind === "part" || parsed.kind === "subpart" || Boolean(blockContextFromParsed(parsed)?.block)
    );
  }

  function contextActionsForAnchor(anchor: string): ContextMenuAction[] {
    const item = contextDescriptorForAnchor(anchor);
    const actions: ContextMenuAction[] = [
      {
        id: "copy-reference",
        label: "Copy agent reference",
        icon: <Copy className="size-4" aria-hidden="true" />,
        onSelect: () => copyAnchorReference(item.editorAnchor),
      },
    ];
    if (canMoveAnchorTarget(item.editorAnchor, -1)) {
      actions.push({
        id: "move-up",
        label: "Move up",
        icon: <ArrowUp className="size-4" aria-hidden="true" />,
        onSelect: () => moveAnchorTarget(item.editorAnchor, -1),
      });
    }
    if (canMoveAnchorTarget(item.editorAnchor, 1)) {
      actions.push({
        id: "move-down",
        label: "Move down",
        icon: <ArrowDown className="size-4" aria-hidden="true" />,
        onSelect: () => moveAnchorTarget(item.editorAnchor, 1),
      });
    }
    if (canDuplicateAnchorTarget(item.editorAnchor)) {
      actions.push({
        id: "duplicate",
        label: "Duplicate",
        icon: <CopyPlus className="size-4" aria-hidden="true" />,
        onSelect: () => duplicateAnchorTarget(item.editorAnchor),
      });
    }
    if (canDeleteAnchorTarget(item.editorAnchor)) {
      actions.push({
        id: "delete",
        label: "Delete",
        icon: <Trash2 className="size-4" aria-hidden="true" />,
        destructive: true,
        onSelect: () => deleteEditorSelection(item.editorAnchor),
      });
    }
    return actions;
  }

  function reorderQuestion(draggedId: string, targetId: string, placement: Exclude<DropPlacement, "inside">) {
    if (draggedId === targetId) return;
    applyEditorAction({ type: "question.reorder", questionId: draggedId, targetQuestionId: targetId, placement });
  }

  function isQuestionDropNoop(draggedId: string, targetId: string, placement: Exclude<DropPlacement, "inside">) {
    if (draggedId === targetId) return true;
    const draggedIndex = questions.findIndex((question) => question.id === draggedId);
    const targetIndex = questions.findIndex((question) => question.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return true;
    return (placement === "before" && targetIndex === draggedIndex + 1) || (placement === "after" && targetIndex === draggedIndex - 1);
  }

  function moveQuestionByKeyboard(questionId: string, direction: MoveDirection) {
    const sourceIndex = questions.findIndex((question) => question.id === questionId);
    const targetQuestion = questions[sourceIndex + direction];
    if (sourceIndex === -1 || !targetQuestion) return;

    const anchor = questionScrollAnchor(questionId);
    reorderQuestion(questionId, targetQuestion.id, direction < 0 ? "before" : "after");
    selectQuestionInEditor(questionId);
    setActiveTocItemId(anchor);
    setActiveRailItemId(anchor);
    queueDocumentJump(anchor, anchor, { preservePaneMode: true });
  }

  function pageBreakDropBoundaryQuestionId(targetQuestionId: string, placement: Exclude<DropPlacement, "inside">) {
    if (placement === "after") return targetQuestionId;
    const targetIndex = questions.findIndex((question) => question.id === targetQuestionId);
    if (targetIndex <= 0) return "";
    return questions[targetIndex - 1]?.id ?? "";
  }

  function movePageBreakAfterQuestion(sourceQuestionId: string, targetQuestionId: string) {
    if (!sourceQuestionId || !targetQuestionId || sourceQuestionId === targetQuestionId) return;
    setQuestionsWithHistory((current) =>
      current.map((question) => {
        if (question.id !== sourceQuestionId && question.id !== targetQuestionId) return question;
        const contentBlocks = question.contentBlocks.filter((block) => block.kind !== "pageBreak");
        if (question.id === sourceQuestionId) return { ...question, pageBreakAfter: false, contentBlocks };
        return { ...question, pageBreakAfter: true, contentBlocks };
      }),
    );
  }

  function movePageBreakByKeyboard(questionId: string, direction: MoveDirection) {
    if (!pageBreakQuestionIds.has(questionId)) return;
    const sourceIndex = questions.findIndex((question) => question.id === questionId);
    const targetQuestion = questions[sourceIndex + direction];
    if (sourceIndex === -1 || !targetQuestion || pageBreakQuestionIds.has(targetQuestion.id)) return;

    const anchor = pageBreakScrollAnchor(targetQuestion.id);
    movePageBreakAfterQuestion(questionId, targetQuestion.id);
    setActiveRailItemId(anchor);
    clearPendingDocumentJumps();
  }

  function mauthTargetFromEditorPageBreak(target: EditorPageBreakTarget): Extract<MauthAction, { type: "pageBreak.set" }>["target"] {
    if (target.kind === "part") {
      return { kind: "part", questionId: target.questionId, partId: target.partId };
    }
    return { kind: "subpart", questionId: target.questionId, partId: target.partId, subpartId: target.subpartId };
  }

  function setEditorPageBreak(target: EditorPageBreakTarget, enabled: boolean) {
    applyEditorAction({ type: "pageBreak.set", target: mauthTargetFromEditorPageBreak(target), enabled });
  }

  function editorPageBreakDestinationHasBreak(target: EditorPageBreakTarget) {
    const question = questionsRef.current.find((current) => current.id === target.questionId);
    if (!question) return false;
    if (target.kind === "part") {
      return question.parts.find((part) => part.id === target.partId)?.pageBreakBefore === true;
    }
    return (
      question.parts.find((part) => part.id === target.partId)?.subparts.find((subpart) => subpart.id === target.subpartId)
        ?.pageBreakBefore === true
    );
  }

  function editorPageBreakCanMoveTo(source: EditorPageBreakTarget, destination: EditorPageBreakTarget | null | undefined) {
    return Boolean(
      destination && editorPageBreakKey(source) !== editorPageBreakKey(destination) && !editorPageBreakDestinationHasBreak(destination),
    );
  }

  function moveEditorPageBreak(source: EditorPageBreakTarget, destination: EditorPageBreakTarget) {
    if (editorPageBreakKey(source) === editorPageBreakKey(destination)) return;
    if (editorPageBreakDestinationHasBreak(destination)) return;
    applyEditorActions([
      { type: "pageBreak.set", target: mauthTargetFromEditorPageBreak(source), enabled: false },
      { type: "pageBreak.set", target: mauthTargetFromEditorPageBreak(destination), enabled: true },
    ]);
  }

  function orderedPartTargets(question: QuestionBlock): Extract<EditorPageBreakTarget, { kind: "part" }>[] {
    return orderedQuestionItems(question)
      .filter((item): item is Extract<OrderedQuestionItem, { kind: "part" }> => item.kind === "part")
      .map((item) => ({ kind: "part" as const, questionId: question.id, partId: item.part.id }));
  }

  function orderedSubpartTargets(questionId: string, part: EditorPart): Extract<EditorPageBreakTarget, { kind: "subpart" }>[] {
    return orderedPartItems(part)
      .filter((item): item is Extract<OrderedPartItem, { kind: "subpart" }> => item.kind === "subpart")
      .map((item) => ({ kind: "subpart" as const, questionId, partId: part.id, subpartId: item.subpart.id }));
  }

  function editorPageBreakDestinationAfter(
    targets: EditorPageBreakTarget[],
    target: EditorPageBreakTarget,
    placement: Exclude<DropPlacement, "inside">,
  ) {
    if (placement === "before") return target;
    const index = targets.findIndex((current) => editorPageBreakKey(current) === editorPageBreakKey(target));
    return index >= 0 ? targets[index + 1] : undefined;
  }

  function editorPageBreakDestinationForTarget(
    source: EditorPageBreakTarget,
    target: SubsectionDragTarget,
    placement: Exclude<DropPlacement, "inside">,
  ): EditorPageBreakTarget | null {
    if (source.kind === "part" && target.kind === "part" && source.questionId === target.questionId) {
      const question = questionsRef.current.find((current) => current.id === target.questionId);
      if (!question) return null;
      return (
        editorPageBreakDestinationAfter(
          orderedPartTargets(question),
          { kind: "part", questionId: target.questionId, partId: target.id },
          placement,
        ) ?? null
      );
    }

    if (
      source.kind === "subpart" &&
      target.kind === "subpart" &&
      source.questionId === target.questionId &&
      source.partId === target.partId
    ) {
      const part = findPartInQuestions(questionsRef.current, target.questionId, target.partId);
      if (!part) return null;
      return (
        editorPageBreakDestinationAfter(
          orderedSubpartTargets(target.questionId, part),
          { kind: "subpart", questionId: target.questionId, partId: target.partId, subpartId: target.id },
          placement,
        ) ?? null
      );
    }

    return null;
  }

  function editorPageBreakDestinationForOrderItem(
    source: EditorPageBreakTarget,
    container: SubsectionContainerRef,
    beforeItem: ContainerOrderItem,
  ): EditorPageBreakTarget | null {
    if (source.kind === "part" && container.kind === "question" && beforeItem.kind === "part") {
      if (source.questionId !== container.questionId) return null;
      return { kind: "part", questionId: container.questionId, partId: beforeItem.id };
    }

    if (source.kind === "subpart" && container.kind === "part" && beforeItem.kind === "subpart") {
      if (source.questionId !== container.questionId || source.partId !== container.partId) return null;
      return { kind: "subpart", questionId: container.questionId, partId: container.partId, subpartId: beforeItem.id };
    }

    return null;
  }

  function editorPageBreakDestinationForContainer(
    source: EditorPageBreakTarget,
    container: SubsectionContainerRef,
    placement: "start" | "end",
  ): EditorPageBreakTarget | null {
    if (placement !== "start") return null;
    const firstItem = firstOrderItemInContainer(questionsRef.current, container);
    return firstItem ? editorPageBreakDestinationForOrderItem(source, container, firstItem) : null;
  }

  function moveEditorPageBreakByKeyboard(target: EditorPageBreakTarget, direction: MoveDirection) {
    const question = questionsRef.current.find((current) => current.id === target.questionId);
    if (!question) return;
    const targets =
      target.kind === "part"
        ? orderedPartTargets(question)
        : (() => {
            const part = question.parts.find((current) => current.id === target.partId);
            return part ? orderedSubpartTargets(question.id, part) : [];
          })();
    const sourceIndex = targets.findIndex((current) => editorPageBreakKey(current) === editorPageBreakKey(target));
    const destination = sourceIndex >= 0 ? targets[sourceIndex + direction] : undefined;
    if (destination) moveEditorPageBreak(target, destination);
  }

  function readEditorPageBreakDrag(event: DragEvent<HTMLElement>) {
    return (
      draggedEditorPageBreak ??
      parseEditorPageBreakDrag(event.dataTransfer.getData(EDITOR_PAGE_BREAK_DRAG_MIME)) ??
      parseEditorPageBreakDrag(event.dataTransfer.getData("text/plain"))
    );
  }

  function handleEditorPageBreakDragStart(event: DragEvent<HTMLElement>, target: EditorPageBreakTarget) {
    event.stopPropagation();
    const payload = serializeEditorPageBreakDrag(target);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX}${payload}`);
    try {
      event.dataTransfer.setData(EDITOR_PAGE_BREAK_DRAG_MIME, payload);
    } catch {
      // The prefixed text/plain payload above is the cross-browser fallback.
    }
    setModuleDragImage(event);
    setDraggedEditorPageBreak(target);
    setDragOverEditorPageBreak(null);
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedSubsection(null);
    setDragOverSubsection(null);
  }

  function handleEditorPageBreakDragOver(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const placement = dragPlacementFromEvent(event);
    const destination = editorPageBreakDestinationForTarget(source, target, placement);
    if (!destination || editorPageBreakKey(source) === editorPageBreakKey(destination) || editorPageBreakDestinationHasBreak(destination)) {
      setDragOverEditorPageBreak((current) => (current?.targetKey === editorPageBreakTargetKey(target) ? null : current));
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverEditorPageBreak({ targetKey: editorPageBreakTargetKey(target), placement, destination });
    return true;
  }

  function handleEditorPageBreakContainerDropZoneDragOver(
    event: DragEvent<HTMLElement>,
    container: SubsectionContainerRef,
    placement: "start" | "end",
  ) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const destination = editorPageBreakDestinationForContainer(source, container, placement);
    const targetKey = containerDropKey(container, placement);
    if (!destination || !editorPageBreakCanMoveTo(source, destination)) {
      setDragOverEditorPageBreak((current) => (current?.targetKey === targetKey ? null : current));
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverEditorPageBreak({ targetKey, placement: "before", destination });
    return true;
  }

  function handleEditorPageBreakContainerDropZoneDrop(
    event: DragEvent<HTMLElement>,
    container: SubsectionContainerRef,
    placement: "start" | "end",
  ) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const targetKey = containerDropKey(container, placement);
    const destination =
      dragOverEditorPageBreak?.targetKey === targetKey
        ? dragOverEditorPageBreak.destination
        : editorPageBreakDestinationForContainer(source, container, placement);
    event.preventDefault();
    event.stopPropagation();
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    if (destination && editorPageBreakCanMoveTo(source, destination)) moveEditorPageBreak(source, destination);
    return true;
  }

  function handleEditorPageBreakItemDropZoneDragOver(
    event: DragEvent<HTMLElement>,
    container: SubsectionContainerRef,
    beforeItem: ContainerOrderItem,
  ) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const destination = editorPageBreakDestinationForOrderItem(source, container, beforeItem);
    const targetKey = itemDropKey(container, beforeItem);
    if (!destination || !editorPageBreakCanMoveTo(source, destination)) {
      setDragOverEditorPageBreak((current) => (current?.targetKey === targetKey ? null : current));
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverEditorPageBreak({ targetKey, placement: "before", destination });
    return true;
  }

  function handleEditorPageBreakItemDropZoneDrop(
    event: DragEvent<HTMLElement>,
    container: SubsectionContainerRef,
    beforeItem: ContainerOrderItem,
  ) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const targetKey = itemDropKey(container, beforeItem);
    const destination =
      dragOverEditorPageBreak?.targetKey === targetKey
        ? dragOverEditorPageBreak.destination
        : editorPageBreakDestinationForOrderItem(source, container, beforeItem);
    event.preventDefault();
    event.stopPropagation();
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    if (destination && editorPageBreakCanMoveTo(source, destination)) moveEditorPageBreak(source, destination);
    return true;
  }

  function handleEditorPageBreakDragLeave(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverEditorPageBreak((current) => (current?.targetKey === editorPageBreakTargetKey(target) ? null : current));
  }

  function handleEditorPageBreakDrop(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const placement =
      dragOverEditorPageBreak?.targetKey === editorPageBreakTargetKey(target)
        ? dragOverEditorPageBreak.placement
        : dragPlacementFromEvent(event);
    const destination =
      dragOverEditorPageBreak?.targetKey === editorPageBreakTargetKey(target)
        ? dragOverEditorPageBreak.destination
        : editorPageBreakDestinationForTarget(source, target, placement);
    event.preventDefault();
    event.stopPropagation();
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    if (destination) moveEditorPageBreak(source, destination);
    return true;
  }

  function handleEditorPageBreakDragEnd() {
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
  }

  function setModuleDragImage(event: DragEvent<HTMLElement>) {
    const preview = event.currentTarget.closest("[data-drag-preview]");
    if (preview instanceof HTMLElement) {
      const rect = preview.getBoundingClientRect();
      try {
        event.dataTransfer.setDragImage(preview, Math.min(48, rect.width / 2), 28);
      } catch {
        // Some browsers reject element drag images in edge cases; the drag itself should still proceed.
      }
    }
  }

  function handleQuestionDragStart(event: DragEvent<HTMLElement>, questionId: string) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", questionId);
    setModuleDragImage(event);
    setDraggedQuestionId(questionId);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedSubsection(null);
    setDragOverSubsection(null);
  }

  function handleQuestionDragOver(event: DragEvent<HTMLElement>, questionId: string) {
    const activeSubsection = readSubsectionDrag(event);
    if (activeSubsection) return;
    if (readPageBreakDrag(event)) return;

    const activeQuestionId = draggedQuestionId || event.dataTransfer.getData("text/plain");
    const placement = dragPlacementFromEvent(event);
    if (!activeQuestionId || isQuestionDropNoop(activeQuestionId, questionId, placement)) {
      setDragOverQuestion((current) => (current?.questionId === questionId ? null : current));
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverQuestion({ questionId, placement, surface: "question" });
  }

  function handleQuestionDragLeave(event: DragEvent<HTMLElement>, questionId: string) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverQuestion((current) => (current?.questionId === questionId ? null : current));
  }

  function handleQuestionDrop(event: DragEvent<HTMLElement>, questionId: string) {
    const activeSubsection = readSubsectionDrag(event);
    if (activeSubsection) {
      return;
    }
    if (readPageBreakDrag(event)) return;

    event.preventDefault();
    const activeQuestionId = draggedQuestionId || event.dataTransfer.getData("text/plain");
    const placement = dragOverQuestion?.questionId === questionId ? dragOverQuestion.placement : dragPlacementFromEvent(event);
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    if (activeQuestionId && questions.some((question) => question.id === activeQuestionId)) {
      if (isQuestionDropNoop(activeQuestionId, questionId, placement)) return;
      const anchor = questionScrollAnchor(activeQuestionId);
      reorderQuestion(activeQuestionId, questionId, placement);
      selectQuestionInEditor(activeQuestionId);
      setActiveTocItemId(anchor);
      setActiveRailItemId(anchor);
      queueDocumentJump(anchor, anchor, { preservePaneMode: true });
    }
  }

  function handleQuestionDragOverPageBreak(event: DragEvent<HTMLElement>, questionId: string) {
    const activeSubsection = readSubsectionDrag(event);
    if (activeSubsection) return;
    if (readPageBreakDrag(event)) return;

    const activeQuestionId = draggedQuestionId || event.dataTransfer.getData("text/plain");
    if (!activeQuestionId || activeQuestionId === questionId || !questions.some((question) => question.id === activeQuestionId)) {
      setDragOverQuestion((current) => (current?.questionId === questionId && current.surface === "pageBreakBoundary" ? null : current));
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverQuestion({ questionId, placement: "after", surface: "pageBreakBoundary" });
  }

  function handleQuestionDragLeavePageBreak(event: DragEvent<HTMLElement>, questionId: string) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverQuestion((current) => (current?.questionId === questionId && current.surface === "pageBreakBoundary" ? null : current));
  }

  function handleQuestionDropPageBreak(event: DragEvent<HTMLElement>, questionId: string) {
    const activeSubsection = readSubsectionDrag(event);
    if (activeSubsection) return;
    if (readPageBreakDrag(event)) return;

    const activeQuestionId = draggedQuestionId || event.dataTransfer.getData("text/plain");
    if (!activeQuestionId || activeQuestionId === questionId || !questions.some((question) => question.id === activeQuestionId)) return;
    event.preventDefault();
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    const anchor = questionScrollAnchor(activeQuestionId);
    reorderQuestion(activeQuestionId, questionId, "after");
    movePageBreakAfterQuestion(questionId, activeQuestionId);
    selectQuestionInEditor(activeQuestionId);
    setActiveTocItemId(anchor);
    setActiveRailItemId(anchor);
    queueDocumentJump(anchor, anchor, { preservePaneMode: true });
  }

  function handleQuestionDragEnd() {
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
  }

  function handlePageBreakDragStart(event: DragEvent<HTMLElement>, questionId: string) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${PAGE_BREAK_DRAG_TEXT_PREFIX}${questionId}`);
    try {
      event.dataTransfer.setData(PAGE_BREAK_DRAG_MIME, questionId);
    } catch {
      // The prefixed text/plain payload above is the cross-browser fallback.
    }
    setModuleDragImage(event);
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDraggedPageBreakQuestionId(questionId);
    setDragOverPageBreak(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
  }

  function handlePageBreakDragOver(event: DragEvent<HTMLElement>, questionId: string) {
    const sourceQuestionId = readPageBreakDrag(event);
    if (!sourceQuestionId) return;
    const placement = dragPlacementFromEvent(event);
    const targetQuestionId = pageBreakDropBoundaryQuestionId(questionId, placement);
    if (!targetQuestionId || targetQuestionId === sourceQuestionId || pageBreakQuestionIds.has(targetQuestionId)) {
      setDragOverPageBreak((current) => (current?.questionId === questionId ? null : current));
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverPageBreak({ questionId, placement });
  }

  function handlePageBreakDragLeave(event: DragEvent<HTMLElement>, questionId: string) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverPageBreak((current) => (current?.questionId === questionId ? null : current));
  }

  function handlePageBreakDrop(event: DragEvent<HTMLElement>, questionId: string) {
    const sourceQuestionId = readPageBreakDrag(event);
    if (!sourceQuestionId) return;
    event.preventDefault();
    const placement = dragOverPageBreak?.questionId === questionId ? dragOverPageBreak.placement : dragPlacementFromEvent(event);
    const targetQuestionId = pageBreakDropBoundaryQuestionId(questionId, placement);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    if (!targetQuestionId || targetQuestionId === sourceQuestionId || pageBreakQuestionIds.has(targetQuestionId)) return;
    movePageBreakAfterQuestion(sourceQuestionId, targetQuestionId);
    const anchor = pageBreakScrollAnchor(targetQuestionId);
    setActiveRailItemId(anchor);
    clearPendingDocumentJumps();
  }

  function handlePageBreakDragEnd() {
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
  }

  function contentScopeFromContainer(container: SubsectionContainerRef): MauthContentScope | null {
    if (container.kind === "question") return { kind: "question", questionId: container.questionId };
    if (container.kind === "part" && container.partId) return { kind: "part", questionId: container.questionId, partId: container.partId };
    if (container.kind === "subpart" && container.partId && container.subpartId) {
      return { kind: "subpart", questionId: container.questionId, partId: container.partId, subpartId: container.subpartId };
    }
    return null;
  }

  function movePlacementFromIntent(intent: SubsectionDropIntent) {
    const beforeItem =
      intent.beforeItem ?? (intent.beforeBlockId ? ({ kind: "block", id: intent.beforeBlockId } satisfies ContainerOrderItem) : undefined);
    return beforeItem ? { item: beforeItem, position: "before" as const } : undefined;
  }

  function subsectionMoveAction(active: SubsectionDragTarget, intent: SubsectionDropIntent): MauthAction | null {
    const activeKind = subsectionItemKind(active);
    const sourceContainer = subsectionSourceContainer(active);
    const placement = movePlacementFromIntent(intent);

    if (activeKind === "block") {
      const fromScope = contentScopeFromContainer(sourceContainer);
      const toScope = contentScopeFromContainer(intent.container);
      if (!fromScope || !toScope) return null;
      return {
        type: "module.move",
        fromScope,
        toScope,
        blockId: active.id,
        ...(placement ? { placement } : {}),
      };
    }

    if (activeKind === "part" && sourceContainer.kind === "question" && intent.container.kind === "question") {
      return {
        type: "part.move",
        fromQuestionId: sourceContainer.questionId,
        toQuestionId: intent.container.questionId,
        partId: active.id,
        ...(placement ? { placement } : {}),
      };
    }

    if (
      activeKind === "subpart" &&
      sourceContainer.kind === "part" &&
      sourceContainer.partId &&
      intent.container.kind === "part" &&
      intent.container.partId
    ) {
      return {
        type: "subpart.move",
        from: { questionId: sourceContainer.questionId, partId: sourceContainer.partId },
        to: { questionId: intent.container.questionId, partId: intent.container.partId },
        subpartId: active.id,
        ...(placement ? { placement } : {}),
      };
    }

    return null;
  }

  function moveSubsection(active: SubsectionDragTarget, intent: SubsectionDropIntent) {
    const action = subsectionMoveAction(active, intent);
    if (action) applyEditorAction(action);
  }

  function readSubsectionDrag(event: DragEvent<HTMLElement>) {
    return (
      draggedSubsection ??
      parseSubsectionDrag(event.dataTransfer.getData(SUBSECTION_DRAG_MIME)) ??
      parseSubsectionDrag(event.dataTransfer.getData("text/plain"))
    );
  }

  function readPageBreakDrag(event: DragEvent<HTMLElement>) {
    return (
      draggedPageBreakQuestionId ||
      parsePageBreakDrag(event.dataTransfer.getData(PAGE_BREAK_DRAG_MIME), true) ||
      parsePageBreakDrag(event.dataTransfer.getData("text/plain"))
    );
  }

  function clearPointerSubsectionDrag() {
    pointerSubsectionDragRef.current?.cleanup();
  }

  function subsectionPointerDropPreview(clientX: number, clientY: number, active: SubsectionDragTarget): SubsectionDropPreview | null {
    const element = document.elementFromPoint(clientX, clientY);
    if (element instanceof Element) {
      const itemDropElement = element.closest("[data-subsection-item-drop]");
      if (itemDropElement instanceof HTMLElement) {
        const container = subsectionContainerFromDataset(itemDropElement.dataset);
        const beforeKind = itemDropElement.dataset.subsectionBeforeItemKind;
        const beforeId = itemDropElement.dataset.subsectionBeforeItemId;
        if (container && isContainerOrderItemKind(beforeKind) && beforeId) {
          const beforeItem: ContainerOrderItem = { kind: beforeKind, id: beforeId };
          const intent = dropIntentBeforeOrderItem(active, container, beforeItem, questionsRef.current);
          if (intent) return { targetKey: itemDropKey(container, beforeItem), placement: "before", intent };
        }
      }

      const containerDropElement = element.closest("[data-subsection-container-drop]");
      if (containerDropElement instanceof HTMLElement) {
        const container = subsectionContainerFromDataset(containerDropElement.dataset);
        const placement = containerDropElement.dataset.subsectionContainerPlacement === "start" ? "start" : "end";
        const intent = container ? dropIntentForContainer(active, container, questionsRef.current, placement) : null;
        if (container && intent) {
          return { targetKey: containerDropKey(container, placement), placement: "inside", intent };
        }
      }
    }

    const targetCandidate = subsectionTargetElementFromPoint(clientX, clientY);
    if (!targetCandidate) return null;
    const preview = subsectionDropPreviewForPointer(
      active,
      targetCandidate.target,
      targetCandidate.targetElement,
      targetCandidate.element,
      clientY,
      questionsRef.current,
    );
    return preview
      ? { targetKey: subsectionDropPreviewTargetKey(targetCandidate.target, preview), placement: preview.placement, intent: preview.intent }
      : null;
  }

  function scrollEditorPaneNearPointer(clientY: number) {
    const pane = editorPaneRef.current;
    if (!pane) return;
    const rect = pane.getBoundingClientRect();
    const edgeSize = 72;
    const maxStep = 18;
    const topDistance = clientY - rect.top;
    const bottomDistance = rect.bottom - clientY;
    if (topDistance >= 0 && topDistance < edgeSize) {
      pane.scrollTop -= Math.ceil(((edgeSize - topDistance) / edgeSize) * maxStep);
    } else if (bottomDistance >= 0 && bottomDistance < edgeSize) {
      pane.scrollTop += Math.ceil(((edgeSize - bottomDistance) / edgeSize) * maxStep);
    }
  }

  function beginPointerSubsectionDrag(session: PointerSubsectionDragSession) {
    if (session.active) return;
    session.active = true;
    setDraggedSubsection(session.target);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
  }

  function handleSubsectionPointerDown(event: ReactPointerEvent<HTMLElement>, target: SubsectionDragTarget) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    clearPointerSubsectionDrag();

    const handle = event.currentTarget;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      if (moveEvent.pointerId !== session.pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - session.startX, moveEvent.clientY - session.startY);
      if (!session.active && distance < 4) return;
      moveEvent.preventDefault();
      beginPointerSubsectionDrag(session);
      scrollEditorPaneNearPointer(moveEvent.clientY);
      const preview = subsectionPointerDropPreview(moveEvent.clientX, moveEvent.clientY, session.target);
      session.lastPreview = preview;
      setDragOverSubsection(preview);
    }

    function finishPointerDrag(finishEvent: globalThis.PointerEvent) {
      if (finishEvent.pointerId !== session.pointerId) return;
      finishEvent.preventDefault();
      finishEvent.stopPropagation();
      const preview = session.active
        ? (subsectionPointerDropPreview(finishEvent.clientX, finishEvent.clientY, session.target) ?? session.lastPreview)
        : null;
      session.cleanup();
      if (preview) moveSubsection(session.target, preview.intent);
    }

    const session: PointerSubsectionDragSession = {
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      lastPreview: null,
      handle,
      cleanup: () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishPointerDrag);
        window.removeEventListener("pointercancel", finishPointerDrag);
        document.body.style.userSelect = previousUserSelect;
        document.body.style.cursor = previousCursor;
        try {
          if (handle.hasPointerCapture(session.pointerId)) handle.releasePointerCapture(session.pointerId);
        } catch {
          // Pointer capture may already be released by the browser.
        }
        if (pointerSubsectionDragRef.current === session) pointerSubsectionDragRef.current = null;
        setDraggedSubsection(null);
        setDragOverSubsection(null);
      },
    };

    pointerSubsectionDragRef.current = session;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Window-level listeners below keep the drag usable even without capture.
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishPointerDrag, { passive: false });
    window.addEventListener("pointercancel", finishPointerDrag, { passive: false });
  }

  function handleSubsectionDragStart(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    event.stopPropagation();
    const payload = serializeSubsectionDrag(target);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${SUBSECTION_DRAG_TEXT_PREFIX}${payload}`);
    try {
      event.dataTransfer.setData(SUBSECTION_DRAG_MIME, payload);
    } catch {
      // The prefixed text/plain payload above is the cross-browser fallback.
    }
    setModuleDragImage(event);
    setDraggedSubsection(target);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
  }

  function handleSubsectionDragOver(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const active = readSubsectionDrag(event);
    const preview = active ? subsectionDropPreviewForEvent(active, target, event, questionsRef.current) : null;
    if (!active || !preview) {
      if (active) setDragOverSubsection(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverSubsection({
      targetKey: subsectionDropPreviewTargetKey(target, preview),
      placement: preview.placement,
      intent: preview.intent,
    });
  }

  function handleSubsectionDragLeave(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverSubsection((current) => (current?.targetKey === subsectionKey(target) ? null : current));
  }

  function handleSubsectionDrop(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const active = readSubsectionDrag(event);
    const preview = active ? subsectionDropPreviewForEvent(active, target, event, questionsRef.current) : null;
    const activePreview = preview
      ? dragOverSubsection?.targetKey === subsectionDropPreviewTargetKey(target, preview)
        ? dragOverSubsection
        : null
      : null;
    const intent = activePreview?.intent ?? preview?.intent ?? null;
    if (!active || !intent) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    moveSubsection(active, intent);
  }

  function handleSubsectionDragEnd() {
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
  }

  function handleContainerDropZoneDragOver(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, placement: "start" | "end") {
    if (handleEditorPageBreakContainerDropZoneDragOver(event, container, placement)) return;
    const active = readSubsectionDrag(event);
    const intent = active ? dropIntentForContainer(active, container, questionsRef.current, placement) : null;
    if (!active || !intent) {
      if (active) setDragOverSubsection(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverSubsection({
      targetKey: containerDropKey(container, placement),
      placement: "inside",
      intent,
    });
  }

  function handleContainerDropZoneDragLeave(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, placement: "start" | "end") {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    const targetKey = containerDropKey(container, placement);
    setDragOverSubsection((current) => (current?.targetKey === targetKey ? null : current));
    setDragOverEditorPageBreak((current) => (current?.targetKey === targetKey ? null : current));
  }

  function handleContainerDropZoneDrop(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, placement: "start" | "end") {
    if (handleEditorPageBreakContainerDropZoneDrop(event, container, placement)) return;
    const active = readSubsectionDrag(event);
    const targetKey = containerDropKey(container, placement);
    const currentIntent = active ? dropIntentForContainer(active, container, questionsRef.current, placement) : null;
    const intent = dragOverSubsection?.targetKey === targetKey && currentIntent ? dragOverSubsection.intent : currentIntent;
    if (!active || !intent) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    moveSubsection(active, intent);
  }

  function handleItemDropZoneDragOver(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, beforeItem: ContainerOrderItem) {
    if (handleEditorPageBreakItemDropZoneDragOver(event, container, beforeItem)) return;
    const active = readSubsectionDrag(event);
    const intent = active ? dropIntentBeforeOrderItem(active, container, beforeItem, questionsRef.current) : null;
    if (!active || !intent) {
      if (active) setDragOverSubsection(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverSubsection({
      targetKey: itemDropKey(container, beforeItem),
      placement: "before",
      intent,
    });
  }

  function handleItemDropZoneDragLeave(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, beforeItem: ContainerOrderItem) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    const targetKey = itemDropKey(container, beforeItem);
    setDragOverSubsection((current) => (current?.targetKey === targetKey ? null : current));
    setDragOverEditorPageBreak((current) => (current?.targetKey === targetKey ? null : current));
  }

  function handleItemDropZoneDrop(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, beforeItem: ContainerOrderItem) {
    if (handleEditorPageBreakItemDropZoneDrop(event, container, beforeItem)) return;
    const active = readSubsectionDrag(event);
    const targetKey = itemDropKey(container, beforeItem);
    const currentIntent = active ? dropIntentBeforeOrderItem(active, container, beforeItem, questionsRef.current) : null;
    const intent = dragOverSubsection?.targetKey === targetKey && currentIntent ? dragOverSubsection.intent : currentIntent;
    if (!active || !intent) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    moveSubsection(active, intent);
  }

  function subsectionDragClasses(target: SubsectionDragTarget) {
    const dropPlacement =
      dragOverSubsection?.targetKey === subsectionKey(target)
        ? dragOverSubsection.placement
        : dragOverEditorPageBreak?.targetKey === editorPageBreakTargetKey(target)
          ? dragOverEditorPageBreak.placement
          : null;
    return editorSubsectionDragClassName({
      isDragging: Boolean(draggedSubsection && subsectionKey(draggedSubsection) === subsectionKey(target)),
      dropPlacement,
    });
  }

  function containerDropZone(container: SubsectionContainerRef, placement: "start" | "end", visible = true) {
    const targetKey = containerDropKey(container, placement);
    const active = dragOverSubsection?.targetKey === targetKey || dragOverEditorPageBreak?.targetKey === targetKey;
    const subsectionCanDrop = Boolean(
      visible && draggedSubsection && dropIntentForContainer(draggedSubsection, container, questionsRef.current, placement),
    );
    const pageBreakCanDrop = Boolean(
      visible &&
      draggedEditorPageBreak &&
      editorPageBreakCanMoveTo(
        draggedEditorPageBreak,
        editorPageBreakDestinationForContainer(draggedEditorPageBreak, container, placement),
      ),
    );
    const canDrop = subsectionCanDrop || pageBreakCanDrop;
    if (!canDrop) return null;
    const label = editorSubsectionDropZoneLabel({
      pageBreakCanDrop,
      subsectionCanDrop,
      fallbackLabel: containerDropZoneLabel(container, placement),
    });
    return (
      <EditorSubsectionContainerDropZone
        key={targetKey}
        container={container}
        placement={placement}
        active={active}
        label={label}
        onDragOver={(event) => handleContainerDropZoneDragOver(event, container, placement)}
        onDragLeave={(event) => handleContainerDropZoneDragLeave(event, container, placement)}
        onDrop={(event) => handleContainerDropZoneDrop(event, container, placement)}
      />
    );
  }

  function itemDropZone(container: SubsectionContainerRef, beforeItem: ContainerOrderItem, visible = true) {
    const targetKey = itemDropKey(container, beforeItem);
    const active = dragOverSubsection?.targetKey === targetKey || dragOverEditorPageBreak?.targetKey === targetKey;
    const subsectionCanDrop = Boolean(
      visible && draggedSubsection && dropIntentBeforeOrderItem(draggedSubsection, container, beforeItem, questionsRef.current),
    );
    const pageBreakCanDrop = Boolean(
      visible &&
      draggedEditorPageBreak &&
      editorPageBreakCanMoveTo(
        draggedEditorPageBreak,
        editorPageBreakDestinationForOrderItem(draggedEditorPageBreak, container, beforeItem),
      ),
    );
    const canDrop = subsectionCanDrop || pageBreakCanDrop;
    if (!canDrop) return null;
    const label = editorSubsectionDropZoneLabel({
      pageBreakCanDrop,
      subsectionCanDrop,
      fallbackLabel: itemDropZoneLabel(beforeItem),
    });
    return (
      <EditorSubsectionItemDropZone
        key={targetKey}
        container={container}
        beforeItem={beforeItem}
        active={active}
        label={label}
        onDragOver={(event) => handleItemDropZoneDragOver(event, container, beforeItem)}
        onDragLeave={(event) => handleItemDropZoneDragLeave(event, container, beforeItem)}
        onDrop={(event) => handleItemDropZoneDrop(event, container, beforeItem)}
      />
    );
  }

  function subsectionDragHandle(target: SubsectionDragTarget, label: string) {
    return (
      <EditorSubsectionDragHandle
        target={target}
        label={label}
        onPointerDown={(event) => handleSubsectionPointerDown(event, target)}
        onDragStart={(event) => handleSubsectionDragStart(event, target)}
        onDragEnd={handleSubsectionDragEnd}
      />
    );
  }

  function addQuestion() {
    const question = frontMatterRef.current.titlePageTemplate === "notes" ? createNotesSection() : createQuestion();
    const anchor = questionScrollAnchor(question.id);
    const actions: MauthAction[] =
      frontMatterRef.current.titlePageTemplate === "exam" && questions.length
        ? [
            { type: "question.update", questionId: questions[questions.length - 1].id, patch: { pageBreakAfter: true } },
            { type: "question.add", question },
          ]
        : [{ type: "question.add", question }];
    const result = applyEditorActions(actions);
    if (!result.ok) return;
    selectQuestionInEditor(question.id);
    setActiveTocItemId(anchor);
    setActiveRailItemId(anchor);
    queueDocumentJump(anchor, anchor);
  }

  function addPageBreakAfterQuestion(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question || questionHasPageBreak(question)) return;
    const anchor = pageBreakScrollAnchor(question.id);
    applyEditorAction({ type: "pageBreak.set", target: { kind: "question", questionId: question.id }, enabled: true });
    setActiveRailItemId(anchor);
    clearPendingDocumentJumps();
  }

  function removePageBreakAfterQuestion(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const pageBreakAnchor = pageBreakScrollAnchor(question.id);
    const wasActivePageBreak = activeTocItemId === pageBreakAnchor;
    const wasActiveRailPageBreak = activeRailItemId === pageBreakAnchor;
    applyEditorAction({ type: "pageBreak.set", target: { kind: "question", questionId: question.id }, enabled: false });
    if (wasActiveRailPageBreak) {
      setActiveRailItemId(questionScrollAnchor(question.id));
    }
    if (wasActivePageBreak) {
      const anchor = questionScrollAnchor(question.id);
      selectQuestionInEditor(question.id);
      setActiveTocItemId(anchor);
      setActiveRailItemId(anchor);
      queueDocumentJump(anchor, anchor);
    }
  }

  function removeQuestion(questionId: string) {
    const removedIndex = questions.findIndex((question) => question.id === questionId);
    const fallbackQuestion =
      questions.length <= 1 ? (frontMatterRef.current.titlePageTemplate === "notes" ? createNotesSection() : createQuestion()) : undefined;
    const result = applyEditorAction({ type: "question.delete", questionId, fallbackQuestion });
    if (!result.ok) return;
    const nextQuestions = result.questions;
    const nextActiveQuestion =
      questionId === activeQuestionId
        ? (nextQuestions[Math.min(Math.max(removedIndex, 0), nextQuestions.length - 1)] ?? nextQuestions[0])
        : (nextQuestions.find((question) => question.id === activeQuestionId) ?? nextQuestions[0]);
    if (nextActiveQuestion) {
      const anchor = questionScrollAnchor(nextActiveQuestion.id);
      setActiveQuestionId(nextActiveQuestion.id);
      setActiveTocItemId(anchor);
      setActiveRailItemId(anchor);
    }
  }

  function addQuestionBlock(questionId: string, kind: ContentBlockKind, visibility = solutionInsertedBlockVisibilityForKind(kind)) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const block = contentBlockForKind(kind, visibility);
    const result = applyEditorAction({ type: "module.add", scope: { kind: "question", questionId: question.id }, blocks: [block] });
    if (result.ok) {
      const anchor = questionBlockScrollAnchor(question.id, block.id);
      activateEditorAnchor(anchor);
      revealEditorAnchor(anchor);
    }
  }

  function addQuestionDiagramBlock(questionId: string, type: string, visibility = solutionInsertedBlockVisibilityForKind("diagram")) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const block = diagramBlockForType(type, visibility);
    const result = applyEditorAction({ type: "module.add", scope: { kind: "question", questionId: question.id }, blocks: [block] });
    if (result.ok) {
      const anchor = questionBlockScrollAnchor(question.id, block.id);
      activateEditorAnchor(anchor);
      revealEditorAnchor(anchor);
    }
  }

  function removeQuestionBlock(questionId: string, blockId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    applyEditorAction({ type: "module.delete", scope: { kind: "question", questionId: question.id }, blockId });
  }

  function createPart(): EditorPart {
    return {
      id: id("part"),
      label: "",
      text: "",
      marks: 0,
      pageBreakBefore: false,
      contentBlocks: [],
      subparts: [],
      itemOrder: [],
    };
  }

  function addPart(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const part = createPart();
    applyEditorAction({ type: "part.add", questionId: question.id, part });
  }

  function firstInsertableEditorPageBreakTarget(targets: EditorPageBreakTarget[], preferredAfterIndex = -1) {
    const afterPreferred = preferredAfterIndex >= 0 ? targets.slice(preferredAfterIndex + 1) : [];
    return (
      afterPreferred.find((target) => !editorPageBreakDestinationHasBreak(target)) ??
      targets.find((target) => !editorPageBreakDestinationHasBreak(target))
    );
  }

  function partPageBreakInsertTarget(question: QuestionBlock) {
    const targets = orderedPartTargets(question);
    const active = parseScrollAnchor(activeTocItemId);
    const preferredAfterIndex =
      active.questionId === question.id && active.partId ? targets.findIndex((target) => target.partId === active.partId) : -1;
    const target = firstInsertableEditorPageBreakTarget(targets, preferredAfterIndex);
    return target?.kind === "part" ? target : null;
  }

  function subpartPageBreakInsertTarget(questionId: string, part: EditorPart) {
    const targets = orderedSubpartTargets(questionId, part);
    const active = parseScrollAnchor(activeTocItemId);
    const preferredAfterIndex =
      active.questionId === questionId && active.partId === part.id && active.subpartId
        ? targets.findIndex((target) => target.subpartId === active.subpartId)
        : -1;
    const target = firstInsertableEditorPageBreakTarget(targets, preferredAfterIndex);
    return target?.kind === "subpart" ? target : null;
  }

  function addPartPageBreak(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const target = partPageBreakInsertTarget(question);
    if (!target) return;
    setEditorPageBreak(target, true);
    revealEditorAnchor(partScrollAnchor(question.id, target.partId));
  }

  function removePart(questionId: string, partId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    applyEditorAction({ type: "part.delete", questionId: question.id, partId });
  }

  function createSubpart(subpartIndex: number): EditorSubpart {
    return {
      id: id("subpart"),
      label: romanLabel(subpartIndex),
      text: "",
      marks: 0,
      pageBreakBefore: false,
      contentBlocks: [],
    };
  }

  function addSubpart(questionId: string, part: EditorPart) {
    const subparts = part.subparts ?? [];
    const subpart = createSubpart(subparts.length);
    applyEditorAction({ type: "subpart.add", questionId, partId: part.id, subpart });
  }

  function addSubpartPageBreak(questionId: string, part: EditorPart) {
    const target = subpartPageBreakInsertTarget(questionId, part);
    if (!target) return;
    setEditorPageBreak(target, true);
    revealEditorAnchor(subpartScrollAnchor(questionId, part.id, target.subpartId));
  }

  function removeSubpart(questionId: string, part: EditorPart, subpartId: string) {
    applyEditorAction({ type: "subpart.delete", questionId, partId: part.id, subpartId });
  }

  function addPartBlock(
    questionId: string,
    part: EditorPart,
    kind: ContentBlockKind,
    visibility = solutionInsertedBlockVisibilityForKind(kind),
  ) {
    const block = contentBlockForKind(kind, visibility);
    const result = applyEditorAction({ type: "module.add", scope: { kind: "part", questionId, partId: part.id }, blocks: [block] });
    if (result.ok) {
      const anchor = partBlockScrollAnchor(questionId, part.id, block.id);
      activateEditorAnchor(anchor);
      revealEditorAnchor(anchor);
    }
  }

  function addPartDiagramBlock(
    questionId: string,
    part: EditorPart,
    type: string,
    visibility = solutionInsertedBlockVisibilityForKind("diagram"),
  ) {
    const block = diagramBlockForType(type, visibility);
    const result = applyEditorAction({ type: "module.add", scope: { kind: "part", questionId, partId: part.id }, blocks: [block] });
    if (result.ok) {
      const anchor = partBlockScrollAnchor(questionId, part.id, block.id);
      activateEditorAnchor(anchor);
      revealEditorAnchor(anchor);
    }
  }

  function removePartBlock(questionId: string, part: EditorPart, blockId: string) {
    applyEditorAction({ type: "module.delete", scope: { kind: "part", questionId, partId: part.id }, blockId });
  }

  function addSubpartBlock(
    questionId: string,
    part: EditorPart,
    subpart: EditorSubpart,
    kind: ContentBlockKind,
    visibility = solutionInsertedBlockVisibilityForKind(kind),
  ) {
    const block = contentBlockForKind(kind, visibility);
    const result = applyEditorAction({
      type: "module.add",
      scope: { kind: "subpart", questionId, partId: part.id, subpartId: subpart.id },
      blocks: [block],
    });
    if (result.ok) {
      const anchor = subpartBlockScrollAnchor(questionId, part.id, subpart.id, block.id);
      activateEditorAnchor(anchor);
      revealEditorAnchor(anchor);
    }
  }

  function addSubpartDiagramBlock(
    questionId: string,
    part: EditorPart,
    subpart: EditorSubpart,
    type: string,
    visibility = solutionInsertedBlockVisibilityForKind("diagram"),
  ) {
    const block = diagramBlockForType(type, visibility);
    const result = applyEditorAction({
      type: "module.add",
      scope: { kind: "subpart", questionId, partId: part.id, subpartId: subpart.id },
      blocks: [block],
    });
    if (result.ok) {
      const anchor = subpartBlockScrollAnchor(questionId, part.id, subpart.id, block.id);
      activateEditorAnchor(anchor);
      revealEditorAnchor(anchor);
    }
  }

  function removeSubpartBlock(questionId: string, part: EditorPart, subpart: EditorSubpart, blockId: string) {
    applyEditorAction({ type: "module.delete", scope: { kind: "subpart", questionId, partId: part.id, subpartId: subpart.id }, blockId });
  }

  function deleteEditorSelection(anchor: string) {
    const parsed = parseScrollAnchor(anchor);
    if (parsed.kind === "sectionHeading" && parsed.sectionHeadingId) {
      removeSectionHeading(parsed.sectionHeadingId);
      return true;
    }
    if (!parsed.questionId) return false;

    const question = questions.find((current) => current.id === parsed.questionId);
    if (!question) return false;

    if (parsed.kind === "pageBreak") {
      removePageBreakAfterQuestion(parsed.questionId);
      return true;
    }

    if (parsed.kind === "question") {
      removeQuestion(parsed.questionId);
      return true;
    }

    if (parsed.kind === "questionBlock" && parsed.blockId) {
      removeQuestionBlock(parsed.questionId, parsed.blockId);
      activateEditorAnchor(questionScrollAnchor(parsed.questionId));
      return true;
    }

    if (parsed.kind === "columnBlock" && parsed.blockId) {
      const scope = parsed.partId
        ? parsed.subpartId
          ? ({
              kind: "subpart",
              questionId: parsed.questionId,
              partId: parsed.partId,
              subpartId: parsed.subpartId,
            } satisfies MauthContentScope)
          : ({ kind: "part", questionId: parsed.questionId, partId: parsed.partId } satisfies MauthContentScope)
        : ({ kind: "question", questionId: parsed.questionId } satisfies MauthContentScope);
      const result = applyEditorAction({ type: "module.delete", scope, blockId: parsed.blockId });
      if (!result.ok) return false;
      activateEditorAnchor(columnBlockParentScrollAnchor(anchor));
      return true;
    }

    if (parsed.kind === "part" && parsed.partId) {
      removePart(parsed.questionId, parsed.partId);
      activateEditorAnchor(questionScrollAnchor(parsed.questionId));
      return true;
    }

    if (parsed.kind === "partBlock" && parsed.partId && parsed.blockId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      if (!part) return false;
      removePartBlock(parsed.questionId, part, parsed.blockId);
      activateEditorAnchor(partScrollAnchor(parsed.questionId, parsed.partId));
      return true;
    }

    if (parsed.kind === "subpart" && parsed.partId && parsed.subpartId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      if (!part) return false;
      removeSubpart(parsed.questionId, part, parsed.subpartId);
      activateEditorAnchor(partScrollAnchor(parsed.questionId, parsed.partId));
      return true;
    }

    if (parsed.kind === "subpartBlock" && parsed.partId && parsed.subpartId && parsed.blockId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
      if (!part || !subpart) return false;
      removeSubpartBlock(parsed.questionId, part, subpart, parsed.blockId);
      activateEditorAnchor(subpartScrollAnchor(parsed.questionId, parsed.partId, parsed.subpartId));
      return true;
    }

    return false;
  }

  useEditorGlobalDeleteController({
    enabled: true,
    fileManagerOpen,
    activeAnchor: activeRailItemId.startsWith("pb:") ? activeRailItemId : activeTocItemId,
    deleteSelection: deleteEditorSelection,
    isDeleteEvent: nativeKeyboardDeleteRequested,
    targetConsumesDelete: keyboardTargetConsumesGlobalDelete,
  });

  function renderQuestionContentBlock(
    question: QuestionBlock,
    block: EditorContentBlock,
    itemIndex: number,
    _itemCount: number,
    questionItems: OrderedQuestionItem[],
  ) {
    if (!isOrderedBlockVisible(questionItems, itemIndex, effectiveShowSolutions)) return null;

    const blockIndex = Math.max(
      0,
      question.contentBlocks.filter((current) => current.kind !== "pageBreak").findIndex((current) => current.id === block.id),
    );
    const blockTarget: SubsectionDragTarget = { kind: "question-block", questionId: question.id, id: block.id };
    const wrapperClassName = cn("rounded-md transition-all", subsectionDragClasses(blockTarget));
    const blockAnchor = questionBlockScrollAnchor(question.id, block.id);
    const blockOpenSignal = openSignalForAnchor(blockAnchor);
    const blockActive = scrollAnchorContains(blockAnchor, activeTocItemId);
    const tableSolutionEntryMasks = block.kind === "table" ? tableSolutionEntryMasksForBlocks(question.contentBlocks) : undefined;
    const activateBlockAnchor = () => activateEditorAnchor(blockAnchor);
    const withInsertAfter = (node: ReactNode) => node;
    const wrapperProps = {
      "data-drag-preview": true,
      "data-scroll-anchor": blockAnchor,
      ...subsectionTargetDataAttributes(blockTarget),
      className: wrapperClassName,
      onPointerDownCapture: activateBlockAnchor,
      onFocusCapture: activateBlockAnchor,
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => handleEditorHeaderContextMenu(event, blockAnchor),
      onDragOver: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragOver(event, blockTarget),
      onDragLeave: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragLeave(event, blockTarget),
      onDrop: (event: DragEvent<HTMLDivElement>) => handleSubsectionDrop(event, blockTarget),
    };

    if (block.kind === "space") {
      const spacePanelLabel = isNotesTemplate ? `Blank space ${blockIndex + 1}` : `Answer space ${blockIndex + 1}`;
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <SpaceBlockEditor
            label={spacePanelLabel}
            title={<InlineSummaryTitle label={spacePanelLabel} summary={spaceBlockSummary(block.lines)} />}
            lines={block.lines}
            showLines={block.showLines ?? true}
            settingsMode="inspector"
            dragHandle={subsectionDragHandle(blockTarget, `Drag ${spacePanelLabel}`)}
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(patch) => updateContentBlock(question.id, block.id, patch as Partial<EditorContentBlock>)}
            onRemove={() => removeQuestionBlock(question.id, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "diagram") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <DiagramBlockEditor
            label={`Diagram block ${blockIndex + 1}`}
            graphConfig={block.graphConfig}
            alignment={block.diagramAlign}
            showSolutions={effectiveShowSolutions}
            settingsMode="inspector"
            anchor={blockAnchor}
            activeAnchor={activeTocItemId}
            onActivateAnchor={activateEditorAnchor}
            dragHandle={subsectionDragHandle(blockTarget, `Drag diagram block ${blockIndex + 1}`)}
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(graphConfig) => updateContentBlock(question.id, block.id, { graphConfig })}
            onAlignmentChange={(diagramAlign) => updateContentBlock(question.id, block.id, { diagramAlign })}
            onRemove={() => removeQuestionBlock(question.id, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "columns") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <ColumnsBlockEditor
            label={`Columns block ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Columns block ${blockIndex + 1}`} summary={columnsBlockSummary(block)} />}
            block={block}
            anchor={blockAnchor}
            activeAnchor={activeTocItemId}
            showSolutions={effectiveShowSolutions}
            spaceLabelPrefix={isNotesTemplate ? "Blank space" : "Answer space"}
            dragHandle={subsectionDragHandle(blockTarget, `Drag columns block ${blockIndex + 1}`)}
            active={blockActive}
            openSignal={blockOpenSignal}
            openSignalForAnchor={openSignalForAnchor}
            contentBlockForKind={contentBlockForKind}
            diagramBlockForType={diagramBlockForType}
            onActivateAnchor={activateEditorAnchor}
            onContextMenuAnchor={handleEditorHeaderContextMenu}
            onChange={(patch) => updateContentBlock(question.id, block.id, patch as Partial<EditorContentBlock>)}
            onRemove={() => removeQuestionBlock(question.id, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "choices") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <ChoiceListBlockEditor
            label={`Choice list ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Choice list ${blockIndex + 1}`} summary={choiceListSummary(block)} />}
            block={block}
            numberingStyleOptions={CHOICE_NUMBERING_STYLES}
            layoutOptions={CHOICE_LIST_LAYOUTS}
            settingsMode="inspector"
            dragHandle={subsectionDragHandle(blockTarget, `Drag choice list ${blockIndex + 1}`)}
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(patch) => updateContentBlock(question.id, block.id, patch)}
            onRemove={() => removeQuestionBlock(question.id, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "table") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <TableBlockEditor
            label={`Table block ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Table block ${blockIndex + 1}`} summary={tableBlockSummary(block)} />}
            block={block}
            diagramAlignments={DIAGRAM_ALIGNMENTS}
            cellAlignments={TABLE_CELL_ALIGNMENTS}
            settingsMode="inspector"
            solutionEntryMask={tableSolutionEntryMasks?.[block.id]}
            dragHandle={subsectionDragHandle(blockTarget, `Drag table block ${blockIndex + 1}`)}
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(patch) => updateContentBlock(question.id, block.id, patch)}
            onRemove={() => removeQuestionBlock(question.id, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "text") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <TextBlockEditor
            label={`Text block ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Text block ${blockIndex + 1}`} summary={textBlockSummary(block.text ?? "")} />}
            text={block.text ?? ""}
            dragHandle={subsectionDragHandle(blockTarget, `Drag text block ${blockIndex + 1}`)}
            active={blockActive}
            openSignal={blockOpenSignal}
            minHeightClassName="min-h-[110px]"
            solutionMarkTools={isSolutionTextBlock(block)}
            onChange={(text) => updateContentBlock(question.id, block.id, { text })}
            onRemove={() => removeQuestionBlock(question.id, block.id)}
          />
        </div>,
      );
    }

    return null;
  }

  function renderPartContentBlock(
    question: QuestionBlock,
    part: EditorPart,
    block: EditorContentBlock,
    itemIndex: number,
    _itemCount: number,
    partItems: OrderedPartItem[],
  ) {
    if (!isOrderedBlockVisible(partItems, itemIndex, effectiveShowSolutions)) return null;

    const blockIndex = Math.max(
      0,
      part.contentBlocks.filter((current) => current.kind !== "pageBreak").findIndex((current) => current.id === block.id),
    );
    const partBlockTarget: SubsectionDragTarget = {
      kind: "part-block",
      questionId: question.id,
      partId: part.id,
      id: block.id,
    };
    const wrapperClassName = cn("rounded-md transition-all", subsectionDragClasses(partBlockTarget));
    const blockAnchor = partBlockScrollAnchor(question.id, part.id, block.id);
    const blockOpenSignal = openSignalForAnchor(blockAnchor);
    const blockActive = scrollAnchorContains(blockAnchor, activeTocItemId);
    const tableSolutionEntryMasks = block.kind === "table" ? tableSolutionEntryMasksForBlocks(part.contentBlocks) : undefined;
    const activateBlockAnchor = () => activateEditorAnchor(blockAnchor);
    const withInsertAfter = (node: ReactNode) => node;
    const wrapperProps = {
      "data-drag-preview": true,
      "data-scroll-anchor": blockAnchor,
      ...subsectionTargetDataAttributes(partBlockTarget),
      className: wrapperClassName,
      onPointerDownCapture: activateBlockAnchor,
      onFocusCapture: activateBlockAnchor,
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => handleEditorHeaderContextMenu(event, blockAnchor),
      onDragOver: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragOver(event, partBlockTarget),
      onDragLeave: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragLeave(event, partBlockTarget),
      onDrop: (event: DragEvent<HTMLDivElement>) => handleSubsectionDrop(event, partBlockTarget),
    };

    if (block.kind === "space") {
      const spacePanelLabel = isNotesTemplate ? `Subheading blank space ${blockIndex + 1}` : `Part answer space ${blockIndex + 1}`;
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <SpaceBlockEditor
            label={spacePanelLabel}
            title={<InlineSummaryTitle label={spacePanelLabel} summary={spaceBlockSummary(block.lines)} />}
            lines={block.lines}
            showLines={block.showLines ?? true}
            settingsMode="inspector"
            dragHandle={subsectionDragHandle(partBlockTarget, `Drag ${spacePanelLabel}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(patch) => updatePartContentBlock(question.id, part.id, block.id, patch as Partial<EditorContentBlock>)}
            onRemove={() => removePartBlock(question.id, part, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "diagram") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <DiagramBlockEditor
            label={`Part diagram ${blockIndex + 1}`}
            graphConfig={block.graphConfig}
            alignment={block.diagramAlign}
            showSolutions={effectiveShowSolutions}
            settingsMode="inspector"
            anchor={blockAnchor}
            activeAnchor={activeTocItemId}
            onActivateAnchor={activateEditorAnchor}
            dragHandle={subsectionDragHandle(partBlockTarget, `Drag part diagram ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(graphConfig) => updatePartContentBlock(question.id, part.id, block.id, { graphConfig })}
            onAlignmentChange={(diagramAlign) => updatePartContentBlock(question.id, part.id, block.id, { diagramAlign })}
            onRemove={() => removePartBlock(question.id, part, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "columns") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <ColumnsBlockEditor
            label={`Part columns ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Part columns ${blockIndex + 1}`} summary={columnsBlockSummary(block)} />}
            block={block}
            anchor={blockAnchor}
            activeAnchor={activeTocItemId}
            showSolutions={effectiveShowSolutions}
            spaceLabelPrefix={isNotesTemplate ? "Subheading blank space" : "Answer space"}
            dragHandle={subsectionDragHandle(partBlockTarget, `Drag part columns ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            openSignalForAnchor={openSignalForAnchor}
            contentBlockForKind={contentBlockForKind}
            diagramBlockForType={diagramBlockForType}
            onActivateAnchor={activateEditorAnchor}
            onContextMenuAnchor={handleEditorHeaderContextMenu}
            onChange={(patch) => updatePartContentBlock(question.id, part.id, block.id, patch as Partial<EditorContentBlock>)}
            onRemove={() => removePartBlock(question.id, part, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "choices") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <ChoiceListBlockEditor
            label={`Part choice list ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Part choice list ${blockIndex + 1}`} summary={choiceListSummary(block)} />}
            block={block}
            numberingStyleOptions={CHOICE_NUMBERING_STYLES}
            layoutOptions={CHOICE_LIST_LAYOUTS}
            settingsMode="inspector"
            dragHandle={subsectionDragHandle(partBlockTarget, `Drag part choice list ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(patch) => updatePartContentBlock(question.id, part.id, block.id, patch)}
            onRemove={() => removePartBlock(question.id, part, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "table") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <TableBlockEditor
            label={`Part table ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Part table ${blockIndex + 1}`} summary={tableBlockSummary(block)} />}
            block={block}
            diagramAlignments={DIAGRAM_ALIGNMENTS}
            cellAlignments={TABLE_CELL_ALIGNMENTS}
            settingsMode="inspector"
            solutionEntryMask={tableSolutionEntryMasks?.[block.id]}
            dragHandle={subsectionDragHandle(partBlockTarget, `Drag part table ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(patch) => updatePartContentBlock(question.id, part.id, block.id, patch)}
            onRemove={() => removePartBlock(question.id, part, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "text") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <TextBlockEditor
            label={`Part text ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Part text ${blockIndex + 1}`} summary={textBlockSummary(block.text ?? "")} />}
            text={block.text ?? ""}
            dragHandle={subsectionDragHandle(partBlockTarget, `Drag part text ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            minHeightClassName="min-h-[74px]"
            solutionMarkTools={isSolutionTextBlock(block)}
            onChange={(text) => updatePartContentBlock(question.id, part.id, block.id, { text })}
            onRemove={() => removePartBlock(question.id, part, block.id)}
          />
        </div>,
      );
    }

    return null;
  }

  function renderSubpartContentBlock(
    question: QuestionBlock,
    part: EditorPart,
    subpart: EditorSubpart,
    block: EditorContentBlock,
    blockIndex: number,
  ) {
    if (!isContentBlockVisibleInScope(subpart.contentBlocks, blockIndex, effectiveShowSolutions)) return null;

    const subpartBlockTarget: SubsectionDragTarget = {
      kind: "subpart-block",
      questionId: question.id,
      partId: part.id,
      subpartId: subpart.id,
      id: block.id,
    };
    const wrapperClassName = cn("rounded-md transition-all", subsectionDragClasses(subpartBlockTarget));
    const blockAnchor = subpartBlockScrollAnchor(question.id, part.id, subpart.id, block.id);
    const blockOpenSignal = openSignalForAnchor(blockAnchor);
    const blockActive = scrollAnchorContains(blockAnchor, activeTocItemId);
    const tableSolutionEntryMasks = block.kind === "table" ? tableSolutionEntryMasksForBlocks(subpart.contentBlocks) : undefined;
    const activateBlockAnchor = () => activateEditorAnchor(blockAnchor);
    const withInsertAfter = (node: ReactNode) => node;
    const wrapperProps = {
      "data-drag-preview": true,
      "data-scroll-anchor": blockAnchor,
      ...subsectionTargetDataAttributes(subpartBlockTarget),
      className: wrapperClassName,
      onPointerDownCapture: activateBlockAnchor,
      onFocusCapture: activateBlockAnchor,
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => handleEditorHeaderContextMenu(event, blockAnchor),
      onDragOver: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragOver(event, subpartBlockTarget),
      onDragLeave: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragLeave(event, subpartBlockTarget),
      onDrop: (event: DragEvent<HTMLDivElement>) => handleSubsectionDrop(event, subpartBlockTarget),
    };

    if (block.kind === "space") {
      const spacePanelLabel = isNotesTemplate ? `Detail blank space ${blockIndex + 1}` : `Subpart answer space ${blockIndex + 1}`;
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <SpaceBlockEditor
            label={spacePanelLabel}
            title={<InlineSummaryTitle label={spacePanelLabel} summary={spaceBlockSummary(block.lines)} />}
            lines={block.lines}
            showLines={block.showLines ?? true}
            settingsMode="inspector"
            dragHandle={subsectionDragHandle(subpartBlockTarget, `Drag ${spacePanelLabel}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(patch) =>
              updateSubpartContentBlock(question.id, part.id, subpart.id, block.id, patch as Partial<EditorContentBlock>)
            }
            onRemove={() => removeSubpartBlock(question.id, part, subpart, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "diagram") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <DiagramBlockEditor
            label={`Subpart diagram ${blockIndex + 1}`}
            graphConfig={block.graphConfig}
            alignment={block.diagramAlign}
            showSolutions={effectiveShowSolutions}
            settingsMode="inspector"
            anchor={blockAnchor}
            activeAnchor={activeTocItemId}
            onActivateAnchor={activateEditorAnchor}
            dragHandle={subsectionDragHandle(subpartBlockTarget, `Drag subpart diagram ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(graphConfig) => updateSubpartContentBlock(question.id, part.id, subpart.id, block.id, { graphConfig })}
            onAlignmentChange={(diagramAlign) => updateSubpartContentBlock(question.id, part.id, subpart.id, block.id, { diagramAlign })}
            onRemove={() => removeSubpartBlock(question.id, part, subpart, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "columns") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <ColumnsBlockEditor
            label={`Subpart columns ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Subpart columns ${blockIndex + 1}`} summary={columnsBlockSummary(block)} />}
            block={block}
            anchor={blockAnchor}
            activeAnchor={activeTocItemId}
            showSolutions={effectiveShowSolutions}
            spaceLabelPrefix={isNotesTemplate ? "Detail blank space" : "Answer space"}
            dragHandle={subsectionDragHandle(subpartBlockTarget, `Drag subpart columns ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            openSignalForAnchor={openSignalForAnchor}
            contentBlockForKind={contentBlockForKind}
            diagramBlockForType={diagramBlockForType}
            onActivateAnchor={activateEditorAnchor}
            onContextMenuAnchor={handleEditorHeaderContextMenu}
            onChange={(patch) =>
              updateSubpartContentBlock(question.id, part.id, subpart.id, block.id, patch as Partial<EditorContentBlock>)
            }
            onRemove={() => removeSubpartBlock(question.id, part, subpart, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "choices") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <ChoiceListBlockEditor
            label={`Subpart choice list ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Subpart choice list ${blockIndex + 1}`} summary={choiceListSummary(block)} />}
            block={block}
            numberingStyleOptions={CHOICE_NUMBERING_STYLES}
            layoutOptions={CHOICE_LIST_LAYOUTS}
            settingsMode="inspector"
            dragHandle={subsectionDragHandle(subpartBlockTarget, `Drag subpart choice list ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(patch) => updateSubpartContentBlock(question.id, part.id, subpart.id, block.id, patch)}
            onRemove={() => removeSubpartBlock(question.id, part, subpart, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "table") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <TableBlockEditor
            label={`Subpart table ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Subpart table ${blockIndex + 1}`} summary={tableBlockSummary(block)} />}
            block={block}
            diagramAlignments={DIAGRAM_ALIGNMENTS}
            cellAlignments={TABLE_CELL_ALIGNMENTS}
            settingsMode="inspector"
            solutionEntryMask={tableSolutionEntryMasks?.[block.id]}
            dragHandle={subsectionDragHandle(subpartBlockTarget, `Drag subpart table ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(patch) => updateSubpartContentBlock(question.id, part.id, subpart.id, block.id, patch)}
            onRemove={() => removeSubpartBlock(question.id, part, subpart, block.id)}
          />
        </div>,
      );
    }

    if (block.kind === "text") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <TextBlockEditor
            label={`Subpart text ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Subpart text ${blockIndex + 1}`} summary={textBlockSummary(block.text ?? "")} />}
            text={block.text ?? ""}
            dragHandle={subsectionDragHandle(subpartBlockTarget, `Drag subpart text ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            minHeightClassName="min-h-[68px]"
            solutionMarkTools={isSolutionTextBlock(block)}
            onChange={(text) => updateSubpartContentBlock(question.id, part.id, subpart.id, block.id, { text })}
            onRemove={() => removeSubpartBlock(question.id, part, subpart, block.id)}
          />
        </div>,
      );
    }

    return null;
  }

  function renderEditorPageBreakRow(target: EditorPageBreakTarget) {
    const moving = editorPageBreakKey(draggedEditorPageBreak) === editorPageBreakKey(target);
    return (
      <EditorPageBreakRow
        key={`page-break-row-${editorPageBreakKey(target)}`}
        target={target}
        isNotesTemplate={isNotesTemplate}
        moving={moving}
        onRemove={(pageBreakTarget) => setEditorPageBreak(pageBreakTarget, false)}
        onMoveByKeyboard={moveEditorPageBreakByKeyboard}
        onDragStart={handleEditorPageBreakDragStart}
        onDragEnd={handleEditorPageBreakDragEnd}
      />
    );
  }

  function solutionSlotExtraActions(plan: ReturnType<typeof solutionSlotInsertionPlan>, onClick: () => void) {
    if (!plan.showManualSolutionSlotAction) return [];
    return [
      {
        label: plan.solutionSlotActionLabel,
        tooltip: plan.solutionSlotActionTooltip,
        icon: <FileText className="size-4" aria-hidden="true" />,
        onClick,
      },
    ];
  }

  function renderSubpartPanel(question: QuestionBlock, part: EditorPart, subpart: EditorSubpart) {
    const subpartIndex = Math.max(
      0,
      (part.subparts ?? []).findIndex((current) => current.id === subpart.id),
    );
    const subpartLabel = romanLabel(subpartIndex);
    const subpartTarget: SubsectionDragTarget = {
      kind: "subpart",
      questionId: question.id,
      partId: part.id,
      id: subpart.id,
    };
    const subpartAnchor = subpartScrollAnchor(question.id, part.id, subpart.id);
    const subpartOpenSignal = openSignalForAnchor(subpartAnchor);
    const subpartActive = isActiveEditorAnchor(subpartAnchor);
    const subpartPanelLabel = isNotesTemplate ? `Detail ${subpartIndex + 1}` : `Subpart (${subpartLabel})`;
    const subpartSolutionInsertion = solutionSlotInsertionPlan({
      supportsSolutionTools,
      marks: subpart.marks,
      scope: "subpart",
    });
    const subpartContainer: SubsectionContainerRef = {
      kind: "subpart",
      questionId: question.id,
      partId: part.id,
      subpartId: subpart.id,
    };
    return (
      <div
        key={subpart.id}
        data-drag-preview
        data-scroll-anchor={subpartAnchor}
        {...subsectionTargetDataAttributes(subpartTarget)}
        className={cn("rounded-md transition-all", subsectionDragClasses(subpartTarget))}
        onDragOver={(event) => {
          if (handleEditorPageBreakDragOver(event, subpartTarget)) return;
          handleSubsectionDragOver(event, subpartTarget);
        }}
        onDragLeave={(event) => {
          handleEditorPageBreakDragLeave(event, subpartTarget);
          handleSubsectionDragLeave(event, subpartTarget);
        }}
        onDrop={(event) => {
          if (handleEditorPageBreakDrop(event, subpartTarget)) return;
          handleSubsectionDrop(event, subpartTarget);
        }}
      >
        <CollapsiblePanel
          title={<InlineSummaryTitle label={subpartPanelLabel} summary={partPanelSummary(subpart.contentBlocks)} />}
          leading={subsectionDragHandle(subpartTarget, `Drag ${subpartPanelLabel}`)}
          onHeaderContextMenu={(event) => openContextMenu(event, subpartAnchor, "editor")}
          actions={
            <>
              {!isNotesTemplate ? (
                <label className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                  Marks
                  <input
                    type="number"
                    min={0}
                    value={subpart.marks}
                    onChange={(event) => updateSubpart(question.id, part.id, subpart.id, { marks: Number(event.target.value) })}
                    className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              ) : null}
              <RemoveActionButton label={`Remove ${subpartPanelLabel}`} onRemove={() => removeSubpart(question.id, part, subpart.id)} />
            </>
          }
          className="bg-muted/20"
          bodyClassName="p-3"
          defaultOpen={false}
          active={subpartActive}
          openSignal={subpartOpenSignal}
        >
          <div className="flex flex-col gap-3">
            {subpart.contentBlocks.map((block, blockIndex) => {
              if (block.kind === "pageBreak") return null;
              const beforeItem: ContainerOrderItem = { kind: "block", id: block.id };
              return (
                <Fragment key={block.id}>
                  {itemDropZone(subpartContainer, beforeItem, Boolean(draggedSubsection))}
                  {renderSubpartContentBlock(question, part, subpart, block, blockIndex)}
                </Fragment>
              );
            })}
          </div>
          {containerDropZone(subpartContainer, "end", Boolean(draggedSubsection))}
          <ContentInsertionActions
            buttonLabel="Add"
            solutionMode={effectiveShowSolutions}
            centered
            className="mt-3 pt-3"
            onAddText={() => addSubpartBlock(question.id, part, subpart, "text")}
            onAddChoices={() => addSubpartBlock(question.id, part, subpart, "choices")}
            onAddTable={() => addSubpartBlock(question.id, part, subpart, "table")}
            onAddDiagram={() => addSubpartBlock(question.id, part, subpart, "diagram")}
            diagramActions={quickDiagramInsertActions((type) => addSubpartDiagramBlock(question.id, part, subpart, type))}
            onAddColumns={() => addSubpartBlock(question.id, part, subpart, "columns")}
            onAddSpace={() =>
              subpartSolutionInsertion.usesPairedSolutionSpace
                ? addSubpartSolutionSlot(question.id, part, subpart)
                : addSubpartBlock(question.id, part, subpart, "space")
            }
            spaceActionLabel={subpartSolutionInsertion.spaceActionLabel}
            spaceActionTooltip={subpartSolutionInsertion.spaceActionTooltip}
            extraActions={[...solutionSlotExtraActions(subpartSolutionInsertion, () => addSubpartSolutionSlot(question.id, part, subpart))]}
          />
        </CollapsiblePanel>
      </div>
    );
  }

  function renderPartPanel(question: QuestionBlock, part: EditorPart) {
    const subparts = part.subparts ?? [];
    const partItems = orderedPartItems(part);
    const partIndex = Math.max(
      0,
      question.parts.findIndex((current) => current.id === part.id),
    );
    const partTarget: SubsectionDragTarget = { kind: "part", questionId: question.id, id: part.id };
    const partLabel = alphaLabel(partIndex);
    const partAnchor = partScrollAnchor(question.id, part.id);
    const partOpenSignal = openSignalForAnchor(partAnchor);
    const partActive = isActiveEditorAnchor(partAnchor);
    const partPanelLabel = isNotesTemplate ? `Subheading ${partIndex + 1}` : `Part (${partLabel})`;
    const partSolutionInsertion = solutionSlotInsertionPlan({
      supportsSolutionTools,
      marks: part.marks,
      scope: "part",
      hasNestedItems: Boolean(subparts.length),
    });
    const partContainer: SubsectionContainerRef = { kind: "part", questionId: question.id, partId: part.id };
    const nextSubpartPageBreakTarget = subpartPageBreakInsertTarget(question.id, part);
    const partInsertAction = {
      label: isNotesTemplate ? "Detail" : "Subpart",
      tooltip: isNotesTemplate
        ? "Add a nested detail section inside this subheading"
        : "Add a roman-numbered item, such as (i), inside this part",
      icon: <GitBranch className="size-4" aria-hidden="true" />,
      onClick: () => addSubpart(question.id, part),
    };
    const partPageBreakInsertAction = {
      label: "Page break",
      tooltip: nextSubpartPageBreakTarget
        ? "Add a page-break row before an existing subpart"
        : "Add a subpart first, then insert a page-break row before it",
      icon: <FileText className="size-4" aria-hidden="true" />,
      disabled: !nextSubpartPageBreakTarget,
      onClick: () => addSubpartPageBreak(question.id, part),
    };
    return (
      <div key={part.id} data-scroll-anchor={partAnchor}>
        <div
          data-drag-preview
          {...subsectionTargetDataAttributes(partTarget)}
          className={cn("rounded-md transition-all", subsectionDragClasses(partTarget))}
          onDragOver={(event) => {
            if (handleEditorPageBreakDragOver(event, partTarget)) return;
            handleSubsectionDragOver(event, partTarget);
          }}
          onDragLeave={(event) => {
            handleEditorPageBreakDragLeave(event, partTarget);
            handleSubsectionDragLeave(event, partTarget);
          }}
          onDrop={(event) => {
            if (handleEditorPageBreakDrop(event, partTarget)) return;
            handleSubsectionDrop(event, partTarget);
          }}
        >
          <CollapsiblePanel
            title={<InlineSummaryTitle label={partPanelLabel} summary={partPanelSummary(part.contentBlocks)} />}
            leading={subsectionDragHandle(partTarget, `Drag ${partPanelLabel}`)}
            onHeaderContextMenu={(event) => openContextMenu(event, partAnchor, "editor")}
            actions={
              <>
                {!isNotesTemplate && subparts.length ? (
                  <div className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                    Marks
                    <div className="flex h-8 w-20 items-center rounded-md border border-input bg-muted px-2 text-sm font-normal text-muted-foreground">
                      {markLabel(partMarks(part))}
                    </div>
                  </div>
                ) : null}
                {!isNotesTemplate && !subparts.length ? (
                  <label className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                    Marks
                    <input
                      type="number"
                      min={0}
                      value={part.marks}
                      onChange={(event) => updatePart(question.id, part.id, { marks: Number(event.target.value) })}
                      className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                ) : null}
                <RemoveActionButton label={`Remove ${partPanelLabel}`} onRemove={() => removePart(question.id, part.id)} />
              </>
            }
            className="bg-background"
            bodyClassName="p-3"
            defaultOpen={false}
            active={partActive}
            openSignal={partOpenSignal}
          >
            <div className="flex flex-col gap-3">
              {partItems.map((item, partItemIndex) => {
                const beforeItem: ContainerOrderItem =
                  item.kind === "block" ? { kind: "block", id: item.id } : { kind: "subpart", id: item.id };
                const beforeDropZone = itemDropZone(partContainer, beforeItem, Boolean(draggedSubsection || draggedEditorPageBreak));

                if (item.kind === "block") {
                  return (
                    <Fragment key={item.id}>
                      {beforeDropZone}
                      {renderPartContentBlock(question, part, item.block, partItemIndex, partItems.length, partItems)}
                    </Fragment>
                  );
                }

                return (
                  <Fragment key={item.id}>
                    {beforeDropZone}
                    <div className="ml-6 space-y-2 border-l-2 border-blue-200 pl-4">
                      {item.subpart.pageBreakBefore
                        ? renderEditorPageBreakRow({
                            kind: "subpart",
                            questionId: question.id,
                            partId: part.id,
                            subpartId: item.subpart.id,
                          })
                        : null}
                      {renderSubpartPanel(question, part, item.subpart)}
                    </div>
                  </Fragment>
                );
              })}
            </div>
            {containerDropZone(partContainer, "end", Boolean(draggedSubsection || draggedEditorPageBreak))}
            <ContentInsertionActions
              buttonLabel="Add"
              solutionMode={effectiveShowSolutions}
              centered
              className="mt-3 pt-3"
              onAddText={() => addPartBlock(question.id, part, "text")}
              onAddChoices={() => addPartBlock(question.id, part, "choices")}
              onAddTable={() => addPartBlock(question.id, part, "table")}
              onAddDiagram={() => addPartBlock(question.id, part, "diagram")}
              diagramActions={quickDiagramInsertActions((type) => addPartDiagramBlock(question.id, part, type))}
              onAddColumns={() => addPartBlock(question.id, part, "columns")}
              onAddSpace={() =>
                partSolutionInsertion.usesPairedSolutionSpace
                  ? addPartSolutionSlot(question.id, part)
                  : addPartBlock(question.id, part, "space")
              }
              spaceActionLabel={partSolutionInsertion.spaceActionLabel}
              spaceActionTooltip={partSolutionInsertion.spaceActionTooltip}
              extraActions={[
                ...solutionSlotExtraActions(partSolutionInsertion, () => addPartSolutionSlot(question.id, part)),
                partInsertAction,
                partPageBreakInsertAction,
              ]}
            />
          </CollapsiblePanel>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-shell min-h-screen bg-background text-foreground">
        <header className="app-header border-b border-blue-300/15 bg-[#030817] text-white shadow-[0_14px_32px_rgba(3,8,23,0.22)]">
          <div className="flex min-h-16 items-center justify-between gap-4 px-5">
            <div className="flex shrink-0 items-center gap-3">
              <img
                src={BRAND_LOGO_SRC}
                alt="Mauth Studio"
                className="h-10 w-auto max-w-[190px] rounded-md border border-white/10 bg-[#020615] object-contain"
              />
              <div className="flex items-center gap-1 rounded-md border border-blue-300/20 bg-white/[0.05] p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={paneMode === "split" ? "Hide editor" : "Manual editor mode"}
                  aria-label={paneMode === "split" ? "Hide editor" : "Manual editor mode"}
                  aria-pressed={paneMode === "split"}
                  onClick={toggleManualPane}
                  className={cn(HEADER_ICON_BUTTON_CLASS, paneMode === "split" && HEADER_ICON_ACTIVE_CLASS)}
                >
                  <ManualModeIcon className="size-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={showInspectorPane ? "Hide inspector" : "Show inspector"}
                  aria-label={showInspectorPane ? "Hide inspector" : "Show inspector"}
                  aria-pressed={showInspectorPane}
                  onClick={toggleInspectorPane}
                  className={cn(HEADER_ICON_BUTTON_CLASS, showInspectorPane && HEADER_ICON_ACTIVE_CLASS)}
                >
                  {showInspectorPane ? <PanelRightClose /> : <PanelRightOpen />}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="New document"
                aria-label="New document"
                onClick={startNewTest}
                className={HEADER_ICON_BUTTON_CLASS}
              >
                <PlusCircle />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Save current test"
                aria-label="Save current test"
                disabled={!editorDocumentOpen}
                onClick={saveCurrentTest}
                className={HEADER_ICON_BUTTON_CLASS}
              >
                <Save />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Open files"
                aria-label="Open files"
                onClick={openFileManager}
                className={HEADER_ICON_BUTTON_CLASS}
              >
                <FolderOpen />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title={systemStatusMessage}
                aria-label="System status"
                onClick={() => setSystemStatusPanelOpen(true)}
                className={cn(HEADER_ICON_BUTTON_CLASS, "relative", systemStatusState !== "ready" && "text-red-100")}
              >
                <Server />
                <span
                  className={cn("absolute right-1 top-1 size-2 rounded-full", systemStatusTone(systemStatusState))}
                  aria-hidden="true"
                />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Close current file"
                aria-label="Close current file"
                disabled={!editorDocumentOpen}
                onClick={() => void closeCurrentDocument()}
                className={HEADER_ICON_BUTTON_CLASS}
              >
                <X />
              </Button>
            </div>
            <div className="hidden min-w-0 flex-1 items-center justify-end gap-2 md:flex">
              <HeaderFileControls
                currentFileName={currentProjectFileName}
                fileStatusMessage={headerFileStatusMessage}
                fileStatusTitle={headerFileStatusTitle}
                saveStatus={headerStorageStatus}
                documentOpen={editorDocumentOpen}
                onNewTest={startNewTest}
                onSaveTest={saveCurrentTest}
                onOpenFiles={openFileManager}
                onCloseFile={() => void closeCurrentDocument()}
              />
              <div className={HEADER_GROUP_CLASS}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={systemStatusMessage}
                  aria-label="System status"
                  onClick={() => setSystemStatusPanelOpen(true)}
                  className={cn(HEADER_ICON_BUTTON_CLASS, "relative", systemStatusState !== "ready" && "text-red-100")}
                >
                  <Server />
                  <span
                    className={cn("absolute right-1 top-1 size-2 rounded-full", systemStatusTone(systemStatusState))}
                    aria-hidden="true"
                  />
                </Button>
              </div>
              <div className={HEADER_GROUP_CLASS}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                  aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                  aria-pressed={darkMode}
                  onClick={toggleTheme}
                  className={cn(HEADER_ICON_BUTTON_CLASS, darkMode && HEADER_ICON_ACTIVE_CLASS)}
                >
                  {darkMode ? <Sun /> : <Moon />}
                </Button>
              </div>
              <div className={HEADER_GROUP_CLASS}>
                <SolutionModeControls
                  editorDocumentOpen={editorDocumentOpen}
                  supportsSolutionTools={supportsSolutionTools}
                  showSolutions={showSolutions}
                  effectiveShowSolutions={effectiveShowSolutions}
                  printModeLabel={printModeLabel}
                  printModeTitle={printModeTitle}
                  solutionIssueCount={solutionValidation.issues.length}
                  solutionErrorCount={solutionValidation.errorCount}
                  onShowSolutionsChange={setShowSolutions}
                  onOpenSolutionValidation={() => setSolutionValidationOpen(true)}
                  onPrint={printDocument}
                />
              </div>
              <div className={HEADER_GROUP_CLASS}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Undo"
                  aria-label="Undo"
                  disabled={!editorDocumentOpen || !canUndo}
                  onClick={undoEdit}
                  className={HEADER_ICON_BUTTON_CLASS}
                >
                  <Undo2 />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Redo"
                  aria-label="Redo"
                  disabled={!editorDocumentOpen || !canRedo}
                  onClick={redoEdit}
                  className={HEADER_ICON_BUTTON_CLASS}
                >
                  <Redo2 />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="app-main grid h-[calc(100vh-4rem)] min-h-0 bg-background" style={editorDocumentOpen ? appShellStyle : undefined}>
          {editorDocumentOpen ? (
            <>
              <DocumentNavigatorRail
                open={tocOpen}
                items={documentTocItems}
                activeItemId={activeRailItemId}
                draggedQuestionId={draggedQuestionId}
                dragOverQuestion={dragOverQuestion}
                draggedPageBreakQuestionId={draggedPageBreakQuestionId}
                dragOverPageBreak={dragOverPageBreak}
                pageBreakQuestionIds={pageBreakQuestionIds}
                onToggle={() => setTocOpen((current) => !current)}
                onJump={jumpToTocItem}
                onPreviewJump={jumpPreviewToTocItem}
                onContextMenu={(event, item) => openContextMenu(event, item.editorAnchor, "miniToc")}
                onSelectPageBreak={selectPageBreakInRail}
                onToggleEditorAtItem={toggleEditorAtTocItem}
                onAddSectionHeading={addSectionHeading}
                onAddQuestion={addQuestion}
                questionItemLabel={isNotesTemplate ? "heading" : "question"}
                onAddPageBreakAfterQuestion={addPageBreakAfterQuestion}
                onMoveQuestion={moveQuestionByKeyboard}
                onMoveSectionHeading={moveSectionHeadingByKeyboard}
                onMovePageBreak={movePageBreakByKeyboard}
                onDeleteQuestion={removeQuestion}
                onDeleteSectionHeading={removeSectionHeading}
                onDeletePageBreak={removePageBreakAfterQuestion}
                onQuestionDragStart={handleQuestionDragStart}
                onQuestionDragOver={handleQuestionDragOver}
                onQuestionDragLeave={handleQuestionDragLeave}
                onQuestionDrop={handleQuestionDrop}
                onQuestionDragOverPageBreak={handleQuestionDragOverPageBreak}
                onQuestionDragLeavePageBreak={handleQuestionDragLeavePageBreak}
                onQuestionDropPageBreak={handleQuestionDropPageBreak}
                onQuestionDragEnd={handleQuestionDragEnd}
                onPageBreakDragStart={handlePageBreakDragStart}
                onPageBreakDragOver={handlePageBreakDragOver}
                onPageBreakDragLeave={handlePageBreakDragLeave}
                onPageBreakDrop={handlePageBreakDrop}
                onPageBreakDragEnd={handlePageBreakDragEnd}
              />
              {tocOpen ? (
                <DocumentNavigator
                  items={documentTocItems}
                  activeItemId={activeTocItemId}
                  onJump={jumpToTocItem}
                  onContextMenu={(event, item) => openContextMenu(event, item.editorAnchor, "miniToc")}
                />
              ) : null}
              <div className="app-workspace grid min-h-0 min-w-0 bg-background" style={workspaceStyle}>
                {showEditor ? (
                  <section
                    ref={editorPaneRef}
                    className={cn(
                      "editor-pane min-h-0 overflow-y-auto overflow-x-hidden border-b bg-muted/35 p-4 lg:border-b-0 lg:border-r",
                      paneMode === "split" && "split-pane-scroll",
                    )}
                  >
                    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4">
                      <div className="flex w-full min-w-0 flex-col gap-4">
                        <ProjectFileConflictBanner
                          conflict={activeProjectRevisionIssue}
                          disabled={fileOperationBusy}
                          onSaveRecoveryCopy={() => void saveConflictRecoveryCopy()}
                          onReloadFromDisk={() => void reloadConflictFileFromDisk()}
                        />

                        {editingFrontMatter ? (
                          <div
                            className={cn(
                              "rounded-lg border bg-card p-4 shadow-panel transition-colors",
                              isActiveEditorAnchor(SCROLL_ANCHOR_FRONT_MATTER) && EDITOR_ACTIVE_PANEL_CLASS,
                            )}
                            data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}
                          >
                            <div className="flex flex-col gap-3">
                              <FrontMatterEditor
                                frontMatter={frontMatter}
                                logos={logos}
                                openSignal={openSignalForAnchor(SCROLL_ANCHOR_FRONT_MATTER)}
                                questionCount={questions.length}
                                totalMarks={totalMarks}
                                onChange={updateFrontMatter}
                                onAddLogo={addLogo}
                                onUpdateLogo={updateLogo}
                                onRemoveLogo={removeLogo}
                              />
                            </div>
                          </div>
                        ) : null}

                        {!editingFrontMatter && editingPageBreak && activePageBreakQuestion ? (
                          <div className="flex flex-col gap-4">
                            <div data-scroll-anchor={pageBreakScrollAnchor(activePageBreakQuestion.id)}>
                              <PageBreakStructurePanel
                                label={`Page break after ${
                                  isNotesTemplate
                                    ? `Heading ${
                                        Math.max(
                                          0,
                                          questions.findIndex((question) => question.id === activePageBreakQuestion.id),
                                        ) + 1
                                      }`
                                    : `Question ${questionDisplayNumber(
                                        frontMatter,
                                        Math.max(
                                          0,
                                          questions.findIndex((question) => question.id === activePageBreakQuestion.id),
                                        ),
                                      )}`
                                }`}
                                active={isActiveEditorAnchor(pageBreakScrollAnchor(activePageBreakQuestion.id))}
                                onRemove={() => removePageBreakAfterQuestion(activePageBreakQuestion.id)}
                              />
                            </div>
                          </div>
                        ) : null}

                        {!editingFrontMatter && !editingPageBreak && editingSectionHeading && activeSectionHeading ? (
                          <div className="flex flex-col gap-4">
                            <div data-scroll-anchor={sectionHeadingScrollAnchor(activeSectionHeading.id)}>
                              <SectionHeadingStructurePanel
                                heading={activeSectionHeading}
                                active={isActiveEditorAnchor(sectionHeadingScrollAnchor(activeSectionHeading.id))}
                                onChange={(title) => updateSectionHeading(activeSectionHeading.id, title)}
                                onRemove={() => removeSectionHeading(activeSectionHeading.id)}
                              />
                            </div>
                          </div>
                        ) : null}

                        {!editingFrontMatter && !editingPageBreak && !editingSectionHeading ? (
                          <div className="flex flex-col gap-4">
                            {questions.map((question, index) => {
                              if (question.id !== activeQuestion?.id) return null;

                              const hasParts = question.parts.length > 0;
                              const questionItems = orderedQuestionItems(question);
                              const questionAnchor = questionScrollAnchor(question.id);
                              const questionActive = isActiveEditorAnchor(questionAnchor);
                              const questionPanelLabel = isNotesTemplate
                                ? `Heading ${index + 1}`
                                : `Question ${questionDisplayNumber(frontMatter, index)}`;
                              const questionSolutionInsertion = solutionSlotInsertionPlan({
                                supportsSolutionTools,
                                marks: question.marks,
                                scope: "question",
                                hasNestedItems: hasParts,
                              });
                              const nextPartPageBreakTarget = partPageBreakInsertTarget(question);
                              return (
                                <div key={question.id} className="contents">
                                  <article
                                    className={cn(
                                      "relative rounded-lg border bg-card p-4 shadow-panel transition-colors",
                                      questionActive && EDITOR_ACTIVE_PANEL_CLASS,
                                    )}
                                    data-scroll-anchor={questionAnchor}
                                  >
                                    <div
                                      className="mb-4 flex flex-wrap items-center justify-between gap-3"
                                      data-panel-region="header"
                                      onContextMenu={(event) => openContextMenu(event, questionAnchor, "editor")}
                                    >
                                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          title={`Jump preview to ${questionPanelLabel}`}
                                          aria-label={`Jump preview to ${questionPanelLabel}`}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            jumpPreviewToQuestion(question.id);
                                          }}
                                          className={cn(
                                            "h-9 shrink-0 whitespace-nowrap px-3 text-sm font-semibold",
                                            questionActive &&
                                              "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                                          )}
                                        >
                                          {questionPanelLabel}
                                        </Button>
                                        {isNotesTemplate ? (
                                          <label className="flex h-9 min-w-[14rem] flex-1 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm">
                                            <span className="shrink-0 font-medium text-muted-foreground">Title</span>
                                            <input
                                              aria-label={`${questionPanelLabel} title`}
                                              type="text"
                                              value={question.section}
                                              onChange={(event) => updateQuestion(question.id, { section: event.target.value })}
                                              placeholder="Heading title"
                                              className="h-7 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                                            />
                                          </label>
                                        ) : null}
                                        {!isNotesTemplate && hasParts ? (
                                          <Badge variant="secondary" className="h-9 shrink-0 whitespace-nowrap px-3 text-sm">
                                            {markLabel(questionMarks(question))}
                                          </Badge>
                                        ) : null}
                                        {!isNotesTemplate && !hasParts ? (
                                          <label className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm">
                                            <span className="font-medium text-muted-foreground">Marks</span>
                                            <input
                                              aria-label={`${questionPanelLabel} marks`}
                                              type="number"
                                              min={0}
                                              value={question.marks}
                                              onChange={(event) => updateQuestion(question.id, { marks: Number(event.target.value) })}
                                              className="h-7 w-14 bg-transparent text-sm font-semibold outline-none"
                                            />
                                          </label>
                                        ) : null}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          title={`Remove ${questionPanelLabel}`}
                                          aria-label={`Remove ${questionPanelLabel}`}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            removeQuestion(question.id);
                                          }}
                                          className="size-9 shrink-0"
                                        >
                                          <Trash2 />
                                        </Button>
                                      </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                      {questionItems.map((item, itemIndex) => {
                                        const beforeItem: ContainerOrderItem =
                                          item.kind === "block" ? { kind: "block", id: item.id } : { kind: "part", id: item.id };
                                        const beforeDropZone = itemDropZone(
                                          { kind: "question", questionId: question.id },
                                          beforeItem,
                                          Boolean(draggedSubsection || draggedEditorPageBreak),
                                        );

                                        return item.kind === "block" ? (
                                          <Fragment key={item.id}>
                                            {beforeDropZone}
                                            {renderQuestionContentBlock(
                                              question,
                                              item.block,
                                              itemIndex,
                                              questionItems.length,
                                              questionItems,
                                            )}
                                          </Fragment>
                                        ) : (
                                          <Fragment key={item.id}>
                                            {beforeDropZone}
                                            {item.part.pageBreakBefore
                                              ? renderEditorPageBreakRow({ kind: "part", questionId: question.id, partId: item.part.id })
                                              : null}
                                            {renderPartPanel(question, item.part)}
                                          </Fragment>
                                        );
                                      })}
                                    </div>
                                    {containerDropZone(
                                      { kind: "question", questionId: question.id },
                                      "end",
                                      Boolean(draggedSubsection || draggedEditorPageBreak),
                                    )}
                                    <ContentInsertionActions
                                      buttonLabel="Add"
                                      solutionMode={effectiveShowSolutions}
                                      centered
                                      className="mt-4 pt-3"
                                      onAddText={() => addQuestionBlock(question.id, "text")}
                                      onAddChoices={() => addQuestionBlock(question.id, "choices")}
                                      onAddTable={() => addQuestionBlock(question.id, "table")}
                                      onAddDiagram={() => addQuestionBlock(question.id, "diagram")}
                                      diagramActions={quickDiagramInsertActions((type) => addQuestionDiagramBlock(question.id, type))}
                                      onAddColumns={() => addQuestionBlock(question.id, "columns")}
                                      onAddSpace={() =>
                                        questionSolutionInsertion.usesPairedSolutionSpace
                                          ? addQuestionSolutionSlot(question.id)
                                          : addQuestionBlock(question.id, "space")
                                      }
                                      spaceActionLabel={questionSolutionInsertion.spaceActionLabel}
                                      spaceActionTooltip={questionSolutionInsertion.spaceActionTooltip}
                                      extraActions={[
                                        ...solutionSlotExtraActions(questionSolutionInsertion, () => addQuestionSolutionSlot(question.id)),
                                        {
                                          label: isNotesTemplate ? "Subheading" : "Part",
                                          tooltip: isNotesTemplate
                                            ? "Add a nested notes subheading"
                                            : "Add a lettered question part, such as (a), (b), (c)",
                                          icon: <GitBranch className="size-4" aria-hidden="true" />,
                                          onClick: () => addPart(question.id),
                                        },
                                        {
                                          label: "Page break",
                                          tooltip: nextPartPageBreakTarget
                                            ? "Add a page-break row before an existing part"
                                            : "Add a part first, then insert a page-break row before it",
                                          icon: <FileText className="size-4" aria-hidden="true" />,
                                          disabled: !nextPartPageBreakTarget,
                                          onClick: () => addPartPageBreak(question.id),
                                        },
                                      ]}
                                    />
                                  </article>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                ) : null}

                {showInspectorPane ? (
                  selectionInspectorVisible ? (
                    <SelectionInspector
                      selectedBlock={selectedEditorBlock}
                      activeAnchor={activeTocItemId}
                      onActivateAnchor={activateEditorAnchor}
                      onBlockChange={updateSelectedBlock}
                      onCreateSolutionCopy={createSolutionCopyForSelectedBlock}
                      createTextBlock={textBlock}
                      diagramTypePatch={diagramTypePatch}
                      updateGraphConfig={updateGraphConfig}
                      withGraphDefaults={withGraphDefaults}
                    />
                  ) : (
                    <aside
                      data-inspector-placement="inline"
                      className="selection-inspector-pane flex min-h-0 min-w-0 flex-col overflow-hidden border-b bg-card/95 lg:border-b-0 lg:border-r"
                    >
                      <div className="shrink-0 border-b p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</div>
                        <div className="mt-1 truncate text-sm font-semibold">No module selected</div>
                      </div>
                    </aside>
                  )
                ) : null}

                {showPreview ? (
                  <section
                    ref={previewPaneRef}
                    className={cn(
                      "preview-pane min-h-0 overflow-auto bg-muted/70 p-4",
                      paneMode === "split" && "preview-pane-edit-sync split-pane-scroll",
                    )}
                    onPointerDownCapture={handlePreviewPointerDown}
                    onClickCapture={handlePreviewClick}
                    onContextMenuCapture={handlePreviewContextMenu}
                  >
                    <PaginatedTestPreview
                      frontMatter={previewFrontMatter}
                      logos={previewLogos}
                      totalMarks={previewTotalMarks}
                      questions={previewQuestions}
                      sectionHeadings={previewSectionHeadings}
                      documentFlow={previewDocumentFlow}
                      formattingConfig={previewFormattingConfig}
                      scale={previewLayoutScale}
                      showSolutions={previewShowSolutions}
                      onGraphConfigChange={handlePreviewGraphConfigChange}
                    />
                  </section>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyDocumentStart onNewDocument={startNewTest} onOpenFiles={openFileManager} />
          )}
        </main>
      </div>
      <FileManagementDrawer
        open={fileManagerOpen}
        activeProject={activeProject}
        projectFiles={projectFiles}
        projectFilesStatus={projectFilesStatus}
        projectFilesMessage={projectFilesMessage}
        activeProjectFilePath={activeProjectFilePath}
        buildVersionPreview={projectFileVersionPreview}
        onClose={() => setFileManagerOpen(false)}
        onNewTest={startNewTest}
        onOpenProjectFile={(filePath) => void openProjectFile(filePath)}
        onCreateProjectFolder={(folderPath) => void createProjectFolder(folderPath)}
        onExportProjectBackup={() => void exportCurrentProjectBackup()}
        onImportProjectBackup={(file) => void importProjectBackupFile(file)}
        onChooseDocumentsFolder={() => void chooseDocumentsFolder()}
        onOpenDocumentsFolder={(folderPath) => void openDocumentsFolder(folderPath)}
        onResetDocumentsFolder={() => void resetDocumentsFolder()}
        onRefreshProjectFiles={() => void refreshProjectFiles()}
        onRenameProjectFile={(filePath) => void renameProjectFile(filePath)}
        onDuplicateProjectFiles={(filePaths) => void duplicateProjectFiles(filePaths)}
        onMoveProjectFiles={(filePaths, targetFolderPath) => void moveProjectFiles(filePaths, targetFolderPath)}
        onDeleteProjectFiles={(filePaths) => void removeProjectFiles(filePaths)}
        onListProjectFileVersions={loadProjectFileVersions}
        onRestoreProjectFileVersion={restoreProjectFileFromVersion}
      />
      {mauthDialogs.dialogNode}
      <NewTestDialog open={newTestDialogOpen} onClose={() => setNewTestDialogOpen(false)} onCreate={createNewTestFromTemplate} />
      <SystemStatusPanel
        open={systemStatusPanelOpen}
        status={systemStatus}
        state={systemStatusState}
        message={systemStatusMessage}
        webBuild={webBuild}
        activeProject={activeProject}
        editorDocumentOpen={editorDocumentOpen}
        currentFileName={currentProjectFileName}
        activeProjectPathLabel={activeProjectPathLabel}
        activeProjectFileRevision={activeProjectFileRevision}
        headerStorageStatus={headerStorageStatus}
        draftAutosaveStatus={draftAutosaveStatus}
        draftAutosaveMessage={draftAutosaveMessage}
        onRefresh={() => void refreshSystemStatus()}
        onClose={() => setSystemStatusPanelOpen(false)}
      />
      {solutionValidationOpen ? (
        <SolutionValidationPanel
          result={solutionValidation}
          onClose={() => setSolutionValidationOpen(false)}
          onJump={jumpToSolutionValidationIssue}
          onFix={applySolutionValidationFix}
        />
      ) : null}
      {actionProposalOpen ? (
        <ActionProposalPanel
          value={actionProposalText}
          message={actionProposalMessage}
          result={actionProposalResult}
          onChange={(nextValue) => {
            setActionProposalText(nextValue);
            clearActionProposalFeedback();
          }}
          onPreview={previewActionProposal}
          onApply={applyActionProposal}
          onClose={() => setActionProposalOpen(false)}
          onClear={clearActionProposal}
        />
      ) : null}
      <ContextMenu menu={contextMenu} onClose={closeContextMenu} />
      {printPreviewMounted && editorDocumentOpen ? (
        <div className="print-preview-stage" aria-hidden="true">
          <PaginatedTestPreview
            frontMatter={frontMatter}
            logos={logos}
            totalMarks={totalMarks}
            questions={questions}
            sectionHeadings={sectionHeadings}
            documentFlow={documentFlow}
            formattingConfig={formattingConfig}
            scale={1}
            showSolutions={effectiveShowSolutions}
          />
        </div>
      ) : null}
    </>
  );
}
