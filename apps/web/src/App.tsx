import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  CSSProperties,
  DragEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import type {
  ChoiceListLayout,
  ChoiceNumberingStyle,
  ContentBlock,
  ContentBlockVisibility,
  DiagramAlignment,
  DiagramTextSide,
  FormattingConfig,
  GraphConfig,
  ProjectFileDocument,
  ProjectFileSummary,
  ProjectFileVersion,
  ProjectSummary,
  QuestionPart,
  QuestionSubpart,
  TableCellAlignment,
} from "@mauth-studio/shared";
import { DEFAULT_STATS_CHART_SPEC, normalizeStatsChartSpec, statsChartSummary } from "@mauth-studio/diagram-plotly";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  GitBranch,
  GripVertical,
  ImagePlus,
  ListTree,
  ListOrdered,
  Moon,
  Plus,
  PlusCircle,
  Redo2,
  Save,
  SeparatorHorizontal,
  Sun,
  Table2,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";

import { Latex } from "@/components/Latex";
import { MauthAssistantPanel } from "@/components/assistant/MauthAssistantPanel";
import { GeometricConstructionDiagram } from "@/components/diagrams/GeometricConstructionDiagram";
import { ChoiceListBlockEditor } from "@/components/editor/ChoiceListBlockEditor";
import { DiagramBlockPanel } from "@/components/editor/DiagramBlockPanel";
import { CollapsiblePanel, ContentInsertionActions, EDITOR_ACTIVE_PANEL_CLASS, RemoveActionButton } from "@/components/editor/EditorPanels";
import { FunctionGraphEditor } from "@/components/editor/FunctionGraphEditor";
import { Graph3DGraphEditor } from "@/components/editor/Graph3DGraphEditor";
import { GeometricConstructionEditor } from "@/components/editor/GeometricConstructionEditor";
import { ImageDiagramEditor } from "@/components/editor/ImageDiagramEditor";
import { SetDiagramEditor } from "@/components/editor/SetDiagramEditor";
import { SpaceBlockEditor } from "@/components/editor/SpaceBlockEditor";
import { StatsChartEditor } from "@/components/editor/StatsChartEditor";
import { TableBlockEditor } from "@/components/editor/TableBlockEditor";
import { TextBlockEditor } from "@/components/editor/TextBlockEditor";
import { Vector2DGraphEditor } from "@/components/editor/Vector2DGraphEditor";
import { VectorRelationshipEditor } from "@/components/editor/VectorRelationshipEditor";
import { FileManagementDrawer } from "@/components/files/FileManagementDrawer";
import { StatsChartDiagram } from "@/components/diagrams/StatsChartDiagram";
import { Basic3DGraph } from "@/components/graphs/Basic3DGraph";
import { FunctionGraph } from "@/components/graphs/FunctionGraph";
import { Vector2DGraph } from "@/components/graphs/Vector2DGraph";
import {
  PreviewContentBlocks as PreviewContentBlocksBase,
  type PreviewContentBlocksProps as PreviewContentBlocksBaseProps,
  type PreviewContentRenderers,
  type PreviewContentRuntime,
} from "@/components/preview/PreviewContentBlocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  deleteStoredLogo,
  downloadProjectBackup,
  getDefaultProject,
  getProjectFile,
  getStorageAutosave,
  importProjectBackup,
  listProjectFiles,
  listProjectFileVersions,
  listStoredLogos,
  listStoredTests as listLegacyStoredTests,
  deleteProjectFile,
  restoreProjectFileVersion,
  saveProjectFile,
  saveStorageAutosave,
  saveStoredLogo,
} from "@/lib/api";
import {
  applyMauthAction,
  applyMauthActions,
  applyMauthDocumentAction,
  applyMauthDocumentActions,
  previewMauthDocumentActions,
  type MauthAction,
  type MauthActionPreviewSummary,
  type MauthActionResult,
  type MauthContentScope,
  type MauthDocumentAction,
  type MauthDocumentActionOptions,
  type MauthDocumentActionResult,
} from "@/lib/mauthActions";
import { useMauthAssistantHost } from "@/hooks/useMauthAssistantHost";
import { useMauthAssistantController } from "@/hooks/useMauthAssistantController";
import { useProjectFilesController, type ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import {
  TEST_FILE_ROOT_LABEL,
  ensureTestFileName,
  formatProjectFileSize,
  isProjectTestFile,
  joinTestPath,
  normalizeTestFolderPath,
  parentTestPath,
  projectPathContains,
  projectPathForTestPath,
  safeProjectFileName,
  testFileDisplayName,
  testFilePathKey,
  testPathBasename,
  testPathFromProjectPath,
  topLevelProjectPaths,
  uniqueTestPath,
} from "@/lib/projectFiles";
import { collectRenderedPreviewMetrics } from "@/lib/mauthPreviewMetrics";
import {
  normalizeChoiceItems,
  normalizeChoiceListLayout,
  normalizeChoiceNumberingStyle,
  normalizeDiagramAlignment,
  normalizeTableBlock,
  normalizeTableCellAlignment,
  normalizeTableCells,
  normalizeTableRows,
  normalizedTableColumnCount,
  paddedTableRow,
  plainTableRows,
} from "@/lib/contentBlockNormalization";
import { DEFAULT_3D_GRAPH } from "@/lib/diagram3d";
import {
  DEFAULT_2D_GRAPH,
  graphFeaturesFromConfig,
  graphFunctionsFromConfig,
  graphHeight,
  graphWidth,
  isSolutionOnlyGraphFeature,
} from "@/lib/diagramGraph2d";
import { DEFAULT_IMAGE_DIAGRAM, finiteGraphNumber, imageDiagramData, imageDiagramName, imageDiagramAlt } from "@/lib/diagramImage";
import {
  DEFAULT_PENROSE_PRESET,
  DEFAULT_PENROSE_SCALE_PERCENT,
  SETS_PENROSE_PRESET,
  penroseOptions,
  penrosePreset,
  penroseScalePercent,
} from "@/lib/diagramPenrose";
import { DEFAULT_SET_DATA, DEFAULT_SET_DIAGRAM, generatedSetPenroseSubstance } from "@/lib/diagramSet";
import { DEFAULT_VECTOR_2D_GRAPH, DEFAULT_VECTOR_2D_METADATA, normalizedVector2DEntries } from "@/lib/diagramVector2d";
import { DEFAULT_VECTOR_RELATIONSHIP_DATA } from "@/lib/diagramVectorRelationship";
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
const TEST_FORMAT_PRESETS = [
  {
    id: "high-school-mathematics-test",
    label: "High school mathematics test",
  },
  {
    id: "exam-booklet",
    label: "School exam booklet",
  },
];
const NEW_TEST_TEMPLATES: Array<{
  id: TitlePageTemplate;
  title: string;
  description: string;
  formatPresetId: FormattingConfig["id"];
}> = [
  {
    id: "standard",
    title: "School test",
    description: "Single Mauth title page with school logo, name line, marks, declaration, and test conditions.",
    formatPresetId: "high-school-mathematics-test",
  },
  {
    id: "exam",
    title: "School exam booklet",
    description: "School-logo exam cover, structure page, running headers, question footers, and supplementary pages.",
    formatPresetId: "exam-booklet",
  },
];
const PAGE_PRESETS = [
  {
    id: "a4-portrait",
    label: "A4 portrait",
    page: {
      size: "A4",
      orientation: "portrait",
      ...DEFAULT_PAGE_FORMAT,
    },
  },
];
const QUESTION_GAP_PX = 32;
const PREVIEW_FIT_PADDING_PX = 40;
const MIN_PREVIEW_SCALE = 0.55;
const MAX_PREVIEW_FIT_SCALE = 1;
const MIN_PREVIEW_ZOOM = 0.7;
const MAX_PREVIEW_ZOOM = 3;
const PREVIEW_WHEEL_ZOOM_SENSITIVITY = 0.0018;
const PREVIEW_ZOOM_STATE_SYNC_DELAY_MS = 160;
const PREVIEW_EDIT_CLICK_MOVE_TOLERANCE_PX = 6;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const DEFAULT_SOLUTION_SLOT_LINES = 8;
const MIN_SOLUTION_SLOT_LINES = 4;
const MAX_SOLUTION_SLOT_LINES = 18;
const DEFAULT_SOLUTION_SLOT_TEXT = "**Solution.**\n\n";
const LOGO_LIBRARY_STORAGE_KEY = "mauth-studio.logo-library.v1";
const LOGO_STARTER_SEED_STORAGE_KEY = "mauth-studio.logo-starter-seed.v1";
const SAVED_TEST_STORAGE_KEY = "mauth-studio.saved-tests.v1";
const CURRENT_DRAFT_STORAGE_KEY = "mauth-studio.current-draft.v1";
const STARTER_DOCUMENT_STORAGE_KEY = "mauth-studio.starter-document.v1";
const THEME_STORAGE_KEY = "mauth-studio.theme.v1";
const LEGACY_LOGO_LIBRARY_STORAGE_KEY = "math-app.logo-library.v1";
const LEGACY_SAVED_TEST_STORAGE_KEY = "math-app.saved-tests.v1";
const LEGACY_CURRENT_DRAFT_STORAGE_KEY = "math-app.current-draft.v1";
const LEGACY_STARTER_DOCUMENT_STORAGE_KEY = "math-app.starter-document.v1";
const SCREENSHOT_STARTER_DOCUMENT_ID = "calculus-area-screenshot-questions-v4";
const AUTOSAVE_DEBOUNCE_MS = 900;
const STARTER_LOGOS: LogoAsset[] = [
  {
    id: "acc-logo",
    name: "Australian Christian College",
    src: "/logos/acc_logo.svg",
    schoolName: "AUSTRALIAN\nCHRISTIAN COLLEGE",
  },
  {
    id: "cornerstone-logo",
    name: "Cornerstone Christian College",
    src: "/logos/cornerstone_logo.svg",
    schoolName: "CORNERSTONE\nCHRISTIAN COLLEGE",
  },
];
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
  studentNumberLabel: "WA student number:",
  studentNumberFiguresLabel: "In figures",
  studentNumberWordsLabel: "In words",
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
  cutOffNotice: "DO NOT WRITE IN THIS AREA AS IT WILL BE CUT OFF",
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
const DIAGRAM_TYPES = [
  { value: "graph2d", label: "2D graph" },
  { value: "vector2d", label: "2D vector graph" },
  { value: "graph3d", label: "3D graph" },
  { value: "image", label: "Image" },
  { value: "geometricConstruction", label: "Geometric construction" },
  { value: "vectorRelationship", label: "Network" },
  { value: "setDiagram", label: "Set diagram" },
  { value: "statsChart", label: "Statistics chart" },
];
const DIAGRAM_TYPE_GROUPS = [
  { label: "Coordinate", values: ["graph2d", "vector2d", "graph3d"] },
  { label: "Construction", values: ["geometricConstruction", "vectorRelationship", "setDiagram"] },
  { label: "Statistics", values: ["statsChart"] },
  { label: "Media", values: ["image"] },
];
const DIAGRAM_ALIGNMENTS: Array<{ value: DiagramAlignment; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];
const CHOICE_NUMBERING_STYLES: Array<{ value: ChoiceNumberingStyle; label: string }> = [
  { value: "roman", label: "Roman numerals" },
  { value: "upper-alpha", label: "A, B, C" },
  { value: "lower-alpha", label: "a, b, c" },
  { value: "decimal", label: "1, 2, 3" },
  { value: "bullet", label: "Bullets" },
];
const CHOICE_LIST_LAYOUTS: Array<{ value: ChoiceListLayout; label: string }> = [
  { value: "vertical", label: "Vertical" },
  { value: "two-column", label: "Two columns" },
  { value: "inline", label: "Inline" },
];
const TABLE_CELL_ALIGNMENTS: Array<{ value: TableCellAlignment; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];
type EditorContentBlock = ContentBlock;
type EditorSubpart = Omit<QuestionSubpart, "contentBlocks"> & { contentBlocks: EditorContentBlock[] };
type ContainerItemKind = "block" | "part" | "subpart";
interface ContainerOrderItem {
  kind: ContainerItemKind;
  id: string;
}
type EditorPart = Omit<QuestionPart, "contentBlocks" | "subparts"> & {
  contentBlocks: EditorContentBlock[];
  subparts: EditorSubpart[];
  itemOrder: ContainerOrderItem[];
};
type OrderedQuestionItem = { kind: "block"; id: string; block: EditorContentBlock } | { kind: "part"; id: string; part: EditorPart };
type OrderedPartItem = { kind: "block"; id: string; block: EditorContentBlock } | { kind: "subpart"; id: string; subpart: EditorSubpart };
type ContentBlockKind = "text" | "choices" | "table" | "diagram" | "space";

interface QuestionBlock {
  id: string;
  section: string;
  marks: number;
  contentBlocks: EditorContentBlock[];
  parts: EditorPart[];
  itemOrder: ContainerOrderItem[];
  pageBreakAfter?: boolean;
}

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

type DropPlacement = "before" | "after" | "inside";
type MoveDirection = -1 | 1;
type PanelDragRegion = "header" | "body";
type TocItemKind = "title" | "question" | "pageBreak" | "text" | "choices" | "table" | "diagram" | "space" | "part" | "subpart";

const SUBSECTION_DRAG_MIME = "application/x-math-subsection";
const SUBSECTION_DRAG_TEXT_PREFIX = "math-subsection:";
const PAGE_BREAK_DRAG_MIME = "application/x-mauth-page-break";
const PAGE_BREAK_DRAG_TEXT_PREFIX = "mauth-page-break:";

interface SubsectionDropPreview {
  targetKey: string;
  placement: DropPlacement;
  intent: SubsectionDropIntent;
}

interface QuestionDropPreview {
  questionId: string;
  placement: Exclude<DropPlacement, "inside">;
}

interface PageBreakDropPreview {
  questionId: string;
  placement: Exclude<DropPlacement, "inside">;
}

type SafariGestureEvent = Event & { scale?: number; clientX?: number; clientY?: number };

interface PreviewEditClickStart {
  x: number;
  y: number;
  pointerId: number;
}

interface DocumentTocItem {
  id: string;
  label: string;
  summary?: string;
  kind: TocItemKind;
  depth: number;
  editorAnchor: string;
  previewAnchor: string;
}

type PaneMode = "split" | "assistant" | "preview";
type ThemeMode = "light" | "dark";

interface EditorHistorySnapshot {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  formattingConfig: FormattingConfig;
}

type EditorDocumentState = EditorHistorySnapshot;

interface AutosavedEditorSnapshot extends EditorHistorySnapshot {
  logo?: LogoAsset;
  activeProjectFilePath?: string;
  activeProjectFileRevision?: number;
  updatedAt?: string;
}

type DraftAutosaveStatus = "loading" | "ready" | "saving" | "saved" | "unavailable" | "error";
type HeaderSaveStatus = DraftAutosaveStatus | "dirty" | "draft" | "conflict";

const HISTORY_LIMIT = 80;
const PROJECT_FILE_REVISION_MISSING_ERROR = "PROJECT_FILE_REVISION_MISSING";

interface LogoAsset {
  id: string;
  name: string;
  src: string;
  schoolName?: string;
}

type TitlePageTemplate = "standard" | "exam";
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
  cutOffNotice: string;
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

interface SavedTest {
  id: string;
  name: string;
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  formattingConfig: FormattingConfig;
  logo?: LogoAsset;
  createdAt: string;
  updatedAt: string;
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localStorageItem(key: string, legacyKey?: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null);
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

function loadLogoLibrary(): LogoAsset[] {
  if (typeof window === "undefined") return STARTER_LOGOS;

  try {
    const stored = localStorageItem(LOGO_LIBRARY_STORAGE_KEY, LEGACY_LOGO_LIBRARY_STORAGE_KEY);
    if (!stored) return STARTER_LOGOS;
    const parsed = JSON.parse(stored) as unknown[];
    const storedLogos = Array.isArray(parsed)
      ? parsed.flatMap((logo) => {
          const normalizedLogo = normalizeLogoAsset(logo);
          return normalizedLogo ? [normalizedLogo] : [];
        })
      : [];
    return storedLogos.length ? storedLogos : STARTER_LOGOS;
  } catch {
    return STARTER_LOGOS;
  }
}

function persistLogoLibrary(logos: LogoAsset[]) {
  if (typeof window === "undefined") return;

  try {
    const persistedLogos = logos.map(({ id: logoId, name, src, schoolName }) => ({
      id: logoId,
      name,
      src,
      ...(typeof schoolName === "string" ? { schoolName } : {}),
    }));
    window.localStorage.setItem(LOGO_LIBRARY_STORAGE_KEY, JSON.stringify(persistedLogos));
  } catch {
    // Large uploaded images can exceed browser storage limits; keep the in-memory choice for this session.
  }
}

function shouldSeedStarterLogos() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LOGO_STARTER_SEED_STORAGE_KEY) !== "done";
}

function markStarterLogosSeeded() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOGO_STARTER_SEED_STORAGE_KEY, "done");
}

function logoNameFromFile(fileName: string) {
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim() || "Custom logo"
  );
}

function selectedLogoFromLibrary(logos: LogoAsset[], logoId: string) {
  return logos.find((logo) => logo.id === logoId) ?? logos[0] ?? STARTER_LOGOS[0];
}

function selectedLogoForFrontMatter(logos: LogoAsset[], frontMatter: Pick<FrontMatterConfig, "logoId">) {
  return frontMatter.logoId ? selectedLogoFromLibrary(logos, frontMatter.logoId) : undefined;
}

function frontMatterPatchForLogo(logos: LogoAsset[], logoId: string): Pick<FrontMatterConfig, "logoId"> & Partial<FrontMatterConfig> {
  const logo = selectedLogoFromLibrary(logos, logoId);
  return {
    logoId,
    ...(typeof logo.schoolName === "string" ? { schoolName: logo.schoolName } : {}),
  };
}

function assessmentTitleText(value: string) {
  return value
    .split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g)
    .map((segment) => (segment.startsWith("$") ? segment : segment.toUpperCase()))
    .join("");
}

function titlePageTemplateFromValue(value: unknown): TitlePageTemplate {
  return value === "exam" ? "exam" : "standard";
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
    cutOffNotice: stringOrDefault(record?.cutOffNotice, DEFAULT_EXAM_TITLE_PAGE.cutOffNotice),
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
  return {
    titlePageTemplate,
    logoId: typeof candidate.logoId === "string" ? candidate.logoId : DEFAULT_FRONT_MATTER.logoId,
    schoolName: typeof candidate.schoolName === "string" ? candidate.schoolName : DEFAULT_FRONT_MATTER.schoolName,
    subjectTitle: typeof candidate.subjectTitle === "string" ? candidate.subjectTitle : DEFAULT_FRONT_MATTER.subjectTitle,
    assessmentTitle: assessmentTitleText(
      typeof candidate.assessmentTitle === "string" ? candidate.assessmentTitle : DEFAULT_FRONT_MATTER.assessmentTitle,
    ),
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

function formattingPresetLabel(formattingConfig: FormattingConfig) {
  return TEST_FORMAT_PRESETS.find((preset) => preset.id === formattingConfig.id)?.label ?? formattingConfig.id ?? "Custom test format";
}

function pagePresetId(formattingConfig: FormattingConfig) {
  const page = normalizePageFormattingConfig(formattingConfig.page);
  const a4Page = PAGE_PRESETS[0].page;
  if (
    page.size === a4Page.size &&
    page.orientation === a4Page.orientation &&
    page.widthPx === a4Page.widthPx &&
    page.heightPx === a4Page.heightPx
  ) {
    return PAGE_PRESETS[0].id;
  }
  return "custom";
}

function formatSettingNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function normalizedStartQuestionNumber(frontMatter: FrontMatterConfig) {
  return Math.max(1, Math.floor(frontMatter.startQuestionNumber || 1));
}

function questionDisplayNumber(frontMatter: FrontMatterConfig, questionIndex: number) {
  return normalizedStartQuestionNumber(frontMatter) + questionIndex;
}

function normalizeLogoAsset(value: unknown): LogoAsset | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<LogoAsset>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || typeof candidate.src !== "string") {
    return undefined;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    src: candidate.src,
    ...(typeof candidate.schoolName === "string" ? { schoolName: candidate.schoolName } : {}),
  };
}

function normalizeLogoAssets(value: unknown): LogoAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((logo): LogoAsset[] => {
    const normalizedLogo = normalizeLogoAsset(logo);
    return normalizedLogo ? [normalizedLogo] : [];
  });
}

function mergeLogoAssets(current: LogoAsset[], assets: Array<LogoAsset | null | undefined>) {
  let changed = false;
  const next = [...current];

  for (const asset of assets) {
    const logo = normalizeLogoAsset(asset);
    if (!logo) continue;

    const existingIndex = next.findIndex((candidate) => candidate.id === logo.id);
    if (existingIndex === -1) {
      next.push(logo);
      changed = true;
      continue;
    }

    const existing = next[existingIndex];
    if (existing.name !== logo.name || existing.src !== logo.src || existing.schoolName !== logo.schoolName) {
      next[existingIndex] = logo;
      changed = true;
    }
  }

  return changed ? next : current;
}

function appendMissingLogoAssets(current: LogoAsset[], assets: Array<LogoAsset | null | undefined>) {
  let changed = false;
  const next = [...current];

  for (const asset of assets) {
    const logo = normalizeLogoAsset(asset);
    if (!logo || next.some((candidate) => candidate.id === logo.id)) continue;
    next.push(logo);
    changed = true;
  }

  return changed ? next : current;
}

function schoolInitials(lines: string[]) {
  const words = lines.join(" ").split(/\s+/).filter(Boolean);
  return words
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function textBlock(text = "", visibilityOrSolutionOnly?: ContentBlockVisibility | boolean): EditorContentBlock {
  const visibility = visibilityOrSolutionOnly === true ? "solution" : visibilityOrSolutionOnly || undefined;
  return {
    id: id(visibility === "solution" ? "solution" : "text"),
    kind: "text",
    text,
    ...blockVisibilityFields(visibility),
  };
}

function choiceListBlock(choices: string[] = ["", "", ""]): EditorContentBlock {
  return { id: id("choices"), kind: "choices", choices, numberingStyle: "roman", layout: "vertical" };
}

function tableBlock(): EditorContentBlock {
  return {
    id: id("table"),
    kind: "table",
    headers: ["", "", ""],
    rows: [
      ["x", "0", "1"],
      ["P(X=x)", "$1-p$", "$p$"],
    ],
    showHeader: false,
    tableAlign: "center",
    cellAlignment: "center",
  };
}

function diagramBlock(): EditorContentBlock {
  return {
    id: id("diagram"),
    kind: "diagram",
    diagramAlign: "center",
    graphConfig: withGraphDefaults(DEFAULT_2D_GRAPH),
  };
}

function spaceBlock(lines = 3, visibility: ContentBlockVisibility = "student"): EditorContentBlock {
  return { id: id("space"), kind: "space", lines, ...blockVisibilityFields(visibility) };
}

function solutionSlotBlocks(lines = DEFAULT_SOLUTION_SLOT_LINES): EditorContentBlock[] {
  return [spaceBlock(lines, "student"), textBlock(DEFAULT_SOLUTION_SLOT_TEXT, "solution")];
}

function contentBlockForKind(kind: ContentBlockKind): EditorContentBlock {
  if (kind === "choices") return choiceListBlock();
  if (kind === "table") return tableBlock();
  if (kind === "diagram") return diagramBlock();
  if (kind === "space") return spaceBlock();
  return textBlock();
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
  return type === "geometricConstruction" || type === "vectorRelationship" || type === "setDiagram";
}

function defaultPenrosePresetForType(type?: string | null) {
  return normalizeDiagramType(type) === "setDiagram" ? SETS_PENROSE_PRESET : DEFAULT_PENROSE_PRESET;
}

function defaultPenroseDataForType(type?: string | null) {
  const normalizedType = normalizeDiagramType(type);
  if (normalizedType === "setDiagram") return DEFAULT_SET_DATA;
  if (normalizedType === "vectorRelationship") return DEFAULT_VECTOR_RELATIONSHIP_DATA;
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
  const fallback = normalizeDiagramType(config.type) === "vectorRelationship" ? DEFAULT_VECTOR_RELATIONSHIP_DATA : DEFAULT_GEOMETRIC_DATA;
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
  const isVectorRelationship = normalizeDiagramType(config.type) === "vectorRelationship";
  const hideVectorPoints = isVectorRelationship && data.hidePoints === true;
  const hideVectorPointLabels = isVectorRelationship && data.hidePointLabels === true;
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
    const hideLabel = point.hideLabel === true || point.showLabel === false || hideVectorPointLabels;
    lines.push(penroseLabelStatement(pointName, hideLabel ? "\\," : (point.label ?? pointName)));
  });
  pointEntries.forEach((point, index) => {
    if (point.hidePoint === true || point.hidden === true || point.showPoint === false || hideVectorPoints) {
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

function orderItemKey(item?: ContainerOrderItem | null) {
  return item ? `${item.kind}:${item.id}` : "";
}

function containerKey(container?: SubsectionContainerRef | null) {
  if (!container) return "";
  return `${container.kind}:${container.questionId}:${container.partId ?? ""}:${container.subpartId ?? ""}`;
}

function containerDropKey(container: SubsectionContainerRef, placement: "start" | "end") {
  return `container:${containerKey(container)}:${placement}`;
}

function containerDropZoneLabel(container: SubsectionContainerRef, placement: "start" | "end") {
  const scope = container.kind === "question" ? "question" : container.kind;
  return placement === "start" ? `Drop at start of ${scope}` : `Drop at end of ${scope}`;
}

function normalizeItemOrder(value: unknown, allowedItems: ContainerOrderItem[]) {
  const allowedKeys = new Set(allowedItems.map(orderItemKey));
  const seen = new Set<string>();
  const normalized: ContainerOrderItem[] = [];

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const record = asRecord(item);
      if (!record || typeof record.id !== "string") return;
      if (record.kind !== "block" && record.kind !== "part" && record.kind !== "subpart") return;
      const orderItem = { kind: record.kind, id: record.id } satisfies ContainerOrderItem;
      const key = orderItemKey(orderItem);
      if (!allowedKeys.has(key) || seen.has(key)) return;
      normalized.push(orderItem);
      seen.add(key);
    });
  }

  allowedItems.forEach((item) => {
    const key = orderItemKey(item);
    if (!seen.has(key)) normalized.push(item);
  });

  return normalized;
}

function questionAllowedOrderItems(contentBlocks: EditorContentBlock[], parts: EditorPart[]) {
  return [
    ...contentBlocks.filter((block) => block.kind !== "pageBreak").map((block) => ({ kind: "block" as const, id: block.id })),
    ...parts.map((part) => ({ kind: "part" as const, id: part.id })),
  ];
}

function partAllowedOrderItems(contentBlocks: EditorContentBlock[], subparts: EditorSubpart[]) {
  return [
    ...contentBlocks.filter((block) => block.kind !== "pageBreak").map((block) => ({ kind: "block" as const, id: block.id })),
    ...subparts.map((subpart) => ({ kind: "subpart" as const, id: subpart.id })),
  ];
}

function orderedQuestionItems(question: QuestionBlock): OrderedQuestionItem[] {
  const blockMap = new Map(question.contentBlocks.map((block) => [block.id, block]));
  const partMap = new Map(question.parts.map((part) => [part.id, part]));
  const orderedItems: OrderedQuestionItem[] = [];
  normalizeItemOrder(question.itemOrder, questionAllowedOrderItems(question.contentBlocks, question.parts)).forEach((item) => {
    if (item.kind === "block") {
      const block = blockMap.get(item.id);
      if (block && block.kind !== "pageBreak") orderedItems.push({ kind: "block", id: item.id, block });
      return;
    }
    if (item.kind === "part") {
      const part = partMap.get(item.id);
      if (part) orderedItems.push({ kind: "part", id: item.id, part });
    }
  });
  return orderedItems;
}

function orderedPartItems(part: EditorPart): OrderedPartItem[] {
  const blockMap = new Map(part.contentBlocks.map((block) => [block.id, block]));
  const subpartMap = new Map(part.subparts.map((subpart) => [subpart.id, subpart]));
  const orderedItems: OrderedPartItem[] = [];
  normalizeItemOrder(part.itemOrder, partAllowedOrderItems(part.contentBlocks, part.subparts)).forEach((item) => {
    if (item.kind === "block") {
      const block = blockMap.get(item.id);
      if (block && block.kind !== "pageBreak") orderedItems.push({ kind: "block", id: item.id, block });
      return;
    }
    if (item.kind === "subpart") {
      const subpart = subpartMap.get(item.id);
      if (subpart) orderedItems.push({ kind: "subpart", id: item.id, subpart });
    }
  });
  return orderedItems;
}

function sortedPartsFromItemOrder(parts: EditorPart[], itemOrder: ContainerOrderItem[]) {
  const position = new Map(itemOrder.filter((item) => item.kind === "part").map((item, index) => [item.id, index]));
  return [...parts].sort(
    (left, right) => (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function sortedSubpartsFromItemOrder(subparts: EditorSubpart[], itemOrder: ContainerOrderItem[]) {
  const position = new Map(itemOrder.filter((item) => item.kind === "subpart").map((item, index) => [item.id, index]));
  return [...subparts].sort(
    (left, right) => (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function withNormalizedPartOrder(part: EditorPart) {
  const normalizedOrder = normalizeItemOrder(part.itemOrder, partAllowedOrderItems(part.contentBlocks, part.subparts ?? []));
  const subparts = relabelSubparts(sortedSubpartsFromItemOrder(part.subparts ?? [], normalizedOrder));
  return {
    ...part,
    subparts,
    itemOrder: normalizeItemOrder(normalizedOrder, partAllowedOrderItems(part.contentBlocks, subparts)),
  };
}

function withNormalizedQuestionOrder(question: QuestionBlock) {
  const normalizedOrder = normalizeItemOrder(question.itemOrder, questionAllowedOrderItems(question.contentBlocks, question.parts ?? []));
  const parts = relabelParts(sortedPartsFromItemOrder(question.parts ?? [], normalizedOrder));
  return {
    ...question,
    parts,
    itemOrder: normalizeItemOrder(normalizedOrder, questionAllowedOrderItems(question.contentBlocks, parts)),
  };
}

function createQuestion(): QuestionBlock {
  return {
    id: id("question"),
    section: "Algebra",
    marks: 0,
    contentBlocks: [],
    parts: [],
    itemOrder: [],
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
  if (localStorageItem(STARTER_DOCUMENT_STORAGE_KEY, LEGACY_STARTER_DOCUMENT_STORAGE_KEY)) return false;
  return questions.length === 1 && isBlankStarterQuestion(questions[0]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeMarkValue(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0;
}

function spaceLines(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 3;
}

function defaultSolutionSlotLines(marks: number) {
  const safeMarks = safeMarkValue(marks);
  if (!safeMarks) return DEFAULT_SOLUTION_SLOT_LINES;
  return Math.max(MIN_SOLUTION_SLOT_LINES, Math.min(MAX_SOLUTION_SLOT_LINES, Math.ceil(safeMarks * 3 + 2)));
}

function requestedSolutionSlotLines(defaultLines: number) {
  const requested = window.prompt("Student space lines for this solution slot", String(defaultLines));
  if (requested === null) return null;
  return Math.max(1, Math.floor(spaceLines(requested)));
}

function defaultSavedTestName(frontMatter: FrontMatterConfig) {
  const name = [frontMatter.subjectTitle, frontMatter.assessmentTitle]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" - ");
  return name || "Untitled test";
}

function formatShortDateTime(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function draftBackupStatusSummary(status: DraftAutosaveStatus, message: string) {
  if (status === "saving") return "backing up draft";
  if (status === "saved") return message.replace(/^Autosaved draft/, "draft backed up").replace(/^Autosaved/, "draft backed up");
  if (status === "unavailable") return "browser backup only";
  if (status === "loading") return "loading draft backup";
  if (status === "error") return "draft backup error";
  return message.replace(/^Draft autosave/, "Draft backup") || "draft backup ready";
}

function projectFileSummaryFromApiError(error: ApiError): ProjectFileSummary | null {
  const body = asRecord(error.detail);
  const detail = asRecord(body?.detail) ?? body;
  const current = asRecord(detail?.current);
  if (!current || typeof current.path !== "string" || typeof current.revision !== "number") return null;
  return current as unknown as ProjectFileSummary;
}

function projectFileConflictFromError(error: unknown, filePath: string, localRevision: number | null): ProjectSaveConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const current = projectFileSummaryFromApiError(error);
  return {
    filePath,
    message: "File changed on disk. Reload it before saving, or use Save as to keep this draft as a copy.",
    localRevision,
    currentRevision: current?.revision,
  };
}

function missingProjectRevisionConflict(filePath: string): ProjectSaveConflict {
  return {
    filePath,
    message: "This draft was restored without a file revision. Reload the file before saving, or use Save as to keep it as a copy.",
    localRevision: null,
  };
}

function normalizeContentBlockVisibility(value: unknown): ContentBlockVisibility | undefined {
  return value === "always" || value === "student" || value === "solution" ? value : undefined;
}

function normalizedBlockVisibility(record: Record<string, unknown>, blockId: string): ContentBlockVisibility | undefined {
  const explicitVisibility = normalizeContentBlockVisibility(record.visibility);
  if (explicitVisibility) return explicitVisibility;
  if (record.studentOnly === true) return "student";
  if (record.solutionOnly === true || blockId.startsWith("solution-")) return "solution";
  return undefined;
}

function blockVisibilityFields(visibility?: ContentBlockVisibility) {
  if (!visibility) return {};
  return {
    visibility,
    ...(visibility === "solution" ? { solutionOnly: true } : {}),
    ...(visibility === "student" ? { studentOnly: true } : {}),
  };
}

function normalizeContentBlocks(value: unknown): EditorContentBlock[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((block): EditorContentBlock[] => {
    const record = asRecord(block);
    if (!record) return [];
    const blockId = typeof record.id === "string" ? record.id : id("block");
    const visibility = normalizedBlockVisibility(record, blockId);

    if (record.kind === "text") {
      return [
        {
          id: blockId,
          kind: "text",
          text: typeof record.text === "string" ? record.text : "",
          ...blockVisibilityFields(visibility),
        },
      ];
    }

    if (record.kind === "choices") {
      return [
        {
          id: blockId,
          kind: "choices",
          choices: normalizeChoiceItems(record.choices),
          numberingStyle: normalizeChoiceNumberingStyle(record.numberingStyle),
          layout: normalizeChoiceListLayout(record.layout),
          ...blockVisibilityFields(visibility),
        },
      ];
    }

    if (record.kind === "table") {
      const headers = normalizeTableCells(record.headers);
      const rows = normalizeTableRows(record.rows, Math.max(2, headers.length || 0));
      const columnCount = normalizedTableColumnCount(headers, rows);
      return [
        {
          id: blockId,
          kind: "table",
          headers: paddedTableRow(headers, columnCount),
          rows: rows.map((row) => paddedTableRow(row, columnCount)),
          showHeader: record.showHeader !== false,
          tableAlign: normalizeDiagramAlignment(record.tableAlign),
          cellAlignment: normalizeTableCellAlignment(record.cellAlignment),
          ...blockVisibilityFields(visibility),
        },
      ];
    }

    if (record.kind === "diagram") {
      const graphConfig = asRecord(record.graphConfig) ? (record.graphConfig as GraphConfig) : DEFAULT_2D_GRAPH;
      return [
        {
          id: blockId,
          kind: "diagram",
          diagramAlign: normalizeDiagramAlignment(record.diagramAlign),
          diagramTextSide: normalizeDiagramTextSide(record.diagramTextSide),
          graphConfig: withGraphDefaults(graphConfig),
          ...blockVisibilityFields(visibility),
        },
      ];
    }

    if (record.kind === "space") {
      return [
        {
          id: blockId,
          kind: "space",
          lines: spaceLines(record.lines),
          ...blockVisibilityFields(visibility),
        },
      ];
    }

    if (record.kind === "pageBreak") {
      return [{ id: blockId, kind: "pageBreak" }];
    }

    return [];
  });
}

function normalizeEditorSubparts(value: unknown): EditorSubpart[] {
  if (!Array.isArray(value)) return [];

  return relabelSubparts(
    value.flatMap((subpart): EditorSubpart[] => {
      const record = asRecord(subpart);
      if (!record) return [];
      return [
        {
          id: typeof record.id === "string" ? record.id : id("subpart"),
          label: typeof record.label === "string" ? record.label : "",
          text: typeof record.text === "string" ? record.text : "",
          marks: safeMarkValue(record.marks),
          pageBreakBefore: record.pageBreakBefore === true,
          contentBlocks: normalizeContentBlocks(record.contentBlocks),
        },
      ];
    }),
  );
}

function normalizeEditorParts(value: unknown): EditorPart[] {
  if (!Array.isArray(value)) return [];

  return relabelParts(
    value.flatMap((part): EditorPart[] => {
      const record = asRecord(part);
      if (!record) return [];
      const contentBlocks = normalizeContentBlocks(record.contentBlocks);
      const subparts = normalizeEditorSubparts(record.subparts);
      return [
        withNormalizedPartOrder({
          id: typeof record.id === "string" ? record.id : id("part"),
          label: "",
          text: typeof record.text === "string" ? record.text : "",
          marks: safeMarkValue(record.marks),
          pageBreakBefore: record.pageBreakBefore === true,
          contentBlocks,
          subparts,
          itemOrder: normalizeItemOrder(record.itemOrder, partAllowedOrderItems(contentBlocks, subparts)),
        }),
      ];
    }),
  );
}

function normalizeQuestionBlocks(value: unknown): QuestionBlock[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((question): QuestionBlock[] => {
    const record = asRecord(question);
    if (!record) return [];
    const contentBlocks = normalizeContentBlocks(record.contentBlocks);
    const filteredContentBlocks = contentBlocks.filter((block) => block.kind !== "pageBreak");
    const parts = normalizeEditorParts(record.parts);
    const hasLegacyPageBreak = contentBlocks.some((block) => block.kind === "pageBreak");
    return [
      withNormalizedQuestionOrder({
        id: typeof record.id === "string" ? record.id : id("question"),
        section: typeof record.section === "string" ? record.section : "Algebra",
        marks: safeMarkValue(record.marks),
        contentBlocks: filteredContentBlocks,
        parts,
        itemOrder: normalizeItemOrder(record.itemOrder, questionAllowedOrderItems(filteredContentBlocks, parts)),
        pageBreakAfter: record.pageBreakAfter === true || hasLegacyPageBreak,
      }),
    ];
  });
}

function normalizeEditorSnapshot(value: unknown): AutosavedEditorSnapshot | null {
  const record = asRecord(value);
  if (!record) return null;
  const frontMatter = normalizeFrontMatter(record.frontMatter);
  const questions = normalizeQuestionBlocks(record.questions);
  const formattingConfig = normalizeFormattingConfig(record.formattingConfig);
  if (!frontMatter || !questions.length) return null;

  return {
    frontMatter,
    questions,
    formattingConfig,
    logo: normalizeLogoAsset(record.logo),
    activeProjectFilePath: typeof record.activeProjectFilePath === "string" ? record.activeProjectFilePath : undefined,
    activeProjectFileRevision:
      typeof record.activeProjectFileRevision === "number" && Number.isInteger(record.activeProjectFileRevision)
        ? record.activeProjectFileRevision
        : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

function loadCurrentDraft(): AutosavedEditorSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorageItem(CURRENT_DRAFT_STORAGE_KEY, LEGACY_CURRENT_DRAFT_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as unknown;
    return normalizeEditorSnapshot(parsed);
  } catch {
    return null;
  }
}

let initialEditorDraftCache: AutosavedEditorSnapshot | null | undefined;

function loadInitialEditorDraft() {
  if (initialEditorDraftCache !== undefined) return initialEditorDraftCache;
  initialEditorDraftCache = loadCurrentDraft();
  return initialEditorDraftCache;
}

function persistCurrentDraft(snapshot: AutosavedEditorSnapshot) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      CURRENT_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...snapshot,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Keep editing in memory if localStorage is full, usually due to embedded logos or very large diagrams.
  }
}

function loadLegacySavedTests(): SavedTest[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorageItem(SAVED_TEST_STORAGE_KEY, LEGACY_SAVED_TEST_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return normalizeSavedTests(parsed);
  } catch {
    return [];
  }
}

// Legacy saved tests only exist so older browser/API saves can be migrated into project files.
function normalizeSavedTests(value: unknown): SavedTest[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((test): SavedTest[] => {
    const record = asRecord(test);
    if (!record) return [];
    const frontMatter = normalizeFrontMatter(record.frontMatter);
    if (!frontMatter || typeof record.id !== "string" || typeof record.name !== "string") return [];
    const createdAt = typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString();
    const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : createdAt;

    return [
      {
        id: record.id,
        name: record.name,
        frontMatter,
        questions: normalizeQuestionBlocks(record.questions),
        formattingConfig: normalizeFormattingConfig(record.formattingConfig),
        logo: normalizeLogoAsset(record.logo),
        createdAt,
        updatedAt,
      },
    ];
  });
}

function normalizeSavedTest(value: unknown): SavedTest | null {
  return normalizeSavedTests([value])[0] ?? null;
}

function mergeLegacySavedTests(primary: SavedTest[], fallback: SavedTest[]) {
  const byId = new Map<string, SavedTest>();
  for (const test of fallback) byId.set(test.id, test);
  for (const test of primary) {
    const existing = byId.get(test.id);
    byId.set(test.id, !existing || test.updatedAt >= existing.updatedAt ? test : existing);
  }
  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function newerAutosave(left: AutosavedEditorSnapshot | null, right: AutosavedEditorSnapshot | null) {
  if (!left) return right;
  if (!right) return left;
  const leftBlank = left.questions.length === 1 && isBlankStarterQuestion(left.questions[0]);
  const rightBlank = right.questions.length === 1 && isBlankStarterQuestion(right.questions[0]);
  if (leftBlank && !rightBlank) return right;
  if (rightBlank && !leftBlank) return left;
  return (right.updatedAt ?? "") > (left.updatedAt ?? "") ? right : left;
}

function persistLegacySavedTests(legacyTests: SavedTest[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(SAVED_TEST_STORAGE_KEY, JSON.stringify(legacyTests));
  } catch {
    // Large embedded logo data can exceed browser storage limits; keep the in-memory tests for this session.
  }
}

function savedLogoSnapshot(logo?: LogoAsset | null) {
  return logo
    ? {
        id: logo.id,
        name: logo.name,
        src: logo.src,
        ...(typeof logo.schoolName === "string" ? { schoolName: logo.schoolName } : {}),
      }
    : undefined;
}

function createSavedTestSnapshot({
  testId,
  name,
  frontMatter,
  questions,
  formattingConfig,
  logo,
  createdAt,
}: {
  testId: string;
  name: string;
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  formattingConfig: FormattingConfig;
  logo?: LogoAsset;
  createdAt?: string;
}): SavedTest {
  const now = new Date().toISOString();

  return {
    id: testId,
    name,
    frontMatter: cloneSerializable(frontMatter),
    questions: cloneSerializable(normalizeQuestionBlocks(questions)),
    formattingConfig: cloneSerializable(normalizeFormattingConfig(formattingConfig)),
    logo: savedLogoSnapshot(logo),
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
}

function editorDocumentFingerprint(
  frontMatter: FrontMatterConfig,
  questions: QuestionBlock[],
  formattingConfig: FormattingConfig,
  logo?: LogoAsset | null,
) {
  return JSON.stringify({
    frontMatter: cloneSerializable(frontMatter),
    questions: cloneSerializable(normalizeQuestionBlocks(questions)),
    formattingConfig: cloneSerializable(normalizeFormattingConfig(formattingConfig)),
    logo: savedLogoSnapshot(logo),
  });
}

function markLabel(marks: number) {
  return `(${marks} mark${marks === 1 ? "" : "s"})`;
}

function renderInlineFormatting(text: string): ReactNode[] {
  return text.split(/(\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g).map((segment, index) => {
    const key = `${segment}-${index}`;
    if (segment.startsWith("***") && segment.endsWith("***")) {
      return (
        <strong key={key}>
          <em>{segment.slice(3, -3)}</em>
        </strong>
      );
    }
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return <strong key={key}>{segment.slice(2, -2)}</strong>;
    }
    if (segment.startsWith("*") && segment.endsWith("*")) {
      return <em key={key}>{segment.slice(1, -1)}</em>;
    }
    return <span key={key}>{segment}</span>;
  });
}

function FormattedText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {paragraphs.map((paragraph, index) => (
        <div key={`${paragraph}-${index}`} className="m-0">
          <MixedMath source={paragraph} />
        </div>
      ))}
    </div>
  );
}

function FormattedInlineText({ text }: { text: string }) {
  return <>{renderInlineFormatting(text)}</>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampPreviewZoom(value: number, maxZoom = MAX_PREVIEW_ZOOM) {
  if (!Number.isFinite(value)) return 1;
  return Math.round(clamp(value, MIN_PREVIEW_ZOOM, maxZoom) * 10000) / 10000;
}

function normalizedPreviewWheelDelta(event: globalThis.WheelEvent, pageHeight: number) {
  const primaryDelta = event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY;
  if (event.deltaMode === WHEEL_DELTA_LINE) return primaryDelta * 16;
  if (event.deltaMode === WHEEL_DELTA_PAGE) return primaryDelta * Math.max(pageHeight, 1);
  return primaryDelta;
}

function previewPointFromEvent(event: { clientX?: number; clientY?: number }, fallbackElement: HTMLElement) {
  const rect = fallbackElement.getBoundingClientRect();
  return {
    clientX: typeof event.clientX === "number" ? event.clientX : rect.left + rect.width / 2,
    clientY: typeof event.clientY === "number" ? event.clientY : rect.top + rect.height / 2,
  };
}

function previewPaneContentHeight(previewPane: HTMLElement) {
  const styles = window.getComputedStyle(previewPane);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  return Math.max(0, previewPane.clientHeight - paddingTop - paddingBottom);
}

function previewPaneContentWidth(previewPane: HTMLElement) {
  const styles = window.getComputedStyle(previewPane);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  return Math.max(0, previewPane.clientWidth - paddingLeft - paddingRight);
}

function previewZoomScrollTarget({
  previewPane,
  currentScale,
  nextScale,
  point,
  currentScrollLeft = previewPane.scrollLeft,
  currentScrollTop = previewPane.scrollTop,
}: {
  previewPane: HTMLElement;
  currentScale: number;
  nextScale: number;
  point: { clientX: number; clientY: number };
  currentScrollLeft?: number;
  currentScrollTop?: number;
}) {
  const paneRect = previewPane.getBoundingClientRect();
  const localX = clamp(point.clientX - paneRect.left, 0, paneRect.width);
  const localY = clamp(point.clientY - paneRect.top, 0, paneRect.height);
  const anchorX = currentScale > 0 ? (currentScrollLeft + localX) / currentScale : currentScrollLeft + localX;
  const anchorY = currentScale > 0 ? (currentScrollTop + localY) / currentScale : currentScrollTop + localY;
  return {
    scrollLeft: anchorX * nextScale - localX,
    scrollTop: anchorY * nextScale - localY,
  };
}

function scrollableRange(element: HTMLElement) {
  const maxScroll = element.scrollHeight - element.clientHeight;
  return Math.max(0, maxScroll);
}

function horizontalScrollableRange(element: HTMLElement) {
  const maxScroll = element.scrollWidth - element.clientWidth;
  return Math.max(0, maxScroll);
}

const SCROLL_ANCHOR_FRONT_MATTER = "front-matter";
const SCROLL_ANCHOR_TOP_OFFSET_PX = 12;
const SCROLL_ANCHOR_SELECTOR = "[data-scroll-anchor]";

interface ScrollAnchorPosition {
  anchor: string;
  progress: number;
}

function questionScrollAnchor(questionId: string) {
  return `q:${questionId}`;
}

function pageBreakScrollAnchor(questionId: string) {
  return `pb:${questionId}`;
}

function questionBlockScrollAnchor(questionId: string, blockId: string) {
  return `${questionScrollAnchor(questionId)}/b:${blockId}`;
}

function partScrollAnchor(questionId: string, partId: string) {
  return `${questionScrollAnchor(questionId)}/p:${partId}`;
}

function partBlockScrollAnchor(questionId: string, partId: string, blockId: string) {
  return `${partScrollAnchor(questionId, partId)}/b:${blockId}`;
}

function subpartScrollAnchor(questionId: string, partId: string, subpartId: string) {
  return `${partScrollAnchor(questionId, partId)}/s:${subpartId}`;
}

function subpartBlockScrollAnchor(questionId: string, partId: string, subpartId: string, blockId: string) {
  return `${subpartScrollAnchor(questionId, partId, subpartId)}/b:${blockId}`;
}

function scrollAnchorContains(containerAnchor: string, targetAnchor?: string | null) {
  return Boolean(targetAnchor && (targetAnchor === containerAnchor || targetAnchor.startsWith(`${containerAnchor}/`)));
}

function previewSelectionAttr(anchor: string | undefined, activeAnchor?: string) {
  return anchor && activeAnchor === anchor ? "true" : undefined;
}

function questionIdFromScrollAnchor(anchor: string) {
  const [questionSegment] = anchor.split("/");
  return questionSegment?.startsWith("q:") ? questionSegment.slice(2) : "";
}

function pageBreakQuestionIdFromScrollAnchor(anchor: string) {
  return anchor.startsWith("pb:") ? anchor.slice(3) : "";
}

function scrollAnchorFallbacks(anchor: string) {
  const fallbacks: string[] = [];
  const parts = anchor.split("/");
  while (parts.length) {
    fallbacks.push(parts.join("/"));
    parts.pop();
  }
  return fallbacks;
}

function scrollAnchorValue(element: HTMLElement) {
  return element.getAttribute("data-scroll-anchor");
}

function previewAnchorFromEventTarget(target: EventTarget | null, container: HTMLElement | null) {
  if (!container || !(target instanceof Element)) return "";
  if (target.closest("a, button, input, textarea, select, [contenteditable='true'], [data-preview-click-ignore]")) return "";

  const moduleAnchorElement = target.closest<HTMLElement>("[data-preview-module-anchor='true']");
  if (moduleAnchorElement && container.contains(moduleAnchorElement)) return scrollAnchorValue(moduleAnchorElement) ?? "";

  const anchorElement = target.closest<HTMLElement>("[data-preview-structure-anchor='true']");
  if (!anchorElement || !container.contains(anchorElement)) return "";
  return scrollAnchorValue(anchorElement) ?? "";
}

type ParsedScrollAnchorKind =
  | "frontMatter"
  | "pageBreak"
  | "question"
  | "questionBlock"
  | "part"
  | "partBlock"
  | "subpart"
  | "subpartBlock"
  | "unknown";

interface ParsedScrollAnchor {
  kind: ParsedScrollAnchorKind;
  questionId?: string;
  partId?: string;
  subpartId?: string;
  blockId?: string;
}

function parseScrollAnchor(anchor: string): ParsedScrollAnchor {
  if (anchor === SCROLL_ANCHOR_FRONT_MATTER) return { kind: "frontMatter" };
  if (anchor.startsWith("pb:")) return { kind: "pageBreak", questionId: pageBreakQuestionIdFromScrollAnchor(anchor) };

  const [questionSegment, ...segments] = anchor.split("/");
  if (!questionSegment?.startsWith("q:")) return { kind: "unknown" };

  const parsed: ParsedScrollAnchor = {
    kind: "question",
    questionId: questionSegment.slice(2),
  };

  for (const segment of segments) {
    if (segment.startsWith("p:")) parsed.partId = segment.slice(2);
    if (segment.startsWith("s:")) parsed.subpartId = segment.slice(2);
    if (segment.startsWith("b:")) parsed.blockId = segment.slice(2);
  }

  if (parsed.partId && parsed.subpartId && parsed.blockId) return { ...parsed, kind: "subpartBlock" };
  if (parsed.partId && parsed.subpartId) return { ...parsed, kind: "subpart" };
  if (parsed.partId && parsed.blockId) return { ...parsed, kind: "partBlock" };
  if (parsed.partId) return { ...parsed, kind: "part" };
  if (parsed.blockId) return { ...parsed, kind: "questionBlock" };
  return parsed;
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
    return questions.find((question) => question.id === container.questionId)?.itemOrder ?? [];
  }

  if (container.kind === "part") {
    return findPartInQuestions(questions, container.questionId, container.partId)?.itemOrder ?? [];
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

function dropIntentForContainer(
  active: SubsectionDragTarget,
  container: SubsectionContainerRef,
  questions: QuestionBlock[],
  placement: "start" | "end" = "end",
): SubsectionDropIntent | null {
  if (!canDropIntoContainer(active, container)) return null;
  const beforeItem = placement === "start" ? firstOrderItemInContainer(questions, container, subsectionOrderItem(active)) : undefined;

  if (container.kind === "subpart") {
    return {
      container,
      beforeBlockId: beforeItem?.kind === "block" ? beforeItem.id : undefined,
    };
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
  if (targetContainer.kind === "subpart") {
    return {
      container: targetContainer,
      beforeBlockId: beforeItem?.kind === "block" ? beforeItem.id : undefined,
    };
  }

  return { container: targetContainer, beforeItem };
}

function dragPlacementFromEvent(event: DragEvent<HTMLElement>): Exclude<DropPlacement, "inside"> {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.height <= 0) return "after";
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function panelDragRegionFromEvent(event: DragEvent<HTMLElement>): PanelDragRegion | null {
  if (!(event.target instanceof Element)) return null;
  const region = event.target.closest("[data-panel-region]");
  if (!(region instanceof HTMLElement) || !event.currentTarget.contains(region)) return null;
  return region.dataset.panelRegion === "body" || region.dataset.panelRegion === "header" ? region.dataset.panelRegion : null;
}

function panelInsideDropIntent(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  event: DragEvent<HTMLElement>,
  questions: QuestionBlock[],
): SubsectionDropIntent | null {
  if (panelDragRegionFromEvent(event) !== "body") return null;
  const activeKind = subsectionItemKind(active);
  if (target.kind === "part" && (activeKind === "block" || activeKind === "subpart")) {
    return dropIntentForContainer(active, { kind: "part", questionId: target.questionId, partId: target.id }, questions, "end");
  }
  if (target.kind === "subpart" && activeKind === "block") {
    return dropIntentForContainer(
      active,
      { kind: "subpart", questionId: target.questionId, partId: target.partId, subpartId: target.id },
      questions,
      "end",
    );
  }
  return null;
}

function subsectionDropPreviewForEvent(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  event: DragEvent<HTMLElement>,
  questions: QuestionBlock[],
): Pick<SubsectionDropPreview, "placement" | "intent"> | null {
  const insideIntent = panelInsideDropIntent(active, target, event, questions);
  if (insideIntent) return { placement: "inside", intent: insideIntent };
  const placement = dragPlacementFromEvent(event);
  const intent = subsectionDropIntent(active, target, placement, questions);
  return intent ? { placement, intent } : null;
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

function keyboardMoveDirection(event: KeyboardEvent<HTMLElement>): MoveDirection | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === "ArrowUp") return -1;
  if (event.key === "ArrowDown") return 1;
  return null;
}

function keyboardDeleteRequested(event: KeyboardEvent<HTMLElement>) {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === "Delete" || event.key === "Backspace");
}

function nativeKeyboardDeleteRequested(event: globalThis.KeyboardEvent) {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === "Delete" || event.key === "Backspace");
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

function alphaLabel(index: number) {
  let remaining = index;
  let result = "";
  do {
    result = String.fromCharCode(97 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return result;
}

function romanLabel(index: number) {
  const values = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ] as const;
  let remaining = index + 1;
  let result = "";
  values.forEach(([value, numeral]) => {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  });
  return result;
}

function relabelSubparts(subparts: EditorSubpart[]) {
  return subparts.map((subpart, index) => ({ ...subpart, label: romanLabel(index) }));
}

function relabelParts(parts: EditorPart[]) {
  return parts.map((part, index) => withNormalizedPartOrder({ ...part, label: alphaLabel(index) }));
}

function visibleContentBlocks(blocks: EditorContentBlock[], showSolutions: boolean) {
  return blocks.filter((block) => isContentBlockVisible(block, showSolutions));
}

function firstTextSource(blocks: EditorContentBlock[], showSolutions = true) {
  const visibleBlocks = visibleContentBlocks(blocks, showSolutions);
  const textBlock = visibleBlocks.find((block) => block.kind === "text");
  if (textBlock?.kind === "text") return textBlock.text?.replace(/\s+/g, " ").trim() || "";
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

const SOLUTION_MARK_SYMBOL = "✓";
const SOLUTION_MARK_ANNOTATION_PATTERN = /\s*\[\[marks:(\d+)]]\s*$/i;
type MixedMathSegmentType = "text" | "inline" | "display" | "marked-text" | "marked-display";
type MixedMathSegment = { type: MixedMathSegmentType; content: string; marks?: number };

function extractSolutionMarkAnnotation(source: string) {
  const match = source.match(SOLUTION_MARK_ANNOTATION_PATTERN);
  if (!match) return { source, marks: 0 };
  const marks = Math.max(0, Math.min(6, Math.round(Number(match[1]) || 0)));
  return { source: source.slice(0, match.index).trimEnd(), marks };
}

function isDisplayMathLine(source: string) {
  const trimmed = source.trim();
  return trimmed.startsWith("$$") && trimmed.endsWith("$$");
}

function parseMixedMathLine(source: string) {
  const segments: MixedMathSegment[] = [];
  const regex = /(\$\$[\s\S]+?\$\$(?:\s*\[\[marks:\d+]])?|\$[^$\n]+?\$(?:\s*\[\[marks:\d+]])?)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > cursor) {
      const extracted = extractSolutionMarkAnnotation(source.slice(cursor, match.index));
      if (extracted.source || extracted.marks) segments.push({ type: "text", content: extracted.source, marks: extracted.marks });
    }
    const extractedToken = extractSolutionMarkAnnotation(match[0]);
    const token = extractedToken.source;
    segments.push(
      token.startsWith("$$")
        ? { type: "display", content: token.slice(2, -2).trim(), marks: extractedToken.marks }
        : { type: "inline", content: token.slice(1, -1).trim(), marks: extractedToken.marks },
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    const extracted = extractSolutionMarkAnnotation(source.slice(cursor));
    if (extracted.source || extracted.marks) segments.push({ type: "text", content: extracted.source, marks: extracted.marks });
  }
  return segments;
}

const MIXED_MATH_PARSE_CACHE_LIMIT = 1500;
const mixedMathParseCache = new Map<string, MixedMathSegment[]>();

function getCachedMixedMathSegments(source: string) {
  const cached = mixedMathParseCache.get(source);
  if (!cached) return undefined;

  mixedMathParseCache.delete(source);
  mixedMathParseCache.set(source, cached);
  return cached;
}

function setCachedMixedMathSegments(source: string, segments: MixedMathSegment[]) {
  if (mixedMathParseCache.size >= MIXED_MATH_PARSE_CACHE_LIMIT) {
    const oldestKey = mixedMathParseCache.keys().next().value;
    if (oldestKey) mixedMathParseCache.delete(oldestKey);
  }

  mixedMathParseCache.set(source, segments);
}

function parseMixedMathText(source: string) {
  const segments: MixedMathSegment[] = [];
  const lines = source.split(/(\n)/);

  for (const line of lines) {
    if (line === "\n") {
      segments.push({ type: "text", content: line });
      continue;
    }

    const extractedLine = extractSolutionMarkAnnotation(line);
    if (extractedLine.marks) {
      const content = extractedLine.source;
      if (isDisplayMathLine(content)) {
        const trimmed = content.trim();
        segments.push({ type: "marked-display", content: trimmed.slice(2, -2).trim(), marks: extractedLine.marks });
      } else {
        segments.push({ type: "marked-text", content, marks: extractedLine.marks });
      }
      continue;
    }

    segments.push(...parseMixedMathLine(line));
  }

  return segments;
}

function parseMixedMathUncached(source: string) {
  const segments: MixedMathSegment[] = [];
  const displayRegex = /(\$\$[\s\S]+?\$\$(?:\s*\[\[marks:\d+]])?)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = displayRegex.exec(source)) !== null) {
    if (match.index > cursor) {
      segments.push(...parseMixedMathText(source.slice(cursor, match.index)));
    }

    const extractedToken = extractSolutionMarkAnnotation(match[0]);
    segments.push({
      type: extractedToken.marks ? "marked-display" : "display",
      content: extractedToken.source.slice(2, -2).trim(),
      marks: extractedToken.marks,
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    segments.push(...parseMixedMathText(source.slice(cursor)));
  }

  return segments;
}

function parseMixedMath(source: string) {
  const cached = getCachedMixedMathSegments(source);
  if (cached) return cached;

  const segments = parseMixedMathUncached(source);
  setCachedMixedMathSegments(source, segments);
  return segments;
}

function SolutionMarkTicks({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="solution-mark-ticks" aria-label={`${count} solution ${count === 1 ? "mark" : "marks"}`}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index}>{SOLUTION_MARK_SYMBOL}</span>
      ))}
    </span>
  );
}

function compactSolutionTextSegment(
  content: string,
  previousType?: "text" | "inline" | "display",
  nextType?: "text" | "inline" | "display",
) {
  let compacted = content.replace(/\n{3,}/g, "\n\n");

  if (previousType === "display") compacted = compacted.replace(/^\s*\n+\s*/g, "");
  if (nextType === "display") compacted = compacted.replace(/\s*\n+\s*$/g, "");

  return compacted.replace(/\n{2,}/g, "\n");
}

function mixedMathLayoutType(type?: MixedMathSegmentType): "text" | "inline" | "display" | undefined {
  if (!type) return undefined;
  if (type === "marked-display") return "display";
  if (type === "marked-text") return "text";
  return type;
}

function MixedMath({ source, showSolutionMarks = false }: { source: string; showSolutionMarks?: boolean }) {
  const segments = useMemo(() => parseMixedMath(source), [source]);
  return (
    <div className="mixed-math">
      {segments.map((segment, index) => {
        const previousType = mixedMathLayoutType(segments[index - 1]?.type);
        const nextType = mixedMathLayoutType(segments[index + 1]?.type);
        const marks = showSolutionMarks ? segment.marks : 0;
        if (segment.type === "display" || segment.type === "marked-display") {
          const displayMath = (
            <div className="test-display-math">
              <Latex latex={segment.content} block />
            </div>
          );
          if (marks) {
            return (
              <div key={`${segment.content}-${index}`} className="test-marked-line test-marked-display">
                {displayMath}
                <SolutionMarkTicks count={marks} />
              </div>
            );
          }
          return (
            <div key={`${segment.content}-${index}`} className="test-display-math">
              <Latex latex={segment.content} block />
            </div>
          );
        }
        if (segment.type === "marked-text") {
          const textContent = showSolutionMarks ? compactSolutionTextSegment(segment.content, previousType, nextType) : segment.content;
          if (showSolutionMarks && !textContent.trim()) return null;
          if (marks) {
            return (
              <div key={`${segment.content}-${index}`} className="test-marked-line test-marked-text">
                <span>
                  <InlineMathText source={textContent} />
                </span>
                <SolutionMarkTicks count={marks} />
              </div>
            );
          }
          return <InlineMathText key={`${segment.content}-${index}`} source={textContent} />;
        }
        if (segment.type === "inline") {
          const inlineMath = <Latex latex={segment.content} />;
          if (marks) {
            return (
              <div key={`${segment.content}-${index}`} className="test-marked-line test-marked-text">
                <span>{inlineMath}</span>
                <SolutionMarkTicks count={marks} />
              </div>
            );
          }
          return <span key={`${segment.content}-${index}`}>{inlineMath}</span>;
        }
        const textContent = showSolutionMarks ? compactSolutionTextSegment(segment.content, previousType, nextType) : segment.content;
        if (showSolutionMarks && !textContent.trim()) {
          if (textContent.includes("\n")) return <span key={`${segment.content}-${index}`}>{textContent}</span>;
          return null;
        }
        if (marks) {
          return (
            <div key={`${segment.content}-${index}`} className="test-marked-line test-marked-text">
              <span>
                <FormattedInlineText text={textContent} />
              </span>
              <SolutionMarkTicks count={marks} />
            </div>
          );
        }
        return <FormattedInlineText key={`${segment.content}-${index}`} text={textContent} />;
      })}
    </div>
  );
}

function InlineMathText({ source, className, truncate = false }: { source: string; className?: string; truncate?: boolean }) {
  const segments = useMemo(() => parseMixedMath(source), [source]);
  return (
    <span className={cn(truncate ? "inline-math-truncate" : "inline min-w-0", className)} title={source}>
      {segments.map((segment, index) => {
        if (segment.type === "text" || segment.type === "marked-text") {
          return <FormattedInlineText key={`${segment.content}-${index}`} text={segment.content} />;
        }
        return <Latex key={`${segment.content}-${index}`} latex={segment.content} />;
      })}
    </span>
  );
}

function FrontMatterInlineText({ text, className }: { text: string; className?: string }) {
  return <InlineMathText source={text} className={className} />;
}

function InlineSummaryTitle({ label, summary }: { label: ReactNode; summary?: string }) {
  const trimmedSummary = summary?.trim();

  if (!trimmedSummary) return <>{label}</>;

  return (
    <span className="flex w-full min-w-0 max-w-full items-baseline gap-1">
      <span className="shrink-0">{label}:</span>
      <span className="min-w-0 flex-1 font-normal text-muted-foreground">
        <InlineMathText source={trimmedSummary} truncate />
      </span>
    </span>
  );
}

function contentBlockVisibility(block: EditorContentBlock): ContentBlockVisibility {
  const explicitVisibility = normalizeContentBlockVisibility(block.visibility);
  if (block.solutionOnly === true || (block.solutionOnly !== false && block.id.startsWith("solution-"))) return "solution";
  if (explicitVisibility === "solution") return "solution";
  if (explicitVisibility === "student" || block.studentOnly === true) return "student";
  return "always";
}

function isContentBlockVisible(block: EditorContentBlock, showSolutions: boolean) {
  const visibility = contentBlockVisibility(block);
  if (visibility === "solution") return showSolutions;
  if (visibility === "student") return !showSolutions;
  return true;
}

function isDiagramBesideContentBlock(block: EditorContentBlock | undefined, showSolutions: boolean) {
  return Boolean(block && (block.kind === "text" || block.kind === "space") && isContentBlockVisible(block, showSolutions));
}

function isSolutionTextBlock(block: EditorContentBlock) {
  return block.kind === "text" && contentBlockVisibility(block) === "solution";
}

interface VisibilityReplacementSlotGroup {
  studentBlock: EditorContentBlock;
  solutionBlocks: EditorContentBlock[];
  blocks: EditorContentBlock[];
  endIndex: number;
}

function isStudentReplacementBlock(block: EditorContentBlock) {
  return contentBlockVisibility(block) === "student";
}

function isSolutionReplacementBlock(block: EditorContentBlock) {
  return contentBlockVisibility(block) === "solution";
}

function visibilityReplacementSlotAt(blocks: EditorContentBlock[], startIndex: number): VisibilityReplacementSlotGroup | null {
  const block = blocks[startIndex];
  if (!block || block.kind === "pageBreak") return null;

  if (isStudentReplacementBlock(block)) {
    const solutionBlocks: EditorContentBlock[] = [];
    let cursor = startIndex + 1;
    while (cursor < blocks.length && isSolutionReplacementBlock(blocks[cursor])) {
      solutionBlocks.push(blocks[cursor]);
      cursor += 1;
    }
    if (!solutionBlocks.length) return null;
    return {
      studentBlock: block,
      solutionBlocks,
      blocks: [block, ...solutionBlocks],
      endIndex: cursor - 1,
    };
  }

  if (isSolutionReplacementBlock(block)) {
    const solutionBlocks: EditorContentBlock[] = [];
    let cursor = startIndex;
    while (cursor < blocks.length && isSolutionReplacementBlock(blocks[cursor])) {
      solutionBlocks.push(blocks[cursor]);
      cursor += 1;
    }
    const studentBlock = blocks[cursor];
    if (!studentBlock || !isStudentReplacementBlock(studentBlock)) return null;
    return {
      studentBlock,
      solutionBlocks,
      blocks: [...solutionBlocks, studentBlock],
      endIndex: cursor,
    };
  }

  return null;
}

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
  measureOnly = false,
  showSolutions = true,
  onGraphConfigChange,
}: {
  graphConfig?: GraphConfig | null;
  measureOnly?: boolean;
  showSolutions?: boolean;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
}) {
  const baseConfig = withGraphDefaults(graphConfig);
  const hasHiddenSolutionFeatures = !showSolutions && Boolean(baseConfig.features?.some(isSolutionOnlyGraphFeature));
  const config = graphConfigForSolutionVisibility(baseConfig, showSolutions);
  const visibleGraphConfigChange = hasHiddenSolutionFeatures ? undefined : onGraphConfigChange;

  if (measureOnly) {
    return <div className="w-full overflow-hidden bg-white" style={{ height: graphHeight(config), maxWidth: graphWidth(config) }} />;
  }

  switch (config.type) {
    case "image":
      return <UploadedImageDiagram graphConfig={config} />;
    case "geometricConstruction":
    case "vectorRelationship":
    case "setDiagram":
      return <GeometricConstructionDiagram graphConfig={config} />;
    case "statsChart":
      return <StatsChartDiagram graphConfig={config} />;
    case "vector2d":
      return <Vector2DGraph graphConfig={config} onGraphConfigChange={visibleGraphConfigChange} />;
    case "graph3d":
    case "basic3d":
      return <Basic3DGraph graphConfig={config} onGraphConfigChange={visibleGraphConfigChange} />;
    case "graph2d":
    case "2d_graph":
    case "function":
    default:
      return <FunctionGraph graphConfig={config} onGraphConfigChange={visibleGraphConfigChange} />;
  }
}

const SOLUTION_SLOT_OVERFLOW_MIN_TOLERANCE_LINES = 2;
const SOLUTION_SLOT_OVERFLOW_MAX_TOLERANCE_LINES = 5;
const SOLUTION_SLOT_OVERFLOW_DEFAULT_TOLERANCE_LINES = 3;

function measuredLineHeightPx(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight)) return lineHeight;

  const fontSize = Number.parseFloat(styles.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.55 : 20;
}

function solutionSlotToleranceLines(studentBlock: EditorContentBlock) {
  if (studentBlock.kind !== "space") return SOLUTION_SLOT_OVERFLOW_DEFAULT_TOLERANCE_LINES;

  return Math.min(
    SOLUTION_SLOT_OVERFLOW_MAX_TOLERANCE_LINES,
    Math.max(SOLUTION_SLOT_OVERFLOW_MIN_TOLERANCE_LINES, Math.floor(spaceLines(studentBlock.lines) / 2)),
  );
}

type SolutionValidationSeverity = "error" | "warning";

type SolutionValidationFix =
  | { kind: "add-slot"; lines: number }
  | { kind: "add-solution"; afterBlockId: string }
  | { kind: "add-student-space"; beforeBlockId: string; lines: number }
  | { kind: "increase-space"; blockId: string; lines: number };

interface SolutionValidationIssue {
  id: string;
  severity: SolutionValidationSeverity;
  label: string;
  message: string;
  anchor: string;
  fix?: SolutionValidationFix;
}

interface SolutionValidationResult {
  checkedItems: number;
  errorCount: number;
  warningCount: number;
  issues: SolutionValidationIssue[];
}

function tableHasBlankResponseCells(block: Extract<EditorContentBlock, { kind: "table" }>) {
  const table = normalizeTableBlock(block);
  return plainTableRows(table).some((row) => row.some((cell) => !cell.trim()));
}

function isStudentResponseSurfaceBlock(block: EditorContentBlock) {
  const visibility = contentBlockVisibility(block);
  if (visibility === "solution") return false;
  if (visibility === "student") return true;
  if (block.kind === "choices") return normalizeChoiceItems(block.choices).length > 0;
  if (block.kind === "table") return tableHasBlankResponseCells(block);
  return false;
}

function solutionTextLineEstimate(text: string) {
  const visibleText = text.replace(/\[\[marks:\s*\d+\s*\]\]/gi, "");
  const lines = visibleText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const displayMathCount = (visibleText.match(/\$\$[\s\S]*?\$\$/g) ?? []).length;
  const alignedBreakCount = (visibleText.match(/\\\\/g) ?? []).length;
  return Math.max(1, lines.length + displayMathCount + alignedBreakCount);
}

function solutionBlockLineEstimate(block: EditorContentBlock) {
  if (block.kind === "text") return solutionTextLineEstimate(block.text ?? "");
  if (block.kind === "diagram") return Math.max(4, Math.ceil(graphHeight(withGraphDefaults(block.graphConfig)) / 26));
  if (block.kind === "table") return Math.max(2, plainTableRows(normalizeTableBlock(block)).length + 1);
  if (block.kind === "choices") return Math.max(1, normalizeChoiceItems(block.choices).length);
  if (block.kind === "space") return spaceLines(block.lines);
  return 1;
}

function replacementSlotLineCapacity(studentBlock: EditorContentBlock) {
  if (studentBlock.kind === "space") return spaceLines(studentBlock.lines);
  if (studentBlock.kind === "table") return Math.max(2, plainTableRows(normalizeTableBlock(studentBlock)).length + 1);
  if (studentBlock.kind === "choices") return Math.max(1, normalizeChoiceItems(studentBlock.choices).length);
  return 0;
}

function solutionValidationFixLabel(fix?: SolutionValidationFix) {
  if (!fix) return "";
  if (fix.kind === "add-slot") return "Add solution slot";
  if (fix.kind === "add-solution") return "Add solution";
  if (fix.kind === "add-student-space") return "Add answer space";
  if (fix.kind === "increase-space") return `Set space to ${fix.lines} lines`;
  return "";
}

function collectReplacementSlotAnalysis(blocks: EditorContentBlock[]) {
  const slots: VisibilityReplacementSlotGroup[] = [];
  const pairedBlockIds = new Set<string>();
  for (let index = 0; index < blocks.length; index += 1) {
    const slot = visibilityReplacementSlotAt(blocks, index);
    if (!slot) continue;
    slots.push(slot);
    slot.blocks.forEach((block) => pairedBlockIds.add(block.id));
    index = slot.endIndex;
  }

  const studentBlocks = blocks.filter((block) => isStudentReplacementBlock(block));
  const solutionBlocks = blocks.filter((block) => isSolutionReplacementBlock(block));
  return {
    slots,
    studentBlocks,
    solutionBlocks,
    unpairedStudentBlocks: studentBlocks.filter((block) => !pairedBlockIds.has(block.id)),
    unpairedSolutionBlocks: solutionBlocks.filter((block) => !pairedBlockIds.has(block.id)),
  };
}

function orderedBlocksFromQuestion(question: QuestionBlock) {
  return orderedQuestionItems(question)
    .filter((item): item is Extract<OrderedQuestionItem, { kind: "block" }> => item.kind === "block")
    .map((item) => item.block)
    .filter((block) => block.kind !== "pageBreak");
}

function orderedBlocksFromPart(part: EditorPart) {
  return orderedPartItems(part)
    .filter((item): item is Extract<OrderedPartItem, { kind: "block" }> => item.kind === "block")
    .map((item) => item.block)
    .filter((block) => block.kind !== "pageBreak");
}

function orderedBlocksFromSubpart(subpart: EditorSubpart) {
  return subpart.contentBlocks.filter((block) => block.kind !== "pageBreak");
}

function validateMarkedSolutionContainer({
  issues,
  label,
  marks,
  blocks,
  anchor,
}: {
  issues: SolutionValidationIssue[];
  label: string;
  marks: number;
  blocks: EditorContentBlock[];
  anchor: string;
}) {
  if (marks <= 0) return 0;

  const analysis = collectReplacementSlotAnalysis(blocks);
  const hasResponseSurface = blocks.some(isStudentResponseSurfaceBlock);
  const hasSolutionContent = analysis.solutionBlocks.length > 0;
  const issuePrefix = `${label}:${marks}`;
  const defaultLines = defaultSolutionSlotLines(marks);
  const firstStudentBlock = analysis.studentBlocks[0];
  const firstUnpairedStudentBlock = analysis.unpairedStudentBlocks[0];
  const firstUnpairedSolutionBlock = analysis.unpairedSolutionBlocks[0];

  if (!hasResponseSurface) {
    issues.push({
      id: `${issuePrefix}:missing-response`,
      severity: "error",
      label,
      message: `${marks} mark${marks === 1 ? "" : "s"} but no student response surface was found.`,
      anchor,
      fix: firstUnpairedSolutionBlock
        ? { kind: "add-student-space", beforeBlockId: firstUnpairedSolutionBlock.id, lines: defaultLines }
        : { kind: "add-slot", lines: defaultLines },
    });
  }

  if (!hasSolutionContent) {
    issues.push({
      id: `${issuePrefix}:missing-solution`,
      severity: "error",
      label,
      message: "No solution module was found for this marked item.",
      anchor,
      fix: firstStudentBlock ? { kind: "add-solution", afterBlockId: firstStudentBlock.id } : { kind: "add-slot", lines: defaultLines },
    });
  } else if (!analysis.slots.length) {
    issues.push({
      id: `${issuePrefix}:unpaired-solution`,
      severity: "warning",
      label,
      message: "A solution module exists, but it is not paired with a student answer space/table.",
      anchor,
      fix: firstUnpairedSolutionBlock
        ? { kind: "add-student-space", beforeBlockId: firstUnpairedSolutionBlock.id, lines: defaultLines }
        : undefined,
    });
  }

  if (analysis.unpairedStudentBlocks.length && hasSolutionContent) {
    issues.push({
      id: `${issuePrefix}:unpaired-student`,
      severity: "warning",
      label,
      message: "A student-only response block is not adjacent to a solution module.",
      anchor,
      fix: firstUnpairedStudentBlock ? { kind: "add-solution", afterBlockId: firstUnpairedStudentBlock.id } : undefined,
    });
  }

  if (analysis.unpairedSolutionBlocks.length && analysis.slots.length) {
    issues.push({
      id: `${issuePrefix}:floating-solution`,
      severity: "warning",
      label,
      message: "One or more solution modules are outside the matched replacement slot.",
      anchor,
    });
  }

  for (const [slotIndex, slot] of analysis.slots.entries()) {
    const capacity = replacementSlotLineCapacity(slot.studentBlock);
    if (!capacity) continue;
    const estimate = slot.solutionBlocks.reduce((sum, block) => sum + solutionBlockLineEstimate(block), 0);
    const tolerance = solutionSlotToleranceLines(slot.studentBlock);
    if (estimate > capacity + tolerance) {
      const overflowLines = Math.max(1, Math.ceil(estimate - capacity));
      issues.push({
        id: `${issuePrefix}:fit-${slotIndex}`,
        severity: "warning",
        label,
        message: `The paired solution may need about ${overflowLines} more line${overflowLines === 1 ? "" : "s"} than the reserved student space.`,
        anchor,
        fix:
          slot.studentBlock.kind === "space"
            ? { kind: "increase-space", blockId: slot.studentBlock.id, lines: Math.ceil(capacity + overflowLines) }
            : undefined,
      });
    }
  }

  return 1;
}

function validateSolutionCompleteness(frontMatter: FrontMatterConfig, questions: QuestionBlock[]): SolutionValidationResult {
  const issues: SolutionValidationIssue[] = [];
  let checkedItems = 0;

  questions.forEach((question, questionIndex) => {
    const questionLabel = `Question ${questionDisplayNumber(frontMatter, questionIndex)}`;
    if (!question.parts.length) {
      checkedItems += validateMarkedSolutionContainer({
        issues,
        label: questionLabel,
        marks: Math.max(0, Number(question.marks) || 0),
        blocks: orderedBlocksFromQuestion(question),
        anchor: questionScrollAnchor(question.id),
      });
      return;
    }

    question.parts.forEach((part, partIndex) => {
      const partLabel = `${questionLabel}(${alphaLabel(partIndex)})`;
      if (!part.subparts?.length) {
        checkedItems += validateMarkedSolutionContainer({
          issues,
          label: partLabel,
          marks: Math.max(0, Number(part.marks) || 0),
          blocks: orderedBlocksFromPart(part),
          anchor: partScrollAnchor(question.id, part.id),
        });
        return;
      }

      part.subparts.forEach((subpart, subpartIndex) => {
        checkedItems += validateMarkedSolutionContainer({
          issues,
          label: `${partLabel}(${romanLabel(subpartIndex)})`,
          marks: Math.max(0, Number(subpart.marks) || 0),
          blocks: orderedBlocksFromSubpart(subpart),
          anchor: subpartScrollAnchor(question.id, part.id, subpart.id),
        });
      });
    });
  });

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return { checkedItems, errorCount, warningCount, issues };
}

function solutionValidationSummary(result: SolutionValidationResult) {
  if (!result.checkedItems) return "No marked items to validate";
  if (!result.issues.length) {
    return `${result.checkedItems} marked item${result.checkedItems === 1 ? "" : "s"} checked · all have student space and solutions`;
  }
  const parts = [];
  if (result.errorCount) parts.push(`${result.errorCount} error${result.errorCount === 1 ? "" : "s"}`);
  if (result.warningCount) parts.push(`${result.warningCount} warning${result.warningCount === 1 ? "" : "s"}`);
  return `${result.checkedItems} marked item${result.checkedItems === 1 ? "" : "s"} checked · ${parts.join(", ")}`;
}

type AppPreviewContentBlocksProps = Omit<PreviewContentBlocksBaseProps, "runtime" | "renderers">;

const previewContentRuntime: PreviewContentRuntime = {
  choiceLabel,
  diagramAlignmentClass,
  effectiveDiagramTextSide,
  graphHeight,
  isContentBlockVisible,
  isDiagramBesideContentBlock,
  isSolutionTextBlock,
  measuredLineHeightPx,
  normalizeChoiceItems,
  normalizeChoiceListLayout,
  normalizeTableBlock,
  plainTableRows: (table) => plainTableRows(table as ReturnType<typeof normalizeTableBlock>),
  previewSelectionAttr,
  solutionSlotToleranceLines,
  spaceLines,
  visibilityReplacementSlotAt,
};

const previewContentRenderers: PreviewContentRenderers = {
  renderDiagram: (props) => <DiagramPreview {...props} />,
  renderMath: (source, options) => <MixedMath source={source} showSolutionMarks={Boolean(options?.showSolutionMarks)} />,
};

function PreviewContentBlocks(props: AppPreviewContentBlocksProps) {
  return <PreviewContentBlocksBase {...props} runtime={previewContentRuntime} renderers={previewContentRenderers} />;
}

function contentBlocksHaveDiagram(blocks: EditorContentBlock[], showSolutions = true) {
  return blocks.some((block) => block.kind === "diagram" && isContentBlockVisible(block, showSolutions));
}

interface PreviewSegment {
  id: string;
  kind: "question-start" | "question-block" | "part-group" | "page-break";
  questionIndex: number;
  spacingTop: number;
  question: QuestionBlock;
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
  question: QuestionBlock;
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

function applyPreviewScaleStyle(previewRoot: HTMLElement, pageFormat: PageFormat, scale = 1) {
  previewRoot.style.setProperty("--a4-preview-scale", String(scale));
  previewRoot.style.setProperty("--a4-preview-page-width", `${pageFormat.widthPx * scale}px`);
  previewRoot.style.setProperty("--a4-preview-page-height", `${pageFormat.heightPx * scale}px`);
  previewRoot.style.setProperty("--a4-preview-page-gap", `${16 * scale}px`);
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
    const previousGroup = groups.at(-1);
    if (previousGroup?.question.id === entry.segment.question.id) {
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

function buildPreviewSegments(questions: QuestionBlock[], showSolutions: boolean): PreviewSegment[] {
  return questions.flatMap((question, questionIndex) => {
    const segments: PreviewSegment[] = [
      {
        id: `${question.id}:start`,
        kind: "question-start",
        questionIndex,
        spacingTop: questionIndex === 0 ? 0 : QUESTION_GAP_PX,
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
          isContentBlockVisible(item.block, showSolutions) &&
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
        if (!isContentBlockVisible(item.block, showSolutions)) continue;
        const pairedBlocks =
          item.block.kind === "diagram" &&
          nextItem?.kind === "block" &&
          isDiagramBesideContentBlock(nextItem.block, showSolutions) &&
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

    return segments;
  });
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
      isContentBlockVisible(item.block, showSolutions) &&
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
      isContentBlockVisible(item.block, showSolutions) &&
      nextItem?.kind === "block" &&
      isDiagramBesideContentBlock(nextItem.block, showSolutions) &&
      effectiveDiagramTextSide(item.block, true) !== "none"
    ) {
      rowIds.push(item.id);
      index += 1;
      continue;
    }
    if (isContentBlockVisible(item.block, showSolutions)) rowIds.push(item.id);
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

function SchoolExamCutOffNotice({ text, side = "right" }: { text: string; side?: "left" | "right" }) {
  if (!text.trim()) return null;
  return (
    <aside className={cn("school-exam-cut-off-notice", side === "left" && "school-exam-cut-off-notice-left")}>
      <FrontMatterInlineText text={text} />
    </aside>
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
          <div className="school-exam-student-number-figures">
            <span>
              <FrontMatterInlineText text={exam.studentNumberLabel} />
            </span>
            <span>
              <FrontMatterInlineText text={exam.studentNumberFiguresLabel} />
            </span>
            <div className="exam-student-number-boxes" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="school-exam-student-number-words">
            <span>
              <FrontMatterInlineText text={exam.studentNumberWordsLabel} />
            </span>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </div>
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
      <SchoolExamCutOffNotice text={exam.cutOffNotice} />
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
          <SchoolExamCutOffNotice text={exam.cutOffNotice} side="left" />
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
  firstOnPage = false,
  measureOnly = false,
  showSolutions = true,
  showMarks = true,
  activePreviewAnchor,
  onGraphConfigChange,
}: {
  segment: PreviewSegment;
  frontMatter: FrontMatterConfig;
  firstOnPage?: boolean;
  measureOnly?: boolean;
  showSolutions?: boolean;
  showMarks?: boolean;
  activePreviewAnchor?: string;
  onGraphConfigChange?: (change: PreviewGraphConfigChange) => void;
}) {
  const questionNumber = questionDisplayNumber(frontMatter, segment.questionIndex);
  const paddingTop = firstOnPage ? 0 : segment.spacingTop;

  if (segment.kind === "question-start") {
    return (
      <div
        className="test-preview-segment test-question-start"
        data-scroll-anchor={measureOnly ? undefined : questionScrollAnchor(segment.question.id)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        <div className="test-question-header flex items-start justify-between gap-4">
          <h3 className="font-bold">Question {questionNumber}</h3>
          <span className="whitespace-nowrap font-bold">{showMarks ? markLabel(questionMarks(segment.question)) : ""}</span>
        </div>
      </div>
    );
  }

  if (segment.kind === "question-block" && segment.block) {
    return (
      <div
        className="test-preview-segment test-question-block"
        data-scroll-anchor={measureOnly ? undefined : questionBlockScrollAnchor(segment.question.id, segment.block.id)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        <PreviewContentBlocks
          blocks={segment.blocks ?? (segment.block ? [segment.block] : [])}
          measureOnly={measureOnly}
          showSolutions={showSolutions}
          activePreviewAnchor={activePreviewAnchor}
          blockAnchorFor={(block) => questionBlockScrollAnchor(segment.question.id, block.id)}
          onGraphConfigChange={(blockId, graphConfig) => onGraphConfigChange?.({ questionId: segment.question.id, blockId, graphConfig })}
        />
      </div>
    );
  }

  if (segment.kind === "page-break") {
    return <div className="test-preview-segment" data-measure-segment={measureOnly ? "true" : undefined} />;
  }

  if (segment.kind === "part-group" && segment.part) {
    const part = segment.part;
    const hasSubparts = part.subparts.length > 0;
    const partLabel = alphaLabel(segment.partIndex ?? 0);
    const partItems = segment.partItems ?? orderedPartItems(part);
    const visiblePartBlockRowIds = previewPartBlockRowIds(partItems, showSolutions);
    const firstContentItemId = visiblePartBlockRowIds[0];
    const showPartLabel = segment.showPartLabel !== false;
    return (
      <section
        className="test-preview-segment test-part-group"
        data-scroll-anchor={measureOnly ? undefined : partScrollAnchor(segment.question.id, part.id)}
        data-preview-structure-anchor={measureOnly ? undefined : "true"}
        data-preview-selected={previewSelectionAttr(
          measureOnly ? undefined : partScrollAnchor(segment.question.id, part.id),
          activePreviewAnchor,
        )}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        {showPartLabel && hasSubparts && !visiblePartBlockRowIds.length ? (
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
                  isContentBlockVisible(item.block, showSolutions) &&
                  replacementSlotFollows &&
                  effectiveDiagramTextSide(item.block, true) !== "none"
                    ? [item.block, ...replacementSlotFollows.blocks]
                    : undefined;
                const replacementSlot = visibilityReplacementSlotAtOrderedItems(partItems, itemIndex);
                const replacementBlocks = replacementSlot?.blocks;
                if (!diagramReplacementBlocks && !replacementBlocks && !isContentBlockVisible(item.block, showSolutions)) continue;
                const pairedBlocks =
                  item.block.kind === "diagram" &&
                  nextItem?.kind === "block" &&
                  isDiagramBesideContentBlock(nextItem.block, showSolutions) &&
                  effectiveDiagramTextSide(item.block, true) !== "none"
                    ? [item.block, nextItem.block]
                    : undefined;
                const rowBlocks = diagramReplacementBlocks ?? replacementBlocks ?? pairedBlocks ?? [item.block];
                rows.push(
                  <div
                    key={rowBlocks.length > 1 ? `${item.id}:${rowBlocks[1].id}` : item.id}
                    data-scroll-anchor={measureOnly ? undefined : partBlockScrollAnchor(segment.question.id, part.id, item.block.id)}
                    className={cn(
                      "test-question-part",
                      item.block.kind === "diagram" && "test-question-row-with-diagram",
                      item.block.kind === "text" && isSolutionTextBlock(item.block) && "test-solution-row",
                    )}
                  >
                    <span className="test-part-label">{showPartLabel && item.id === firstContentItemId ? `(${partLabel})` : ""}</span>
                    <div className="test-part-content">
                      <PreviewContentBlocks
                        blocks={rowBlocks}
                        measureOnly={measureOnly}
                        showSolutions={showSolutions}
                        activePreviewAnchor={activePreviewAnchor}
                        blockAnchorFor={(block) => partBlockScrollAnchor(segment.question.id, part.id, block.id)}
                        onGraphConfigChange={(blockId, graphConfig) =>
                          onGraphConfigChange?.({ questionId: segment.question.id, partId: part.id, blockId, graphConfig })
                        }
                      />
                    </div>
                    <span className="test-part-mark">
                      {showMarks && !hasSubparts && item.id === firstContentItemId ? markLabel(part.marks) : ""}
                    </span>
                  </div>,
                );
                if (diagramReplacementBlocks && replacementSlotFollows) itemIndex = replacementSlotFollows.endItemIndex;
                else if (replacementBlocks && replacementSlot) itemIndex = replacementSlot.endItemIndex;
                else if (pairedBlocks) itemIndex += 1;
                continue;
              }

              const subpartIndex = part.subparts.findIndex((subpart) => subpart.id === item.subpart.id);
              rows.push(
                <div
                  key={item.subpart.id}
                  data-scroll-anchor={measureOnly ? undefined : subpartScrollAnchor(segment.question.id, part.id, item.subpart.id)}
                  data-preview-structure-anchor={measureOnly ? undefined : "true"}
                  data-preview-selected={previewSelectionAttr(
                    measureOnly ? undefined : subpartScrollAnchor(segment.question.id, part.id, item.subpart.id),
                    activePreviewAnchor,
                  )}
                  className={cn(
                    "test-question-subpart",
                    contentBlocksHaveDiagram(item.subpart.contentBlocks, showSolutions) && "test-question-row-with-diagram",
                  )}
                >
                  <span className="test-part-label">({romanLabel(Math.max(0, subpartIndex))})</span>
                  <div className="test-part-content">
                    <PreviewContentBlocks
                      blocks={item.subpart.contentBlocks}
                      measureOnly={measureOnly}
                      showSolutions={showSolutions}
                      activePreviewAnchor={activePreviewAnchor}
                      blockAnchorFor={(block) => subpartBlockScrollAnchor(segment.question.id, part.id, item.subpart.id, block.id)}
                      onGraphConfigChange={(blockId, graphConfig) =>
                        onGraphConfigChange?.({
                          questionId: segment.question.id,
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
  formattingConfig,
  scale = 1,
  showSolutions = true,
  activePreviewAnchor,
  onGraphConfigChange,
}: PaginatedTestPreviewProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const pageFormat = useMemo(() => pageFormatFromConfig(formattingConfig), [formattingConfig]);
  const showMarks = formattingConfig?.showMarks ?? DEFAULT_FORMATTING_CONFIG.showMarks ?? true;
  const previewStyle = useMemo(() => pageStyle(pageFormat, scale), [pageFormat, scale]);
  const segments = useMemo(() => buildPreviewSegments(questions, showSolutions), [questions, showSolutions]);
  const fallbackPages = useMemo<PreviewPage[]>(() => [{ segmentIndexes: segments.map((_, index) => index), overflow: false }], [segments]);
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
  }, [pageFormat, reservedPageHeight, segments, showMarks]);

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

  return (
    <div className="a4-preview-root" style={previewStyle}>
      <div className="a4-preview-shell">
        <div className="a4-preview-stack">
          <FrontMatterPreviewPages
            frontMatter={frontMatter}
            logo={frontMatterLogo}
            totalMarks={totalMarks}
            questionCount={questions.length}
            activePreviewAnchor={activePreviewAnchor}
            showPageBreaks={pageFormat.showPageBreaks}
          />
          {pageFormat.showPageBreaks ? (
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
                        {groups.map((group) => (
                          <div
                            key={group.id}
                            className="test-preview-question-group"
                            data-scroll-anchor={questionScrollAnchor(group.question.id)}
                            data-preview-structure-anchor="true"
                            data-preview-selected={previewSelectionAttr(questionScrollAnchor(group.question.id), activePreviewAnchor)}
                          >
                            {group.entries.map(({ segment, segmentPageIndex }) => (
                              <TestPreviewSegment
                                key={segment.id}
                                segment={segment}
                                frontMatter={frontMatter}
                                firstOnPage={segmentPageIndex === 0}
                                showSolutions={showSolutions}
                                showMarks={showMarks}
                                activePreviewAnchor={activePreviewAnchor}
                                onGraphConfigChange={onGraphConfigChange}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                      {page.overflow ? (
                        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                          A single block in this question is taller than the available A4 page space.
                        </div>
                      ) : null}
                      {isExamTemplate ? <SchoolExamCutOffNotice text={exam.cutOffNotice} /> : null}
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
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  onChange: (graphConfig: GraphConfig) => void;
  onAlignmentChange: (alignment: DiagramAlignment) => void;
  onRemove: () => void;
}

function storageStatusTone(status: HeaderSaveStatus) {
  if (status === "saved" || status === "ready") return "bg-emerald-400";
  if (status === "draft") return "bg-amber-300";
  if (status === "saving" || status === "loading") return "bg-amber-300";
  if (status === "dirty") return "bg-orange-300";
  return "bg-red-400";
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

function HeaderFileControls({
  currentFileName,
  fileStatusMessage,
  fileStatusTitle,
  saveStatus,
  onNewTest,
  onSaveTest,
  onOpenFiles,
}: {
  currentFileName: string;
  fileStatusMessage: string;
  fileStatusTitle: string;
  saveStatus: HeaderSaveStatus;
  onNewTest: () => void;
  onSaveTest: () => void;
  onOpenFiles: () => void;
}) {
  return (
    <div className="flex w-auto max-w-full shrink-0 items-center gap-2 rounded-md border border-blue-300/20 bg-white/[0.05] p-1">
      <span className={cn("ml-1 size-2 shrink-0 rounded-full", storageStatusTone(saveStatus))} title={fileStatusTitle} aria-hidden="true" />
      <div
        className="flex h-8 w-[clamp(12rem,30vw,30rem)] flex-col justify-center rounded-md border border-blue-300/20 bg-[#050b1d] px-2"
        title={fileStatusTitle}
      >
        <span className="truncate text-sm font-medium leading-tight text-blue-50">{currentFileName}</span>
        <span className="truncate text-[10px] leading-tight text-blue-100/70">{fileStatusMessage}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="New test"
        aria-label="New test"
        onClick={onNewTest}
        className={cn(HEADER_ICON_BUTTON_CLASS, "shrink-0")}
      >
        <PlusCircle />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Save current test"
        aria-label="Save current test"
        onClick={onSaveTest}
        className={cn(HEADER_ICON_BUTTON_CLASS, "shrink-0")}
      >
        <Save />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title="Open files"
        aria-label="Open files"
        onClick={onOpenFiles}
        className="h-8 shrink-0 border border-blue-300/15 px-2 text-blue-100 hover:bg-blue-500/15 hover:text-white"
      >
        <FolderOpen className="size-4" aria-hidden="true" />
        Files
      </Button>
    </div>
  );
}

function SolutionValidationPanel({
  result,
  onClose,
  onJump,
  onFix,
}: {
  result: SolutionValidationResult;
  onClose: () => void;
  onJump: (anchor: string) => void;
  onFix: (issue: SolutionValidationIssue) => void;
}) {
  const summary = solutionValidationSummary(result);
  return (
    <aside className="fixed right-4 top-20 z-50 w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-background shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Solution validation</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" title="Close" aria-label="Close solution validation" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-3">
        {!result.checkedItems ? (
          <p className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            No marked questions, parts, or subparts were found.
          </p>
        ) : !result.issues.length ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            All marked items have a student response surface and a solution.
          </div>
        ) : (
          <div className="space-y-2">
            {result.issues.map((issue) => {
              const fixLabel = solutionValidationFixLabel(issue.fix);
              return (
                <div
                  key={issue.id}
                  className={cn(
                    "w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent",
                    issue.severity === "error" ? "border-red-300 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950",
                  )}
                >
                  <span className="mb-1 flex items-center justify-between gap-2">
                    <button type="button" className="min-w-0 text-left font-semibold hover:underline" onClick={() => onJump(issue.anchor)}>
                      {issue.label}
                    </button>
                    <Badge
                      variant="secondary"
                      className={cn(issue.severity === "error" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900")}
                    >
                      {issue.severity}
                    </Badge>
                  </span>
                  <span className="block text-xs leading-relaxed">{issue.message}</span>
                  <span className="mt-2 flex flex-wrap gap-2">
                    {fixLabel ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 bg-background/80 px-2 text-xs"
                        onClick={() => onFix(issue)}
                      >
                        {fixLabel}
                      </Button>
                    ) : null}
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onJump(issue.anchor)}>
                      Jump
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function strippedJsonProposalSource(source: string) {
  const trimmed = source.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function actionFromUnknown(value: unknown): MauthDocumentAction | null {
  const record = asRecord(value);
  if (!record || typeof record.type !== "string") return null;
  return record as MauthDocumentAction;
}

function parseMauthDocumentActionProposal(source: string): MauthDocumentAction[] {
  const proposalSource = strippedJsonProposalSource(source);
  if (!proposalSource) throw new Error("Paste a JSON action, an action array, or an object with an actions array.");

  const parsed = JSON.parse(proposalSource) as unknown;
  const proposalRecord = asRecord(parsed);
  const rawActions = Array.isArray(parsed)
    ? parsed
    : Array.isArray(proposalRecord?.actions)
      ? proposalRecord.actions
      : proposalRecord?.action
        ? [proposalRecord.action]
        : [parsed];

  const actions = rawActions.flatMap((action) => {
    const parsedAction = actionFromUnknown(action);
    return parsedAction ? [parsedAction] : [];
  });
  if (actions.length !== rawActions.length) throw new Error("Every proposed action must be an object with a string type.");
  if (!actions.length) throw new Error("No actions found in that proposal.");
  return actions;
}

function shortActionPreviewList(values: readonly string[], limit = 8) {
  if (!values.length) return "";
  const visible = values.slice(0, limit);
  const remaining = values.length - visible.length;
  return remaining > 0 ? `${visible.join(", ")} + ${remaining} more` : visible.join(", ");
}

function actionPreviewSummaryLines(preview: MauthActionPreviewSummary) {
  const lines: string[] = [];
  const actionCounts = Object.entries(preview.actionCounts)
    .filter((entry): entry is [string, number] => Number(entry[1]) > 0)
    .map(([type, count]) => `${type} x${count}`);

  if (actionCounts.length) lines.push(`Actions: ${actionCounts.join(", ")}`);
  if (preview.changedIds.length) lines.push(`Changed: ${shortActionPreviewList(preview.changedIds)}`);
  if (preview.addedIds.length) lines.push(`Added: ${shortActionPreviewList(preview.addedIds)}`);
  if (preview.deletedIds.length) lines.push(`Deleted: ${shortActionPreviewList(preview.deletedIds)}`);
  if (preview.movedIds.length) lines.push(`Moved: ${shortActionPreviewList(preview.movedIds)}`);
  if (preview.reorderedIds.length) lines.push(`Reordered: ${shortActionPreviewList(preview.reorderedIds)}`);
  if (preview.updatedIds.length) lines.push(`Updated: ${shortActionPreviewList(preview.updatedIds)}`);
  if (preview.frontMatterFields.length) lines.push(`Front matter: ${shortActionPreviewList(preview.frontMatterFields)}`);
  if (preview.formattingFields.length) lines.push(`Formatting: ${shortActionPreviewList(preview.formattingFields)}`);
  if (preview.pageFormatFields.length) lines.push(`Page format: ${shortActionPreviewList(preview.pageFormatFields)}`);
  return lines;
}

function ActionProposalPanel({
  value,
  message,
  result,
  onChange,
  onPreview,
  onApply,
  onClose,
  onClear,
}: {
  value: string;
  message: string;
  result: MauthDocumentActionResult<QuestionBlock, FrontMatterConfig, FormattingConfig> | null;
  onChange: (value: string) => void;
  onPreview: () => void;
  onApply: () => void;
  onClose: () => void;
  onClear: () => void;
}) {
  const preview = result?.preview;
  const summaryLines = preview ? actionPreviewSummaryLines(preview) : [];
  const canSubmit = Boolean(value.trim());
  const validPreview = Boolean(result?.ok && preview?.valid);

  return (
    <aside className="fixed right-4 top-20 z-50 w-[min(34rem,calc(100vw-2rem))] rounded-xl border bg-background shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Action proposal</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Paste Mauth document action JSON, preview it, then apply it.</p>
        </div>
        <Button type="button" variant="ghost" size="icon" title="Close" aria-label="Close action proposal" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="max-h-[72vh] space-y-3 overflow-y-auto p-3">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={12}
          spellCheck={false}
          className="min-h-56 font-mono text-xs"
          placeholder='{"actions":[{"type":"module.update","scope":{"kind":"question","questionId":"..."},"blockId":"...","patch":{"text":"..."}}]}'
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={onPreview} disabled={!canSubmit}>
            Preview
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onApply} disabled={!canSubmit}>
            Apply
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={!value && !result && !message}>
            Clear
          </Button>
        </div>
        {message ? (
          <p className={cn("rounded-md border p-2 text-xs", validPreview ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "")}>
            {message}
          </p>
        ) : null}
        {preview ? (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className={cn(validPreview ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900")}>
                {validPreview ? "Dry run valid" : "Needs attention"}
              </Badge>
              <span className="text-muted-foreground">
                {preview.attemptedActionCount} of {preview.requestedActionCount} action
                {preview.requestedActionCount === 1 ? "" : "s"} checked
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Added</span>
                <span className="font-semibold">{preview.counts.added}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Updated</span>
                <span className="font-semibold">{preview.counts.updated}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Moved</span>
                <span className="font-semibold">{preview.counts.moved}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Deleted</span>
                <span className="font-semibold">{preview.counts.deleted}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Fields</span>
                <span className="font-semibold">
                  {preview.counts.frontMatterFields + preview.counts.formattingFields + preview.counts.pageFormatFields}
                </span>
              </div>
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Warnings</span>
                <span className="font-semibold">{preview.counts.warnings}</span>
              </div>
            </div>
            {summaryLines.length ? (
              <ul className="space-y-1 text-muted-foreground">
                {summaryLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No content changes in the dry run.</p>
            )}
            {result?.error ? <p className="text-red-700">{result.error}</p> : null}
            {result?.warnings.length ? (
              <ul className="space-y-1 text-amber-800">
                {result.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${warning.targetId ?? index}`}>{warning.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

interface VersionPreviewSummary {
  kind: "test" | "raw";
  title: string;
  subtitle: string;
  details: string[];
  questions: string[];
  rawPreview: string;
}

function projectFileVersionPreview(version: ProjectFileVersion): VersionPreviewSummary {
  const rawPreview = version.content.length > 6000 ? `${version.content.slice(0, 6000)}\n...` : version.content;
  try {
    const parsed = JSON.parse(version.content) as unknown;
    const savedTest = normalizeSavedTest(parsed);
    if (!savedTest) throw new Error("Unsupported saved test");
    const totalMarks = savedTest.questions.reduce((sum, question) => sum + questionMarks(question), 0);
    return {
      kind: "test",
      title: savedTest.name || `Revision ${version.revision}`,
      subtitle: [savedTest.frontMatter.subjectTitle, savedTest.frontMatter.assessmentTitle].filter(Boolean).join(" - "),
      details: [
        `${savedTest.questions.length} question${savedTest.questions.length === 1 ? "" : "s"}`,
        `${totalMarks} mark${totalMarks === 1 ? "" : "s"}`,
        `Saved ${new Date(version.createdAt).toLocaleString()}`,
      ],
      questions: savedTest.questions.slice(0, 8).map((question, index) => {
        const marks = questionMarks(question);
        const partCount = question.parts.length;
        const blockCount =
          question.contentBlocks.length +
          question.parts.reduce(
            (partSum, part) =>
              partSum +
              part.contentBlocks.length +
              part.subparts.reduce((subpartSum, subpart) => subpartSum + subpart.contentBlocks.length, 0),
            0,
          );
        return `Question ${index + 1}: ${marks} mark${marks === 1 ? "" : "s"}, ${partCount || blockCount} ${
          partCount ? `part${partCount === 1 ? "" : "s"}` : `module${blockCount === 1 ? "" : "s"}`
        }`;
      }),
      rawPreview,
    };
  } catch {
    return {
      kind: "raw",
      title: `Revision ${version.revision}`,
      subtitle: version.fileType ? `${version.fileType} file` : "File snapshot",
      details: [`Saved ${new Date(version.createdAt).toLocaleString()}`, `${formatProjectFileSize(version.content.length)} text`],
      questions: [],
      rawPreview,
    };
  }
}

function NewTestDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (template: TitlePageTemplate) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={onClose}>
      <section
        className="w-full max-w-2xl rounded-xl border bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-test-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b p-4">
          <div className="flex min-w-0 items-center gap-2">
            <PlusCircle className="size-5 text-primary" aria-hidden="true" />
            <h2 id="new-test-dialog-title" className="truncate text-base font-semibold">
              New test
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" title="Close new test" aria-label="Close new test" onClick={onClose}>
            <X />
          </Button>
        </header>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          {NEW_TEST_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onCreate(template.id)}
              className="group flex min-h-40 flex-col items-start gap-3 rounded-lg border bg-card p-4 text-left transition hover:border-primary hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-10 items-center justify-center rounded-md border bg-background text-primary transition group-hover:border-primary">
                {template.id === "exam" ? (
                  <ListTree className="size-5" aria-hidden="true" />
                ) : (
                  <FileText className="size-5" aria-hidden="true" />
                )}
              </span>
              <span className="text-lg font-semibold">{template.title}</span>
              <span className="text-sm leading-6 text-muted-foreground">{template.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
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
          <InlineSummaryTitle label="Title" summary={`${frontMatter.subjectTitle} - ${assessmentTitleText(frontMatter.assessmentTitle)}`} />
        }
        defaultOpen={false}
        className="bg-muted/20"
        openSignal={openSignal}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
            Title page template
            <select
              value={titlePageTemplate}
              onChange={(event) => {
                const nextTemplate = titlePageTemplateFromValue(event.target.value);
                onChange({
                  titlePageTemplate: nextTemplate,
                  ...(nextTemplate === "exam"
                    ? {
                        ...examSectionPresetPatch(exam, exam.sectionPreset),
                        showDeclaration: false,
                        showInstructions: false,
                      }
                    : { showDeclaration: true, showInstructions: true }),
                });
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            >
              <option value="standard">School test title page</option>
              <option value="exam">School exam booklet</option>
            </select>
          </label>
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
          <label className="flex flex-col gap-2 text-xs font-medium">
            Subject title
            <input
              value={frontMatter.subjectTitle}
              onChange={(event) => onChange({ subjectTitle: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Assessment title
            <input
              value={assessmentTitleText(frontMatter.assessmentTitle)}
              onChange={(event) => onChange({ assessmentTitle: assessmentTitleText(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          {titlePageTemplate === "standard" ? (
            <>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Name label
                <input
                  value={frontMatter.nameLabel}
                  onChange={(event) => onChange({ nameLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Mark label
                <input
                  value={frontMatter.markLabel}
                  onChange={(event) => onChange({ markLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            </>
          ) : null}
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
                Student number label
                <input
                  value={exam.studentNumberLabel}
                  onChange={(event) => updateExam({ studentNumberLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Student number figures label
                <input
                  value={exam.studentNumberFiguresLabel}
                  onChange={(event) => updateExam({ studentNumberFiguresLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Student number words label
                <input
                  value={exam.studentNumberWordsLabel}
                  onChange={(event) => updateExam({ studentNumberWordsLabel: event.target.value })}
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
                Cut-off notice
                <input
                  value={exam.cutOffNotice}
                  onChange={(event) => updateExam({ cutOffNotice: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
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

function TestFormatEditor({
  formattingConfig,
  openSignal,
  onFormattingChange,
  onPageChange,
  onReset,
}: {
  formattingConfig: FormattingConfig;
  openSignal?: number;
  onFormattingChange: (patch: Partial<FormattingConfig>) => void;
  onPageChange: (patch: Partial<NonNullable<FormattingConfig["page"]>>) => void;
  onReset: () => void;
}) {
  const normalizedFormatting = normalizeFormattingConfig(formattingConfig);
  const page = normalizePageFormattingConfig(normalizedFormatting.page);
  const selectedPagePresetId = pagePresetId(normalizedFormatting);
  const formatPresetOptions = TEST_FORMAT_PRESETS.some((preset) => preset.id === normalizedFormatting.id)
    ? TEST_FORMAT_PRESETS
    : [...TEST_FORMAT_PRESETS, { id: normalizedFormatting.id ?? "custom", label: "Custom current style" }];
  const pagePresetOptions =
    selectedPagePresetId === "custom" ? [...PAGE_PRESETS, { id: "custom", label: "Custom current size", page }] : PAGE_PRESETS;
  const summary = `${formattingPresetLabel(normalizedFormatting)} · ${page.size ?? "Page"} ${page.orientation ?? ""} · ${
    normalizedFormatting.showMarks ? "marks shown" : "marks hidden"
  }`;
  const setPagePreset = (presetId: string) => {
    const preset = PAGE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    onPageChange(preset.page);
  };

  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label="Test format" summary={summary} />}
      defaultOpen={false}
      className="bg-muted/20"
      openSignal={openSignal}
      actions={
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          Reset
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
          Test style
          <select
            value={normalizedFormatting.id ?? DEFAULT_FORMATTING_CONFIG.id}
            onChange={(event) => {
              const preset = TEST_FORMAT_PRESETS.find((item) => item.id === event.target.value);
              if (preset) onFormattingChange({ id: preset.id });
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          >
            {formatPresetOptions.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 text-xs font-medium md:col-span-2">
          <input
            type="checkbox"
            checked={normalizedFormatting.showMarks ?? true}
            onChange={(event) => onFormattingChange({ showMarks: event.target.checked })}
          />
          Show mark labels on questions, parts, and subparts
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Page
          <select
            value={selectedPagePresetId}
            onChange={(event) => setPagePreset(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          >
            {pagePresetOptions.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-end gap-2 text-xs font-medium md:mt-6">
          <input
            type="checkbox"
            checked={page.showPageBreaks ?? true}
            onChange={(event) => onPageChange({ showPageBreaks: event.target.checked })}
          />
          Show page break labels in preview
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Page width
          <input
            type="number"
            min={1}
            value={formatSettingNumber(page.widthPx, DEFAULT_PAGE_FORMAT.widthPx)}
            onChange={(event) => onPageChange({ widthPx: formatSettingNumber(event.target.value, DEFAULT_PAGE_FORMAT.widthPx) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Page height
          <input
            type="number"
            min={1}
            value={formatSettingNumber(page.heightPx, DEFAULT_PAGE_FORMAT.heightPx)}
            onChange={(event) => onPageChange({ heightPx: formatSettingNumber(event.target.value, DEFAULT_PAGE_FORMAT.heightPx) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Side margin
          <input
            type="number"
            min={0}
            value={formatSettingNumber(page.paddingXPx, DEFAULT_PAGE_FORMAT.paddingXPx)}
            onChange={(event) => onPageChange({ paddingXPx: formatSettingNumber(event.target.value, DEFAULT_PAGE_FORMAT.paddingXPx) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Top/bottom margin
          <input
            type="number"
            min={0}
            value={formatSettingNumber(page.paddingYPx, DEFAULT_PAGE_FORMAT.paddingYPx)}
            onChange={(event) => onPageChange({ paddingYPx: formatSettingNumber(event.target.value, DEFAULT_PAGE_FORMAT.paddingYPx) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
      </div>
    </CollapsiblePanel>
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
  if (config.type === "vectorRelationship") return "Schematic network";
  if (config.type === "setDiagram") return "Two-set Venn";
  if (config.type === "geometricConstruction") return "Penrose construction";
  return diagramTypeLabel(config.type);
}

function diagramBlockSummary(block: Extract<EditorContentBlock, { kind: "diagram" }>) {
  return diagramConfigSummary(block.graphConfig);
}

function tocBlockLabel(block: EditorContentBlock, blockIndex: number) {
  const itemNumber = blockIndex + 1;
  if (block.kind === "text") return `Text ${itemNumber}`;
  if (block.kind === "choices") return `Choices ${itemNumber}`;
  if (block.kind === "table") return `Table ${itemNumber}`;
  if (block.kind === "diagram") return `Diagram ${itemNumber}`;
  if (block.kind === "space") return `Space ${itemNumber}`;
  return `Block ${itemNumber}`;
}

function tocBlockSummary(block: EditorContentBlock) {
  if (block.kind === "text") return textBlockSummary(block.text ?? "");
  if (block.kind === "choices") return choiceListSummary(block);
  if (block.kind === "table") return tableBlockSummary(block);
  if (block.kind === "diagram") return diagramBlockSummary(block);
  if (block.kind === "space") {
    const lines = spaceLines(block.lines);
    return `${lines} line${lines === 1 ? "" : "s"}`;
  }
  return "";
}

function tocBlockKind(block: EditorContentBlock): TocItemKind {
  if (block.kind === "choices") return "choices";
  if (block.kind === "table") return "table";
  if (block.kind === "diagram") return "diagram";
  if (block.kind === "space") return "space";
  return "text";
}

function buildDocumentToc(frontMatter: FrontMatterConfig, questions: QuestionBlock[], showSolutions: boolean) {
  const items: DocumentTocItem[] = [
    {
      id: SCROLL_ANCHOR_FRONT_MATTER,
      label: "Title Page",
      summary: `${frontMatter.subjectTitle} - ${assessmentTitleText(frontMatter.assessmentTitle)}`,
      kind: "title",
      depth: 0,
      editorAnchor: SCROLL_ANCHOR_FRONT_MATTER,
      previewAnchor: SCROLL_ANCHOR_FRONT_MATTER,
    },
  ];

  questions.forEach((question, questionIndex) => {
    const questionAnchor = questionScrollAnchor(question.id);
    items.push({
      id: questionAnchor,
      label: `Question ${questionDisplayNumber(frontMatter, questionIndex)}`,
      summary: firstTextSource(question.contentBlocks, showSolutions) || markLabel(questionMarks(question)),
      kind: "question",
      depth: 0,
      editorAnchor: questionAnchor,
      previewAnchor: questionAnchor,
    });

    orderedQuestionItems(question).forEach((item, itemIndex) => {
      if (item.kind === "block") {
        if (!isContentBlockVisible(item.block, showSolutions)) return;
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
        label: `Part (${partLabel})`,
        summary: partPanelSummary(item.part.contentBlocks, showSolutions) || markLabel(partMarks(item.part)),
        kind: "part",
        depth: 1,
        editorAnchor: partAnchor,
        previewAnchor: partAnchor,
      });

      orderedPartItems(item.part).forEach((partItem, partItemIndex) => {
        if (partItem.kind === "block") {
          if (!isContentBlockVisible(partItem.block, showSolutions)) return;
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
          label: `Subpart (${subpartLabel})`,
          summary: partPanelSummary(partItem.subpart.contentBlocks, showSolutions) || markLabel(partItem.subpart.marks),
          kind: "subpart",
          depth: 2,
          editorAnchor: subpartAnchor,
          previewAnchor: subpartAnchor,
        });

        partItem.subpart.contentBlocks
          .filter((block) => block.kind !== "pageBreak" && isContentBlockVisible(block, showSolutions))
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

function TocItemIcon({ kind }: { kind: TocItemKind }) {
  if (kind === "title") return <FileText className="size-4" aria-hidden="true" />;
  if (kind === "question") return null;
  if (kind === "pageBreak") return <SeparatorHorizontal className="size-4" aria-hidden="true" />;
  if (kind === "part" || kind === "subpart") return <GitBranch className="size-4" aria-hidden="true" />;
  if (kind === "diagram") return <ImagePlus className="size-4" aria-hidden="true" />;
  if (kind === "table") return <Table2 className="size-4" aria-hidden="true" />;
  if (kind === "choices") return <ListOrdered className="size-4" aria-hidden="true" />;
  if (kind === "space") return <SeparatorHorizontal className="size-4" aria-hidden="true" />;
  return <Type className="size-4" aria-hidden="true" />;
}

function questionHasPageBreak(question: QuestionBlock) {
  return question.pageBreakAfter || question.contentBlocks.some((block) => block.kind === "pageBreak");
}

function pageBreakQuestionIdSet(questions: QuestionBlock[]) {
  return new Set(questions.filter(questionHasPageBreak).map((question) => question.id));
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

function isTocBranchItem(item: DocumentTocItem, items: DocumentTocItem[]) {
  if (item.kind !== "question" && item.kind !== "part" && item.kind !== "subpart") return false;
  const index = items.findIndex((candidate) => candidate.id === item.id);
  return index >= 0 && (items[index + 1]?.depth ?? -1) > item.depth;
}

function tocBranchIdSet(items: DocumentTocItem[]) {
  return new Set(items.filter((item) => isTocBranchItem(item, items)).map((item) => item.id));
}

function visibleTocItems(items: DocumentTocItem[], collapsedItemIds: Set<string>) {
  const visibleItems: DocumentTocItem[] = [];
  let hiddenBelowDepth: number | null = null;

  items.forEach((item) => {
    if (hiddenBelowDepth !== null) {
      if (item.depth > hiddenBelowDepth) return;
      hiddenBelowDepth = null;
    }

    visibleItems.push(item);
    if (collapsedItemIds.has(item.id)) {
      hiddenBelowDepth = item.depth;
    }
  });

  return visibleItems;
}

function tocSummaryText(source: string) {
  return parseMixedMath(source)
    .map((segment) => segment.content)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function tocRailItems(items: DocumentTocItem[]) {
  return items.filter((item) => item.kind === "title" || (item.kind === "question" && item.depth === 0));
}

function tocRailPageBreakItem(questionItem: DocumentTocItem, questionId: string): DocumentTocItem {
  const pageBreakAnchor = pageBreakScrollAnchor(questionId);
  return {
    id: pageBreakAnchor,
    label: `Page break after ${questionItem.label}`,
    summary: "Page break",
    kind: "pageBreak",
    depth: 0,
    editorAnchor: pageBreakAnchor,
    previewAnchor: questionItem.previewAnchor,
  };
}

function tocRailLabel(item: DocumentTocItem) {
  if (item.kind === "title") return "T";
  if (item.kind === "pageBreak") return "";
  return item.label.replace(/^Question\s+/i, "");
}

function activeTocRailItemId(items: DocumentTocItem[], activeItemId: string) {
  const activeIndex = items.findIndex((item) => item.id === activeItemId);
  if (activeIndex === -1) return activeItemId;

  for (let index = activeIndex; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "title" || (item.kind === "question" && item.depth === 0)) return item.id;
  }

  return activeItemId;
}

function DocumentNavigator({
  items,
  activeItemId,
  onJump,
}: {
  items: DocumentTocItem[];
  activeItemId: string;
  onJump: (item: DocumentTocItem) => void;
}) {
  const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(() => tocBranchIdSet(items));
  const knownBranchItemIdsRef = useRef<Set<string>>(tocBranchIdSet(items));
  const branchItemIds = useMemo(() => tocBranchIdSet(items), [items]);
  const displayedItems = useMemo(() => visibleTocItems(items, collapsedItemIds), [items, collapsedItemIds]);

  useEffect(() => {
    const knownBranchItemIds = knownBranchItemIdsRef.current;
    const branchIds = tocBranchIdSet(items);
    setCollapsedItemIds((current) => {
      const next = new Set<string>();
      current.forEach((id) => {
        if (branchIds.has(id)) next.add(id);
      });
      branchIds.forEach((id) => {
        if (!knownBranchItemIds.has(id)) next.add(id);
      });
      return next;
    });
    knownBranchItemIdsRef.current = branchIds;
  }, [items]);

  function toggleItem(itemId: string) {
    setCollapsedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  return (
    <aside className="flex min-h-0 flex-col border-r bg-card/95 shadow-panel">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b px-3">
          <h2 className="truncate text-sm font-semibold">Document</h2>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Document table of contents">
          <div className="flex flex-col gap-1">
            {displayedItems.map((item) => {
              const active = item.id === activeItemId;
              const relatedActive = !active && scrollAnchorContains(item.id, activeItemId);
              const isBranch = branchItemIds.has(item.id);
              const branchCollapsed = collapsedItemIds.has(item.id);
              const summaryText = item.summary ? tocSummaryText(item.summary) : "";
              const icon = TocItemIcon({ kind: item.kind });
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group flex min-w-0 items-start gap-1 rounded-md px-2 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : relatedActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  style={{ paddingLeft: `${0.55 + item.depth * 0.85}rem` }}
                >
                  {isBranch ? (
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-background/20"
                      aria-label={branchCollapsed ? `Expand ${item.label}` : `Collapse ${item.label}`}
                      aria-expanded={!branchCollapsed}
                    >
                      {branchCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                  ) : (
                    <span className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  )}
                  <button type="button" onClick={() => onJump(item)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                    {icon ? (
                      <span
                        className={cn(
                          "mt-0.5 shrink-0",
                          active
                            ? "text-primary-foreground"
                            : relatedActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-current",
                        )}
                      >
                        {icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.label}</span>
                      {summaryText ? (
                        <span
                          className={cn(
                            "block truncate text-xs",
                            active ? "text-primary-foreground/80" : relatedActive ? "text-primary/80" : "text-muted-foreground",
                          )}
                          title={item.summary}
                        >
                          {summaryText}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </nav>
      </div>
    </aside>
  );
}

function DocumentNavigatorRail({
  open,
  items,
  activeItemId,
  draggedQuestionId,
  dragOverQuestion,
  draggedPageBreakQuestionId,
  dragOverPageBreak,
  pageBreakQuestionIds,
  onToggle,
  onJump,
  onPreviewJump,
  onSelectPageBreak,
  onToggleEditorAtItem,
  onAddQuestion,
  onAddPageBreakAfterQuestion,
  onMoveQuestion,
  onMovePageBreak,
  onDeleteQuestion,
  onDeletePageBreak,
  onQuestionDragStart,
  onQuestionDragOver,
  onQuestionDragLeave,
  onQuestionDrop,
  onQuestionDragEnd,
  onPageBreakDragStart,
  onPageBreakDragOver,
  onPageBreakDragLeave,
  onPageBreakDrop,
  onPageBreakDragEnd,
}: {
  open: boolean;
  items: DocumentTocItem[];
  activeItemId: string;
  draggedQuestionId: string | null;
  dragOverQuestion: QuestionDropPreview | null;
  draggedPageBreakQuestionId: string | null;
  dragOverPageBreak: PageBreakDropPreview | null;
  pageBreakQuestionIds: Set<string>;
  onToggle: () => void;
  onJump: (item: DocumentTocItem) => void;
  onPreviewJump: (item: DocumentTocItem) => void;
  onSelectPageBreak: (item: DocumentTocItem) => void;
  onToggleEditorAtItem: (item: DocumentTocItem) => void;
  onAddQuestion: () => void;
  onAddPageBreakAfterQuestion: (questionId: string) => void;
  onMoveQuestion: (questionId: string, direction: MoveDirection) => void;
  onMovePageBreak: (questionId: string, direction: MoveDirection) => void;
  onDeleteQuestion: (questionId: string) => void;
  onDeletePageBreak: (questionId: string) => void;
  onQuestionDragStart: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDragOver: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDragLeave: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDrop: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onQuestionDragEnd: () => void;
  onPageBreakDragStart: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onPageBreakDragOver: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onPageBreakDragLeave: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onPageBreakDrop: (event: DragEvent<HTMLElement>, questionId: string) => void;
  onPageBreakDragEnd: () => void;
}) {
  const railItems = useMemo(
    () =>
      tocRailItems(items).flatMap((item) => {
        const questionId = questionIdFromScrollAnchor(item.editorAnchor);
        if (!questionId || !pageBreakQuestionIds.has(questionId)) return [item];
        return [item, tocRailPageBreakItem(item, questionId)];
      }),
    [items, pageBreakQuestionIds],
  );
  const activeRailItemId = useMemo(() => activeTocRailItemId(items, activeItemId), [activeItemId, items]);
  const selectedQuestionId = questionIdFromScrollAnchor(activeRailItemId);
  const canAddPageBreak = Boolean(selectedQuestionId && !pageBreakQuestionIds.has(selectedQuestionId));

  return (
    <aside className="flex min-h-0 w-[3.25rem] flex-col border-r bg-card/95 shadow-panel">
      <div className="flex h-14 items-center justify-center border-b">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={open ? "Hide document navigator" : "Show document navigator"}
          aria-label={open ? "Hide document navigator" : "Show document navigator"}
          aria-pressed={open}
          onClick={onToggle}
          className={cn("size-9", open && "bg-primary/10 text-primary")}
        >
          <ListTree />
        </Button>
      </div>
      <nav
        className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto overscroll-contain px-1.5 py-3"
        aria-label="Document quick navigation"
      >
        {railItems.map((item) => {
          if (item.kind === "pageBreak") {
            const questionId = pageBreakQuestionIdFromScrollAnchor(item.editorAnchor);
            const active = item.id === activeRailItemId;
            const dragging = draggedPageBreakQuestionId === questionId;
            return (
              <button
                key={item.id}
                type="button"
                draggable
                data-drag-preview
                title={`${item.label}. Click selects it in the mini TOC. Alt+Up/Alt+Down moves it. Delete removes it.`}
                aria-label={`${item.label}. Click selects it in the mini TOC. Press Alt+Up or Alt+Down to move it. Press Delete to remove it.`}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete Backspace"
                aria-current={active ? "location" : undefined}
                onClick={() => onSelectPageBreak(item)}
                onKeyDown={(event) => {
                  if (keyboardDeleteRequested(event)) {
                    event.preventDefault();
                    event.stopPropagation();
                    onDeletePageBreak(questionId);
                    return;
                  }
                  const direction = keyboardMoveDirection(event);
                  if (!direction) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onMovePageBreak(questionId, direction);
                }}
                onDragStart={(event) => onPageBreakDragStart(event, questionId)}
                onDragEnd={onPageBreakDragEnd}
                className={cn(
                  "flex h-6 w-8 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-sm border border-primary/60 bg-primary/15 text-primary transition-colors hover:bg-primary/20 active:cursor-grabbing",
                  active && "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary",
                  dragging && "scale-95 opacity-60 shadow-lg",
                )}
              >
                <SeparatorHorizontal className="size-4" aria-hidden="true" />
              </button>
            );
          }

          const active = item.id === activeRailItemId;
          const questionId = questionIdFromScrollAnchor(item.editorAnchor);
          const togglesEditor = item.kind === "title" || Boolean(questionId);
          const draggable = Boolean(questionId);
          const dragging = draggedQuestionId === questionId;
          const dropPlacement =
            questionId && dragOverQuestion?.questionId === questionId && draggedQuestionId !== questionId
              ? dragOverQuestion.placement
              : null;
          const pageBreakDropPlacement =
            questionId && dragOverPageBreak?.questionId === questionId && draggedPageBreakQuestionId ? dragOverPageBreak.placement : null;
          return (
            <button
              key={item.id}
              type="button"
              draggable={draggable}
              data-drag-preview={draggable ? true : undefined}
              title={
                draggable
                  ? `${item.label}. Click selects it and jumps the display. Double-click opens or closes the editor. Alt+Up/Alt+Down moves it. Delete removes it.`
                  : `${item.label}. Click selects it and jumps the display. Double-click opens or closes the editor.`
              }
              aria-label={
                draggable
                  ? `${item.label}. Click selects it and jumps the display. Double-click opens or closes the editor. Press Alt+Up or Alt+Down to move it. Press Delete to remove it.`
                  : `${item.label}. Click selects it and jumps the display. Double-click opens or closes the editor.`
              }
              aria-current={active ? "location" : undefined}
              aria-keyshortcuts={draggable ? "Alt+ArrowUp Alt+ArrowDown Delete Backspace" : undefined}
              onClick={() => (item.kind === "title" || questionId ? onPreviewJump(item) : onJump(item))}
              onDoubleClick={togglesEditor ? () => onToggleEditorAtItem(item) : undefined}
              onKeyDown={
                questionId
                  ? (event) => {
                      if (keyboardDeleteRequested(event)) {
                        event.preventDefault();
                        event.stopPropagation();
                        onDeleteQuestion(questionId);
                        return;
                      }
                      const direction = keyboardMoveDirection(event);
                      if (!direction) return;
                      event.preventDefault();
                      event.stopPropagation();
                      onMoveQuestion(questionId, direction);
                    }
                  : undefined
              }
              onDragStart={questionId ? (event) => onQuestionDragStart(event, questionId) : undefined}
              onDragOver={
                questionId
                  ? (event) => {
                      onPageBreakDragOver(event, questionId);
                      onQuestionDragOver(event, questionId);
                    }
                  : undefined
              }
              onDragLeave={
                questionId
                  ? (event) => {
                      onPageBreakDragLeave(event, questionId);
                      onQuestionDragLeave(event, questionId);
                    }
                  : undefined
              }
              onDrop={
                questionId
                  ? (event) => {
                      onPageBreakDrop(event, questionId);
                      onQuestionDrop(event, questionId);
                    }
                  : undefined
              }
              onDragEnd={draggable ? onQuestionDragEnd : undefined}
              className={cn(
                "relative flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-md border text-sm font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent hover:text-accent-foreground",
                draggable && "cursor-grab active:cursor-grabbing",
                dragging && "scale-95 opacity-60 shadow-lg",
                dropPlacement === "before" &&
                  "before:absolute before:-top-1.5 before:left-0 before:right-0 before:z-20 before:h-1 before:rounded-full before:bg-primary before:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] before:content-['']",
                dropPlacement === "after" &&
                  "after:absolute after:-bottom-1.5 after:left-0 after:right-0 after:z-20 after:h-1 after:rounded-full after:bg-primary after:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] after:content-['']",
                pageBreakDropPlacement === "before" &&
                  "before:absolute before:-top-1.5 before:left-0 before:right-0 before:z-20 before:h-1 before:rounded-full before:bg-primary before:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] before:content-['']",
                pageBreakDropPlacement === "after" &&
                  "after:absolute after:-bottom-1.5 after:left-0 after:right-0 after:z-20 after:h-1 after:rounded-full after:bg-primary after:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] after:content-['']",
              )}
            >
              {tocRailLabel(item)}
            </button>
          );
        })}
      </nav>
      <div className="flex h-20 shrink-0 flex-col items-center justify-center gap-1 border-t">
        <button
          type="button"
          title="Add question"
          aria-label="Add question"
          onClick={onAddQuestion}
          className="flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-md border border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary/60 hover:bg-accent hover:text-primary"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          title={
            selectedQuestionId
              ? canAddPageBreak
                ? "Add page break after selected question"
                : "Selected question already has a page break"
              : "Select a question to add a page break"
          }
          aria-label="Add page break after selected question"
          disabled={!canAddPageBreak}
          onClick={() => {
            if (selectedQuestionId) onAddPageBreakAfterQuestion(selectedQuestionId);
          }}
          className="flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-md border border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary/60 hover:bg-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border disabled:hover:bg-background disabled:hover:text-muted-foreground"
        >
          <SeparatorHorizontal className="size-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

function PageBreakStructurePanel({ label, active, onRemove }: { label: string; active: boolean; onRemove: () => void }) {
  return (
    <section className={cn("rounded-lg border bg-card p-4 shadow-panel transition-colors", active && EDITOR_ACTIVE_PANEL_CLASS)}>
      <div className="flex items-center gap-2 p-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SeparatorHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">{label}</span>
        </div>
        <RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />
      </div>
    </section>
  );
}

function DiagramBlockEditor({
  label,
  graphConfig,
  alignment = "center",
  showSolutions = true,
  dragHandle,
  muted = false,
  active = false,
  openSignal,
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
      config.type === "vectorRelationship" ? (
        <VectorRelationshipEditor config={config} substanceSource={penroseSubstanceSource(config)} onChange={patchConfig} />
      ) : config.type === "setDiagram" ? (
        <SetDiagramEditor config={config} onChange={patchConfig} />
      ) : (
        <GeometricConstructionEditor config={config} substanceSource={penroseSubstanceSource(config)} onChange={patchConfig} />
      ),
    );
  }

  if (config.type === "vector2d") {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "graph-editor-controls p-3",
      <Vector2DGraphEditor config={config} onChange={patchConfig} />,
    );
  }

  if (config.type === "graph3d") {
    return renderDiagramPanel(
      diagramConfigSummary(config),
      "graph-editor-controls p-3",
      <Graph3DGraphEditor config={config} onChange={patchConfig} />,
    );
  }

  if (config.type === "statsChart") {
    return renderDiagramPanel(statsChartSummary(config), "p-3", <StatsChartEditor config={config} onChange={patchConfig} />);
  }

  return renderDiagramPanel(
    diagramConfigSummary(config),
    "graph-editor-controls p-3",
    <FunctionGraphEditor config={config} showSolutions={showSolutions} onChange={patchConfig} />,
  );
}

export default function App() {
  const initialEditorDraft = loadInitialEditorDraft();
  const initialQuestions = useMemo(() => initialEditorDraft?.questions ?? [createQuestion()], [initialEditorDraft]);
  const [frontMatter, setFrontMatter] = useState<FrontMatterConfig>(() => initialEditorDraft?.frontMatter ?? DEFAULT_FRONT_MATTER);
  const [formattingConfig, setFormattingConfig] = useState<FormattingConfig>(
    () => initialEditorDraft?.formattingConfig ?? DEFAULT_FORMATTING_CONFIG,
  );
  const [logos, setLogos] = useState<LogoAsset[]>(loadLogoLibrary);
  const [legacySavedTests, setLegacySavedTests] = useState<SavedTest[]>(loadLegacySavedTests);
  const [questions, setQuestions] = useState<QuestionBlock[]>(() => initialQuestions);
  const [draftAutosaveStatus, setDraftAutosaveStatus] = useState<DraftAutosaveStatus>("loading");
  const [draftAutosaveMessage, setDraftAutosaveMessage] = useState("Loading draft autosave");
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestion, setDragOverQuestion] = useState<QuestionDropPreview | null>(null);
  const [draggedPageBreakQuestionId, setDraggedPageBreakQuestionId] = useState<string | null>(null);
  const [dragOverPageBreak, setDragOverPageBreak] = useState<PageBreakDropPreview | null>(null);
  const [draggedSubsection, setDraggedSubsection] = useState<SubsectionDragTarget | null>(null);
  const [dragOverSubsection, setDragOverSubsection] = useState<SubsectionDropPreview | null>(null);
  const [paneMode, setPaneMode] = useState<PaneMode>("preview");
  const [tocOpen, setTocOpen] = useState(false);
  const [activeTocItemId, setActiveTocItemId] = useState(() => firstQuestionAnchor(initialQuestions));
  const [activeRailItemId, setActiveRailItemId] = useState(() => firstQuestionAnchor(initialQuestions));
  const [activeQuestionId, setActiveQuestionId] = useState(() => firstQuestionId(initialQuestions));
  const [showSolutions, setShowSolutions] = useState(false);
  const [solutionValidationOpen, setSolutionValidationOpen] = useState(false);
  const [newTestDialogOpen, setNewTestDialogOpen] = useState(false);
  const [actionProposalOpen, setActionProposalOpen] = useState(false);
  const [actionProposalText, setActionProposalText] = useState("");
  const [actionProposalMessage, setActionProposalMessage] = useState("");
  const [actionProposalResult, setActionProposalResult] = useState<MauthDocumentActionResult<
    QuestionBlock,
    FrontMatterConfig,
    FormattingConfig
  > | null>(null);
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
    ensureProject,
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
    initialActiveProjectFilePath: initialEditorDraft?.activeProjectFilePath ?? null,
    initialActiveProjectFileRevision: initialEditorDraft?.activeProjectFileRevision ?? null,
    legacySavedTests,
    storageHydrated,
    buildLegacySavedTestImport,
    isVisibleProjectFile: isVisibleProjectTestFile,
  });
  const [lastProjectSaveFingerprint, setLastProjectSaveFingerprint] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [previewViewport, setPreviewViewport] = useState({ width: 0, height: 0 });
  const [previewZoom, setPreviewZoom] = useState(1);
  const [printPreviewMounted, setPrintPreviewMounted] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [editorRevealRequest, setEditorRevealRequest] = useState<{ anchor: string; sequence: number } | null>(null);
  const editorPaneRef = useRef<HTMLElement>(null);
  const previewPaneRef = useRef<HTMLElement>(null);
  const frontMatterRef = useRef(frontMatter);
  const formattingConfigRef = useRef(formattingConfig);
  const questionsRef = useRef(questions);
  const logosRef = useRef(logos);
  const legacySavedTestsRef = useRef(legacySavedTests);
  const activeProjectFilePathRef = useRef(activeProjectFilePath);
  const activeProjectFileRevisionRef = useRef(activeProjectFileRevision);
  const undoStackRef = useRef<EditorHistorySnapshot[]>([]);
  const redoStackRef = useRef<EditorHistorySnapshot[]>([]);
  const autosaveSequenceRef = useRef(0);
  const pendingEditorJumpAnchorRef = useRef<string | null>(null);
  const pendingPreviewJumpAnchorRef = useRef<string | null>(null);
  const previewEditClickStartRef = useRef<PreviewEditClickStart | null>(null);
  const deleteActiveEditorSelectionRef = useRef<() => boolean>(() => false);
  const previewZoomRef = useRef(1);
  const previewGestureStartZoomRef = useRef(1);
  const previewZoomStateSyncTimerRef = useRef<number | null>(null);

  const collectCurrentRenderedPreviewMetrics = useCallback(
    () => collectRenderedPreviewMetrics(previewPaneRef.current, activeTocItemId),
    [activeTocItemId],
  );

  const waitForRenderedPreviewMetrics = useCallback(async () => {
    await new Promise<void>((resolve) => {
      if (typeof window.requestAnimationFrame !== "function") {
        window.setTimeout(resolve, 0);
        return;
      }
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
    return collectCurrentRenderedPreviewMetrics();
  }, [collectCurrentRenderedPreviewMetrics]);

  const assistantHost = useMauthAssistantHost<QuestionBlock, FrontMatterConfig, FormattingConfig>({
    getDocument: currentEditorDocument,
    commitDocument: (document) => commitAssistantDocument(document),
    documentOptions: editorDocumentActionOptions,
    ensureProject,
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    getActiveAnchor: () => activeTocItemId,
    getRenderedPreviewMetrics: collectCurrentRenderedPreviewMetrics,
    waitForRenderedPreviewMetrics,
    setActiveProjectFilePath,
    setActiveProjectFileRevision,
    setProjectSaveConflict,
    setLastProjectSaveFingerprint,
    currentDocumentFingerprint: currentAssistantDocumentFingerprint,
    closeFileManager: () => setFileManagerOpen(false),
    setProjectFiles,
    setProjectFilesStatusReady: () => setProjectFilesStatus("ready"),
    serializeDocument: (document) => serializeAssistantDocument(document),
    parseProjectFileDocument: (document) => parseAssistantProjectDocument(document),
  });

  const assistantController = useMauthAssistantController({
    previewModeActive: paneMode === "assistant",
    openPreviewMode: showAssistantPane,
    createHost: assistantHost,
    onFileToolStart: (toolName) => {
      setProjectFilesStatus(toolName === "mauth.files.open" ? "loading" : "saving");
      setProjectFilesMessage(`Assistant: ${toolName}`);
    },
    onFileToolComplete: () => {
      setProjectFilesStatus((current) => (current === "saving" || current === "loading" ? "ready" : current));
      setProjectFilesMessage((current) => (current.startsWith("Assistant:") ? "Assistant tool completed" : current));
    },
    onFileToolError: () => {
      setProjectFilesStatus((current) => (current === "saving" || current === "loading" ? "error" : current));
    },
  });

  const printDocument = useCallback(() => {
    flushSync(() => setPrintPreviewMounted(true));
    window.requestAnimationFrame(() => window.print());
  }, []);

  useEffect(() => {
    const handleBeforePrint = () => {
      flushSync(() => setPrintPreviewMounted(true));
    };
    const handleAfterPrint = () => setPrintPreviewMounted(false);

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;

    async function hydrateDiskStorage() {
      try {
        const [testsResponse, autosaveResponse, logosResponse] = await Promise.all([
          listLegacyStoredTests<unknown>(),
          getStorageAutosave<unknown>(),
          listStoredLogos<unknown>(),
        ]);
        if (cancelled) return;

        const diskLegacySavedTests = normalizeSavedTests(testsResponse.tests);
        const mergedLegacySavedTests = mergeLegacySavedTests(diskLegacySavedTests, legacySavedTests);
        const diskLogos = normalizeLogoAssets(logosResponse.logos);
        const localLogos = logosRef.current.length ? logosRef.current : STARTER_LOGOS;
        const legacySavedTestLogos = mergedLegacySavedTests.map((test) => test.logo);
        const starterLogos = shouldSeedStarterLogos() ? STARTER_LOGOS : [];
        const mergedLogos = appendMissingLogoAssets(
          appendMissingLogoAssets(appendMissingLogoAssets(diskLogos.length ? diskLogos : localLogos, starterLogos), localLogos),
          legacySavedTestLogos,
        );
        setLegacySavedTests(mergedLegacySavedTests);
        setLogos(mergedLogos);
        logosRef.current = mergedLogos;
        persistLogoLibrary(mergedLogos);
        markStarterLogosSeeded();
        persistLegacySavedTests(mergedLegacySavedTests);
        Promise.allSettled(mergedLogos.map((logo) => saveStoredLogo<LogoAsset>(logo))).catch(() => undefined);

        const browserAutosave = loadCurrentDraft() as AutosavedEditorSnapshot | null;
        const diskAutosave = normalizeEditorSnapshot(autosaveResponse.autosave);
        const autosave = newerAutosave(browserAutosave, diskAutosave);
        if (autosave) {
          restoreEditorSnapshot(autosave);
          activeProjectFilePathRef.current = autosave.activeProjectFilePath ?? null;
          activeProjectFileRevisionRef.current = autosave.activeProjectFileRevision ?? null;
          setActiveProjectFilePath(autosave.activeProjectFilePath ?? null);
          setActiveProjectFileRevision(autosave.activeProjectFileRevision ?? null);
          setProjectSaveConflict(null);
          setLastProjectSaveFingerprint(null);
        }

        setDraftAutosaveStatus("ready");
        setDraftAutosaveMessage("Draft autosave ready");
      } catch {
        setDraftAutosaveStatus("unavailable");
        setDraftAutosaveMessage("API unavailable: using browser backup only");
      } finally {
        if (!cancelled) setStorageHydrated(true);
      }
    }

    hydrateDiskStorage();
    return () => {
      cancelled = true;
    };
    // The initial disk hydrate intentionally merges with the legacy browser saved tests captured at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!storageHydrated) return;
    if (!shouldSeedScreenshotStarter(questions)) return;

    const nextFrontMatter = createScreenshotStarterFrontMatter();
    const nextQuestions = createScreenshotStarterQuestions();
    const nextFormattingConfig = cloneSerializable(DEFAULT_FORMATTING_CONFIG);
    setFrontMatter(nextFrontMatter);
    setQuestions(nextQuestions);
    setFormattingConfig(nextFormattingConfig);
    frontMatterRef.current = nextFrontMatter;
    questionsRef.current = nextQuestions;
    formattingConfigRef.current = nextFormattingConfig;
    setActiveQuestionId(firstQuestionId(nextQuestions));
    setActiveTocItemId(firstQuestionAnchor(nextQuestions));
    setActiveRailItemId(firstQuestionAnchor(nextQuestions));
    activeProjectFilePathRef.current = null;
    activeProjectFileRevisionRef.current = null;
    setActiveProjectFilePath(null);
    setActiveProjectFileRevision(null);
    setProjectSaveConflict(null);
    setLastProjectSaveFingerprint(null);
    window.localStorage.setItem(STARTER_DOCUMENT_STORAGE_KEY, SCREENSHOT_STARTER_DOCUMENT_ID);
  }, [storageHydrated, questions, setActiveProjectFilePath, setActiveProjectFileRevision, setProjectSaveConflict]);

  useLayoutEffect(() => {
    if (!storageHydrated) return;
    persistCurrentDraft({
      frontMatter,
      questions,
      formattingConfig,
      activeProjectFilePath: activeProjectFilePath ?? undefined,
      activeProjectFileRevision: activeProjectFileRevision ?? undefined,
      logo: selectedLogoForFrontMatter(logosRef.current, frontMatter),
    });
  }, [activeProjectFilePath, activeProjectFileRevision, formattingConfig, frontMatter, questions, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated || draftAutosaveStatus === "unavailable") return;

    const autosaveSequence = autosaveSequenceRef.current + 1;
    autosaveSequenceRef.current = autosaveSequence;
    setDraftAutosaveStatus("saving");
    setDraftAutosaveMessage(activeProjectFilePath ? "Autosaving file draft" : "Autosaving draft");
    const timeoutId = window.setTimeout(() => {
      saveStorageAutosave<AutosavedEditorSnapshot>({
        frontMatter,
        questions,
        formattingConfig,
        activeProjectFilePath: activeProjectFilePath ?? undefined,
        activeProjectFileRevision: activeProjectFileRevision ?? undefined,
        logo: selectedLogoForFrontMatter(logosRef.current, frontMatter),
      })
        .then((autosaveResponse) => {
          if (autosaveSequenceRef.current !== autosaveSequence) return;
          setDraftAutosaveStatus("saved");
          const updatedAt = autosaveResponse.autosave.updatedAt
            ? new Date(autosaveResponse.autosave.updatedAt).toLocaleTimeString()
            : "now";
          setDraftAutosaveMessage(`Autosaved draft at ${updatedAt}`);
        })
        .catch(() => {
          if (autosaveSequenceRef.current !== autosaveSequence) return;
          setDraftAutosaveStatus("unavailable");
          setDraftAutosaveMessage("Disk autosave failed: using browser backup only");
        });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
    // draftAutosaveStatus is used as a guard; including it would reschedule autosave status updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectFilePath, activeProjectFileRevision, formattingConfig, frontMatter, questions, storageHydrated]);

  const totalMarks = questions.reduce((sum, question) => sum + questionMarks(question), 0);
  const canUndo = historyVersion >= 0 && undoStackRef.current.length > 0;
  const canRedo = historyVersion >= 0 && redoStackRef.current.length > 0;
  const showEditor = paneMode === "split";
  const showAssistant = paneMode === "assistant";
  const showPreview = true;
  const darkMode = theme === "dark";
  const currentPageFormat = useMemo(() => pageFormatFromConfig(formattingConfig), [formattingConfig]);
  const previewFitScale = useMemo(() => {
    if (!previewViewport.width) return 1;
    const widthScale = (previewViewport.width - PREVIEW_FIT_PADDING_PX) / currentPageFormat.widthPx;
    return clamp(Math.min(widthScale, MAX_PREVIEW_FIT_SCALE), MIN_PREVIEW_SCALE, MAX_PREVIEW_FIT_SCALE);
  }, [currentPageFormat.widthPx, previewViewport.width]);
  const previewMaxZoom = useMemo(() => {
    if (!previewViewport.width || previewFitScale <= 0) return 1;
    const maxTotalScale = MAX_PREVIEW_FIT_SCALE;
    return clampPreviewZoom(maxTotalScale / previewFitScale);
  }, [previewFitScale, previewViewport.width]);
  const previewLayoutScale = previewFitScale * previewZoomRef.current;
  const workspaceStyle = useMemo(
    () => ({
      gridTemplateColumns: paneMode === "preview" ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)",
    }),
    [paneMode],
  );
  const appShellStyle = useMemo(
    () => ({
      gridTemplateColumns: tocOpen ? "3.25rem minmax(15rem, 18rem) minmax(0, 1fr)" : "3.25rem minmax(0, 1fr)",
    }),
    [tocOpen],
  );
  const documentTocItems = useMemo(() => buildDocumentToc(frontMatter, questions, showSolutions), [frontMatter, questions, showSolutions]);
  const solutionValidation = useMemo(() => validateSolutionCompleteness(frontMatter, questions), [frontMatter, questions]);
  const printModeLabel = showSolutions ? "Solutions" : "Student";
  const printModeTitle = showSolutions
    ? "Print output is currently the solutions copy. Hide solutions before printing the student copy."
    : "Print output is currently the student copy. Show solutions before printing the solutions copy.";
  const activePreviewAnchor = useMemo(() => {
    if (activeTocItemId.startsWith("pb:")) return undefined;
    const activeItem = documentTocItems.find((item) => item.id === activeTocItemId || item.editorAnchor === activeTocItemId);
    return activeItem?.previewAnchor ?? activeTocItemId;
  }, [activeTocItemId, documentTocItems]);
  const currentDocumentFingerprint = useMemo(
    () => editorDocumentFingerprint(frontMatter, questions, formattingConfig, selectedLogoForFrontMatter(logos, frontMatter)),
    [formattingConfig, frontMatter, logos, questions],
  );
  const hasUnsavedProjectChanges = Boolean(activeProjectFilePath && lastProjectSaveFingerprint !== currentDocumentFingerprint);
  const activeProjectFileSummary = activeProjectFilePath ? projectFiles.find((file) => file.path === activeProjectFilePath) : undefined;
  const activeProjectTestPath = activeProjectFilePath ? testPathFromProjectPath(activeProjectFilePath) : null;
  const activeProjectPathLabel = activeProjectFilePath
    ? activeProjectTestPath
      ? `${TEST_FILE_ROOT_LABEL}/${activeProjectTestPath}`
      : activeProjectFilePath
    : "";
  const activeProjectRevisionIssue =
    activeProjectFilePath && projectSaveConflict?.filePath === activeProjectFilePath
      ? projectSaveConflict
      : activeProjectFilePath && activeProjectFileRevision === null
        ? missingProjectRevisionConflict(activeProjectFilePath)
        : null;
  const activeProjectSavedAt = formatShortDateTime(activeProjectFileSummary?.updatedAt);
  const draftBackupSummary = draftBackupStatusSummary(draftAutosaveStatus, draftAutosaveMessage);
  const currentProjectFileName = activeProjectFilePath
    ? testFileDisplayName(testPathBasename(testPathFromProjectPath(activeProjectFilePath) ?? activeProjectFilePath))
    : "Untitled test";
  const fileOperationBusy = projectFilesStatus === "saving" || projectFilesStatus === "loading";
  const headerFileStatusMessage = fileOperationBusy
    ? projectFilesMessage || "Working with files"
    : activeProjectFilePath
      ? activeProjectRevisionIssue
        ? "File changed outside app · reload or Save as"
        : hasUnsavedProjectChanges
          ? `Unsaved file changes · ${draftBackupSummary}`
          : `Saved to file${activeProjectSavedAt ? ` · ${activeProjectSavedAt}` : ""}`
      : `New file not saved · ${draftBackupSummary}`;
  const headerFileStatusTitle = fileOperationBusy
    ? [projectFilesMessage || "Working with files", activeProjectPathLabel ? `Current file: ${activeProjectPathLabel}` : ""]
        .filter(Boolean)
        .join("\n")
    : activeProjectFilePath
      ? [
          `File: ${currentProjectFileName}`,
          `Path: ${activeProjectPathLabel}`,
          activeProjectRevisionIssue
            ? [
                `File save: ${activeProjectRevisionIssue.message}`,
                typeof activeProjectRevisionIssue.localRevision === "number"
                  ? `Loaded revision: ${activeProjectRevisionIssue.localRevision}`
                  : "",
                typeof activeProjectRevisionIssue.currentRevision === "number"
                  ? `Disk revision: ${activeProjectRevisionIssue.currentRevision}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n")
            : hasUnsavedProjectChanges
              ? "File save: unsaved changes. Press Save to write the project file."
              : `File save: saved${activeProjectSavedAt ? ` ${activeProjectSavedAt}` : ""}`,
          `Draft backup: ${draftBackupSummary}`,
        ].join("\n")
      : [
          `File: ${currentProjectFileName}`,
          "File save: not saved yet. Press Save or Save as to create a project file.",
          `Draft backup: ${draftBackupSummary}`,
        ].join("\n");
  const headerStorageStatus: HeaderSaveStatus = fileOperationBusy
    ? "saving"
    : activeProjectFilePath
      ? activeProjectRevisionIssue
        ? "conflict"
        : hasUnsavedProjectChanges
          ? "dirty"
          : "saved"
      : draftAutosaveStatus === "saved"
        ? "draft"
        : draftAutosaveStatus;
  const activeQuestion = questions.find((question) => question.id === activeQuestionId) ?? null;
  const editingFrontMatter = activeTocItemId === SCROLL_ANCHOR_FRONT_MATTER;
  const pageBreakQuestionIds = useMemo(() => pageBreakQuestionIdSet(questions), [questions]);
  const activePageBreakQuestionId = pageBreakQuestionIdFromScrollAnchor(activeTocItemId);
  const activePageBreakQuestion = questions.find((question) => question.id === activePageBreakQuestionId) ?? null;
  const editingPageBreak = Boolean(activePageBreakQuestion && questionHasPageBreak(activePageBreakQuestion));

  useLayoutEffect(() => {
    frontMatterRef.current = frontMatter;
    formattingConfigRef.current = formattingConfig;
    questionsRef.current = questions;
    logosRef.current = logos;
    legacySavedTestsRef.current = legacySavedTests;
    activeProjectFilePathRef.current = activeProjectFilePath;
    activeProjectFileRevisionRef.current = activeProjectFileRevision;
  }, [activeProjectFilePath, activeProjectFileRevision, formattingConfig, frontMatter, legacySavedTests, logos, questions]);

  useEffect(() => {
    if (!questions.length) {
      setActiveQuestionId("");
      setActiveTocItemId(SCROLL_ANCHOR_FRONT_MATTER);
      setActiveRailItemId(SCROLL_ANCHOR_FRONT_MATTER);
      return;
    }

    if (activePageBreakQuestionId) {
      const fallbackQuestion = questions.find((question) => question.id === activePageBreakQuestionId) ?? questions[0];
      const fallbackAnchor = questionScrollAnchor(fallbackQuestion.id);
      setActiveQuestionId(fallbackQuestion.id);
      setActiveTocItemId(fallbackAnchor);
      return;
    }

    const nextActiveQuestionId = existingOrFirstQuestionId(questions, activeQuestionId);
    if (nextActiveQuestionId !== activeQuestionId) {
      const nextAnchor = questionScrollAnchor(nextActiveQuestionId);
      setActiveQuestionId(nextActiveQuestionId);
      setActiveTocItemId(nextAnchor);
      setActiveRailItemId(nextAnchor);
    }
  }, [activePageBreakQuestionId, activeQuestionId, questions]);

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
    if (!previewPane || !showPreview) return;

    const updatePreviewViewport = () => {
      setPreviewViewport({ width: previewPaneContentWidth(previewPane), height: previewPaneContentHeight(previewPane) });
    };

    updatePreviewViewport();
    const observer = new ResizeObserver(updatePreviewViewport);
    observer.observe(previewPane);
    return () => observer.disconnect();
  }, [showPreview]);

  useLayoutEffect(() => {
    const previewPane = previewPaneRef.current;
    if (!previewPane || !showPreview || paneMode !== "split") return;
    syncPreviewSelection(previewPane, activePreviewAnchor);
  }, [activePreviewAnchor, frontMatter, formattingConfig, paneMode, questions, showPreview, showSolutions]);

  useEffect(() => {
    const previewPane = previewPaneRef.current;
    if (!previewPane || !showPreview) return;
    let previewZoomFrameId: number | null = null;
    let pendingPreviewScrollTarget: { scrollLeft: number; scrollTop: number } | null = null;

    const schedulePreviewZoomStateSync = (nextZoom: number) => {
      if (previewZoomStateSyncTimerRef.current) window.clearTimeout(previewZoomStateSyncTimerRef.current);
      previewZoomStateSyncTimerRef.current = window.setTimeout(() => {
        previewZoomStateSyncTimerRef.current = null;
        setPreviewZoom((currentZoom) => (currentZoom === nextZoom ? currentZoom : nextZoom));
      }, PREVIEW_ZOOM_STATE_SYNC_DELAY_MS);
    };

    const applyPreviewZoom = (nextZoom: number, point: { clientX: number; clientY: number }) => {
      const currentZoom = previewZoomRef.current;
      const clampedZoom = clampPreviewZoom(nextZoom, previewMaxZoom);
      if (clampedZoom === currentZoom) return;
      const previewRoot = previewPane.querySelector<HTMLElement>(".a4-preview-root");
      const nextScale = previewFitScale * clampedZoom;
      pendingPreviewScrollTarget = previewZoomScrollTarget({
        previewPane,
        currentScale: previewFitScale * currentZoom,
        nextScale,
        point,
        currentScrollLeft: pendingPreviewScrollTarget?.scrollLeft,
        currentScrollTop: pendingPreviewScrollTarget?.scrollTop,
      });

      previewZoomRef.current = clampedZoom;
      if (previewRoot) {
        applyPreviewScaleStyle(previewRoot, currentPageFormat, nextScale);
        schedulePreviewZoomStateSync(clampedZoom);
      } else {
        setPreviewZoom(clampedZoom);
      }

      if (previewZoomFrameId !== null) return;
      previewZoomFrameId = window.requestAnimationFrame(() => {
        previewZoomFrameId = null;
        const target = pendingPreviewScrollTarget;
        pendingPreviewScrollTarget = null;
        if (!target) return;
        previewPane.scrollLeft = clamp(target.scrollLeft, 0, horizontalScrollableRange(previewPane));
        previewPane.scrollTop = clamp(target.scrollTop, 0, scrollableRange(previewPane));
      });
    };

    const handlePreviewWheel = (event: globalThis.WheelEvent) => {
      const zoomRequested = event.ctrlKey || event.metaKey || event.altKey;
      if (!zoomRequested) return;

      event.preventDefault();
      const delta = normalizedPreviewWheelDelta(event, previewPane.clientHeight);
      applyPreviewZoom(
        previewZoomRef.current * Math.exp(-delta * PREVIEW_WHEEL_ZOOM_SENSITIVITY),
        previewPointFromEvent(event, previewPane),
      );
    };

    const handleGestureStart = (event: Event) => {
      event.preventDefault();
      previewGestureStartZoomRef.current = previewZoomRef.current;
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as SafariGestureEvent;
      const scale = Number(gestureEvent.scale);
      if (!Number.isFinite(scale) || scale <= 0) return;
      event.preventDefault();
      applyPreviewZoom(previewGestureStartZoomRef.current * scale, previewPointFromEvent(gestureEvent, previewPane));
    };

    previewPane.addEventListener("wheel", handlePreviewWheel, { passive: false });
    previewPane.addEventListener("gesturestart", handleGestureStart, { passive: false });
    previewPane.addEventListener("gesturechange", handleGestureChange, { passive: false });

    return () => {
      previewPane.removeEventListener("wheel", handlePreviewWheel);
      previewPane.removeEventListener("gesturestart", handleGestureStart);
      previewPane.removeEventListener("gesturechange", handleGestureChange);
      if (previewZoomFrameId !== null) window.cancelAnimationFrame(previewZoomFrameId);
      if (previewZoomStateSyncTimerRef.current) {
        window.clearTimeout(previewZoomStateSyncTimerRef.current);
        previewZoomStateSyncTimerRef.current = null;
      }
    };
  }, [currentPageFormat, previewFitScale, previewMaxZoom, showPreview]);

  useLayoutEffect(() => {
    const previewPane = previewPaneRef.current;
    if (!previewPane) return;
    const previewRoot = previewPane.querySelector<HTMLElement>(".a4-preview-root");
    if (previewRoot) applyPreviewScaleStyle(previewRoot, currentPageFormat, previewFitScale * previewZoomRef.current);
    previewPane.scrollLeft = clamp(previewPane.scrollLeft, 0, horizontalScrollableRange(previewPane));
    previewPane.scrollTop = clamp(previewPane.scrollTop, 0, scrollableRange(previewPane));
  }, [currentPageFormat, previewFitScale, previewZoom]);

  useEffect(() => {
    const nextZoom = clampPreviewZoom(previewZoomRef.current, previewMaxZoom);
    if (nextZoom === previewZoomRef.current) return;
    previewZoomRef.current = nextZoom;
    setPreviewZoom(nextZoom);
  }, [previewMaxZoom]);

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

  useLayoutEffect(() => {
    if (!pendingEditorJumpAnchorRef.current && !pendingPreviewJumpAnchorRef.current) return;

    let firstFrame = 0;
    let secondFrame = 0;
    let retryFrame = 0;
    const jumpPendingAnchors = () => {
      let attemptedJump = false;
      const editorAnchor = pendingEditorJumpAnchorRef.current;
      const previewAnchor = pendingPreviewJumpAnchorRef.current;

      if (editorAnchor && showEditor && editorPaneRef.current) {
        attemptedJump = true;
        if (scrollToAnchorPosition(editorPaneRef.current, { anchor: editorAnchor, progress: 0 })) {
          pendingEditorJumpAnchorRef.current = null;
        }
      }

      if (previewAnchor && showPreview && previewPaneRef.current) {
        attemptedJump = true;
        if (scrollToAnchorPosition(previewPaneRef.current, { anchor: previewAnchor, progress: 0 })) {
          pendingPreviewJumpAnchorRef.current = null;
        }
      }

      return attemptedJump;
    };

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (!jumpPendingAnchors()) {
          retryFrame = window.requestAnimationFrame(() => {
            jumpPendingAnchors();
          });
        }
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.cancelAnimationFrame(retryFrame);
    };
  }, [showEditor, showPreview, previewFitScale, questions]);

  function currentEditorSnapshot(): EditorHistorySnapshot {
    return {
      frontMatter: frontMatterRef.current,
      questions: questionsRef.current,
      formattingConfig: formattingConfigRef.current,
    };
  }

  function pushEditorHistory() {
    undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), currentEditorSnapshot()];
    redoStackRef.current = [];
    setHistoryVersion((current) => current + 1);
  }

  function setQuestionsWithHistory(updater: QuestionBlock[] | ((current: QuestionBlock[]) => QuestionBlock[])) {
    pushEditorHistory();
    setQuestions((current) => (typeof updater === "function" ? updater(current) : updater));
  }

  function currentEditorDocument(): EditorDocumentState {
    return {
      frontMatter: frontMatterRef.current,
      questions: questionsRef.current,
      formattingConfig: formattingConfigRef.current,
    };
  }

  function setEditorDocumentWithHistory(document: {
    frontMatter: FrontMatterConfig;
    questions: QuestionBlock[];
    formattingConfig?: FormattingConfig;
  }) {
    const nextFormattingConfig = normalizeFormattingConfig(document.formattingConfig);
    pushEditorHistory();
    setFrontMatter(document.frontMatter);
    setQuestions(document.questions);
    setFormattingConfig(nextFormattingConfig);
    frontMatterRef.current = document.frontMatter;
    questionsRef.current = document.questions;
    formattingConfigRef.current = nextFormattingConfig;
  }

  function normalizeEditorFrontMatter(nextFrontMatter: FrontMatterConfig) {
    return normalizeFrontMatter(nextFrontMatter) ?? DEFAULT_FRONT_MATTER;
  }

  function normalizeEditorFormattingConfig(nextFormattingConfig?: FormattingConfig) {
    return normalizeFormattingConfig(nextFormattingConfig);
  }

  function editorDocumentActionOptions(): Omit<MauthDocumentActionOptions<QuestionBlock, FrontMatterConfig, FormattingConfig>, "dryRun"> {
    return {
      normalizeQuestion: withNormalizedQuestionOrder,
      normalizePart: (part) => withNormalizedPartOrder(part as EditorPart),
      normalizeFrontMatter: normalizeEditorFrontMatter,
      normalizeFormattingConfig: normalizeEditorFormattingConfig,
      validateSolutions: (nextQuestions: QuestionBlock[]) => validateSolutionCompleteness(frontMatterRef.current, nextQuestions),
      validateDocument: (document) => validateSolutionCompleteness(document.frontMatter, document.questions),
    };
  }

  function applyEditorAction(action: MauthAction): MauthActionResult<QuestionBlock> {
    const result = applyMauthAction<QuestionBlock>(questionsRef.current, action, {
      normalizeQuestion: withNormalizedQuestionOrder,
      normalizePart: (part) => withNormalizedPartOrder(part as EditorPart),
      validateSolutions: (nextQuestions) => validateSolutionCompleteness(frontMatterRef.current, nextQuestions),
    });
    if (result.ok && result.changedIds.length) {
      setQuestionsWithHistory(result.questions);
    }
    return result;
  }

  function applyEditorDocumentAction(
    action: MauthDocumentAction,
  ): MauthDocumentActionResult<QuestionBlock, FrontMatterConfig, FormattingConfig> {
    const result = applyMauthDocumentAction<QuestionBlock, FrontMatterConfig, FormattingConfig>(
      currentEditorDocument(),
      action,
      editorDocumentActionOptions(),
    );
    if (result.ok && result.changedIds.length) {
      setEditorDocumentWithHistory(result.document);
    }
    return result;
  }

  function previewEditorDocumentActions(
    actions: MauthDocumentAction[],
  ): MauthDocumentActionResult<QuestionBlock, FrontMatterConfig, FormattingConfig> {
    return previewMauthDocumentActions<QuestionBlock, FrontMatterConfig, FormattingConfig>(
      currentEditorDocument(),
      actions,
      editorDocumentActionOptions(),
    );
  }

  function applyEditorDocumentActions(
    actions: MauthDocumentAction[],
  ): MauthDocumentActionResult<QuestionBlock, FrontMatterConfig, FormattingConfig> {
    const result = applyMauthDocumentActions<QuestionBlock, FrontMatterConfig, FormattingConfig>(
      currentEditorDocument(),
      actions,
      editorDocumentActionOptions(),
    );
    if (result.ok && result.changedIds.length) {
      setEditorDocumentWithHistory(result.document);
    }
    return result;
  }

  function applyEditorActions(actions: MauthAction[]): MauthActionResult<QuestionBlock> {
    const result = applyMauthActions<QuestionBlock>(questionsRef.current, actions, {
      normalizeQuestion: withNormalizedQuestionOrder,
      normalizePart: (part) => withNormalizedPartOrder(part as EditorPart),
      validateSolutions: (nextQuestions) => validateSolutionCompleteness(frontMatterRef.current, nextQuestions),
    });
    if (result.ok && result.changedIds.length) {
      setQuestionsWithHistory(result.questions);
    }
    return result;
  }

  function readActionProposalActions(): MauthDocumentAction[] | null {
    try {
      return parseMauthDocumentActionProposal(actionProposalText);
    } catch (error) {
      setActionProposalResult(null);
      setActionProposalMessage(error instanceof Error ? error.message : "Invalid action proposal JSON.");
      return null;
    }
  }

  function previewActionProposal() {
    const actions = readActionProposalActions();
    if (!actions) return;
    const result = previewEditorDocumentActions(actions);
    setActionProposalResult(result);
    setActionProposalMessage(
      result.ok && result.preview?.valid
        ? `Dry run valid: ${result.preview.requestedActionCount} action${result.preview.requestedActionCount === 1 ? "" : "s"} checked.`
        : result.error || result.preview?.error || "Dry run found an issue.",
    );
  }

  function applyActionProposal() {
    const actions = readActionProposalActions();
    if (!actions) return;
    const previewResult = previewEditorDocumentActions(actions);
    setActionProposalResult(previewResult);
    if (!previewResult.ok || !previewResult.preview?.valid) {
      setActionProposalMessage(previewResult.error || previewResult.preview?.error || "Dry run failed. Nothing was applied.");
      return;
    }

    const result = applyEditorDocumentActions(actions);
    setActionProposalResult({ ...result, preview: previewResult.preview });
    setActionProposalMessage(
      result.ok
        ? `Applied ${actions.length} action${actions.length === 1 ? "" : "s"}${result.changedIds.length ? `, changed ${result.changedIds.length} item${result.changedIds.length === 1 ? "" : "s"}` : ""}.`
        : result.error || "Action proposal failed. Nothing was applied.",
    );
  }

  function clearActionProposal() {
    setActionProposalText("");
    setActionProposalMessage("");
    setActionProposalResult(null);
  }

  function commitAssistantDocument(document: {
    frontMatter: FrontMatterConfig;
    questions: QuestionBlock[];
    formattingConfig?: FormattingConfig;
  }) {
    setEditorDocumentWithHistory({
      frontMatter: normalizeEditorFrontMatter(document.frontMatter),
      questions: normalizeQuestionBlocks(document.questions),
      formattingConfig: normalizeEditorFormattingConfig(document.formattingConfig),
    });
  }

  function serializeAssistantDocument(document: {
    frontMatter: FrontMatterConfig;
    questions: QuestionBlock[];
    formattingConfig?: FormattingConfig;
  }) {
    const filePath = activeProjectFilePathRef.current ?? "";
    const currentLogo = selectedLogoForFrontMatter(logosRef.current, document.frontMatter);
    const nextFormattingConfig = normalizeEditorFormattingConfig(document.formattingConfig);
    const savedTest = createSavedTestSnapshot({
      testId: filePath ? `project-file:${filePath}` : id("assistant-test"),
      name: filePath
        ? testFileDisplayName(testPathBasename(testPathFromProjectPath(filePath) ?? filePath))
        : defaultSavedTestName(document.frontMatter),
      frontMatter: document.frontMatter,
      questions: document.questions,
      formattingConfig: nextFormattingConfig,
      logo: currentLogo,
    });
    return JSON.stringify(savedTest, null, 2);
  }

  function currentAssistantDocumentFingerprint() {
    return editorDocumentFingerprint(
      frontMatterRef.current,
      questionsRef.current,
      formattingConfigRef.current,
      selectedLogoForFrontMatter(logosRef.current, frontMatterRef.current),
    );
  }

  function parseAssistantProjectDocument(document: ProjectFileDocument): EditorDocumentState {
    const parsed = document.content ? (JSON.parse(document.content) as unknown) : null;
    const savedTest = normalizeSavedTest(parsed);
    if (!savedTest) throw new Error("Unsupported project file.");
    if (savedTest.logo) {
      setLogos((current) => {
        const next = mergeLogoAssets(current, [savedTest.logo as LogoAsset]);
        if (next !== current) {
          logosRef.current = next;
          persistLogoLibrary(next);
        }
        return next;
      });
      writeLogoToDisk(savedTest.logo);
    }
    return {
      frontMatter: cloneSerializable(savedTest.frontMatter),
      questions: normalizeQuestionBlocks(savedTest.questions),
      formattingConfig: normalizeFormattingConfig(savedTest.formattingConfig),
    };
  }

  function restoreEditorSnapshot(snapshot: EditorHistorySnapshot) {
    const nextActiveQuestionId = existingOrFirstQuestionId(snapshot.questions, activeQuestionId);
    const snapshotLogo = "logo" in snapshot ? normalizeLogoAsset(snapshot.logo) : undefined;
    if (snapshotLogo) {
      setLogos((current) => {
        const next = mergeLogoAssets(current, [snapshotLogo]);
        if (next !== current) {
          logosRef.current = next;
          persistLogoLibrary(next);
        }
        return next;
      });
      writeLogoToDisk(snapshotLogo);
    }
    setFrontMatter(snapshot.frontMatter);
    setQuestions(snapshot.questions);
    setFormattingConfig(snapshot.formattingConfig);
    frontMatterRef.current = snapshot.frontMatter;
    questionsRef.current = snapshot.questions;
    formattingConfigRef.current = snapshot.formattingConfig;
    if (nextActiveQuestionId !== activeQuestionId) {
      const nextAnchor = nextActiveQuestionId ? questionScrollAnchor(nextActiveQuestionId) : SCROLL_ANCHOR_FRONT_MATTER;
      setActiveQuestionId(nextActiveQuestionId);
      setActiveTocItemId(nextAnchor);
      setActiveRailItemId(nextAnchor);
    } else {
      const activeTocQuestionId = questionIdFromScrollAnchor(activeTocItemId);
      if (activeTocQuestionId && !snapshot.questions.some((question) => question.id === activeTocQuestionId)) {
        const nextAnchor = nextActiveQuestionId ? questionScrollAnchor(nextActiveQuestionId) : SCROLL_ANCHOR_FRONT_MATTER;
        setActiveTocItemId(nextAnchor);
        setActiveRailItemId(nextAnchor);
      }
    }
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedSubsection(null);
    setDragOverSubsection(null);
  }

  function undoEdit() {
    const snapshot = undoStackRef.current.at(-1);
    if (!snapshot) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current.slice(-(HISTORY_LIMIT - 1)), currentEditorSnapshot()];
    restoreEditorSnapshot(snapshot);
    setHistoryVersion((current) => current + 1);
  }

  function redoEdit() {
    const snapshot = redoStackRef.current.at(-1);
    if (!snapshot) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), currentEditorSnapshot()];
    restoreEditorSnapshot(snapshot);
    setHistoryVersion((current) => current + 1);
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

  function updateFormattingConfig(patch: Partial<FormattingConfig>) {
    applyEditorDocumentAction({ type: "formatting.update", patch: patch as Record<string, unknown> });
  }

  function updatePageFormat(patch: Partial<NonNullable<FormattingConfig["page"]>>) {
    applyEditorDocumentAction({ type: "pageFormat.update", patch: patch as Record<string, unknown> });
  }

  function resetTestFormat() {
    applyEditorDocumentAction({
      type: "formatting.update",
      patch: cloneSerializable(DEFAULT_FORMATTING_CONFIG) as Record<string, unknown>,
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

  function saveCurrentTest() {
    void saveCurrentTestToProjectFile("");
  }

  function startNewTest() {
    setNewTestDialogOpen(true);
  }

  function createNewTestFromTemplate(template: TitlePageTemplate) {
    pushEditorHistory();
    const currentLogo = selectedLogoFromLibrary(logos, frontMatter.logoId);
    const frontMatterTemplate = template === "exam" ? DEFAULT_EXAM_FRONT_MATTER : DEFAULT_FRONT_MATTER;
    const nextFrontMatter = {
      ...cloneSerializable(frontMatterTemplate),
      logoId: currentLogo.id,
      schoolName: currentLogo.schoolName ?? frontMatter.schoolName,
    };
    const nextQuestions = [createQuestion()];
    const nextFormattingConfig = {
      ...cloneSerializable(DEFAULT_FORMATTING_CONFIG),
      id: NEW_TEST_TEMPLATES.find((item) => item.id === template)?.formatPresetId ?? DEFAULT_FORMATTING_CONFIG.id,
    };
    const nextAnchor = questionScrollAnchor(nextQuestions[0].id);

    setFrontMatter(nextFrontMatter);
    setQuestions(nextQuestions);
    setFormattingConfig(nextFormattingConfig);
    frontMatterRef.current = nextFrontMatter;
    questionsRef.current = nextQuestions;
    formattingConfigRef.current = nextFormattingConfig;
    activeProjectFilePathRef.current = null;
    activeProjectFileRevisionRef.current = null;
    setActiveProjectFilePath(null);
    setActiveProjectFileRevision(null);
    setProjectSaveConflict(null);
    setLastProjectSaveFingerprint(null);
    setActiveQuestionId(nextQuestions[0].id);
    setActiveTocItemId(nextAnchor);
    setActiveRailItemId(nextAnchor);
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setNewTestDialogOpen(false);
    setFileManagerOpen(false);
    queueDocumentJump(nextAnchor, nextAnchor);
  }

  async function writeCurrentTestProjectFile(filePath: string, testName: string) {
    setProjectFilesStatus("saving");
    setProjectFilesMessage("Saving");

    const project = activeProject ?? (await getDefaultProject());
    const loadedFilePath = activeProjectFilePathRef.current;
    const loadedRevision = loadedFilePath === filePath ? activeProjectFileRevisionRef.current : undefined;
    if (loadedFilePath === filePath && loadedRevision === null) {
      const conflict = missingProjectRevisionConflict(filePath);
      setProjectSaveConflict(conflict);
      setProjectFilesStatus("error");
      setProjectFilesMessage("Reload file before saving");
      throw new Error(PROJECT_FILE_REVISION_MISSING_ERROR);
    }

    const existingFile =
      loadedFilePath === filePath ? undefined : projectFiles.find((file) => file.kind === "file" && file.path === filePath);
    const currentLogo = selectedLogoForFrontMatter(logos, frontMatter);
    const savedTest = createSavedTestSnapshot({
      testId: `project-file:${filePath}`,
      name: testName,
      frontMatter,
      questions,
      formattingConfig,
      logo: currentLogo,
    });

    let savedDocument: ProjectFileDocument;
    const baseRevision = loadedRevision ?? existingFile?.revision ?? null;
    try {
      savedDocument = await saveProjectFile(project.id, filePath, {
        content: JSON.stringify(savedTest, null, 2),
        kind: "file",
        fileType: "test",
        metadata: {
          format: "saved-test-json",
          source: "mauth-studio",
        },
        baseRevision,
      });
    } catch (error) {
      const conflict = projectFileConflictFromError(error, filePath, baseRevision ?? null);
      if (conflict) {
        setProjectSaveConflict(conflict);
        setProjectFilesStatus("error");
        setProjectFilesMessage("File changed on disk");
        void refreshProjectFiles();
      }
      throw error;
    }

    const refreshedFiles = await listProjectFiles(project.id);
    setActiveProject(project);
    setProjectFiles(refreshedFiles.files);
    activeProjectFilePathRef.current = filePath;
    activeProjectFileRevisionRef.current = savedDocument.revision;
    setActiveProjectFilePath(filePath);
    setActiveProjectFileRevision(savedDocument.revision);
    setProjectSaveConflict(null);
    setLastProjectSaveFingerprint(editorDocumentFingerprint(frontMatter, questions, formattingConfig, currentLogo));
    setProjectFilesStatus("ready");
    setProjectFilesMessage(`Saved ${testFileDisplayName(testPathBasename(testPathFromProjectPath(filePath) ?? filePath))}`);
  }

  async function saveCurrentTestToProjectFile(folderPath = "") {
    let saveTargetPath = activeProjectFilePath;
    try {
      const defaultName =
        activeProjectFilePath && testPathFromProjectPath(activeProjectFilePath)
          ? testFileDisplayName(testPathBasename(testPathFromProjectPath(activeProjectFilePath) ?? ""))
          : defaultSavedTestName(frontMatter);
      let filePath = activeProjectFilePath;
      let testName = defaultName;

      if (!filePath) {
        const requestedName = window.prompt("File name", defaultName);
        if (requestedName === null) return;
        testName = safeProjectFileName(requestedName);
        filePath = projectPathForTestPath(joinTestPath(folderPath, ensureTestFileName(testName)));
      }

      saveTargetPath = filePath;
      await writeCurrentTestProjectFile(filePath, testName);
    } catch (error) {
      if (error instanceof Error && error.message === PROJECT_FILE_REVISION_MISSING_ERROR) return;
      const conflict = saveTargetPath ? projectFileConflictFromError(error, saveTargetPath, activeProjectFileRevisionRef.current) : null;
      if (conflict) {
        setProjectSaveConflict(conflict);
        setProjectFilesStatus("error");
        setProjectFilesMessage("File changed on disk");
        void refreshProjectFiles();
        return;
      }
      setProjectFilesStatus("error");
      setProjectFilesMessage("Save failed");
    }
  }

  function applySavedProjectDocument(project: ProjectSummary, filePath: string, savedTest: SavedTest, revision: number | null) {
    pushEditorHistory();
    const nextFrontMatter = cloneSerializable(savedTest.frontMatter);
    const nextQuestions = normalizeQuestionBlocks(savedTest.questions);
    const nextFormattingConfig = normalizeFormattingConfig(savedTest.formattingConfig);
    setFrontMatter(nextFrontMatter);
    setQuestions(nextQuestions);
    setFormattingConfig(nextFormattingConfig);
    frontMatterRef.current = nextFrontMatter;
    questionsRef.current = nextQuestions;
    formattingConfigRef.current = nextFormattingConfig;
    setActiveQuestionId(firstQuestionId(nextQuestions));
    setActiveTocItemId(firstQuestionAnchor(nextQuestions));
    setActiveRailItemId(firstQuestionAnchor(nextQuestions));
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setActiveProject(project);
    activeProjectFilePathRef.current = filePath;
    activeProjectFileRevisionRef.current = revision;
    setActiveProjectFilePath(filePath);
    setActiveProjectFileRevision(revision);
    setProjectSaveConflict(null);
    setLastProjectSaveFingerprint(
      editorDocumentFingerprint(
        nextFrontMatter,
        nextQuestions,
        nextFormattingConfig,
        savedTest.logo ?? selectedLogoFromLibrary(logosRef.current, nextFrontMatter.logoId),
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

  async function openProjectFile(filePath: string) {
    try {
      const project = activeProject ?? (await getDefaultProject());
      const summary = projectFiles.find((file) => file.path === filePath);
      if (summary && !isProjectTestFile(summary)) {
        setProjectFilesMessage("Only test files can be opened");
        return;
      }
      if (!summary && !filePath.endsWith(".test.json")) {
        setProjectFilesMessage("Only test files can be opened");
        return;
      }

      const fileName = testFileDisplayName(testPathBasename(testPathFromProjectPath(filePath) ?? filePath));
      if (hasUnsavedProjectChanges && activeProjectFilePath) {
        await writeCurrentTestProjectFile(activeProjectFilePath, currentProjectFileName);
      }

      setProjectFilesStatus("loading");
      setProjectFilesMessage(`Opening ${fileName}`);
      const document = await getProjectFile(project.id, filePath);
      const parsed = document.content ? (JSON.parse(document.content) as unknown) : null;
      const savedTest = normalizeSavedTest(parsed);
      if (!savedTest) throw new Error("Unsupported project file");

      applySavedProjectDocument(project, filePath, savedTest, document.revision);
      setProjectFilesStatus("ready");
      setProjectFilesMessage(`Opened ${fileName}`);
      setFileManagerOpen(false);
    } catch (error) {
      if (error instanceof Error && error.message === PROJECT_FILE_REVISION_MISSING_ERROR) return;
      const conflictTarget = activeProjectFilePath ?? filePath;
      const conflict = projectFileConflictFromError(error, conflictTarget, activeProjectFileRevisionRef.current);
      if (conflict) {
        setProjectSaveConflict(conflict);
        setProjectFilesStatus("error");
        setProjectFilesMessage("File changed on disk");
        void refreshProjectFiles();
        return;
      }
      setProjectFilesStatus("error");
      setProjectFilesMessage("Open failed");
    }
  }

  async function loadProjectFileVersions(filePath: string) {
    const project = activeProject ?? (await getDefaultProject());
    const response = await listProjectFileVersions(project.id, filePath);
    setActiveProject(project);
    return response.versions;
  }

  async function restoreProjectFileFromVersion(filePath: string, versionId: string) {
    setProjectFilesStatus("saving");
    setProjectFilesMessage("Restoring version");
    const project = activeProject ?? (await getDefaultProject());
    const restoredDocument = await restoreProjectFileVersion(project.id, filePath, versionId);
    const refreshedFiles = await listProjectFiles(project.id);
    setActiveProject(project);
    setProjectFiles(refreshedFiles.files);

    if (activeProjectFilePath === filePath) {
      const parsed = restoredDocument.content ? (JSON.parse(restoredDocument.content) as unknown) : null;
      const savedTest = normalizeSavedTest(parsed);
      if (!savedTest) throw new Error("Unsupported project file");
      applySavedProjectDocument(project, filePath, savedTest, restoredDocument.revision);
    }

    setProjectFilesStatus("ready");
    setProjectFilesMessage(`Restored ${testFileDisplayName(testPathBasename(testPathFromProjectPath(filePath) ?? filePath))}`);
  }

  async function createProjectFolder(folderPath: string) {
    const requestedName = window.prompt("Folder name", "New folder");
    if (requestedName === null) return;
    const folderName = safeProjectFileName(requestedName);
    if (!folderName) return;
    const testPath = joinTestPath(folderPath, folderName);
    const filePath = projectPathForTestPath(testPath);
    if (projectFiles.some((file) => file.path.toLowerCase() === filePath.toLowerCase())) {
      window.alert("A file or folder with that name already exists.");
      return;
    }

    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage("Creating folder");
      const project = activeProject ?? (await getDefaultProject());
      await saveProjectFile(project.id, filePath, { kind: "folder", fileType: "folder" });
      const refreshedFiles = await listProjectFiles(project.id);
      setActiveProject(project);
      setProjectFiles(refreshedFiles.files);
      setProjectFilesStatus("ready");
      setProjectFilesMessage(`Created ${folderName}`);
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Folder create failed");
    }
  }

  async function exportCurrentProjectBackup() {
    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage("Preparing backup");

      if (activeProjectFilePath && hasUnsavedProjectChanges) {
        await writeCurrentTestProjectFile(activeProjectFilePath, currentProjectFileName);
      } else if (!activeProjectFilePath) {
        const shouldSaveDraft = window.confirm(
          `This test is not saved as a file yet. Save it into ${TEST_FILE_ROOT_LABEL} before creating the backup?`,
        );
        if (shouldSaveDraft) {
          await saveCurrentTestToProjectFile("");
        }
      }

      const project = activeProject ?? (await getDefaultProject());
      const backup = await downloadProjectBackup(project.id);
      const url = window.URL.createObjectURL(backup.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = backup.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      const refreshedFiles = await listProjectFiles(project.id);
      setActiveProject(project);
      setProjectFiles(refreshedFiles.files);
      setProjectFilesStatus("ready");
      setProjectFilesMessage(`Created backup ${backup.fileName}`);
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Backup failed");
    }
  }

  async function importProjectBackupFile(file: File) {
    const shouldImport = window.confirm(
      `Import "${file.name}"? Existing files will not be overwritten; matching file names are imported with a new name.`,
    );
    if (!shouldImport) return;

    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage("Importing backup");
      const project = activeProject ?? (await getDefaultProject());
      const result = await importProjectBackup(project.id, file);
      const refreshedFiles = await listProjectFiles(project.id);
      await refreshLogoLibraryFromDisk();
      setActiveProject(project);
      setProjectFiles(refreshedFiles.files);
      setProjectFilesStatus("ready");
      setProjectFilesMessage(
        `Imported ${result.importedFiles} file${result.importedFiles === 1 ? "" : "s"}, ${result.importedFolders} folder${
          result.importedFolders === 1 ? "" : "s"
        }, ${result.importedLogos} logo${result.importedLogos === 1 ? "" : "s"}`,
      );
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Import failed");
    }
  }

  async function copyProjectItem(projectId: string, sourcePath: string, targetPath: string, files: ProjectFileSummary[]) {
    const source = files.find((file) => file.path === sourcePath);
    if (!source) throw new Error("Missing source file");

    if (source.kind === "folder") {
      await saveProjectFile(projectId, targetPath, { kind: "folder", fileType: "folder", metadata: source.metadata });
      const descendants = files
        .filter((file) => file.path.startsWith(`${sourcePath}/`))
        .sort((left, right) => {
          if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
          return left.path.localeCompare(right.path);
        });
      for (const descendant of descendants) {
        const descendantTargetPath = `${targetPath}${descendant.path.slice(sourcePath.length)}`;
        if (descendant.kind === "folder") {
          await saveProjectFile(projectId, descendantTargetPath, {
            kind: "folder",
            fileType: "folder",
            metadata: descendant.metadata,
          });
        } else {
          const document = await getProjectFile(projectId, descendant.path);
          await saveProjectFile(projectId, descendantTargetPath, {
            content: document.content ?? "",
            kind: "file",
            fileType: document.fileType ?? "test",
            metadata: document.metadata,
          });
        }
      }
      return;
    }

    const document = await getProjectFile(projectId, sourcePath);
    await saveProjectFile(projectId, targetPath, {
      content: document.content ?? "",
      kind: "file",
      fileType: document.fileType ?? "test",
      metadata: document.metadata,
    });
  }

  async function duplicateProjectFiles(filePaths: string[]) {
    const sourcePaths = topLevelProjectPaths(filePaths);
    if (!sourcePaths.length) return;

    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage(sourcePaths.length === 1 ? "Duplicating" : `Duplicating ${sourcePaths.length} items`);
      const project = activeProject ?? (await getDefaultProject());
      if (
        activeProjectFilePath &&
        hasUnsavedProjectChanges &&
        sourcePaths.some((sourcePath) => projectPathContains(sourcePath, activeProjectFilePath))
      ) {
        await writeCurrentTestProjectFile(activeProjectFilePath, currentProjectFileName);
      }
      let currentFiles = (await listProjectFiles(project.id)).files;
      let duplicatedCount = 0;
      let openedDuplicatePath: string | null = null;
      let openedDuplicateFingerprint: string | null = null;
      let openedDuplicateRevision: number | null = null;

      for (const filePath of sourcePaths) {
        const source = currentFiles.find((file) => file.path === filePath);
        const sourceTestPath = testPathFromProjectPath(filePath);
        if (!source || sourceTestPath === null) continue;
        const parentPath = parentTestPath(sourceTestPath);
        const baseName =
          source.kind === "folder"
            ? `${testPathBasename(sourceTestPath)} copy`
            : `${testFileDisplayName(testPathBasename(sourceTestPath))} copy`;
        const targetTestPath = uniqueTestPath(currentFiles, parentPath, baseName, source.kind);
        const targetFilePath = projectPathForTestPath(targetTestPath);
        const duplicatingActiveEditor = sourcePaths.length === 1 && source.kind === "file" && filePath === activeProjectFilePath;
        if (duplicatingActiveEditor) {
          const currentLogo = selectedLogoForFrontMatter(logosRef.current, frontMatter);
          const savedTest = createSavedTestSnapshot({
            testId: `project-file:${targetFilePath}`,
            name: testFileDisplayName(testPathBasename(targetTestPath)),
            frontMatter,
            questions,
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
          openedDuplicatePath = targetFilePath;
          openedDuplicateFingerprint = editorDocumentFingerprint(frontMatter, questions, formattingConfig, currentLogo);
          openedDuplicateRevision = duplicatedDocument.revision;
        } else {
          await copyProjectItem(project.id, filePath, targetFilePath, currentFiles);
        }
        currentFiles = (await listProjectFiles(project.id)).files;
        duplicatedCount += 1;
      }

      const refreshedFiles = await listProjectFiles(project.id);
      setActiveProject(project);
      setProjectFiles(refreshedFiles.files);
      if (openedDuplicatePath) {
        activeProjectFilePathRef.current = openedDuplicatePath;
        activeProjectFileRevisionRef.current = openedDuplicateRevision;
        setActiveProjectFilePath(openedDuplicatePath);
        setActiveProjectFileRevision(openedDuplicateRevision);
        setProjectSaveConflict(null);
        setLastProjectSaveFingerprint(openedDuplicateFingerprint);
      }
      setProjectFilesStatus("ready");
      setProjectFilesMessage(
        openedDuplicatePath
          ? `Duplicated and opened ${testFileDisplayName(testPathBasename(testPathFromProjectPath(openedDuplicatePath) ?? openedDuplicatePath))}`
          : duplicatedCount === 1
            ? "Duplicated 1 item"
            : `Duplicated ${duplicatedCount} items`,
      );
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Duplicate failed");
    }
  }

  async function renameProjectFile(filePath: string) {
    const source = projectFiles.find((file) => file.path === filePath);
    const sourceTestPath = testPathFromProjectPath(filePath);
    if (!source || sourceTestPath === null) return;
    const currentName = source.kind === "folder" ? testPathBasename(sourceTestPath) : testFileDisplayName(testPathBasename(sourceTestPath));
    const requestedName = window.prompt("Rename", currentName);
    if (requestedName === null) return;
    const newName = source.kind === "folder" ? safeProjectFileName(requestedName) : ensureTestFileName(requestedName);
    if (!newName) return;
    const targetTestPath = joinTestPath(parentTestPath(sourceTestPath), newName);
    const targetFilePath = projectPathForTestPath(targetTestPath);
    if (targetFilePath === filePath) return;
    if (projectFiles.some((file) => file.path.toLowerCase() === targetFilePath.toLowerCase())) {
      window.alert("A file or folder with that name already exists.");
      return;
    }
    await moveProjectFileToPath(filePath, targetFilePath);
  }

  async function moveProjectFileToPath(filePath: string, targetFilePath: string) {
    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage("Moving");
      const project = activeProject ?? (await getDefaultProject());
      if (activeProjectFilePath && hasUnsavedProjectChanges && projectPathContains(filePath, activeProjectFilePath)) {
        await writeCurrentTestProjectFile(activeProjectFilePath, currentProjectFileName);
      }
      const currentFiles = await listProjectFiles(project.id);
      const source = currentFiles.files.find((file) => file.path === filePath);
      if (!source) return;
      await copyProjectItem(project.id, filePath, targetFilePath, currentFiles.files);
      await deleteProjectFile(project.id, filePath, source.revision);
      const refreshedFiles = await listProjectFiles(project.id);
      setActiveProject(project);
      setProjectFiles(refreshedFiles.files);
      const nextActiveFilePath = activeProjectFilePath
        ? activeProjectFilePath === filePath
          ? targetFilePath
          : source.kind === "folder" && activeProjectFilePath.startsWith(`${filePath}/`)
            ? `${targetFilePath}${activeProjectFilePath.slice(filePath.length)}`
            : activeProjectFilePath
        : null;
      activeProjectFilePathRef.current = nextActiveFilePath;
      setActiveProjectFilePath(nextActiveFilePath);
      if (nextActiveFilePath !== activeProjectFilePath) {
        const nextRevision = nextActiveFilePath
          ? (refreshedFiles.files.find((file) => file.path === nextActiveFilePath)?.revision ?? null)
          : null;
        activeProjectFileRevisionRef.current = nextRevision;
        setActiveProjectFileRevision(nextRevision);
        setProjectSaveConflict(null);
      }
      setProjectFilesStatus("ready");
      setProjectFilesMessage("Moved");
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Move failed");
    }
  }

  async function moveProjectFiles(filePaths: string[], targetFolderPath: string) {
    const sourcePaths = topLevelProjectPaths(filePaths);
    if (!sourcePaths.length) return;
    const targetFolder = normalizeTestFolderPath(targetFolderPath);

    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage(sourcePaths.length === 1 ? "Moving" : `Moving ${sourcePaths.length} items`);
      const project = activeProject ?? (await getDefaultProject());
      if (
        activeProjectFilePath &&
        hasUnsavedProjectChanges &&
        sourcePaths.some((sourcePath) => projectPathContains(sourcePath, activeProjectFilePath))
      ) {
        await writeCurrentTestProjectFile(activeProjectFilePath, currentProjectFileName);
      }
      const currentFiles = (await listProjectFiles(project.id)).files;
      const existingPaths = new Set(currentFiles.map((file) => file.path.toLowerCase()));
      const plannedTargets = new Set<string>();
      const plannedMoves: Array<{ source: ProjectFileSummary; sourcePath: string; targetPath: string }> = [];

      for (const filePath of sourcePaths) {
        const source = currentFiles.find((file) => file.path === filePath);
        const sourceTestPath = testPathFromProjectPath(filePath);
        if (!source || sourceTestPath === null) continue;
        if (source.kind === "folder" && (targetFolder === sourceTestPath || targetFolder.startsWith(`${sourceTestPath}/`))) {
          window.alert("A folder cannot be moved inside itself.");
          setProjectFilesStatus("ready");
          setProjectFilesMessage("");
          return;
        }

        const targetTestPath = [targetFolder, testPathBasename(sourceTestPath)].filter(Boolean).join("/");
        const targetFilePath = projectPathForTestPath(targetTestPath);
        const targetKey = targetFilePath.toLowerCase();
        if (targetFilePath === filePath) continue;
        if (existingPaths.has(targetKey) || plannedTargets.has(targetKey)) {
          window.alert("A file or folder with that name already exists in that folder.");
          setProjectFilesStatus("ready");
          setProjectFilesMessage("");
          return;
        }
        plannedTargets.add(targetKey);
        plannedMoves.push({ source, sourcePath: filePath, targetPath: targetFilePath });
      }

      if (!plannedMoves.length) {
        setProjectFilesStatus("ready");
        setProjectFilesMessage("");
        return;
      }

      for (const move of plannedMoves) {
        await copyProjectItem(project.id, move.sourcePath, move.targetPath, currentFiles);
      }
      for (const move of plannedMoves) {
        await deleteProjectFile(project.id, move.sourcePath, move.source.revision);
      }

      const refreshedFiles = await listProjectFiles(project.id);
      setActiveProject(project);
      setProjectFiles(refreshedFiles.files);
      const nextActiveFilePath = activeProjectFilePath
        ? (() => {
            for (const move of plannedMoves) {
              if (activeProjectFilePath === move.sourcePath) return move.targetPath;
              if (move.source.kind === "folder" && activeProjectFilePath.startsWith(`${move.sourcePath}/`)) {
                return `${move.targetPath}${activeProjectFilePath.slice(move.sourcePath.length)}`;
              }
            }
            return activeProjectFilePath;
          })()
        : null;
      activeProjectFilePathRef.current = nextActiveFilePath;
      setActiveProjectFilePath(nextActiveFilePath);
      if (nextActiveFilePath !== activeProjectFilePath) {
        const nextRevision = nextActiveFilePath
          ? (refreshedFiles.files.find((file) => file.path === nextActiveFilePath)?.revision ?? null)
          : null;
        activeProjectFileRevisionRef.current = nextRevision;
        setActiveProjectFileRevision(nextRevision);
        setProjectSaveConflict(null);
      }
      setProjectFilesStatus("ready");
      setProjectFilesMessage(plannedMoves.length === 1 ? "Moved 1 item" : `Moved ${plannedMoves.length} items`);
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Move failed");
    }
  }

  async function removeProjectFiles(filePaths: string[]) {
    const sourcePaths = topLevelProjectPaths(filePaths);
    const sources = sourcePaths
      .map((filePath) => {
        const source = projectFiles.find((file) => file.path === filePath);
        const sourceTestPath = testPathFromProjectPath(filePath);
        return source && sourceTestPath !== null ? { source, sourceTestPath, filePath } : null;
      })
      .filter((entry): entry is { source: ProjectFileSummary; sourceTestPath: string; filePath: string } => Boolean(entry));
    if (!sources.length) return;
    const shouldDelete =
      sources.length === 1
        ? window.confirm(
            `Delete "${
              sources[0].source.kind === "folder"
                ? testPathBasename(sources[0].sourceTestPath)
                : testFileDisplayName(testPathBasename(sources[0].sourceTestPath))
            }"?`,
          )
        : window.confirm(`Delete ${sources.length} selected items?`);
    if (!shouldDelete) return;
    try {
      setProjectFilesStatus("saving");
      setProjectFilesMessage("Deleting");
      const project = activeProject ?? (await getDefaultProject());
      const deletingActiveProjectFile = activeProjectFilePath
        ? sources.some(({ filePath }) => activeProjectFilePath === filePath || activeProjectFilePath.startsWith(`${filePath}/`))
        : false;
      for (const { filePath, source } of sources) {
        await deleteProjectFile(project.id, filePath, source.revision);
      }
      const refreshedFiles = await listProjectFiles(project.id);
      setActiveProject(project);
      setProjectFiles(refreshedFiles.files);
      const nextActiveFilePath =
        activeProjectFilePath &&
        sources.some(({ filePath }) => activeProjectFilePath === filePath || activeProjectFilePath.startsWith(`${filePath}/`))
          ? null
          : activeProjectFilePath;
      activeProjectFilePathRef.current = nextActiveFilePath;
      setActiveProjectFilePath(nextActiveFilePath);
      if (deletingActiveProjectFile) {
        activeProjectFileRevisionRef.current = null;
        setActiveProjectFileRevision(null);
        setProjectSaveConflict(null);
        setLastProjectSaveFingerprint(null);
      }
      setProjectFilesStatus("ready");
      setProjectFilesMessage(sources.length === 1 ? "Deleted 1 item" : `Deleted ${sources.length} items`);
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Delete failed");
    }
  }

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

  function jumpToSolutionValidationIssue(anchor: string) {
    setSolutionValidationOpen(false);
    if (!showEditor) setPaneMode("split");
    activateEditorAnchor(anchor);
    revealEditorAnchor(anchor);
    queueDocumentJump(anchor, anchor, { preservePaneMode: true });
  }

  function focusSolutionValidationAnchor(anchor: string) {
    if (!showEditor) setPaneMode("split");
    activateEditorAnchor(anchor);
    revealEditorAnchor(anchor);
    queueDocumentJump(anchor, anchor, { preservePaneMode: true });
  }

  function solutionValidationScope(question: QuestionBlock, parsed: ParsedScrollAnchor) {
    if (!parsed.questionId) return null;

    if (parsed.partId && parsed.subpartId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
      if (!part || !subpart) return null;
      return {
        scope: {
          kind: "subpart",
          questionId: parsed.questionId,
          partId: parsed.partId,
          subpartId: parsed.subpartId,
        } satisfies MauthContentScope,
        contentBlocks: subpart.contentBlocks,
      };
    }

    if (parsed.partId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      if (!part) return null;
      return {
        scope: { kind: "part", questionId: parsed.questionId, partId: parsed.partId } satisfies MauthContentScope,
        contentBlocks: part.contentBlocks,
      };
    }

    return {
      scope: { kind: "question", questionId: parsed.questionId } satisfies MauthContentScope,
      contentBlocks: question.contentBlocks,
    };
  }

  function solutionValidationFixActions(scope: MauthContentScope, contentBlocks: EditorContentBlock[], fix: SolutionValidationFix) {
    if (fix.kind === "add-slot") {
      return {
        actions: [{ type: "solutionSlot.add", scope, blocks: solutionSlotBlocks(fix.lines) } satisfies MauthAction],
        showSolutionsAfter: true,
      };
    }

    if (fix.kind === "add-solution") {
      return {
        actions: [
          {
            type: "module.add",
            scope,
            blocks: [textBlock(DEFAULT_SOLUTION_SLOT_TEXT, "solution")],
            placement: { blockId: fix.afterBlockId, position: "after" },
          } satisfies MauthAction,
        ],
        showSolutionsAfter: true,
      };
    }

    if (fix.kind === "add-student-space") {
      return {
        actions: [
          {
            type: "module.add",
            scope,
            blocks: [spaceBlock(fix.lines, "student")],
            placement: { blockId: fix.beforeBlockId, position: "before" },
          } satisfies MauthAction,
        ],
        showSolutionsAfter: true,
      };
    }

    const block = contentBlocks.find((current) => current.id === fix.blockId);
    if (block?.kind !== "space") return null;
    return {
      actions: [
        {
          type: "module.update",
          scope,
          blockId: fix.blockId,
          patch: { lines: Math.max(spaceLines(block.lines), fix.lines) },
        } satisfies MauthAction,
      ],
      showSolutionsAfter: false,
    };
  }

  function applySolutionValidationFix(issue: SolutionValidationIssue) {
    const fix = issue.fix;
    if (!fix) {
      jumpToSolutionValidationIssue(issue.anchor);
      return;
    }

    const parsed = parseScrollAnchor(issue.anchor);
    const question = parsed.questionId ? questions.find((current) => current.id === parsed.questionId) : null;
    if (!question || !parsed.questionId) {
      jumpToSolutionValidationIssue(issue.anchor);
      return;
    }

    const target = solutionValidationScope(question, parsed);
    const actionPatch = target ? solutionValidationFixActions(target.scope, target.contentBlocks, fix) : null;
    if (!actionPatch) {
      jumpToSolutionValidationIssue(issue.anchor);
      return;
    }

    const result = applyEditorActions(actionPatch.actions);
    if (!result.ok) {
      jumpToSolutionValidationIssue(issue.anchor);
      return;
    }

    if (actionPatch.showSolutionsAfter) setShowSolutions(true);
    focusSolutionValidationAnchor(issue.anchor);
  }

  function openSignalForAnchor(anchor: string) {
    return scrollAnchorContains(anchor, editorRevealRequest?.anchor) ? editorRevealRequest?.sequence : undefined;
  }

  function isActiveEditorAnchor(anchor: string) {
    return anchor === activeTocItemId;
  }

  function jumpPendingDocumentAnchors() {
    let attemptedJump = false;
    const editorAnchor = pendingEditorJumpAnchorRef.current;
    const previewAnchor = pendingPreviewJumpAnchorRef.current;

    if (editorAnchor && showEditor && editorPaneRef.current) {
      attemptedJump = true;
      if (scrollToAnchorPosition(editorPaneRef.current, { anchor: editorAnchor, progress: 0 })) {
        pendingEditorJumpAnchorRef.current = null;
      }
    }

    if (previewAnchor && showPreview && previewPaneRef.current) {
      attemptedJump = true;
      if (scrollToAnchorPosition(previewPaneRef.current, { anchor: previewAnchor, progress: 0 })) {
        pendingPreviewJumpAnchorRef.current = null;
      }
    }

    return attemptedJump;
  }

  function queueDocumentJump(editorAnchor: string, previewAnchor: string, options: { preservePaneMode?: boolean } = {}) {
    pendingEditorJumpAnchorRef.current = options.preservePaneMode && !showEditor ? null : editorAnchor;
    pendingPreviewJumpAnchorRef.current = options.preservePaneMode && !showPreview ? null : previewAnchor;

    if (!options.preservePaneMode && (!showEditor || !showPreview)) {
      setPaneMode("split");
    }

    window.requestAnimationFrame(() => {
      if (!jumpPendingDocumentAnchors()) {
        window.requestAnimationFrame(() => {
          jumpPendingDocumentAnchors();
        });
      }
    });
  }

  function queueEditorJump(editorAnchor: string) {
    pendingEditorJumpAnchorRef.current = editorAnchor;
    pendingPreviewJumpAnchorRef.current = null;

    window.requestAnimationFrame(() => {
      if (!jumpPendingDocumentAnchors()) {
        window.requestAnimationFrame(() => {
          jumpPendingDocumentAnchors();
        });
      }
    });
  }

  function tocItemForPreviewAnchor(anchor: string) {
    for (const fallback of scrollAnchorFallbacks(anchor)) {
      const item = documentTocItems.find((tocItem) => tocItem.previewAnchor === fallback || tocItem.editorAnchor === fallback);
      if (item) return item;
    }
    return null;
  }

  function openEditorFromPreviewAnchor(anchor: string) {
    if (!anchor || paneMode !== "split") return;
    const tocItem = tocItemForPreviewAnchor(anchor);
    const editorAnchor = tocItem?.editorAnchor ?? anchor;
    const activeAnchor = tocItem?.id ?? editorAnchor;
    setActiveTocItemId(activeAnchor);
    setActiveRailItemId(activeAnchor);
    revealEditorAnchor(editorAnchor);
    queueEditorJump(editorAnchor);
  }

  function handlePreviewPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (paneMode !== "split" || event.button !== 0) {
      previewEditClickStartRef.current = null;
      return;
    }
    previewEditClickStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
  }

  function handlePreviewClick(event: ReactMouseEvent<HTMLElement>) {
    const start = previewEditClickStartRef.current;
    previewEditClickStartRef.current = null;
    if (paneMode !== "split" || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (!start) return;

    const movement = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (movement > PREVIEW_EDIT_CLICK_MOVE_TOLERANCE_PX) return;

    const anchor = previewAnchorFromEventTarget(event.target, previewPaneRef.current);
    if (!anchor) return;
    openEditorFromPreviewAnchor(anchor);
  }

  function jumpToTocItem(item: DocumentTocItem) {
    setActiveTocItemId(item.id);
    setActiveRailItemId(item.id);
    const questionId = questionIdFromScrollAnchor(item.editorAnchor);
    if (questionId) selectQuestionInEditor(questionId);
    revealEditorAnchor(item.editorAnchor);
    queueDocumentJump(item.editorAnchor, item.previewAnchor);
  }

  function jumpPreviewToTocItem(item: DocumentTocItem) {
    setActiveRailItemId(item.id);
    const questionId = questionIdFromScrollAnchor(item.editorAnchor);

    if (showEditor) {
      setActiveTocItemId(item.id);
      if (questionId) selectQuestionInEditor(questionId);
      revealEditorAnchor(item.editorAnchor);
    }

    if (!showPreview) {
      return;
    }

    pendingPreviewJumpAnchorRef.current = item.previewAnchor;

    const previewPane = previewPaneRef.current;
    if (previewPane && scrollToAnchorPosition(previewPane, { anchor: item.previewAnchor, progress: 0 })) {
      pendingPreviewJumpAnchorRef.current = null;
      return;
    }

    window.requestAnimationFrame(() => {
      const nextPreviewPane = previewPaneRef.current;
      if (nextPreviewPane && scrollToAnchorPosition(nextPreviewPane, { anchor: item.previewAnchor, progress: 0 })) {
        pendingPreviewJumpAnchorRef.current = null;
      }
    });
  }

  function selectPageBreakInRail(item: DocumentTocItem) {
    setActiveRailItemId(item.id);
    pendingEditorJumpAnchorRef.current = null;
    pendingPreviewJumpAnchorRef.current = null;
  }

  function toggleEditorAtTocItem(item: DocumentTocItem) {
    if (showEditor) {
      setPaneMode("preview");
      return;
    }

    jumpToTocItem(item);
  }

  function jumpPreviewToQuestion(questionId: string) {
    const anchor = questionScrollAnchor(questionId);
    setActiveTocItemId(anchor);
    setActiveRailItemId(anchor);
    selectQuestionInEditor(questionId);
    pendingPreviewJumpAnchorRef.current = anchor;

    if (!showPreview) {
      setPaneMode("split");
      return;
    }

    const previewPane = previewPaneRef.current;
    if (previewPane && scrollToAnchorPosition(previewPane, { anchor, progress: 0 })) {
      pendingPreviewJumpAnchorRef.current = null;
      return;
    }

    window.requestAnimationFrame(() => {
      const nextPreviewPane = previewPaneRef.current;
      if (nextPreviewPane && scrollToAnchorPosition(nextPreviewPane, { anchor, progress: 0 })) {
        pendingPreviewJumpAnchorRef.current = null;
      }
    });
  }

  function toggleManualPane() {
    const nextPaneMode: PaneMode = paneMode === "split" ? "preview" : "split";
    assistantController.setPanelOpen(false);
    resetPreviewZoom();
    setPaneMode(nextPaneMode);
  }

  function showAssistantPane() {
    assistantController.setPanelOpen(true);
    resetPreviewZoom();
    setPaneMode("assistant");
  }

  function toggleAssistantPane() {
    if (paneMode === "assistant") {
      hideEditorPane();
      return;
    }

    showAssistantPane();
  }

  function resetPreviewZoom() {
    previewZoomRef.current = 1;
    previewGestureStartZoomRef.current = 1;
    if (previewZoomStateSyncTimerRef.current) {
      window.clearTimeout(previewZoomStateSyncTimerRef.current);
      previewZoomStateSyncTimerRef.current = null;
    }
    setPreviewZoom(1);

    const previewPane = previewPaneRef.current;
    if (previewPane) {
      previewPane.scrollLeft = 0;
      const previewRoot = previewPane.querySelector<HTMLElement>(".a4-preview-root");
      if (previewRoot) applyPreviewScaleStyle(previewRoot, currentPageFormat, previewFitScale);
    }
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function hideEditorPane() {
    resetPreviewZoom();
    assistantController.setPanelOpen(false);
    setPaneMode("preview");
  }

  function reorderQuestion(draggedId: string, targetId: string, placement: Exclude<DropPlacement, "inside">) {
    if (draggedId === targetId) return;
    applyEditorAction({ type: "question.reorder", questionId: draggedId, targetQuestionId: targetId, placement });
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
    pendingEditorJumpAnchorRef.current = null;
    pendingPreviewJumpAnchorRef.current = null;
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
    if (!activeQuestionId || activeQuestionId === questionId || !questions.some((question) => question.id === activeQuestionId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverQuestion({ questionId, placement: dragPlacementFromEvent(event) });
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
      const anchor = questionScrollAnchor(activeQuestionId);
      reorderQuestion(activeQuestionId, questionId, placement);
      selectQuestionInEditor(activeQuestionId);
      setActiveTocItemId(anchor);
      setActiveRailItemId(anchor);
      queueDocumentJump(anchor, anchor, { preservePaneMode: true });
    }
  }

  function handleQuestionDragEnd() {
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
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
    if (!targetQuestionId || targetQuestionId === sourceQuestionId || pageBreakQuestionIds.has(targetQuestionId)) return;
    movePageBreakAfterQuestion(sourceQuestionId, targetQuestionId);
    const anchor = pageBreakScrollAnchor(targetQuestionId);
    setActiveRailItemId(anchor);
    pendingEditorJumpAnchorRef.current = null;
    pendingPreviewJumpAnchorRef.current = null;
  }

  function handlePageBreakDragEnd() {
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
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
  }

  function handleSubsectionDragOver(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const active = readSubsectionDrag(event);
    const preview = active ? subsectionDropPreviewForEvent(active, target, event, questionsRef.current) : null;
    if (!active || !preview) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverSubsection({ targetKey: subsectionKey(target), placement: preview.placement, intent: preview.intent });
  }

  function handleSubsectionDragLeave(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverSubsection((current) => (current?.targetKey === subsectionKey(target) ? null : current));
  }

  function handleSubsectionDrop(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const active = readSubsectionDrag(event);
    const activePreview = dragOverSubsection?.targetKey === subsectionKey(target) ? dragOverSubsection : null;
    const preview = active ? subsectionDropPreviewForEvent(active, target, event, questionsRef.current) : null;
    const intent = activePreview?.intent ?? preview?.intent ?? null;
    if (!active || !intent) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    moveSubsection(active, intent);
  }

  function handleSubsectionDragEnd() {
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
  }

  function handleContainerDropZoneDragOver(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, placement: "start" | "end") {
    const active = readSubsectionDrag(event);
    const intent = active ? dropIntentForContainer(active, container, questionsRef.current, placement) : null;
    if (!active || !intent) return;
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
  }

  function handleContainerDropZoneDrop(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, placement: "start" | "end") {
    const active = readSubsectionDrag(event);
    const targetKey = containerDropKey(container, placement);
    const intent =
      dragOverSubsection?.targetKey === targetKey
        ? dragOverSubsection.intent
        : active
          ? dropIntentForContainer(active, container, questionsRef.current, placement)
          : null;
    if (!active || !intent) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
    setDraggedPageBreakQuestionId(null);
    setDragOverPageBreak(null);
    moveSubsection(active, intent);
  }

  function subsectionDragClasses(target: SubsectionDragTarget) {
    const dropPlacement = dragOverSubsection?.targetKey === subsectionKey(target) ? dragOverSubsection.placement : null;
    return cn(
      "relative",
      draggedSubsection && subsectionKey(draggedSubsection) === subsectionKey(target) && "scale-[0.995] opacity-70 shadow-2xl",
      dropPlacement === "inside" &&
        "bg-primary/5 ring-2 ring-primary/60 ring-offset-2 ring-offset-background shadow-[0_0_0_4px_hsl(var(--primary)/0.10)]",
      dropPlacement === "before" &&
        "before:absolute before:-top-2 before:left-2 before:right-2 before:z-20 before:h-1 before:rounded-full before:bg-primary before:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] before:content-['']",
      dropPlacement === "after" &&
        "after:absolute after:-bottom-2 after:left-2 after:right-2 after:z-20 after:h-1 after:rounded-full after:bg-primary after:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] after:content-['']",
    );
  }

  function containerDropZone(container: SubsectionContainerRef, placement: "start" | "end", visible = true) {
    const targetKey = containerDropKey(container, placement);
    const active = dragOverSubsection?.targetKey === targetKey;
    const canDrop = Boolean(
      visible && draggedSubsection && dropIntentForContainer(draggedSubsection, container, questionsRef.current, placement),
    );
    if (!canDrop) return null;
    const label = containerDropZoneLabel(container, placement);
    return (
      <div
        key={targetKey}
        onDragOver={(event) => handleContainerDropZoneDragOver(event, container, placement)}
        onDragLeave={(event) => handleContainerDropZoneDragLeave(event, container, placement)}
        onDrop={(event) => handleContainerDropZoneDrop(event, container, placement)}
        className={cn(
          "relative my-2 h-8 rounded-md border border-dashed border-border/70 bg-muted/35 text-muted-foreground transition-all",
          active && "my-3 h-11 border-primary bg-primary/10 text-primary shadow-inner",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center text-[11px] font-semibold",
            active ? "opacity-100" : "opacity-55",
          )}
        >
          {label}
        </div>
      </div>
    );
  }

  function subsectionDragHandle(target: SubsectionDragTarget, label: string) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        draggable
        title={label}
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        onDragStart={(event) => handleSubsectionDragStart(event, target)}
        onDragEnd={handleSubsectionDragEnd}
        className="size-8 cursor-grab text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical />
      </Button>
    );
  }

  function addQuestion() {
    const question = createQuestion();
    const anchor = questionScrollAnchor(question.id);
    applyEditorAction({ type: "question.add", question });
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
    pendingEditorJumpAnchorRef.current = null;
    pendingPreviewJumpAnchorRef.current = null;
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
    const fallbackQuestion = questions.length <= 1 ? createQuestion() : undefined;
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

  function addQuestionBlock(questionId: string, kind: ContentBlockKind) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const block = contentBlockForKind(kind);
    applyEditorAction({ type: "module.add", scope: { kind: "question", questionId: question.id }, blocks: [block] });
  }

  function addQuestionSolutionSlot(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const defaultLines = defaultSolutionSlotLines(question.parts.length ? questionMarks(question) : question.marks);
    const lines = requestedSolutionSlotLines(defaultLines);
    if (lines === null) return;
    const blocks = solutionSlotBlocks(lines);
    applyEditorAction({ type: "solutionSlot.add", scope: { kind: "question", questionId: question.id }, blocks });
    setShowSolutions(true);
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

  function removeSubpart(questionId: string, part: EditorPart, subpartId: string) {
    applyEditorAction({ type: "subpart.delete", questionId, partId: part.id, subpartId });
  }

  function addPartBlock(questionId: string, part: EditorPart, kind: ContentBlockKind) {
    const block = contentBlockForKind(kind);
    applyEditorAction({ type: "module.add", scope: { kind: "part", questionId, partId: part.id }, blocks: [block] });
  }

  function addPartSolutionSlot(questionId: string, part: EditorPart) {
    const defaultLines = defaultSolutionSlotLines(part.subparts?.length ? partMarks(part) : part.marks);
    const lines = requestedSolutionSlotLines(defaultLines);
    if (lines === null) return;
    const blocks = solutionSlotBlocks(lines);
    applyEditorAction({ type: "solutionSlot.add", scope: { kind: "part", questionId, partId: part.id }, blocks });
    setShowSolutions(true);
  }

  function removePartBlock(questionId: string, part: EditorPart, blockId: string) {
    applyEditorAction({ type: "module.delete", scope: { kind: "part", questionId, partId: part.id }, blockId });
  }

  function addSubpartBlock(questionId: string, part: EditorPart, subpart: EditorSubpart, kind: ContentBlockKind) {
    applyEditorAction({
      type: "module.add",
      scope: { kind: "subpart", questionId, partId: part.id, subpartId: subpart.id },
      blocks: [contentBlockForKind(kind)],
    });
  }

  function addSubpartSolutionSlot(questionId: string, part: EditorPart, subpart: EditorSubpart) {
    const lines = requestedSolutionSlotLines(defaultSolutionSlotLines(subpart.marks));
    if (lines === null) return;
    applyEditorAction({
      type: "solutionSlot.add",
      scope: { kind: "subpart", questionId, partId: part.id, subpartId: subpart.id },
      blocks: solutionSlotBlocks(lines),
    });
    setShowSolutions(true);
  }

  function removeSubpartBlock(questionId: string, part: EditorPart, subpart: EditorSubpart, blockId: string) {
    applyEditorAction({ type: "module.delete", scope: { kind: "subpart", questionId, partId: part.id, subpartId: subpart.id }, blockId });
  }

  deleteActiveEditorSelectionRef.current = () => {
    const anchor = activeRailItemId.startsWith("pb:") ? activeRailItemId : activeTocItemId;
    const parsed = parseScrollAnchor(anchor);
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
  };

  useEffect(() => {
    function handleGlobalDelete(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || fileManagerOpen || !nativeKeyboardDeleteRequested(event)) return;
      if (keyboardTargetConsumesGlobalDelete(event.target)) return;
      if (!deleteActiveEditorSelectionRef.current()) return;
      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("keydown", handleGlobalDelete);
    return () => window.removeEventListener("keydown", handleGlobalDelete);
  }, [fileManagerOpen]);

  function renderQuestionContentBlock(question: QuestionBlock, block: EditorContentBlock, _itemIndex: number, _itemCount: number) {
    if (!isContentBlockVisible(block, showSolutions)) return null;

    const blockIndex = Math.max(
      0,
      question.contentBlocks.filter((current) => current.kind !== "pageBreak").findIndex((current) => current.id === block.id),
    );
    const blockTarget: SubsectionDragTarget = { kind: "question-block", questionId: question.id, id: block.id };
    const wrapperClassName = cn("rounded-md transition-all", subsectionDragClasses(blockTarget));
    const blockAnchor = questionBlockScrollAnchor(question.id, block.id);
    const blockOpenSignal = openSignalForAnchor(blockAnchor);
    const blockActive = isActiveEditorAnchor(blockAnchor);
    const withInsertAfter = (node: ReactNode) => node;
    const wrapperProps = {
      "data-drag-preview": true,
      "data-scroll-anchor": blockAnchor,
      className: wrapperClassName,
      onDragOver: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragOver(event, blockTarget),
      onDragLeave: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragLeave(event, blockTarget),
      onDrop: (event: DragEvent<HTMLDivElement>) => handleSubsectionDrop(event, blockTarget),
    };

    if (block.kind === "space") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <SpaceBlockEditor
            label={`Answer space ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Answer space ${blockIndex + 1}`} summary={spaceBlockSummary(block.lines)} />}
            lines={block.lines}
            dragHandle={subsectionDragHandle(blockTarget, `Drag answer space ${blockIndex + 1}`)}
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(lines) => updateContentBlock(question.id, block.id, { lines })}
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
            showSolutions={showSolutions}
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

    if (block.kind === "choices") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <ChoiceListBlockEditor
            label={`Choice list ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Choice list ${blockIndex + 1}`} summary={choiceListSummary(block)} />}
            block={block}
            numberingStyleOptions={CHOICE_NUMBERING_STYLES}
            layoutOptions={CHOICE_LIST_LAYOUTS}
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
    _itemIndex: number,
    _itemCount: number,
  ) {
    if (!isContentBlockVisible(block, showSolutions)) return null;

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
    const blockActive = isActiveEditorAnchor(blockAnchor);
    const withInsertAfter = (node: ReactNode) => node;
    const wrapperProps = {
      "data-drag-preview": true,
      "data-scroll-anchor": blockAnchor,
      className: wrapperClassName,
      onDragOver: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragOver(event, partBlockTarget),
      onDragLeave: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragLeave(event, partBlockTarget),
      onDrop: (event: DragEvent<HTMLDivElement>) => handleSubsectionDrop(event, partBlockTarget),
    };

    if (block.kind === "space") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <SpaceBlockEditor
            label={`Part answer space ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Part answer space ${blockIndex + 1}`} summary={spaceBlockSummary(block.lines)} />}
            lines={block.lines}
            dragHandle={subsectionDragHandle(partBlockTarget, `Drag part answer space ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(lines) => updatePartContentBlock(question.id, part.id, block.id, { lines })}
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
            showSolutions={showSolutions}
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

    if (block.kind === "choices") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <ChoiceListBlockEditor
            label={`Part choice list ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Part choice list ${blockIndex + 1}`} summary={choiceListSummary(block)} />}
            block={block}
            numberingStyleOptions={CHOICE_NUMBERING_STYLES}
            layoutOptions={CHOICE_LIST_LAYOUTS}
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
    if (!isContentBlockVisible(block, showSolutions)) return null;

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
    const blockActive = isActiveEditorAnchor(blockAnchor);
    const withInsertAfter = (node: ReactNode) => node;
    const wrapperProps = {
      "data-drag-preview": true,
      "data-scroll-anchor": blockAnchor,
      className: wrapperClassName,
      onDragOver: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragOver(event, subpartBlockTarget),
      onDragLeave: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragLeave(event, subpartBlockTarget),
      onDrop: (event: DragEvent<HTMLDivElement>) => handleSubsectionDrop(event, subpartBlockTarget),
    };

    if (block.kind === "space") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <SpaceBlockEditor
            label={`Subpart answer space ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Subpart answer space ${blockIndex + 1}`} summary={spaceBlockSummary(block.lines)} />}
            lines={block.lines}
            dragHandle={subsectionDragHandle(subpartBlockTarget, `Drag subpart answer space ${blockIndex + 1}`)}
            muted
            active={blockActive}
            openSignal={blockOpenSignal}
            onChange={(lines) => updateSubpartContentBlock(question.id, part.id, subpart.id, block.id, { lines })}
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
            showSolutions={showSolutions}
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

    if (block.kind === "choices") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <ChoiceListBlockEditor
            label={`Subpart choice list ${blockIndex + 1}`}
            title={<InlineSummaryTitle label={`Subpart choice list ${blockIndex + 1}`} summary={choiceListSummary(block)} />}
            block={block}
            numberingStyleOptions={CHOICE_NUMBERING_STYLES}
            layoutOptions={CHOICE_LIST_LAYOUTS}
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
    const subpartUsesSolutionSpace = safeMarkValue(subpart.marks) > 0;
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
        className={cn("rounded-md transition-all", subsectionDragClasses(subpartTarget))}
        onDragOver={(event) => handleSubsectionDragOver(event, subpartTarget)}
        onDragLeave={(event) => handleSubsectionDragLeave(event, subpartTarget)}
        onDrop={(event) => handleSubsectionDrop(event, subpartTarget)}
      >
        <CollapsiblePanel
          title={<InlineSummaryTitle label={`Subpart (${subpartLabel})`} summary={partPanelSummary(subpart.contentBlocks)} />}
          leading={subsectionDragHandle(subpartTarget, `Drag subpart ${subpartLabel}`)}
          actions={
            <>
              <label className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                New Page
                <span className="flex h-8 w-20 items-center justify-center rounded-md border border-input bg-background px-2 text-sm font-normal">
                  <input
                    type="checkbox"
                    checked={subpart.pageBreakBefore === true}
                    onChange={(event) => updateSubpart(question.id, part.id, subpart.id, { pageBreakBefore: event.target.checked })}
                    className="size-4"
                    aria-label={`Start subpart ${subpartLabel} on a new page`}
                  />
                </span>
              </label>
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
              <RemoveActionButton label={`Remove subpart ${subpartLabel}`} onRemove={() => removeSubpart(question.id, part, subpart.id)} />
            </>
          }
          className="bg-muted/20"
          bodyClassName="p-3"
          defaultOpen={false}
          active={subpartActive}
          openSignal={subpartOpenSignal}
        >
          {subpart.contentBlocks.some((block) => block.kind !== "pageBreak")
            ? containerDropZone(
                { kind: "subpart", questionId: question.id, partId: part.id, subpartId: subpart.id },
                "start",
                Boolean(draggedSubsection),
              )
            : null}
          <div className="flex flex-col gap-3">
            {subpart.contentBlocks.map((block, blockIndex) =>
              block.kind === "pageBreak" ? null : renderSubpartContentBlock(question, part, subpart, block, blockIndex),
            )}
          </div>
          {containerDropZone(
            { kind: "subpart", questionId: question.id, partId: part.id, subpartId: subpart.id },
            "end",
            Boolean(draggedSubsection),
          )}
          <ContentInsertionActions
            buttonLabel="Add"
            centered
            className="mt-3 pt-3"
            onAddText={() => addSubpartBlock(question.id, part, subpart, "text")}
            onAddChoices={() => addSubpartBlock(question.id, part, subpart, "choices")}
            onAddTable={() => addSubpartBlock(question.id, part, subpart, "table")}
            onAddDiagram={() => addSubpartBlock(question.id, part, subpart, "diagram")}
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
            extraActions={subpartUsesSolutionSpace ? [] : [subpartSolutionSlotAction]}
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
    const partUsesSolutionSpace = !subparts.length && safeMarkValue(part.marks) > 0;
    const partInsertAction = {
      label: "Subpart",
      tooltip: "Add a roman-numbered item, such as (i), inside this part",
      icon: <GitBranch className="size-4" aria-hidden="true" />,
      onClick: () => addSubpart(question.id, part),
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
          className={cn("rounded-md transition-all", subsectionDragClasses(partTarget))}
          onDragOver={(event) => handleSubsectionDragOver(event, partTarget)}
          onDragLeave={(event) => handleSubsectionDragLeave(event, partTarget)}
          onDrop={(event) => handleSubsectionDrop(event, partTarget)}
        >
          <CollapsiblePanel
            title={<InlineSummaryTitle label={`Part (${partLabel})`} summary={partPanelSummary(part.contentBlocks)} />}
            leading={subsectionDragHandle(partTarget, `Drag part ${partLabel}`)}
            actions={
              <>
                <label className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                  New Page
                  <span className="flex h-8 w-20 items-center justify-center rounded-md border border-input bg-background px-2 text-sm font-normal">
                    <input
                      type="checkbox"
                      checked={part.pageBreakBefore === true}
                      onChange={(event) => updatePart(question.id, part.id, { pageBreakBefore: event.target.checked })}
                      className="size-4"
                      aria-label={`Start part ${partLabel} on a new page`}
                    />
                  </span>
                </label>
                {subparts.length ? (
                  <div className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                    Marks
                    <div className="flex h-8 w-20 items-center rounded-md border border-input bg-muted px-2 text-sm font-normal text-muted-foreground">
                      {markLabel(partMarks(part))}
                    </div>
                  </div>
                ) : (
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
                )}
                <RemoveActionButton label={`Remove part ${partLabel}`} onRemove={() => removePart(question.id, part.id)} />
              </>
            }
            className="bg-background"
            bodyClassName="p-3"
            defaultOpen={false}
            active={partActive}
            openSignal={partOpenSignal}
          >
            {partItems.length
              ? containerDropZone({ kind: "part", questionId: question.id, partId: part.id }, "start", Boolean(draggedSubsection))
              : null}
            <div className="flex flex-col gap-3">
              {partItems.map((item, partItemIndex) => {
                if (item.kind === "block") {
                  return renderPartContentBlock(question, part, item.block, partItemIndex, partItems.length);
                }

                return (
                  <div key={item.id} className="ml-6 border-l-2 border-blue-200 pl-4">
                    {renderSubpartPanel(question, part, item.subpart)}
                  </div>
                );
              })}
            </div>
            {containerDropZone({ kind: "part", questionId: question.id, partId: part.id }, "end", Boolean(draggedSubsection))}
            <ContentInsertionActions
              buttonLabel="Add"
              centered
              className="mt-3 pt-3"
              onAddText={() => addPartBlock(question.id, part, "text")}
              onAddChoices={() => addPartBlock(question.id, part, "choices")}
              onAddTable={() => addPartBlock(question.id, part, "table")}
              onAddDiagram={() => addPartBlock(question.id, part, "diagram")}
              onAddSpace={() => (partUsesSolutionSpace ? addPartSolutionSlot(question.id, part) : addPartBlock(question.id, part, "space"))}
              spaceActionLabel={partUsesSolutionSpace ? "Answer + solution" : "Space"}
              spaceActionTooltip={
                partUsesSolutionSpace ? "Add the default paired student answer space and solution block for this marked part" : undefined
              }
              extraActions={[...(partUsesSolutionSpace ? [] : [partSolutionSlotAction]), partInsertAction]}
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
                  title={paneMode === "assistant" ? "Hide assistant" : "Assistant mode"}
                  aria-label={paneMode === "assistant" ? "Hide assistant" : "Assistant mode"}
                  aria-pressed={paneMode === "assistant"}
                  onClick={toggleAssistantPane}
                  className={cn(HEADER_ICON_BUTTON_CLASS, paneMode === "assistant" && HEADER_ICON_ACTIVE_CLASS)}
                >
                  <Bot />
                </Button>
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
              </div>
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="New test"
                aria-label="New test"
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
            </div>
            <div className="hidden min-w-0 flex-1 items-center justify-end gap-2 md:flex">
              <HeaderFileControls
                currentFileName={currentProjectFileName}
                fileStatusMessage={headerFileStatusMessage}
                fileStatusTitle={headerFileStatusTitle}
                saveStatus={headerStorageStatus}
                onNewTest={startNewTest}
                onSaveTest={saveCurrentTest}
                onOpenFiles={openFileManager}
              />
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={showSolutions ? "Hide solutions" : "Show solutions"}
                  aria-label={showSolutions ? "Hide solutions" : "Show solutions"}
                  aria-pressed={showSolutions}
                  onClick={() => setShowSolutions((current) => !current)}
                  className={cn(HEADER_ICON_BUTTON_CLASS, showSolutions && HEADER_ICON_ACTIVE_CLASS)}
                >
                  {showSolutions ? <Eye /> : <EyeOff />}
                </Button>
                <button
                  type="button"
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition-colors",
                    showSolutions
                      ? "border-red-300/25 bg-red-500/15 text-red-50 hover:bg-red-500/25 hover:text-white"
                      : "border-emerald-300/30 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25 hover:text-white",
                  )}
                  title={`${printModeTitle} Open print dialog.`}
                  aria-label={`Print mode: ${printModeLabel}`}
                  onClick={printDocument}
                >
                  <FileText className="size-4" aria-hidden="true" />
                  <span className="hidden xl:inline">Print:</span>
                  <span>{printModeLabel}</span>
                </button>
              </div>
              <div className={HEADER_GROUP_CLASS}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Undo"
                  aria-label="Undo"
                  disabled={!canUndo}
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
                  disabled={!canRedo}
                  onClick={redoEdit}
                  className={HEADER_ICON_BUTTON_CLASS}
                >
                  <Redo2 />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="app-main grid h-[calc(100vh-4rem)] min-h-0 bg-background" style={appShellStyle}>
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
            onSelectPageBreak={selectPageBreakInRail}
            onToggleEditorAtItem={toggleEditorAtTocItem}
            onAddQuestion={addQuestion}
            onAddPageBreakAfterQuestion={addPageBreakAfterQuestion}
            onMoveQuestion={moveQuestionByKeyboard}
            onMovePageBreak={movePageBreakByKeyboard}
            onDeleteQuestion={removeQuestion}
            onDeletePageBreak={removePageBreakAfterQuestion}
            onQuestionDragStart={handleQuestionDragStart}
            onQuestionDragOver={handleQuestionDragOver}
            onQuestionDragLeave={handleQuestionDragLeave}
            onQuestionDrop={handleQuestionDrop}
            onQuestionDragEnd={handleQuestionDragEnd}
            onPageBreakDragStart={handlePageBreakDragStart}
            onPageBreakDragOver={handlePageBreakDragOver}
            onPageBreakDragLeave={handlePageBreakDragLeave}
            onPageBreakDrop={handlePageBreakDrop}
            onPageBreakDragEnd={handlePageBreakDragEnd}
          />
          {tocOpen ? <DocumentNavigator items={documentTocItems} activeItemId={activeTocItemId} onJump={jumpToTocItem} /> : null}
          <div className="app-workspace grid min-h-0 min-w-0 bg-background" style={workspaceStyle}>
            {showAssistant ? (
              <section className="assistant-pane min-h-0 overflow-hidden border-b bg-muted/35 p-4 lg:border-b-0 lg:border-r">
                <MauthAssistantPanel
                  placement="workspace"
                  chatMessages={assistantController.chatMessages}
                  chatInput={assistantController.chatInput}
                  chatAttachments={assistantController.chatAttachments}
                  attachmentNotice={assistantController.attachmentNotice}
                  chatRunning={assistantController.chatRunning}
                  providerConfigured={assistantController.providerConfigured}
                  providerStatusMessage={assistantController.providerStatusMessage}
                  activityLabel={assistantController.activityLabel}
                  activityStartedAt={assistantController.activityStartedAt}
                  onChatInputChange={assistantController.setChatInput}
                  onAddAttachments={assistantController.addChatAttachments}
                  onRemoveAttachment={assistantController.removeChatAttachment}
                  onSendChat={() => void assistantController.sendChatMessage()}
                  onClose={hideEditorPane}
                />
              </section>
            ) : null}
            {showEditor ? (
              <section
                ref={editorPaneRef}
                className={cn(
                  "editor-pane min-h-0 overflow-y-auto overflow-x-hidden border-b bg-muted/35 p-4 lg:border-b-0 lg:border-r",
                  paneMode === "split" && "split-pane-scroll",
                )}
              >
                <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-4">
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
                        <TestFormatEditor
                          formattingConfig={formattingConfig}
                          openSignal={openSignalForAnchor(SCROLL_ANCHOR_FRONT_MATTER)}
                          onFormattingChange={updateFormattingConfig}
                          onPageChange={updatePageFormat}
                          onReset={resetTestFormat}
                        />
                      </div>
                    </div>
                  ) : null}

                  {!editingFrontMatter && editingPageBreak && activePageBreakQuestion ? (
                    <div className="flex flex-col gap-4">
                      <div data-scroll-anchor={pageBreakScrollAnchor(activePageBreakQuestion.id)}>
                        <PageBreakStructurePanel
                          label={`Page break after Question ${questionDisplayNumber(
                            frontMatter,
                            Math.max(
                              0,
                              questions.findIndex((question) => question.id === activePageBreakQuestion.id),
                            ),
                          )}`}
                          active={isActiveEditorAnchor(pageBreakScrollAnchor(activePageBreakQuestion.id))}
                          onRemove={() => removePageBreakAfterQuestion(activePageBreakQuestion.id)}
                        />
                      </div>
                    </div>
                  ) : null}

                  {!editingFrontMatter && !editingPageBreak ? (
                    <div className="flex flex-col gap-4">
                      {questions.map((question, index) => {
                        if (question.id !== activeQuestion?.id) return null;

                        const hasParts = question.parts.length > 0;
                        const questionItems = orderedQuestionItems(question);
                        const questionAnchor = questionScrollAnchor(question.id);
                        const questionActive = isActiveEditorAnchor(questionAnchor);
                        const questionUsesSolutionSpace = !hasParts && safeMarkValue(question.marks) > 0;
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
                              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    title={`Jump preview to Question ${questionDisplayNumber(frontMatter, index)}`}
                                    aria-label={`Jump preview to Question ${questionDisplayNumber(frontMatter, index)}`}
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
                                    Question {questionDisplayNumber(frontMatter, index)}
                                  </Button>
                                  {hasParts ? (
                                    <Badge variant="secondary" className="h-9 shrink-0 whitespace-nowrap px-3 text-sm">
                                      {markLabel(questionMarks(question))}
                                    </Badge>
                                  ) : (
                                    <label className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm">
                                      <span className="font-medium text-muted-foreground">Marks</span>
                                      <input
                                        aria-label={`Question ${questionDisplayNumber(frontMatter, index)} marks`}
                                        type="number"
                                        min={0}
                                        value={question.marks}
                                        onChange={(event) => updateQuestion(question.id, { marks: Number(event.target.value) })}
                                        className="h-7 w-14 bg-transparent text-sm font-semibold outline-none"
                                      />
                                    </label>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    title={`Remove Question ${index + 1}`}
                                    aria-label={`Remove Question ${index + 1}`}
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

                              {questionItems.length
                                ? containerDropZone({ kind: "question", questionId: question.id }, "start", Boolean(draggedSubsection))
                                : null}
                              <div className="flex flex-col gap-3">
                                {questionItems.map((item, itemIndex) =>
                                  item.kind === "block"
                                    ? renderQuestionContentBlock(question, item.block, itemIndex, questionItems.length)
                                    : renderPartPanel(question, item.part),
                                )}
                              </div>
                              {containerDropZone({ kind: "question", questionId: question.id }, "end", Boolean(draggedSubsection))}
                              <ContentInsertionActions
                                buttonLabel="Add"
                                centered
                                className="mt-4 pt-3"
                                onAddText={() => addQuestionBlock(question.id, "text")}
                                onAddChoices={() => addQuestionBlock(question.id, "choices")}
                                onAddTable={() => addQuestionBlock(question.id, "table")}
                                onAddDiagram={() => addQuestionBlock(question.id, "diagram")}
                                onAddSpace={() =>
                                  questionUsesSolutionSpace ? addQuestionSolutionSlot(question.id) : addQuestionBlock(question.id, "space")
                                }
                                spaceActionLabel={questionUsesSolutionSpace ? "Answer + solution" : "Space"}
                                spaceActionTooltip={
                                  questionUsesSolutionSpace
                                    ? "Add the default paired student answer space and solution block for this marked question"
                                    : undefined
                                }
                                extraActions={[
                                  ...(questionUsesSolutionSpace ? [] : [questionSolutionSlotAction]),
                                  {
                                    label: "Part",
                                    tooltip: "Add a lettered question part, such as (a), (b), (c)",
                                    icon: <GitBranch className="size-4" aria-hidden="true" />,
                                    onClick: () => addPart(question.id),
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
              </section>
            ) : null}

            {showPreview ? (
              <section
                ref={previewPaneRef}
                className={cn(
                  "preview-pane min-h-0 overflow-auto bg-muted/70 p-4",
                  paneMode === "split" && "preview-pane-edit-sync split-pane-scroll",
                )}
                onPointerDown={handlePreviewPointerDown}
                onClick={handlePreviewClick}
              >
                <PaginatedTestPreview
                  frontMatter={frontMatter}
                  logos={logos}
                  totalMarks={totalMarks}
                  questions={questions}
                  formattingConfig={formattingConfig}
                  scale={previewLayoutScale}
                  showSolutions={showSolutions}
                  onGraphConfigChange={handlePreviewGraphConfigChange}
                />
              </section>
            ) : null}
          </div>
        </main>
      </div>
      <FileManagementDrawer
        open={fileManagerOpen}
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
        onRenameProjectFile={(filePath) => void renameProjectFile(filePath)}
        onDuplicateProjectFiles={(filePaths) => void duplicateProjectFiles(filePaths)}
        onMoveProjectFiles={(filePaths, targetFolderPath) => void moveProjectFiles(filePaths, targetFolderPath)}
        onDeleteProjectFiles={(filePaths) => void removeProjectFiles(filePaths)}
        onListProjectFileVersions={loadProjectFileVersions}
        onRestoreProjectFileVersion={restoreProjectFileFromVersion}
      />
      <NewTestDialog open={newTestDialogOpen} onClose={() => setNewTestDialogOpen(false)} onCreate={createNewTestFromTemplate} />
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
            setActionProposalMessage("");
            setActionProposalResult(null);
          }}
          onPreview={previewActionProposal}
          onApply={applyActionProposal}
          onClose={() => setActionProposalOpen(false)}
          onClear={clearActionProposal}
        />
      ) : null}
      {printPreviewMounted ? (
        <div className="print-preview-stage" aria-hidden="true">
          <PaginatedTestPreview
            frontMatter={frontMatter}
            logos={logos}
            totalMarks={totalMarks}
            questions={questions}
            formattingConfig={formattingConfig}
            scale={1}
            showSolutions={showSolutions}
          />
        </div>
      ) : null}
    </>
  );
}
