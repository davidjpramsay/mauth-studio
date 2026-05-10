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
  GraphFeature,
  GraphFunction,
  GraphFunctionPiece,
  ProjectFileDocument,
  ProjectFileSaveRequest,
  ProjectFileSummary,
  ProjectFileVersion,
  ProjectSummary,
  QuestionPart,
  QuestionSubpart,
  TableCellAlignment,
} from "@mauth-studio/shared";
import {
  DEFAULT_STATS_CHART_SPEC,
  STATS_CHART_TYPES,
  normalizeStatsChartSpec,
  statsChartSummary,
  type StatsChartData,
  type StatsChartOptions,
  type StatsChartType,
} from "@mauth-studio/diagram-plotly";
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  Download,
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
  PanelLeftClose,
  PanelRightClose,
  Pencil,
  Plus,
  PlusCircle,
  Redo2,
  Save,
  SeparatorHorizontal,
  Shuffle,
  Sun,
  Table2,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";

import { Latex } from "@/components/Latex";
import { MauthAssistantPanel, type MauthAssistantChatMessage } from "@/components/MauthAssistantPanel";
import { GeometricConstructionDiagram } from "@/components/diagrams/GeometricConstructionDiagram";
import { StatsChartDiagram } from "@/components/diagrams/StatsChartDiagram";
import { Basic3DGraph } from "@/components/graphs/Basic3DGraph";
import {
  FunctionGraph,
  graphDisplayHeight,
  snapImplicitRelationPointAtX,
  snapImplicitRelationPointAtY,
} from "@/components/graphs/FunctionGraph";
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
  getAssistantStatus,
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
  sendAssistantChat,
  saveStorageAutosave,
  saveStoredLogo,
  updateProject,
  type AssistantChatMessage,
  type AssistantProviderToolCall,
  type AssistantToolOutput,
  type AssistantUsageSummary,
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
import {
  runMauthAssistantAdapterTool,
  type MauthAssistantAdapterHost,
  type MauthAssistantAdapterResult,
  type MauthAssistantAdapterToolCall,
} from "@/lib/mauthAssistantAdapter";
import { cn } from "@/lib/utils";

const GRAPH_COLORS = ["#1677ff", "#7955ff", "#0f766e", "#b45309", "#be123c"];
const GRAPH_LABELS = ["f", "g", "h", "p", "q"];
const DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH = 2.5;
const BRAND_LOGO_SRC = "/brand/mauth_logo_lockup.png";
const HEADER_GROUP_CLASS = "ml-2 flex shrink-0 items-center gap-1 rounded-md border border-blue-300/20 bg-white/[0.05] p-1";
const HEADER_ICON_BUTTON_CLASS = "size-8 text-blue-100 hover:bg-blue-500/15 hover:text-white disabled:opacity-40";
const HEADER_ICON_ACTIVE_CLASS = "bg-blue-500/20 text-white";
const EDITOR_ACTIVE_PANEL_CLASS = "border-primary/70 bg-primary/[0.03] shadow-[0_0_0_2px_hsl(var(--primary)/0.16)]";
const EDITOR_ACTIVE_HEADER_CLASS = "bg-primary/10 text-primary";
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
const ASSISTANT_PREVIEW_RESERVED_WIDTH_PX = 640;
const PREVIEW_WHEEL_ZOOM_SENSITIVITY = 0.0018;
const PREVIEW_ZOOM_STATE_SYNC_DELAY_MS = 160;
const PREVIEW_EDIT_CLICK_MOVE_TOLERANCE_PX = 6;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const DEFAULT_SOLUTION_SLOT_LINES = 8;
const MIN_SOLUTION_SLOT_LINES = 4;
const MAX_SOLUTION_SLOT_LINES = 18;
const DEFAULT_SOLUTION_SLOT_TEXT = "**Solution.**\n\n";
const ASSISTANT_MAX_TOOL_ROUNDS = 4;
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
const INSERT_MENU_OPEN_EVENT = "mauth-studio:insert-menu-open";
const AUTOSAVE_DEBOUNCE_MS = 900;
const TEST_FILE_ROOT = "tests";
const TEST_FILE_ROOT_LABEL = "Documents";
const LEGACY_SAVED_TESTS_MIGRATED_AT_KEY = "legacySavedTestsMigratedAt";
const LEGACY_SAVED_TESTS_IMPORTED_KEY = "legacySavedTestsImported";
let nextInsertMenuId = 0;
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
const DEFAULT_2D_GRAPH: GraphConfig = {
  type: "graph2d",
  expression: "x^2 - 5*x + 6",
  latex: "x^2 - 5x + 6",
  functions: [
    {
      expression: "x^2 - 5*x + 6",
      latex: "x^2 - 5x + 6",
      label: "f",
      color: GRAPH_COLORS[0],
      strokeWidth: DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH,
      strokeStyle: "solid",
      kind: "expression",
      domainMode: "auto",
      functionExtensionMode: "auto",
      functionExtension: 0.25,
      functionExtensionLeft: 0.25,
      functionExtensionRight: 0.25,
      pieces: [],
    },
  ],
  features: [],
  xMin: -5,
  xMax: 4,
  yMin: -10,
  yMax: 10,
  widthPx: 680,
  heightPx: 300,
  lockAspectRatio: false,
  equalScale: false,
  showGrid: true,
  showMajorGrid: true,
  showMinorGrid: false,
  showGridBorder: false,
  showAxes: true,
  showArrows: true,
  showAxisLabels: true,
  showAxisNumbers: true,
  axisLabelIntervalMode: "auto",
  axisLabelStepX: undefined,
  axisLabelStepY: undefined,
  axisLabelMinSpacingPx: 48,
  showFunctionArrows: true,
  gridMajorStep: 1,
  gridMinorStep: 0.5,
  gridMajorStepX: 1,
  gridMajorStepY: 1,
  gridMinorStepX: 0.5,
  gridMinorStepY: 0.5,
  gridMajorColor: "#b9b9b9",
  gridMinorColor: "#dddddd",
  axisExtensionMode: "auto",
  functionExtensionMode: "auto",
  axisExtension: 0.5,
  functionExtension: 0.25,
  functionExtensionLeft: 0.25,
  functionExtensionRight: 0.25,
  metadata: {},
};
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
const DEFAULT_VECTOR_RELATIONSHIP_DATA = {
  hidePoints: false,
  hidePointLabels: false,
  objects: [
    { type: "point", name: "A", label: "A" },
    { type: "point", name: "B", label: "B" },
    { type: "point", name: "C", label: "C" },
  ],
  relationships: [
    { type: "vectorSegment", name: "AB", points: ["A", "B"], label: "" },
    { type: "vectorSegment", name: "AC", points: ["A", "C"], label: "" },
    { type: "segment", name: "BC", points: ["B", "C"], label: "" },
  ],
};
const VECTOR_2D_COLORS = ["#0f766e", "#b45309", "#1d4ed8", "#be123c", "#7c3aed"];
const DEFAULT_VECTOR_2D_METADATA = {
  vector2d: {
    labelStyle: "boldLower",
    vectors: [
      { id: "a", name: "a", label: "", start: [0, 0], components: [2, 3], color: VECTOR_2D_COLORS[0], showComponents: false },
      { id: "b", name: "b", label: "", start: [0, 0], components: [4, -3], color: VECTOR_2D_COLORS[1], showComponents: false },
    ],
  },
};
const DEFAULT_VECTOR_2D_GRAPH: GraphConfig = {
  ...DEFAULT_2D_GRAPH,
  type: "vector2d",
  xMin: -1,
  xMax: 6,
  yMin: -4,
  yMax: 4,
  widthPx: 520,
  heightPx: 320,
  functions: [],
  features: [],
  metadata: DEFAULT_VECTOR_2D_METADATA,
};
const DEFAULT_3D_VIEW_STATE = {
  az: 1,
  el: 0.3,
  bank: 0,
};
const DEFAULT_3D_GRAPH: GraphConfig = {
  type: "graph3d",
  widthPx: 420,
  heightPx: 320,
  functions: [],
  features: [],
  metadata: {
    view3d: DEFAULT_3D_VIEW_STATE,
  },
};
const DEFAULT_SET_DATA = {
  universe: { name: "U", label: "U" },
  sets: [
    { type: "set", name: "A", label: "A" },
    { type: "set", name: "B", label: "B" },
  ],
  regions: [
    { name: "onlyA", label: "A \\cap B'" },
    { name: "intersection", label: "A \\cap B" },
    { name: "onlyB", label: "A' \\cap B" },
    { name: "outside", label: "(A \\cup B)'" },
  ],
};
const PENROSE_ORIGINAL_WIDTH = 420;
const DEFAULT_PENROSE_SCALE_PERCENT = 100;
const DEFAULT_PENROSE_PRESET = "geometry";
const SETS_PENROSE_PRESET = "sets";
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
const DEFAULT_SET_DIAGRAM: GraphConfig = {
  type: "setDiagram",
  data: DEFAULT_SET_DATA,
  style: SETS_PENROSE_PRESET,
  options: { scalePercent: DEFAULT_PENROSE_SCALE_PERCENT, penrosePreset: SETS_PENROSE_PRESET },
  scalePercent: DEFAULT_PENROSE_SCALE_PERCENT,
  penrosePreset: SETS_PENROSE_PRESET,
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
const DEFAULT_IMAGE_DIAGRAM: GraphConfig = {
  type: "image",
  data: { src: "", name: "", alt: "" },
  widthPx: 420,
  heightPx: 260,
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
const GRAPH_FEATURE_TYPES: Array<{ value: GraphFeature["kind"]; label: string }> = [
  { value: "point", label: "Point" },
  { value: "region_between_curves", label: "Region between two curves" },
  { value: "region_curve_axis", label: "Region between curve and axis" },
  { value: "turning_point", label: "Turning point" },
  { value: "intersection", label: "Point of intersection" },
  { value: "tangent", label: "Tangent at point" },
  { value: "line_segment", label: "Line segment" },
  { value: "label", label: "Label" },
];
const GRAPH_FEATURE_LABEL_MODES: Array<{ value: NonNullable<GraphFeature["labelMode"]>; label: string }> = [
  { value: "name", label: "Name" },
  { value: "coordinates", label: "Coordinates" },
  { value: "name_and_coordinates", label: "Name + coordinates" },
  { value: "none", label: "No label" },
];
const GRAPH_REGION_LABEL_MODES: Array<{ value: NonNullable<GraphFeature["labelMode"]>; label: string }> = [
  { value: "area", label: "Area" },
  { value: "name_and_area", label: "Name + area" },
  { value: "name", label: "Name" },
  { value: "none", label: "No label" },
];
const GRAPH_TANGENT_LABEL_MODES: Array<{ value: NonNullable<GraphFeature["labelMode"]>; label: string }> = [
  { value: "name_and_value", label: "Name + value" },
  { value: "value", label: "Value" },
  { value: "name", label: "Name" },
  { value: "coordinates", label: "Coordinates" },
  { value: "name_and_coordinates", label: "Name + coordinates" },
  { value: "none", label: "No label" },
];
const GRAPH_LINE_STYLES: Array<{ value: NonNullable<GraphFunction["strokeStyle"]>; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
];
const GRAPH_FEATURE_LINE_STYLES: Array<{ value: NonNullable<GraphFeature["strokeStyle"]>; label: string }> = [
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
];
const GRAPH_INTERSECTION_TARGETS: Array<{ value: NonNullable<GraphFeature["intersectionTarget"]>; label: string }> = [
  { value: "function", label: "Another function" },
  { value: "xAxis", label: "x-axis" },
  { value: "yAxis", label: "y-axis" },
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
type GraphFunctionKind = NonNullable<GraphFunction["kind"]>;
type GraphFeatureKind = NonNullable<GraphFeature["kind"]>;

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

type PaneMode = "split" | "editor" | "preview";
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
type ProjectFilesStatus = "idle" | "loading" | "ready" | "saving" | "error";

interface ProjectSaveConflict {
  filePath: string;
  message: string;
  localRevision: number | null;
  currentRevision?: number;
}

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

function graphFunctionLabel(index: number) {
  return GRAPH_LABELS[index] ?? `f_${index + 1}`;
}

function createGraphFunction(index: number, expression = "x"): GraphFunction {
  return {
    id: id("function"),
    kind: "expression",
    expression,
    latex: "",
    label: graphFunctionLabel(index),
    color: GRAPH_COLORS[index % GRAPH_COLORS.length],
    strokeWidth: DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH,
    strokeStyle: "solid",
    show: true,
    domainMode: "auto",
    functionExtensionMode: "auto",
    functionExtension: 0.25,
    functionExtensionLeft: 0.25,
    functionExtensionRight: 0.25,
    pieces: [],
  };
}

function createGraphPiece(expression = "x", xMin?: number, xMax?: number): GraphFunctionPiece {
  return {
    id: id("piece"),
    expression,
    xMin,
    xMax,
    includeStart: true,
    includeEnd: true,
  };
}

function isRegionFeatureKind(kind?: GraphFeature["kind"]) {
  return kind === "region_between_curves" || kind === "region_curve_axis";
}

function normalFeatureKind(kind?: GraphFeature["kind"]): GraphFeatureKind {
  return kind === "point_between_points" ? "point" : (kind ?? "point");
}

function normalFeatureLabelMode(feature: GraphFeature): NonNullable<GraphFeature["labelMode"]> {
  const labelMode = feature.labelMode;
  if (normalFeatureKind(feature.kind) === "label") return "name";
  if (normalFeatureKind(feature.kind) === "line_segment") {
    if (labelMode === "area" || labelMode === "name_and_area" || labelMode === "value" || labelMode === "name_and_value") return "name";
    return labelMode ?? "none";
  }
  if (normalFeatureKind(feature.kind) === "tangent") {
    if (labelMode === "area" || labelMode === "name_and_area") return "name_and_value";
    return labelMode ?? "name_and_value";
  }
  if (isRegionFeatureKind(normalFeatureKind(feature.kind))) {
    if (labelMode === "coordinates" || labelMode === "name_and_coordinates" || labelMode === "value" || labelMode === "name_and_value") {
      return "area";
    }
    return labelMode ?? "area";
  }
  if (labelMode === "area" || labelMode === "name_and_area" || labelMode === "value" || labelMode === "name_and_value") return "name";
  return labelMode ?? "name_and_coordinates";
}

function createGraphFeature(kind: GraphFeatureKind, index: number, graphConfig?: GraphConfig | null): GraphFeature {
  const xMin = graphConfig?.xMin ?? DEFAULT_2D_GRAPH.xMin ?? -5;
  const xMax = graphConfig?.xMax ?? DEFAULT_2D_GRAPH.xMax ?? 5;
  const yMin = graphConfig?.yMin ?? DEFAULT_2D_GRAPH.yMin ?? -5;
  const yMax = graphConfig?.yMax ?? DEFAULT_2D_GRAPH.yMax ?? 5;
  const firstFunction = 0;
  const secondFunction = Math.min(1, Math.max(0, (graphConfig?.functions?.length ?? 1) - 1));
  const defaultLabel =
    kind === "point"
      ? "A"
      : kind === "tangent"
        ? "T"
        : kind === "line_segment"
          ? `Line ${index + 1}`
          : kind === "label"
            ? `Label ${index + 1}`
            : `Feature ${index + 1}`;
  const defaultLabelMode = isRegionFeatureKind(kind)
    ? "area"
    : kind === "tangent"
      ? "name_and_value"
      : kind === "label"
        ? "name"
        : kind === "line_segment"
          ? "none"
          : "name_and_coordinates";

  return {
    id: id("feature"),
    kind,
    label: defaultLabel,
    labelMode: defaultLabelMode,
    color: GRAPH_COLORS[index % GRAPH_COLORS.length],
    fillOpacity: 0.18,
    strokeWidth: isRegionFeatureKind(kind) ? 0.5 : 2,
    strokeStyle: isRegionFeatureKind(kind) ? "none" : "solid",
    size: 0.35,
    show: true,
    x: 0,
    y: 0,
    x1: xMin,
    y1: yMin,
    x2: xMax,
    y2: yMax,
    ratio: 0.5,
    functionIndex: firstFunction,
    functionAIndex: firstFunction,
    functionBIndex: secondFunction,
    intersectionTarget: "function",
    baseFeatureIndex: 0,
    clipFunctionIndex: firstFunction,
    clipSide: "inside",
    axis: "x",
    xMin,
    xMax,
    labelX: undefined,
    labelY: undefined,
  };
}

function graphFeaturesFromConfig(graphConfig?: GraphConfig | null): GraphFeature[] {
  return (graphConfig?.features ?? []).flatMap((feature, index) => {
    if (feature.kind === "region_clipped_by_curve") return [];

    const kind = normalFeatureKind(feature.kind);
    const ratio = feature.ratio ?? 0.5;
    const pointX =
      feature.kind === "point_between_points" ? (feature.x1 ?? 0) + ((feature.x2 ?? 0) - (feature.x1 ?? 0)) * ratio : (feature.x ?? 0);
    const pointY =
      feature.kind === "point_between_points" ? (feature.y1 ?? 0) + ((feature.y2 ?? 0) - (feature.y1 ?? 0)) * ratio : (feature.y ?? 0);

    return {
      id: feature.id ?? `feature-${index}`,
      kind,
      label: feature.label ?? `Feature ${index + 1}`,
      labelMode: normalFeatureLabelMode(feature),
      color: feature.color ?? GRAPH_COLORS[index % GRAPH_COLORS.length],
      show: feature.show ?? true,
      fillOpacity: feature.fillOpacity ?? 0.18,
      strokeWidth: feature.strokeWidth ?? (isRegionFeatureKind(kind) ? 0.5 : 2),
      strokeStyle: feature.strokeStyle ?? (isRegionFeatureKind(kind) ? "none" : "solid"),
      size: feature.size ?? 0.35,
      x: pointX,
      y: pointY,
      x1: feature.x1 ?? graphConfig?.xMin ?? DEFAULT_2D_GRAPH.xMin,
      y1: feature.y1 ?? graphConfig?.yMin ?? DEFAULT_2D_GRAPH.yMin,
      x2: feature.x2 ?? graphConfig?.xMax ?? DEFAULT_2D_GRAPH.xMax,
      y2: feature.y2 ?? graphConfig?.yMax ?? DEFAULT_2D_GRAPH.yMax,
      ratio,
      functionIndex: feature.functionIndex ?? 0,
      functionAIndex: feature.functionAIndex ?? 0,
      functionBIndex: feature.functionBIndex ?? 1,
      intersectionTarget: feature.intersectionTarget ?? "function",
      baseFeatureIndex: feature.baseFeatureIndex ?? 0,
      clipFunctionIndex: feature.clipFunctionIndex ?? 0,
      clipSide: feature.clipSide ?? "inside",
      axis: feature.axis ?? "x",
      xMin: feature.xMin ?? graphConfig?.xMin ?? DEFAULT_2D_GRAPH.xMin,
      xMax: feature.xMax ?? graphConfig?.xMax ?? DEFAULT_2D_GRAPH.xMax,
      labelX: feature.labelX,
      labelY: feature.labelY,
      solutionOnly: feature.solutionOnly === true,
    };
  });
}

function expressionToLatex(expression?: string) {
  return (expression ?? "")
    .trim()
    .replace(/\*\*/g, "^")
    .replace(/(\d)\s*\*\s*([a-zA-Z])/g, "$1$2")
    .replace(/([a-zA-Z])\s*\*\s*(\d)/g, "$1\\cdot $2")
    .replace(/\*/g, "\\cdot ")
    .replace(/\s+/g, " ");
}

function functionSummaryLatex(graphFunction: GraphFunction, label: string) {
  const expressionLatex = graphFunction.latex?.trim() || expressionToLatex(graphFunction.expression);
  if (graphFunction.kind === "relation") return expressionLatex || "\\text{relation}";
  return `${label}(x)=${expressionLatex || "\\text{expression}"}`;
}

function graphPiecesFromFunction(graphFunction: GraphFunction, graphConfig?: GraphConfig | null): GraphFunctionPiece[] {
  if (graphFunction.pieces?.length) {
    return graphFunction.pieces.map((piece) => ({
      ...piece,
      expression: piece.expression ?? "",
      includeStart: piece.includeStart ?? true,
      includeEnd: piece.includeEnd ?? true,
    }));
  }
  return [createGraphPiece(graphFunction.expression || "x", graphConfig?.xMin, graphConfig?.xMax)];
}

function graphFunctionsFromConfig(graphConfig?: GraphConfig | null): GraphFunction[] {
  const configured: GraphFunction[] = Array.isArray(graphConfig?.functions)
    ? graphConfig.functions
    : graphConfig?.expression
      ? [
          {
            kind: "expression" as const,
            expression: graphConfig.expression,
            latex: graphConfig.latex,
            label: "f",
            color: GRAPH_COLORS[0],
            strokeWidth: DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH,
            strokeStyle: "solid",
            show: true,
            domainMode: "auto",
            functionExtensionMode: graphConfig.functionExtensionMode,
            functionExtension: graphConfig.functionExtension,
            functionExtensionLeft: graphConfig.functionExtensionLeft,
            functionExtensionRight: graphConfig.functionExtensionRight,
            pieces: [],
          },
        ]
      : (DEFAULT_2D_GRAPH.functions ?? []);

  return configured.map((graphFunction, index): GraphFunction => {
    const functionExtension = graphFunction.functionExtension ?? graphConfig?.functionExtension ?? DEFAULT_2D_GRAPH.functionExtension;
    return {
      ...graphFunction,
      kind: graphFunction.kind ?? ("expression" as const),
      expression: graphFunction.expression ?? "",
      label: graphFunction.label || graphFunctionLabel(index),
      color: graphFunction.color || GRAPH_COLORS[index % GRAPH_COLORS.length],
      strokeWidth: graphFunction.strokeWidth ?? DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH,
      strokeStyle: graphFunction.strokeStyle ?? "solid",
      show: graphFunction.show ?? true,
      showLabel: graphFunction.showLabel ?? false,
      labelMode: graphFunction.labelMode ?? "equation",
      labelX: graphFunction.labelX ?? graphConfig?.xMin ?? DEFAULT_2D_GRAPH.xMin,
      labelY: graphFunction.labelY ?? graphConfig?.yMax ?? DEFAULT_2D_GRAPH.yMax,
      domainMode: graphFunction.domainMode ?? "auto",
      domainMin: graphFunction.domainMin,
      domainMax: graphFunction.domainMax,
      functionExtensionMode:
        graphFunction.functionExtensionMode ?? graphConfig?.functionExtensionMode ?? DEFAULT_2D_GRAPH.functionExtensionMode,
      functionExtension,
      functionExtensionLeft:
        graphFunction.functionExtensionLeft ??
        graphFunction.functionExtension ??
        graphConfig?.functionExtensionLeft ??
        graphConfig?.functionExtension ??
        DEFAULT_2D_GRAPH.functionExtensionLeft,
      functionExtensionRight:
        graphFunction.functionExtensionRight ??
        graphFunction.functionExtension ??
        graphConfig?.functionExtensionRight ??
        graphConfig?.functionExtension ??
        DEFAULT_2D_GRAPH.functionExtensionRight,
      pieces: graphFunction.kind === "piecewise" ? graphPiecesFromFunction(graphFunction, graphConfig) : (graphFunction.pieces ?? []),
    };
  });
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

function finiteGraphNumber(value: unknown, fallback?: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function imageDiagramData(graphConfig?: GraphConfig | null) {
  const data = asRecord(graphConfig?.data);
  return {
    src: typeof data?.src === "string" ? data.src : "",
    name: typeof data?.name === "string" ? data.name : "",
    alt: typeof data?.alt === "string" ? data.alt : "",
    mimeType: typeof data?.mimeType === "string" ? data.mimeType : "",
    naturalWidth: finiteGraphNumber(data?.naturalWidth),
    naturalHeight: finiteGraphNumber(data?.naturalHeight),
  };
}

function imageDiagramName(graphConfig?: GraphConfig | null) {
  return imageDiagramData(graphConfig).name || "Uploaded image";
}

function imageDiagramAlt(graphConfig?: GraphConfig | null) {
  const data = imageDiagramData(graphConfig);
  return data.alt || data.name || "Uploaded diagram";
}

function imageNameFromFile(fileName: string) {
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim() || "Image"
  );
}

function diagramImageDimensions(naturalWidth?: number, naturalHeight?: number) {
  if (!naturalWidth || !naturalHeight) {
    return {
      widthPx: DEFAULT_IMAGE_DIAGRAM.widthPx,
      heightPx: DEFAULT_IMAGE_DIAGRAM.heightPx,
    };
  }
  const maxWidth = DEFAULT_2D_GRAPH.widthPx ?? 680;
  const widthPx = Math.min(naturalWidth, maxWidth);
  return {
    widthPx,
    heightPx: Math.max(1, Math.round(widthPx * (naturalHeight / naturalWidth))),
  };
}

function penroseScalePercent(graphConfig?: GraphConfig | null) {
  const scale = Number(graphConfig?.scalePercent ?? graphConfig?.options?.scalePercent);
  return Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_PENROSE_SCALE_PERCENT;
}

function penrosePreset(graphConfig?: GraphConfig | null) {
  const explicitPreset = graphConfig?.penrosePreset ?? graphConfig?.options?.penrosePreset ?? graphConfig?.options?.preset;
  const stylePreset = graphConfig?.type === "setDiagram" && graphConfig?.style === DEFAULT_PENROSE_PRESET ? undefined : graphConfig?.style;
  const preset = String(explicitPreset ?? stylePreset ?? "");
  return preset === DEFAULT_PENROSE_PRESET || preset === SETS_PENROSE_PRESET ? preset : defaultPenrosePresetForType(graphConfig?.type);
}

function penroseOptions(graphConfig?: GraphConfig | null) {
  const options = { ...(graphConfig?.options ?? {}) };
  delete options.width;
  delete options.height;
  delete options.preset;
  options.scalePercent = penroseScalePercent(graphConfig);
  options.penrosePreset = penrosePreset(graphConfig);
  return options;
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

function vectorRelationshipsFromConfig(config: GraphConfig) {
  const { relationships } = geometricSourceData(config);
  const source = relationships.filter((relationship) => relationship.type === "segment" || relationship.type === "vectorSegment");
  return source.length ? source : recordArray(DEFAULT_VECTOR_RELATIONSHIP_DATA.relationships);
}

function vectorPointNamesFromRelationships(relationships: Array<Record<string, unknown>>) {
  const names = new Set<string>();
  relationships.forEach((relationship) => {
    relationshipPointNames(relationship).forEach((point) => names.add(penroseIdentifier(point, `P${names.size + 1}`)));
  });
  return [...names];
}

function normalizedVectorRelationshipData(config: GraphConfig) {
  const { data, objects } = geometricSourceData(config);
  const relationships = vectorRelationshipsFromConfig(config).map((relationship, index) => {
    const points = relationshipPointNames(relationship).slice(0, 2);
    const fallback = DEFAULT_VECTOR_RELATIONSHIP_DATA.relationships[index] ?? DEFAULT_VECTOR_RELATIONSHIP_DATA.relationships[0];
    const fallbackPoints = Array.isArray(fallback.points) ? fallback.points : ["O", "A"];
    const start = penroseIdentifier(points[0], String(fallbackPoints[0] ?? "O"));
    const end = penroseIdentifier(points[1], String(fallbackPoints[1] ?? "A"));
    return {
      type: relationship.type === "segment" ? "segment" : "vectorSegment",
      name: penroseIdentifier(relationship.name, `${start}${end}`),
      points: [start, end],
      label: relationship.label ?? relationship.value ?? fallback.label ?? "",
    };
  });
  const relationshipPointNamesSet = vectorPointNamesFromRelationships(relationships);
  const objectMap = new Map<string, Record<string, unknown>>();
  objects.forEach((object) => {
    const name = penroseIdentifier(object.name, "");
    if (name) objectMap.set(name, object);
  });
  relationshipPointNamesSet.forEach((name) => {
    if (!objectMap.has(name)) objectMap.set(name, { type: "point", name });
  });
  return {
    hidePoints: data.hidePoints === true,
    hidePointLabels: data.hidePointLabels === true,
    objects: [...objectMap.values()].map((object, index) => {
      const name = penroseIdentifier(object.name, `P${index + 1}`);
      return {
        type: "point",
        name,
        label: object.label ?? name,
      };
    }),
    relationships,
  };
}

function setSourceData(config: GraphConfig) {
  const data = asRecord(config.data) ?? asRecord(DEFAULT_SET_DATA);
  const objectSets = recordArray(data?.objects).filter((object) => object.type === "set");
  const sets = recordArray(data?.sets);
  const regions = recordArray(data?.regions);
  return {
    universe: asRecord(data?.universe) ?? asRecord(DEFAULT_SET_DATA.universe),
    sets: sets.length ? sets : objectSets.length ? objectSets : (DEFAULT_SET_DATA.sets as Array<Record<string, unknown>>),
    regions: regions.length ? regions : (DEFAULT_SET_DATA.regions as Array<Record<string, unknown>>),
  };
}

function setCountLabel(source?: Record<string, unknown> | null) {
  const value = source?.countLabel ?? source?.count ?? source?.total ?? source?.totalLabel;
  return value === undefined || value === null ? "" : String(value);
}

function normalizedSetDiagramData(config: GraphConfig) {
  const { universe, sets, regions } = setSourceData(config);
  const leftSet = sets[0] ?? DEFAULT_SET_DATA.sets[0];
  const rightSet = sets[1] ?? DEFAULT_SET_DATA.sets[1];
  const normalizedRegions = DEFAULT_SET_DATA.regions.map((fallback, index) => {
    const source = regions[index] ?? fallback;
    return {
      ...fallback,
      ...source,
      name: penroseIdentifier(source.name, String(fallback.name)),
      label: source.label ?? source.value ?? fallback.label,
      shaded: source.shaded === true || source.shade === true,
    };
  });
  return {
    universe: {
      ...DEFAULT_SET_DATA.universe,
      ...universe,
      name: penroseIdentifier(universe?.name, "U"),
      label: universe?.label ?? "U",
      countLabel: setCountLabel(universe),
    },
    sets: [
      {
        ...DEFAULT_SET_DATA.sets[0],
        ...leftSet,
        name: penroseIdentifier(leftSet.name, "A"),
        label: leftSet.label ?? "A",
        countLabel: setCountLabel(leftSet),
      },
      {
        ...DEFAULT_SET_DATA.sets[1],
        ...rightSet,
        name: penroseIdentifier(rightSet.name, "B"),
        label: rightSet.label ?? "B",
        countLabel: setCountLabel(rightSet),
      },
    ],
    regions: normalizedRegions,
  };
}

function removePenroseSubstanceOverride(config: GraphConfig) {
  const options = { ...penroseOptions(config) };
  delete options.substanceSource;
  return options;
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

function setRegionShadePredicate(region: { shaded?: unknown; shade?: unknown; shadePredicate?: unknown }, index: number) {
  if (region.shaded !== true && region.shade !== true) return null;
  if (typeof region.shadePredicate === "string" && region.shadePredicate.trim()) {
    return penroseIdentifier(region.shadePredicate, "ShadeIntersection");
  }
  if (index === 0) return "ShadeLeftOnly";
  if (index === 1) return "ShadeIntersection";
  if (index === 2) return "ShadeRightOnly";
  return "ShadeOutside";
}

function generatedSetPenroseSubstance(config: GraphConfig) {
  const { universe, sets, regions } = setSourceData(config);
  const universeName = penroseIdentifier(universe?.name, "U");
  const leftSet = sets[0] ?? DEFAULT_SET_DATA.sets[0];
  const rightSet = sets[1] ?? DEFAULT_SET_DATA.sets[1];
  const leftName = penroseIdentifier(leftSet.name, "A");
  const rightName = penroseIdentifier(rightSet.name, "B");
  const regionEntries = DEFAULT_SET_DATA.regions.map((fallback, index) => {
    const source = regions[index] ?? fallback;
    return {
      name: penroseIdentifier(source.name, fallback.name),
      label: source.label ?? source.value ?? fallback.label,
      shaded: source.shaded === true || source.shade === true,
      shadePredicate: typeof source.shadePredicate === "string" ? source.shadePredicate : undefined,
    };
  });
  const [onlyA, intersection, onlyB, outside] = regionEntries;
  const lines = [
    `Universe ${universeName}`,
    `Set ${leftName}, ${rightName}`,
    `RegionLabel ${regionEntries.map((region) => region.name).join(", ")}`,
    penroseLabelStatement(universeName, universe?.label ?? "U"),
    penroseLabelStatement(leftName, leftSet.label ?? leftName),
    penroseLabelStatement(rightName, rightSet.label ?? rightName),
    ...regionEntries.map((region) => penroseLabelStatement(region.name, region.label)),
    `Venn(${universeName}, ${leftName}, ${rightName})`,
    `LabelsLeftOnly(${onlyA.name}, ${leftName}, ${rightName})`,
    `LabelsIntersection(${intersection.name}, ${leftName}, ${rightName})`,
    `LabelsRightOnly(${onlyB.name}, ${leftName}, ${rightName})`,
    `LabelsOutside(${outside.name}, ${universeName}, ${leftName}, ${rightName})`,
  ];
  regionEntries.forEach((region, index) => {
    const shadePredicate = setRegionShadePredicate(region, index);
    if (!shadePredicate) return;
    if (shadePredicate === "ShadeOutside") {
      lines.push(`${shadePredicate}(${universeName}, ${leftName}, ${rightName})`);
      return;
    }
    lines.push(`${shadePredicate}(${leftName}, ${rightName})`);
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

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function numberInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function graphWidth(graphConfig?: GraphConfig | null) {
  return graphConfig?.widthPx ?? DEFAULT_2D_GRAPH.widthPx ?? 680;
}

function graphHeight(graphConfig?: GraphConfig | null) {
  return graphDisplayHeight(graphConfig);
}

function lockedAspectHeight(graphConfig: GraphConfig, nextWidth: number) {
  const currentWidth = graphWidth(graphConfig);
  const currentHeight = graphConfig.heightPx ?? DEFAULT_2D_GRAPH.heightPx ?? 300;
  if (!Number.isFinite(currentWidth) || currentWidth <= 0 || !Number.isFinite(currentHeight) || currentHeight <= 0) {
    return currentHeight;
  }
  return Math.max(1, Math.round(nextWidth * (currentHeight / currentWidth)));
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

function safeProjectFileName(value: string) {
  const safeName = value
    .replace(/[<>:"/\\|?*]+/g, " ")
    .split("")
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return (safeName || "Untitled test").slice(0, 120);
}

function normalizeTestFolderPath(path: string) {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => safeProjectFileName(part))
    .filter(Boolean)
    .join("/");
}

function joinTestPath(folderPath: string, name: string) {
  const cleanFolder = normalizeTestFolderPath(folderPath);
  const cleanName = safeProjectFileName(name);
  return [cleanFolder, cleanName].filter(Boolean).join("/");
}

function projectPathForTestPath(relativePath: string) {
  const cleanPath = normalizeTestFolderPath(relativePath);
  return [TEST_FILE_ROOT, cleanPath].filter(Boolean).join("/");
}

function testPathFromProjectPath(path: string) {
  if (path === TEST_FILE_ROOT) return "";
  if (!path.startsWith(`${TEST_FILE_ROOT}/`)) return null;
  return path.slice(TEST_FILE_ROOT.length + 1);
}

function parentTestPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

function topLevelProjectPaths(filePaths: string[]) {
  const uniquePaths = [...new Set(filePaths)].sort((left, right) => left.localeCompare(right));
  return uniquePaths.filter((path) => !uniquePaths.some((candidate) => candidate !== path && path.startsWith(`${candidate}/`)));
}

function projectPathContains(containerPath: string, candidatePath: string) {
  return candidatePath === containerPath || candidatePath.startsWith(`${containerPath}/`);
}

function testPathBasename(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function ensureTestFileName(name: string) {
  const safeName = safeProjectFileName(name.replace(/\.test\.json$/i, "").replace(/\.json$/i, ""));
  return `${safeName}.test.json`;
}

function testFileDisplayName(name: string) {
  return name.replace(/\.test\.json$/i, "");
}

function formatProjectFileSize(size: unknown) {
  const bytes = typeof size === "number" && Number.isFinite(size) ? size : 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function isProjectTestFile(file: Pick<ProjectFileSummary, "kind" | "fileType" | "path">) {
  return file.kind === "file" && (file.fileType === "test" || file.path.endsWith(".test.json"));
}

function testFilePathKey(file: ProjectFileSummary) {
  return testPathFromProjectPath(file.path);
}

function visibleTestFiles(files: ProjectFileSummary[]) {
  return files
    .map((file) => {
      const testPath = testFilePathKey(file);
      return testPath === null ? null : { file, testPath };
    })
    .filter((entry): entry is { file: ProjectFileSummary; testPath: string } => {
      if (!entry) return false;
      if (entry.testPath === "") return false;
      return entry.file.kind === "folder" || isProjectTestFile(entry.file);
    });
}

function childTestFiles(files: ProjectFileSummary[], folderPath: string) {
  const cleanFolder = normalizeTestFolderPath(folderPath);
  return visibleTestFiles(files)
    .filter(({ testPath }) => parentTestPath(testPath) === cleanFolder)
    .sort((left, right) => {
      if (left.file.kind !== right.file.kind) return left.file.kind === "folder" ? -1 : 1;
      return testFileDisplayName(testPathBasename(left.testPath)).localeCompare(testFileDisplayName(testPathBasename(right.testPath)));
    });
}

function testFolderOptions(files: ProjectFileSummary[]) {
  const folders = visibleTestFiles(files)
    .filter(({ file }) => file.kind === "folder")
    .map(({ testPath }) => testPath)
    .sort((left, right) => left.localeCompare(right));
  return ["", ...folders];
}

function uniqueTestPath(files: ProjectFileSummary[], folderPath: string, baseName: string, kind: "file" | "folder") {
  const cleanFolder = normalizeTestFolderPath(folderPath);
  const existing = new Set(visibleTestFiles(files).map(({ testPath }) => testPath.toLowerCase()));
  const cleanBaseName =
    kind === "file" ? safeProjectFileName(baseName.replace(/\.test\.json$/i, "").replace(/\.json$/i, "")) : safeProjectFileName(baseName);
  const extension = kind === "file" ? ".test.json" : "";

  let suffix = "";
  let counter = 2;
  while (true) {
    const candidateName = `${cleanBaseName}${suffix}${extension}`;
    const candidatePath = [cleanFolder, candidateName].filter(Boolean).join("/");
    if (!existing.has(candidatePath.toLowerCase())) return candidatePath;
    suffix = ` copy${counter === 2 ? "" : ` ${counter}`}`;
    counter += 1;
  }
}

function normalizeDiagramAlignment(value: unknown): DiagramAlignment {
  return value === "left" || value === "right" || value === "center" ? value : "center";
}

function normalizeChoiceNumberingStyle(value: unknown): ChoiceNumberingStyle {
  return value === "upper-alpha" || value === "lower-alpha" || value === "decimal" || value === "bullet" || value === "roman"
    ? value
    : "roman";
}

function normalizeChoiceListLayout(value: unknown): ChoiceListLayout {
  return value === "two-column" || value === "inline" || value === "vertical" ? value : "vertical";
}

function normalizeChoiceItems(value: unknown): string[] {
  if (!Array.isArray(value)) return ["", "", ""];
  const choices = value.map((choice) => (typeof choice === "string" ? choice : String(choice ?? "")));
  return choices.length ? choices : [""];
}

function normalizeTableCellAlignment(value: unknown): TableCellAlignment {
  return value === "left" || value === "right" || value === "center" ? value : "center";
}

function normalizeTableCells(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((cell) => (typeof cell === "string" ? cell : String(cell ?? "")));
}

function normalizedTableColumnCount(headers: string[], rows: string[][]) {
  return Math.max(1, headers.length, ...rows.map((row) => row.length));
}

function paddedTableRow(row: string[], columnCount: number) {
  return Array.from({ length: columnCount }, (_, index) => row[index] ?? "");
}

function normalizeTableRows(value: unknown, fallbackColumnCount = 2): string[][] {
  if (!Array.isArray(value)) return [Array.from({ length: fallbackColumnCount }, () => "")];
  const rows = value.filter((row): row is unknown[] => Array.isArray(row)).map((row) => normalizeTableCells(row));
  return rows.length ? rows : [Array.from({ length: fallbackColumnCount }, () => "")];
}

function normalizeTableBlock(block: Extract<EditorContentBlock, { kind: "table" }>) {
  const headers = normalizeTableCells(block.headers);
  const rows = normalizeTableRows(block.rows, Math.max(2, headers.length || 0));
  const columnCount = normalizedTableColumnCount(headers, rows);
  return {
    ...block,
    headers: paddedTableRow(headers, columnCount),
    rows: rows.map((row) => paddedTableRow(row, columnCount)),
    showHeader: block.showHeader !== false,
    tableAlign: normalizeDiagramAlignment(block.tableAlign),
    cellAlignment: normalizeTableCellAlignment(block.cellAlignment),
  };
}

function plainTableRows(table: ReturnType<typeof normalizeTableBlock>) {
  return table.showHeader ? [table.headers, ...table.rows] : table.rows;
}

function plainTablePatch(rows: string[][]): Partial<Extract<EditorContentBlock, { kind: "table" }>> {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  return {
    headers: Array.from({ length: columnCount }, () => ""),
    rows: rows.map((row) => paddedTableRow(row, columnCount)),
    showHeader: false,
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

function isSolutionOnlyGraphFeature(feature: GraphFeature) {
  return feature.solutionOnly === true;
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

interface CollapsiblePanelProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  openSignal?: number;
  active?: boolean;
  className?: string;
  bodyClassName?: string;
}

function CollapsiblePanel({
  title,
  subtitle,
  leading,
  actions,
  children,
  defaultOpen = true,
  openSignal,
  active = false,
  className,
  bodyClassName,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen || openSignal !== undefined);

  useEffect(() => {
    if (openSignal === undefined) return;
    setOpen(true);
  }, [openSignal]);

  return (
    <section className={cn("rounded-md border bg-background transition-colors", className, active && EDITOR_ACTIVE_PANEL_CLASS)}>
      <div
        data-panel-region="header"
        className={cn("flex flex-wrap items-center gap-2 p-2 transition-colors", active && EDITOR_ACTIVE_HEADER_CLASS)}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="size-8 shrink-0"
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </Button>
        {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-36 flex-1 flex-col items-start gap-0.5 text-left"
          aria-expanded={open}
        >
          <span className="block max-w-full truncate text-sm font-semibold">{title}</span>
          {subtitle ? <span className="block max-w-full truncate text-xs text-muted-foreground">{subtitle}</span> : null}
        </button>
        {actions ? <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
      {open ? (
        <div data-panel-region="body" className={cn("border-t p-3", bodyClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function RemoveActionButton({ label, disabled = false, onRemove }: { label: string; disabled?: boolean; onRemove: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
      className="size-8"
    >
      <Trash2 />
    </Button>
  );
}

interface InsertionAction {
  label: string;
  tooltip?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

function ContentInsertionActions({
  buttonLabel = "Add",
  className,
  centered = false,
  spaceActionLabel = "Space",
  spaceActionTooltip,
  onAddText,
  onAddChoices,
  onAddTable,
  onAddDiagram,
  onAddSpace,
  extraActions = [],
}: {
  buttonLabel?: "Add";
  className?: string;
  centered?: boolean;
  spaceActionLabel?: string;
  spaceActionTooltip?: string;
  onAddText?: () => void;
  onAddChoices?: () => void;
  onAddTable?: () => void;
  onAddDiagram?: () => void;
  onAddSpace?: () => void;
  extraActions?: InsertionAction[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuIdRef = useRef<string | null>(null);
  if (!menuIdRef.current) {
    nextInsertMenuId += 1;
    menuIdRef.current = `insert-menu-${nextInsertMenuId}`;
  }
  const menuId = menuIdRef.current;
  const [open, setOpen] = useState(false);
  const actionVerb = buttonLabel;
  const actions: InsertionAction[] = [
    onAddText
      ? {
          label: "Text",
          tooltip: `${actionVerb} a text block here`,
          icon: <Type className="size-4" aria-hidden="true" />,
          onClick: onAddText,
        }
      : null,
    onAddChoices
      ? {
          label: "Choice list",
          tooltip: `${actionVerb} answer choices such as i, ii, iii`,
          icon: <ListOrdered className="size-4" aria-hidden="true" />,
          onClick: onAddChoices,
        }
      : null,
    onAddTable
      ? {
          label: "Table",
          tooltip: `${actionVerb} a table with LaTeX-ready cells`,
          icon: <Table2 className="size-4" aria-hidden="true" />,
          onClick: onAddTable,
        }
      : null,
    onAddDiagram
      ? {
          label: "Diagram",
          tooltip: `${actionVerb} a diagram block here`,
          icon: <ImagePlus className="size-4" aria-hidden="true" />,
          onClick: onAddDiagram,
        }
      : null,
    onAddSpace
      ? {
          label: spaceActionLabel,
          tooltip: spaceActionTooltip ?? `${actionVerb} blank working space here`,
          icon: <SeparatorHorizontal className="size-4" aria-hidden="true" />,
          onClick: onAddSpace,
        }
      : null,
    ...extraActions,
  ].filter((action): action is InsertionAction => Boolean(action));

  useLayoutEffect(() => {
    const closeOtherMenus = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== menuId) {
        setOpen(false);
      }
    };

    window.addEventListener(INSERT_MENU_OPEN_EVENT, closeOtherMenus);
    return () => window.removeEventListener(INSERT_MENU_OPEN_EVENT, closeOtherMenus);
  }, [menuId]);

  useLayoutEffect(() => {
    if (!open) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
  }, [open]);

  if (!actions.length) return null;

  return (
    <div className={cn("relative z-20 flex flex-wrap gap-2", centered && "justify-center", open && "z-50", className)}>
      <div
        ref={containerRef}
        className="relative inline-flex"
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
          setOpen(false);
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          className="relative z-10 bg-background shadow-sm"
          onClick={() =>
            setOpen((current) => {
              const nextOpen = !current;
              if (nextOpen) {
                window.dispatchEvent(new CustomEvent(INSERT_MENU_OPEN_EVENT, { detail: menuId }));
              }
              return nextOpen;
            })
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          <PlusCircle data-icon="inline-start" />
          {buttonLabel}
          <ChevronDown className="ml-1 size-4" aria-hidden="true" />
        </Button>
        {open ? (
          <div
            id={menuId}
            role="menu"
            className="absolute left-0 top-full z-[100] mt-2 min-w-48 overflow-hidden rounded-md border border-border bg-card p-1 text-card-foreground shadow-2xl ring-1 ring-slate-900/5 dark:ring-blue-300/10"
          >
            {actions.map((action, index) => (
              <button
                key={`${action.label}-${index}`}
                type="button"
                role="menuitem"
                title={action.tooltip}
                disabled={action.disabled}
                onClick={() => {
                  if (action.disabled) return;
                  setOpen(false);
                  action.onClick();
                }}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action.icon ?? <PlusCircle className="size-4" aria-hidden="true" />}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GeometricConstructionEditor({ config, onChange }: { config: GraphConfig; onChange: (patch: Partial<GraphConfig>) => void }) {
  const scalePercent = penroseScalePercent(config);
  const substanceSource = penroseSubstanceSource(config);
  const updateScale = (value: number) =>
    onChange({
      scalePercent: value,
      options: { ...penroseOptions(config), scalePercent: value },
      widthPx: undefined,
      heightPx: undefined,
    });
  const updateSubstance = (value: string) =>
    onChange({
      options: { ...penroseOptions(config), substanceSource: value },
      widthPx: undefined,
      heightPx: undefined,
    });
  const resampleLayout = () =>
    onChange({
      options: { ...penroseOptions(config), variation: id("penrose-layout") },
      widthPx: undefined,
      heightPx: undefined,
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-36 flex-col gap-2 text-xs font-medium">
          Diagram scale
          <input
            type="number"
            min={25}
            max={250}
            step={5}
            value={numberInputValue(scalePercent)}
            onChange={(event) => updateScale(optionalNumber(event.target.value) ?? DEFAULT_PENROSE_SCALE_PERCENT)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <Button type="button" variant="outline" className="self-end" onClick={() => updateScale(DEFAULT_PENROSE_SCALE_PERCENT)}>
          Original
        </Button>
        <Button type="button" variant="outline" className="self-end" onClick={resampleLayout}>
          <Shuffle className="mr-2 size-4" />
          Resample
        </Button>
      </div>
      <p className="max-w-3xl text-xs text-muted-foreground">
        Original construction canvas is {PENROSE_ORIGINAL_WIDTH}px wide. Scale changes display size only. Resample asks Penrose for another
        valid automatic layout.
      </p>
      <label className="flex flex-col gap-2 text-xs font-medium">
        Substance
        <Textarea
          key={`substance-${substanceSource}`}
          defaultValue={substanceSource}
          className="min-h-40 font-mono text-xs"
          spellCheck={false}
          onBlur={(event) => updateSubstance(event.currentTarget.value)}
        />
      </label>
    </div>
  );
}

type Graph3DViewState = typeof DEFAULT_3D_VIEW_STATE;

function graph3dViewState(config: GraphConfig): Graph3DViewState {
  const viewRecord = asRecord(config.metadata?.view3d) ?? {};
  return {
    az: finiteNumberOrDefault(viewRecord.az, DEFAULT_3D_VIEW_STATE.az),
    el: finiteNumberOrDefault(viewRecord.el, DEFAULT_3D_VIEW_STATE.el),
    bank: finiteNumberOrDefault(viewRecord.bank, DEFAULT_3D_VIEW_STATE.bank),
  };
}

function Graph3DGraphEditor({ config, onChange }: { config: GraphConfig; onChange: (patch: Partial<GraphConfig>) => void }) {
  const view = graph3dViewState(config);
  const updateView = (patch: Partial<Graph3DViewState>) =>
    onChange({
      metadata: {
        ...(config.metadata ?? {}),
        view3d: {
          ...view,
          ...patch,
        },
      },
    });
  const resetView = () =>
    onChange({
      metadata: {
        ...(config.metadata ?? {}),
        view3d: DEFAULT_3D_VIEW_STATE,
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Diagram width
          <input
            type="number"
            min={240}
            step={20}
            value={numberInputValue(config.widthPx)}
            onChange={(event) => onChange({ widthPx: optionalNumber(event.target.value) ?? DEFAULT_3D_GRAPH.widthPx })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Diagram height
          <input
            type="number"
            min={180}
            step={20}
            value={numberInputValue(config.heightPx)}
            onChange={(event) => onChange({ heightPx: optionalNumber(event.target.value) ?? DEFAULT_3D_GRAPH.heightPx })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
      </section>

      <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Azimuth
          <input
            type="number"
            step={0.05}
            value={numberInputValue(view.az)}
            onChange={(event) => updateView({ az: optionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.az })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Elevation
          <input
            type="number"
            step={0.05}
            value={numberInputValue(view.el)}
            onChange={(event) => updateView({ el: optionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.el })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Bank
          <input
            type="number"
            step={0.05}
            value={numberInputValue(view.bank)}
            onChange={(event) => updateView({ bank: optionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.bank })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <Button type="button" variant="outline" className="self-end" onClick={resetView}>
          Reset view
        </Button>
      </section>
    </div>
  );
}

type Vector2DLabelStyle = "boldLower" | "arrow" | "custom";

const VECTOR_2D_LABEL_STYLES: Array<{ value: Vector2DLabelStyle; label: string }> = [
  { value: "boldLower", label: "Bold lower-case" },
  { value: "arrow", label: "Arrow over points" },
  { value: "custom", label: "Custom LaTeX" },
];
type Vector2DPreset = "single" | "two-origin" | "addition" | "component-guides";
const VECTOR_2D_PRESETS: Array<{ value: Vector2DPreset; label: string }> = [
  { value: "single", label: "Single vector" },
  { value: "two-origin", label: "Two from origin" },
  { value: "addition", label: "Addition triangle" },
  { value: "component-guides", label: "Guide solution" },
];

type Vector2DControlEntry = {
  id: string;
  name: string;
  label: string;
  start: [number, number];
  components: [number, number];
  color: string;
  showComponents: boolean;
  labelX?: number;
  labelY?: number;
};

function finiteVectorNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function vectorPair(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value)) return fallback;
  return [finiteVectorNumber(value[0], fallback[0]), finiteVectorNumber(value[1], fallback[1])];
}

function finiteOptionalVectorNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function vector2dMetadata(config?: GraphConfig | null) {
  const metadata = config?.metadata ?? {};
  const vector2d = asRecord(metadata.vector2d) ?? {};
  return vector2d;
}

function vector2dLabelStyle(value: unknown, fallback: Vector2DLabelStyle = "boldLower"): Vector2DLabelStyle {
  return value === "boldLower" || value === "arrow" || value === "custom" ? value : fallback;
}

function defaultVector2DName(index: number, labelStyle: Vector2DLabelStyle) {
  if (labelStyle === "arrow") {
    const arrowNames = ["AB", "CD", "EF", "GH", "PQ", "RS", "UV", "WX"];
    return arrowNames[index] ?? `AB_${index + 1}`;
  }

  if (index >= 0 && index < 26) return String.fromCharCode(97 + index);
  return `v_${index + 1}`;
}

function normalizedVector2DEntries(config: GraphConfig): Vector2DControlEntry[] {
  const vector2d = vector2dMetadata(config);
  const rawVectors = Array.isArray(vector2d.vectors)
    ? vector2d.vectors
    : Array.isArray(config.metadata?.vectors)
      ? config.metadata.vectors
      : undefined;

  if (rawVectors?.length) {
    return rawVectors.map((entry, index) => {
      const record = asRecord(entry) ?? {};
      const fallback = DEFAULT_VECTOR_2D_METADATA.vector2d.vectors[index % DEFAULT_VECTOR_2D_METADATA.vector2d.vectors.length];
      const name = String(record.name ?? record.id ?? fallback.name);
      return {
        id: String(record.id ?? name ?? `v${index + 1}`),
        name,
        label: String(record.label ?? ""),
        start: vectorPair(record.start, fallback.start as [number, number]),
        components: vectorPair(record.components ?? record.vector, fallback.components as [number, number]),
        color: String(record.color ?? VECTOR_2D_COLORS[index % VECTOR_2D_COLORS.length]),
        showComponents: record.showComponents === true,
        labelX: finiteOptionalVectorNumber(record.labelX),
        labelY: finiteOptionalVectorNumber(record.labelY),
      };
    });
  }

  if (Array.isArray(config.metadata?.vector)) {
    return [
      {
        id: "a",
        name: "a",
        label: "",
        start: [0, 0],
        components: vectorPair(config.metadata.vector, [2, 3]),
        color: VECTOR_2D_COLORS[0],
        showComponents: false,
      },
    ];
  }

  return DEFAULT_VECTOR_2D_METADATA.vector2d.vectors.map((vector) => ({
    ...vector,
    start: vector.start as [number, number],
    components: vector.components as [number, number],
  }));
}

function vector2dMetadataFromEntries(config: GraphConfig, vectors: Vector2DControlEntry[]) {
  return {
    ...(config.metadata ?? {}),
    vector2d: {
      ...vector2dMetadata(config),
      vectors,
    },
  };
}

function vector2dPresetVectors(preset: Vector2DPreset): Vector2DControlEntry[] {
  if (preset === "single") {
    return [
      {
        id: "a",
        name: "a",
        label: "",
        start: [0, 0],
        components: [3, 2],
        color: VECTOR_2D_COLORS[1],
        showComponents: false,
      },
    ];
  }

  if (preset === "addition") {
    return [
      {
        id: "a",
        name: "a",
        label: "",
        start: [0, 0],
        components: [2, 1],
        color: VECTOR_2D_COLORS[0],
        showComponents: false,
      },
      {
        id: "b",
        name: "b",
        label: "",
        start: [2, 1],
        components: [2, 2],
        color: VECTOR_2D_COLORS[1],
        showComponents: false,
      },
      {
        id: "a-plus-b",
        name: "a+b",
        label: "",
        start: [0, 0],
        components: [4, 3],
        color: VECTOR_2D_COLORS[2],
        showComponents: false,
      },
    ];
  }

  const showComponents = preset === "component-guides";
  return DEFAULT_VECTOR_2D_METADATA.vector2d.vectors.map((vector) => ({
    ...vector,
    start: vector.start as [number, number],
    components: vector.components as [number, number],
    showComponents,
  }));
}

function vector2dPresetGraph(preset: Vector2DPreset): GraphConfig {
  const vectors = vector2dPresetVectors(preset);
  const yMin = preset === "two-origin" || preset === "component-guides" ? -4 : -1;
  const yMax = preset === "two-origin" || preset === "component-guides" ? 4 : 4;
  const xMax = preset === "single" || preset === "addition" ? 5 : 6;
  return {
    ...DEFAULT_VECTOR_2D_GRAPH,
    xMin: -1,
    xMax,
    yMin,
    yMax,
    widthPx: preset === "single" ? 420 : 520,
    heightPx: preset === "single" ? 300 : 320,
    metadata: {
      vector2d: {
        labelStyle: "boldLower",
        vectors,
      },
    },
  };
}

function Vector2DGraphEditor({ config, onChange }: { config: GraphConfig; onChange: (patch: Partial<GraphConfig>) => void }) {
  const vectors = normalizedVector2DEntries(config);
  const labelStyle = vector2dLabelStyle(vector2dMetadata(config).labelStyle);
  const patchVectors = (nextVectors: Vector2DControlEntry[]) => {
    onChange({
      functions: [],
      features: [],
      metadata: vector2dMetadataFromEntries(config, nextVectors),
    });
  };
  const updateLabelStyle = (nextLabelStyle: Vector2DLabelStyle) => {
    onChange({
      metadata: {
        ...(config.metadata ?? {}),
        vector2d: {
          ...vector2dMetadata(config),
          labelStyle: nextLabelStyle,
          vectors: vectors.map((vector, index) => {
            const autoNames = new Set([
              defaultVector2DName(index, "boldLower"),
              defaultVector2DName(index, "arrow"),
              defaultVector2DName(index, "custom"),
              `v_${index + 1}`,
            ]);
            return autoNames.has(vector.name) ? { ...vector, name: defaultVector2DName(index, nextLabelStyle) } : vector;
          }),
        },
      },
    });
  };
  const updateVector = (vectorIndex: number, patch: Partial<Vector2DControlEntry>) => {
    patchVectors(vectors.map((vector, index) => (index === vectorIndex ? { ...vector, ...patch } : vector)));
  };
  const addVector = () => {
    const index = vectors.length;
    patchVectors([
      ...vectors,
      {
        id: `v${index + 1}`,
        name: defaultVector2DName(index, labelStyle),
        label: "",
        start: [0, 0],
        components: [1, 1],
        color: VECTOR_2D_COLORS[index % VECTOR_2D_COLORS.length],
        showComponents: false,
      },
    ]);
  };
  const removeVector = (vectorIndex: number) => {
    if (vectors.length <= 1) return;
    patchVectors(vectors.filter((_, index) => index !== vectorIndex));
  };
  const applyPreset = (preset: Vector2DPreset) => {
    onChange(vector2dPresetGraph(preset));
  };
  const updateStart = (vectorIndex: number, axis: 0 | 1, value: number) => {
    const vector = vectors[vectorIndex];
    if (!vector) return;
    const start: [number, number] = [...vector.start];
    start[axis] = value;
    updateVector(vectorIndex, { start });
  };
  const updateComponents = (vectorIndex: number, axis: 0 | 1, value: number) => {
    const vector = vectors[vectorIndex];
    if (!vector) return;
    const components: [number, number] = [...vector.components];
    components[axis] = value;
    updateVector(vectorIndex, { components });
  };
  const updateLabelPosition = (vectorIndex: number, axis: 0 | 1, value?: number) => {
    updateVector(vectorIndex, axis === 0 ? { labelX: value } : { labelY: value });
  };
  const resetLabelPosition = (vectorIndex: number) => {
    updateVector(vectorIndex, { labelX: undefined, labelY: undefined });
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-end gap-3">
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          x min
          <input
            type="number"
            value={numberInputValue(config.xMin)}
            onChange={(event) => onChange({ xMin: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMin })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          x max
          <input
            type="number"
            value={numberInputValue(config.xMax)}
            onChange={(event) => onChange({ xMax: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMax })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          y min
          <input
            type="number"
            value={numberInputValue(config.yMin)}
            onChange={(event) => onChange({ yMin: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMin })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          y max
          <input
            type="number"
            value={numberInputValue(config.yMax)}
            onChange={(event) => onChange({ yMax: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMax })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          Width
          <input
            type="number"
            min={160}
            value={numberInputValue(config.widthPx)}
            onChange={(event) => onChange({ widthPx: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.widthPx })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-28 flex-col gap-2 text-xs font-medium">
          Height
          <input
            type="number"
            min={120}
            value={numberInputValue(config.heightPx)}
            onChange={(event) => onChange({ heightPx: optionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.heightPx })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex w-44 flex-col gap-2 text-xs font-medium">
          Label style
          <select
            value={labelStyle}
            onChange={(event) => updateLabelStyle(event.target.value as Vector2DLabelStyle)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          >
            {VECTOR_2D_LABEL_STYLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Presets</div>
        <div className="flex flex-wrap gap-2">
          {VECTOR_2D_PRESETS.map((preset) => (
            <Button key={preset.value} type="button" variant="outline" size="sm" onClick={() => applyPreset(preset.value)}>
              <Shuffle data-icon="inline-start" />
              {preset.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coordinate vectors</div>
          <Button type="button" variant="outline" size="sm" onClick={addVector}>
            <PlusCircle data-icon="inline-start" />
            Add vector
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {vectors.map((vector, vectorIndex) => (
            <div key={`${vector.id}-${vectorIndex}`} className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[120px_minmax(10rem,1fr)_96px_40px] md:items-end">
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Name
                  <input
                    value={vector.name}
                    onChange={(event) => updateVector(vectorIndex, { name: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                  />
                </label>
                {labelStyle === "custom" ? (
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Custom label
                    <input
                      value={vector.label}
                      onChange={(event) => updateVector(vectorIndex, { label: event.target.value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                ) : (
                  <div className="hidden md:block" />
                )}
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Colour
                  <input
                    type="color"
                    value={vector.color}
                    onChange={(event) => updateVector(vectorIndex, { color: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Remove vector"
                  aria-label="Remove vector"
                  onClick={() => removeVector(vectorIndex)}
                  className="size-9"
                  disabled={vectors.length <= 1}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(6,minmax(70px,1fr))_auto] md:items-end">
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Start x
                  <input
                    type="number"
                    value={numberInputValue(vector.start[0])}
                    onChange={(event) => updateStart(vectorIndex, 0, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Start y
                  <input
                    type="number"
                    value={numberInputValue(vector.start[1])}
                    onChange={(event) => updateStart(vectorIndex, 1, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  x comp.
                  <input
                    type="number"
                    value={numberInputValue(vector.components[0])}
                    onChange={(event) => updateComponents(vectorIndex, 0, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  y comp.
                  <input
                    type="number"
                    value={numberInputValue(vector.components[1])}
                    onChange={(event) => updateComponents(vectorIndex, 1, optionalNumber(event.target.value) ?? 0)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label x
                  <input
                    type="number"
                    value={numberInputValue(vector.labelX)}
                    onChange={(event) => updateLabelPosition(vectorIndex, 0, optionalNumber(event.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label y
                  <input
                    type="number"
                    value={numberInputValue(vector.labelY)}
                    onChange={(event) => updateLabelPosition(vectorIndex, 1, optionalNumber(event.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="col-span-2 md:col-span-1"
                  onClick={() => resetLabelPosition(vectorIndex)}
                >
                  Reset label
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Annotations</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {vectors.map((vector, vectorIndex) => (
            <label
              key={`${vector.id}-${vectorIndex}-guides`}
              className="flex h-10 items-center gap-2 rounded-md border bg-muted/20 px-3 text-sm"
            >
              <input
                type="checkbox"
                checked={vector.showComponents}
                onChange={(event) => updateVector(vectorIndex, { showComponents: event.target.checked })}
              />
              {vector.name || vector.id} component guides
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function vectorDataForSave(data: ReturnType<typeof normalizedVectorRelationshipData>) {
  const points = new Map<string, Record<string, unknown>>();
  data.objects.forEach((object) => {
    const name = penroseIdentifier(object.name, "");
    if (name) points.set(name, { type: "point", name, label: object.label ?? name });
  });
  data.relationships.forEach((relationship) => {
    relationship.points.forEach((point) => {
      const name = penroseIdentifier(point, "");
      if (name && !points.has(name)) points.set(name, { type: "point", name, label: name });
    });
  });
  return {
    hidePoints: data.hidePoints,
    hidePointLabels: data.hidePointLabels,
    objects: [...points.values()],
    relationships: data.relationships,
  };
}

function VectorRelationshipEditor({ config, onChange }: { config: GraphConfig; onChange: (patch: Partial<GraphConfig>) => void }) {
  const scalePercent = penroseScalePercent(config);
  const data = normalizedVectorRelationshipData(config);
  const hasSubstanceOverride = typeof config.options?.substanceSource === "string" && config.options.substanceSource.trim().length > 0;
  const patchVectorData = (nextData: ReturnType<typeof normalizedVectorRelationshipData>) => {
    onChange({
      data: vectorDataForSave(nextData),
      options: removePenroseSubstanceOverride(config),
      widthPx: undefined,
      heightPx: undefined,
    });
  };
  const updateScale = (value: number) =>
    onChange({
      scalePercent: value,
      options: { ...penroseOptions(config), scalePercent: value },
      widthPx: undefined,
      heightPx: undefined,
    });
  const updateVisibility = (
    patch: Partial<Pick<ReturnType<typeof normalizedVectorRelationshipData>, "hidePoints" | "hidePointLabels">>,
  ) => {
    patchVectorData({ ...data, ...patch });
  };
  const updateNode = (nodeIndex: number, patch: Partial<(typeof data)["objects"][number]>) => {
    patchVectorData({
      ...data,
      objects: data.objects.map((node, index) => {
        if (index !== nodeIndex) return node;
        const nextName = patch.name ? penroseIdentifier(patch.name, node.name) : node.name;
        return { ...node, ...patch, name: nextName, label: patch.label ?? node.label ?? nextName };
      }),
      relationships: data.relationships.map((relationship) => ({
        ...relationship,
        points: relationship.points.map((point) => {
          const currentNode = data.objects[nodeIndex];
          const nextName = patch.name ? penroseIdentifier(patch.name, currentNode.name) : currentNode.name;
          return point === currentNode.name ? nextName : point;
        }),
      })),
    });
  };
  const addNode = () => {
    const nextIndex = data.objects.length + 1;
    const name = penroseIdentifier(String.fromCharCode(64 + Math.min(nextIndex, 26)), `N${nextIndex}`);
    patchVectorData({
      ...data,
      objects: [...data.objects, { type: "point", name, label: name }],
    });
  };
  const removeNode = (nodeIndex: number) => {
    const node = data.objects[nodeIndex];
    if (!node || data.objects.length <= 1) return;
    patchVectorData({
      ...data,
      objects: data.objects.filter((_, index) => index !== nodeIndex),
      relationships: data.relationships.filter((relationship) => !relationship.points.includes(node.name)),
    });
  };
  const updateRelationship = (relationshipIndex: number, patch: Partial<(typeof data)["relationships"][number]>) => {
    patchVectorData({
      ...data,
      relationships: data.relationships.map((relationship, index) =>
        index === relationshipIndex ? { ...relationship, ...patch } : relationship,
      ),
    });
  };
  const addRelationship = () => {
    const pointNames = data.objects.map((object) => object.name);
    const start = pointNames[0] ?? "A";
    const end = pointNames[1] ?? "B";
    patchVectorData({
      ...data,
      relationships: [
        ...data.relationships,
        {
          type: "vectorSegment",
          name: penroseIdentifier(`${start}${end}${data.relationships.length + 1}`, `v${data.relationships.length + 1}`),
          points: [start, end],
          label: "",
        },
      ],
    });
  };
  const removeRelationship = (relationshipIndex: number) => {
    patchVectorData({
      ...data,
      relationships: data.relationships.filter((_, index) => index !== relationshipIndex),
    });
  };
  const useNetworkPreset = () => {
    patchVectorData({
      hidePoints: false,
      hidePointLabels: false,
      objects: DEFAULT_VECTOR_RELATIONSHIP_DATA.objects.map((object) => ({ ...object, label: object.name })),
      relationships: DEFAULT_VECTOR_RELATIONSHIP_DATA.relationships.map((relationship) => ({ ...relationship })),
    });
  };
  const updateSubstance = (value: string) =>
    onChange({
      options: { ...penroseOptions(config), substanceSource: value },
      widthPx: undefined,
      heightPx: undefined,
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-36 flex-col gap-2 text-xs font-medium">
          Diagram scale
          <input
            type="number"
            min={25}
            max={250}
            step={5}
            value={numberInputValue(scalePercent)}
            onChange={(event) => updateScale(optionalNumber(event.target.value) ?? DEFAULT_PENROSE_SCALE_PERCENT)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <Button type="button" variant="outline" className="self-end" onClick={() => updateScale(DEFAULT_PENROSE_SCALE_PERCENT)}>
          Original
        </Button>
        <Button type="button" variant="outline" className="self-end" onClick={useNetworkPreset}>
          Network preset
        </Button>
      </div>

      {hasSubstanceOverride ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This network diagram has custom Substance. Changing the controls below will clear that Substance override and return to structured
          network data.
        </div>
      ) : null}

      <section className="flex flex-wrap gap-4 border-t pt-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!data.hidePoints} onChange={(event) => updateVisibility({ hidePoints: !event.target.checked })} />
          Show node dots
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!data.hidePointLabels}
            onChange={(event) => updateVisibility({ hidePointLabels: !event.target.checked })}
          />
          Show node labels
        </label>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nodes</div>
          <Button type="button" variant="outline" size="sm" onClick={addNode}>
            <PlusCircle data-icon="inline-start" />
            Add node
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {data.objects.map((node, nodeIndex) => (
            <div
              key={`${node.name}-${nodeIndex}`}
              className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-[110px_minmax(0,1fr)_40px] md:items-end"
            >
              <label className="flex flex-col gap-2 text-xs font-medium">
                Node
                <input
                  value={node.name}
                  onChange={(event) => updateNode(nodeIndex, { name: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Label
                <input
                  value={String(node.label ?? "")}
                  onChange={(event) => updateNode(nodeIndex, { label: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Remove node"
                aria-label="Remove node"
                onClick={() => removeNode(nodeIndex)}
                className="size-9"
                disabled={data.objects.length <= 1}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Links</div>
          <Button type="button" variant="outline" size="sm" onClick={addRelationship}>
            <PlusCircle data-icon="inline-start" />
            Add link
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {data.relationships.map((relationship, relationshipIndex) => (
            <div
              key={`${relationship.name}-${relationshipIndex}`}
              className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-[140px_90px_90px_minmax(0,1fr)_40px] md:items-end"
            >
              <label className="flex flex-col gap-2 text-xs font-medium">
                Type
                <select
                  value={relationship.type}
                  onChange={(event) =>
                    updateRelationship(relationshipIndex, { type: event.target.value === "segment" ? "segment" : "vectorSegment" })
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  <option value="vectorSegment">Directed arrow</option>
                  <option value="segment">Undirected line</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                From
                <select
                  value={relationship.points[0] ?? ""}
                  onChange={(event) =>
                    updateRelationship(relationshipIndex, {
                      points: [penroseIdentifier(event.target.value, "O"), relationship.points[1] ?? "A"],
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  {data.objects.map((node) => (
                    <option key={node.name} value={node.name}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                To
                <select
                  value={relationship.points[1] ?? ""}
                  onChange={(event) =>
                    updateRelationship(relationshipIndex, {
                      points: [relationship.points[0] ?? "O", penroseIdentifier(event.target.value, "A")],
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  {data.objects.map((node) => (
                    <option key={node.name} value={node.name}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Label
                <input
                  value={String(relationship.label ?? "")}
                  onChange={(event) => updateRelationship(relationshipIndex, { label: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Remove link"
                aria-label="Remove link"
                onClick={() => removeRelationship(relationshipIndex)}
                className="size-9"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <CollapsiblePanel title="Advanced Substance" defaultOpen={false} className="bg-muted/20">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Substance
          <Textarea
            key={`vector-substance-${penroseSubstanceSource(config)}`}
            defaultValue={penroseSubstanceSource(config)}
            className="min-h-40 font-mono text-xs"
            spellCheck={false}
            onBlur={(event) => updateSubstance(event.currentTarget.value)}
          />
        </label>
      </CollapsiblePanel>
    </div>
  );
}

const SET_REGION_EDITOR_LABELS = ["A only", "A and B", "B only", "Outside"] as const;
const SET_REGION_COUNT_LABELS = ["8", "10", "6", "6"] as const;
const SET_SHADING_OPTIONS: Array<{ label: string; regionIndex: number | null }> = [
  { label: "None", regionIndex: null },
  { label: "A only", regionIndex: 0 },
  { label: "A and B", regionIndex: 1 },
  { label: "B only", regionIndex: 2 },
  { label: "Outside", regionIndex: 3 },
];

function SetDiagramEditor({ config, onChange }: { config: GraphConfig; onChange: (patch: Partial<GraphConfig>) => void }) {
  const scalePercent = penroseScalePercent(config);
  const data = normalizedSetDiagramData(config);
  const hasSubstanceOverride = typeof config.options?.substanceSource === "string" && config.options.substanceSource.trim().length > 0;
  const patchSetData = (nextData: typeof data) => {
    onChange({
      data: nextData,
      options: removePenroseSubstanceOverride(config),
      widthPx: undefined,
      heightPx: undefined,
    });
  };
  const updateScale = (value: number) =>
    onChange({
      scalePercent: value,
      options: { ...penroseOptions(config), scalePercent: value },
      widthPx: undefined,
      heightPx: undefined,
    });
  const updateUniverse = (patch: Partial<(typeof data)["universe"]>) => {
    patchSetData({ ...data, universe: { ...data.universe, ...patch } });
  };
  const updateSet = (setIndex: number, patch: Partial<(typeof data)["sets"][number]>) => {
    patchSetData({
      ...data,
      sets: data.sets.map((set, index) => (index === setIndex ? { ...set, ...patch } : set)),
    });
  };
  const updateRegion = (regionIndex: number, patch: Partial<(typeof data)["regions"][number]>) => {
    patchSetData({
      ...data,
      regions: data.regions.map((region, index) => (index === regionIndex ? { ...region, ...patch } : region)),
    });
  };
  const applyNotationLabels = () => {
    const [leftSet, rightSet] = data.sets;
    patchSetData({
      ...data,
      regions: data.regions.map((region, index) => ({
        ...region,
        label:
          index === 0
            ? `${leftSet.name} \\cap ${rightSet.name}'`
            : index === 1
              ? `${leftSet.name} \\cap ${rightSet.name}`
              : index === 2
                ? `${leftSet.name}' \\cap ${rightSet.name}`
                : `(${leftSet.name} \\cup ${rightSet.name})'`,
      })),
    });
  };
  const applyCountLabels = (includeTotals: boolean) => {
    patchSetData({
      ...data,
      universe: { ...data.universe, countLabel: includeTotals ? "30" : "" },
      sets: data.sets.map((set, index) => ({ ...set, countLabel: includeTotals ? (index === 0 ? "18" : "16") : "" })),
      regions: data.regions.map((region, index) => ({
        ...region,
        label: SET_REGION_COUNT_LABELS[index] ?? "",
      })),
    });
  };
  const clearShading = () => {
    patchSetData({
      ...data,
      regions: data.regions.map((region) => ({ ...region, shaded: false })),
    });
  };
  const setSingleShadedRegion = (regionIndex: number | null) => {
    patchSetData({
      ...data,
      regions: data.regions.map((region, index) => ({ ...region, shaded: regionIndex === index })),
    });
  };
  const updateSubstance = (value: string) =>
    onChange({
      options: { ...penroseOptions(config), substanceSource: value },
      widthPx: undefined,
      heightPx: undefined,
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-36 flex-col gap-2 text-xs font-medium">
          Diagram scale
          <input
            type="number"
            min={25}
            max={250}
            step={5}
            value={numberInputValue(scalePercent)}
            onChange={(event) => updateScale(optionalNumber(event.target.value) ?? DEFAULT_PENROSE_SCALE_PERCENT)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <Button type="button" variant="outline" className="self-end" onClick={() => updateScale(DEFAULT_PENROSE_SCALE_PERCENT)}>
          Original
        </Button>
        <Button type="button" variant="outline" className="self-end" onClick={applyNotationLabels}>
          Set notation
        </Button>
        <Button type="button" variant="outline" className="self-end" onClick={() => applyCountLabels(false)}>
          Counts
        </Button>
        <Button type="button" variant="outline" className="self-end" onClick={() => applyCountLabels(true)}>
          Counts + totals
        </Button>
      </div>

      {hasSubstanceOverride ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This set diagram has custom Substance. Changing the controls below will clear that Substance override and return to structured set
          diagram data.
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Universe label
          <input
            value={String(data.universe.label ?? "")}
            onChange={(event) => updateUniverse({ label: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          A label
          <input
            value={String(data.sets[0]?.label ?? "")}
            onChange={(event) => updateSet(0, { label: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          B label
          <input
            value={String(data.sets[1]?.label ?? "")}
            onChange={(event) => updateSet(1, { label: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional totals</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-xs font-medium">
            U total box
            <input
              value={String(data.universe.countLabel ?? "")}
              onChange={(event) => updateUniverse({ countLabel: event.target.value })}
              placeholder="optional"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            A total tab
            <input
              value={String(data.sets[0]?.countLabel ?? "")}
              onChange={(event) => updateSet(0, { countLabel: event.target.value })}
              placeholder="optional"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            B total tab
            <input
              value={String(data.sets[1]?.countLabel ?? "")}
              onChange={(event) => updateSet(1, { countLabel: event.target.value })}
              placeholder="optional"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regions</div>
          <div className="flex flex-wrap gap-2">
            {SET_SHADING_OPTIONS.map((option) => (
              <Button
                key={`${option.label}-${option.regionIndex ?? "none"}`}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => (option.regionIndex === null ? clearShading() : setSingleShadedRegion(option.regionIndex))}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.regions.map((region, regionIndex) => (
            <div
              key={region.name ?? regionIndex}
              className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-[90px_minmax(0,1fr)_90px] md:items-end"
            >
              <div className="text-sm font-medium">{SET_REGION_EDITOR_LABELS[regionIndex]}</div>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Label or count
                <input
                  value={String(region.label ?? "")}
                  onChange={(event) => updateRegion(regionIndex, { label: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={region.shaded === true}
                  onChange={(event) => updateRegion(regionIndex, { shaded: event.target.checked })}
                />
                Shaded
              </label>
            </div>
          ))}
        </div>
      </section>

      <CollapsiblePanel title="Advanced Substance" defaultOpen={false} className="bg-muted/20">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Substance
          <Textarea
            key={`set-substance-${penroseSubstanceSource(config)}`}
            defaultValue={penroseSubstanceSource(config)}
            className="min-h-40 font-mono text-xs"
            spellCheck={false}
            onBlur={(event) => updateSubstance(event.currentTarget.value)}
          />
        </label>
      </CollapsiblePanel>
    </div>
  );
}

function numberListText(values?: number[]) {
  return (values ?? []).join(", ");
}

function parseNumberList(value: string, fallback: number[]) {
  const values = value
    .split(/[\s,]+/)
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
  return values.length ? values : fallback;
}

function histogramYAxisLabel(mode?: StatsChartData["yAxisMode"]) {
  return mode === "relativeFrequency" ? "Relative frequency" : "Frequency";
}

function histogramManualProbabilityLabel() {
  return "P(X=x)";
}

function defaultStatsDataForType(chartType: StatsChartType, current: StatsChartData): Partial<StatsChartData> {
  if (chartType === "normal") {
    const mean = typeof current.mean === "number" ? current.mean : 0;
    const stdDev = typeof current.stdDev === "number" && current.stdDev > 0 ? current.stdDev : 1;
    return {
      chartType,
      mean,
      stdDev,
      range: current.range ?? [mean - 3 * stdDev, mean + 3 * stdDev],
      xLabel: current.xLabel || "x",
      yLabel: current.yLabel || "Density",
    };
  }

  if (chartType === "binomial") {
    return {
      chartType,
      trials: typeof current.trials === "number" ? current.trials : 10,
      probability: typeof current.probability === "number" ? current.probability : 0.5,
      xLabel: current.xLabel || "x",
      yLabel: current.yLabel || "Probability",
    };
  }

  if (chartType === "histogram") {
    const dataMode = current.dataMode ?? "raw";
    const yAxisMode = current.yAxisMode ?? "frequency";
    return {
      chartType,
      dataMode,
      barType: current.barType ?? "continuous",
      yAxisMode,
      yLabelOrientation: current.yLabelOrientation ?? "vertical",
      values: current.values?.length ? current.values : [3, 5, 7, 7, 8, 10],
      xValues: current.xValues?.length ? current.xValues : [2, 4, 5, 6, 7],
      probabilities: current.probabilities?.length ? current.probabilities : [0.1, 0.25, 0.3, 0.15, 0.2],
      xLabel: current.xLabel || (dataMode === "manualProbabilities" ? "x" : "Value"),
      yLabel: current.yLabel || (dataMode === "manualProbabilities" ? histogramManualProbabilityLabel() : histogramYAxisLabel(yAxisMode)),
    };
  }

  return {
    chartType,
    values: current.values?.length ? current.values : [1, 2, 3, 4, 5, 6, 7],
    xLabel: current.xLabel || "Value",
    yLabel: "",
  };
}

function StatsChartEditor({ config, onChange }: { config: GraphConfig; onChange: (patch: Partial<GraphConfig>) => void }) {
  const spec = normalizeStatsChartSpec(config);
  const data = spec.data;
  const options = spec.options ?? {};
  const updateData = (patch: Partial<StatsChartData>) => {
    const nextData = { ...data, ...patch };
    onChange({
      data: nextData,
      options,
      widthPx: options.widthPx,
      heightPx: options.heightPx,
    });
  };
  const updateOptions = (patch: Partial<StatsChartOptions>) => {
    const nextOptions = { ...options, ...patch };
    onChange({
      options: nextOptions,
      widthPx: nextOptions.widthPx,
      heightPx: nextOptions.heightPx,
    });
  };
  const values = data.values?.length ? data.values : data.chartType === "box" ? [1, 2, 3, 4, 5, 6, 7] : [3, 5, 7, 7, 8, 10];
  const xValues = data.xValues?.length ? data.xValues : [2, 4, 5, 6, 7];
  const probabilities = data.probabilities?.length ? data.probabilities : [0.1, 0.25, 0.3, 0.15, 0.2];
  const range = data.range ?? [-3, 3];
  const histogramDataMode = data.dataMode ?? "raw";
  const histogramBarType = data.barType ?? "continuous";
  const histogramYAxisMode = data.yAxisMode ?? "frequency";
  const histogramYLabelOrientation = data.yLabelOrientation ?? "vertical";
  const updateHistogramDataMode = (dataMode: StatsChartData["dataMode"]) => {
    updateData({
      dataMode,
      barType: dataMode === "manualProbabilities" ? "discrete" : histogramBarType,
      xLabel: dataMode === "manualProbabilities" ? "x" : data.xLabel || "Value",
      yLabel: dataMode === "manualProbabilities" ? histogramManualProbabilityLabel() : histogramYAxisLabel(histogramYAxisMode),
    });
  };
  const updateHistogramYAxisMode = (yAxisMode: StatsChartData["yAxisMode"]) => {
    updateData({
      yAxisMode,
      yLabel: histogramYAxisLabel(yAxisMode),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(180px,220px)_120px_120px] md:items-end">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Chart type
          <select
            value={data.chartType}
            onChange={(event) => updateData(defaultStatsDataForType(event.target.value as StatsChartType, data))}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          >
            {STATS_CHART_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Width
          <input
            type="number"
            min={240}
            step={20}
            value={numberInputValue(options.widthPx)}
            onChange={(event) => updateOptions({ widthPx: optionalNumber(event.target.value) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Height
          <input
            type="number"
            min={180}
            step={20}
            value={numberInputValue(options.heightPx)}
            onChange={(event) => updateOptions({ heightPx: optionalNumber(event.target.value) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
      </section>

      {data.chartType === "histogram" ? (
        <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-4">
          <label className="flex flex-col gap-2 text-xs font-medium">
            Data mode
            <select
              value={histogramDataMode}
              onChange={(event) => updateHistogramDataMode(event.target.value as StatsChartData["dataMode"])}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            >
              <option value="raw">Raw data</option>
              <option value="manualProbabilities">Manual probabilities</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Bar type
            <select
              value={histogramDataMode === "manualProbabilities" ? "discrete" : histogramBarType}
              disabled={histogramDataMode === "manualProbabilities"}
              onChange={(event) => updateData({ barType: event.target.value as StatsChartData["barType"] })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:opacity-60"
            >
              <option value="continuous">Continuous bins</option>
              <option value="discrete">Discrete values</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Y-axis
            <select
              value={histogramYAxisMode}
              disabled={histogramDataMode === "manualProbabilities"}
              onChange={(event) => updateHistogramYAxisMode(event.target.value as StatsChartData["yAxisMode"])}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:opacity-60"
            >
              <option value="frequency">Frequency</option>
              <option value="relativeFrequency">Relative frequency</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Y label
            <select
              value={histogramYLabelOrientation}
              onChange={(event) => updateData({ yLabelOrientation: event.target.value as StatsChartData["yLabelOrientation"] })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </label>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Title
          <input
            value={data.title ?? ""}
            onChange={(event) => updateData({ title: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          x-axis label
          <input
            value={data.xLabel ?? ""}
            onChange={(event) => updateData({ xLabel: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          y-axis label
          <input
            value={data.yLabel ?? ""}
            onChange={(event) => updateData({ yLabel: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
      </section>

      <section className="flex flex-wrap items-center gap-4 border-t pt-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={options.showGrid ?? true}
            onChange={(event) => updateOptions({ showGrid: event.target.checked })}
          />
          Gridlines
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={options.showFill !== false}
            onChange={(event) => updateOptions({ showFill: event.target.checked })}
          />
          Fill
        </label>
        <label className="flex items-center gap-2 text-xs font-medium">
          Fill colour
          <input
            type="color"
            value={typeof options.fillColor === "string" ? options.fillColor : "#f5f5f5"}
            disabled={options.showFill === false}
            onChange={(event) => updateOptions({ fillColor: event.target.value, showFill: true })}
            className="h-8 w-14 rounded-md border border-input bg-background p-1 disabled:opacity-45"
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-medium">
          Opacity
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={numberInputValue(typeof options.fillOpacity === "number" ? options.fillOpacity : 1)}
            disabled={options.showFill === false}
            onChange={(event) => {
              const nextOpacity = optionalNumber(event.target.value);
              updateOptions({
                fillOpacity: typeof nextOpacity === "number" && Number.isFinite(nextOpacity) ? clamp(nextOpacity, 0, 1) : undefined,
                showFill: true,
              });
            }}
            className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:opacity-45"
          />
        </label>
      </section>

      {data.chartType === "normal" ? (
        <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-4">
          <label className="flex flex-col gap-2 text-xs font-medium">
            Mean
            <input
              type="number"
              step={0.1}
              value={numberInputValue(data.mean)}
              onChange={(event) => updateData({ mean: optionalNumber(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Standard deviation
            <input
              type="number"
              min={0.01}
              step={0.1}
              value={numberInputValue(data.stdDev)}
              onChange={(event) => updateData({ stdDev: optionalNumber(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Range min
            <input
              type="number"
              step={0.5}
              value={numberInputValue(range[0])}
              onChange={(event) => updateData({ range: [optionalNumber(event.target.value) ?? range[0], range[1]] })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Range max
            <input
              type="number"
              step={0.5}
              value={numberInputValue(range[1])}
              onChange={(event) => updateData({ range: [range[0], optionalNumber(event.target.value) ?? range[1]] })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </section>
      ) : data.chartType === "binomial" ? (
        <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-medium">
            Trials
            <input
              type="number"
              min={1}
              step={1}
              value={numberInputValue(data.trials)}
              onChange={(event) => updateData({ trials: optionalNumber(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Probability
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={numberInputValue(data.probability)}
              onChange={(event) => updateData({ probability: optionalNumber(event.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </section>
      ) : data.chartType === "histogram" && histogramDataMode === "manualProbabilities" ? (
        <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-medium">
            x values
            <Textarea
              key={`manual-x-${numberListText(xValues)}`}
              defaultValue={numberListText(xValues)}
              className="min-h-24 font-mono text-xs"
              spellCheck={false}
              onBlur={(event) => updateData({ xValues: parseNumberList(event.currentTarget.value, xValues) })}
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Probabilities
            <Textarea
              key={`manual-p-${numberListText(probabilities)}`}
              defaultValue={numberListText(probabilities)}
              className="min-h-24 font-mono text-xs"
              spellCheck={false}
              onBlur={(event) => updateData({ probabilities: parseNumberList(event.currentTarget.value, probabilities) })}
            />
          </label>
        </section>
      ) : (
        <section
          className={cn(
            "grid grid-cols-1 gap-3 border-t pt-3",
            data.chartType === "histogram" && histogramBarType === "continuous"
              ? "md:grid-cols-[minmax(0,1fr)_120px_120px]"
              : "md:grid-cols-1",
          )}
        >
          <label className="flex flex-col gap-2 text-xs font-medium">
            Data values
            <Textarea
              key={`${data.chartType}-${numberListText(values)}`}
              defaultValue={numberListText(values)}
              className="min-h-24 font-mono text-xs"
              spellCheck={false}
              onBlur={(event) => updateData({ values: parseNumberList(event.currentTarget.value, values) })}
            />
          </label>
          {data.chartType === "histogram" && histogramBarType === "continuous" ? (
            <>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Bin size
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={numberInputValue(data.binSize)}
                  onChange={(event) => updateData({ binSize: optionalNumber(event.target.value) })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Bins
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={numberInputValue(data.bins)}
                  onChange={(event) => updateData({ bins: optionalNumber(event.target.value) })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

function TestFileManager({
  files,
  status,
  message,
  activeProjectFilePath,
  onNewTest,
  onOpenFile,
  onCreateFolder,
  onExportBackup,
  onImportBackup,
  onRenameItem,
  onDuplicateItems,
  onMoveItems,
  onDeleteItems,
  onListVersions,
  onRestoreVersion,
}: {
  files: ProjectFileSummary[];
  status: ProjectFilesStatus;
  message: string;
  activeProjectFilePath: string | null;
  onNewTest: () => void;
  onOpenFile: (filePath: string) => void;
  onCreateFolder: (folderPath: string) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onRenameItem: (filePath: string) => void;
  onDuplicateItems: (filePaths: string[]) => void;
  onMoveItems: (filePaths: string[], targetFolderPath: string) => void;
  onDeleteItems: (filePaths: string[]) => void;
  onListVersions: (filePath: string) => Promise<ProjectFileVersion[]>;
  onRestoreVersion: (filePath: string, versionId: string) => Promise<void>;
}) {
  const [currentFolderPath, setCurrentFolderPath] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [draggedPaths, setDraggedPaths] = useState<string[]>([]);
  const [dropTargetFolderPath, setDropTargetFolderPath] = useState<string | null>(null);
  const [versionsTestPath, setVersionsTestPath] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProjectFileVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionStatus, setVersionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [versionMessage, setVersionMessage] = useState("");
  const backupImportInputRef = useRef<HTMLInputElement>(null);
  const visibleEntries = useMemo(() => visibleTestFiles(files), [files]);
  const folderOptions = useMemo(() => testFolderOptions(files), [files]);
  const currentItems = useMemo(() => childTestFiles(files, currentFolderPath), [currentFolderPath, files]);
  const currentItemPaths = useMemo(() => currentItems.map((item) => item.testPath), [currentItems]);
  const selectedEntries = useMemo(
    () => visibleEntries.filter(({ testPath }) => selectedPaths.has(testPath)),
    [selectedPaths, visibleEntries],
  );
  const selectedEntry = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const selectedProjectPaths = selectedEntries.map(({ testPath }) => projectPathForTestPath(testPath));
  const selectedCount = selectedEntries.length;
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null;
  const selectedVersionPreview = selectedVersion ? projectFileVersionPreview(selectedVersion) : null;
  const activeRelativePath = activeProjectFilePath ? testPathFromProjectPath(activeProjectFilePath) : null;
  const busy = status === "loading" || status === "saving";
  const breadcrumbTargets = useMemo(() => {
    const parts = currentFolderPath.split("/").filter(Boolean);
    return [
      { label: TEST_FILE_ROOT_LABEL, path: "" },
      ...parts.map((part, index) => ({
        label: part,
        path: parts.slice(0, index + 1).join("/"),
      })),
    ];
  }, [currentFolderPath]);

  useEffect(() => {
    if (currentFolderPath && !folderOptions.includes(currentFolderPath)) {
      setCurrentFolderPath("");
      setSelectedPaths(new Set());
      setLastSelectedPath(null);
    }
  }, [currentFolderPath, folderOptions]);

  useEffect(() => {
    const availablePaths = new Set(visibleEntries.map(({ testPath }) => testPath));
    setSelectedPaths((current) => {
      const next = new Set([...current].filter((testPath) => availablePaths.has(testPath)));
      return next.size === current.size ? current : next;
    });
    if (lastSelectedPath && !availablePaths.has(lastSelectedPath)) {
      setLastSelectedPath(null);
    }
    if (versionsTestPath && !availablePaths.has(versionsTestPath)) {
      setVersionsTestPath(null);
      setVersions([]);
      setSelectedVersionId(null);
      setVersionStatus("idle");
      setVersionMessage("");
    }
  }, [lastSelectedPath, versionsTestPath, visibleEntries]);

  function navigateToFolder(folderPath: string) {
    setCurrentFolderPath(normalizeTestFolderPath(folderPath));
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
    setDropTargetFolderPath(null);
  }

  function clearFileSelection() {
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
    setVersionsTestPath(null);
    setVersions([]);
    setSelectedVersionId(null);
    setVersionStatus("idle");
    setVersionMessage("");
  }

  function editableFileManagerTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function handleFileManagerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (busy || editableFileManagerTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === "a") {
      event.preventDefault();
      setSelectedPaths(new Set(currentItemPaths));
      setLastSelectedPath(currentItemPaths.at(-1) ?? null);
      return;
    }
    if (event.key === "Escape") {
      if (!selectedCount && !versionsTestPath) return;
      event.preventDefault();
      clearFileSelection();
      return;
    }
    if (event.key === "Enter") {
      if (!selectedEntry) return;
      event.preventDefault();
      openSelected();
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && selectedCount) {
      event.preventDefault();
      onDeleteItems(selectedProjectPaths);
    }
  }

  function handleItemClick(event: ReactMouseEvent<HTMLButtonElement>, testPath: string) {
    if (event.shiftKey && lastSelectedPath) {
      const itemPaths = currentItems.map((item) => item.testPath);
      const startIndex = itemPaths.indexOf(lastSelectedPath);
      const endIndex = itemPaths.indexOf(testPath);
      if (startIndex !== -1 && endIndex !== -1) {
        const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        setSelectedPaths(new Set(itemPaths.slice(start, end + 1)));
      } else {
        setSelectedPaths(new Set([testPath]));
      }
    } else if (event.metaKey || event.ctrlKey) {
      setSelectedPaths((current) => {
        const next = new Set(current);
        if (next.has(testPath)) {
          next.delete(testPath);
        } else {
          next.add(testPath);
        }
        return next;
      });
    } else {
      setSelectedPaths(new Set([testPath]));
    }
    setLastSelectedPath(testPath);
  }

  function canMoveTestPathsToFolder(testPaths: string[], targetFolderPath: string) {
    const cleanTargetFolder = normalizeTestFolderPath(targetFolderPath);
    if (busy || !testPaths.length) return false;

    return testPaths.every((testPath) => {
      const entry = visibleEntries.find((candidate) => candidate.testPath === testPath);
      if (!entry) return false;
      if (parentTestPath(testPath) === cleanTargetFolder) return false;
      if (entry.file.kind === "folder" && (cleanTargetFolder === testPath || cleanTargetFolder.startsWith(`${testPath}/`))) return false;
      return true;
    });
  }

  function dragPathsFromEvent(event: DragEvent<HTMLElement>) {
    const raw = event.dataTransfer.getData("application/x-mauth-test-paths");
    if (!raw) return draggedPaths;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : draggedPaths;
    } catch {
      return draggedPaths;
    }
  }

  function handleItemDragStart(event: DragEvent<HTMLElement>, testPath: string) {
    const testPaths = selectedPaths.has(testPath) ? [...selectedPaths] : [testPath];
    setSelectedPaths(new Set(testPaths));
    setLastSelectedPath(testPath);
    setDraggedPaths(testPaths);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-mauth-test-paths", JSON.stringify(testPaths));
    event.dataTransfer.setData("text/plain", testPaths.join("\n"));
  }

  function handleDragEnd() {
    setDraggedPaths([]);
    setDropTargetFolderPath(null);
  }

  function handleDragOverFolder(event: DragEvent<HTMLElement>, targetFolderPath: string) {
    const testPaths = dragPathsFromEvent(event);
    if (!canMoveTestPathsToFolder(testPaths, targetFolderPath)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTargetFolderPath(normalizeTestFolderPath(targetFolderPath));
  }

  function handleDragLeaveFolder(event: DragEvent<HTMLElement>, targetFolderPath: string) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    const cleanTargetFolder = normalizeTestFolderPath(targetFolderPath);
    setDropTargetFolderPath((current) => (current === cleanTargetFolder ? null : current));
  }

  function handleDropOnFolder(event: DragEvent<HTMLElement>, targetFolderPath: string) {
    event.preventDefault();
    event.stopPropagation();
    const testPaths = dragPathsFromEvent(event);
    setDraggedPaths([]);
    setDropTargetFolderPath(null);
    if (!canMoveTestPathsToFolder(testPaths, targetFolderPath)) return;
    onMoveItems(
      testPaths.map((testPath) => projectPathForTestPath(testPath)),
      targetFolderPath,
    );
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  }

  function dropTargetClass(targetFolderPath: string) {
    return dropTargetFolderPath === normalizeTestFolderPath(targetFolderPath)
      ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/25"
      : "";
  }

  function openSelected() {
    if (!selectedEntry) return;
    if (selectedEntry.file.kind === "folder") {
      navigateToFolder(selectedEntry.testPath);
      return;
    }
    onOpenFile(projectPathForTestPath(selectedEntry.testPath));
  }

  async function openVersionHistory() {
    if (!selectedEntry || selectedEntry.file.kind === "folder") return;
    const testPath = selectedEntry.testPath;
    const filePath = projectPathForTestPath(testPath);
    setVersionsTestPath(testPath);
    setVersionStatus("loading");
    setVersionMessage("Loading versions");
    try {
      const nextVersions = await onListVersions(filePath);
      setVersions(nextVersions);
      setSelectedVersionId(nextVersions[0]?.id ?? null);
      setVersionStatus("ready");
      setVersionMessage(
        nextVersions.length ? `${nextVersions.length} previous version${nextVersions.length === 1 ? "" : "s"}` : "No previous versions yet",
      );
    } catch {
      setVersions([]);
      setSelectedVersionId(null);
      setVersionStatus("error");
      setVersionMessage("Versions unavailable");
    }
  }

  async function restoreVersion(version: ProjectFileVersion) {
    if (!versionsTestPath) return;
    const filePath = projectPathForTestPath(versionsTestPath);
    const fileName = testFileDisplayName(testPathBasename(versionsTestPath));
    const shouldRestore = window.confirm(`Restore "${fileName}" to revision ${version.revision}? This creates a new current version.`);
    if (!shouldRestore) return;
    setVersionStatus("loading");
    setVersionMessage("Restoring version");
    try {
      await onRestoreVersion(filePath, version.id);
      const nextVersions = await onListVersions(filePath);
      setVersions(nextVersions);
      setSelectedVersionId(nextVersions[0]?.id ?? null);
      setVersionStatus("ready");
      setVersionMessage(`Restored revision ${version.revision}`);
    } catch {
      setVersionStatus("error");
      setVersionMessage("Restore failed");
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3" tabIndex={0} onKeyDown={handleFileManagerKeyDown}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onNewTest} disabled={busy}>
          <PlusCircle data-icon="inline-start" />
          New test
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onCreateFolder(currentFolderPath)} disabled={busy}>
          <PlusCircle data-icon="inline-start" />
          New folder
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onExportBackup} disabled={busy}>
          <Download data-icon="inline-start" />
          Backup ZIP
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => backupImportInputRef.current?.click()} disabled={busy}>
          <Upload data-icon="inline-start" />
          Import ZIP
        </Button>
        <input
          ref={backupImportInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) onImportBackup(file);
          }}
        />
      </div>

      <div className="flex min-h-9 items-center gap-2 rounded-md border bg-background px-2 text-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!currentFolderPath}
          title="Back"
          aria-label="Back"
          data-mauth-folder-back={parentTestPath(currentFolderPath)}
          onClick={() => navigateToFolder(parentTestPath(currentFolderPath))}
          onDragOver={(event) => {
            if (currentFolderPath) handleDragOverFolder(event, parentTestPath(currentFolderPath));
          }}
          onDragLeave={(event) => {
            if (currentFolderPath) handleDragLeaveFolder(event, parentTestPath(currentFolderPath));
          }}
          onDrop={(event) => {
            if (currentFolderPath) handleDropOnFolder(event, parentTestPath(currentFolderPath));
          }}
          className={cn("size-7", currentFolderPath && dropTargetClass(parentTestPath(currentFolderPath)))}
        >
          <ChevronLeft />
        </Button>
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {breadcrumbTargets.map((target, index) => (
            <Fragment key={target.path || "root"}>
              {index ? <span className="text-muted-foreground">/</span> : null}
              <button
                type="button"
                title={`Open ${target.path || TEST_FILE_ROOT_LABEL}`}
                data-mauth-folder-breadcrumb={target.path}
                onClick={() => navigateToFolder(target.path)}
                onDragOver={(event) => handleDragOverFolder(event, target.path)}
                onDragLeave={(event) => handleDragLeaveFolder(event, target.path)}
                onDrop={(event) => handleDropOnFolder(event, target.path)}
                className={cn(
                  "min-w-0 truncate rounded px-2 py-1 font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  target.path === currentFolderPath && "text-foreground",
                  target.path !== currentFolderPath && "text-muted-foreground",
                  dropTargetClass(target.path),
                )}
              >
                {target.label}
              </button>
            </Fragment>
          ))}
        </span>
      </div>

      <div
        data-mauth-folder-pane={currentFolderPath}
        className={cn(
          "min-h-0 flex-1 overflow-hidden rounded-lg border bg-background transition-colors",
          dropTargetClass(currentFolderPath),
        )}
        onDragOver={(event) => handleDragOverFolder(event, currentFolderPath)}
        onDragLeave={(event) => handleDragLeaveFolder(event, currentFolderPath)}
        onDrop={(event) => handleDropOnFolder(event, currentFolderPath)}
      >
        <div className="max-h-[56vh] min-h-72 overflow-y-auto">
          {currentItems.length ? (
            currentItems.map(({ file, testPath }) => {
              const active = activeRelativePath === testPath;
              const selected = selectedPaths.has(testPath);
              const name = file.kind === "folder" ? testPathBasename(testPath) : testFileDisplayName(testPathBasename(testPath));
              return (
                <button
                  key={file.path}
                  type="button"
                  data-mauth-file-path={testPath}
                  draggable={!busy}
                  aria-selected={selected}
                  onClick={(event) => handleItemClick(event, testPath)}
                  onDoubleClick={() => {
                    if (file.kind === "folder") {
                      navigateToFolder(testPath);
                    } else {
                      onOpenFile(file.path);
                    }
                  }}
                  onDragStart={(event) => handleItemDragStart(event, testPath)}
                  onDragEnd={handleDragEnd}
                  onDragOver={file.kind === "folder" ? (event) => handleDragOverFolder(event, testPath) : undefined}
                  onDragLeave={file.kind === "folder" ? (event) => handleDragLeaveFolder(event, testPath) : undefined}
                  onDrop={file.kind === "folder" ? (event) => handleDropOnFolder(event, testPath) : undefined}
                  className={cn(
                    "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/60",
                    selected && "bg-primary/10 hover:bg-primary/10",
                    file.kind === "folder" && dropTargetClass(testPath),
                  )}
                >
                  {file.kind === "folder" ? (
                    <FolderOpen className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{name}</span>
                      {active ? (
                        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                          Open
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {file.kind === "folder"
                        ? "Folder"
                        : `${formatProjectFileSize(file.sizeBytes)} - ${new Date(file.updatedAt).toLocaleString()}`}
                    </span>
                  </span>
                  <ChevronRight className={cn("size-4 text-muted-foreground", file.kind !== "folder" && "opacity-0")} aria-hidden="true" />
                </button>
              );
            })
          ) : (
            <div className="px-3 py-12 text-center text-sm text-muted-foreground">
              {status === "loading" ? "Loading files..." : status === "error" ? message || "Files unavailable." : "No files here yet."}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Button type="button" variant="outline" size="sm" disabled={!selectedEntry || busy} onClick={openSelected}>
          Open
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedEntry || busy}
          onClick={() => selectedEntry && onRenameItem(projectPathForTestPath(selectedEntry.testPath))}
        >
          <Pencil data-icon="inline-start" />
          Rename
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedCount || busy}
          onClick={() => onDuplicateItems(selectedProjectPaths)}
        >
          <Copy data-icon="inline-start" />
          Duplicate
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedEntry || selectedEntry.file.kind === "folder" || busy}
          onClick={() => void openVersionHistory()}
        >
          Versions
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selectedCount || busy}
          onClick={() => onDeleteItems(selectedProjectPaths)}
        >
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
      </div>

      {versionsTestPath ? (
        <div className="rounded-lg border bg-background p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">Versions: {testFileDisplayName(testPathBasename(versionsTestPath))}</h3>
              <p className="truncate text-xs text-muted-foreground">{versionMessage}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setVersionsTestPath(null);
                setVersions([]);
                setSelectedVersionId(null);
                setVersionStatus("idle");
                setVersionMessage("");
              }}
            >
              Close
            </Button>
          </div>
          {versionStatus === "loading" ? (
            <p className="py-3 text-sm text-muted-foreground">Loading versions...</p>
          ) : versions.length ? (
            <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="max-h-80 overflow-y-auto rounded-md border">
                {versions.map((version) => {
                  const selected = selectedVersion?.id === version.id;
                  return (
                    <div
                      key={version.id}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0",
                        selected && "bg-primary/10",
                      )}
                    >
                      <button type="button" className="min-w-0 text-left" onClick={() => setSelectedVersionId(version.id)}>
                        <p className="truncate font-medium">Revision {version.revision}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {new Date(version.createdAt).toLocaleString()}
                          {version.reason ? ` - ${version.reason}` : ""}
                        </p>
                      </button>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedVersionId(version.id)}>
                          Preview
                        </Button>
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void restoreVersion(version)}>
                          Restore
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedVersion && selectedVersionPreview ? (
                <div className="min-w-0 rounded-md border bg-muted/20 p-3">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold">{selectedVersionPreview.title}</h4>
                      <p className="truncate text-xs text-muted-foreground">{selectedVersionPreview.subtitle}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      r{selectedVersion.revision}
                    </Badge>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {selectedVersionPreview.details.map((detail) => (
                      <span key={detail} className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                        {detail}
                      </span>
                    ))}
                  </div>
                  {selectedVersionPreview.questions.length ? (
                    <ul className="mb-3 max-h-28 overflow-y-auto rounded border bg-background p-2 text-xs">
                      {selectedVersionPreview.questions.map((question) => (
                        <li key={question} className="truncate py-0.5">
                          {question}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <details className="group">
                    <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground group-open:mb-2">
                      Raw snapshot
                    </summary>
                    <pre className="max-h-44 overflow-auto rounded border bg-background p-2 text-[10px] leading-snug text-muted-foreground">
                      {selectedVersionPreview.rawPreview}
                    </pre>
                  </details>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="py-3 text-sm text-muted-foreground">
              {versionStatus === "error" ? versionMessage || "Versions unavailable." : "No previous versions yet."}
            </p>
          )}
        </div>
      ) : null}

      <p className="min-h-4 truncate text-xs text-muted-foreground">
        {message ||
          (selectedCount
            ? `${selectedCount} selected. Drag onto a folder, breadcrumb, or empty folder pane to move.`
            : "Shift-click or Cmd/Ctrl-click to select. Drag onto folders or breadcrumbs to move.")}
      </p>
    </section>
  );
}

function storageStatusTone(status: HeaderSaveStatus) {
  if (status === "saved" || status === "ready") return "bg-emerald-400";
  if (status === "draft") return "bg-amber-300";
  if (status === "saving" || status === "loading") return "bg-amber-300";
  if (status === "dirty") return "bg-orange-300";
  return "bg-red-400";
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
        className="flex h-8 w-[min(42rem,42vw)] min-w-[14rem] flex-col justify-center rounded-md border border-blue-300/20 bg-[#050b1d] px-2"
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

function assistantResultMessage(result: MauthAssistantAdapterResult<QuestionBlock, FrontMatterConfig, FormattingConfig>) {
  if (!result.ok) return result.error || "Tool failed.";
  const data = asRecord(result.data);
  if (result.toolName === "mauth.document.inspect") {
    const counts = asRecord(data?.counts);
    const questionsCount = typeof counts?.questions === "number" ? counts.questions : 0;
    const marksTotal = typeof counts?.marksTotal === "number" ? counts.marksTotal : 0;
    return `Inspected ${questionsCount} question${questionsCount === 1 ? "" : "s"} and ${marksTotal} mark${marksTotal === 1 ? "" : "s"}.`;
  }
  if (result.toolName === "mauth.validation.run") {
    return result.warnings.length
      ? `Validation completed with ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}.`
      : "Validation completed with no warnings.";
  }
  if (result.toolName === "mauth.actions.preview") {
    const preview = asRecord(data?.preview);
    const requested = typeof preview?.requestedActionCount === "number" ? preview.requestedActionCount : result.changedIds.length;
    return `Previewed ${requested} action${requested === 1 ? "" : "s"}.`;
  }
  if (result.toolName === "mauth.actions.apply") {
    return `Applied changes to ${result.changedIds.length} item${result.changedIds.length === 1 ? "" : "s"}.`;
  }
  if (result.toolName === "mauth.author.replaceQuestion") {
    return result.changedIds.length ? "Replaced the question." : "Question authoring completed.";
  }
  if (result.toolName === "mauth.author.addDiagram") {
    return result.changedIds.length ? "Added the diagram." : "Diagram authoring completed.";
  }
  if (result.toolName === "mauth.author.ensureSolutions") {
    return result.changedIds.length ? "Updated the solutions." : "Solution authoring completed.";
  }
  if (result.toolName === "mauth.files.list") {
    const files = Array.isArray(data?.files) ? data.files : (result.files ?? []);
    return `Listed ${files.length} file${files.length === 1 ? "" : "s"} or folder${files.length === 1 ? "" : "s"}.`;
  }
  if (result.changedPaths.length) {
    return `Changed ${result.changedPaths.length} path${result.changedPaths.length === 1 ? "" : "s"}.`;
  }
  return "Tool completed.";
}

function mergeAssistantUsageSummary(
  current: AssistantUsageSummary | null | undefined,
  next: AssistantUsageSummary | null | undefined,
): AssistantUsageSummary | null {
  if (!current) return next ?? null;
  if (!next) return current;
  const currentCost = typeof current.estimatedCostUsd === "number" ? current.estimatedCostUsd : null;
  const nextCost = typeof next.estimatedCostUsd === "number" ? next.estimatedCostUsd : null;
  return {
    model: current.model === next.model ? current.model : `${current.model} + ${next.model}`,
    inputTokens: current.inputTokens + next.inputTokens,
    cachedInputTokens: current.cachedInputTokens + next.cachedInputTokens,
    billableInputTokens: current.billableInputTokens + next.billableInputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    totalTokens: current.totalTokens + next.totalTokens,
    estimatedCostUsd: currentCost === null || nextCost === null ? null : currentCost + nextCost,
    pricingSource: current.pricingSource === next.pricingSource ? current.pricingSource : current.pricingSource || next.pricingSource,
  };
}

function addUsageToLastAssistantMessage(messages: MauthAssistantChatMessage[], usage: AssistantUsageSummary): MauthAssistantChatMessage[] {
  const nextMessages = [...messages];
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index];
    if (message.role === "assistant") {
      nextMessages[index] = { ...message, usage };
      return nextMessages;
    }
  }
  return [...messages, { id: id("assistant-message"), role: "assistant", content: "Done.", usage }];
}

interface AssistantPendingToolContinuation {
  responseId: string | null;
  toolCalls: AssistantProviderToolCall[];
}

interface AssistantToolLoopResult {
  responseId: string | null;
  usage: AssistantUsageSummary | null;
  pending: AssistantPendingToolContinuation | null;
}

function assistantToolCallFromProvider(toolCall: AssistantProviderToolCall): MauthAssistantAdapterToolCall | null {
  const mauthToolName =
    typeof toolCall.mauthToolName === "string" ? toolCall.mauthToolName : toolCall.name.startsWith("mauth.") ? toolCall.name : "";
  if (!mauthToolName) return null;
  return {
    name: mauthToolName as MauthAssistantAdapterToolCall["name"],
    arguments: toolCall.mauthArguments ?? toolCall.arguments ?? {},
  } as MauthAssistantAdapterToolCall;
}

function assistantActivityLabelForTool(name: MauthAssistantAdapterToolCall["name"]) {
  if (name === "mauth.document.inspect") return "Inspecting document";
  if (name === "mauth.validation.run") return "Checking document";
  if (name === "mauth.actions.preview") return "Previewing changes";
  if (name === "mauth.actions.apply") return "Applying changes";
  if (name === "mauth.author.replaceQuestion") return "Writing question";
  if (name === "mauth.author.addDiagram") return "Adding diagram";
  if (name === "mauth.author.ensureSolutions") return "Writing solutions";
  if (name === "mauth.files.list") return "Reading files";
  if (name === "mauth.files.open") return "Opening file";
  if (name === "mauth.files.save" || name === "mauth.files.saveAs") return "Saving file";
  if (name.startsWith("mauth.files.")) return "Updating files";
  return "Using Mauth tools";
}

function compactAssistantProviderOutput(
  result: MauthAssistantAdapterResult<QuestionBlock, FrontMatterConfig, FormattingConfig>,
): Record<string, unknown> {
  const data = asRecord(result.data);
  const preview = asRecord(data?.preview);
  const validation = asRecord(data?.validation);
  const files = result.files ?? (Array.isArray(data?.files) ? data.files : undefined);
  const output: Record<string, unknown> = {
    ok: result.ok,
    toolName: result.toolName,
    kind: result.kind,
    message: assistantResultMessage(result),
    changedIds: result.changedIds,
    changedPaths: result.changedPaths,
    warnings: result.warnings.map((warning) => ({ code: warning.code, message: warning.message })),
    error: result.error ?? null,
    committedDocument: result.committedDocument,
    activeFilePath: result.activeFilePath ?? null,
  };

  if (result.toolName === "mauth.document.inspect") output.documentSummary = result.data ?? null;
  if (result.toolName === "mauth.validation.run") output.validation = result.data ?? null;
  if (Array.isArray(data?.validationIssues)) output.validationIssues = data.validationIssues;
  if (preview) output.preview = preview;
  if (validation) output.validation = validation;
  if (files) {
    output.files = files
      .filter((file): file is ProjectFileSummary => asRecord(file) !== null)
      .map((file) => ({
        path: file.path,
        name: file.name,
        kind: file.kind,
        fileType: file.fileType,
        updatedAt: file.updatedAt,
      }));
  }

  return output;
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

function FileManagementDrawer({
  open,
  projectFiles,
  projectFilesStatus,
  projectFilesMessage,
  activeProjectFilePath,
  onClose,
  onNewTest,
  onOpenProjectFile,
  onCreateProjectFolder,
  onExportProjectBackup,
  onImportProjectBackup,
  onRenameProjectFile,
  onDuplicateProjectFiles,
  onMoveProjectFiles,
  onDeleteProjectFiles,
  onListProjectFileVersions,
  onRestoreProjectFileVersion,
}: {
  open: boolean;
  projectFiles: ProjectFileSummary[];
  projectFilesStatus: ProjectFilesStatus;
  projectFilesMessage: string;
  activeProjectFilePath: string | null;
  onClose: () => void;
  onNewTest: () => void;
  onOpenProjectFile: (filePath: string) => void;
  onCreateProjectFolder: (folderPath: string) => void;
  onExportProjectBackup: () => void;
  onImportProjectBackup: (file: File) => void;
  onRenameProjectFile: (filePath: string) => void;
  onDuplicateProjectFiles: (filePaths: string[]) => void;
  onMoveProjectFiles: (filePaths: string[], targetFolderPath: string) => void;
  onDeleteProjectFiles: (filePaths: string[]) => void;
  onListProjectFileVersions: (filePath: string) => Promise<ProjectFileVersion[]>;
  onRestoreProjectFileVersion: (filePath: string, versionId: string) => Promise<void>;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/35 p-4 pt-20" onMouseDown={onClose}>
      <aside
        className="ml-auto flex max-h-[calc(100vh-6rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        aria-label="Files"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div className="flex min-w-0 items-center gap-2">
            <FolderOpen className="size-5 text-primary" aria-hidden="true" />
            <h2 className="truncate text-base font-semibold">Files</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" title="Close files" aria-label="Close files" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <TestFileManager
            files={projectFiles}
            status={projectFilesStatus}
            message={projectFilesMessage}
            activeProjectFilePath={activeProjectFilePath}
            onNewTest={onNewTest}
            onOpenFile={(filePath) => {
              onOpenProjectFile(filePath);
              onClose();
            }}
            onCreateFolder={onCreateProjectFolder}
            onExportBackup={onExportProjectBackup}
            onImportBackup={onImportProjectBackup}
            onRenameItem={onRenameProjectFile}
            onDuplicateItems={onDuplicateProjectFiles}
            onMoveItems={onMoveProjectFiles}
            onDeleteItems={onDeleteProjectFiles}
            onListVersions={onListProjectFileVersions}
            onRestoreVersion={onRestoreProjectFileVersion}
          />
        </div>
      </aside>
    </div>
  );
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

interface TextBlockEditorProps {
  label: string;
  text: string;
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  minHeightClassName: string;
  onChange: (text: string) => void;
  onRemove: () => void;
}

function textBlockSummary(text: string) {
  return text.trim().replace(/\s+/g, " ") || "Empty text block";
}

function choiceItemsText(choices: string[]) {
  return normalizeChoiceItems(choices).join("\n");
}

function parseChoiceItemsText(value: string) {
  const choices = value.split(/\r?\n/).map((choice) => choice.trimEnd());
  return choices.length ? choices : [""];
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

function TextBlockEditor({
  label,
  text,
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  minHeightClassName,
  onChange,
  onRemove,
}: TextBlockEditorProps) {
  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label={label} summary={textBlockSummary(text)} />}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
      active={active}
      openSignal={openSignal}
    >
      <div className="flex flex-col gap-2">
        <Textarea
          aria-label={label}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={cn("font-mono", minHeightClassName)}
        />
      </div>
    </CollapsiblePanel>
  );
}

interface ChoiceListBlockEditorProps {
  label: string;
  block: Extract<EditorContentBlock, { kind: "choices" }>;
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  onChange: (patch: Partial<Extract<EditorContentBlock, { kind: "choices" }>>) => void;
  onRemove: () => void;
}

function ChoiceListBlockEditor({
  label,
  block,
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  onChange,
  onRemove,
}: ChoiceListBlockEditorProps) {
  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label={label} summary={choiceListSummary(block)} />}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
      active={active}
      openSignal={openSignal}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Labels
          <select
            value={normalizeChoiceNumberingStyle(block.numberingStyle)}
            onChange={(event) => onChange({ numberingStyle: event.target.value as ChoiceNumberingStyle })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          >
            {CHOICE_NUMBERING_STYLES.map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Layout
          <select
            value={normalizeChoiceListLayout(block.layout)}
            onChange={(event) => onChange({ layout: event.target.value as ChoiceListLayout })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          >
            {CHOICE_LIST_LAYOUTS.map((layout) => (
              <option key={layout.value} value={layout.value}>
                {layout.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium md:row-span-2">
          Choices
          <Textarea
            aria-label={`${label} choices`}
            value={choiceItemsText(block.choices)}
            onChange={(event) => onChange({ choices: parseChoiceItemsText(event.target.value) })}
            className="min-h-[110px] font-mono"
          />
        </label>
      </div>
    </CollapsiblePanel>
  );
}

interface TableBlockEditorProps {
  label: string;
  block: Extract<EditorContentBlock, { kind: "table" }>;
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  onChange: (patch: Partial<Extract<EditorContentBlock, { kind: "table" }>>) => void;
  onRemove: () => void;
}

const MIN_TABLE_ROWS = 1;
const MAX_TABLE_ROWS = 24;
const MIN_TABLE_COLUMNS = 1;
const MAX_TABLE_COLUMNS = 12;

function clampedTableDimension(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function tableEditorContentLength(value: string) {
  const readableSource = value
    .replace(/\\[a-zA-Z]+/g, "mm")
    .replace(/[{}_$^]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(readableSource).length;
}

function tableEditorColumnWidthCh(table: ReturnType<typeof normalizeTableBlock>, columnIndex: number) {
  const values = plainTableRows(table).map((row) => row[columnIndex] ?? "");
  const longestValue = Math.max(1, ...values.map(tableEditorContentLength));
  return Math.min(42, Math.max(6, longestValue + 3));
}

function TableBlockEditor({
  label,
  block,
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  onChange,
  onRemove,
}: TableBlockEditorProps) {
  const table = normalizeTableBlock(block);
  const tableRows = plainTableRows(table);
  const columnCount = Math.max(1, ...tableRows.map((row) => row.length));
  const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) => tableEditorColumnWidthCh(table, columnIndex));
  const patchTable = (patch: Partial<Extract<EditorContentBlock, { kind: "table" }>>) => onChange({ ...patch });
  const updateRows = (rows: string[][]) => patchTable(plainTablePatch(rows));
  const updateCell = (rowIndex: number, columnIndex: number, value: string) =>
    updateRows(
      tableRows.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex ? row.map((cell, currentColumnIndex) => (currentColumnIndex === columnIndex ? value : cell)) : row,
      ),
    );
  const resizeColumns = (nextColumnCountValue: number) => {
    const nextColumnCount = clampedTableDimension(nextColumnCountValue, MIN_TABLE_COLUMNS, MAX_TABLE_COLUMNS);
    updateRows(tableRows.map((row) => paddedTableRow(row, nextColumnCount).slice(0, nextColumnCount)));
  };
  const resizeRows = (nextRowCountValue: number) => {
    const nextRowCount = clampedTableDimension(nextRowCountValue, MIN_TABLE_ROWS, MAX_TABLE_ROWS);
    updateRows(
      Array.from({ length: nextRowCount }, (_, rowIndex) =>
        paddedTableRow(tableRows[rowIndex] ?? Array.from({ length: columnCount }, () => ""), columnCount),
      ),
    );
  };

  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label={label} summary={tableBlockSummary(table)} />}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
      active={active}
      openSignal={openSignal}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(120px,1fr)_minmax(120px,1fr)_96px_96px]">
          <label className="flex flex-col gap-2 text-xs font-medium">
            Position
            <select
              value={table.tableAlign}
              onChange={(event) => patchTable({ tableAlign: event.target.value as DiagramAlignment })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            >
              {DIAGRAM_ALIGNMENTS.map((alignment) => (
                <option key={alignment.value} value={alignment.value}>
                  {alignment.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Cell text
            <select
              value={table.cellAlignment}
              onChange={(event) => patchTable({ cellAlignment: event.target.value as TableCellAlignment })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            >
              {TABLE_CELL_ALIGNMENTS.map((alignment) => (
                <option key={alignment.value} value={alignment.value}>
                  {alignment.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Rows
            <input
              type="number"
              min={MIN_TABLE_ROWS}
              max={MAX_TABLE_ROWS}
              value={tableRows.length}
              onChange={(event) => resizeRows(event.currentTarget.valueAsNumber)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Columns
            <input
              type="number"
              min={MIN_TABLE_COLUMNS}
              max={MAX_TABLE_COLUMNS}
              value={columnCount}
              onChange={(event) => resizeColumns(event.currentTarget.valueAsNumber)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </div>

        <div className="rounded-md border bg-muted/20 p-2">
          <div tabIndex={0} aria-label="Table editor cells" className="table-editor-scroll">
            <table className="table-editor-table">
              <colgroup>
                {columnWidths.map((width, columnIndex) => (
                  <col key={`column-width-${columnIndex}`} style={{ width: `${width}ch` }} />
                ))}
              </colgroup>
              <tbody>
                {tableRows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((cell, columnIndex) => (
                      <td key={`cell-${rowIndex}-${columnIndex}`}>
                        <input
                          aria-label={`Table cell row ${rowIndex + 1} column ${columnIndex + 1}`}
                          value={cell}
                          onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                          className="table-editor-input"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </CollapsiblePanel>
  );
}

interface SpaceBlockEditorProps {
  label: string;
  lines: number;
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  onChange: (lines: number) => void;
  onRemove: () => void;
}

function SpaceBlockEditor({
  label,
  lines,
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  onChange,
  onRemove,
}: SpaceBlockEditorProps) {
  const normalizedLines = spaceLines(lines);

  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label={label} summary={`${normalizedLines} line${normalizedLines === 1 ? "" : "s"}`} />}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
      active={active}
      openSignal={openSignal}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,11rem)_minmax(0,10rem)]">
        <label className="flex max-w-40 flex-col gap-2 text-xs font-medium">
          Lines
          <input
            type="number"
            min={0}
            step={1}
            value={normalizedLines}
            onChange={(event) => onChange(spaceLines(event.target.value))}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
      </div>
    </CollapsiblePanel>
  );
}

function ImageDiagramEditor({ config, onChange }: { config: GraphConfig; onChange: (patch: Partial<GraphConfig>) => void }) {
  const data = imageDiagramData(config);
  const previewWidth = Math.min(graphWidth(config), 520);

  function uploadImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) return;

      const name = imageNameFromFile(file.name);
      const commitImage = (naturalWidth?: number, naturalHeight?: number) => {
        const dimensions = diagramImageDimensions(naturalWidth, naturalHeight);
        onChange({
          data: {
            src,
            name,
            alt: name,
            mimeType: file.type,
            naturalWidth,
            naturalHeight,
          },
          widthPx: dimensions.widthPx,
          heightPx: dimensions.heightPx,
          functions: [],
          features: [],
        });
      };

      const image = new Image();
      image.onload = () => commitImage(image.naturalWidth, image.naturalHeight);
      image.onerror = () => commitImage();
      image.src = src;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="flex min-h-40 items-center justify-center rounded-md border bg-white p-3">
        {data.src ? (
          <img
            className="max-h-72 max-w-full object-contain"
            src={data.src}
            alt={imageDiagramAlt(config)}
            style={{ width: previewWidth }}
          />
        ) : (
          <span className="text-xs text-muted-foreground">No image selected</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 md:w-44 md:flex-col">
        <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
          <ImagePlus className="size-4" aria-hidden="true" />
          Upload image
          <input
            type="file"
            accept="image/*,.svg"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) uploadImage(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {data.src ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-center"
            onClick={() =>
              onChange({
                data: DEFAULT_IMAGE_DIAGRAM.data,
                widthPx: DEFAULT_IMAGE_DIAGRAM.widthPx,
                heightPx: DEFAULT_IMAGE_DIAGRAM.heightPx,
                functions: [],
                features: [],
              })
            }
          >
            <Trash2 data-icon="inline-start" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
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
  const updateDiagramWidth = (value: string) => {
    const widthPx = optionalNumber(value);
    if (typeof widthPx !== "number" || !Number.isFinite(widthPx)) {
      patchConfig({ widthPx });
      return;
    }
    patchConfig(config.lockAspectRatio && !config.equalScale ? { widthPx, heightPx: lockedAspectHeight(config, widthPx) } : { widthPx });
  };
  const functions = config.functions ?? [];
  const features = config.features ?? [];
  const visibleFeatureEntries = features
    .map((feature, featureIndex) => ({ feature, featureIndex }))
    .filter(({ feature }) => showSolutions || !isSolutionOnlyGraphFeature(feature));
  const functionOptions = functions.map((graphFunction, index) => ({
    value: index,
    label: `${index + 1}: ${graphFunction.label || graphFunctionLabel(index)}`,
  }));
  const updateFunction = (functionIndex: number, patch: Partial<GraphFunction>) => {
    patchConfig({
      functions: functions.map((graphFunction, index) => (index === functionIndex ? { ...graphFunction, ...patch } : graphFunction)),
    });
  };
  const addFunction = () => {
    patchConfig({ functions: [...functions, createGraphFunction(functions.length)] });
  };
  const removeFunction = (functionIndex: number) => {
    const nextFunctions = functions.filter((_, index) => index !== functionIndex);
    patchConfig({ functions: nextFunctions });
  };
  const setFunctionKind = (functionIndex: number, kind: GraphFunctionKind) => {
    const graphFunction = functions[functionIndex];
    updateFunction(functionIndex, {
      kind,
      expression: graphFunction.expression || (kind === "relation" ? "x^2 + y^2 = 1" : "x"),
      pieces: kind === "piecewise" ? graphPiecesFromFunction(graphFunction, config) : [],
    });
  };
  const updatePiece = (functionIndex: number, pieceIndex: number, patch: Partial<GraphFunctionPiece>) => {
    const graphFunction = functions[functionIndex];
    const pieces = graphPiecesFromFunction(graphFunction, config);
    updateFunction(functionIndex, {
      pieces: pieces.map((piece, index) => (index === pieceIndex ? { ...piece, ...patch } : piece)),
    });
  };
  const addPiece = (functionIndex: number) => {
    const graphFunction = functions[functionIndex];
    const pieces = graphPiecesFromFunction(graphFunction, config);
    updateFunction(functionIndex, {
      kind: "piecewise",
      pieces: [...pieces, createGraphPiece("x", config.xMin, config.xMax)],
    });
  };
  const removePiece = (functionIndex: number, pieceIndex: number) => {
    const graphFunction = functions[functionIndex];
    const pieces = graphPiecesFromFunction(graphFunction, config).filter((_, index) => index !== pieceIndex);
    updateFunction(functionIndex, {
      pieces: pieces.length ? pieces : [createGraphPiece(graphFunction.expression || "x", config.xMin, config.xMax)],
    });
  };
  const updateFeature = (featureIndex: number, patch: Partial<GraphFeature>) => {
    patchConfig({
      features: features.map((feature, index) => (index === featureIndex ? { ...feature, ...patch } : feature)),
    });
  };
  const updateRelationTangentCoordinate = (
    featureIndex: number,
    feature: GraphFeature,
    graphFunction: GraphFunction | undefined,
    axis: "x" | "y",
    value: number | undefined,
  ) => {
    if (graphFunction?.kind !== "relation") {
      updateFeature(featureIndex, { [axis]: value });
      return;
    }

    const snapped =
      axis === "x"
        ? snapImplicitRelationPointAtX(graphFunction.expression, value, feature.y, config)
        : snapImplicitRelationPointAtY(graphFunction.expression, value, feature.x, config);
    updateFeature(
      featureIndex,
      snapped
        ? {
            x: Number(snapped[0].toFixed(6)),
            y: Number(snapped[1].toFixed(6)),
          }
        : { [axis]: value },
    );
  };
  const addFeature = () => {
    patchConfig({ features: [...features, createGraphFeature("point", features.length, config)] });
  };
  const removeFeature = (featureIndex: number) => {
    patchConfig({ features: features.filter((_, index) => index !== featureIndex) });
  };
  const setFeatureKind = (featureIndex: number, kind: GraphFeatureKind) => {
    const current = features[featureIndex];
    const currentIsRegion = isRegionFeatureKind(current.kind);
    const nextIsRegion = isRegionFeatureKind(kind);
    const defaultFeature = createGraphFeature(kind, featureIndex, config);
    updateFeature(featureIndex, {
      ...defaultFeature,
      id: current.id,
      color: current.color,
      strokeWidth: currentIsRegion === nextIsRegion ? current.strokeWidth : defaultFeature.strokeWidth,
      strokeStyle:
        currentIsRegion === nextIsRegion
          ? current.strokeStyle
          : nextIsRegion
            ? "none"
            : current.strokeStyle === "none"
              ? "solid"
              : current.strokeStyle,
      show: current.show ?? true,
      solutionOnly: current.solutionOnly === true,
      label: current.label || defaultFeature.label,
      kind,
    });
  };
  const diagramActions = (
    <>
      <select
        aria-label={`${label} type`}
        value={config.type}
        onChange={(event) => patchConfig(diagramTypePatch(event.target.value, config))}
        className="h-9 w-52 max-w-full rounded-md border border-input bg-background px-2 text-sm font-normal"
      >
        {DIAGRAM_TYPE_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.values.map((value) => {
              const type = DIAGRAM_TYPES.find((diagramType) => diagramType.value === value);
              if (!type) return null;
              return (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
      <select
        aria-label={`${label} position`}
        value={alignment}
        onChange={(event) => onAlignmentChange(event.target.value as DiagramAlignment)}
        className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm font-normal"
      >
        {DIAGRAM_ALIGNMENTS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />
    </>
  );
  if (config.type === "image") {
    const imageSummary = imageDiagramData(config).src ? imageDiagramName(config) : "No image selected";
    return (
      <CollapsiblePanel
        title={<InlineSummaryTitle label={label} summary={imageSummary} />}
        leading={dragHandle}
        actions={diagramActions}
        className={cn("bg-background", muted && "bg-muted/30")}
        bodyClassName="p-3"
        active={active}
        openSignal={openSignal}
      >
        <ImageDiagramEditor config={config} onChange={patchConfig} />
      </CollapsiblePanel>
    );
  }

  if (isPenroseDiagramType(config.type)) {
    return (
      <CollapsiblePanel
        title={<InlineSummaryTitle label={label} summary={diagramConfigSummary(config)} />}
        leading={dragHandle}
        actions={diagramActions}
        className={cn("bg-background", muted && "bg-muted/30")}
        bodyClassName="p-3"
        active={active}
        openSignal={openSignal}
      >
        {config.type === "vectorRelationship" ? (
          <VectorRelationshipEditor config={config} onChange={patchConfig} />
        ) : config.type === "setDiagram" ? (
          <SetDiagramEditor config={config} onChange={patchConfig} />
        ) : (
          <GeometricConstructionEditor config={config} onChange={patchConfig} />
        )}
      </CollapsiblePanel>
    );
  }

  if (config.type === "vector2d") {
    return (
      <CollapsiblePanel
        title={<InlineSummaryTitle label={label} summary={diagramConfigSummary(config)} />}
        leading={dragHandle}
        actions={diagramActions}
        className={cn("bg-background", muted && "bg-muted/30")}
        bodyClassName="graph-editor-controls p-3"
        active={active}
        openSignal={openSignal}
      >
        <Vector2DGraphEditor config={config} onChange={patchConfig} />
      </CollapsiblePanel>
    );
  }

  if (config.type === "graph3d") {
    return (
      <CollapsiblePanel
        title={<InlineSummaryTitle label={label} summary={diagramConfigSummary(config)} />}
        leading={dragHandle}
        actions={diagramActions}
        className={cn("bg-background", muted && "bg-muted/30")}
        bodyClassName="graph-editor-controls p-3"
        active={active}
        openSignal={openSignal}
      >
        <Graph3DGraphEditor config={config} onChange={patchConfig} />
      </CollapsiblePanel>
    );
  }

  if (config.type === "statsChart") {
    return (
      <CollapsiblePanel
        title={<InlineSummaryTitle label={label} summary={statsChartSummary(config)} />}
        leading={dragHandle}
        actions={diagramActions}
        className={cn("bg-background", muted && "bg-muted/30")}
        bodyClassName="p-3"
        active={active}
        openSignal={openSignal}
      >
        <StatsChartEditor config={config} onChange={patchConfig} />
      </CollapsiblePanel>
    );
  }

  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label={label} summary={diagramConfigSummary(config)} />}
      leading={dragHandle}
      actions={diagramActions}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="graph-editor-controls p-3"
      active={active}
      openSignal={openSignal}
    >
      <CollapsiblePanel
        title={<InlineSummaryTitle label="Axes and grid" summary="Domain, range, graph size, grid intervals and arrows" />}
        defaultOpen={false}
        className="mt-3 bg-muted/20"
      >
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <input
                type="checkbox"
                checked={config.showAxes ?? true}
                onChange={(event) => patchConfig({ showAxes: event.target.checked })}
                aria-label="Show axes"
              />
              Axis options
            </label>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.showArrows ?? true}
                  onChange={(event) => patchConfig({ showArrows: event.target.checked })}
                />
                Axis arrows
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.showAxisLabels ?? true}
                  onChange={(event) => patchConfig({ showAxisLabels: event.target.checked })}
                />
                Axis labels
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.showAxisNumbers ?? true}
                  onChange={(event) => patchConfig({ showAxisNumbers: event.target.checked })}
                />
                Axis numbers
              </label>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-2 text-xs font-medium">
              Domain min
              <input
                type="number"
                value={numberInputValue(config.xMin)}
                onChange={(event) => patchConfig({ xMin: optionalNumber(event.target.value) })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Domain max
              <input
                type="number"
                value={numberInputValue(config.xMax)}
                onChange={(event) => patchConfig({ xMax: optionalNumber(event.target.value) })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Range min
              <input
                type="number"
                value={numberInputValue(config.yMin)}
                onChange={(event) => patchConfig({ yMin: optionalNumber(event.target.value) })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Range max
              <input
                type="number"
                value={numberInputValue(config.yMax)}
                onChange={(event) => patchConfig({ yMax: optionalNumber(event.target.value) })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
          </div>
        </section>

        <div className="mt-4 flex flex-col gap-4">
          <section className="border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Image size</div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(config.lockAspectRatio ?? false) && !(config.equalScale ?? false)}
                    onChange={(event) =>
                      patchConfig({ lockAspectRatio: event.target.checked, equalScale: event.target.checked ? false : config.equalScale })
                    }
                  />
                  Lock ratio
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.equalScale ?? false}
                    onChange={(event) =>
                      patchConfig({
                        equalScale: event.target.checked,
                        lockAspectRatio: event.target.checked ? false : config.lockAspectRatio,
                      })
                    }
                  />
                  1:1 scale
                </label>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Diagram width
                <input
                  type="number"
                  min={240}
                  step={20}
                  value={numberInputValue(config.widthPx)}
                  onChange={(event) => updateDiagramWidth(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              {config.equalScale || config.lockAspectRatio ? (
                <div className="flex flex-col gap-2 text-xs font-medium">
                  Diagram height
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted px-2 text-sm font-normal text-muted-foreground">
                    {Math.round(graphHeight(config))} px
                  </div>
                </div>
              ) : (
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Diagram height
                  <input
                    type="number"
                    min={160}
                    step={20}
                    value={numberInputValue(config.heightPx)}
                    onChange={(event) => patchConfig({ heightPx: optionalNumber(event.target.value) })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              )}
            </div>
          </section>

          <section className="border-t pt-3">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <input
                type="checkbox"
                checked={config.showMajorGrid ?? true}
                onChange={(event) => patchConfig({ showMajorGrid: event.target.checked, showGrid: true })}
                aria-label="Show major grid"
              />
              Major grid intervals
            </label>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium">
                X major interval
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={numberInputValue(config.gridMajorStepX ?? config.gridMajorStep)}
                  onChange={(event) => patchConfig({ gridMajorStepX: optionalNumber(event.target.value) })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Y major interval
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={numberInputValue(config.gridMajorStepY ?? config.gridMajorStep)}
                  onChange={(event) => patchConfig({ gridMajorStepY: optionalNumber(event.target.value) })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            </div>
          </section>

          <section className="border-t pt-3">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <input
                type="checkbox"
                checked={config.showMinorGrid ?? false}
                onChange={(event) => patchConfig({ showMinorGrid: event.target.checked, showGrid: true })}
                aria-label="Show minor grid"
              />
              Minor grid intervals
            </label>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium">
                X minor interval
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={numberInputValue(config.gridMinorStepX ?? config.gridMinorStep)}
                  onChange={(event) => patchConfig({ gridMinorStepX: optionalNumber(event.target.value) })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Y minor interval
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={numberInputValue(config.gridMinorStepY ?? config.gridMinorStep)}
                  onChange={(event) => patchConfig({ gridMinorStepY: optionalNumber(event.target.value) })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            </div>
          </section>
        </div>
      </CollapsiblePanel>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-sm font-medium">Functions</div>
        <div className="flex flex-wrap items-center justify-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.showFunctionArrows ?? true}
              onChange={(event) => patchConfig({ showFunctionArrows: event.target.checked })}
              aria-label="Show function arrows"
            />
            Function Arrows
          </label>
          <Button variant="outline" size="sm" onClick={addFunction}>
            <PlusCircle data-icon="inline-start" />
            Add function
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {functions.map((graphFunction, functionIndex) => {
          const pieces = graphPiecesFromFunction(graphFunction, config);
          const functionLabel = graphFunction.label || graphFunctionLabel(functionIndex);
          const functionSubtitle =
            graphFunction.kind === "piecewise"
              ? `${pieces.length} piece${pieces.length === 1 ? "" : "s"}`
              : graphFunction.kind === "relation"
                ? graphFunction.expression || "Relation"
                : graphFunction.expression || "Expression";
          const functionTitleLabel = graphFunction.kind === "relation" ? "Relation" : "Function";
          const functionDomainMode = graphFunction.domainMode ?? "auto";
          const functionTitle = (
            <span className="inline-flex min-w-0 items-baseline gap-1">
              <span className="shrink-0">
                {functionTitleLabel} {functionIndex + 1}:
              </span>
              <Latex latex={functionSummaryLatex(graphFunction, functionLabel)} />
              {graphFunction.kind === "piecewise" ? <span className="font-normal text-muted-foreground">{functionSubtitle}</span> : null}
            </span>
          );

          return (
            <CollapsiblePanel
              key={graphFunction.id ?? `${graphFunction.label}-${functionIndex}`}
              title={functionTitle}
              leading={
                <input
                  type="checkbox"
                  checked={graphFunction.show ?? true}
                  onChange={(event) => updateFunction(functionIndex, { show: event.target.checked })}
                  title={`Show ${functionTitleLabel.toLowerCase()} ${functionIndex + 1}`}
                  aria-label={`Show ${functionTitleLabel.toLowerCase()} ${functionIndex + 1}`}
                  className="size-4"
                />
              }
              className="bg-muted/30"
              bodyClassName="p-2"
              actions={
                <Button
                  variant="outline"
                  size="icon"
                  title={`Remove function ${functionIndex + 1}`}
                  aria-label={`Remove function ${functionIndex + 1}`}
                  onClick={() => removeFunction(functionIndex)}
                  className="size-8"
                >
                  <Trash2 />
                </Button>
              }
            >
              <div className="graph-auto-grid graph-auto-grid-function">
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Colour
                  <input
                    type="color"
                    value={graphFunction.color ?? GRAPH_COLORS[functionIndex % GRAPH_COLORS.length]}
                    onChange={(event) => updateFunction(functionIndex, { color: event.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background p-1"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label
                  <input
                    value={functionLabel}
                    onChange={(event) => updateFunction(functionIndex, { label: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Type
                  <select
                    value={graphFunction.kind ?? "expression"}
                    onChange={(event) => setFunctionKind(functionIndex, event.target.value as GraphFunctionKind)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  >
                    <option value="expression">Expression</option>
                    <option value="piecewise">Piecewise</option>
                    <option value="relation">Relation / Implicit</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Weight
                  <input
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={numberInputValue(graphFunction.strokeWidth)}
                    onChange={(event) => updateFunction(functionIndex, { strokeWidth: optionalNumber(event.target.value) })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Line style
                  <select
                    value={graphFunction.strokeStyle ?? "solid"}
                    onChange={(event) =>
                      updateFunction(functionIndex, { strokeStyle: event.target.value as NonNullable<GraphFunction["strokeStyle"]> })
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  >
                    {GRAPH_LINE_STYLES.map((style) => (
                      <option key={style.value} value={style.value}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </label>
                {graphFunction.kind === "piecewise" ? (
                  <div className="hidden md:block" aria-hidden="true" />
                ) : (
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    {graphFunction.kind === "relation" ? "Equation or relation" : "Expression"}
                    <input
                      value={graphFunction.expression}
                      onChange={(event) => updateFunction(functionIndex, { expression: event.target.value, latex: "" })}
                      placeholder={graphFunction.kind === "relation" ? "x^2 + y^2 = 1" : "x^2 - 5*x + 6"}
                      className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                    />
                  </label>
                )}
              </div>

              {graphFunction.kind !== "piecewise" ? (
                <div className="graph-auto-grid mt-2 border-t pt-2">
                  <div className="flex flex-col gap-2 text-xs font-medium">
                    <span>Domain</span>
                    <select
                      value={functionDomainMode}
                      onChange={(event) => {
                        const domainMode = event.target.value as "auto" | "manual";
                        updateFunction(
                          functionIndex,
                          domainMode === "manual"
                            ? {
                                domainMode,
                                domainMin: graphFunction.domainMin ?? config.xMin,
                                domainMax: graphFunction.domainMax ?? config.xMax,
                              }
                            : { domainMode },
                        );
                      }}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    >
                      <option value="auto">Auto</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                  {functionDomainMode === "manual" ? (
                    <>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Left x
                        <input
                          aria-label={`Function ${functionIndex + 1} left domain`}
                          type="number"
                          step={0.5}
                          value={numberInputValue(graphFunction.domainMin ?? config.xMin)}
                          onChange={(event) => updateFunction(functionIndex, { domainMin: optionalNumber(event.target.value) })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Right x
                        <input
                          aria-label={`Function ${functionIndex + 1} right domain`}
                          type="number"
                          step={0.5}
                          value={numberInputValue(graphFunction.domainMax ?? config.xMax)}
                          onChange={(event) => updateFunction(functionIndex, { domainMax: optionalNumber(event.target.value) })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="graph-auto-grid mt-2 border-t pt-2">
                <label className="flex items-center gap-2 text-xs font-medium md:pb-2">
                  <input
                    type="checkbox"
                    checked={graphFunction.showLabel ?? false}
                    onChange={(event) => updateFunction(functionIndex, { showLabel: event.target.checked })}
                  />
                  Graph label
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label style
                  <select
                    value={graphFunction.labelMode ?? "equation"}
                    onChange={(event) =>
                      updateFunction(functionIndex, { labelMode: event.target.value as NonNullable<GraphFunction["labelMode"]> })
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  >
                    <option value="equation">f(x)= expression</option>
                    <option value="name">Name only</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label x
                  <input
                    type="number"
                    step={0.5}
                    value={numberInputValue(graphFunction.labelX)}
                    onChange={(event) => updateFunction(functionIndex, { labelX: optionalNumber(event.target.value) })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium">
                  Label y
                  <input
                    type="number"
                    step={0.5}
                    value={numberInputValue(graphFunction.labelY)}
                    onChange={(event) => updateFunction(functionIndex, { labelY: optionalNumber(event.target.value) })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              </div>

              {graphFunction.kind === "piecewise" ? (
                <div className="mt-2 flex flex-col gap-2 border-t pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium">Pieces</span>
                    <Button variant="outline" size="sm" onClick={() => addPiece(functionIndex)}>
                      <PlusCircle data-icon="inline-start" />
                      Add piece
                    </Button>
                  </div>
                  {pieces.map((piece, pieceIndex) => (
                    <div key={piece.id ?? `${piece.expression}-${pieceIndex}`} className="graph-auto-grid">
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Expression
                        <input
                          value={piece.expression}
                          onChange={(event) => updatePiece(functionIndex, pieceIndex, { expression: event.target.value })}
                          className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        From x
                        <input
                          type="number"
                          value={numberInputValue(piece.xMin)}
                          onChange={(event) => updatePiece(functionIndex, pieceIndex, { xMin: optionalNumber(event.target.value) })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        To x
                        <input
                          type="number"
                          value={numberInputValue(piece.xMax)}
                          onChange={(event) => updatePiece(functionIndex, pieceIndex, { xMax: optionalNumber(event.target.value) })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium md:pb-2">
                        <input
                          type="checkbox"
                          checked={piece.includeStart ?? true}
                          onChange={(event) => updatePiece(functionIndex, pieceIndex, { includeStart: event.target.checked })}
                        />
                        Start
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium md:pb-2">
                        <input
                          type="checkbox"
                          checked={piece.includeEnd ?? true}
                          onChange={(event) => updatePiece(functionIndex, pieceIndex, { includeEnd: event.target.checked })}
                        />
                        End
                      </label>
                      <Button
                        variant="outline"
                        size="icon"
                        title={`Remove piece ${pieceIndex + 1}`}
                        aria-label={`Remove piece ${pieceIndex + 1}`}
                        onClick={() => removePiece(functionIndex, pieceIndex)}
                        className="size-9 justify-self-start md:justify-self-end"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </CollapsiblePanel>
          );
        })}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-t pt-3">
        <div className="text-sm font-medium">Features</div>
        <Button variant="outline" size="sm" onClick={addFeature}>
          <PlusCircle data-icon="inline-start" />
          Add Feature
        </Button>
      </div>

      {visibleFeatureEntries.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {visibleFeatureEntries.map(({ feature, featureIndex }) => {
            const featureTypeLabel = GRAPH_FEATURE_TYPES.find((type) => type.value === feature.kind)?.label ?? "Feature";
            const featureLabelModes =
              feature.kind === "tangent"
                ? GRAPH_TANGENT_LABEL_MODES
                : isRegionFeatureKind(feature.kind)
                  ? GRAPH_REGION_LABEL_MODES
                  : GRAPH_FEATURE_LABEL_MODES;
            const featureLineStyles = isRegionFeatureKind(feature.kind) ? GRAPH_FEATURE_LINE_STYLES : GRAPH_LINE_STYLES;
            const featureStrokeStyle = feature.strokeStyle ?? (isRegionFeatureKind(feature.kind) ? "none" : "solid");
            const selectedFeatureFunction = functions[feature.functionIndex ?? 0];
            const selectedFeatureIsRelation = selectedFeatureFunction?.kind === "relation";
            const isFreeLabel = feature.kind === "label";
            const featureTitle = (
              <InlineSummaryTitle label={`${featureTypeLabel} ${featureIndex + 1}`} summary={feature.label || featureTypeLabel} />
            );

            return (
              <CollapsiblePanel
                key={feature.id ?? `${feature.kind}-${featureIndex}`}
                title={featureTitle}
                leading={
                  <input
                    type="checkbox"
                    checked={feature.show ?? true}
                    onChange={(event) => updateFeature(featureIndex, { show: event.target.checked })}
                    title={`Show feature ${featureIndex + 1}`}
                    aria-label={`Show feature ${featureIndex + 1}`}
                    className="size-4"
                  />
                }
                className="bg-muted/30"
                bodyClassName="p-2"
                actions={
                  <Button
                    variant="outline"
                    size="icon"
                    title={`Remove feature ${featureIndex + 1}`}
                    aria-label={`Remove feature ${featureIndex + 1}`}
                    onClick={() => removeFeature(featureIndex)}
                    className="size-8"
                  >
                    <Trash2 />
                  </Button>
                }
              >
                <div className={cn("graph-auto-grid", isFreeLabel && "graph-auto-grid-free-label")}>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Type
                    <select
                      value={feature.kind}
                      onChange={(event) => setFeatureKind(featureIndex, event.target.value as GraphFeatureKind)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    >
                      {GRAPH_FEATURE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium md:pb-2">
                    <input
                      type="checkbox"
                      checked={feature.solutionOnly === true}
                      onChange={(event) => updateFeature(featureIndex, { solutionOnly: event.target.checked })}
                    />
                    Solution only
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Colour
                    <input
                      type="color"
                      value={feature.color ?? GRAPH_COLORS[featureIndex % GRAPH_COLORS.length]}
                      onChange={(event) => updateFeature(featureIndex, { color: event.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-background p-1"
                    />
                  </label>
                  {isFreeLabel ? null : (
                    <>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Weight
                        <input
                          type="number"
                          min={0.5}
                          max={10}
                          step={0.5}
                          value={numberInputValue(feature.strokeWidth)}
                          disabled={featureStrokeStyle === "none"}
                          onChange={(event) => updateFeature(featureIndex, { strokeWidth: optionalNumber(event.target.value) })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Line style
                        <select
                          value={featureStrokeStyle}
                          onChange={(event) =>
                            updateFeature(featureIndex, { strokeStyle: event.target.value as NonNullable<GraphFeature["strokeStyle"]> })
                          }
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        >
                          {featureLineStyles.map((style) => (
                            <option key={style.value} value={style.value}>
                              {style.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    {isFreeLabel ? "LaTeX label" : "Label"}
                    <input
                      value={feature.label ?? ""}
                      onChange={(event) => updateFeature(featureIndex, { label: event.target.value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                  {isFreeLabel ? null : (
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Label display
                      <select
                        value={feature.labelMode ?? "name"}
                        onChange={(event) =>
                          updateFeature(featureIndex, { labelMode: event.target.value as NonNullable<GraphFeature["labelMode"]> })
                        }
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      >
                        {featureLabelModes.map((mode) => (
                          <option key={mode.value} value={mode.value}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                {feature.kind === "point" || feature.kind === "label" ? (
                  <div className="graph-auto-grid mt-2 border-t pt-2">
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      x
                      <input
                        type="number"
                        step={0.5}
                        value={numberInputValue(feature.x)}
                        onChange={(event) => updateFeature(featureIndex, { x: optionalNumber(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      y
                      <input
                        type="number"
                        step={0.5}
                        value={numberInputValue(feature.y)}
                        onChange={(event) => updateFeature(featureIndex, { y: optionalNumber(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                  </div>
                ) : null}

                {feature.kind === "line_segment" ? (
                  <div className="graph-auto-grid mt-2 border-t pt-2">
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Start x
                      <input
                        type="number"
                        step={0.5}
                        value={numberInputValue(feature.x1)}
                        onChange={(event) => updateFeature(featureIndex, { x1: optionalNumber(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Start y
                      <input
                        type="number"
                        step={0.5}
                        value={numberInputValue(feature.y1)}
                        onChange={(event) => updateFeature(featureIndex, { y1: optionalNumber(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      End x
                      <input
                        type="number"
                        step={0.5}
                        value={numberInputValue(feature.x2)}
                        onChange={(event) => updateFeature(featureIndex, { x2: optionalNumber(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      End y
                      <input
                        type="number"
                        step={0.5}
                        value={numberInputValue(feature.y2)}
                        onChange={(event) => updateFeature(featureIndex, { y2: optionalNumber(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                  </div>
                ) : null}

                {feature.kind === "region_between_curves" || feature.kind === "intersection" ? (
                  <div className="graph-auto-grid mt-2 border-t pt-2">
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      First function
                      <select
                        value={feature.functionAIndex ?? 0}
                        onChange={(event) => updateFeature(featureIndex, { functionAIndex: Number(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      >
                        {functionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {feature.kind === "intersection" ? (
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Intersect with
                        <select
                          value={feature.intersectionTarget ?? "function"}
                          onChange={(event) =>
                            updateFeature(featureIndex, {
                              intersectionTarget: event.target.value as NonNullable<GraphFeature["intersectionTarget"]>,
                            })
                          }
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        >
                          {GRAPH_INTERSECTION_TARGETS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {feature.kind === "region_between_curves" ||
                    (feature.kind === "intersection" && (feature.intersectionTarget ?? "function") === "function") ? (
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Second function
                        <select
                          value={feature.functionBIndex ?? 1}
                          onChange={(event) => updateFeature(featureIndex, { functionBIndex: Number(event.target.value) })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        >
                          {functionOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      From x
                      <input
                        type="number"
                        step={0.5}
                        value={numberInputValue(feature.xMin)}
                        onChange={(event) => updateFeature(featureIndex, { xMin: optionalNumber(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      To x
                      <input
                        type="number"
                        step={0.5}
                        value={numberInputValue(feature.xMax)}
                        onChange={(event) => updateFeature(featureIndex, { xMax: optionalNumber(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      />
                    </label>
                    {feature.kind === "region_between_curves" ? (
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Opacity
                        <input
                          type="number"
                          min={0.05}
                          max={0.8}
                          step={0.05}
                          value={numberInputValue(feature.fillOpacity)}
                          onChange={(event) => updateFeature(featureIndex, { fillOpacity: optionalNumber(event.target.value) })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {feature.kind === "region_curve_axis" || feature.kind === "turning_point" || feature.kind === "tangent" ? (
                  <div className="graph-auto-grid mt-2 border-t pt-2">
                    <label className="flex flex-col gap-2 text-xs font-medium">
                      Function
                      <select
                        value={feature.functionIndex ?? 0}
                        onChange={(event) => updateFeature(featureIndex, { functionIndex: Number(event.target.value) })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                      >
                        {functionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {feature.kind === "region_curve_axis" ? (
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        Axis
                        <select
                          value={feature.axis ?? "x"}
                          onChange={(event) =>
                            updateFeature(featureIndex, { axis: event.target.value as NonNullable<GraphFeature["axis"]> })
                          }
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                        >
                          <option value="x">x-axis</option>
                          <option value="y">y-axis</option>
                        </select>
                      </label>
                    ) : null}
                    {feature.kind === "tangent" ? (
                      <>
                        <label className="flex flex-col gap-2 text-xs font-medium">
                          x
                          <input
                            type="number"
                            step={0.5}
                            value={numberInputValue(feature.x)}
                            onChange={(event) =>
                              updateRelationTangentCoordinate(
                                featureIndex,
                                feature,
                                selectedFeatureFunction,
                                "x",
                                optionalNumber(event.target.value),
                              )
                            }
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                          />
                        </label>
                        {selectedFeatureIsRelation ? (
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            y
                            <input
                              type="number"
                              step={0.5}
                              value={numberInputValue(feature.y)}
                              onChange={(event) =>
                                updateRelationTangentCoordinate(
                                  featureIndex,
                                  feature,
                                  selectedFeatureFunction,
                                  "y",
                                  optionalNumber(event.target.value),
                                )
                              }
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <label className="flex flex-col gap-2 text-xs font-medium">
                          From x
                          <input
                            type="number"
                            step={0.5}
                            value={numberInputValue(feature.xMin)}
                            onChange={(event) => updateFeature(featureIndex, { xMin: optionalNumber(event.target.value) })}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-medium">
                          To x
                          <input
                            type="number"
                            step={0.5}
                            value={numberInputValue(feature.xMax)}
                            onChange={(event) => updateFeature(featureIndex, { xMax: optionalNumber(event.target.value) })}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                          />
                        </label>
                        {feature.kind === "region_curve_axis" ? (
                          <label className="flex flex-col gap-2 text-xs font-medium">
                            Opacity
                            <input
                              type="number"
                              min={0.05}
                              max={0.8}
                              step={0.05}
                              value={numberInputValue(feature.fillOpacity)}
                              onChange={(event) => updateFeature(featureIndex, { fillOpacity: optionalNumber(event.target.value) })}
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                            />
                          </label>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </CollapsiblePanel>
            );
          })}
        </div>
      ) : null}
    </CollapsiblePanel>
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
  const [paneMode, setPaneMode] = useState<PaneMode>("split");
  const [tocOpen, setTocOpen] = useState(false);
  const [activeTocItemId, setActiveTocItemId] = useState(() => firstQuestionAnchor(initialQuestions));
  const [activeRailItemId, setActiveRailItemId] = useState(() => firstQuestionAnchor(initialQuestions));
  const [activeQuestionId, setActiveQuestionId] = useState(() => firstQuestionId(initialQuestions));
  const [showSolutions, setShowSolutions] = useState(false);
  const [solutionValidationOpen, setSolutionValidationOpen] = useState(false);
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [newTestDialogOpen, setNewTestDialogOpen] = useState(false);
  const [actionProposalOpen, setActionProposalOpen] = useState(false);
  const [actionProposalText, setActionProposalText] = useState("");
  const [actionProposalMessage, setActionProposalMessage] = useState("");
  const [actionProposalResult, setActionProposalResult] = useState<MauthDocumentActionResult<
    QuestionBlock,
    FrontMatterConfig,
    FormattingConfig
  > | null>(null);
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(false);
  const [assistantChatInput, setAssistantChatInput] = useState("");
  const [assistantChatMessages, setAssistantChatMessages] = useState<MauthAssistantChatMessage[]>([]);
  const [assistantChatRunning, setAssistantChatRunning] = useState(false);
  const [assistantActivityLabel, setAssistantActivityLabel] = useState("Thinking");
  const [assistantActivityStartedAt, setAssistantActivityStartedAt] = useState<number | null>(null);
  const [assistantProviderConfigured, setAssistantProviderConfigured] = useState<boolean | null>(null);
  const [assistantProviderStatusMessage, setAssistantProviderStatusMessage] = useState("Checking assistant provider");
  const [assistantPreviousResponseId, setAssistantPreviousResponseId] = useState<string | null>(null);
  const [assistantPendingToolContinuation, setAssistantPendingToolContinuation] = useState<AssistantPendingToolContinuation | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFileSummary[]>([]);
  const [projectFilesStatus, setProjectFilesStatus] = useState<ProjectFilesStatus>("idle");
  const [projectFilesMessage, setProjectFilesMessage] = useState("");
  const [activeProjectFilePath, setActiveProjectFilePath] = useState<string | null>(
    () => initialEditorDraft?.activeProjectFilePath ?? null,
  );
  const [activeProjectFileRevision, setActiveProjectFileRevision] = useState<number | null>(
    () => initialEditorDraft?.activeProjectFileRevision ?? null,
  );
  const [projectSaveConflict, setProjectSaveConflict] = useState<ProjectSaveConflict | null>(null);
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
  const emptyFileRefreshAttemptedRef = useRef(false);

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

  const refreshProjectFiles = useCallback(async () => {
    setProjectFilesStatus("loading");
    setProjectFilesMessage("Loading files");
    try {
      let project = await getDefaultProject();
      let filesResponse = await listProjectFiles(project.id);
      const migrationDone = typeof project.metadata?.[LEGACY_SAVED_TESTS_MIGRATED_AT_KEY] === "string";

      if (!migrationDone) {
        let projectFilesForImport = filesResponse.files;
        let importedCount = 0;
        for (const savedTest of legacySavedTestsRef.current) {
          const alreadyImported = projectFilesForImport.some(
            (file) => file.kind === "file" && file.metadata?.legacySavedTestId === savedTest.id,
          );
          if (alreadyImported) continue;

          const testPath = uniqueTestPath(projectFilesForImport, "", savedTest.name, "file");
          const projectPath = projectPathForTestPath(testPath);
          const savedFile = await saveProjectFile(project.id, projectPath, {
            content: JSON.stringify(savedTest, null, 2),
            kind: "file",
            fileType: "test",
            metadata: {
              format: "saved-test-json",
              source: "legacy-saved-tests-migration",
              legacySavedTestId: savedTest.id,
            },
          });
          projectFilesForImport = [...projectFilesForImport, savedFile];
          importedCount += 1;
        }

        project = await updateProject(project.id, {
          metadata: {
            ...project.metadata,
            [LEGACY_SAVED_TESTS_MIGRATED_AT_KEY]: new Date().toISOString(),
            [LEGACY_SAVED_TESTS_IMPORTED_KEY]: importedCount,
          },
        });
        filesResponse = await listProjectFiles(project.id);
        setProjectFilesMessage(importedCount ? `Imported ${importedCount} existing tests` : "");
      } else {
        setProjectFilesMessage("");
      }

      setActiveProject(project);
      setProjectFiles(filesResponse.files);
      setProjectFilesStatus("ready");
    } catch {
      setProjectFilesStatus("error");
      setProjectFilesMessage("Files unavailable");
    }
  }, []);

  useEffect(() => {
    if (!fileManagerOpen) {
      emptyFileRefreshAttemptedRef.current = false;
      return;
    }
    if (!storageHydrated) {
      setProjectFilesStatus("loading");
      setProjectFilesMessage("Loading files");
      return;
    }
    void refreshProjectFiles();
  }, [storageHydrated, fileManagerOpen, refreshProjectFiles]);

  useEffect(() => {
    if (!fileManagerOpen || !storageHydrated || projectFilesStatus !== "ready") return;
    if (visibleTestFiles(projectFiles).some(({ file }) => file.kind === "file")) return;
    if (emptyFileRefreshAttemptedRef.current) return;

    emptyFileRefreshAttemptedRef.current = true;
    const timeoutId = window.setTimeout(() => {
      void refreshProjectFiles();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [storageHydrated, fileManagerOpen, projectFiles, projectFilesStatus, refreshProjectFiles]);

  useEffect(() => {
    if (!assistantPanelOpen) return;

    let cancelled = false;
    setAssistantProviderStatusMessage("Checking assistant provider");

    getAssistantStatus()
      .then((status) => {
        if (cancelled) return;
        setAssistantProviderConfigured(status.configured);
        setAssistantProviderStatusMessage(
          status.configured
            ? `Connected to ${status.provider} (${status.model})`
            : `Assistant provider missing ${status.missingSetting ?? "configuration"}`,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAssistantProviderConfigured(false);
        setAssistantProviderStatusMessage(error instanceof Error ? error.message : "Assistant provider is unavailable.");
      });

    return () => {
      cancelled = true;
    };
  }, [assistantPanelOpen]);

  useEffect(() => {
    if (paneMode !== "preview" && assistantPanelOpen) {
      setAssistantPanelOpen(false);
    }
  }, [assistantPanelOpen, paneMode]);

  function openFileManager() {
    setFileManagerOpen(true);
    if (!storageHydrated) {
      setProjectFilesStatus("loading");
      setProjectFilesMessage("Loading files");
      return;
    }
    void refreshProjectFiles();
  }

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
  }, [storageHydrated, questions]);

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
  const showEditor = paneMode !== "preview";
  const showPreview = paneMode !== "editor";
  const assistantPreviewOpen = paneMode === "preview" && assistantPanelOpen;
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
      gridTemplateColumns: paneMode === "split" ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
    }),
    [paneMode],
  );
  const previewPaneStyle = useMemo<CSSProperties | undefined>(
    () => (assistantPreviewOpen ? { paddingLeft: ASSISTANT_PREVIEW_RESERVED_WIDTH_PX } : undefined),
    [assistantPreviewOpen],
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
  }, [assistantPreviewOpen, showPreview]);

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

  function openAssistantPanel() {
    setAssistantPanelOpen((current) => {
      const nextOpen = !current;
      if (nextOpen && paneMode !== "preview") hideEditorPane();
      return nextOpen;
    });
  }

  async function ensureAssistantProject() {
    const project = activeProject ?? (await getDefaultProject());
    setActiveProject(project);
    return project;
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

  function assistantFileDriver() {
    return {
      listFiles: async (projectId: string) => (await listProjectFiles(projectId)).files,
      getFile: (projectId: string, filePath: string) => getProjectFile(projectId, filePath),
      saveFile: (projectId: string, filePath: string, file: ProjectFileSaveRequest) => saveProjectFile(projectId, filePath, file),
      deleteFile: (projectId: string, filePath: string, baseRevision?: number) => deleteProjectFile(projectId, filePath, baseRevision),
      listVersions: async (projectId: string, filePath: string) => (await listProjectFileVersions(projectId, filePath)).versions,
      restoreVersion: (projectId: string, filePath: string, versionId: string) => restoreProjectFileVersion(projectId, filePath, versionId),
    };
  }

  function assistantHost(): MauthAssistantAdapterHost<QuestionBlock, FrontMatterConfig, FormattingConfig> {
    return {
      getDocument: currentEditorDocument,
      commitDocument: (document) => commitAssistantDocument(document),
      documentOptions: editorDocumentActionOptions,
      fileDriver: assistantFileDriver(),
      getProjectId: async () => (await ensureAssistantProject()).id,
      getActiveFilePath: () => activeProjectFilePathRef.current,
      getActiveFileRevision: () => activeProjectFileRevisionRef.current,
      setActiveFilePath: (filePath, context) => {
        const contextData = asRecord(context.data);
        const contextDocument = asRecord(contextData?.document);
        const contextRevision = typeof contextDocument?.revision === "number" ? contextDocument.revision : null;
        activeProjectFilePathRef.current = filePath;
        activeProjectFileRevisionRef.current = filePath ? contextRevision : null;
        setActiveProjectFilePath(filePath);
        setActiveProjectFileRevision(filePath ? contextRevision : null);
        setProjectSaveConflict(null);
        if (filePath) {
          setLastProjectSaveFingerprint(
            editorDocumentFingerprint(
              frontMatterRef.current,
              questionsRef.current,
              formattingConfigRef.current,
              selectedLogoForFrontMatter(logosRef.current, frontMatterRef.current),
            ),
          );
          if (context.toolName === "mauth.files.open") setFileManagerOpen(false);
        } else {
          setLastProjectSaveFingerprint(null);
        }
      },
      serializeDocument: (document) => serializeAssistantDocument(document),
      parseProjectFileDocument: (document) => parseAssistantProjectDocument(document),
      onFilesChanged: (files) => {
        setProjectFiles(files);
        setProjectFilesStatus("ready");
      },
    };
  }

  async function assistantDocumentSummary(host: MauthAssistantAdapterHost<QuestionBlock, FrontMatterConfig, FormattingConfig>) {
    setAssistantActivityLabel("Inspecting document");
    const result = await runMauthAssistantAdapterTool(host, { name: "mauth.document.inspect", arguments: {} });
    return result.ok ? (asRecord(result.data) ?? null) : null;
  }

  async function runAssistantProviderToolCall(
    host: MauthAssistantAdapterHost<QuestionBlock, FrontMatterConfig, FormattingConfig>,
    toolCall: AssistantProviderToolCall,
  ): Promise<AssistantToolOutput> {
    const call = assistantToolCallFromProvider(toolCall);
    if (!call) {
      return {
        callId: toolCall.callId,
        name: toolCall.name,
        output: {
          ok: false,
          error: `Unsupported assistant tool call: ${toolCall.name}`,
        },
      };
    }

    setAssistantActivityLabel(assistantActivityLabelForTool(call.name));
    if (call.name.startsWith("mauth.files.")) {
      setProjectFilesStatus(call.name === "mauth.files.open" ? "loading" : "saving");
      setProjectFilesMessage(`Assistant: ${call.name}`);
    }

    const result = await runMauthAssistantAdapterTool(host, call);

    return {
      callId: toolCall.callId,
      name: toolCall.name,
      output: compactAssistantProviderOutput(result),
    };
  }

  function localTerminalAssistantToolMessage(toolOutput: AssistantToolOutput) {
    const output = asRecord(toolOutput.output);
    const toolName = typeof output?.toolName === "string" ? output.toolName : "";
    if (output?.ok !== true) return "";
    if (
      toolName !== "mauth.author.replaceQuestion" &&
      toolName !== "mauth.author.addDiagram" &&
      toolName !== "mauth.author.ensureSolutions"
    ) {
      return "";
    }
    return typeof output?.message === "string" && output.message.trim() ? output.message.trim() : "Completed the edit.";
  }

  async function continueAssistantToolLoop(
    host: MauthAssistantAdapterHost<QuestionBlock, FrontMatterConfig, FormattingConfig>,
    initialResponseId: string | null,
    initialToolCalls: AssistantProviderToolCall[],
  ): Promise<AssistantToolLoopResult> {
    let responseId = initialResponseId;
    let toolCalls = initialToolCalls;
    let rounds = 0;
    let totalUsage: AssistantUsageSummary | null = null;

    while (toolCalls.length && rounds < ASSISTANT_MAX_TOOL_ROUNDS) {
      rounds += 1;
      const toolOutputs: AssistantToolOutput[] = [];
      for (const toolCall of toolCalls) {
        toolOutputs.push(await runAssistantProviderToolCall(host, toolCall));
      }

      const localMessages = toolOutputs.map(localTerminalAssistantToolMessage).filter(Boolean);
      if (localMessages.length === toolOutputs.length) {
        setAssistantChatMessages((current) => [
          ...current,
          ...localMessages.map((message) => ({ id: id("assistant-message"), role: "assistant" as const, content: message })),
        ]);
        setAssistantPendingToolContinuation(null);
        setAssistantPreviousResponseId(null);
        return { responseId: null, usage: totalUsage, pending: null };
      }

      const documentSummary = await assistantDocumentSummary(host);
      setAssistantActivityLabel("Thinking");
      const response = await sendAssistantChat({
        previousResponseId: responseId,
        toolOutputs,
        documentSummary,
      });

      responseId = response.responseId ?? responseId;
      totalUsage = mergeAssistantUsageSummary(totalUsage, response.usage);
      if (response.message.trim()) {
        setAssistantChatMessages((current) => [
          ...current,
          { id: id("assistant-message"), role: "assistant", content: response.message.trim() },
        ]);
      }
      toolCalls = response.toolCalls;
    }

    if (toolCalls.length) {
      const pending = { responseId, toolCalls };
      setAssistantPendingToolContinuation(pending);
      setAssistantPreviousResponseId(null);
      setAssistantChatMessages((current) => [
        ...current,
        {
          id: id("assistant-message"),
          role: "assistant",
          content: "I stopped after several tool rounds. Ask me to continue if you want me to keep going.",
        },
      ]);
      return { responseId, usage: totalUsage, pending };
    }

    setAssistantPendingToolContinuation(null);
    setAssistantPreviousResponseId(responseId);
    return { responseId, usage: totalUsage, pending: null };
  }

  async function sendAssistantChatMessage() {
    const userContent = assistantChatInput.trim();
    if (!userContent || assistantChatRunning) return;

    const pendingContinuation = assistantPendingToolContinuation;
    const resumePendingTools = Boolean(pendingContinuation && userContent.toLowerCase().startsWith("continue"));
    const previousResponseId = pendingContinuation ? null : assistantPreviousResponseId;
    const priorMessages = assistantChatMessages
      .filter((chatMessage) => !chatMessage.content.startsWith("I stopped after several tool rounds."))
      .slice(-8)
      .map(
        (chatMessage): AssistantChatMessage => ({
          role: chatMessage.role,
          content: chatMessage.content.length > 2000 ? `${chatMessage.content.slice(0, 2000)}...` : chatMessage.content,
        }),
      );
    const outgoingMessages: AssistantChatMessage[] = previousResponseId
      ? [{ role: "user", content: userContent }]
      : [...priorMessages, { role: "user", content: userContent }];

    setAssistantChatInput("");
    setAssistantChatMessages((current) => [...current, { id: id("assistant-message"), role: "user", content: userContent }]);
    setAssistantChatRunning(true);
    setAssistantActivityLabel(resumePendingTools ? "Continuing" : "Thinking");
    setAssistantActivityStartedAt(Date.now());
    setAssistantProviderStatusMessage((current) => current || "Assistant working");

    try {
      const host = assistantHost();
      if (resumePendingTools && pendingContinuation) {
        setAssistantPendingToolContinuation(null);
        const loopResult = await continueAssistantToolLoop(host, pendingContinuation.responseId, pendingContinuation.toolCalls);
        const resumedUsage = loopResult.usage;
        if (resumedUsage) {
          setAssistantChatMessages((current) => addUsageToLastAssistantMessage(current, resumedUsage));
        }
        setProjectFilesStatus((current) => (current === "saving" || current === "loading" ? "ready" : current));
        setProjectFilesMessage((current) => (current.startsWith("Assistant:") ? "Assistant tool completed" : current));
        return;
      }

      if (pendingContinuation) {
        setAssistantPendingToolContinuation(null);
        setAssistantPreviousResponseId(null);
      }

      const documentSummary = await assistantDocumentSummary(host);
      setAssistantActivityLabel("Thinking");
      const response = await sendAssistantChat({
        previousResponseId,
        messages: outgoingMessages,
        documentSummary,
      });

      let requestUsage = response.usage ?? null;
      setAssistantProviderConfigured(response.configured);
      if (!response.configured) {
        setAssistantProviderStatusMessage(response.error || response.message || "Assistant provider is not configured.");
      }

      const nextResponseId = response.responseId ?? previousResponseId;
      if (response.message.trim()) {
        setAssistantChatMessages((current) => [
          ...current,
          { id: id("assistant-message"), role: "assistant", content: response.message.trim() },
        ]);
      }

      if (response.toolCalls.length) {
        const loopResult = await continueAssistantToolLoop(host, nextResponseId, response.toolCalls);
        requestUsage = mergeAssistantUsageSummary(requestUsage, loopResult.usage);
      } else {
        setAssistantPendingToolContinuation(null);
        setAssistantPreviousResponseId(nextResponseId);
      }

      if (requestUsage) {
        setAssistantChatMessages((current) => addUsageToLastAssistantMessage(current, requestUsage));
      }

      setProjectFilesStatus((current) => (current === "saving" || current === "loading" ? "ready" : current));
      setProjectFilesMessage((current) => (current.startsWith("Assistant:") ? "Assistant tool completed" : current));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assistant request failed.";
      setAssistantProviderConfigured(false);
      setAssistantProviderStatusMessage(message);
      setAssistantPendingToolContinuation(null);
      setAssistantPreviousResponseId(null);
      setAssistantChatMessages((current) => [...current, { id: id("assistant-message"), role: "assistant", content: message }]);
      setProjectFilesStatus((current) => (current === "saving" || current === "loading" ? "error" : current));
    } finally {
      setAssistantChatRunning(false);
      setAssistantActivityStartedAt(null);
      setAssistantActivityLabel("Thinking");
    }
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
    if (paneMode === "preview") setPaneMode("split");
    activateEditorAnchor(anchor);
    revealEditorAnchor(anchor);
    queueDocumentJump(anchor, anchor, { preservePaneMode: true });
  }

  function focusSolutionValidationAnchor(anchor: string) {
    if (paneMode === "preview") setPaneMode("split");
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

  function showSplitPane() {
    resetPreviewZoom();
    setPaneMode("split");
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
    setPaneMode("preview");
  }

  function hidePreviewPane() {
    setPaneMode("editor");
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
            block={block}
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
            block={block}
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
            block={block}
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
            block={block}
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
            block={block}
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
            block={block}
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
                Page
                <span className="flex h-8 w-28 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm font-normal">
                  <input
                    type="checkbox"
                    checked={subpart.pageBreakBefore === true}
                    onChange={(event) => updateSubpart(question.id, part.id, subpart.id, { pageBreakBefore: event.target.checked })}
                    className="size-3.5"
                    aria-label={`Start subpart ${subpartLabel} on a new page`}
                  />
                  <span>New page</span>
                </span>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                Marks
                <input
                  type="number"
                  min={0}
                  value={subpart.marks}
                  onChange={(event) => updateSubpart(question.id, part.id, subpart.id, { marks: Number(event.target.value) })}
                  className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm font-normal"
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
                  Page
                  <span className="flex h-8 w-28 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm font-normal">
                    <input
                      type="checkbox"
                      checked={part.pageBreakBefore === true}
                      onChange={(event) => updatePart(question.id, part.id, { pageBreakBefore: event.target.checked })}
                      className="size-3.5"
                      aria-label={`Start part ${partLabel} on a new page`}
                    />
                    <span>New page</span>
                  </span>
                </label>
                {subparts.length ? (
                  <div className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                    Marks
                    <div className="flex h-8 w-28 items-center rounded-md border border-input bg-muted px-2 text-sm font-normal text-muted-foreground">
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
                      className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm font-normal"
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
              <div className={HEADER_GROUP_CLASS}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Show editor and display"
                  aria-label="Show editor and display"
                  aria-pressed={paneMode === "split"}
                  onClick={showSplitPane}
                  className={cn(HEADER_ICON_BUTTON_CLASS, paneMode === "split" && HEADER_ICON_ACTIVE_CLASS)}
                >
                  <Columns2 />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Editor only"
                  aria-label="Editor only"
                  aria-pressed={paneMode === "editor"}
                  onClick={hidePreviewPane}
                  className={cn(HEADER_ICON_BUTTON_CLASS, paneMode === "editor" && HEADER_ICON_ACTIVE_CLASS)}
                >
                  <PanelRightClose />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Display only"
                  aria-label="Display only"
                  aria-pressed={paneMode === "preview"}
                  onClick={hideEditorPane}
                  className={cn(HEADER_ICON_BUTTON_CLASS, paneMode === "preview" && HEADER_ICON_ACTIVE_CLASS)}
                >
                  <PanelLeftClose />
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
                style={previewPaneStyle}
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
        {paneMode === "preview" ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            title={assistantPanelOpen ? "Hide assistant" : "Open assistant"}
            aria-label={assistantPanelOpen ? "Hide assistant" : "Open assistant"}
            aria-pressed={assistantPanelOpen}
            onClick={openAssistantPanel}
            className={cn(
              "fixed left-[4.25rem] top-20 z-50 size-10 border-blue-200 bg-background/95 text-primary shadow-lg backdrop-blur hover:bg-primary/10",
              assistantPanelOpen && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <Bot className="size-5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <FileManagementDrawer
        open={fileManagerOpen}
        projectFiles={projectFiles}
        projectFilesStatus={projectFilesStatus}
        projectFilesMessage={projectFilesMessage}
        activeProjectFilePath={activeProjectFilePath}
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
      {assistantPanelOpen && paneMode === "preview" ? (
        <MauthAssistantPanel
          placement="preview-left"
          chatMessages={assistantChatMessages}
          chatInput={assistantChatInput}
          chatRunning={assistantChatRunning}
          providerConfigured={assistantProviderConfigured}
          providerStatusMessage={assistantProviderStatusMessage}
          activityLabel={assistantActivityLabel}
          activityStartedAt={assistantActivityStartedAt}
          onChatInputChange={setAssistantChatInput}
          onSendChat={() => void sendAssistantChatMessage()}
          onClose={() => setAssistantPanelOpen(false)}
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
