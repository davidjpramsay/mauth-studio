import { Fragment, memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type {
  ChoiceNumberingStyle,
  DiagramAlignment,
  DiagramTextSide,
  FormattingConfig,
  GraphConfig,
  MauthAgentFileState,
  ProjectFileSummary,
  ProjectSummary,
} from "@mauth-studio/shared";
import { DEFAULT_STATS_CHART_SPEC, normalizeStatsChartSpec, statsChartSummary } from "@mauth-studio/diagram-plotly";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  CopyPlus,
  FileText,
  FolderOpen,
  GitBranch,
  GripVertical,
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
import { FormattedText, FrontMatterInlineText, InlineSummaryTitle, MixedMath, SolutionMarkTicks } from "@/components/MathText";
import { GeometricConstructionDiagram } from "@/components/diagrams/GeometricConstructionDiagram";
import { ChoiceListBlockEditor } from "@/components/editor/ChoiceListBlockEditor";
import { DiagramBlockPanel } from "@/components/editor/DiagramBlockPanel";
import { CollapsiblePanel, ContentInsertionActions, EDITOR_ACTIVE_PANEL_CLASS, RemoveActionButton } from "@/components/editor/EditorPanels";
import { FunctionGraphEditor } from "@/components/editor/FunctionGraphEditor";
import { Geometry2DGraphEditor } from "@/components/editor/Geometry2DGraphEditor";
import { Graph3DGraphEditor } from "@/components/editor/Graph3DGraphEditor";
import { GeometricConstructionEditor } from "@/components/editor/GeometricConstructionEditor";
import { ImageDiagramEditor } from "@/components/editor/ImageDiagramEditor";
import { SetDiagramEditor } from "@/components/editor/SetDiagramEditor";
import {
  SelectionInspector,
  type ColumnBlockPath,
  type SelectedEditorBaseBlockScope,
  type SelectedEditorBlock,
} from "@/components/editor/SelectionInspector";
import { SpaceBlockEditor } from "@/components/editor/SpaceBlockEditor";
import { StatsChartEditor } from "@/components/editor/StatsChartEditor";
import { PageBreakStructurePanel, SectionHeadingStructurePanel } from "@/components/editor/StructurePanels";
import { TableBlockEditor } from "@/components/editor/TableBlockEditor";
import { TextBlockEditor } from "@/components/editor/TextBlockEditor";
import { Vector2DGraphEditor } from "@/components/editor/Vector2DGraphEditor";
import { NetworkDiagramEditor } from "@/components/editor/NetworkDiagramEditor";
import { quickDiagramInsertActions } from "@/components/editor/diagramInsertionActions";
import {
  CHOICE_LIST_LAYOUTS,
  CHOICE_NUMBERING_STYLES,
  DIAGRAM_ALIGNMENTS,
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_GROUPS,
  TABLE_CELL_ALIGNMENTS,
} from "@/components/editor/editorOptions";
import { FileManagementDrawer } from "@/components/files/FileManagementDrawer";
import { ProjectFileConflictBanner } from "@/components/files/ProjectFileConflictBanner";
import { StatsChartDiagram } from "@/components/diagrams/StatsChartDiagram";
import { Basic3DGraph } from "@/components/graphs/Basic3DGraph";
import { FunctionGraph } from "@/components/graphs/FunctionGraph";
import { Vector2DGraph } from "@/components/graphs/Vector2DGraph";
import { HeaderFileControls } from "@/components/header/HeaderFileControls";
import { DocumentNavigator, tocSummaryText } from "@/components/navigation/DocumentNavigator";
import { DocumentNavigatorRail } from "@/components/navigation/DocumentNavigatorRail";
import { NEW_TEST_TEMPLATES, NewTestDialog, type TitlePageTemplate } from "@/components/new-document/NewTestDialog";
import {
  PreviewContentBlocks as PreviewContentBlocksBase,
  type PreviewContentBlocksProps as PreviewContentBlocksBaseProps,
  type PreviewContentRenderers,
  type PreviewContentRuntime,
} from "@/components/preview/PreviewContentBlocks";
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
import { useEditorSelectionController } from "@/hooks/useEditorSelectionController";
import { useMauthActionProposalController } from "@/hooks/useMauthActionProposalController";
import { useProjectFileConflictController } from "@/hooks/useProjectFileConflictController";
import { useSolutionModeController } from "@/hooks/useSolutionModeController";
import { useSolutionSlotController } from "@/hooks/useSolutionSlotController";
import { useSolutionSurfaceCopyController } from "@/hooks/useSolutionSurfaceCopyController";
import { useSolutionValidationController } from "@/hooks/useSolutionValidationController";
import { useSystemStatusController } from "@/hooks/useSystemStatusController";
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
import { browserStorageItem } from "@/lib/browserStorage";
import {
  createEditorPersistence,
  type AutosavedEditorSnapshot as PersistedEditorSnapshot,
  type SavedDocumentSnapshot,
} from "@/lib/editorPersistence";
import { createEditorContentBlockFactory } from "@/lib/editorContentBlocks";
import { createEditorContentBlockNormalizer, spaceLines } from "@/lib/editorContentBlockNormalization";
import {
  alphaLabel,
  createEditorDocumentNormalizer,
  defaultDocumentFlow,
  normalizeItemOrder,
  orderItemKey,
  orderedPartItems,
  orderedQuestionItems,
  partAllowedOrderItems,
  questionAllowedOrderItems,
  relabelParts,
  romanLabel,
  safeMarkValue,
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
import { createEditorDocumentDuplicator } from "@/lib/editorDocumentDuplication";
import { defaultSolutionSlotLines, defaultSolutionSlotLinesForDocument } from "@/lib/solutionSlotDefaults";
import {
  normalizeChoiceItems,
  normalizeChoiceListLayout,
  normalizeChoiceNumberingStyle,
  normalizeColumnsBlock,
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
  schoolInitials,
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
  type TocItemKind,
} from "@/lib/documentNavigation";
import { DEFAULT_3D_GRAPH } from "@/lib/diagram3d";
import {
  DEFAULT_2D_GRAPH,
  graphFeaturesFromConfig,
  graphFunctionsFromConfig,
  graphHeight,
  graphWidth,
  isSolutionOnlyGraphFeature,
} from "@/lib/diagramGraph2d";
import { DEFAULT_GEOMETRY_2D_GRAPH, geometry2dData, geometry2dSummary } from "@/lib/diagramGeometry2d";
import { DEFAULT_IMAGE_DIAGRAM, finiteGraphNumber, imageDiagramData, imageDiagramName, imageDiagramAlt } from "@/lib/diagramImage";
import {
  DEFAULT_PENROSE_PRESET,
  DEFAULT_PENROSE_SCALE_PERCENT,
  SETS_PENROSE_PRESET,
  penroseOptions,
  penrosePreset,
  penroseScalePercent,
} from "@/lib/diagramPenrose";
import { DEFAULT_SET_DATA, DEFAULT_SET_DIAGRAM, generatedSetPenroseSubstance, normalizedSetDiagramData } from "@/lib/diagramSet";
import { DEFAULT_VECTOR_2D_GRAPH, DEFAULT_VECTOR_2D_METADATA, normalizedVector2DEntries } from "@/lib/diagramVector2d";
import { DEFAULT_NETWORK_DATA } from "@/lib/diagramNetwork";
import { keyboardDeleteRequested, keyboardMoveDirection, nativeKeyboardDeleteRequested } from "@/lib/editorKeyboardShortcuts";
import {
  measuredLineHeightPx,
  solutionSlotToleranceLines,
  validateSolutionCompleteness,
  type SolutionValidationRuntime,
} from "@/lib/solutionValidation";
import {
  isContentBlockVisible,
  isContentBlockVisibleInScope,
  isDiagramBesideContentBlockInScope,
  isSolutionReplacementBlock,
  isSolutionTextBlock,
  solutionBlockVisibility as contentBlockVisibility,
  solutionModeInsertedBlockVisibility,
  visibilityReplacementSlotAt,
  type SolutionInsertionBlockKind,
  type SolutionVisibilityReplacementSlotGroup,
} from "@/lib/solutionBlockVisibility";
import {
  SCROLL_ANCHOR_FRONT_MATTER,
  SCROLL_ANCHOR_SELECTOR,
  SCROLL_ANCHOR_TOP_OFFSET_PX,
  clamp,
  columnBlockParentScrollAnchor,
  columnChildScrollAnchor,
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
const A4_WIDTH_PX = 793.700787;
const A4_HEIGHT_PX = 1122.519685;
const DEFAULT_PAGE_FORMAT = {
  widthPx: A4_WIDTH_PX,
  heightPx: A4_HEIGHT_PX,
  paddingXPx: 76,
  paddingYPx: 76,
  showPageBreaks: true,
};
const DEFAULT_FORMATTING_CONFIG: FormattingConfig = {
  id: "high-school-mathematics-test",
  showMarks: true,
  marksStyle: "right-aligned",
  questionSpacing: "large",
  diagramPosition: "below",
  fontSize: "12pt",
  numbering: "numeric",
  sectionHeaders: true,
  page: {
    size: "A4",
    orientation: "portrait",
    ...DEFAULT_PAGE_FORMAT,
  },
};
const DEFAULT_WORKSHEET_FORMATTING_CONFIG: FormattingConfig = {
  ...DEFAULT_FORMATTING_CONFIG,
  id: "worksheet",
  showMarks: false,
  questionSpacing: "compact",
  fontSize: "11pt",
  sectionHeaders: false,
  page: {
    size: "A4",
    orientation: "portrait",
    ...DEFAULT_PAGE_FORMAT,
    paddingXPx: 56,
    paddingYPx: 52,
  },
};
const DEFAULT_NOTES_FORMATTING_CONFIG: FormattingConfig = {
  ...DEFAULT_WORKSHEET_FORMATTING_CONFIG,
  id: "math-notes",
  questionSpacing: "compact",
  fontSize: "11pt",
  sectionHeaders: true,
};
const QUESTION_GAP_PX = 32;
const WORKSHEET_QUESTION_GAP_PX = 16;
const PREVIEW_EDIT_CLICK_MOVE_TOLERANCE_PX = 6;
const SAVED_TEST_STORAGE_KEY = "mauth-studio.saved-tests.v1";
const CURRENT_DRAFT_STORAGE_KEY = "mauth-studio.current-draft.v1";
const STARTER_DOCUMENT_STORAGE_KEY = "mauth-studio.starter-document.v1";
const THEME_STORAGE_KEY = "mauth-studio.theme.v1";
const LEGACY_SAVED_TEST_STORAGE_KEY = "math-app.saved-tests.v1";
const LEGACY_CURRENT_DRAFT_STORAGE_KEY = "math-app.current-draft.v1";
const LEGACY_STARTER_DOCUMENT_STORAGE_KEY = "math-app.starter-document.v1";
const SCREENSHOT_STARTER_DOCUMENT_ID = "calculus-area-screenshot-questions-v4";
const AUTOSAVE_DEBOUNCE_MS = 900;
const LOCAL_DRAFT_DEBOUNCE_MS = 250;
const ACTIVE_PROJECT_FILE_SYNC_INTERVAL_MS = 4000;
const DEFAULT_FRONT_MATTER: FrontMatterConfig = {
  titlePageTemplate: "standard",
  logoId: STARTER_LOGOS[0].id,
  schoolName: "AUSTRALIAN\nCHRISTIAN COLLEGE",
  subjectTitle: "YEAR 10 MATHEMATICS",
  assessmentTitle: "TEST 2",
  nameLabel: "Name",
  markLabel: "Mark",
  startQuestionNumber: 1,
  showAssessmentSubtitle: false,
  assessmentSubtitle: "Calculator Free Section",
  showDeclaration: true,
  declarationTitle: "Parent/Guardian Declaration:",
  declarationBody:
    'I hereby confirm that the student named in this test has undertaken it according to the "Test Conditions" specified underneath, and that the completed assessment is the student\'s own work.',
  signatureLabel: "Signed:",
  signatureRole: "(parent/guardian)",
  showInstructions: true,
  instructionsTitle: "Test Conditions:",
  instructionsBody:
    "Time: 60 mins\n\n**All calculations** should be shown for full marks.\n\nPermitted items: ruler, pencils (or pens) and an eraser.\n\nStudents may use a scientific calculator.",
};
const DEFAULT_EXAM_TITLE_PAGE: ExamTitlePageConfig = {
  sectionPreset: "section-one-calculator-free",
  documentCode: "",
  authorityName: "",
  examHeading: "Semester One Examination, 2021",
  bookletTitle: "Question/Answer booklet",
  candidateLabelText: "",
  studentNumberLabel: "NAME:",
  studentNumberFiguresLabel: "",
  studentNumberWordsLabel: "",
  timeTitle: "Time allowed for this section",
  readingTimeLabel: "Reading time before commencing work:",
  readingTime: "five minutes",
  workingTimeLabel: "Working time:",
  workingTime: "fifty minutes",
  additionalBookletsLabel: "Number of additional\nanswer booklets used\n(if applicable):",
  materialsTitle: "Materials required/recommended for this section",
  supervisorMaterialsTitle: "To be provided by the supervisor",
  supervisorMaterials: "This Question/Answer booklet\nFormula sheet",
  candidateMaterialsTitle: "To be provided by the candidate",
  standardItemsLabel: "Standard items:",
  standardItems:
    "pens (blue/black preferred), pencils (including coloured), sharpener,\ncorrection fluid/tape, eraser, ruler, highlighters",
  specialItemsLabel: "Special items:",
  specialItems: "nil",
  importantNoteTitle: "Important note to candidates",
  importantNoteBody:
    "No other items may be taken into the examination room. It is your responsibility to ensure that you do not have any unauthorised material. If you have any unauthorised material with you, hand it to the supervisor before reading any further.",
  referenceText: "",
  bookletCode: "",
  courseHeader: "METHODS UNIT 3",
  sectionHeader: "CALCULATOR-FREE",
  structureTitle: "Structure of this paper",
  structureRows: [
    {
      id: "section-one",
      section: "Section One:\nCalculator-free",
      useCurrentDocument: true,
      questionsAvailable: 9,
      questionsToBeAnswered: 9,
      workingTimeMinutes: 50,
      marksAvailable: 53,
      percentage: 35,
    },
    {
      id: "section-two",
      section: "Section Two:\nCalculator-assumed",
      useCurrentDocument: false,
      questionsAvailable: 12,
      questionsToBeAnswered: 12,
      workingTimeMinutes: 100,
      marksAvailable: 97,
      percentage: 65,
    },
  ],
  instructionsTitle: "Instructions to candidates",
  instructionsBody:
    "1. The rules for the conduct of the Western Australian external examinations are detailed in the Year 12 Information Handbook 2020: Part II Examinations. Sitting this examination implies that you agree to abide by these rules.\n\n2. Write your answers in this Question/Answer booklet preferably using a blue/black pen. Do not use erasable or gel pens.\n\n3. You must be careful to confine your answers to the specific questions asked and to follow any instructions that are specific to a particular question.\n\n4. Show all your working clearly. Your working should be in sufficient detail to allow your answers to be checked readily and for marks to be awarded for reasoning. Incorrect answers given without supporting reasoning cannot be allocated any marks. For any question or part question worth more than two marks, valid working or justification is required to receive full marks. If you repeat any question, ensure that you cancel the answer you do not wish to have marked.\n\n5. It is recommended that you do not use pencil, except in diagrams.\n\n6. Supplementary pages for planning/continuing your answers to questions are provided at the end of this Question/Answer booklet. If you use these pages to continue an answer, indicate at the original answer where the answer is continued, i.e. give the page number.\n\n7. The Formula sheet is not to be handed in with your Question/Answer booklet.",
  footerText: "See next page",
  endOfQuestionsFooterText: "End of questions",
  supplementaryPageTitle: "Supplementary page",
  supplementaryQuestionNumberLabel: "Question number:",
  supplementaryPageCount: 0,
};
const DEFAULT_EXAM_FRONT_MATTER: FrontMatterConfig = {
  ...DEFAULT_FRONT_MATTER,
  titlePageTemplate: "exam",
  subjectTitle: "MATHEMATICS\nMETHODS\nUNIT 3",
  assessmentTitle: "Semester One Examination, 2021",
  showAssessmentSubtitle: true,
  assessmentSubtitle: "Section One:\nCalculator-free",
  showDeclaration: false,
  showInstructions: false,
  exam: DEFAULT_EXAM_TITLE_PAGE,
};
const DEFAULT_WORKSHEET_FRONT_MATTER: FrontMatterConfig = {
  ...DEFAULT_FRONT_MATTER,
  titlePageTemplate: "worksheet",
  subjectTitle: "Mathematics",
  assessmentTitle: "Worksheet",
  showAssessmentSubtitle: false,
  assessmentSubtitle: "",
  showDeclaration: false,
  showInstructions: false,
};
const DEFAULT_NOTES_FRONT_MATTER: FrontMatterConfig = {
  ...DEFAULT_FRONT_MATTER,
  titlePageTemplate: "notes",
  subjectTitle: "Mathematics",
  assessmentTitle: "Math Notes",
  nameLabel: "",
  markLabel: "",
  showAssessmentSubtitle: true,
  assessmentSubtitle: "Definitions, worked examples, diagrams, and reminders",
  showDeclaration: false,
  showInstructions: false,
};
const EXAM_SECTION_PRESETS: Array<{
  id: ExamSectionPresetId;
  label: string;
  assessmentSubtitle: string;
  sectionHeader: string;
  readingTime: string;
  workingTime: string;
  startQuestionNumber: number;
  supervisorMaterials: string;
  specialItems: string;
  currentRowId: string;
}> = [
  {
    id: "section-one-calculator-free",
    label: "Section One: Calculator-free",
    assessmentSubtitle: "Section One:\nCalculator-free",
    sectionHeader: "CALCULATOR-FREE",
    readingTime: "five minutes",
    workingTime: "fifty minutes",
    startQuestionNumber: 1,
    supervisorMaterials: "This Question/Answer booklet\nFormula sheet",
    specialItems: "nil",
    currentRowId: "section-one",
  },
  {
    id: "section-two-calculator-assumed",
    label: "Section Two: Calculator-assumed",
    assessmentSubtitle: "Section Two:\nCalculator-assumed",
    sectionHeader: "CALCULATOR-ASSUMED",
    readingTime: "ten minutes",
    workingTime: "one hundred minutes",
    startQuestionNumber: 10,
    supervisorMaterials: "This Question/Answer booklet\nFormula sheet (retained from Section One)",
    specialItems:
      "drawing instruments, templates, notes on one unfolded sheet of A4 paper,\nand up to three calculators, which can include scientific, graphic and\nComputer Algebra System (CAS) calculators, are permitted in this ATAR\ncourse examination",
    currentRowId: "section-two",
  },
];
const DEFAULT_GEOMETRIC_DATA = {
  objects: [
    { type: "point", name: "A" },
    { type: "point", name: "B" },
    { type: "point", name: "C" },
  ],
  relationships: [
    { type: "triangle", points: ["A", "B", "C"] },
    { type: "rightAngle", at: "B" },
    { type: "labelLength", between: ["A", "B"], value: "5" },
    { type: "labelLength", between: ["B", "C"], value: "12" },
  ],
};
const DEFAULT_GEOMETRIC_DIAGRAM: GraphConfig = {
  type: "geometricConstruction",
  data: DEFAULT_GEOMETRIC_DATA,
  style: DEFAULT_PENROSE_PRESET,
  options: { scalePercent: DEFAULT_PENROSE_SCALE_PERCENT, penrosePreset: DEFAULT_PENROSE_PRESET },
  scalePercent: DEFAULT_PENROSE_SCALE_PERCENT,
  penrosePreset: DEFAULT_PENROSE_PRESET,
  functions: [],
  features: [],
  metadata: {},
};
const DEFAULT_STATS_CHART: GraphConfig = {
  type: "statsChart",
  data: DEFAULT_STATS_CHART_SPEC.data,
  style: DEFAULT_STATS_CHART_SPEC.style,
  options: DEFAULT_STATS_CHART_SPEC.options,
  widthPx: DEFAULT_STATS_CHART_SPEC.options?.widthPx,
  heightPx: DEFAULT_STATS_CHART_SPEC.options?.heightPx,
  functions: [],
  features: [],
  metadata: {},
};
type ContentBlockKind = SolutionInsertionBlockKind;

type SubsectionDragKind = "question-block" | "part" | "part-block" | "subpart" | "subpart-block";
type SubsectionItemKind = "block" | "part" | "subpart";
type SubsectionContainerKind = "question" | "part" | "subpart";

interface SubsectionDragTarget {
  kind: SubsectionDragKind;
  questionId: string;
  id: string;
  partId?: string;
  subpartId?: string;
}

interface SubsectionContainerRef {
  kind: SubsectionContainerKind;
  questionId: string;
  partId?: string;
  subpartId?: string;
}

interface SubsectionDropIntent {
  container: SubsectionContainerRef;
  beforeItem?: ContainerOrderItem;
  beforeBlockId?: string;
}

type PanelDragRegion = "header" | "body";

const SUBSECTION_DRAG_MIME = "application/x-math-subsection";
const SUBSECTION_DRAG_TEXT_PREFIX = "math-subsection:";
const PAGE_BREAK_DRAG_MIME = "application/x-mauth-page-break";
const PAGE_BREAK_DRAG_TEXT_PREFIX = "mauth-page-break:";
const EDITOR_PAGE_BREAK_DRAG_MIME = "application/x-mauth-editor-page-break";
const EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX = "mauth-editor-page-break:";

interface SubsectionDropPreview {
  targetKey: string;
  placement: DropPlacement;
  intent: SubsectionDropIntent;
}

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

type EditorPageBreakTarget =
  | { kind: "part"; questionId: string; partId: string }
  | { kind: "subpart"; questionId: string; partId: string; subpartId: string };

interface EditorPageBreakDropPreview {
  targetKey: string;
  placement: Exclude<DropPlacement, "inside">;
  destination: EditorPageBreakTarget;
}

type PaneMode = "split" | "preview";
type ThemeMode = "light" | "dark";

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

type ExamSectionPresetId = "section-one-calculator-free" | "section-two-calculator-assumed";

interface ExamStructureRowConfig {
  id: string;
  section: string;
  useCurrentDocument?: boolean;
  questionsAvailable: number;
  questionsToBeAnswered: number;
  workingTimeMinutes: number;
  marksAvailable: number;
  percentage: number;
}

interface ExamTitlePageConfig {
  sectionPreset: ExamSectionPresetId;
  documentCode: string;
  authorityName: string;
  examHeading: string;
  bookletTitle: string;
  candidateLabelText: string;
  studentNumberLabel: string;
  studentNumberFiguresLabel: string;
  studentNumberWordsLabel: string;
  timeTitle: string;
  readingTimeLabel: string;
  readingTime: string;
  workingTimeLabel: string;
  workingTime: string;
  additionalBookletsLabel: string;
  materialsTitle: string;
  supervisorMaterialsTitle: string;
  supervisorMaterials: string;
  candidateMaterialsTitle: string;
  standardItemsLabel: string;
  standardItems: string;
  specialItemsLabel: string;
  specialItems: string;
  importantNoteTitle: string;
  importantNoteBody: string;
  referenceText: string;
  bookletCode: string;
  courseHeader: string;
  sectionHeader: string;
  structureTitle: string;
  structureRows: ExamStructureRowConfig[];
  instructionsTitle: string;
  instructionsBody: string;
  footerText: string;
  endOfQuestionsFooterText: string;
  supplementaryPageTitle: string;
  supplementaryQuestionNumberLabel: string;
  supplementaryPageCount: number;
}

interface FrontMatterConfig {
  titlePageTemplate: TitlePageTemplate;
  logoId: string;
  schoolName: string;
  subjectTitle: string;
  assessmentTitle: string;
  nameLabel: string;
  markLabel: string;
  startQuestionNumber: number;
  showAssessmentSubtitle: boolean;
  assessmentSubtitle: string;
  showDeclaration: boolean;
  declarationTitle: string;
  declarationBody: string;
  signatureLabel: string;
  signatureRole: string;
  showInstructions: boolean;
  instructionsTitle: string;
  instructionsBody: string;
  exam?: ExamTitlePageConfig;
}

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

function loadInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;

  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function assessmentTitleText(value: string) {
  return value
    .split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g)
    .map((segment) => (segment.startsWith("$") ? segment : segment.toUpperCase()))
    .join("");
}

function titlePageTemplateFromValue(value: unknown): TitlePageTemplate {
  if (value === "exam" || value === "worksheet" || value === "notes") return value;
  return "standard";
}

function titlePageTemplateLabel(template: TitlePageTemplate) {
  if (template === "exam") return "School exam booklet";
  if (template === "worksheet") return "Worksheet";
  if (template === "notes") return "Math notes";
  return "School test title page";
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function nonNegativeNumberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function examSectionPresetFromValue(value: unknown, fallback: ExamSectionPresetId = "section-one-calculator-free"): ExamSectionPresetId {
  return EXAM_SECTION_PRESETS.some((preset) => preset.id === value) ? (value as ExamSectionPresetId) : fallback;
}

function inferExamSectionPreset(record: Record<string, unknown> | null | undefined): ExamSectionPresetId {
  const stored = examSectionPresetFromValue(record?.sectionPreset, "section-one-calculator-free");
  if (EXAM_SECTION_PRESETS.some((preset) => preset.id === record?.sectionPreset)) return stored;

  const sectionHeader = typeof record?.sectionHeader === "string" ? record.sectionHeader.toLowerCase() : "";
  const assessmentSubtitle = typeof record?.assessmentSubtitle === "string" ? record.assessmentSubtitle.toLowerCase() : "";
  const combined = `${sectionHeader} ${assessmentSubtitle}`;
  return combined.includes("assumed") || combined.includes("section two") ? "section-two-calculator-assumed" : stored;
}

function examSectionPresetById(sectionPresetId: ExamSectionPresetId) {
  return EXAM_SECTION_PRESETS.find((preset) => preset.id === sectionPresetId) ?? EXAM_SECTION_PRESETS[0];
}

function examStructureRowsForSectionPreset(sectionPresetId: ExamSectionPresetId): ExamStructureRowConfig[] {
  const preset = examSectionPresetById(sectionPresetId);
  return DEFAULT_EXAM_TITLE_PAGE.structureRows.map((row) => ({
    ...row,
    useCurrentDocument: row.id === preset.currentRowId,
  }));
}

function examSectionPresetPatch(exam: ExamTitlePageConfig, sectionPresetId: ExamSectionPresetId): Partial<FrontMatterConfig> {
  const preset = examSectionPresetById(sectionPresetId);
  return {
    startQuestionNumber: preset.startQuestionNumber,
    showAssessmentSubtitle: true,
    assessmentSubtitle: preset.assessmentSubtitle,
    exam: {
      ...exam,
      sectionPreset: preset.id,
      sectionHeader: preset.sectionHeader,
      readingTime: preset.readingTime,
      workingTime: preset.workingTime,
      supervisorMaterials: preset.supervisorMaterials,
      specialItems: preset.specialItems,
      structureRows: examStructureRowsForSectionPreset(preset.id),
    },
  };
}

function normalizeExamStructureRow(value: unknown, fallback: ExamStructureRowConfig): ExamStructureRowConfig {
  const record = asRecord(value);
  return {
    id: stringOrDefault(record?.id, fallback.id || id("exam-section")),
    section: stringOrDefault(record?.section, fallback.section),
    useCurrentDocument: typeof record?.useCurrentDocument === "boolean" ? record.useCurrentDocument : fallback.useCurrentDocument,
    questionsAvailable: nonNegativeNumberOrDefault(record?.questionsAvailable, fallback.questionsAvailable),
    questionsToBeAnswered: nonNegativeNumberOrDefault(record?.questionsToBeAnswered, fallback.questionsToBeAnswered),
    workingTimeMinutes: nonNegativeNumberOrDefault(record?.workingTimeMinutes, fallback.workingTimeMinutes),
    marksAvailable: nonNegativeNumberOrDefault(record?.marksAvailable, fallback.marksAvailable),
    percentage: nonNegativeNumberOrDefault(record?.percentage, fallback.percentage),
  };
}

function normalizeExamTitlePage(value: unknown): ExamTitlePageConfig {
  const record = asRecord(value);
  const defaultRows = DEFAULT_EXAM_TITLE_PAGE.structureRows;
  const sourceRows = Array.isArray(record?.structureRows) && record.structureRows.length ? record.structureRows : defaultRows;
  const structureRows = sourceRows.map((row, index) => normalizeExamStructureRow(row, defaultRows[index] ?? defaultRows[0]));

  return {
    sectionPreset: inferExamSectionPreset(record),
    documentCode: stringOrDefault(record?.documentCode, DEFAULT_EXAM_TITLE_PAGE.documentCode),
    authorityName: stringOrDefault(record?.authorityName, DEFAULT_EXAM_TITLE_PAGE.authorityName),
    examHeading: stringOrDefault(record?.examHeading, DEFAULT_EXAM_TITLE_PAGE.examHeading),
    bookletTitle: stringOrDefault(record?.bookletTitle, DEFAULT_EXAM_TITLE_PAGE.bookletTitle),
    candidateLabelText: stringOrDefault(record?.candidateLabelText, DEFAULT_EXAM_TITLE_PAGE.candidateLabelText),
    studentNumberLabel: stringOrDefault(record?.studentNumberLabel, DEFAULT_EXAM_TITLE_PAGE.studentNumberLabel),
    studentNumberFiguresLabel: stringOrDefault(record?.studentNumberFiguresLabel, DEFAULT_EXAM_TITLE_PAGE.studentNumberFiguresLabel),
    studentNumberWordsLabel: stringOrDefault(record?.studentNumberWordsLabel, DEFAULT_EXAM_TITLE_PAGE.studentNumberWordsLabel),
    timeTitle: stringOrDefault(record?.timeTitle, DEFAULT_EXAM_TITLE_PAGE.timeTitle),
    readingTimeLabel: stringOrDefault(record?.readingTimeLabel, DEFAULT_EXAM_TITLE_PAGE.readingTimeLabel),
    readingTime: stringOrDefault(record?.readingTime, DEFAULT_EXAM_TITLE_PAGE.readingTime),
    workingTimeLabel: stringOrDefault(record?.workingTimeLabel, DEFAULT_EXAM_TITLE_PAGE.workingTimeLabel),
    workingTime: stringOrDefault(record?.workingTime, DEFAULT_EXAM_TITLE_PAGE.workingTime),
    additionalBookletsLabel: stringOrDefault(record?.additionalBookletsLabel, DEFAULT_EXAM_TITLE_PAGE.additionalBookletsLabel),
    materialsTitle: stringOrDefault(record?.materialsTitle, DEFAULT_EXAM_TITLE_PAGE.materialsTitle),
    supervisorMaterialsTitle: stringOrDefault(record?.supervisorMaterialsTitle, DEFAULT_EXAM_TITLE_PAGE.supervisorMaterialsTitle),
    supervisorMaterials: stringOrDefault(record?.supervisorMaterials, DEFAULT_EXAM_TITLE_PAGE.supervisorMaterials),
    candidateMaterialsTitle: stringOrDefault(record?.candidateMaterialsTitle, DEFAULT_EXAM_TITLE_PAGE.candidateMaterialsTitle),
    standardItemsLabel: stringOrDefault(record?.standardItemsLabel, DEFAULT_EXAM_TITLE_PAGE.standardItemsLabel),
    standardItems: stringOrDefault(record?.standardItems, DEFAULT_EXAM_TITLE_PAGE.standardItems),
    specialItemsLabel: stringOrDefault(record?.specialItemsLabel, DEFAULT_EXAM_TITLE_PAGE.specialItemsLabel),
    specialItems: stringOrDefault(record?.specialItems, DEFAULT_EXAM_TITLE_PAGE.specialItems),
    importantNoteTitle: stringOrDefault(record?.importantNoteTitle, DEFAULT_EXAM_TITLE_PAGE.importantNoteTitle),
    importantNoteBody: stringOrDefault(record?.importantNoteBody, DEFAULT_EXAM_TITLE_PAGE.importantNoteBody),
    referenceText: stringOrDefault(record?.referenceText, DEFAULT_EXAM_TITLE_PAGE.referenceText),
    bookletCode: stringOrDefault(record?.bookletCode, DEFAULT_EXAM_TITLE_PAGE.bookletCode),
    courseHeader: stringOrDefault(record?.courseHeader, DEFAULT_EXAM_TITLE_PAGE.courseHeader),
    sectionHeader: stringOrDefault(record?.sectionHeader, DEFAULT_EXAM_TITLE_PAGE.sectionHeader),
    structureTitle: stringOrDefault(record?.structureTitle, DEFAULT_EXAM_TITLE_PAGE.structureTitle),
    structureRows,
    instructionsTitle: stringOrDefault(record?.instructionsTitle, DEFAULT_EXAM_TITLE_PAGE.instructionsTitle),
    instructionsBody: stringOrDefault(record?.instructionsBody, DEFAULT_EXAM_TITLE_PAGE.instructionsBody),
    footerText: stringOrDefault(record?.footerText, DEFAULT_EXAM_TITLE_PAGE.footerText),
    endOfQuestionsFooterText: stringOrDefault(record?.endOfQuestionsFooterText, DEFAULT_EXAM_TITLE_PAGE.endOfQuestionsFooterText),
    supplementaryPageTitle: stringOrDefault(record?.supplementaryPageTitle, DEFAULT_EXAM_TITLE_PAGE.supplementaryPageTitle),
    supplementaryQuestionNumberLabel: stringOrDefault(
      record?.supplementaryQuestionNumberLabel,
      DEFAULT_EXAM_TITLE_PAGE.supplementaryQuestionNumberLabel,
    ),
    supplementaryPageCount: nonNegativeNumberOrDefault(record?.supplementaryPageCount, DEFAULT_EXAM_TITLE_PAGE.supplementaryPageCount),
  };
}

function normalizeFrontMatter(value: unknown): FrontMatterConfig | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FrontMatterConfig> & { showSectionHeading?: unknown; sectionHeading?: unknown };
  const startQuestionNumber =
    typeof candidate.startQuestionNumber === "number" && Number.isFinite(candidate.startQuestionNumber)
      ? Math.max(1, Math.floor(candidate.startQuestionNumber))
      : DEFAULT_FRONT_MATTER.startQuestionNumber;
  const showAssessmentSubtitle =
    typeof candidate.showAssessmentSubtitle === "boolean"
      ? candidate.showAssessmentSubtitle
      : typeof candidate.showSectionHeading === "boolean"
        ? candidate.showSectionHeading
        : DEFAULT_FRONT_MATTER.showAssessmentSubtitle;
  const assessmentSubtitle =
    typeof candidate.assessmentSubtitle === "string"
      ? candidate.assessmentSubtitle
      : typeof candidate.sectionHeading === "string"
        ? candidate.sectionHeading
        : DEFAULT_FRONT_MATTER.assessmentSubtitle;
  const titlePageTemplate = titlePageTemplateFromValue(candidate.titlePageTemplate);
  const rawAssessmentTitle =
    typeof candidate.assessmentTitle === "string" ? candidate.assessmentTitle : DEFAULT_FRONT_MATTER.assessmentTitle;
  return {
    titlePageTemplate,
    logoId: typeof candidate.logoId === "string" ? candidate.logoId : DEFAULT_FRONT_MATTER.logoId,
    schoolName: typeof candidate.schoolName === "string" ? candidate.schoolName : DEFAULT_FRONT_MATTER.schoolName,
    subjectTitle: typeof candidate.subjectTitle === "string" ? candidate.subjectTitle : DEFAULT_FRONT_MATTER.subjectTitle,
    assessmentTitle:
      titlePageTemplate === "worksheet" || titlePageTemplate === "notes" ? rawAssessmentTitle : assessmentTitleText(rawAssessmentTitle),
    nameLabel: typeof candidate.nameLabel === "string" ? candidate.nameLabel : DEFAULT_FRONT_MATTER.nameLabel,
    markLabel: typeof candidate.markLabel === "string" ? candidate.markLabel : DEFAULT_FRONT_MATTER.markLabel,
    startQuestionNumber,
    showAssessmentSubtitle,
    assessmentSubtitle,
    showDeclaration: typeof candidate.showDeclaration === "boolean" ? candidate.showDeclaration : DEFAULT_FRONT_MATTER.showDeclaration,
    declarationTitle: typeof candidate.declarationTitle === "string" ? candidate.declarationTitle : DEFAULT_FRONT_MATTER.declarationTitle,
    declarationBody: typeof candidate.declarationBody === "string" ? candidate.declarationBody : DEFAULT_FRONT_MATTER.declarationBody,
    signatureLabel: typeof candidate.signatureLabel === "string" ? candidate.signatureLabel : DEFAULT_FRONT_MATTER.signatureLabel,
    signatureRole: typeof candidate.signatureRole === "string" ? candidate.signatureRole : DEFAULT_FRONT_MATTER.signatureRole,
    showInstructions: typeof candidate.showInstructions === "boolean" ? candidate.showInstructions : DEFAULT_FRONT_MATTER.showInstructions,
    instructionsTitle:
      typeof candidate.instructionsTitle === "string" ? candidate.instructionsTitle : DEFAULT_FRONT_MATTER.instructionsTitle,
    instructionsBody: typeof candidate.instructionsBody === "string" ? candidate.instructionsBody : DEFAULT_FRONT_MATTER.instructionsBody,
    ...(titlePageTemplate === "exam" || candidate.exam ? { exam: normalizeExamTitlePage(candidate.exam) } : {}),
  };
}

function finiteNumberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePageFormattingConfig(value: unknown): NonNullable<FormattingConfig["page"]> {
  const record = asRecord(value);
  const defaultPage = DEFAULT_FORMATTING_CONFIG.page ?? {};
  return {
    size: typeof record?.size === "string" ? record.size : defaultPage.size,
    orientation: typeof record?.orientation === "string" ? record.orientation : defaultPage.orientation,
    widthPx: finiteNumberOrDefault(record?.widthPx, defaultPage.widthPx ?? DEFAULT_PAGE_FORMAT.widthPx),
    heightPx: finiteNumberOrDefault(record?.heightPx, defaultPage.heightPx ?? DEFAULT_PAGE_FORMAT.heightPx),
    paddingXPx: finiteNumberOrDefault(record?.paddingXPx, defaultPage.paddingXPx ?? DEFAULT_PAGE_FORMAT.paddingXPx),
    paddingYPx: finiteNumberOrDefault(record?.paddingYPx, defaultPage.paddingYPx ?? DEFAULT_PAGE_FORMAT.paddingYPx),
    showPageBreaks: typeof record?.showPageBreaks === "boolean" ? record.showPageBreaks : defaultPage.showPageBreaks,
  };
}

function normalizeFormattingConfig(value: unknown): FormattingConfig {
  const record = asRecord(value);
  return {
    id: typeof record?.id === "string" ? record.id : DEFAULT_FORMATTING_CONFIG.id,
    showMarks: typeof record?.showMarks === "boolean" ? record.showMarks : DEFAULT_FORMATTING_CONFIG.showMarks,
    marksStyle: typeof record?.marksStyle === "string" ? record.marksStyle : DEFAULT_FORMATTING_CONFIG.marksStyle,
    questionSpacing: typeof record?.questionSpacing === "string" ? record.questionSpacing : DEFAULT_FORMATTING_CONFIG.questionSpacing,
    diagramPosition: typeof record?.diagramPosition === "string" ? record.diagramPosition : DEFAULT_FORMATTING_CONFIG.diagramPosition,
    fontSize: typeof record?.fontSize === "string" ? record.fontSize : DEFAULT_FORMATTING_CONFIG.fontSize,
    numbering: typeof record?.numbering === "string" ? record.numbering : DEFAULT_FORMATTING_CONFIG.numbering,
    sectionHeaders: typeof record?.sectionHeaders === "boolean" ? record.sectionHeaders : DEFAULT_FORMATTING_CONFIG.sectionHeaders,
    page: normalizePageFormattingConfig(record?.page),
  };
}

function formattingConfigForPresetId(presetId: FormattingConfig["id"]): FormattingConfig {
  if (presetId === "worksheet") return cloneSerializable(DEFAULT_WORKSHEET_FORMATTING_CONFIG);
  if (presetId === "math-notes") return cloneSerializable(DEFAULT_NOTES_FORMATTING_CONFIG);
  return {
    ...cloneSerializable(DEFAULT_FORMATTING_CONFIG),
    id: presetId ?? DEFAULT_FORMATTING_CONFIG.id,
  };
}

function normalizedStartQuestionNumber(frontMatter: FrontMatterConfig) {
  return Math.max(1, Math.floor(frontMatter.startQuestionNumber || 1));
}

function questionDisplayNumber(frontMatter: FrontMatterConfig, questionIndex: number) {
  return normalizedStartQuestionNumber(frontMatter) + questionIndex;
}

function diagramAlignmentClass(alignment?: DiagramAlignment) {
  if (alignment === "left") return "justify-start";
  if (alignment === "right") return "justify-end";
  return "justify-center";
}

function normalizeDiagramTextSide(value: unknown): DiagramTextSide {
  return value === "left" || value === "right" ? value : "none";
}

function automaticDiagramTextSide(alignment?: DiagramAlignment): DiagramTextSide {
  if (alignment === "left") return "right";
  if (alignment === "right") return "left";
  return "none";
}

function effectiveDiagramTextSide(block: Extract<EditorContentBlock, { kind: "diagram" }>, hasBesideContent: boolean): DiagramTextSide {
  if (!hasBesideContent) return "none";
  return automaticDiagramTextSide(block.diagramAlign);
}

function normalizeDiagramType(type?: string | null) {
  if (type === "2d_graph" || type === "function" || type === "tangent" || type === "area") return "graph2d";
  if (type === "basic3d") return "graph3d";
  return DIAGRAM_TYPES.some((diagramType) => diagramType.value === type) ? (type as string) : DEFAULT_2D_GRAPH.type;
}

function isPenroseDiagramType(type?: string | null) {
  return type === "geometricConstruction" || type === "network" || type === "setDiagram";
}

function defaultPenrosePresetForType(type?: string | null) {
  return normalizeDiagramType(type) === "setDiagram" ? SETS_PENROSE_PRESET : DEFAULT_PENROSE_PRESET;
}

function defaultPenroseDataForType(type?: string | null) {
  const normalizedType = normalizeDiagramType(type);
  if (normalizedType === "setDiagram") return DEFAULT_SET_DATA;
  if (normalizedType === "network") return DEFAULT_NETWORK_DATA;
  return DEFAULT_GEOMETRIC_DATA;
}

function defaultPenroseDiagramForType(type?: string | null): GraphConfig {
  const normalizedType = isPenroseDiagramType(normalizeDiagramType(type)) ? normalizeDiagramType(type) : "geometricConstruction";
  if (normalizedType === "setDiagram") return { ...DEFAULT_SET_DIAGRAM };
  const preset = defaultPenrosePresetForType(normalizedType);
  return {
    ...DEFAULT_GEOMETRIC_DIAGRAM,
    type: normalizedType,
    data: defaultPenroseDataForType(normalizedType),
    style: preset,
    options: { scalePercent: DEFAULT_PENROSE_SCALE_PERCENT, penrosePreset: preset },
    penrosePreset: preset,
  };
}

function isImageDiagramType(type?: string | null) {
  return normalizeDiagramType(type) === "image";
}

function diagramTypePatch(type: string, current: GraphConfig): Partial<GraphConfig> {
  const normalizedType = normalizeDiagramType(type);
  if (isImageDiagramType(normalizedType)) return DEFAULT_IMAGE_DIAGRAM;
  if (isPenroseDiagramType(normalizedType)) return defaultPenroseDiagramForType(normalizedType);
  if (normalizedType === "statsChart") return DEFAULT_STATS_CHART;
  if (normalizedType === "geometry2d" && normalizeDiagramType(current.type) !== "geometry2d") return DEFAULT_GEOMETRY_2D_GRAPH;
  if (
    isImageDiagramType(current.type) ||
    isPenroseDiagramType(normalizeDiagramType(current.type)) ||
    normalizeDiagramType(current.type) === "statsChart"
  ) {
    if (normalizedType === "vector2d") return DEFAULT_VECTOR_2D_GRAPH;
    return normalizedType === "graph3d" ? DEFAULT_3D_GRAPH : { ...DEFAULT_2D_GRAPH, type: normalizedType };
  }
  if (normalizedType === "vector2d" && normalizeDiagramType(current.type) !== "vector2d") return DEFAULT_VECTOR_2D_GRAPH;
  if (normalizedType === "graph3d" && normalizeDiagramType(current.type) !== "graph3d") return DEFAULT_3D_GRAPH;
  if (normalizedType === "geometry2d") return DEFAULT_GEOMETRY_2D_GRAPH;
  return { type: normalizedType };
}

function penroseSubstanceSource(graphConfig: GraphConfig) {
  const key = "substanceSource";
  const value = graphConfig.options?.[key];
  return typeof value === "string" && value.trim() ? value : generatedPenroseSubstance(graphConfig);
}

function penroseIdentifier(value: unknown, fallback: string) {
  const source = String(value ?? "").trim();
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(source) ? source : fallback;
}

function penroseLabelValue(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}_%&#])/g, "\\$1");
}

function looksLikePenroseLatex(value: unknown) {
  return /\\|[_^{}]/.test(String(value ?? ""));
}

function penroseLabelStatement(name: string, label?: unknown) {
  if (label === undefined || label === null || label === "") return `Label ${name} $${name}$`;
  const source = String(label);
  if (source.startsWith("$") && source.endsWith("$")) return `Label ${name} ${source}`;
  if (looksLikePenroseLatex(source)) return `Label ${name} $${source}$`;
  return `Label ${name} $${penroseLabelValue(source)}$`;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function geometricSourceData(config: GraphConfig) {
  const fallback = normalizeDiagramType(config.type) === "network" ? DEFAULT_NETWORK_DATA : DEFAULT_GEOMETRIC_DATA;
  const data = asRecord(config.data) ?? asRecord(fallback);
  const objects = recordArray(data?.objects);
  const relationships = recordArray(data?.relationships);
  return { data: data ?? {}, objects, relationships };
}

function relationshipPointNames(relationship: Record<string, unknown>) {
  const pointSources = [
    relationship.points,
    relationship.between,
    relationship.first,
    relationship.second,
    relationship.segmentA,
    relationship.segmentB,
  ];
  const points = pointSources.flatMap((source) => (Array.isArray(source) ? source : []));
  [relationship.a, relationship.at, relationship.b, relationship.c].forEach((point) => {
    if (typeof point === "string") points.push(point);
  });
  if (Array.isArray(relationship.segments)) {
    relationship.segments.forEach((segment) => {
      if (Array.isArray(segment)) points.push(...segment);
    });
  }
  return points.filter((point): point is string => typeof point === "string");
}

function trianglePoints(relationships: Array<Record<string, unknown>>, fallback: string[]) {
  const triangle = relationships.find((relationship) => relationship.type === "triangle");
  const points = Array.isArray(triangle?.points)
    ? triangle.points.map((point, index) => penroseIdentifier(point, fallback[index] ?? `P${index + 1}`))
    : [];
  return points.length === 3 ? points : fallback.slice(0, 3);
}

function rightAnglePointsForSource(relationships: Array<Record<string, unknown>>, triangle: string[]) {
  const rightAngle = relationships.find((relationship) => relationship.type === "rightAngle");
  if (Array.isArray(rightAngle?.points) && rightAngle.points.length === 3) {
    return rightAngle.points.map((point, index) => penroseIdentifier(point, triangle[index] ?? `P${index + 1}`));
  }
  const at = penroseIdentifier(rightAngle?.at, triangle[1] ?? "B");
  const others = triangle.filter((point) => point !== at);
  return others.length >= 2 ? [others[0], at, others[1]] : null;
}

function penroseMarkCount(value: unknown) {
  const count = Math.round(Number(value ?? 1));
  return Number.isFinite(count) ? Math.max(1, Math.min(3, count)) : 1;
}

function penroseEqualLengthPredicate(count: number) {
  if (count === 2) return "EqualLength2";
  if (count === 3) return "EqualLength3";
  return "EqualLength";
}

function penroseAngleMarkPredicate(count: number) {
  if (count === 2) return "AngleMark2";
  if (count === 3) return "AngleMark3";
  return "AngleMark";
}

function penroseAnglePoints(relationship: Record<string, unknown>) {
  const points = Array.isArray(relationship.points)
    ? relationship.points
    : [relationship.a, relationship.at ?? relationship.b, relationship.c];
  return points.length === 3 ? points.map((point, index) => penroseIdentifier(point, `P${index + 1}`)) : null;
}

function generatedPenroseSubstance(config: GraphConfig) {
  if (normalizeDiagramType(config.type) === "setDiagram") return generatedSetPenroseSubstance(config);

  const { data, objects, relationships } = geometricSourceData(config);
  const isNetworkDiagram = normalizeDiagramType(config.type) === "network";
  const hideNetworkPoints = isNetworkDiagram && data.hidePoints === true;
  const hideNetworkPointLabels = isNetworkDiagram && data.hidePointLabels === true;
  const points = new Map<string, Record<string, unknown>>();
  objects.forEach((object, index) => {
    if (object?.type !== "point") return;
    const name = penroseIdentifier(object.name, `P${index + 1}`);
    points.set(name, { ...object, name });
  });
  relationships.forEach((relationship) => {
    const equalLengthRelatedPoints =
      relationship?.type === "equalLength"
        ? (() => {
            const first =
              relationship.first ?? relationship.segmentA ?? (Array.isArray(relationship.segments) ? relationship.segments[0] : undefined);
            const second =
              relationship.second ?? relationship.segmentB ?? (Array.isArray(relationship.segments) ? relationship.segments[1] : undefined);
            return Array.isArray(first) && Array.isArray(second) ? [...first, ...second] : [];
          })()
        : [];
    const relatedPoints =
      relationship?.type === "triangle" && Array.isArray(relationship.points)
        ? relationship.points
        : relationship?.type === "equalLength"
          ? equalLengthRelatedPoints.filter(Boolean)
          : relationship?.type === "segment" || relationship?.type === "vectorSegment" || relationship?.type === "labelLength"
            ? relationshipPointNames(relationship)
            : relationship?.type === "angleMark" || relationship?.type === "labelAngle"
              ? (penroseAnglePoints(relationship) ?? [])
              : [];
    relatedPoints.forEach((point, index) => {
      const name = penroseIdentifier(point, `P${index + 1}`);
      if (!points.has(name)) points.set(name, { type: "point", name });
    });
  });
  const pointEntries = [...points.values()];
  const pointNames = pointEntries.map((point, index) => penroseIdentifier(point.name, `P${index + 1}`));
  const lines = [`Point ${pointNames.length ? pointNames.join(", ") : "A, B, C"}`];
  pointEntries.forEach((point, index) => {
    const pointName = pointNames[index] ?? `P${index + 1}`;
    const hideLabel = point.hideLabel === true || point.showLabel === false || hideNetworkPointLabels;
    lines.push(penroseLabelStatement(pointName, hideLabel ? "\\," : (point.label ?? pointName)));
  });
  pointEntries.forEach((point, index) => {
    if (point.hidePoint === true || point.hidden === true || point.showPoint === false || hideNetworkPoints) {
      lines.push(`HidePoint(${pointNames[index] ?? `P${index + 1}`})`);
    }
  });
  const namedSegments = relationships
    .filter(
      (relationship) => (relationship.type === "segment" || relationship.type === "vectorSegment") && typeof relationship.name === "string",
    )
    .map((relationship, index) => penroseIdentifier(relationship.name, `s${index + 1}`));
  if (namedSegments.length) lines.push(`NamedSegment ${namedSegments.join(", ")}`);
  const lengthLabels = relationships.filter((relationship) => relationship.type === "labelLength" && Array.isArray(relationship.between));
  const segmentLabels = relationships.filter(
    (relationship) =>
      (relationship.type === "segment" || relationship.type === "vectorSegment") &&
      String(relationship.label ?? relationship.value ?? "").trim().length > 0,
  );
  const angleLabels = relationships.filter((relationship) => relationship.type === "labelAngle" && penroseAnglePoints(relationship));
  const labelDeclarations = [
    ...lengthLabels.map((_, index) => `sideLabel${index + 1}`),
    ...segmentLabels.map((_, index) => `segmentLabel${index + 1}`),
    ...angleLabels.map((_, index) => `angleLabel${index + 1}`),
  ];
  if (labelDeclarations.length) lines.push(`LengthLabel ${labelDeclarations.join(", ")}`);
  relationships.forEach((relationship) => {
    if (relationship.type === "triangle" && Array.isArray(relationship.points) && relationship.points.length === 3) {
      lines.push(`Triangle(${relationship.points.map((point, index) => penroseIdentifier(point, `P${index + 1}`)).join(", ")})`);
    }
    if (relationship.type === "rightAngle") {
      const ordered = rightAnglePointsForSource(relationships, trianglePoints(relationships, pointNames));
      if (ordered) lines.push(`RightAngle(${ordered.join(", ")})`);
    }
    if (relationship.type === "equalLength") {
      const first =
        relationship.first ?? relationship.segmentA ?? (Array.isArray(relationship.segments) ? relationship.segments[0] : undefined);
      const second =
        relationship.second ?? relationship.segmentB ?? (Array.isArray(relationship.segments) ? relationship.segments[1] : undefined);
      if (Array.isArray(first) && Array.isArray(second) && first.length === 2 && second.length === 2) {
        const predicate = penroseEqualLengthPredicate(
          penroseMarkCount(relationship.marks ?? relationship.markCount ?? relationship.tickCount ?? relationship.count),
        );
        lines.push(`${predicate}(${[...first, ...second].map((point, index) => penroseIdentifier(point, `P${index + 1}`)).join(", ")})`);
      } else {
        const segmentNames = Array.isArray(relationship.segmentNames) ? relationship.segmentNames : [first, second];
        if (segmentNames.length !== 2 || !segmentNames.every((name) => typeof name === "string")) return;
        const predicate = penroseEqualLengthPredicate(
          penroseMarkCount(relationship.marks ?? relationship.markCount ?? relationship.tickCount ?? relationship.count),
        );
        lines.push(`${predicate}(${segmentNames.map((name, index) => penroseIdentifier(name, `s${index + 1}`)).join(", ")})`);
      }
    }
    if (relationship.type === "segment") {
      const segmentName = typeof relationship.name === "string" ? penroseIdentifier(relationship.name, "s") : null;
      const points = Array.isArray(relationship.points)
        ? relationship.points
        : Array.isArray(relationship.between)
          ? relationship.between
          : [];
      if (segmentName && points.length === 2) {
        lines.push(`Segment(${segmentName}, ${penroseIdentifier(points[0], "A")}, ${penroseIdentifier(points[1], "B")})`);
      }
    }
    if (relationship.type === "vectorSegment") {
      const segmentName = typeof relationship.name === "string" ? penroseIdentifier(relationship.name, "s") : null;
      const points = Array.isArray(relationship.points)
        ? relationship.points
        : Array.isArray(relationship.between)
          ? relationship.between
          : [];
      if (segmentName && points.length === 2) {
        lines.push(`VectorSegment(${segmentName}, ${penroseIdentifier(points[0], "A")}, ${penroseIdentifier(points[1], "B")})`);
      }
    }
    if (relationship.type === "angleMark") {
      const points = penroseAnglePoints(relationship);
      if (!points) return;
      const predicate = penroseAngleMarkPredicate(
        penroseMarkCount(relationship.marks ?? relationship.markCount ?? relationship.arcCount ?? relationship.count),
      );
      lines.push(`${predicate}(${points.join(", ")})`);
    }
  });
  lengthLabels.forEach((relationship, index) => {
    const between = Array.isArray(relationship.between) ? relationship.between : [];
    if (between.length !== 2) return;
    const labelName = `sideLabel${index + 1}`;
    lines.push(penroseLabelStatement(labelName, relationship.value));
    lines.push(`LabelsSegment(${labelName}, ${penroseIdentifier(between[0], "A")}, ${penroseIdentifier(between[1], "B")})`);
  });
  segmentLabels.forEach((relationship, index) => {
    const points = Array.isArray(relationship.points)
      ? relationship.points
      : Array.isArray(relationship.between)
        ? relationship.between
        : [];
    if (points.length !== 2) return;
    const labelName = `segmentLabel${index + 1}`;
    lines.push(penroseLabelStatement(labelName, relationship.label ?? relationship.value));
    lines.push(`LabelsSegment(${labelName}, ${penroseIdentifier(points[0], "A")}, ${penroseIdentifier(points[1], "B")})`);
  });
  angleLabels.forEach((relationship, index) => {
    const points = penroseAnglePoints(relationship);
    if (!points) return;
    const labelName = `angleLabel${index + 1}`;
    lines.push(penroseLabelStatement(labelName, relationship.value ?? relationship.label));
    lines.push(`LabelsAngle(${labelName}, ${points.join(", ")})`);
  });
  return `${lines.join("\n")}\n`;
}

function withGraphDefaults(graphConfig?: GraphConfig | null): GraphConfig {
  const type = normalizeDiagramType(graphConfig?.type);
  if (type === "geometry2d") {
    return {
      ...DEFAULT_GEOMETRY_2D_GRAPH,
      ...(graphConfig ?? {}),
      type,
      data: geometry2dData(graphConfig),
      functions: [],
      features: [],
      metadata: graphConfig?.metadata ?? {},
    };
  }
  const functions = graphFunctionsFromConfig(graphConfig);
  const features = graphFeaturesFromConfig(graphConfig);
  const firstFunction = functions[0];
  if (isPenroseDiagramType(type)) {
    const defaults = defaultPenroseDiagramForType(type);
    return {
      ...defaults,
      ...(graphConfig ?? {}),
      type,
      data: graphConfig?.data ?? defaults.data,
      style: penrosePreset(graphConfig),
      options: penroseOptions(graphConfig),
      functions: graphConfig?.functions ?? [],
      features: graphConfig?.features ?? [],
      widthPx: undefined,
      heightPx: undefined,
      scalePercent: penroseScalePercent(graphConfig),
      penrosePreset: penrosePreset(graphConfig),
      metadata: graphConfig?.metadata ?? {},
    };
  }
  if (type === "statsChart") {
    const spec = normalizeStatsChartSpec(graphConfig);
    return {
      ...DEFAULT_STATS_CHART,
      ...(graphConfig ?? {}),
      type,
      data: spec.data,
      style: spec.style,
      options: spec.options,
      widthPx: spec.options?.widthPx,
      heightPx: spec.options?.heightPx,
      functions: [],
      features: [],
      metadata: graphConfig?.metadata ?? {},
    };
  }
  if (type === "image") {
    return {
      ...DEFAULT_IMAGE_DIAGRAM,
      ...(graphConfig ?? {}),
      type,
      data: imageDiagramData(graphConfig),
      functions: [],
      features: [],
      widthPx: finiteGraphNumber(graphConfig?.widthPx, DEFAULT_IMAGE_DIAGRAM.widthPx),
      heightPx: finiteGraphNumber(graphConfig?.heightPx, DEFAULT_IMAGE_DIAGRAM.heightPx),
      metadata: graphConfig?.metadata ?? {},
    };
  }
  if (type === "vector2d") {
    return {
      ...DEFAULT_VECTOR_2D_GRAPH,
      ...(graphConfig ?? {}),
      type,
      functions: [],
      features: [],
      metadata: graphConfig?.metadata ?? DEFAULT_VECTOR_2D_METADATA,
    };
  }
  if (type === "graph3d") {
    return {
      ...DEFAULT_3D_GRAPH,
      ...(graphConfig ?? {}),
      type,
      functions: [],
      features: [],
      metadata: {
        ...DEFAULT_3D_GRAPH.metadata,
        ...(graphConfig?.metadata ?? {}),
      },
    };
  }
  return {
    ...DEFAULT_2D_GRAPH,
    ...(graphConfig ?? {}),
    type,
    expression: graphConfig?.expression ?? firstFunction?.expression ?? DEFAULT_2D_GRAPH.expression,
    latex: graphConfig?.latex ?? firstFunction?.latex ?? DEFAULT_2D_GRAPH.latex,
    functions,
    features,
    functionExtensionLeft: graphConfig?.functionExtensionLeft ?? graphConfig?.functionExtension ?? DEFAULT_2D_GRAPH.functionExtensionLeft,
    functionExtensionRight:
      graphConfig?.functionExtensionRight ?? graphConfig?.functionExtension ?? DEFAULT_2D_GRAPH.functionExtensionRight,
    metadata: graphConfig?.metadata ?? {},
  };
}

function updateGraphConfig(graphConfig: GraphConfig, patch: Partial<GraphConfig>): GraphConfig {
  const next = {
    ...withGraphDefaults(graphConfig),
    ...patch,
    functions: patch.functions
      ? graphFunctionsFromConfig({ ...graphConfig, functions: patch.functions })
      : withGraphDefaults(graphConfig).functions,
    features: patch.features
      ? graphFeaturesFromConfig({ ...graphConfig, features: patch.features })
      : withGraphDefaults(graphConfig).features,
    metadata: patch.metadata ?? graphConfig.metadata ?? {},
  };
  if (patch.functions) {
    next.expression = next.functions?.[0]?.expression ?? "";
    next.latex = next.functions?.[0]?.latex || next.functions?.[0]?.expression || "";
  }
  return next;
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

const { normalizeContentBlocks } = createEditorContentBlockNormalizer({
  id,
  defaultGraphConfig: DEFAULT_2D_GRAPH,
  withGraphDefaults,
  normalizeDiagramTextSide,
});

const { normalizeQuestionBlocks, normalizeSectionHeadings, normalizeDocumentFlow } = createEditorDocumentNormalizer({
  id,
  normalizeContentBlocks,
});

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

function containerKey(container?: SubsectionContainerRef | null) {
  if (!container) return "";
  return `${container.kind}:${container.questionId}:${container.partId ?? ""}:${container.subpartId ?? ""}`;
}

function containerDropKey(container: SubsectionContainerRef, placement: "start" | "end") {
  return `container:${containerKey(container)}:${placement}`;
}

function itemDropKey(container: SubsectionContainerRef, beforeItem: ContainerOrderItem) {
  return `container:${containerKey(container)}:before:${orderItemKey(beforeItem)}`;
}

function containerDropZoneLabel(container: SubsectionContainerRef, placement: "start" | "end") {
  const scope = container.kind === "question" ? "question" : container.kind;
  return placement === "start" ? `Drop at start of ${scope}` : `Drop at end of ${scope}`;
}

function itemDropZoneLabel(beforeItem: ContainerOrderItem) {
  if (beforeItem.kind === "part") return "Drop above part";
  if (beforeItem.kind === "subpart") return "Drop above subpart";
  return "Drop above module";
}

function createQuestion(): QuestionBlock {
  return {
    id: id("question"),
    section: "Algebra",
    text: "",
    marks: 0,
    contentBlocks: [],
    parts: [],
    itemOrder: [],
    pageBreakAfter: false,
  };
}

function createNotesSection(): QuestionBlock {
  const introBlock: EditorContentBlock = {
    id: id("text"),
    kind: "text",
    text: "Use this space for definitions, worked examples, diagrams, tables, columns, and reminders.",
  };
  return {
    id: id("notes"),
    section: "Introduction",
    text: "",
    marks: 0,
    contentBlocks: [introBlock],
    parts: [],
    itemOrder: [{ kind: "block", id: introBlock.id }],
    pageBreakAfter: false,
  };
}

function createScreenshotStarterFrontMatter(): FrontMatterConfig {
  return {
    ...DEFAULT_FRONT_MATTER,
    subjectTitle: "YEAR 12 MATHEMATICS",
    assessmentTitle: "TEST 2",
    showDeclaration: false,
    showAssessmentSubtitle: false,
    assessmentSubtitle: "",
    showInstructions: true,
    instructionsTitle: "Test Conditions:",
    instructionsBody: "**All working** should be shown for full marks.",
  };
}

function starterDiagramBlock(graphConfig: GraphConfig, diagramAlign: DiagramAlignment = "center"): EditorContentBlock {
  return {
    id: id("diagram"),
    kind: "diagram",
    diagramAlign,
    graphConfig: withGraphDefaults(graphConfig),
  };
}

function starterQuestion(contentBlocks: EditorContentBlock[], marks: number, section = "Calculus"): QuestionBlock {
  return {
    id: id("question"),
    section,
    marks,
    contentBlocks,
    parts: [],
    itemOrder: contentBlocks.map((block) => ({ kind: "block", id: block.id })),
    pageBreakAfter: false,
  };
}

function starterPart(contentBlocks: EditorContentBlock[], marks: number): EditorPart {
  return {
    id: id("part"),
    label: "",
    text: "",
    marks,
    pageBreakBefore: false,
    contentBlocks,
    subparts: [],
    itemOrder: contentBlocks.map((block) => ({ kind: "block", id: block.id })),
  };
}

function starterPartsQuestion(intro: string, parts: EditorPart[], section = "Calculus"): QuestionBlock {
  const introBlock = textBlock(intro);
  const labelledParts = relabelParts(parts);
  return {
    id: id("question"),
    section,
    marks: 0,
    contentBlocks: [introBlock],
    parts: labelledParts,
    itemOrder: [{ kind: "block", id: introBlock.id }, ...labelledParts.map((part) => ({ kind: "part" as const, id: part.id }))],
    pageBreakAfter: false,
  };
}

function shadedAreaGraphConfig(): GraphConfig {
  return {
    ...DEFAULT_2D_GRAPH,
    expression: "2*x + 1",
    latex: "2x+1",
    functions: [
      {
        id: id("function"),
        kind: "expression",
        expression: "2*x + 1",
        latex: "2x+1",
        label: "f",
        color: "#111111",
        strokeWidth: 2,
        strokeStyle: "solid",
        show: true,
        showLabel: false,
        domainMode: "manual",
        domainMin: -1.2,
        domainMax: 4.15,
        functionExtensionMode: "auto",
        pieces: [],
      },
      {
        id: id("function"),
        kind: "expression",
        expression: "x^2 - 3*x + 5",
        latex: "x^2-3x+5",
        label: "g",
        color: "#111111",
        strokeWidth: 2,
        strokeStyle: "solid",
        show: true,
        showLabel: false,
        domainMode: "manual",
        domainMin: -0.95,
        domainMax: 4.15,
        functionExtensionMode: "auto",
        pieces: [],
      },
    ],
    features: [
      {
        id: id("feature"),
        kind: "region_between_curves",
        functionAIndex: 0,
        functionBIndex: 1,
        xMin: 0,
        xMax: 1,
        color: "#111111",
        fillOpacity: 0.16,
        labelMode: "none",
        show: true,
      },
      {
        id: id("feature"),
        kind: "region_between_curves",
        functionAIndex: 0,
        functionBIndex: 1,
        xMin: 1,
        xMax: 4,
        color: "#111111",
        fillOpacity: 0.16,
        labelMode: "none",
        show: true,
      },
      {
        id: id("feature"),
        kind: "label",
        label: "y=2x+1",
        color: "#111111",
        show: true,
        x: 4.55,
        y: 8.8,
        labelMode: "name",
      },
      {
        id: id("feature"),
        kind: "label",
        label: "y=x^2-3x+5",
        color: "#111111",
        show: true,
        x: 3.65,
        y: 4.0,
        labelMode: "name",
      },
    ],
    xMin: -1.5,
    xMax: 5,
    yMin: -1,
    yMax: 10,
    widthPx: 620,
    heightPx: 390,
    equalScale: false,
    showGrid: false,
    showMajorGrid: false,
    showMinorGrid: false,
    showGridBorder: false,
    showAxes: true,
    showArrows: true,
    showAxisLabels: true,
    showAxisNumbers: true,
    showFunctionArrows: true,
    axisLabelStepX: 1,
    axisLabelStepY: 1,
  };
}

function binomialDistributionGraphConfig(): GraphConfig {
  return {
    ...DEFAULT_STATS_CHART,
    data: {
      chartType: "binomial",
      trials: 8,
      probability: 0.8,
      xLabel: "Number of successes",
      yLabel: "Probability",
    },
    options: {
      ...DEFAULT_STATS_CHART.options,
      widthPx: 560,
      heightPx: 340,
      showGrid: false,
      showFill: true,
      fillColor: "#f5f5f5",
      fillOpacity: 1,
      interactive: false,
    },
    widthPx: 560,
    heightPx: 340,
  };
}

function createScreenshotStarterQuestions(): QuestionBlock[] {
  return [
    starterPartsQuestion("Answer the following trigonometric calculus questions.", [
      starterPart(
        [textBlock("Find the equation of the tangent to the curve $y=\\cos(3x)$ at the point where $x=\\frac{\\pi}{6}$."), spaceBlock(8)],
        5,
      ),
      starterPart(
        [textBlock("Differentiate with respect to $t$.\n\n$$\\frac{d}{dt}\\left(\\frac{\\sin^3 t}{t^2}\\right)$$"), spaceBlock(7)],
        2,
      ),
      starterPart([textBlock("Differentiate with respect to $x$.\n\n$$\\frac{d}{dx}\\left(\\sin^2 x\\right)$$"), spaceBlock(4)], 1),
      starterPart([textBlock("Find the indefinite integral.\n\n$$\\int \\sin x\\cos 3x-\\sin 3x\\cos x\\,dx$$"), spaceBlock(6)], 2),
    ]),
    starterQuestion(
      [
        textBlock(
          "Find, but **do not evaluate**, an expression to calculate the total area of the shaded regions in the following diagram.",
        ),
        starterDiagramBlock(shadedAreaGraphConfig()),
        spaceBlock(8),
      ],
      4,
    ),
    starterQuestion(
      [
        textBlock("Given a binomially distributed variable $X$ has $E(X)=1$ and $\\operatorname{Var}(X)=0.8$, find $n$ and $p$."),
        spaceBlock(5),
      ],
      2,
      "Statistics",
    ),
    starterQuestion(
      [
        textBlock("Which of the following distributions does the graph below represent?"),
        choiceListBlock([
          "$X \\sim \\operatorname{Bin}(8,0.2)$",
          "$X \\sim \\operatorname{Bin}(8,0.8)$",
          "$X \\sim \\operatorname{Bin}(8,0.5)$",
        ]),
        starterDiagramBlock(binomialDistributionGraphConfig(), "right"),
        spaceBlock(3),
      ],
      1,
      "Statistics",
    ),
  ];
}

function isBlankStarterQuestion(question?: QuestionBlock) {
  return (
    Boolean(question) &&
    question?.marks === 0 &&
    question.contentBlocks.length === 0 &&
    question.parts.length === 0 &&
    question.itemOrder.length === 0 &&
    !question.pageBreakAfter
  );
}

function shouldSeedScreenshotStarter(questions: QuestionBlock[]) {
  if (typeof window === "undefined") return false;
  if (browserStorageItem(STARTER_DOCUMENT_STORAGE_KEY, LEGACY_STARTER_DOCUMENT_STORAGE_KEY)) return false;
  return questions.length === 1 && isBlankStarterQuestion(questions[0]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizedDocumentFlowFromState(
  previousQuestions: QuestionBlock[],
  questions: QuestionBlock[],
  sectionHeadings: DocumentSectionHeading[],
  documentFlow: DocumentFlowItem[],
) {
  const normalizedFlow = normalizeDocumentFlow(documentFlow, previousQuestions, sectionHeadings);
  const headingIds = new Set(sectionHeadings.map((heading) => heading.id));
  const nextQuestionItems = questions.map((question) => ({ kind: "question", id: question.id }) satisfies DocumentFlowItem);
  const reconciled: DocumentFlowItem[] = [];
  let nextQuestionIndex = 0;

  normalizedFlow.forEach((item) => {
    if (item.kind === "sectionHeading") {
      if (headingIds.has(item.id)) reconciled.push(item);
      return;
    }
    const nextQuestionItem = nextQuestionItems[nextQuestionIndex];
    if (nextQuestionItem) {
      reconciled.push(nextQuestionItem);
      nextQuestionIndex += 1;
    }
  });

  while (nextQuestionIndex < nextQuestionItems.length) {
    reconciled.push(nextQuestionItems[nextQuestionIndex]);
    nextQuestionIndex += 1;
  }

  return normalizeDocumentFlow(reconciled, questions, sectionHeadings);
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

function markLabel(marks: number) {
  return `(${marks} mark${marks === 1 ? "" : "s"})`;
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

function subsectionKey(target?: SubsectionDragTarget | null) {
  if (!target) return "";
  return `${target.kind}:${target.questionId}:${target.partId ?? ""}:${target.subpartId ?? ""}:${target.id}`;
}

function isSubsectionDragKind(value: string | undefined): value is SubsectionDragKind {
  return value === "question-block" || value === "part" || value === "part-block" || value === "subpart" || value === "subpart-block";
}

function isSubsectionContainerKind(value: string | undefined): value is SubsectionContainerKind {
  return value === "question" || value === "part" || value === "subpart";
}

function isContainerOrderItemKind(value: string | undefined): value is ContainerOrderItem["kind"] {
  return value === "block" || value === "part" || value === "subpart";
}

function subsectionTargetDataAttributes(target: SubsectionDragTarget): Record<string, string> {
  return {
    "data-subsection-target-kind": target.kind,
    "data-subsection-target-question-id": target.questionId,
    "data-subsection-target-id": target.id,
    ...(target.partId ? { "data-subsection-target-part-id": target.partId } : {}),
    ...(target.subpartId ? { "data-subsection-target-subpart-id": target.subpartId } : {}),
  };
}

function subsectionContainerDataAttributes(container: SubsectionContainerRef): Record<string, string> {
  return {
    "data-subsection-container-kind": container.kind,
    "data-subsection-container-question-id": container.questionId,
    ...(container.partId ? { "data-subsection-container-part-id": container.partId } : {}),
    ...(container.subpartId ? { "data-subsection-container-subpart-id": container.subpartId } : {}),
  };
}

function subsectionTargetFromDataset(dataset: DOMStringMap): SubsectionDragTarget | null {
  const kind = dataset.subsectionTargetKind;
  const questionId = dataset.subsectionTargetQuestionId;
  const id = dataset.subsectionTargetId;
  if (!isSubsectionDragKind(kind) || !questionId || !id) return null;
  if ((kind === "part-block" || kind === "subpart" || kind === "subpart-block") && !dataset.subsectionTargetPartId) return null;
  if (kind === "subpart-block" && !dataset.subsectionTargetSubpartId) return null;
  return {
    kind,
    questionId,
    id,
    ...(dataset.subsectionTargetPartId ? { partId: dataset.subsectionTargetPartId } : {}),
    ...(dataset.subsectionTargetSubpartId ? { subpartId: dataset.subsectionTargetSubpartId } : {}),
  };
}

function subsectionContainerFromDataset(dataset: DOMStringMap): SubsectionContainerRef | null {
  const kind = dataset.subsectionContainerKind;
  const questionId = dataset.subsectionContainerQuestionId;
  if (!isSubsectionContainerKind(kind) || !questionId) return null;
  if ((kind === "part" || kind === "subpart") && !dataset.subsectionContainerPartId) return null;
  if (kind === "subpart" && !dataset.subsectionContainerSubpartId) return null;
  return {
    kind,
    questionId,
    ...(dataset.subsectionContainerPartId ? { partId: dataset.subsectionContainerPartId } : {}),
    ...(dataset.subsectionContainerSubpartId ? { subpartId: dataset.subsectionContainerSubpartId } : {}),
  };
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

function subsectionItemKind(target: SubsectionDragTarget): SubsectionItemKind {
  if (target.kind === "part") return "part";
  if (target.kind === "subpart") return "subpart";
  return "block";
}

function subsectionSourceContainer(target: SubsectionDragTarget): SubsectionContainerRef {
  if (target.kind === "question-block" || target.kind === "part") return { kind: "question", questionId: target.questionId };
  if (target.kind === "part-block" || target.kind === "subpart") {
    return { kind: "part", questionId: target.questionId, partId: target.partId };
  }
  return { kind: "subpart", questionId: target.questionId, partId: target.partId, subpartId: target.subpartId };
}

function subsectionOrderItem(target: SubsectionDragTarget): ContainerOrderItem | null {
  if (target.kind === "question-block" || target.kind === "part-block" || target.kind === "subpart-block") {
    return { kind: "block", id: target.id };
  }
  if (target.kind === "part") return { kind: "part", id: target.id };
  if (target.kind === "subpart") return { kind: "subpart", id: target.id };
  return null;
}

function canDropIntoContainer(active: SubsectionDragTarget, container: SubsectionContainerRef) {
  const activeKind = subsectionItemKind(active);
  if (activeKind === "part") return container.kind === "question";
  if (activeKind === "subpart") return container.kind === "part";
  return true;
}

function findPartInQuestions(questions: QuestionBlock[], questionId: string, partId?: string) {
  if (!partId) return null;
  return questions.find((question) => question.id === questionId)?.parts.find((part) => part.id === partId) ?? null;
}

function findSubpartInQuestions(questions: QuestionBlock[], questionId: string, partId?: string, subpartId?: string) {
  if (!subpartId) return null;
  return findPartInQuestions(questions, questionId, partId)?.subparts.find((subpart) => subpart.id === subpartId) ?? null;
}

function orderItemsForContainer(questions: QuestionBlock[], container: SubsectionContainerRef): ContainerOrderItem[] {
  if (container.kind === "question") {
    const question = questions.find((current) => current.id === container.questionId);
    return question ? normalizeItemOrder(question.itemOrder, questionAllowedOrderItems(question.contentBlocks, question.parts ?? [])) : [];
  }

  if (container.kind === "part") {
    const part = findPartInQuestions(questions, container.questionId, container.partId);
    return part ? normalizeItemOrder(part.itemOrder, partAllowedOrderItems(part.contentBlocks, part.subparts ?? [])) : [];
  }

  const subpart = findSubpartInQuestions(questions, container.questionId, container.partId, container.subpartId);
  return subpart?.contentBlocks.filter((block) => block.kind !== "pageBreak").map((block) => ({ kind: "block", id: block.id })) ?? [];
}

function withoutOrderItem(items: ContainerOrderItem[], item?: ContainerOrderItem | null) {
  if (!item) return items;
  const key = orderItemKey(item);
  return items.filter((current) => orderItemKey(current) !== key);
}

function nextOrderItemInContainer(
  questions: QuestionBlock[],
  container: SubsectionContainerRef,
  item: ContainerOrderItem,
  skipItem?: ContainerOrderItem | null,
) {
  const items = withoutOrderItem(orderItemsForContainer(questions, container), skipItem);
  const index = items.findIndex((current) => orderItemKey(current) === orderItemKey(item));
  return index >= 0 ? items[index + 1] : undefined;
}

function firstOrderItemInContainer(questions: QuestionBlock[], container: SubsectionContainerRef, skipItem?: ContainerOrderItem | null) {
  return withoutOrderItem(orderItemsForContainer(questions, container), skipItem)[0];
}

function subsectionDropWouldKeepSameOrder(
  active: SubsectionDragTarget,
  container: SubsectionContainerRef,
  beforeItem: ContainerOrderItem | undefined,
  questions: QuestionBlock[],
) {
  const activeContainer = subsectionSourceContainer(active);
  if (containerKey(activeContainer) !== containerKey(container)) return false;

  const activeItem = subsectionOrderItem(active);
  if (!activeItem) return false;

  const orderedKeys = orderItemsForContainer(questions, container).map(orderItemKey);
  const activeIndex = orderedKeys.indexOf(orderItemKey(activeItem));
  if (activeIndex < 0) return false;

  if (!beforeItem) return activeIndex === orderedKeys.length - 1;

  const beforeKey = orderItemKey(beforeItem);
  const beforeIndex = orderedKeys.indexOf(beforeKey);
  return beforeIndex === activeIndex || beforeIndex === activeIndex + 1;
}

function dropIntentForContainer(
  active: SubsectionDragTarget,
  container: SubsectionContainerRef,
  questions: QuestionBlock[],
  placement: "start" | "end" = "end",
): SubsectionDropIntent | null {
  if (!canDropIntoContainer(active, container)) return null;
  const beforeItem = placement === "start" ? firstOrderItemInContainer(questions, container, subsectionOrderItem(active)) : undefined;
  if (subsectionDropWouldKeepSameOrder(active, container, beforeItem, questions)) return null;

  if (container.kind === "subpart") {
    return {
      container,
      beforeBlockId: beforeItem?.kind === "block" ? beforeItem.id : undefined,
    };
  }

  return { container, beforeItem };
}

function dropIntentBeforeOrderItem(
  active: SubsectionDragTarget,
  container: SubsectionContainerRef,
  beforeItem: ContainerOrderItem,
  questions: QuestionBlock[],
): SubsectionDropIntent | null {
  if (!canDropIntoContainer(active, container)) return null;
  const activeItem = subsectionOrderItem(active);
  if (subsectionDropWouldKeepSameOrder(active, container, beforeItem, questions)) return null;
  const orderedItems = withoutOrderItem(orderItemsForContainer(questions, container), activeItem);
  if (!orderedItems.some((item) => orderItemKey(item) === orderItemKey(beforeItem))) return null;

  if (container.kind === "subpart") {
    return beforeItem.kind === "block" ? { container, beforeBlockId: beforeItem.id } : null;
  }

  return { container, beforeItem };
}

function subsectionDropIntent(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  placement: Exclude<DropPlacement, "inside">,
  questions: QuestionBlock[],
): SubsectionDropIntent | null {
  if (subsectionKey(active) === subsectionKey(target)) return null;
  const targetItem = subsectionOrderItem(target);
  if (!targetItem) return null;
  const activeItem = subsectionOrderItem(active);
  const targetContainer = subsectionSourceContainer(target);
  if (!canDropIntoContainer(active, targetContainer)) return null;

  const beforeItem = placement === "before" ? targetItem : nextOrderItemInContainer(questions, targetContainer, targetItem, activeItem);
  if (subsectionDropWouldKeepSameOrder(active, targetContainer, beforeItem, questions)) return null;
  if (targetContainer.kind === "subpart") {
    return {
      container: targetContainer,
      beforeBlockId: beforeItem?.kind === "block" ? beforeItem.id : undefined,
    };
  }

  return { container: targetContainer, beforeItem };
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

function subsectionDropPreviewTargetKey(target: SubsectionDragTarget, preview: Pick<SubsectionDropPreview, "placement" | "intent">) {
  if (preview.placement === "inside") return subsectionKey(target);
  const beforeItem =
    preview.intent.beforeItem ??
    (preview.intent.beforeBlockId ? ({ kind: "block", id: preview.intent.beforeBlockId } satisfies ContainerOrderItem) : undefined);
  return beforeItem ? itemDropKey(preview.intent.container, beforeItem) : containerDropKey(preview.intent.container, "end");
}

function serializeSubsectionDrag(target: SubsectionDragTarget) {
  return JSON.stringify(target);
}

function parseSubsectionDrag(payload: string): SubsectionDragTarget | null {
  if (!payload) return null;
  const json = payload.startsWith(SUBSECTION_DRAG_TEXT_PREFIX) ? payload.slice(SUBSECTION_DRAG_TEXT_PREFIX.length) : payload;
  try {
    const parsed = JSON.parse(json) as Partial<SubsectionDragTarget>;
    if (!parsed.kind || !parsed.questionId || !parsed.id) return null;
    if (!["question-block", "part", "part-block", "subpart", "subpart-block"].includes(parsed.kind)) return null;
    return {
      kind: parsed.kind as SubsectionDragKind,
      questionId: parsed.questionId,
      id: parsed.id,
      partId: parsed.partId,
      subpartId: parsed.subpartId,
    };
  } catch {
    return null;
  }
}

function parsePageBreakDrag(payload: string, allowRaw = false) {
  if (!payload) return "";
  if (payload.startsWith(PAGE_BREAK_DRAG_TEXT_PREFIX)) return payload.slice(PAGE_BREAK_DRAG_TEXT_PREFIX.length);
  return allowRaw ? payload : "";
}

function editorPageBreakKey(target?: EditorPageBreakTarget | null) {
  if (!target) return "";
  return target.kind === "part"
    ? `part:${target.questionId}:${target.partId}`
    : `subpart:${target.questionId}:${target.partId}:${target.subpartId}`;
}

function editorPageBreakTargetKey(target: SubsectionDragTarget) {
  return `editor-page-break-target:${subsectionKey(target)}`;
}

function serializeEditorPageBreakDrag(target: EditorPageBreakTarget) {
  return JSON.stringify(target);
}

function parseEditorPageBreakDrag(payload: string): EditorPageBreakTarget | null {
  if (!payload) return null;
  const json = payload.startsWith(EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX) ? payload.slice(EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX.length) : payload;
  try {
    const parsed = JSON.parse(json) as Partial<EditorPageBreakTarget>;
    if (parsed.kind === "part" && parsed.questionId && parsed.partId) {
      return { kind: "part", questionId: parsed.questionId, partId: parsed.partId };
    }
    if (parsed.kind === "subpart" && parsed.questionId && parsed.partId && parsed.subpartId) {
      return { kind: "subpart", questionId: parsed.questionId, partId: parsed.partId, subpartId: parsed.subpartId };
    }
    return null;
  } catch {
    return null;
  }
}

function questionMarks(question: QuestionBlock) {
  if (question.parts.length) {
    return question.parts.reduce((sum, part) => sum + partMarks(part), 0);
  }
  return Math.max(0, Number(question.marks) || 0);
}

function partMarks(part: EditorPart) {
  const subparts = part.subparts ?? [];
  if (subparts.length) return subparts.reduce((sum, subpart) => sum + Number(subpart.marks || 0), 0);
  return Number(part.marks || 0);
}

function visibleContentBlocks(blocks: EditorContentBlock[], showSolutions: boolean) {
  return blocks.filter((_, blockIndex) => isContentBlockVisibleInScope(blocks, blockIndex, showSolutions));
}

function firstTextSource(blocks: EditorContentBlock[], showSolutions = true): string {
  const visibleBlocks = visibleContentBlocks(blocks, showSolutions);
  const textBlock = visibleBlocks.find((block) => block.kind === "text");
  if (textBlock?.kind === "text") return textBlock.text?.replace(/\s+/g, " ").trim() || "";
  const columnsBlock = visibleBlocks.find((block) => block.kind === "columns");
  if (columnsBlock?.kind === "columns") {
    const nestedText = normalizeColumnsBlock(columnsBlock)
      .columns.map((column) => firstTextSource(column, showSolutions))
      .find(Boolean);
    if (nestedText) return nestedText;
  }
  const choicesBlock = visibleBlocks.find((block) => block.kind === "choices");
  if (choicesBlock?.kind === "choices") return normalizeChoiceItems(choicesBlock.choices).filter(Boolean).join("; ");
  const tableContentBlock = visibleBlocks.find((block) => block.kind === "table");
  if (tableContentBlock?.kind === "table") {
    const table = normalizeTableBlock(tableContentBlock);
    return `${plainTableRows(table).length} row table`;
  }
  return "";
}

function partPanelSummary(blocks: EditorContentBlock[], showSolutions = true) {
  return firstTextSource(blocks, showSolutions);
}

const TEST_SOLUTION_COLOR = "#1d4ed8";

type VisibilityReplacementSlotGroup = SolutionVisibilityReplacementSlotGroup;

function visibilityReplacementSlotAtOrderedItems(
  items: Array<OrderedQuestionItem | OrderedPartItem>,
  startIndex: number,
): (VisibilityReplacementSlotGroup & { endItemIndex: number }) | null {
  const contiguousBlocks: EditorContentBlock[] = [];
  const itemIndexes: number[] = [];
  for (let cursor = startIndex; cursor < items.length; cursor += 1) {
    const item = items[cursor];
    if (item.kind !== "block") break;
    contiguousBlocks.push(item.block);
    itemIndexes.push(cursor);
  }

  const slot = visibilityReplacementSlotAt(contiguousBlocks, 0);
  if (!slot) return null;
  return {
    ...slot,
    endItemIndex: itemIndexes[slot.endIndex] ?? startIndex,
  };
}

function replacementSlotContainingOrderedBlock(items: Array<OrderedQuestionItem | OrderedPartItem>, itemIndex: number) {
  const item = items[itemIndex];
  if (item?.kind !== "block") return null;

  const directSlot = visibilityReplacementSlotAtOrderedItems(items, itemIndex);
  if (directSlot) return directSlot;

  for (let cursor = itemIndex - 1; cursor >= 0; cursor -= 1) {
    const candidate = items[cursor];
    if (candidate?.kind !== "block" || candidate.block.kind === "pageBreak" || !isSolutionReplacementBlock(candidate.block)) break;
    const slot = visibilityReplacementSlotAtOrderedItems(items, cursor);
    if (slot && itemIndex <= slot.endItemIndex) return slot;
  }

  return null;
}

function isOrderedUnpairedStudentAnswerSpace(items: Array<OrderedQuestionItem | OrderedPartItem>, itemIndex: number) {
  const item = items[itemIndex];
  return Boolean(
    item?.kind === "block" &&
    item.block.kind === "space" &&
    contentBlockVisibility(item.block) === "student" &&
    !replacementSlotContainingOrderedBlock(items, itemIndex),
  );
}

function isOrderedBlockVisible(items: Array<OrderedQuestionItem | OrderedPartItem>, itemIndex: number, showSolutions: boolean) {
  const item = items[itemIndex];
  if (item?.kind !== "block") return false;
  if (showSolutions && isOrderedUnpairedStudentAnswerSpace(items, itemIndex)) return true;
  return isContentBlockVisible(item.block, showSolutions);
}

function isOrderedDiagramBesideContentBlock(
  items: Array<OrderedQuestionItem | OrderedPartItem>,
  itemIndex: number,
  showSolutions: boolean,
) {
  const item = items[itemIndex];
  return Boolean(
    item?.kind === "block" &&
    (item.block.kind === "text" || item.block.kind === "space") &&
    isOrderedBlockVisible(items, itemIndex, showSolutions),
  );
}

function graphConfigForSolutionVisibility(graphConfig: GraphConfig, showSolutions: boolean) {
  if (showSolutions || !graphConfig.features?.some(isSolutionOnlyGraphFeature)) return graphConfig;
  return {
    ...graphConfig,
    features: graphConfig.features.filter((feature) => !isSolutionOnlyGraphFeature(feature)),
  };
}

function choiceLabel(style: ChoiceNumberingStyle | undefined, index: number) {
  const normalizedStyle = normalizeChoiceNumberingStyle(style);
  if (normalizedStyle === "bullet") return "•";
  if (normalizedStyle === "decimal") return `${index + 1}.`;
  if (normalizedStyle === "upper-alpha") return `${alphaLabel(index).toUpperCase()}.`;
  if (normalizedStyle === "lower-alpha") return `${alphaLabel(index)}.`;
  return `${romanLabel(index)}.`;
}

function UploadedImageDiagram({ graphConfig }: { graphConfig?: GraphConfig | null }) {
  const config = withGraphDefaults(graphConfig);
  const data = imageDiagramData(config);
  const widthPx = graphWidth(config);
  const heightPx = graphHeight(config);

  if (!data.src) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-xs text-slate-500"
        style={{ width: widthPx, maxWidth: "100%", height: heightPx }}
      >
        No image selected
      </div>
    );
  }

  return (
    <img
      className="block max-w-full bg-white object-contain"
      src={data.src}
      alt={imageDiagramAlt(config)}
      style={{ width: widthPx, height: "auto", maxHeight: heightPx }}
    />
  );
}

function DiagramPreview({
  graphConfig,
  anchor,
  measureOnly = false,
  showSolutions = true,
  solutionTone = false,
  onGraphConfigChange,
}: {
  graphConfig?: GraphConfig | null;
  anchor?: string;
  measureOnly?: boolean;
  showSolutions?: boolean;
  solutionTone?: boolean;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
}) {
  const baseConfig = withGraphDefaults(graphConfig);
  const hasHiddenSolutionFeatures = !showSolutions && Boolean(baseConfig.features?.some(isSolutionOnlyGraphFeature));
  const config = graphConfigForSolutionVisibility(baseConfig, showSolutions);
  const visibleGraphConfigChange = hasHiddenSolutionFeatures ? undefined : onGraphConfigChange;
  const solutionColor = solutionTone && showSolutions ? TEST_SOLUTION_COLOR : undefined;
  const solutionFeatureColor = showSolutions ? TEST_SOLUTION_COLOR : undefined;

  if (measureOnly) {
    return <div className="w-full overflow-hidden bg-white" style={{ height: graphHeight(config), maxWidth: graphWidth(config) }} />;
  }

  switch (config.type) {
    case "image":
      return <UploadedImageDiagram graphConfig={config} />;
    case "geometricConstruction":
    case "network":
    case "setDiagram":
      return <GeometricConstructionDiagram graphConfig={config} />;
    case "statsChart":
      return <StatsChartDiagram graphConfig={config} />;
    case "geometry2d":
      return <FunctionGraph graphConfig={config} previewAnchor={anchor} onGraphConfigChange={visibleGraphConfigChange} />;
    case "vector2d":
      return <Vector2DGraph graphConfig={config} onGraphConfigChange={visibleGraphConfigChange} />;
    case "graph3d":
    case "basic3d":
      return <Basic3DGraph graphConfig={config} onGraphConfigChange={visibleGraphConfigChange} />;
    case "graph2d":
    case "2d_graph":
    case "function":
    default:
      return (
        <FunctionGraph
          graphConfig={config}
          previewAnchor={anchor}
          solutionColor={solutionColor}
          solutionFeatureColor={solutionFeatureColor}
          onGraphConfigChange={visibleGraphConfigChange}
        />
      );
  }
}

function solutionValidationRuntime(frontMatter: FrontMatterConfig): SolutionValidationRuntime<QuestionBlock, EditorPart, EditorSubpart> {
  return {
    alphaLabel,
    contentBlockVisibility,
    defaultSolutionSlotLines,
    graphHeight,
    normalizeChoiceItems,
    normalizeTableBlock,
    orderedPartItems,
    orderedQuestionItems,
    partScrollAnchor,
    plainTableRows: (table) => plainTableRows(table as ReturnType<typeof normalizeTableBlock>),
    questionDisplayNumber: (questionIndex) => questionDisplayNumber(frontMatter, questionIndex),
    questionScrollAnchor,
    romanLabel,
    spaceLines,
    subpartScrollAnchor,
    visibilityReplacementSlotAt,
    withGraphDefaults,
  };
}

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
  renderDiagram: (props) => <DiagramPreview {...props} />,
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

function contentBlocksHaveDiagram(blocks: EditorContentBlock[], showSolutions = true): boolean {
  return blocks.some((block, blockIndex) => {
    if (!isContentBlockVisibleInScope(blocks, blockIndex, showSolutions)) return false;
    if (block.kind === "diagram") return true;
    if (block.kind === "columns")
      return normalizeColumnsBlock(block).columns.some((column) => contentBlocksHaveDiagram(column, showSolutions));
    return false;
  });
}

function contentBlocksHaveVisibilityReplacementSlot(blocks: EditorContentBlock[]): boolean {
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    if (block.kind === "pageBreak") continue;
    if (visibilityReplacementSlotAt(blocks, blockIndex)) return true;
    if (block.kind === "columns") {
      const columns = normalizeColumnsBlock(block).columns;
      if (columns.some(contentBlocksHaveVisibilityReplacementSlot)) return true;
    }
  }
  return false;
}

function promptTextBlock(id: string, text?: string): Extract<EditorContentBlock, { kind: "text" }> | null {
  const trimmed = text?.trim();
  return trimmed ? { id, kind: "text", text: trimmed } : null;
}

interface PreviewSegment {
  id: string;
  kind: "worksheet-header" | "notes-header" | "section-heading" | "question-start" | "question-block" | "part-group" | "page-break";
  questionIndex?: number;
  spacingTop: number;
  sectionHeading?: DocumentSectionHeading;
  question?: QuestionBlock;
  block?: EditorContentBlock;
  blocks?: EditorContentBlock[];
  part?: EditorPart;
  partItems?: OrderedPartItem[];
  partIndex?: number;
  showPartLabel?: boolean;
}

interface PreviewGraphConfigChange {
  questionId: string;
  blockId: string;
  graphConfig: GraphConfig;
  partId?: string;
  subpartId?: string;
}

interface PreviewPage {
  segmentIndexes: number[];
  overflow: boolean;
}

interface PreviewPageSegmentEntry {
  segment: PreviewSegment;
  segmentPageIndex: number;
}

interface PreviewQuestionSegmentGroup {
  id: string;
  question?: QuestionBlock;
  entries: PreviewPageSegmentEntry[];
}

type PageFormat = typeof DEFAULT_PAGE_FORMAT;

function pageFormatFromConfig(formattingConfig?: FormattingConfig): PageFormat {
  const page = formattingConfig?.page;
  return {
    widthPx: page?.widthPx ?? DEFAULT_PAGE_FORMAT.widthPx,
    heightPx: page?.heightPx ?? DEFAULT_PAGE_FORMAT.heightPx,
    paddingXPx: page?.paddingXPx ?? DEFAULT_PAGE_FORMAT.paddingXPx,
    paddingYPx: page?.paddingYPx ?? DEFAULT_PAGE_FORMAT.paddingYPx,
    showPageBreaks: page?.showPageBreaks ?? DEFAULT_PAGE_FORMAT.showPageBreaks,
  };
}

function pageStyle(pageFormat: PageFormat, scale = 1) {
  return {
    "--a4-page-width": `${pageFormat.widthPx}px`,
    "--a4-page-height": `${pageFormat.heightPx}px`,
    "--a4-page-padding-x": `${pageFormat.paddingXPx}px`,
    "--a4-page-padding-y": `${pageFormat.paddingYPx}px`,
    "--a4-preview-scale": String(scale),
    "--a4-preview-page-width": `${pageFormat.widthPx * scale}px`,
    "--a4-preview-page-height": `${pageFormat.heightPx * scale}px`,
    "--a4-preview-page-gap": `${16 * scale}px`,
  } as CSSProperties & Record<`--${string}`, string>;
}

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

function pagesAreEqual(left: PreviewPage[], right: PreviewPage[]) {
  if (left.length !== right.length) return false;
  return left.every((page, pageIndex) => {
    const other = right[pageIndex];
    return page.overflow === other.overflow && page.segmentIndexes.join(",") === other.segmentIndexes.join(",");
  });
}

function groupPreviewPageSegments(entries: PreviewPageSegmentEntry[]): PreviewQuestionSegmentGroup[] {
  const groups: PreviewQuestionSegmentGroup[] = [];

  for (const entry of entries) {
    if (!entry.segment.question) {
      groups.push({
        id: entry.segment.id,
        entries: [entry],
      });
      continue;
    }

    const previousGroup = groups.at(-1);
    if (previousGroup?.question?.id === entry.segment.question.id) {
      previousGroup.entries.push(entry);
      continue;
    }

    groups.push({
      id: `${entry.segment.question.id}:${entry.segmentPageIndex}`,
      question: entry.segment.question,
      entries: [entry],
    });
  }

  return groups;
}

function A4PreviewPageFrame({ children, last = false }: { children: ReactNode; last?: boolean }) {
  return <div className={cn("a4-page-frame", last && "a4-page-frame-last")}>{children}</div>;
}

function frontMatterPageCount(frontMatter: FrontMatterConfig) {
  if (frontMatter.titlePageTemplate === "worksheet" || frontMatter.titlePageTemplate === "notes") return 0;
  return frontMatter.titlePageTemplate === "exam" ? 2 : 1;
}

function examQuestionPageReservedHeight(frontMatter: FrontMatterConfig) {
  return frontMatter.titlePageTemplate === "exam" ? 86 : 0;
}

function bookletSupplementaryPageCount(frontMatter: FrontMatterConfig, contentPageCount: number) {
  if (frontMatter.titlePageTemplate !== "exam") return 0;
  const exam = normalizeExamTitlePage(frontMatter.exam);
  const basePageCount = frontMatterPageCount(frontMatter) + contentPageCount;
  const minimumSupplementaryPages = Math.max(0, exam.supplementaryPageCount);
  const pageCountWithMinimum = basePageCount + minimumSupplementaryPages;
  return minimumSupplementaryPages + ((4 - (pageCountWithMinimum % 4)) % 4);
}

function partGroupPageBreakSegment(question: QuestionBlock, questionIndex: number, part: EditorPart, suffix: string): PreviewSegment {
  return {
    id: `${question.id}:part-group:${part.id}:page-break:${suffix}`,
    kind: "page-break",
    questionIndex,
    spacingTop: 0,
    question,
  };
}

function pushPartGroupSegment({
  segments,
  question,
  questionIndex,
  part,
  partIndex,
  itemIndex,
  partItems,
  segmentIndex,
}: {
  segments: PreviewSegment[];
  question: QuestionBlock;
  questionIndex: number;
  part: EditorPart;
  partIndex: number;
  itemIndex: number;
  partItems: OrderedPartItem[];
  segmentIndex: number;
}) {
  segments.push({
    id: `${question.id}:part-group:${part.id}:${segmentIndex}`,
    kind: "part-group",
    questionIndex,
    spacingTop: itemIndex === 0 && segmentIndex === 0 ? 12 : 18,
    question,
    part,
    partItems,
    partIndex: Math.max(0, partIndex),
    showPartLabel: segmentIndex === 0,
  });
}

function questionSpacingPx(formattingConfig?: FormattingConfig) {
  const spacing = normalizeFormattingConfig(formattingConfig).questionSpacing;
  if (spacing === "compact") return WORKSHEET_QUESTION_GAP_PX;
  if (spacing === "tight") return 10;
  return QUESTION_GAP_PX;
}

function buildPreviewSegments(
  frontMatter: FrontMatterConfig,
  questions: QuestionBlock[],
  sectionHeadings: DocumentSectionHeading[],
  documentFlow: DocumentFlowItem[],
  showSolutions: boolean,
  formattingConfig?: FormattingConfig,
): PreviewSegment[] {
  const gapPx = questionSpacingPx(formattingConfig);
  const questionSegmentsById = new Map<string, PreviewSegment[]>();
  questions.forEach((question, questionIndex) => {
    const segments: PreviewSegment[] = [
      {
        id: `${question.id}:start`,
        kind: "question-start",
        questionIndex,
        spacingTop: gapPx,
        question,
      },
    ];

    const questionItems = orderedQuestionItems(question);
    for (let itemIndex = 0; itemIndex < questionItems.length; itemIndex += 1) {
      const item = questionItems[itemIndex];
      if (item.kind === "block") {
        const nextItem = questionItems[itemIndex + 1];
        const replacementSlotFollows = visibilityReplacementSlotAtOrderedItems(questionItems, itemIndex + 1);
        if (
          item.block.kind === "diagram" &&
          isOrderedBlockVisible(questionItems, itemIndex, showSolutions) &&
          replacementSlotFollows &&
          effectiveDiagramTextSide(item.block, true) !== "none"
        ) {
          segments.push({
            id: `${question.id}:block:${item.block.id}:${replacementSlotFollows.blocks.map((block) => block.id).join(":")}`,
            kind: "question-block",
            questionIndex,
            spacingTop: itemIndex === 0 ? 8 : 12,
            question,
            block: item.block,
            blocks: [item.block, ...replacementSlotFollows.blocks],
          });
          itemIndex = replacementSlotFollows.endItemIndex;
          continue;
        }
        const replacementSlot = visibilityReplacementSlotAtOrderedItems(questionItems, itemIndex);
        if (replacementSlot) {
          segments.push({
            id: `${question.id}:block:${replacementSlot.blocks.map((block) => block.id).join(":")}`,
            kind: "question-block",
            questionIndex,
            spacingTop: itemIndex === 0 ? 8 : 12,
            question,
            block: replacementSlot.studentBlock,
            blocks: replacementSlot.blocks,
          });
          itemIndex = replacementSlot.endItemIndex;
          continue;
        }
        if (!isOrderedBlockVisible(questionItems, itemIndex, showSolutions)) continue;
        const pairedBlocks =
          item.block.kind === "diagram" &&
          nextItem?.kind === "block" &&
          isOrderedDiagramBesideContentBlock(questionItems, itemIndex + 1, showSolutions) &&
          effectiveDiagramTextSide(item.block, true) !== "none"
            ? [item.block, nextItem.block]
            : undefined;
        segments.push({
          id: `${question.id}:block:${item.block.id}`,
          kind: "question-block",
          questionIndex,
          spacingTop: itemIndex === 0 ? 8 : 12,
          question,
          block: item.block,
          blocks: pairedBlocks,
        });
        if (pairedBlocks) itemIndex += 1;
        continue;
      }

      const partIndex = question.parts.findIndex((part) => part.id === item.part.id);
      if (item.part.pageBreakBefore) {
        segments.push(partGroupPageBreakSegment(question, questionIndex, item.part, "before-part"));
      }

      const partItems = orderedPartItems(item.part);
      let partItemChunk: OrderedPartItem[] = [];
      let partSegmentIndex = 0;
      for (const partItem of partItems) {
        if (partItem.kind === "subpart" && partItem.subpart.pageBreakBefore) {
          if (partItemChunk.length) {
            pushPartGroupSegment({
              segments,
              question,
              questionIndex,
              part: item.part,
              partIndex,
              itemIndex,
              partItems: partItemChunk,
              segmentIndex: partSegmentIndex,
            });
            partSegmentIndex += 1;
            partItemChunk = [];
          }
          segments.push(partGroupPageBreakSegment(question, questionIndex, item.part, `before-subpart-${partItem.subpart.id}`));
        }
        partItemChunk.push(partItem);
      }

      if (partItemChunk.length || !partItems.length) {
        pushPartGroupSegment({
          segments,
          question,
          questionIndex,
          part: item.part,
          partIndex,
          itemIndex,
          partItems: partItemChunk,
          segmentIndex: partSegmentIndex,
        });
      }
    }

    if (question.pageBreakAfter || question.contentBlocks.some((block) => block.kind === "pageBreak")) {
      segments.push({
        id: `${question.id}:page-break`,
        kind: "page-break",
        questionIndex,
        spacingTop: 0,
        question,
      });
    }

    questionSegmentsById.set(question.id, segments);
  });

  const sectionHeadingMap = new Map(sectionHeadings.map((heading) => [heading.id, heading]));
  const questionSegments: PreviewSegment[] = [];
  let topLevelItemCount = 0;

  normalizeDocumentFlow(documentFlow, questions, sectionHeadings).forEach((flowItem) => {
    const spacingTop = topLevelItemCount === 0 ? 0 : gapPx;

    if (flowItem.kind === "sectionHeading") {
      const sectionHeading = sectionHeadingMap.get(flowItem.id);
      if (!sectionHeading) return;
      questionSegments.push({
        id: `section-heading:${sectionHeading.id}`,
        kind: "section-heading",
        spacingTop,
        sectionHeading,
      });
      topLevelItemCount += 1;
      return;
    }

    const segments = questionSegmentsById.get(flowItem.id);
    if (!segments?.length) return;
    const [firstSegment, ...remainingSegments] = segments;
    questionSegments.push({ ...firstSegment, spacingTop });
    questionSegments.push(...remainingSegments);
    topLevelItemCount += 1;
  });

  if (frontMatter.titlePageTemplate !== "worksheet" && frontMatter.titlePageTemplate !== "notes") return questionSegments;

  return [
    {
      id: frontMatter.titlePageTemplate === "notes" ? "notes-header" : "worksheet-header",
      kind: frontMatter.titlePageTemplate === "notes" ? "notes-header" : "worksheet-header",
      spacingTop: 0,
    },
    ...questionSegments,
  ];
}

function previewPartBlockRowIds(partItems: OrderedPartItem[], showSolutions: boolean) {
  const rowIds: string[] = [];
  for (let index = 0; index < partItems.length; index += 1) {
    const item = partItems[index];
    if (item.kind !== "block") continue;
    const nextItem = partItems[index + 1];
    const replacementSlotFollows = visibilityReplacementSlotAtOrderedItems(partItems, index + 1);
    if (
      item.block.kind === "diagram" &&
      isOrderedBlockVisible(partItems, index, showSolutions) &&
      replacementSlotFollows &&
      effectiveDiagramTextSide(item.block, true) !== "none"
    ) {
      rowIds.push(item.id);
      index = replacementSlotFollows.endItemIndex;
      continue;
    }
    const replacementSlot = visibilityReplacementSlotAtOrderedItems(partItems, index);
    if (replacementSlot) {
      rowIds.push(item.id);
      index = replacementSlot.endItemIndex;
      continue;
    }
    if (
      item.block.kind === "diagram" &&
      isOrderedBlockVisible(partItems, index, showSolutions) &&
      nextItem?.kind === "block" &&
      isOrderedDiagramBesideContentBlock(partItems, index + 1, showSolutions) &&
      effectiveDiagramTextSide(item.block, true) !== "none"
    ) {
      rowIds.push(item.id);
      index += 1;
      continue;
    }
    if (isOrderedBlockVisible(partItems, index, showSolutions)) rowIds.push(item.id);
  }
  return rowIds;
}

function buildMeasuredPages(
  segmentHeights: number[],
  segments: PreviewSegment[],
  pageFormat: PageFormat,
  reservedPageHeight = 0,
): PreviewPage[] {
  if (!segmentHeights.length) return [{ segmentIndexes: [], overflow: false }];

  const contentHeight = pageFormat.heightPx - pageFormat.paddingYPx * 2 - reservedPageHeight;
  const pages: PreviewPage[] = [];
  let currentSegmentIndexes: number[] = [];
  let currentHeight = 0;
  let currentOverflow = false;

  const pushCurrentPage = () => {
    pages.push({ segmentIndexes: currentSegmentIndexes, overflow: currentOverflow });
    currentSegmentIndexes = [];
    currentHeight = 0;
    currentOverflow = false;
  };

  segmentHeights.forEach((measuredHeight, segmentIndex) => {
    const segment = segments[segmentIndex];
    if (segment?.kind === "page-break") {
      if (currentSegmentIndexes.length) pushCurrentPage();
      return;
    }
    const fullHeight = measuredHeight || 0;
    const pageTopHeight = Math.max(0, fullHeight - (segment?.spacingTop ?? 0));
    const effectiveHeight = currentSegmentIndexes.length ? fullHeight : pageTopHeight;
    const proposedHeight = currentHeight + effectiveHeight;

    if (currentSegmentIndexes.length && proposedHeight > contentHeight) {
      pushCurrentPage();
    }

    const heightOnPage = currentSegmentIndexes.length ? fullHeight : pageTopHeight;
    currentSegmentIndexes.push(segmentIndex);
    currentHeight += heightOnPage;
    currentOverflow = currentOverflow || currentHeight > contentHeight;
  });

  if (currentSegmentIndexes.length || !pages.length) {
    pushCurrentPage();
  }

  return pages;
}

function buildExplicitBreakPages(segments: PreviewSegment[]): PreviewPage[] {
  if (!segments.length) return [{ segmentIndexes: [], overflow: false }];

  const pages: PreviewPage[] = [];
  let currentSegmentIndexes: number[] = [];

  const pushCurrentPage = () => {
    pages.push({ segmentIndexes: currentSegmentIndexes, overflow: false });
    currentSegmentIndexes = [];
  };

  segments.forEach((segment, segmentIndex) => {
    if (segment.kind === "page-break") {
      if (currentSegmentIndexes.length) pushCurrentPage();
      return;
    }
    currentSegmentIndexes.push(segmentIndex);
  });

  if (currentSegmentIndexes.length || !pages.length) pushCurrentPage();
  return pages;
}

function examStructureRows(frontMatter: FrontMatterConfig, totalMarks: number, questionCount: number) {
  const exam = normalizeExamTitlePage(frontMatter.exam);
  return exam.structureRows.map((row) =>
    row.useCurrentDocument
      ? {
          ...row,
          questionsAvailable: questionCount,
          questionsToBeAnswered: questionCount,
          marksAvailable: totalMarks,
        }
      : row,
  );
}

function examStructurePercentageTotal(rows: ExamStructureRowConfig[]) {
  return rows.reduce((sum, row) => sum + row.percentage, 0);
}

function ExamTextLines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <Fragment key={`${line}-${index}`}>
          {index ? <br /> : null}
          <FrontMatterInlineText text={line} />
        </Fragment>
      ))}
    </>
  );
}

function examStudentNameLabel(exam: ExamTitlePageConfig) {
  const label = exam.studentNumberLabel.trim();
  if (!label || /^(?:wa\s+)?student\s+number:?$/i.test(label)) return "NAME:";
  return label;
}

function ExamInstructionList({ text }: { text: string }) {
  const items = text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(\d+)\.\s*([\s\S]+)$/);
      return match ? { number: match[1], text: match[2] } : { number: "", text: item };
    });

  return (
    <div className="exam-instructions-list">
      {items.map((item, index) => (
        <div key={`${item.number}-${index}`} className="exam-instruction-item">
          <span>{item.number ? `${item.number}.` : ""}</span>
          <div>
            <FormattedText text={item.text} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SchoolExamRunningHeader({
  exam,
  pageNumber,
  variant = "content",
}: {
  exam: ExamTitlePageConfig;
  pageNumber: number;
  variant?: "structure" | "content" | "supplementary";
}) {
  const course = exam.courseHeader || DEFAULT_EXAM_TITLE_PAGE.courseHeader;
  const section = exam.sectionHeader || DEFAULT_EXAM_TITLE_PAGE.sectionHeader;
  const sectionOnLeft = variant === "supplementary" || (variant === "content" && pageNumber % 2 === 1);
  const leftText = sectionOnLeft ? section : course;
  const rightText = sectionOnLeft ? course : section;

  return (
    <header className="school-exam-running-header">
      <strong>
        <FrontMatterInlineText text={leftText} />
      </strong>
      <strong>{pageNumber}</strong>
      <strong>
        <FrontMatterInlineText text={rightText} />
      </strong>
    </header>
  );
}

function SchoolExamPageFooter({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <footer className="school-exam-page-footer">
      <FrontMatterInlineText text={text} />
    </footer>
  );
}

function ExamCoverPage({
  frontMatter,
  logo,
  activePreviewAnchor,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  activePreviewAnchor?: string;
}) {
  const exam = normalizeExamTitlePage(frontMatter.exam);
  const schoolNameLines = frontMatter.schoolName
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const initials = schoolInitials(schoolNameLines);

  return (
    <header
      className="exam-title-page school-exam-cover-page"
      data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}
      data-preview-structure-anchor="true"
      data-preview-selected={previewSelectionAttr(SCROLL_ANCHOR_FRONT_MATTER, activePreviewAnchor)}
    >
      <section className="school-exam-logo-lockup">
        <div className="school-exam-logo-frame">
          {logo ? (
            <img className="school-exam-logo" src={logo.src} alt={`${logo.name} logo`} />
          ) : (
            <div className="school-exam-monogram" aria-hidden="true">
              {initials}
            </div>
          )}
        </div>
        <div className="school-exam-school-name">
          <ExamTextLines text={frontMatter.schoolName} />
        </div>
      </section>

      <section className="school-exam-heading">
        <div />
        <div>
          <h1>
            <FrontMatterInlineText text={exam.examHeading} />
          </h1>
          <p>
            <FrontMatterInlineText text={exam.bookletTitle} />
          </p>
        </div>
      </section>

      <section className="school-exam-course-row">
        <div className="school-exam-course-block">
          <h2>
            <ExamTextLines text={frontMatter.subjectTitle} />
          </h2>
          {frontMatter.showAssessmentSubtitle && frontMatter.assessmentSubtitle.trim() ? (
            <p>
              <ExamTextLines text={frontMatter.assessmentSubtitle} />
            </p>
          ) : null}
        </div>
        <div className="school-exam-student-number">
          <span>
            <FrontMatterInlineText text={examStudentNameLabel(exam)} />
          </span>
          <span className="school-exam-student-name-line" aria-hidden="true" />
        </div>
      </section>

      <section className="school-exam-time-block">
        <h3>
          <FrontMatterInlineText text={exam.timeTitle} />
        </h3>
        <dl>
          <dt>
            <FrontMatterInlineText text={exam.readingTimeLabel} />
          </dt>
          <dd>
            <FrontMatterInlineText text={exam.readingTime} />
          </dd>
          <dt>
            <FrontMatterInlineText text={exam.workingTimeLabel} />
          </dt>
          <dd>
            <FrontMatterInlineText text={exam.workingTime} />
          </dd>
        </dl>
      </section>

      <section className="school-exam-materials-block">
        <h3>
          <FrontMatterInlineText text={exam.materialsTitle} />
        </h3>
        <p className="exam-italic-heading">
          <FrontMatterInlineText text={exam.supervisorMaterialsTitle} />
        </p>
        <p>
          <ExamTextLines text={exam.supervisorMaterials} />
        </p>
        <p className="exam-italic-heading">
          <FrontMatterInlineText text={exam.candidateMaterialsTitle} />
        </p>
        <div className="exam-material-row">
          <strong>
            <FrontMatterInlineText text={exam.standardItemsLabel} />
          </strong>
          <span>
            <ExamTextLines text={exam.standardItems} />
          </span>
        </div>
        <div className="exam-material-row">
          <strong>
            <FrontMatterInlineText text={exam.specialItemsLabel} />
          </strong>
          <span>
            <ExamTextLines text={exam.specialItems} />
          </span>
        </div>
      </section>

      <section className="school-exam-important-note">
        <h3>
          <FrontMatterInlineText text={exam.importantNoteTitle} />
        </h3>
        <FormattedText text={exam.importantNoteBody} />
      </section>
    </header>
  );
}

function ExamStructurePage({
  frontMatter,
  totalMarks,
  questionCount,
}: {
  frontMatter: FrontMatterConfig;
  totalMarks: number;
  questionCount: number;
}) {
  const exam = normalizeExamTitlePage(frontMatter.exam);
  const rows = examStructureRows(frontMatter, totalMarks, questionCount);

  return (
    <section className="exam-title-page school-exam-structure-page">
      <SchoolExamRunningHeader exam={exam} pageNumber={2} variant="structure" />

      <section>
        <h2>
          <FrontMatterInlineText text={exam.structureTitle} />
        </h2>
        <table className="exam-structure-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Number of questions available</th>
              <th>Number of questions to be answered</th>
              <th>Working time (minutes)</th>
              <th>Marks available</th>
              <th>Percentage of examination</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <ExamTextLines text={row.section} />
                </td>
                <td>{row.questionsAvailable}</td>
                <td>{row.questionsToBeAnswered}</td>
                <td>{row.workingTimeMinutes}</td>
                <td>{row.marksAvailable}</td>
                <td>{row.percentage}</td>
              </tr>
            ))}
            <tr className="exam-structure-total-row">
              <td className="exam-structure-total-spacer" colSpan={4} aria-hidden="true" />
              <td className="exam-structure-total-label">Total</td>
              <td>{examStructurePercentageTotal(rows)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="exam-candidate-instructions">
        <h2>
          <FrontMatterInlineText text={exam.instructionsTitle} />
        </h2>
        <ExamInstructionList text={exam.instructionsBody} />
      </section>
      <SchoolExamPageFooter text={exam.footerText} />
    </section>
  );
}

function SchoolExamSupplementaryPage({ frontMatter, pageNumber }: { frontMatter: FrontMatterConfig; pageNumber: number }) {
  const exam = normalizeExamTitlePage(frontMatter.exam);

  return (
    <section className="a4-page school-exam-question-page">
      <div className="a4-page-content">
        <div className="exam-title-page school-exam-supplementary-page">
          <SchoolExamRunningHeader exam={exam} pageNumber={pageNumber} variant="supplementary" />
          <section className="school-exam-supplementary-content">
            <h2>
              <FrontMatterInlineText text={exam.supplementaryPageTitle} />
            </h2>
            <p>
              <FrontMatterInlineText text={`${exam.supplementaryQuestionNumberLabel} ________`} />
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}

function TestFrontMatterPreview({
  frontMatter,
  logo,
  totalMarks,
  activePreviewAnchor,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  totalMarks: number;
  activePreviewAnchor?: string;
}) {
  const schoolNameLines = frontMatter.schoolName
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const initials = schoolInitials(schoolNameLines);
  const isSolutionsTitle = frontMatter.nameLabel.trim().toLowerCase() === "solutions";

  return (
    <header
      className="test-front-matter"
      data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}
      data-preview-structure-anchor="true"
      data-preview-selected={previewSelectionAttr(SCROLL_ANCHOR_FRONT_MATTER, activePreviewAnchor)}
    >
      <section className="test-title-panel">
        <div className="test-school-lockup">
          {logo ? (
            <img className="test-school-logo" src={logo.src} alt={`${logo.name} logo`} />
          ) : (
            <div className="test-school-monogram" aria-hidden="true">
              {initials}
            </div>
          )}
          <div className="test-school-name">
            {schoolNameLines.map((line) => (
              <span key={line}>
                <FrontMatterInlineText text={line} />
              </span>
            ))}
          </div>
        </div>
        <div className="test-title-main">
          <h1>
            <FrontMatterInlineText text={frontMatter.subjectTitle} />
          </h1>
          <p>
            <FrontMatterInlineText text={assessmentTitleText(frontMatter.assessmentTitle)} />
          </p>
          {frontMatter.showAssessmentSubtitle && frontMatter.assessmentSubtitle.trim() ? (
            <p className="test-assessment-subtitle">
              <FrontMatterInlineText text={frontMatter.assessmentSubtitle} />
            </p>
          ) : null}
          {isSolutionsTitle ? (
            <p className="test-solutions-title">
              <FrontMatterInlineText text={frontMatter.nameLabel} />
            </p>
          ) : null}
        </div>
      </section>

      <section className={`test-student-row ${isSolutionsTitle ? "test-student-row-solutions" : ""}`}>
        {isSolutionsTitle ? null : (
          <div className="test-name-line">
            <span>
              <FrontMatterInlineText text={`${frontMatter.nameLabel}:`} />
            </span>
            <span aria-hidden="true" />
          </div>
        )}
        <div className="test-mark-line">
          <span>
            <FrontMatterInlineText text={`${frontMatter.markLabel}:`} />
          </span>
          <span aria-hidden="true" />
          <strong>{totalMarks}</strong>
        </div>
      </section>

      {frontMatter.showDeclaration ? (
        <section className="test-declaration-panel">
          <div className="test-declaration-copy">
            <h2>
              <FrontMatterInlineText text={frontMatter.declarationTitle} />
            </h2>
            <FormattedText text={frontMatter.declarationBody} />
          </div>
          <div className="test-signature-panel">
            <strong>
              <FrontMatterInlineText text={frontMatter.signatureLabel} />
            </strong>
            <span aria-hidden="true" />
            <em>
              <FrontMatterInlineText text={frontMatter.signatureRole} />
            </em>
          </div>
        </section>
      ) : null}

      {frontMatter.showInstructions ? (
        <section className="test-instructions-panel">
          <h2>
            <FrontMatterInlineText text={frontMatter.instructionsTitle} />
          </h2>
          <FormattedText text={frontMatter.instructionsBody} className="test-instructions-body" />
        </section>
      ) : null}
    </header>
  );
}

function WorksheetHeaderPreview({
  frontMatter,
  logo,
  totalMarks,
  activePreviewAnchor,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  totalMarks: number;
  activePreviewAnchor?: string;
}) {
  const schoolName = frontMatter.schoolName
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  return (
    <header
      className="worksheet-header"
      data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}
      data-preview-structure-anchor="true"
      data-preview-selected={previewSelectionAttr(SCROLL_ANCHOR_FRONT_MATTER, activePreviewAnchor)}
    >
      <div className="worksheet-heading-lockup">
        {logo ? (
          <div className="worksheet-mini-logo">
            <img src={logo.src} alt={`${logo.name} logo`} />
          </div>
        ) : null}
        <div className="worksheet-title-copy">
          {schoolName ? (
            <p className="worksheet-school-name">
              <FrontMatterInlineText text={schoolName} />
            </p>
          ) : null}
          <h1>
            <FrontMatterInlineText text={frontMatter.assessmentTitle} />
          </h1>
          <p className="worksheet-subject-line">
            <FrontMatterInlineText text={frontMatter.subjectTitle} />
          </p>
        </div>
      </div>
      <div className="worksheet-student-fields">
        <div className="worksheet-name-line">
          <span>Name:</span>
          <span aria-hidden="true" />
        </div>
        {totalMarks > 0 ? (
          <div className="worksheet-mark-line">
            <span>
              <FrontMatterInlineText text={`${frontMatter.markLabel}:`} />
            </span>
            <span aria-hidden="true" />
            <strong>{totalMarks}</strong>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function NotesHeaderPreview({
  frontMatter,
  logo,
  activePreviewAnchor,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  activePreviewAnchor?: string;
}) {
  const schoolName = frontMatter.schoolName
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  return (
    <header
      className="notes-header"
      data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}
      data-preview-structure-anchor="true"
      data-preview-selected={previewSelectionAttr(SCROLL_ANCHOR_FRONT_MATTER, activePreviewAnchor)}
    >
      {logo ? (
        <div className="notes-mini-logo">
          <img src={logo.src} alt={`${logo.name} logo`} />
        </div>
      ) : null}
      <div className="notes-title-copy">
        {schoolName ? (
          <p className="notes-school-name">
            <FrontMatterInlineText text={schoolName} />
          </p>
        ) : null}
        <h1>
          <FrontMatterInlineText text={frontMatter.assessmentTitle || "Math Notes"} />
        </h1>
        <p className="notes-subject-line">
          <FrontMatterInlineText text={frontMatter.subjectTitle || "Mathematics"} />
        </p>
        {frontMatter.showAssessmentSubtitle && frontMatter.assessmentSubtitle.trim() ? (
          <p className="notes-subtitle-line">
            <FrontMatterInlineText text={frontMatter.assessmentSubtitle} />
          </p>
        ) : null}
      </div>
    </header>
  );
}

function notesSectionTitle(question: QuestionBlock, index: number) {
  return question.text?.trim() || question.section.trim() || `Heading ${index + 1}`;
}

function FrontMatterPreviewPages({
  frontMatter,
  logo,
  totalMarks,
  questionCount,
  activePreviewAnchor,
  showPageBreaks,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  totalMarks: number;
  questionCount: number;
  activePreviewAnchor?: string;
  showPageBreaks: boolean;
}) {
  if (frontMatter.titlePageTemplate === "worksheet" || frontMatter.titlePageTemplate === "notes") return null;

  if (frontMatter.titlePageTemplate === "exam") {
    return (
      <>
        <A4PreviewPageFrame>
          <section className="a4-page">
            <div className="a4-page-content">
              <ExamCoverPage frontMatter={frontMatter} logo={logo} activePreviewAnchor={activePreviewAnchor} />
            </div>
          </section>
        </A4PreviewPageFrame>
        {showPageBreaks ? (
          <div className="a4-page-break" aria-hidden="true">
            <span>A4 page break</span>
          </div>
        ) : null}
        <A4PreviewPageFrame>
          <section className="a4-page">
            <div className="a4-page-content">
              <ExamStructurePage frontMatter={frontMatter} totalMarks={totalMarks} questionCount={questionCount} />
            </div>
          </section>
        </A4PreviewPageFrame>
      </>
    );
  }

  return (
    <A4PreviewPageFrame>
      <section className="a4-page">
        <div className="a4-page-content">
          <TestFrontMatterPreview frontMatter={frontMatter} logo={logo} totalMarks={totalMarks} activePreviewAnchor={activePreviewAnchor} />
        </div>
      </section>
    </A4PreviewPageFrame>
  );
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
    () => buildPreviewSegments(frontMatter, questions, sectionHeadings, documentFlow, showSolutions, normalizedFormatting),
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
        const entries: PreviewPageSegmentEntry[] = [];
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

  const renderPreviewGroup = (group: PreviewQuestionSegmentGroup) => {
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

interface DiagramBlockEditorProps {
  label: string;
  graphConfig: GraphConfig;
  alignment?: DiagramAlignment;
  showSolutions?: boolean;
  settingsMode?: "inline" | "inspector";
  anchor?: string;
  activeAnchor?: string;
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  onActivateAnchor?: (anchor: string) => void;
  onChange: (graphConfig: GraphConfig) => void;
  onAlignmentChange: (alignment: DiagramAlignment) => void;
  onRemove: () => void;
}

type EditorColumnsBlock = Extract<EditorContentBlock, { kind: "columns" }>;
type ColumnsChildBlockKind = Exclude<ContentBlockKind, "columns">;

interface ColumnsBlockEditorProps {
  label: string;
  title?: ReactNode;
  block: EditorColumnsBlock;
  anchor?: string;
  activeAnchor?: string;
  showSolutions?: boolean;
  spaceLabelPrefix?: string;
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  openSignalForAnchor?: (anchor: string) => number | undefined;
  onActivateAnchor?: (anchor: string) => void;
  onContextMenuAnchor?: (event: ReactMouseEvent<HTMLElement>, anchor: string) => void;
  onChange: (patch: Partial<EditorColumnsBlock>) => void;
  onRemove: () => void;
}

function ColumnsBlockEditor({
  label,
  title,
  block,
  anchor,
  activeAnchor,
  showSolutions = false,
  spaceLabelPrefix = "Answer space",
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  openSignalForAnchor: openNestedSignalForAnchor,
  onActivateAnchor,
  onContextMenuAnchor,
  onChange,
  onRemove,
}: ColumnsBlockEditorProps) {
  const normalized = normalizeColumnsBlock(block);
  const updateColumns = (columns: EditorContentBlock[][], columnCount = normalized.columnCount) => onChange({ columnCount, columns });
  const addColumnBlock = (
    columnIndex: number,
    kind: ColumnsChildBlockKind,
    visibility = solutionModeInsertedBlockVisibility(kind, showSolutions),
  ) => {
    const block = contentBlockForKind(kind, visibility);
    const columns = normalized.columns.map((column, index) => (index === columnIndex ? [...column, block] : column));
    updateColumns(columns);
    if (anchor) onActivateAnchor?.(columnChildScrollAnchor(anchor, columnIndex, block.id));
  };
  const addColumnDiagramBlock = (
    columnIndex: number,
    type: string,
    visibility = solutionModeInsertedBlockVisibility("diagram", showSolutions),
  ) => {
    const block = diagramBlockForType(type, visibility);
    const columns = normalized.columns.map((column, index) => (index === columnIndex ? [...column, block] : column));
    updateColumns(columns);
    if (anchor) onActivateAnchor?.(columnChildScrollAnchor(anchor, columnIndex, block.id));
  };
  const updateColumnBlock = (columnIndex: number, blockId: string, patch: Record<string, unknown>) => {
    const columns = normalized.columns.map((column, index) =>
      index === columnIndex
        ? column.map((child) => (child.id === blockId ? ({ ...child, ...patch } as EditorContentBlock) : child))
        : column,
    );
    updateColumns(columns);
  };
  const removeColumnBlock = (columnIndex: number, blockId: string) => {
    const columns = normalized.columns.map((column, index) =>
      index === columnIndex ? column.filter((child) => child.id !== blockId) : column,
    );
    updateColumns(columns);
  };

  const renderColumnChildBlock = (columnIndex: number, child: EditorContentBlock, childIndex: number) => {
    const childNumber = childIndex + 1;
    const childLabelPrefix = `Column ${columnIndex + 1}`;
    const childAnchor = anchor ? columnChildScrollAnchor(anchor, columnIndex, child.id) : "";
    const childActive = Boolean(childAnchor && scrollAnchorContains(childAnchor, activeAnchor));
    const childOpenSignal = childAnchor && openNestedSignalForAnchor ? openNestedSignalForAnchor(childAnchor) : undefined;
    const wrapChild = (node: ReactNode) => {
      if (!childAnchor) return <Fragment key={child.id}>{node}</Fragment>;
      const activateChildAnchor = () => onActivateAnchor?.(childAnchor);
      return (
        <div
          key={child.id}
          data-scroll-anchor={childAnchor}
          className="rounded-md transition-colors"
          onPointerDownCapture={activateChildAnchor}
          onFocusCapture={activateChildAnchor}
          onContextMenu={(event) => onContextMenuAnchor?.(event, childAnchor)}
        >
          {node}
        </div>
      );
    };

    if (child.kind === "space") {
      const spaceLabel = `${spaceLabelPrefix} ${childNumber}`;
      return wrapChild(
        <SpaceBlockEditor
          label={`${childLabelPrefix} ${spaceLabelPrefix.toLowerCase()} ${childNumber}`}
          title={<InlineSummaryTitle label={spaceLabel} summary={spaceBlockSummary(child.lines)} />}
          lines={child.lines}
          showLines={child.showLines ?? true}
          settingsMode="inspector"
          muted
          active={childActive}
          openSignal={childOpenSignal}
          onChange={(patch) => updateColumnBlock(columnIndex, child.id, patch)}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    if (child.kind === "diagram") {
      return wrapChild(
        <DiagramBlockEditor
          label={`${childLabelPrefix} diagram ${childNumber}`}
          graphConfig={child.graphConfig}
          alignment={child.diagramAlign}
          showSolutions={showSolutions}
          settingsMode="inspector"
          anchor={childAnchor}
          activeAnchor={activeAnchor}
          onActivateAnchor={onActivateAnchor}
          muted
          active={childActive}
          openSignal={childOpenSignal}
          onChange={(graphConfig) => updateColumnBlock(columnIndex, child.id, { graphConfig })}
          onAlignmentChange={(diagramAlign) => updateColumnBlock(columnIndex, child.id, { diagramAlign })}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    if (child.kind === "choices") {
      return wrapChild(
        <ChoiceListBlockEditor
          label={`${childLabelPrefix} choice list ${childNumber}`}
          title={<InlineSummaryTitle label={`Choice list ${childNumber}`} summary={choiceListSummary(child)} />}
          block={child}
          numberingStyleOptions={CHOICE_NUMBERING_STYLES}
          layoutOptions={CHOICE_LIST_LAYOUTS}
          settingsMode="inspector"
          muted
          active={childActive}
          openSignal={childOpenSignal}
          onChange={(patch) => updateColumnBlock(columnIndex, child.id, patch as Record<string, unknown>)}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    if (child.kind === "table") {
      return wrapChild(
        <TableBlockEditor
          label={`${childLabelPrefix} table ${childNumber}`}
          title={<InlineSummaryTitle label={`Table ${childNumber}`} summary={tableBlockSummary(child)} />}
          block={child}
          diagramAlignments={DIAGRAM_ALIGNMENTS}
          cellAlignments={TABLE_CELL_ALIGNMENTS}
          settingsMode="inspector"
          muted
          active={childActive}
          openSignal={childOpenSignal}
          onChange={(patch) => updateColumnBlock(columnIndex, child.id, patch as Record<string, unknown>)}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    if (child.kind === "columns") {
      return wrapChild(
        <ColumnsBlockEditor
          label={`${childLabelPrefix} nested columns ${childNumber}`}
          title={<InlineSummaryTitle label={`Nested columns ${childNumber}`} summary={columnsBlockSummary(child)} />}
          block={child}
          anchor={childAnchor}
          activeAnchor={activeAnchor}
          showSolutions={showSolutions}
          spaceLabelPrefix={spaceLabelPrefix}
          muted
          active={childActive}
          openSignal={childOpenSignal}
          openSignalForAnchor={openNestedSignalForAnchor}
          onActivateAnchor={onActivateAnchor}
          onChange={(patch) => updateColumnBlock(columnIndex, child.id, patch as Record<string, unknown>)}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    if (child.kind === "text") {
      return wrapChild(
        <TextBlockEditor
          label={`${childLabelPrefix} text ${childNumber}`}
          title={<InlineSummaryTitle label={`Text ${childNumber}`} summary={textBlockSummary(child.text ?? "")} />}
          text={child.text ?? ""}
          muted
          active={childActive}
          openSignal={childOpenSignal}
          minHeightClassName="min-h-[74px]"
          onChange={(text) => updateColumnBlock(columnIndex, child.id, { text })}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    return null;
  };

  return (
    <CollapsiblePanel
      title={title ?? <InlineSummaryTitle label={label} summary={columnsBlockSummary(block)} />}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn(muted && "bg-muted/25")}
      bodyClassName="space-y-3"
      active={active}
      openSignal={openSignal}
    >
      <div className="grid min-w-0 gap-3" style={{ gridTemplateColumns: `repeat(${normalized.columnCount}, minmax(0, 1fr))` }}>
        {normalized.columns.map((column, columnIndex) => (
          <section key={columnIndex} className="min-w-0 space-y-3 rounded-md border bg-background p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Column {columnIndex + 1}</div>
            {column.length ? (
              <div className="min-w-0 space-y-3">
                {column.map((child, childIndex) => renderColumnChildBlock(columnIndex, child, childIndex))}
              </div>
            ) : null}
            <ContentInsertionActions
              buttonLabel="Add"
              solutionMode={showSolutions}
              className="pt-1"
              onAddText={() => addColumnBlock(columnIndex, "text")}
              onAddChoices={() => addColumnBlock(columnIndex, "choices")}
              onAddTable={() => addColumnBlock(columnIndex, "table")}
              onAddDiagram={() => addColumnBlock(columnIndex, "diagram")}
              diagramActions={quickDiagramInsertActions((type) => addColumnDiagramBlock(columnIndex, type))}
              onAddSpace={() => addColumnBlock(columnIndex, "space")}
            />
          </section>
        ))}
      </div>
    </CollapsiblePanel>
  );
}

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
          <CollapsiblePanel
            title={<InlineSummaryTitle label="Exam cover" summary={`${exam.examHeading} · ${exam.sectionHeader}`} />}
            defaultOpen={false}
            className="bg-muted/20"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Exam heading
                <input
                  value={exam.examHeading}
                  onChange={(event) => updateExam({ examHeading: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Booklet title
                <input
                  value={exam.bookletTitle}
                  onChange={(event) => updateExam({ bookletTitle: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Running header course
                <input
                  value={exam.courseHeader}
                  onChange={(event) => updateExam({ courseHeader: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Running header section
                <input
                  value={exam.sectionHeader}
                  onChange={(event) => updateExam({ sectionHeader: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Student name label
                <input
                  value={exam.studentNumberLabel}
                  onChange={(event) => updateExam({ studentNumberLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            title={<InlineSummaryTitle label="Exam time and materials" summary={`${exam.workingTimeLabel} ${exam.workingTime}`} />}
            defaultOpen={false}
            className="bg-muted/20"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                Time section title
                <input
                  value={exam.timeTitle}
                  onChange={(event) => updateExam({ timeTitle: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Reading time label
                <input
                  value={exam.readingTimeLabel}
                  onChange={(event) => updateExam({ readingTimeLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Reading time
                <input
                  value={exam.readingTime}
                  onChange={(event) => updateExam({ readingTime: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Working time label
                <input
                  value={exam.workingTimeLabel}
                  onChange={(event) => updateExam({ workingTimeLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Working time
                <input
                  value={exam.workingTime}
                  onChange={(event) => updateExam({ workingTime: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                Additional booklets label
                <Textarea
                  value={exam.additionalBookletsLabel}
                  onChange={(event) => updateExam({ additionalBookletsLabel: event.target.value })}
                  className="min-h-16 text-sm"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                Materials title
                <input
                  value={exam.materialsTitle}
                  onChange={(event) => updateExam({ materialsTitle: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Supervisor materials heading
                <input
                  value={exam.supervisorMaterialsTitle}
                  onChange={(event) => updateExam({ supervisorMaterialsTitle: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Supervisor materials
                <Textarea
                  value={exam.supervisorMaterials}
                  onChange={(event) => updateExam({ supervisorMaterials: event.target.value })}
                  className="min-h-20 text-sm"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Standard items
                <Textarea
                  value={exam.standardItems}
                  onChange={(event) => updateExam({ standardItems: event.target.value })}
                  className="min-h-24 text-sm"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Special items
                <Textarea
                  value={exam.specialItems}
                  onChange={(event) => updateExam({ specialItems: event.target.value })}
                  className="min-h-24 text-sm"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                Important note
                <Textarea
                  value={exam.importantNoteBody}
                  onChange={(event) => updateExam({ importantNoteBody: event.target.value })}
                  className="min-h-24 text-sm"
                />
              </label>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            title={
              <InlineSummaryTitle
                label="Exam structure table"
                summary={`Current document: ${questionCount} questions, ${markLabel(totalMarks)}`}
              />
            }
            defaultOpen={false}
            className="bg-muted/20"
            actions={
              <Button type="button" variant="outline" size="sm" onClick={addExamRow}>
                <PlusCircle data-icon="inline-start" />
                Row
              </Button>
            }
          >
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Table title
                <input
                  value={exam.structureTitle}
                  onChange={(event) => updateExam({ structureTitle: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <div className="flex flex-col gap-3">
                {exam.structureRows.map((row, index) => {
                  const rowQuestionsAvailable = row.useCurrentDocument ? questionCount : row.questionsAvailable;
                  const rowQuestionsToBeAnswered = row.useCurrentDocument ? questionCount : row.questionsToBeAnswered;
                  const rowMarks = row.useCurrentDocument ? totalMarks : row.marksAvailable;

                  return (
                    <div key={row.id} className="rounded-md border bg-background p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <strong className="text-sm">Row {index + 1}</strong>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 text-xs font-medium">
                            <input
                              type="checkbox"
                              checked={row.useCurrentDocument === true}
                              onChange={(event) => updateExamRow(row.id, { useCurrentDocument: event.target.checked })}
                            />
                            Auto from current document
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Remove structure row"
                            aria-label="Remove structure row"
                            disabled={exam.structureRows.length <= 1}
                            onClick={() => removeExamRow(row.id)}
                            className="size-8"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                        <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                          Section
                          <Textarea
                            value={row.section}
                            onChange={(event) => updateExamRow(row.id, { section: event.target.value })}
                            className="min-h-20 text-sm"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-medium">
                          Available
                          <input
                            type="number"
                            min={0}
                            value={rowQuestionsAvailable}
                            disabled={row.useCurrentDocument === true}
                            onChange={(event) => updateExamRowNumber(row.id, "questionsAvailable", event.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:bg-muted disabled:text-muted-foreground"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-medium">
                          Answered
                          <input
                            type="number"
                            min={0}
                            value={rowQuestionsToBeAnswered}
                            disabled={row.useCurrentDocument === true}
                            onChange={(event) => updateExamRowNumber(row.id, "questionsToBeAnswered", event.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:bg-muted disabled:text-muted-foreground"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-medium">
                          Minutes
                          <input
                            type="number"
                            min={0}
                            value={row.workingTimeMinutes}
                            onChange={(event) => updateExamRowNumber(row.id, "workingTimeMinutes", event.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-medium">
                          Marks
                          <input
                            type="number"
                            min={0}
                            value={rowMarks}
                            disabled={row.useCurrentDocument === true}
                            onChange={(event) => updateExamRowNumber(row.id, "marksAvailable", event.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:bg-muted disabled:text-muted-foreground"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-medium">
                          Percentage
                          <input
                            type="number"
                            min={0}
                            value={row.percentage}
                            onChange={(event) => updateExamRowNumber(row.id, "percentage", event.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Use the Exam section selector to choose which row represents the current paper. Rows marked auto use the current document
                question count and total marks in the preview and print output. Percentage total:{" "}
                {examStructurePercentageTotal(exam.structureRows)}.
              </p>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            title={<InlineSummaryTitle label="Exam instructions" summary={exam.instructionsTitle} />}
            defaultOpen={false}
            className="bg-muted/20"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                Instructions heading
                <input
                  value={exam.instructionsTitle}
                  onChange={(event) => updateExam({ instructionsTitle: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                Numbered instructions
                <Textarea
                  value={exam.instructionsBody}
                  onChange={(event) => updateExam({ instructionsBody: event.target.value })}
                  className="min-h-52 text-sm"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Continued footer text
                <input
                  value={exam.footerText}
                  onChange={(event) => updateExam({ footerText: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Last question footer text
                <input
                  value={exam.endOfQuestionsFooterText}
                  onChange={(event) => updateExam({ endOfQuestionsFooterText: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Supplementary page title
                <input
                  value={exam.supplementaryPageTitle}
                  onChange={(event) => updateExam({ supplementaryPageTitle: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Supplementary question label
                <input
                  value={exam.supplementaryQuestionNumberLabel}
                  onChange={(event) => updateExam({ supplementaryQuestionNumberLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Minimum supplementary pages
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={exam.supplementaryPageCount}
                  onChange={(event) => updateExam({ supplementaryPageCount: nonNegativeNumberOrDefault(Number(event.target.value), 0) })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            </div>
          </CollapsiblePanel>
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

function textBlockSummary(text: string) {
  return text.trim().replace(/\s+/g, " ") || "Empty text block";
}

function spaceBlockSummary(lines: number) {
  const normalizedLines = spaceLines(lines);
  return `${normalizedLines} line${normalizedLines === 1 ? "" : "s"}`;
}

function choiceListSummary(block: Extract<EditorContentBlock, { kind: "choices" }>) {
  const choices = normalizeChoiceItems(block.choices).filter((choice) => choice.trim());
  const style =
    CHOICE_NUMBERING_STYLES.find((item) => item.value === normalizeChoiceNumberingStyle(block.numberingStyle))?.label ?? "Choices";
  return `${choices.length || 0} ${style.toLowerCase()} choice${choices.length === 1 ? "" : "s"}`;
}

function tableBlockSummary(block: Extract<EditorContentBlock, { kind: "table" }>) {
  const table = normalizeTableBlock(block);
  const rows = plainTableRows(table);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const columnLabel = `${columnCount} column${columnCount === 1 ? "" : "s"}`;
  const rowLabel = `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  return `${rowLabel}, ${columnLabel}`;
}

function diagramTypeLabel(type?: string | null) {
  const normalizedType = normalizeDiagramType(type);
  return DIAGRAM_TYPES.find((diagramType) => diagramType.value === normalizedType)?.label ?? "Diagram";
}

function diagramConfigSummary(graphConfig: GraphConfig) {
  const config = withGraphDefaults(graphConfig);
  if (config.type === "image") return imageDiagramData(config).src ? imageDiagramName(config) : "No image selected";
  if (config.type === "statsChart") return statsChartSummary(config);
  if (config.type === "geometry2d") return geometry2dSummary(config);
  if (config.type === "graph2d") {
    const visibleFunctions = (config.functions ?? []).filter((graphFunction) => graphFunction.show !== false).length;
    const visibleFeatures = (config.features ?? []).filter((feature) => feature.show !== false).length;
    if (!visibleFunctions && !visibleFeatures) return "Blank coordinate grid";
    const functionLabel = `${visibleFunctions} function${visibleFunctions === 1 ? "" : "s"}`;
    return visibleFeatures ? `${functionLabel}, ${visibleFeatures} feature${visibleFeatures === 1 ? "" : "s"}` : functionLabel;
  }
  if (config.type === "vector2d") {
    const vectorCount = normalizedVector2DEntries(config).length;
    return `${vectorCount} coordinate vector${vectorCount === 1 ? "" : "s"}`;
  }
  if (config.type === "graph3d") return "3D axes and saved camera view";
  if (config.type === "network") return "Schematic network";
  if (config.type === "setDiagram") {
    const setCount = normalizedSetDiagramData(config).setCount;
    return setCount === 3 ? "Three-set Venn" : "Two-set Venn";
  }
  if (config.type === "geometricConstruction") return "Penrose construction";
  return diagramTypeLabel(config.type);
}

function diagramBlockSummary(block: Extract<EditorContentBlock, { kind: "diagram" }>) {
  return diagramConfigSummary(block.graphConfig);
}

function columnsBlockSummary(block: Extract<EditorContentBlock, { kind: "columns" }>) {
  const columns = normalizeColumnsBlock(block);
  const moduleCount = columns.columns.reduce((sum, column) => sum + column.length, 0);
  return `${columns.columnCount} columns, ${moduleCount} module${moduleCount === 1 ? "" : "s"}`;
}

function tocBlockLabel(block: EditorContentBlock, blockIndex: number) {
  const itemNumber = blockIndex + 1;
  if (block.kind === "text") return `Text ${itemNumber}`;
  if (block.kind === "choices") return `Choices ${itemNumber}`;
  if (block.kind === "table") return `Table ${itemNumber}`;
  if (block.kind === "diagram") return `Diagram ${itemNumber}`;
  if (block.kind === "columns") return `Columns ${itemNumber}`;
  if (block.kind === "space") return `Space ${itemNumber}`;
  return `Block ${itemNumber}`;
}

function tocBlockSummary(block: EditorContentBlock) {
  if (block.kind === "text") return textBlockSummary(block.text ?? "");
  if (block.kind === "choices") return choiceListSummary(block);
  if (block.kind === "table") return tableBlockSummary(block);
  if (block.kind === "diagram") return diagramBlockSummary(block);
  if (block.kind === "columns") return columnsBlockSummary(block);
  if (block.kind === "space") {
    const lines = spaceLines(block.lines);
    return `${lines} line${lines === 1 ? "" : "s"}`;
  }
  return "";
}

function lowerFirst(value: string) {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

function selectedEditorBlockFromBlocks(
  contentBlocks: EditorContentBlock[],
  blockId: string,
  scope: SelectedEditorBaseBlockScope,
  labelPrefix = "",
): SelectedEditorBlock | null {
  const blocks = contentBlocks.filter((current) => current.kind !== "pageBreak");
  const blockIndex = blocks.findIndex((current) => current.id === blockId);
  const block = blockIndex >= 0 ? blocks[blockIndex] : null;
  if (!block) return null;

  const blockLabel = tocBlockLabel(block, blockIndex);
  return {
    scope,
    block,
    label: labelPrefix ? `${labelPrefix} ${lowerFirst(blockLabel)}` : blockLabel,
    summary: tocBlockSummary(block),
  };
}

function selectedColumnBlockFromRoot(
  rootBlock: EditorContentBlock,
  rootScope: SelectedEditorBaseBlockScope,
  rootBlockId: string,
  path: ColumnBlockPath,
  labelPrefix = "",
): SelectedEditorBlock | null {
  let currentBlock = rootBlock;
  let currentPrefix = labelPrefix;

  for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
    const entry = path[pathIndex];
    if (currentBlock.kind !== "columns") return null;
    const columnsBlock = normalizeColumnsBlock(currentBlock);
    const column = columnsBlock.columns[entry.columnIndex] ?? [];
    const blockIndex = column.findIndex((candidate) => candidate.id === entry.blockId);
    const childBlock = blockIndex >= 0 ? column[blockIndex] : null;
    if (!childBlock) return null;

    const columnPrefix = `${currentPrefix ? `${currentPrefix} ` : ""}Column ${entry.columnIndex + 1}`;
    if (pathIndex === path.length - 1) {
      const blockLabel = tocBlockLabel(childBlock, blockIndex);
      return {
        scope: { kind: "column", rootScope, rootBlockId, path },
        block: childBlock,
        label: `${columnPrefix} ${lowerFirst(blockLabel)}`,
        summary: tocBlockSummary(childBlock),
      };
    }

    currentBlock = childBlock;
    currentPrefix = columnPrefix;
  }

  return null;
}

function selectedEditorBlockFromAnchor(questions: QuestionBlock[], anchor: string): SelectedEditorBlock | null {
  const parsed = parseScrollAnchor(anchor);
  if (!parsed.questionId || !parsed.blockId) return null;

  const question = questions.find((current) => current.id === parsed.questionId);
  if (!question) return null;

  if (parsed.kind === "columnBlock" && parsed.rootBlockId && parsed.columnPath?.length) {
    if (parsed.partId && parsed.subpartId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
      const rootBlock = subpart?.contentBlocks.find((current) => current.id === parsed.rootBlockId);
      if (!rootBlock) return null;
      return selectedColumnBlockFromRoot(
        rootBlock,
        { kind: "subpart", questionId: parsed.questionId, partId: parsed.partId, subpartId: parsed.subpartId },
        parsed.rootBlockId,
        parsed.columnPath,
        "Subpart",
      );
    }

    if (parsed.partId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const rootBlock = part?.contentBlocks.find((current) => current.id === parsed.rootBlockId);
      if (!rootBlock) return null;
      return selectedColumnBlockFromRoot(
        rootBlock,
        { kind: "part", questionId: parsed.questionId, partId: parsed.partId },
        parsed.rootBlockId,
        parsed.columnPath,
        "Part",
      );
    }

    const rootBlock = question.contentBlocks.find((current) => current.id === parsed.rootBlockId);
    if (!rootBlock) return null;
    return selectedColumnBlockFromRoot(
      rootBlock,
      { kind: "question", questionId: parsed.questionId },
      parsed.rootBlockId,
      parsed.columnPath,
    );
  }

  if (parsed.kind === "questionBlock") {
    return selectedEditorBlockFromBlocks(question.contentBlocks, parsed.blockId, { kind: "question", questionId: parsed.questionId });
  }

  if (parsed.kind === "partBlock" && parsed.partId) {
    const part = question.parts.find((current) => current.id === parsed.partId);
    if (!part) return null;
    return selectedEditorBlockFromBlocks(
      part.contentBlocks,
      parsed.blockId,
      { kind: "part", questionId: parsed.questionId, partId: parsed.partId },
      "Part",
    );
  }

  if (parsed.kind === "subpartBlock" && parsed.partId && parsed.subpartId) {
    const part = question.parts.find((current) => current.id === parsed.partId);
    const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
    if (!subpart) return null;
    return selectedEditorBlockFromBlocks(
      subpart.contentBlocks,
      parsed.blockId,
      { kind: "subpart", questionId: parsed.questionId, partId: parsed.partId, subpartId: parsed.subpartId },
      "Subpart",
    );
  }

  return null;
}

function tocBlockKind(block: EditorContentBlock): TocItemKind {
  if (block.kind === "choices") return "choices";
  if (block.kind === "table") return "table";
  if (block.kind === "diagram") return "diagram";
  if (block.kind === "columns") return "columns";
  if (block.kind === "space") return "space";
  return "text";
}

function buildDocumentToc(
  frontMatter: FrontMatterConfig,
  questions: QuestionBlock[],
  sectionHeadings: DocumentSectionHeading[],
  documentFlow: DocumentFlowItem[],
  showSolutions: boolean,
) {
  const isNotesTemplate = frontMatter.titlePageTemplate === "notes";
  const isCompactDocumentTemplate = frontMatter.titlePageTemplate === "worksheet" || isNotesTemplate;
  const items: DocumentTocItem[] = [
    {
      id: SCROLL_ANCHOR_FRONT_MATTER,
      label: isNotesTemplate ? "Notes heading" : frontMatter.titlePageTemplate === "worksheet" ? "Worksheet heading" : "Title Page",
      summary: `${frontMatter.subjectTitle} - ${
        isCompactDocumentTemplate ? frontMatter.assessmentTitle : assessmentTitleText(frontMatter.assessmentTitle)
      }`,
      kind: "title",
      depth: 0,
      editorAnchor: SCROLL_ANCHOR_FRONT_MATTER,
      previewAnchor: SCROLL_ANCHOR_FRONT_MATTER,
    },
  ];

  const questionMap = new Map(questions.map((question, index) => [question.id, { question, questionIndex: index }]));
  const sectionHeadingMap = new Map(sectionHeadings.map((heading) => [heading.id, heading]));
  const normalizedFlow = normalizeDocumentFlow(documentFlow, questions, sectionHeadings);

  normalizedFlow.forEach((flowItem) => {
    if (flowItem.kind === "sectionHeading") {
      const heading = sectionHeadingMap.get(flowItem.id);
      if (!heading) return;
      const headingAnchor = sectionHeadingScrollAnchor(heading.id);
      items.push({
        id: headingAnchor,
        label: heading.title.trim() || "Section heading",
        summary: isNotesTemplate ? "Notes section" : "Worksheet section",
        kind: "sectionHeading",
        depth: 0,
        editorAnchor: headingAnchor,
        previewAnchor: headingAnchor,
      });
      return;
    }

    const questionEntry = questionMap.get(flowItem.id);
    if (!questionEntry) return;
    const { question, questionIndex } = questionEntry;
    const questionAnchor = questionScrollAnchor(question.id);
    items.push({
      id: questionAnchor,
      label: isNotesTemplate ? notesSectionTitle(question, questionIndex) : `Question ${questionDisplayNumber(frontMatter, questionIndex)}`,
      summary: firstTextSource(question.contentBlocks, showSolutions) || markLabel(questionMarks(question)),
      kind: "question",
      depth: 0,
      editorAnchor: questionAnchor,
      previewAnchor: questionAnchor,
    });

    const questionItems = orderedQuestionItems(question);
    questionItems.forEach((item, itemIndex) => {
      if (item.kind === "block") {
        if (!isOrderedBlockVisible(questionItems, itemIndex, showSolutions)) return;
        const blockAnchor = questionBlockScrollAnchor(question.id, item.block.id);
        items.push({
          id: blockAnchor,
          label: tocBlockLabel(item.block, itemIndex),
          summary: tocBlockSummary(item.block),
          kind: tocBlockKind(item.block),
          depth: 1,
          editorAnchor: blockAnchor,
          previewAnchor: blockAnchor,
        });
        return;
      }

      const partIndex = Math.max(
        0,
        question.parts.findIndex((part) => part.id === item.part.id),
      );
      const partLabel = alphaLabel(partIndex);
      const partAnchor = partScrollAnchor(question.id, item.part.id);
      items.push({
        id: partAnchor,
        label: isNotesTemplate ? `Subheading ${partIndex + 1}` : `Part (${partLabel})`,
        summary: partPanelSummary(item.part.contentBlocks, showSolutions) || markLabel(partMarks(item.part)),
        kind: "part",
        depth: 1,
        editorAnchor: partAnchor,
        previewAnchor: partAnchor,
      });

      const partItems = orderedPartItems(item.part);
      partItems.forEach((partItem, partItemIndex) => {
        if (partItem.kind === "block") {
          if (!isOrderedBlockVisible(partItems, partItemIndex, showSolutions)) return;
          const blockAnchor = partBlockScrollAnchor(question.id, item.part.id, partItem.block.id);
          items.push({
            id: blockAnchor,
            label: tocBlockLabel(partItem.block, partItemIndex),
            summary: tocBlockSummary(partItem.block),
            kind: tocBlockKind(partItem.block),
            depth: 2,
            editorAnchor: blockAnchor,
            previewAnchor: blockAnchor,
          });
          return;
        }

        const subpartIndex = Math.max(
          0,
          item.part.subparts.findIndex((subpart) => subpart.id === partItem.subpart.id),
        );
        const subpartLabel = romanLabel(subpartIndex);
        const subpartAnchor = subpartScrollAnchor(question.id, item.part.id, partItem.subpart.id);
        items.push({
          id: subpartAnchor,
          label: isNotesTemplate ? `Detail ${subpartIndex + 1}` : `Subpart (${subpartLabel})`,
          summary: partPanelSummary(partItem.subpart.contentBlocks, showSolutions) || markLabel(partItem.subpart.marks),
          kind: "subpart",
          depth: 2,
          editorAnchor: subpartAnchor,
          previewAnchor: subpartAnchor,
        });

        partItem.subpart.contentBlocks
          .filter(
            (block, blockIndex) =>
              block.kind !== "pageBreak" && isContentBlockVisibleInScope(partItem.subpart.contentBlocks, blockIndex, showSolutions),
          )
          .forEach((block, blockIndex) => {
            const blockAnchor = subpartBlockScrollAnchor(question.id, item.part.id, partItem.subpart.id, block.id);
            items.push({
              id: blockAnchor,
              label: tocBlockLabel(block, blockIndex),
              summary: tocBlockSummary(block),
              kind: tocBlockKind(block),
              depth: 3,
              editorAnchor: blockAnchor,
              previewAnchor: blockAnchor,
            });
          });
      });
    });
  });

  return items;
}

function questionHasPageBreak(question: QuestionBlock) {
  return question.pageBreakAfter || question.contentBlocks.some((block) => block.kind === "pageBreak");
}

function firstQuestionId(questions: QuestionBlock[]) {
  return questions[0]?.id ?? "";
}

function existingOrFirstQuestionId(questions: QuestionBlock[], preferredQuestionId: string) {
  return questions.some((question) => question.id === preferredQuestionId) ? preferredQuestionId : firstQuestionId(questions);
}

function firstQuestionAnchor(questions: QuestionBlock[]) {
  const questionId = firstQuestionId(questions);
  return questionId ? questionScrollAnchor(questionId) : SCROLL_ANCHOR_FRONT_MATTER;
}

function flowItemAnchor(item?: DocumentFlowItem | null) {
  if (!item) return "";
  return item.kind === "sectionHeading" ? sectionHeadingScrollAnchor(item.id) : questionScrollAnchor(item.id);
}

function firstDocumentFlowAnchor(documentFlow: DocumentFlowItem[], questions: QuestionBlock[]) {
  return flowItemAnchor(documentFlow[0]) || firstQuestionAnchor(questions);
}

function DiagramBlockEditor({
  label,
  graphConfig,
  alignment = "center",
  showSolutions = true,
  settingsMode = "inline",
  anchor,
  activeAnchor,
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  onActivateAnchor,
  onChange,
  onAlignmentChange,
  onRemove,
}: DiagramBlockEditorProps) {
  const config = withGraphDefaults(graphConfig);
  const patchConfig = (patch: Partial<GraphConfig>) => onChange(updateGraphConfig(config, patch));
  const renderDiagramPanel = (summary: string, bodyClassName: string, children: ReactNode) => (
    <DiagramBlockPanel
      label={label}
      title={<InlineSummaryTitle label={label} summary={summary} />}
      type={config.type ?? "graph2d"}
      alignment={alignment}
      diagramTypes={DIAGRAM_TYPES}
      diagramTypeGroups={DIAGRAM_TYPE_GROUPS}
      diagramAlignments={DIAGRAM_ALIGNMENTS}
      settingsMode={settingsMode}
      dragHandle={dragHandle}
      muted={muted}
      active={active}
      openSignal={openSignal}
      bodyClassName={bodyClassName}
      onTypeChange={(type) => patchConfig(diagramTypePatch(type, config))}
      onAlignmentChange={onAlignmentChange}
      onRemove={onRemove}
    >
      {children}
    </DiagramBlockPanel>
  );
  if (config.type === "image") {
    const imageSummary = imageDiagramData(config).src ? imageDiagramName(config) : "No image selected";
    return renderDiagramPanel(imageSummary, "p-3", <ImageDiagramEditor config={config} onChange={patchConfig} />);
  }

  if (isPenroseDiagramType(config.type)) {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "p-3",
      config.type === "network" ? (
        <NetworkDiagramEditor
          config={config}
          substanceSource={penroseSubstanceSource(config)}
          settingsMode={settingsMode}
          onChange={patchConfig}
        />
      ) : config.type === "setDiagram" ? (
        <SetDiagramEditor config={config} settingsMode={settingsMode} onChange={patchConfig} />
      ) : (
        <GeometricConstructionEditor
          config={config}
          substanceSource={penroseSubstanceSource(config)}
          settingsMode={settingsMode}
          onChange={patchConfig}
        />
      ),
    );
  }

  if (config.type === "geometry2d") {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "graph-editor-controls p-3",
      <Geometry2DGraphEditor
        config={config}
        anchor={anchor}
        activeAnchor={activeAnchor}
        onActivateAnchor={onActivateAnchor}
        onChange={patchConfig}
      />,
    );
  }

  if (config.type === "vector2d") {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "graph-editor-controls p-3",
      <Vector2DGraphEditor config={config} settingsMode={settingsMode} onChange={patchConfig} />,
    );
  }

  if (config.type === "graph3d") {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "graph-editor-controls p-3",
      <Graph3DGraphEditor config={config} settingsMode={settingsMode} onChange={patchConfig} />,
    );
  }

  if (config.type === "statsChart") {
    return renderDiagramPanel(
      statsChartSummary(config),
      "p-3",
      <StatsChartEditor config={config} settingsMode={settingsMode} onChange={patchConfig} />,
    );
  }

  return renderDiagramPanel(
    diagramConfigSummary(config),
    "graph-editor-controls p-3",
    <FunctionGraphEditor
      config={config}
      showSolutions={showSolutions}
      settingsMode={settingsMode}
      anchor={anchor}
      activeAnchor={activeAnchor}
      onActivateAnchor={onActivateAnchor}
      onChange={patchConfig}
    />,
  );
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
    documentFlowFromQuestionChange: normalizedDocumentFlowFromState,
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
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
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

  const currentDraftSnapshotForStorage = useCallback(
    (): AutosavedEditorSnapshot => ({
      frontMatter: frontMatterRef.current,
      questions: questionsRef.current,
      sectionHeadings: sectionHeadingsRef.current,
      documentFlow: documentFlowRef.current,
      formattingConfig: formattingConfigRef.current,
      activeProjectFilePath: activeProjectFilePathRef.current ?? undefined,
      activeProjectFileRevision: activeProjectFileRevisionRef.current ?? undefined,
      documentOpen: editorDocumentOpenRef.current,
      logo: selectedLogoForFrontMatter(logosRef.current, frontMatterRef.current),
    }),
    [
      activeProjectFilePathRef,
      activeProjectFileRevisionRef,
      documentFlowRef,
      editorDocumentOpenRef,
      formattingConfigRef,
      frontMatterRef,
      logosRef,
      questionsRef,
      sectionHeadingsRef,
    ],
  );

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
  const darkMode = theme === "dark";
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
    () => buildDocumentToc(frontMatter, questions, sectionHeadings, documentFlow, effectiveShowSolutions),
    [documentFlow, effectiveShowSolutions, frontMatter, questions, sectionHeadings],
  );
  const activePreviewAnchor = useMemo(() => {
    if (activeTocItemId.startsWith("pb:")) return undefined;
    return previewAnchorForEditorAnchor(activeTocItemId, documentTocItems);
  }, [activeTocItemId, documentTocItems]);
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
  const draftChangeKey = `${editorDocumentOpen ? "open" : "closed"}|${activeProjectFilePath ?? ""}|${activeProjectFileRevision ?? ""}|${currentDocumentFingerprint}`;
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
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme still applies for the current session if browser storage is unavailable.
    }
  }, [theme]);

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

  function topLevelFlowInsertIndex(anchor: string) {
    const normalizedFlow = normalizeDocumentFlow(documentFlowRef.current, questionsRef.current, sectionHeadingsRef.current);
    const sectionHeadingId = sectionHeadingIdFromScrollAnchor(anchor);
    if (sectionHeadingId) {
      const headingIndex = normalizedFlow.findIndex((item) => item.kind === "sectionHeading" && item.id === sectionHeadingId);
      return headingIndex >= 0 ? headingIndex + 1 : normalizedFlow.length;
    }

    const questionId = questionIdFromScrollAnchor(anchor);
    if (questionId) {
      const questionIndex = normalizedFlow.findIndex((item) => item.kind === "question" && item.id === questionId);
      return questionIndex >= 0 ? questionIndex : normalizedFlow.length;
    }

    return normalizedFlow.length;
  }

  function addSectionHeading() {
    const heading = { id: id("section"), title: "Section heading" } satisfies DocumentSectionHeading;
    const normalizedFlow = normalizeDocumentFlow(documentFlowRef.current, questionsRef.current, sectionHeadingsRef.current);
    const insertIndex = topLevelFlowInsertIndex(activeRailItemId || activeTocItemId);
    const clampedInsertIndex = Math.max(0, Math.min(insertIndex, normalizedFlow.length));
    const nextFlow = [
      ...normalizedFlow.slice(0, clampedInsertIndex),
      { kind: "sectionHeading", id: heading.id } satisfies DocumentFlowItem,
      ...normalizedFlow.slice(clampedInsertIndex),
    ];
    setSectionFlowWithHistory([...sectionHeadingsRef.current, heading], nextFlow);
    const anchor = sectionHeadingScrollAnchor(heading.id);
    setActiveTocItemId(anchor);
    setActiveRailItemId(anchor);
    revealEditorAnchor(anchor);
    queueDocumentJump(anchor, anchor, { preservePaneMode: true });
  }

  function updateSectionHeading(sectionHeadingId: string, title: string) {
    const existing = sectionHeadingsRef.current.find((heading) => heading.id === sectionHeadingId);
    if (!existing || existing.title === title) return;
    setSectionFlowWithHistory(
      sectionHeadingsRef.current.map((heading) => (heading.id === sectionHeadingId ? { ...heading, title } : heading)),
      documentFlowRef.current,
    );
  }

  function removeSectionHeading(sectionHeadingId: string) {
    const normalizedFlow = normalizeDocumentFlow(documentFlowRef.current, questionsRef.current, sectionHeadingsRef.current);
    const removedIndex = normalizedFlow.findIndex((item) => item.kind === "sectionHeading" && item.id === sectionHeadingId);
    const nextHeadings = sectionHeadingsRef.current.filter((heading) => heading.id !== sectionHeadingId);
    const nextFlow = normalizedFlow.filter((item) => item.kind !== "sectionHeading" || item.id !== sectionHeadingId);
    setSectionFlowWithHistory(nextHeadings, nextFlow);
    const fallbackAnchor =
      flowItemAnchor(nextFlow[Math.min(Math.max(removedIndex, 0), nextFlow.length - 1)]) || firstQuestionAnchor(questionsRef.current);
    setActiveTocItemId(fallbackAnchor);
    setActiveRailItemId(fallbackAnchor);
    const fallbackQuestionId = questionIdFromScrollAnchor(fallbackAnchor);
    if (fallbackQuestionId) setActiveQuestionId(fallbackQuestionId);
    queueDocumentJump(fallbackAnchor, fallbackAnchor, { preservePaneMode: true });
  }

  function moveSectionHeadingByKeyboard(sectionHeadingId: string, direction: MoveDirection) {
    const normalizedFlow = normalizeDocumentFlow(documentFlowRef.current, questionsRef.current, sectionHeadingsRef.current);
    const sourceIndex = normalizedFlow.findIndex((item) => item.kind === "sectionHeading" && item.id === sectionHeadingId);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= normalizedFlow.length) return;
    const nextFlow = [...normalizedFlow];
    const [item] = nextFlow.splice(sourceIndex, 1);
    nextFlow.splice(targetIndex, 0, item);
    setSectionFlowWithHistory(sectionHeadingsRef.current, nextFlow);
    const anchor = sectionHeadingScrollAnchor(sectionHeadingId);
    setActiveTocItemId(anchor);
    setActiveRailItemId(anchor);
    queueDocumentJump(anchor, anchor, { preservePaneMode: true });
  }

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
      const nextQuestions = createScreenshotStarterQuestions();
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
    const dirty = Boolean(activePath && lastProjectSaveFingerprintRef.current !== documentFingerprint);
    const saveStatus: MauthAgentFileState["saveStatus"] = fileOperationBusy
      ? "loading"
      : activeProjectRevisionIssue
        ? "conflict"
        : activePath
          ? dirty
            ? "dirty"
            : "saved"
          : "draft";

    return {
      projectId: activeProject?.id ?? null,
      projectName: activeProject?.name ?? null,
      activePath,
      activeRevision,
      dirty,
      saveStatus,
      autosaveStatus: draftAutosaveStatus,
      autosaveMessage: draftAutosaveMessage,
    };
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

  function tocItemForContextAnchor(anchor: string) {
    for (const fallback of scrollAnchorFallbacks(anchor)) {
      const item = documentTocItems.find(
        (tocItem) => tocItem.id === fallback || tocItem.editorAnchor === fallback || tocItem.previewAnchor === fallback,
      );
      if (item) return item;
    }
    return null;
  }

  function exactTocItemForAnchor(anchor: string) {
    return (
      documentTocItems.find((tocItem) => tocItem.id === anchor || tocItem.editorAnchor === anchor || tocItem.previewAnchor === anchor) ??
      null
    );
  }

  function fallbackContextLabel(anchor: string) {
    const parsed = parseScrollAnchor(anchor);
    if (parsed.kind === "frontMatter") return "Title Page";
    if (parsed.kind === "sectionHeading") return "Section heading";
    if (parsed.kind === "pageBreak") return "Page break";
    if (parsed.kind === "question") return "Question";
    if (parsed.kind === "part") return "Part";
    if (parsed.kind === "subpart") return "Subpart";
    if (parsed.blockId) return "Module";
    return "Document item";
  }

  function contextDescriptorForAnchor(anchor: string) {
    const editorAnchor = graphChildParentScrollAnchor(anchor) ?? anchor;
    const exactItem = exactTocItemForAnchor(editorAnchor);
    if (exactItem) return exactItem;

    const selectedBlock = selectedEditorBlockFromAnchor(questions, editorAnchor);
    if (selectedBlock) {
      return {
        id: editorAnchor,
        label: selectedBlock.label,
        summary: selectedBlock.summary,
        kind: tocBlockKind(selectedBlock.block),
        depth: 0,
        editorAnchor,
        previewAnchor: previewAnchorForEditorAnchor(editorAnchor, documentTocItems),
      } satisfies DocumentTocItem;
    }

    const fallbackItem = tocItemForContextAnchor(editorAnchor);
    if (fallbackItem && !editorAnchor.includes("/c:")) return fallbackItem;

    const parsed = parseScrollAnchor(editorAnchor);
    return {
      id: editorAnchor,
      label: fallbackContextLabel(editorAnchor),
      kind: parsed.kind === "pageBreak" ? "pageBreak" : "text",
      depth: 0,
      editorAnchor,
      previewAnchor: previewAnchorForEditorAnchor(editorAnchor, documentTocItems),
    } satisfies DocumentTocItem;
  }

  function contextReferenceText(anchor: string) {
    const item = contextDescriptorForAnchor(anchor);
    const questionId = questionIdFromScrollAnchor(item.editorAnchor);
    const questionIndex = questionId ? questions.findIndex((question) => question.id === questionId) : -1;
    const questionLabel = questionIndex >= 0 ? `Question ${questionIndex + 1}` : "";
    const target = questionLabel && item.kind !== "question" ? `${questionLabel} · ${item.label}` : item.label;
    const summary = item.summary ? tocSummaryText(item.summary) : "";
    return [
      `Mauth target: @mauth[${item.editorAnchor}]`,
      `Item: ${target || item.editorAnchor}`,
      item.kind ? `Type: ${item.kind}` : "",
      summary ? `Summary: ${summary}` : "",
    ]
      .filter(Boolean)
      .join("\n");
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

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
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
    return cn(
      "relative",
      draggedSubsection && subsectionKey(draggedSubsection) === subsectionKey(target) && "scale-[0.995] opacity-70 shadow-2xl",
      dropPlacement === "inside" &&
        "bg-primary/5 ring-2 ring-primary/60 ring-offset-2 ring-offset-background shadow-[0_0_0_4px_hsl(var(--primary)/0.10)]",
    );
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
    const label = pageBreakCanDrop && !subsectionCanDrop ? "Drop page break here" : containerDropZoneLabel(container, placement);
    return (
      <div
        key={targetKey}
        data-subsection-container-drop="true"
        data-subsection-container-placement={placement}
        {...subsectionContainerDataAttributes(container)}
        onDragOver={(event) => handleContainerDropZoneDragOver(event, container, placement)}
        onDragLeave={(event) => handleContainerDropZoneDragLeave(event, container, placement)}
        onDrop={(event) => handleContainerDropZoneDrop(event, container, placement)}
        className={cn(
          "relative my-1 h-2 rounded-md border border-dashed border-transparent bg-transparent text-muted-foreground transition-all",
          active && "my-3 h-11 border-primary bg-primary/10 text-primary shadow-inner",
        )}
      >
        {active ? <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">{label}</div> : null}
      </div>
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
    const label = pageBreakCanDrop && !subsectionCanDrop ? "Drop page break here" : itemDropZoneLabel(beforeItem);
    return (
      <div
        key={targetKey}
        data-subsection-item-drop="true"
        data-subsection-before-item-kind={beforeItem.kind}
        data-subsection-before-item-id={beforeItem.id}
        {...subsectionContainerDataAttributes(container)}
        onDragOver={(event) => handleItemDropZoneDragOver(event, container, beforeItem)}
        onDragLeave={(event) => handleItemDropZoneDragLeave(event, container, beforeItem)}
        onDrop={(event) => handleItemDropZoneDrop(event, container, beforeItem)}
        className={cn(
          "relative my-0.5 h-2 rounded-md border border-dashed border-transparent bg-transparent text-muted-foreground transition-all",
          active && "my-2 h-12 border-primary bg-primary/10 text-primary shadow-inner",
        )}
      >
        {active ? <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">{label}</div> : null}
      </div>
    );
  }

  function subsectionDragHandle(target: SubsectionDragTarget, label: string) {
    return (
      <div
        role="button"
        tabIndex={0}
        draggable
        data-subsection-drag-handle="true"
        title={label}
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => handleSubsectionPointerDown(event, target)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onDragStart={(event) => handleSubsectionDragStart(event, target)}
        onDragEnd={handleSubsectionDragEnd}
        className="inline-flex size-8 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
      >
        <GripVertical className="pointer-events-none size-4" aria-hidden="true" />
      </div>
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
    const contextLabel = isNotesTemplate
      ? target.kind === "part"
        ? "next subheading"
        : "next detail"
      : target.kind === "part"
        ? "next part"
        : "next subpart";
    return (
      <div
        key={`page-break-row-${editorPageBreakKey(target)}`}
        data-drag-preview
        tabIndex={0}
        title={`Page break. The ${contextLabel} starts on a new page. Drag or press Alt+Up/Alt+Down to move it. Delete removes it.`}
        aria-label={`Page break. The ${contextLabel} starts on a new page.`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete Backspace"
        onKeyDown={(event) => {
          if (keyboardDeleteRequested(event)) {
            event.preventDefault();
            event.stopPropagation();
            setEditorPageBreak(target, false);
            return;
          }
          const direction = keyboardMoveDirection(event);
          if (!direction) return;
          event.preventDefault();
          event.stopPropagation();
          moveEditorPageBreakByKeyboard(target, direction);
        }}
        className={cn(
          "flex items-center gap-2 rounded-md border border-dashed border-primary/45 bg-primary/[0.035] px-2 py-1.5 text-sm text-primary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
          moving && "scale-[0.995] opacity-70 shadow-2xl",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          draggable
          title="Drag page break"
          aria-label="Drag page break"
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => handleEditorPageBreakDragStart(event, target)}
          onDragEnd={handleEditorPageBreakDragEnd}
          className="size-7 cursor-grab text-primary/75 active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </Button>
        <FileText className="size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">Page break</div>
          <div className="truncate text-xs text-muted-foreground">
            {contextLabel[0].toUpperCase() + contextLabel.slice(1)} starts on a new page
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Remove page break"
          aria-label="Remove page break"
          onClick={(event) => {
            event.stopPropagation();
            setEditorPageBreak(target, false);
          }}
          className="hover:text-destructive size-7 text-muted-foreground"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    );
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
    const subpartUsesSolutionSpace = supportsSolutionTools && safeMarkValue(subpart.marks) > 0;
    const subpartContainer: SubsectionContainerRef = {
      kind: "subpart",
      questionId: question.id,
      partId: part.id,
      subpartId: subpart.id,
    };
    const subpartSolutionSlotAction = {
      label: "Solution slot",
      tooltip: "Add paired answer space and solution text",
      icon: <FileText className="size-4" aria-hidden="true" />,
      onClick: () => addSubpartSolutionSlot(question.id, part, subpart),
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
              subpartUsesSolutionSpace
                ? addSubpartSolutionSlot(question.id, part, subpart)
                : addSubpartBlock(question.id, part, subpart, "space")
            }
            spaceActionLabel={subpartUsesSolutionSpace ? "Answer + solution" : "Space"}
            spaceActionTooltip={
              subpartUsesSolutionSpace
                ? "Add the default paired student answer space and solution block for this marked subpart"
                : undefined
            }
            extraActions={[...(subpartUsesSolutionSpace || !supportsSolutionTools ? [] : [subpartSolutionSlotAction])]}
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
    const partUsesSolutionSpace = supportsSolutionTools && !subparts.length && safeMarkValue(part.marks) > 0;
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
    const partSolutionSlotAction = {
      label: "Solution slot",
      tooltip: "Add paired answer space and solution text",
      icon: <FileText className="size-4" aria-hidden="true" />,
      onClick: () => addPartSolutionSlot(question.id, part),
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
              onAddSpace={() => (partUsesSolutionSpace ? addPartSolutionSlot(question.id, part) : addPartBlock(question.id, part, "space"))}
              spaceActionLabel={partUsesSolutionSpace ? "Answer + solution" : "Space"}
              spaceActionTooltip={
                partUsesSolutionSpace ? "Add the default paired student answer space and solution block for this marked part" : undefined
              }
              extraActions={[
                ...(partUsesSolutionSpace || !supportsSolutionTools ? [] : [partSolutionSlotAction]),
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
                              const questionUsesSolutionSpace = supportsSolutionTools && !hasParts && safeMarkValue(question.marks) > 0;
                              const nextPartPageBreakTarget = partPageBreakInsertTarget(question);
                              const questionSolutionSlotAction = {
                                label: "Solution slot",
                                tooltip: "Add paired answer space and solution text",
                                icon: <FileText className="size-4" aria-hidden="true" />,
                                onClick: () => addQuestionSolutionSlot(question.id),
                              };

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
                                        questionUsesSolutionSpace
                                          ? addQuestionSolutionSlot(question.id)
                                          : addQuestionBlock(question.id, "space")
                                      }
                                      spaceActionLabel={questionUsesSolutionSpace ? "Answer + solution" : "Space"}
                                      spaceActionTooltip={
                                        questionUsesSolutionSpace
                                          ? "Add the default paired student answer space and solution block for this marked question"
                                          : undefined
                                      }
                                      extraActions={[
                                        ...(questionUsesSolutionSpace || !supportsSolutionTools ? [] : [questionSolutionSlotAction]),
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
