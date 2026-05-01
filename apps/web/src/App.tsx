import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, ReactNode } from "react";
import type {
  ChoiceListLayout,
  ChoiceNumberingStyle,
  ContentBlock,
  DiagramContentBlock,
  DiagramAlignment,
  FormattingConfig,
  GraphConfig,
  GraphFeature,
  GraphFunction,
  GraphFunctionPiece,
  QuestionPart,
  QuestionSubpart,
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
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
  FileDown,
  FileUp,
  GitBranch,
  GripVertical,
  ImagePlus,
  Link2,
  ListOrdered,
  Moon,
  PanelLeftClose,
  PanelRightClose,
  Pencil,
  PlusCircle,
  Redo2,
  Save,
  SeparatorHorizontal,
  Shuffle,
  Sun,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";

import { Latex } from "@/components/Latex";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { deleteStoredTest, getStorageAutosave, getStoredTest, listStoredTests, saveStorageAutosave, saveStoredTest } from "@/lib/api";
import { cn } from "@/lib/utils";

const GRAPH_COLORS = ["#1677ff", "#7955ff", "#0f766e", "#b45309", "#be123c"];
const GRAPH_LABELS = ["f", "g", "h", "p", "q"];
const DEFAULT_GRAPH_FUNCTION_STROKE_WIDTH = 2.5;
const BRAND_LOGO_SRC = "/brand/mauth_logo_lockup.png";
const HEADER_ACTION_CLASS =
  "h-8 gap-2 border border-blue-300/25 bg-white/[0.06] px-3 text-blue-100 hover:border-blue-200/45 hover:bg-blue-500/15 hover:text-white";
const HEADER_GROUP_CLASS = "ml-2 flex items-center gap-1 rounded-md border border-blue-300/20 bg-white/[0.05] p-1";
const HEADER_ICON_BUTTON_CLASS = "size-8 text-blue-100 hover:bg-blue-500/15 hover:text-white disabled:opacity-40";
const HEADER_ICON_ACTIVE_CLASS = "bg-blue-500/20 text-white";
const DEFAULT_PAGE_FORMAT = {
  widthPx: 794,
  heightPx: 1123,
  paddingXPx: 76,
  paddingYPx: 76,
  showPageBreaks: true,
};
const QUESTION_GAP_PX = 32;
const PREVIEW_FIT_PADDING_PX = 32;
const MIN_PREVIEW_SCALE = 0.55;
const LOGO_LIBRARY_STORAGE_KEY = "mauth-studio.logo-library.v1";
const SAVED_TEST_STORAGE_KEY = "mauth-studio.saved-tests.v1";
const CURRENT_DRAFT_STORAGE_KEY = "mauth-studio.current-draft.v1";
const STARTER_DOCUMENT_STORAGE_KEY = "mauth-studio.starter-document.v1";
const THEME_STORAGE_KEY = "mauth-studio.theme.v1";
const LEGACY_LOGO_LIBRARY_STORAGE_KEY = "math-app.logo-library.v1";
const LEGACY_SAVED_TEST_STORAGE_KEY = "math-app.saved-tests.v1";
const LEGACY_CURRENT_DRAFT_STORAGE_KEY = "math-app.current-draft.v1";
const LEGACY_STARTER_DOCUMENT_STORAGE_KEY = "math-app.starter-document.v1";
const SCREENSHOT_STARTER_DOCUMENT_ID = "calculus-area-screenshot-questions-v4";
const SAVED_TEST_LOGO_PREFIX = "saved-test-logo-";
const MAUTHDOWN_VERSION = 1;
const MAUTHDOWN_DATA_FENCE = "````";
const MAUTHDOWN_CODE_FENCE = "```";
const INSERT_MENU_OPEN_EVENT = "mauth-studio:insert-menu-open";
const AUTOSAVE_DEBOUNCE_MS = 900;
let nextInsertMenuId = 0;
const BUILT_IN_LOGOS: LogoAsset[] = [
  {
    id: "acc-logo",
    name: "Australian Christian College",
    src: "/logos/acc_logo.svg",
    builtIn: true,
  },
];
const DEFAULT_FRONT_MATTER: FrontMatterConfig = {
  logoId: BUILT_IN_LOGOS[0].id,
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
const PENROSE_ORIGINAL_WIDTH = 420;
const DEFAULT_PENROSE_SCALE_PERCENT = 100;
const DEFAULT_PENROSE_PRESET = "geometry";
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
  { value: "geometricConstruction", label: "Geometric construction" },
  { value: "vectorRelationship", label: "Vector relationship" },
  { value: "setDiagram", label: "Set diagram" },
  { value: "statsChart", label: "Statistics chart" },
  { value: "vector2d", label: "2D vector" },
  { value: "graph3d", label: "3D graph" },
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
const GRAPH_FEATURE_TYPES: Array<{ value: GraphFeature["kind"]; label: string }> = [
  { value: "point", label: "Point" },
  { value: "region_between_curves", label: "Region between two curves" },
  { value: "region_curve_axis", label: "Region between curve and axis" },
  { value: "turning_point", label: "Turning point" },
  { value: "intersection", label: "Point of intersection" },
  { value: "tangent", label: "Tangent at point" },
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
type ContentBlockKind = "text" | "choices" | "diagram" | "space";
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
type PanelDragRegion = "header" | "body";

interface SubsectionDropPreview {
  targetKey: string;
  placement: DropPlacement;
  intent: SubsectionDropIntent;
}

interface QuestionDropPreview {
  questionId: string;
  placement: Exclude<DropPlacement, "inside">;
}

type PaneMode = "split" | "editor" | "preview";
type ThemeMode = "light" | "dark";

interface EditorHistorySnapshot {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
}

interface AutosavedEditorSnapshot extends EditorHistorySnapshot {
  selectedSavedTestId?: string;
  updatedAt?: string;
}

type DiskStorageStatus = "loading" | "ready" | "saving" | "saved" | "unavailable" | "error";

const HISTORY_LIMIT = 80;

interface LogoAsset {
  id: string;
  name: string;
  src: string;
  builtIn?: boolean;
}

interface FrontMatterConfig {
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
}

interface SavedTest {
  id: string;
  name: string;
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  logo?: LogoAsset;
  createdAt: string;
  updatedAt: string;
}

interface MauthdownDocument {
  format: "mauthdown";
  version: number;
  exportedAt: string;
  testName: string;
  totalMarks: number;
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  questions: QuestionBlock[];
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
  if (typeof window === "undefined") return BUILT_IN_LOGOS;

  try {
    const stored = localStorageItem(LOGO_LIBRARY_STORAGE_KEY, LEGACY_LOGO_LIBRARY_STORAGE_KEY);
    if (!stored) return BUILT_IN_LOGOS;
    const parsed = JSON.parse(stored) as LogoAsset[];
    const builtInIds = new Set(BUILT_IN_LOGOS.map((logo) => logo.id));
    const customLogos = Array.isArray(parsed)
      ? parsed.filter(
          (logo) =>
            typeof logo.id === "string" && typeof logo.name === "string" && typeof logo.src === "string" && !builtInIds.has(logo.id),
        )
      : [];
    return [...BUILT_IN_LOGOS, ...customLogos];
  } catch {
    return BUILT_IN_LOGOS;
  }
}

function persistLogoLibrary(logos: LogoAsset[]) {
  if (typeof window === "undefined") return;

  try {
    const customLogos = logos
      .filter((logo) => !logo.builtIn && !logo.id.startsWith(SAVED_TEST_LOGO_PREFIX))
      .map(({ id: logoId, name, src }) => ({ id: logoId, name, src }));
    window.localStorage.setItem(LOGO_LIBRARY_STORAGE_KEY, JSON.stringify(customLogos));
  } catch {
    // Large uploaded images can exceed browser storage limits; keep the in-memory choice for this session.
  }
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
  return logos.find((logo) => logo.id === logoId) ?? logos[0] ?? BUILT_IN_LOGOS[0];
}

function assessmentTitleText(value: string) {
  return value.toUpperCase();
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
  return {
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
  };
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
    builtIn: Boolean(candidate.builtIn),
  };
}

function savedTestLogoId(testId: string) {
  return `${SAVED_TEST_LOGO_PREFIX}${testId}`;
}

function schoolInitials(lines: string[]) {
  const words = lines.join(" ").split(/\s+/).filter(Boolean);
  return words
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function textBlock(text = ""): EditorContentBlock {
  return { id: id("text"), kind: "text", text };
}

function choiceListBlock(choices: string[] = ["", "", ""]): EditorContentBlock {
  return { id: id("choices"), kind: "choices", choices, numberingStyle: "roman", layout: "vertical" };
}

function diagramBlock(): EditorContentBlock {
  return {
    id: id("diagram"),
    kind: "diagram",
    diagramAlign: "center",
    graphConfig: withGraphDefaults(DEFAULT_2D_GRAPH),
  };
}

function spaceBlock(lines = 3): EditorContentBlock {
  return { id: id("space"), kind: "space", lines };
}

function contentBlockForKind(kind: ContentBlockKind): EditorContentBlock {
  if (kind === "choices") return choiceListBlock();
  if (kind === "diagram") return diagramBlock();
  if (kind === "space") return spaceBlock();
  return textBlock();
}

function diagramAlignmentClass(alignment?: DiagramAlignment) {
  if (alignment === "left") return "justify-start";
  if (alignment === "right") return "justify-end";
  return "justify-center";
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
  const defaultLabel = kind === "point" ? "A" : kind === "tangent" ? "T" : kind === "label" ? `Label ${index + 1}` : `Feature ${index + 1}`;
  const defaultLabelMode = isRegionFeatureKind(kind)
    ? "area"
    : kind === "tangent"
      ? "name_and_value"
      : kind === "label"
        ? "name"
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
  const configured: GraphFunction[] = graphConfig?.functions?.length
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

function diagramTypePatch(type: string, current: GraphConfig): Partial<GraphConfig> {
  const normalizedType = normalizeDiagramType(type);
  if (isPenroseDiagramType(normalizedType)) return { ...DEFAULT_GEOMETRIC_DIAGRAM, type: normalizedType };
  if (normalizedType === "statsChart") return DEFAULT_STATS_CHART;
  if (isPenroseDiagramType(normalizeDiagramType(current.type)) || normalizeDiagramType(current.type) === "statsChart") {
    return normalizedType === "graph3d" ? { ...DEFAULT_2D_GRAPH, type: "graph3d" } : { ...DEFAULT_2D_GRAPH, type: normalizedType };
  }
  return { type: normalizedType };
}

function penroseScalePercent(graphConfig?: GraphConfig | null) {
  const scale = Number(graphConfig?.scalePercent ?? graphConfig?.options?.scalePercent);
  return Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_PENROSE_SCALE_PERCENT;
}

function penrosePreset(graphConfig?: GraphConfig | null) {
  const preset = String(
    graphConfig?.penrosePreset ?? graphConfig?.options?.penrosePreset ?? graphConfig?.options?.preset ?? graphConfig?.style ?? "",
  );
  return preset === DEFAULT_PENROSE_PRESET ? preset : DEFAULT_PENROSE_PRESET;
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

function penroseLabelStatement(name: string, label?: unknown) {
  if (label === undefined || label === null || label === "") return `Label ${name} $${name}$`;
  const source = String(label);
  if (source.startsWith("$") && source.endsWith("$")) return `Label ${name} ${source}`;
  return `Label ${name} $${penroseLabelValue(source)}$`;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function geometricSourceData(config: GraphConfig) {
  const data = asRecord(config.data) ?? asRecord(DEFAULT_GEOMETRIC_DATA);
  const objects = recordArray(data?.objects);
  const relationships = recordArray(data?.relationships);
  return { objects, relationships };
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

function generatedPenroseSubstance(config: GraphConfig) {
  const { objects, relationships } = geometricSourceData(config);
  const points = new Map<string, Record<string, unknown>>();
  objects.forEach((object, index) => {
    if (object?.type !== "point") return;
    const name = penroseIdentifier(object.name, `P${index + 1}`);
    points.set(name, { ...object, name });
  });
  relationships.forEach((relationship) => {
    const relatedPoints =
      relationship?.type === "triangle" && Array.isArray(relationship.points)
        ? relationship.points
        : relationship?.type === "equalLength"
          ? [
              relationship.first,
              relationship.second,
              relationship.segmentA,
              relationship.segmentB,
              ...(Array.isArray(relationship.segments) ? relationship.segments : []),
            ]
              .flat()
              .filter(Boolean)
          : [];
    relatedPoints.forEach((point, index) => {
      const name = penroseIdentifier(point, `P${index + 1}`);
      if (!points.has(name)) points.set(name, { type: "point", name });
    });
  });
  const pointEntries = [...points.values()];
  const pointNames = pointEntries.map((point, index) => penroseIdentifier(point.name, `P${index + 1}`));
  const lines = [`Point ${pointNames.length ? pointNames.join(", ") : "A, B, C"}`];
  pointEntries.forEach((point, index) => lines.push(penroseLabelStatement(pointNames[index] ?? `P${index + 1}`, point.label)));
  const lengthLabels = relationships.filter((relationship) => relationship.type === "labelLength" && Array.isArray(relationship.between));
  if (lengthLabels.length) lines.push(`LengthLabel ${lengthLabels.map((_, index) => `sideLabel${index + 1}`).join(", ")}`);
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
        lines.push(`EqualLength(${[...first, ...second].map((point, index) => penroseIdentifier(point, `P${index + 1}`)).join(", ")})`);
      }
    }
  });
  lengthLabels.forEach((relationship, index) => {
    const between = Array.isArray(relationship.between) ? relationship.between : [];
    if (between.length !== 2) return;
    const labelName = `sideLabel${index + 1}`;
    lines.push(penroseLabelStatement(labelName, relationship.value));
    lines.push(`LabelsSegment(${labelName}, ${penroseIdentifier(between[0], "A")}, ${penroseIdentifier(between[1], "B")})`);
  });
  return `${lines.join("\n")}\n`;
}

function withGraphDefaults(graphConfig?: GraphConfig | null): GraphConfig {
  const type = normalizeDiagramType(graphConfig?.type);
  const functions = graphFunctionsFromConfig(graphConfig);
  const features = graphFeaturesFromConfig(graphConfig);
  const firstFunction = functions[0];
  if (isPenroseDiagramType(type)) {
    return {
      ...DEFAULT_GEOMETRIC_DIAGRAM,
      ...(graphConfig ?? {}),
      type,
      data: graphConfig?.data ?? DEFAULT_GEOMETRIC_DATA,
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

function defaultSavedTestName(frontMatter: FrontMatterConfig) {
  const name = [frontMatter.subjectTitle, frontMatter.assessmentTitle]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" - ");
  return name || "Untitled test";
}

function uniqueSavedTestName(baseName: string, savedTests: SavedTest[], ignoreId?: string) {
  const base = baseName.trim() || "Untitled test";
  const names = new Set(savedTests.filter((test) => test.id !== ignoreId).map((test) => test.name.trim().toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;

  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${base} ${suffix}`;
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

function normalizeContentBlocks(value: unknown): EditorContentBlock[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((block): EditorContentBlock[] => {
    const record = asRecord(block);
    if (!record) return [];
    const blockId = typeof record.id === "string" ? record.id : id("block");

    if (record.kind === "text") {
      return [
        {
          id: blockId,
          kind: "text",
          text: typeof record.text === "string" ? record.text : "",
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
          graphConfig: withGraphDefaults(graphConfig),
        },
      ];
    }

    if (record.kind === "space") {
      return [
        {
          id: blockId,
          kind: "space",
          lines: spaceLines(record.lines),
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
  if (!frontMatter || !questions.length) return null;

  return {
    frontMatter,
    questions,
    selectedSavedTestId: typeof record.selectedSavedTestId === "string" ? record.selectedSavedTestId : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

function loadCurrentDraft(): EditorHistorySnapshot | null {
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

let initialEditorDraftCache: EditorHistorySnapshot | null | undefined;

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

function loadSavedTests(): SavedTest[] {
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

function mergeSavedTests(primary: SavedTest[], fallback: SavedTest[]) {
  const byId = new Map<string, SavedTest>();
  for (const test of fallback) byId.set(test.id, test);
  for (const test of primary) {
    const existing = byId.get(test.id);
    byId.set(test.id, !existing || test.updatedAt >= existing.updatedAt ? test : existing);
  }
  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function upsertSavedTestList(current: SavedTest[], savedTest: SavedTest) {
  const next = current.some((test) => test.id === savedTest.id)
    ? current.map((test) => (test.id === savedTest.id ? savedTest : test))
    : [savedTest, ...current];
  return next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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

function persistSavedTests(savedTests: SavedTest[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(SAVED_TEST_STORAGE_KEY, JSON.stringify(savedTests));
  } catch {
    // Large embedded logo data can exceed browser storage limits; keep the in-memory tests for this session.
  }
}

function createSavedTestSnapshot({
  testId,
  name,
  frontMatter,
  questions,
  logo,
  createdAt,
}: {
  testId: string;
  name: string;
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  logo?: LogoAsset;
  createdAt?: string;
}): SavedTest {
  const now = new Date().toISOString();
  const savedLogo = logo
    ? {
        id: logo.builtIn ? logo.id : savedTestLogoId(testId),
        name: logo.name,
        src: logo.src,
        builtIn: logo.builtIn,
      }
    : undefined;

  return {
    id: testId,
    name,
    frontMatter: cloneSerializable({ ...frontMatter, logoId: savedLogo?.id ?? frontMatter.logoId }),
    questions: cloneSerializable(normalizeQuestionBlocks(questions)),
    logo: savedLogo,
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
}

function markLabel(marks: number) {
  return `(${marks} mark${marks === 1 ? "" : "s"})`;
}

function mauthdownAttributeValue(value: string | number | boolean) {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

function mauthdownDiagramBlock(block: DiagramContentBlock) {
  const config = withGraphDefaults(block.graphConfig);
  const align = block.diagramAlign ?? "center";
  if (config.type === "geometricConstruction") {
    const scale = penroseScalePercent(config);
    return [
      `:::diagram type="geometricConstruction" align="${align}" scale=${scale}`,
      `${MAUTHDOWN_CODE_FENCE}penrose`,
      penroseSubstanceSource(config).trimEnd(),
      MAUTHDOWN_CODE_FENCE,
      ":::",
      "",
    ].join("\n");
  }

  return [
    `:::diagram type="${config.type}" align="${align}"`,
    `${MAUTHDOWN_CODE_FENCE}json`,
    JSON.stringify(config, null, 2),
    MAUTHDOWN_CODE_FENCE,
    ":::",
    "",
  ].join("\n");
}

function mauthdownChoicesBlock(block: Extract<EditorContentBlock, { kind: "choices" }>) {
  const style = normalizeChoiceNumberingStyle(block.numberingStyle);
  const layout = normalizeChoiceListLayout(block.layout);
  const choices = normalizeChoiceItems(block.choices);
  return [`:::choices style="${style}" layout="${layout}"`, ...choices.map((choice) => `- ${choice.trimEnd()}`), ":::", ""].join("\n");
}

function mauthdownContentBlocks(blocks: EditorContentBlock[], emptyLabel: string) {
  if (!blocks.length) {
    return [`:::text`, `_${emptyLabel}_`, ":::", ""].join("\n");
  }

  return blocks
    .map((block) => {
      if (block.kind === "text") return [`:::text`, (block.text ?? "").trimEnd(), ":::", ""].join("\n");
      if (block.kind === "choices") return mauthdownChoicesBlock(block);
      if (block.kind === "space") return `:::space lines=${spaceLines(block.lines)}\n:::\n\n`;
      if (block.kind === "diagram") return mauthdownDiagramBlock(block);
      if (block.kind === "pageBreak") return ":::page-break\n:::\n\n";
      return "";
    })
    .join("");
}

function createMauthdownDocument({
  frontMatter,
  questions,
  logo,
}: {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  logo?: LogoAsset;
}): MauthdownDocument {
  const normalizedQuestions = normalizeQuestionBlocks(questions);
  return {
    format: "mauthdown",
    version: MAUTHDOWN_VERSION,
    exportedAt: new Date().toISOString(),
    testName: defaultSavedTestName(frontMatter),
    totalMarks: normalizedQuestions.reduce((sum, question) => sum + questionMarks(question), 0),
    frontMatter: cloneSerializable(frontMatter),
    logo: logo ? cloneSerializable(logo) : undefined,
    questions: cloneSerializable(normalizedQuestions),
  };
}

function buildMauthdownFile(document: MauthdownDocument) {
  const titlePayload = JSON.stringify(
    {
      frontMatter: document.frontMatter,
      logo: document.logo ?? null,
    },
    null,
    2,
  );
  const lines = [
    "---",
    `mauthdown: ${document.version}`,
    `title: ${JSON.stringify(document.testName)}`,
    `exportedAt: ${JSON.stringify(document.exportedAt)}`,
    `startQuestionNumber: ${normalizedStartQuestionNumber(document.frontMatter)}`,
    `totalMarks: ${document.totalMarks}`,
    "---",
    "",
    "# Title Page",
    "",
    ":::title-page",
    `${MAUTHDOWN_CODE_FENCE}json`,
    titlePayload,
    MAUTHDOWN_CODE_FENCE,
    ":::",
    "",
    "# Questions",
    "",
  ];

  document.questions.forEach((question, questionIndex) => {
    lines.push(
      `:::question section=${mauthdownAttributeValue(question.section)} marks=${mauthdownAttributeValue(question.marks)}`,
      `<!-- Question ${questionDisplayNumber(document.frontMatter, questionIndex)} ${markLabel(questionMarks(question))} -->`,
      "",
    );
    const questionItems = orderedQuestionItems(question);
    if (!questionItems.length) lines.push(mauthdownContentBlocks([], "Blank question"));

    questionItems.forEach((item) => {
      if (item.kind === "block") {
        lines.push(mauthdownContentBlocks([item.block], "Blank question"));
        return;
      }

      const partIndex = question.parts.findIndex((part) => part.id === item.part.id);
      lines.push(`:::part marks=${mauthdownAttributeValue(item.part.marks)}`, `<!-- Part (${alphaLabel(Math.max(0, partIndex))}) -->`, "");

      const partItems = orderedPartItems(item.part);
      if (!partItems.length) lines.push(mauthdownContentBlocks([], "Blank part"));
      partItems.forEach((partItem) => {
        if (partItem.kind === "block") {
          lines.push(mauthdownContentBlocks([partItem.block], "Blank part"));
          return;
        }

        const subpartIndex = item.part.subparts.findIndex((subpart) => subpart.id === partItem.subpart.id);
        lines.push(
          `:::subpart marks=${mauthdownAttributeValue(partItem.subpart.marks)}`,
          `<!-- Subpart (${romanLabel(Math.max(0, subpartIndex))}) -->`,
          "",
        );
        lines.push(mauthdownContentBlocks(partItem.subpart.contentBlocks, "Blank subpart"));
        lines.push(":::/subpart", "");
      });

      lines.push(":::/part", "");
    });

    if (question.pageBreakAfter) {
      lines.push(":::page-break", ":::", "");
    }

    lines.push(":::/question", "");
  });

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

function parseMauthdownScalar(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const numberValue = Number(trimmed);
  if (Number.isFinite(numberValue) && /^-?\d+(?:\.\d+)?$/.test(trimmed)) return numberValue;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed.replace(/^["']|["']$/g, "");
  }
}

function parseMauthdownFrontMatter(source: string) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---/);
  const fields: Record<string, unknown> = {};
  if (!match?.[1]) return fields;

  for (const line of match[1].split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;
    fields[key] = parseMauthdownScalar(line.slice(separatorIndex + 1));
  }

  return fields;
}

function parseMauthdownAttributes(source: string) {
  const attrs: Record<string, string> = {};
  const pattern = /([A-Za-z][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function parseMauthdownDirective(line: string) {
  const match = line.trim().match(/^:::(\/?)([A-Za-z][A-Za-z0-9_-]*)(.*)$/);
  if (!match) return null;
  return {
    closing: match[1] === "/",
    name: match[2],
    attrs: parseMauthdownAttributes(match[3] ?? ""),
  };
}

function mauthdownAttributeNumber(attrs: Record<string, string>, key: string, fallback: number) {
  const value = Number(attrs[key]);
  return Number.isFinite(value) ? value : fallback;
}

function mauthdownAttributeAlignment(attrs: Record<string, string>) {
  const value = attrs.align === "centre" ? "center" : attrs.align;
  return normalizeDiagramAlignment(value);
}

function readMauthdownPayload(lines: string[], directiveIndex: number) {
  let index = directiveIndex + 1;
  while (index < lines.length && !lines[index].trim()) index += 1;

  if (lines[index]?.trim().startsWith(MAUTHDOWN_CODE_FENCE)) {
    const language = lines[index].trim().slice(MAUTHDOWN_CODE_FENCE.length).trim();
    index += 1;
    const payloadLines: string[] = [];
    while (index < lines.length && !lines[index].trim().startsWith(MAUTHDOWN_CODE_FENCE)) {
      payloadLines.push(lines[index]);
      index += 1;
    }
    if (index < lines.length) index += 1;
    while (index < lines.length && lines[index].trim() !== ":::") index += 1;
    if (index < lines.length) index += 1;
    return { language, payload: payloadLines.join("\n").trimEnd(), nextIndex: index };
  }

  const payloadLines: string[] = [];
  while (index < lines.length && lines[index].trim() !== ":::") {
    payloadLines.push(lines[index]);
    index += 1;
  }
  if (index < lines.length) index += 1;
  return { language: "", payload: payloadLines.join("\n").trimEnd(), nextIndex: index };
}

function readMauthdownPlainText(lines: string[], startIndex: number) {
  const textLines: string[] = [];
  let index = startIndex;
  while (index < lines.length && !lines[index].trim().startsWith(":::")) {
    const trimmed = lines[index].trim();
    if (!trimmed.startsWith("<!--") && !trimmed.endsWith("-->")) textLines.push(lines[index]);
    index += 1;
  }
  return { text: textLines.join("\n").trim(), nextIndex: index };
}

function choicesFromMauthdownPayload(payload: string) {
  const choices = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, ""));
  return choices.length ? choices : [""];
}

type MauthdownStackItem =
  | { kind: "question"; value: QuestionBlock }
  | { kind: "part"; value: EditorPart }
  | { kind: "subpart"; value: EditorSubpart };

function currentMauthdownQuestion(stack: MauthdownStackItem[], questions: QuestionBlock[]) {
  return (
    [...stack].reverse().find((item): item is { kind: "question"; value: QuestionBlock } => item.kind === "question")?.value ??
    questions.at(-1)
  );
}

function ensureMauthdownQuestion(stack: MauthdownStackItem[], questions: QuestionBlock[]) {
  const existing = currentMauthdownQuestion(stack, questions);
  if (existing) return existing;
  const question = createQuestion();
  questions.push(question);
  stack.push({ kind: "question", value: question });
  return question;
}

function currentMauthdownPart(stack: MauthdownStackItem[], questions: QuestionBlock[]) {
  const existing = [...stack].reverse().find((item): item is { kind: "part"; value: EditorPart } => item.kind === "part")?.value;
  if (existing) return existing;
  const question = ensureMauthdownQuestion(stack, questions);
  const part: EditorPart = { id: id("part"), label: "", text: "", marks: 0, contentBlocks: [], subparts: [], itemOrder: [] };
  question.parts.push(part);
  question.itemOrder.push({ kind: "part", id: part.id });
  stack.push({ kind: "part", value: part });
  return part;
}

function addMauthdownContentBlock(stack: MauthdownStackItem[], questions: QuestionBlock[], block: EditorContentBlock) {
  const owner = stack[stack.length - 1];
  if (owner?.kind === "subpart") {
    owner.value.contentBlocks.push(block);
    return;
  }
  if (owner?.kind === "part") {
    owner.value.contentBlocks.push(block);
    owner.value.itemOrder.push({ kind: "block", id: block.id });
    return;
  }
  const question = ensureMauthdownQuestion(stack, questions);
  question.contentBlocks.push(block);
  question.itemOrder.push({ kind: "block", id: block.id });
}

function closeMauthdownContainer(stack: MauthdownStackItem[], name: string) {
  const expectedKind = name === "question" || name === "part" || name === "subpart" ? name : "";
  if (!expectedKind) return;
  let index = -1;
  for (let itemIndex = stack.length - 1; itemIndex >= 0; itemIndex -= 1) {
    if (stack[itemIndex].kind === expectedKind) {
      index = itemIndex;
      break;
    }
  }
  if (index !== -1) stack.splice(index);
}

function defaultMauthdownGraphConfig(type: string): GraphConfig {
  const normalizedType = normalizeDiagramType(type);
  if (isPenroseDiagramType(normalizedType)) return withGraphDefaults({ ...DEFAULT_GEOMETRIC_DIAGRAM, type: normalizedType });
  if (normalizedType === "statsChart") return withGraphDefaults(DEFAULT_STATS_CHART);
  if (normalizedType === "graph3d") return withGraphDefaults({ ...DEFAULT_2D_GRAPH, type: "graph3d" });
  if (normalizedType === "vector2d") return withGraphDefaults({ ...DEFAULT_2D_GRAPH, type: "vector2d" });
  return withGraphDefaults({ ...DEFAULT_2D_GRAPH, type: normalizedType });
}

function graphConfigFromMauthdownDiagram(attrs: Record<string, string>, language: string, payload: string): GraphConfig {
  const type = normalizeDiagramType(attrs.type);
  if (isPenroseDiagramType(type) || language === "penrose") {
    const scalePercent = mauthdownAttributeNumber(attrs, "scale", DEFAULT_PENROSE_SCALE_PERCENT);
    return withGraphDefaults({
      ...DEFAULT_GEOMETRIC_DIAGRAM,
      type: isPenroseDiagramType(type) ? type : "geometricConstruction",
      scalePercent,
      options: {
        ...penroseOptions(DEFAULT_GEOMETRIC_DIAGRAM),
        scalePercent,
        substanceSource: payload.trim(),
      },
    });
  }

  if (language === "json" && payload.trim()) {
    try {
      const parsed = JSON.parse(payload) as unknown;
      const record = asRecord(parsed);
      const graphConfig = record && asRecord(record.graphConfig) ? (record.graphConfig as GraphConfig) : (parsed as GraphConfig);
      return withGraphDefaults({ ...graphConfig, type: graphConfig.type ?? type });
    } catch {
      return defaultMauthdownGraphConfig(type);
    }
  }

  return defaultMauthdownGraphConfig(type);
}

function parseMauthdownTitlePagePayload(payload: string) {
  try {
    const record = asRecord(JSON.parse(payload));
    if (!record) return {};
    const frontMatter = normalizeFrontMatter(record.frontMatter ?? record);
    return {
      frontMatter: frontMatter ?? undefined,
      logo: normalizeLogoAsset(record.logo),
    };
  } catch {
    return {};
  }
}

function parseAuthoredMauthdownDocument(source: string): MauthdownDocument | null {
  if (!source.includes(":::question")) return null;

  const header = parseMauthdownFrontMatter(source);
  const headerVersion = typeof header.mauthdown === "number" ? header.mauthdown : MAUTHDOWN_VERSION;
  const lines = source.split(/\r?\n/);
  const stack: MauthdownStackItem[] = [];
  const questions: QuestionBlock[] = [];
  let titleFrontMatter: FrontMatterConfig | undefined;
  let titleLogo: LogoAsset | undefined;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const directive = parseMauthdownDirective(line);

    if (!trimmed || trimmed.startsWith("#") || (trimmed.startsWith("<!--") && trimmed.endsWith("-->"))) {
      index += 1;
      continue;
    }

    if (!directive) {
      if (stack.length) {
        const plain = readMauthdownPlainText(lines, index);
        if (plain.text) addMauthdownContentBlock(stack, questions, { id: id("text"), kind: "text", text: plain.text });
        index = plain.nextIndex;
        continue;
      }
      index += 1;
      continue;
    }

    if (directive.closing) {
      closeMauthdownContainer(stack, directive.name);
      index += 1;
      continue;
    }

    if (directive.name === "title-page") {
      const payload = readMauthdownPayload(lines, index);
      const titlePage = parseMauthdownTitlePagePayload(payload.payload);
      titleFrontMatter = titlePage.frontMatter;
      titleLogo = titlePage.logo;
      index = payload.nextIndex;
      continue;
    }

    if (directive.name === "question") {
      const question: QuestionBlock = {
        id: id("question"),
        section: directive.attrs.section || "Algebra",
        marks: mauthdownAttributeNumber(directive.attrs, "marks", 0),
        contentBlocks: [],
        parts: [],
        itemOrder: [],
        pageBreakAfter: false,
      };
      questions.push(question);
      stack.push({ kind: "question", value: question });
      index += 1;
      continue;
    }

    if (directive.name === "part") {
      const question = ensureMauthdownQuestion(stack, questions);
      const part: EditorPart = {
        id: id("part"),
        label: "",
        text: "",
        marks: mauthdownAttributeNumber(directive.attrs, "marks", 0),
        contentBlocks: [],
        subparts: [],
        itemOrder: [],
      };
      question.parts.push(part);
      question.itemOrder.push({ kind: "part", id: part.id });
      stack.push({ kind: "part", value: part });
      index += 1;
      continue;
    }

    if (directive.name === "subpart") {
      const part = currentMauthdownPart(stack, questions);
      const subpart: EditorSubpart = {
        id: id("subpart"),
        label: "",
        text: "",
        marks: mauthdownAttributeNumber(directive.attrs, "marks", 0),
        contentBlocks: [],
      };
      part.subparts.push(subpart);
      part.itemOrder.push({ kind: "subpart", id: subpart.id });
      stack.push({ kind: "subpart", value: subpart });
      index += 1;
      continue;
    }

    if (directive.name === "text") {
      const payload = readMauthdownPayload(lines, index);
      addMauthdownContentBlock(stack, questions, { id: id("text"), kind: "text", text: payload.payload });
      index = payload.nextIndex;
      continue;
    }

    if (directive.name === "choices" || directive.name === "choice-list") {
      const payload = readMauthdownPayload(lines, index);
      addMauthdownContentBlock(stack, questions, {
        id: id("choices"),
        kind: "choices",
        choices: choicesFromMauthdownPayload(payload.payload),
        numberingStyle: normalizeChoiceNumberingStyle(directive.attrs.style ?? directive.attrs.numbering),
        layout: normalizeChoiceListLayout(directive.attrs.layout),
      });
      index = payload.nextIndex;
      continue;
    }

    if (directive.name === "space") {
      addMauthdownContentBlock(stack, questions, {
        id: id("space"),
        kind: "space",
        lines: mauthdownAttributeNumber(directive.attrs, "lines", 3),
      });
      const payload = readMauthdownPayload(lines, index);
      index = payload.nextIndex;
      continue;
    }

    if (directive.name === "page-break" || directive.name === "pagebreak") {
      const question = currentMauthdownQuestion(stack, questions);
      if (question) question.pageBreakAfter = true;
      const payload = readMauthdownPayload(lines, index);
      index = payload.nextIndex;
      continue;
    }

    if (directive.name === "diagram") {
      const payload = readMauthdownPayload(lines, index);
      addMauthdownContentBlock(stack, questions, {
        id: id("diagram"),
        kind: "diagram",
        diagramAlign: mauthdownAttributeAlignment(directive.attrs),
        graphConfig: graphConfigFromMauthdownDiagram(directive.attrs, payload.language, payload.payload),
      });
      index = payload.nextIndex;
      continue;
    }

    index += 1;
  }

  const frontMatter =
    titleFrontMatter ??
    normalizeFrontMatter({
      ...DEFAULT_FRONT_MATTER,
      assessmentTitle: typeof header.title === "string" ? header.title : DEFAULT_FRONT_MATTER.assessmentTitle,
      startQuestionNumber: header.startQuestionNumber,
    });
  const normalizedQuestions = normalizeQuestionBlocks(questions);
  if (!frontMatter || !normalizedQuestions.length) return null;

  return {
    format: "mauthdown",
    version: headerVersion,
    exportedAt: typeof header.exportedAt === "string" ? header.exportedAt : new Date().toISOString(),
    testName: typeof header.title === "string" ? header.title : defaultSavedTestName(frontMatter),
    totalMarks: normalizedQuestions.reduce((sum, question) => sum + questionMarks(question), 0),
    frontMatter,
    logo: titleLogo,
    questions: normalizedQuestions,
  };
}

function extractMauthdownJson(source: string) {
  const fencePattern = new RegExp(`${MAUTHDOWN_DATA_FENCE}mauthdown-json\\s*\\n([\\s\\S]*?)\\n${MAUTHDOWN_DATA_FENCE}`);
  const match = source.match(fencePattern);
  if (match?.[1]) return match[1];

  const trimmed = source.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  return "";
}

function parseMauthdownDocument(source: string): MauthdownDocument | null {
  const authoredDocument = parseAuthoredMauthdownDocument(source);
  if (authoredDocument) return authoredDocument;

  const jsonSource = extractMauthdownJson(source);
  if (!jsonSource) return null;

  try {
    const parsed = JSON.parse(jsonSource) as unknown;
    const record = asRecord(parsed);
    if (!record || record.format !== "mauthdown") return null;
    const frontMatter = normalizeFrontMatter(record.frontMatter);
    const questions = normalizeQuestionBlocks(record.questions);
    if (!frontMatter || !questions.length) return null;

    return {
      format: "mauthdown",
      version: typeof record.version === "number" ? record.version : MAUTHDOWN_VERSION,
      exportedAt: typeof record.exportedAt === "string" ? record.exportedAt : new Date().toISOString(),
      testName: typeof record.testName === "string" ? record.testName : defaultSavedTestName(frontMatter),
      totalMarks: safeMarkValue(record.totalMarks),
      frontMatter,
      logo: normalizeLogoAsset(record.logo),
      questions,
    };
  } catch {
    return null;
  }
}

function slugifyFileName(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "math-test";
}

function downloadTextFile(fileName: string, contents: string) {
  const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
        <p key={`${paragraph}-${index}`} className="m-0">
          {renderInlineFormatting(paragraph)}
        </p>
      ))}
    </div>
  );
}

function FormattedInlineText({ text }: { text: string }) {
  return <>{renderInlineFormatting(text)}</>;
}

function insertAfter<T extends { id: string }>(items: T[], afterId: string, item: T) {
  const index = items.findIndex((current) => current.id === afterId);
  if (index === -1) return [...items, item];
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}

function insertBeforeByKey<T>(items: T[], beforeKey: string, item: T, keyForItem: (item: T) => string) {
  const index = items.findIndex((current) => keyForItem(current) === beforeKey);
  if (index === -1) return [...items, item];
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function insertAtStart<T>(items: T[], item: T) {
  return [item, ...items];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function scrollableRatio(element: HTMLElement) {
  const maxScroll = scrollableRange(element);
  return maxScroll > 0 ? clamp(element.scrollTop / maxScroll, 0, 1) : 0;
}

function scrollableRange(element: HTMLElement) {
  const maxScroll = element.scrollHeight - element.clientHeight;
  return Math.max(0, maxScroll);
}

function setScrollableRatio(element: HTMLElement, ratio: number) {
  const maxScroll = scrollableRange(element);
  if (maxScroll <= 0) return;
  element.scrollTop = clamp(ratio, 0, 1) * maxScroll;
}

const SCROLL_ANCHOR_FRONT_MATTER = "front-matter";
const SCROLL_ANCHOR_TOP_OFFSET_PX = 12;
const SCROLL_SYNC_RELEASE_MS = 100;
const SCROLL_ANCHOR_SELECTOR = "[data-scroll-anchor]";

interface ScrollAnchorPosition {
  anchor: string;
  progress: number;
}

function questionScrollAnchor(questionId: string) {
  return `q:${questionId}`;
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

function scrollAnchorFallbacks(anchor: string) {
  const fallbacks: string[] = [];
  const parts = anchor.split("/");
  while (parts.length) {
    fallbacks.push(parts.join("/"));
    parts.pop();
  }
  if (anchor !== SCROLL_ANCHOR_FRONT_MATTER) fallbacks.push(SCROLL_ANCHOR_FRONT_MATTER);
  return fallbacks;
}

function scrollAnchorValue(element: HTMLElement) {
  return element.getAttribute("data-scroll-anchor");
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

function paneAnchorPosition(container: HTMLElement): ScrollAnchorPosition | null {
  const anchors = visibleScrollAnchors(container);
  if (!anchors.length) return null;

  const paneTop = container.getBoundingClientRect().top + SCROLL_ANCHOR_TOP_OFFSET_PX;
  let currentIndex = 0;
  anchors.forEach((anchor, index) => {
    if (anchor.getBoundingClientRect().top <= paneTop) currentIndex = index;
  });

  const currentAnchor = anchors[currentIndex];
  const currentAnchorValue = scrollAnchorValue(currentAnchor);
  if (!currentAnchorValue) return null;

  const currentTop = currentAnchor.getBoundingClientRect().top;
  const nextTop =
    anchors[currentIndex + 1]?.getBoundingClientRect().top ?? currentTop + Math.max(currentAnchor.getBoundingClientRect().height, 1);
  const anchorSpan = nextTop - currentTop;

  return {
    anchor: currentAnchorValue,
    progress: anchorSpan > 1 ? clamp((paneTop - currentTop) / anchorSpan, 0, 1) : 0,
  };
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

function parseSubsectionDrag(payload: string): SubsectionDragTarget | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Partial<SubsectionDragTarget>;
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

function firstTextSource(blocks: EditorContentBlock[]) {
  const textBlock = blocks.find((block) => block.kind === "text");
  if (textBlock?.kind === "text") return textBlock.text?.replace(/\s+/g, " ").trim() || "";
  const choicesBlock = blocks.find((block) => block.kind === "choices");
  return choicesBlock?.kind === "choices" ? normalizeChoiceItems(choicesBlock.choices).filter(Boolean).join("; ") : "";
}

function partPanelSummary(blocks: EditorContentBlock[]) {
  return firstTextSource(blocks);
}

function parseMixedMath(source: string) {
  const segments: Array<{ type: "text" | "inline" | "display"; content: string }> = [];
  const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > cursor) segments.push({ type: "text", content: source.slice(cursor, match.index) });
    const token = match[0];
    segments.push(
      token.startsWith("$$")
        ? { type: "display", content: token.slice(2, -2).trim() }
        : { type: "inline", content: token.slice(1, -1).trim() },
    );
    cursor = match.index + token.length;
  }

  if (cursor < source.length) segments.push({ type: "text", content: source.slice(cursor) });
  return segments;
}

function MixedMath({ source }: { source: string }) {
  const segments = useMemo(() => parseMixedMath(source), [source]);
  return (
    <div className="mixed-math">
      {segments.map((segment, index) => {
        if (segment.type === "display") {
          return (
            <div key={`${segment.content}-${index}`} className="my-3 text-left">
              <Latex latex={segment.content} block />
            </div>
          );
        }
        if (segment.type === "inline") return <Latex key={`${segment.content}-${index}`} latex={segment.content} displayStyle />;
        return <FormattedInlineText key={`${segment.content}-${index}`} text={segment.content} />;
      })}
    </div>
  );
}

function InlineMathText({ source, className, truncate = false }: { source: string; className?: string; truncate?: boolean }) {
  const segments = useMemo(() => parseMixedMath(source), [source]);
  return (
    <span className={cn(truncate ? "inline-math-truncate" : "inline min-w-0", className)} title={source}>
      {segments.map((segment, index) => {
        if (segment.type === "text") return <FormattedInlineText key={`${segment.content}-${index}`} text={segment.content} />;
        return <Latex key={`${segment.content}-${index}`} latex={segment.content} displayStyle />;
      })}
    </span>
  );
}

function InlineMathSummary({ source }: { source: string }) {
  return <InlineMathText source={source} truncate className="min-w-0 flex-1 text-sm text-muted-foreground" />;
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

function choiceLabel(style: ChoiceNumberingStyle | undefined, index: number) {
  const normalizedStyle = normalizeChoiceNumberingStyle(style);
  if (normalizedStyle === "bullet") return "•";
  if (normalizedStyle === "decimal") return `${index + 1}.`;
  if (normalizedStyle === "upper-alpha") return `${alphaLabel(index).toUpperCase()}.`;
  if (normalizedStyle === "lower-alpha") return `${alphaLabel(index)}.`;
  return `${romanLabel(index)}.`;
}

function ChoiceListPreview({ block }: { block: Extract<EditorContentBlock, { kind: "choices" }> }) {
  const choices = normalizeChoiceItems(block.choices);
  const layout = normalizeChoiceListLayout(block.layout);

  return (
    <div
      className={cn(
        "test-choice-list",
        layout === "two-column" && "test-choice-list-two-column",
        layout === "inline" && "test-choice-list-inline",
      )}
    >
      {choices.map((choice, index) => (
        <div key={`${choice}-${index}`} className="test-choice-item">
          <span className="test-choice-label">{choiceLabel(block.numberingStyle, index)}</span>
          <div className="test-choice-content">
            <MixedMath source={choice} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DiagramPreview({
  graphConfig,
  measureOnly = false,
  onGraphConfigChange,
}: {
  graphConfig?: GraphConfig | null;
  measureOnly?: boolean;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
}) {
  if (measureOnly) {
    return (
      <div className="w-full overflow-hidden bg-white" style={{ height: graphHeight(graphConfig), maxWidth: graphWidth(graphConfig) }} />
    );
  }

  switch (graphConfig?.type) {
    case "geometricConstruction":
    case "vectorRelationship":
    case "setDiagram":
      return <GeometricConstructionDiagram graphConfig={graphConfig} />;
    case "statsChart":
      return <StatsChartDiagram graphConfig={graphConfig} />;
    case "vector2d":
      return <Vector2DGraph graphConfig={graphConfig} />;
    case "graph3d":
    case "basic3d":
      return <Basic3DGraph graphConfig={graphConfig} />;
    case "graph2d":
    case "2d_graph":
    case "function":
    default:
      return <FunctionGraph graphConfig={graphConfig} onGraphConfigChange={onGraphConfigChange} />;
  }
}

function PreviewContentBlocks({
  blocks,
  measureOnly = false,
  onGraphConfigChange,
  blockAnchorFor,
}: {
  blocks: EditorContentBlock[];
  measureOnly?: boolean;
  onGraphConfigChange?: (blockId: string, graphConfig: GraphConfig) => void;
  blockAnchorFor?: (block: EditorContentBlock) => string | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {blocks.map((block) => {
        if (block.kind === "pageBreak") return null;
        const blockAnchor = measureOnly ? undefined : blockAnchorFor?.(block);
        if (block.kind === "space") {
          return (
            <div
              key={block.id}
              data-scroll-anchor={blockAnchor}
              className="test-space-block"
              style={{ "--space-lines": String(spaceLines(block.lines)) } as CSSProperties & Record<`--${string}`, string>}
            />
          );
        }
        if (block.kind === "diagram") {
          return (
            <div
              key={block.id}
              data-scroll-anchor={blockAnchor}
              className={cn("my-1 flex min-w-0", diagramAlignmentClass(block.diagramAlign))}
            >
              <DiagramPreview
                graphConfig={block.graphConfig}
                measureOnly={measureOnly}
                onGraphConfigChange={
                  measureOnly || !onGraphConfigChange ? undefined : (graphConfig) => onGraphConfigChange(block.id, graphConfig)
                }
              />
            </div>
          );
        }
        if (block.kind === "choices") {
          return (
            <div key={block.id} data-scroll-anchor={blockAnchor}>
              <ChoiceListPreview block={block} />
            </div>
          );
        }
        return (
          <div key={block.id} data-scroll-anchor={blockAnchor}>
            <MixedMath source={block.text ?? ""} />
          </div>
        );
      })}
    </div>
  );
}

function contentBlocksHaveDiagram(blocks: EditorContentBlock[]) {
  return blocks.some((block) => block.kind === "diagram");
}

interface PreviewSegment {
  id: string;
  kind: "question-start" | "question-block" | "part-group" | "page-break";
  questionIndex: number;
  spacingTop: number;
  question: QuestionBlock;
  block?: EditorContentBlock;
  part?: EditorPart;
  partIndex?: number;
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
  } as CSSProperties & Record<`--${string}`, string>;
}

function pagesAreEqual(left: PreviewPage[], right: PreviewPage[]) {
  if (left.length !== right.length) return false;
  return left.every((page, pageIndex) => {
    const other = right[pageIndex];
    return page.overflow === other.overflow && page.segmentIndexes.join(",") === other.segmentIndexes.join(",");
  });
}

function buildPreviewSegments(questions: QuestionBlock[]): PreviewSegment[] {
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

    orderedQuestionItems(question).forEach((item, itemIndex) => {
      if (item.kind === "block") {
        segments.push({
          id: `${question.id}:block:${item.block.id}`,
          kind: "question-block",
          questionIndex,
          spacingTop: itemIndex === 0 ? 8 : 12,
          question,
          block: item.block,
        });
        return;
      }

      const partIndex = question.parts.findIndex((part) => part.id === item.part.id);
      segments.push({
        id: `${question.id}:part-group:${item.part.id}`,
        kind: "part-group",
        questionIndex,
        spacingTop: itemIndex === 0 ? 16 : 28,
        question,
        part: item.part,
        partIndex: Math.max(0, partIndex),
      });
    });

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

function buildMeasuredPages(segmentHeights: number[], segments: PreviewSegment[], pageFormat: PageFormat): PreviewPage[] {
  if (!segmentHeights.length) return [{ segmentIndexes: [], overflow: false }];

  const contentHeight = pageFormat.heightPx - pageFormat.paddingYPx * 2;
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

function TestFrontMatterPreview({
  frontMatter,
  logo,
  totalMarks,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  totalMarks: number;
}) {
  const schoolNameLines = frontMatter.schoolName
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const initials = schoolInitials(schoolNameLines);

  return (
    <header className="test-front-matter" data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}>
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
              <span key={line}>{line}</span>
            ))}
          </div>
        </div>
        <div className="test-title-main">
          <h1>{frontMatter.subjectTitle}</h1>
          <p>{assessmentTitleText(frontMatter.assessmentTitle)}</p>
          {frontMatter.showAssessmentSubtitle && frontMatter.assessmentSubtitle.trim() ? (
            <p className="test-assessment-subtitle">{frontMatter.assessmentSubtitle}</p>
          ) : null}
        </div>
      </section>

      <section className="test-student-row">
        <div className="test-name-line">
          <span>{frontMatter.nameLabel}:</span>
          <span aria-hidden="true" />
        </div>
        <div className="test-mark-line">
          <span>{frontMatter.markLabel}:</span>
          <span aria-hidden="true" />
          <strong>{totalMarks}</strong>
        </div>
      </section>

      {frontMatter.showDeclaration ? (
        <section className="test-declaration-panel">
          <div className="test-declaration-copy">
            <h2>{frontMatter.declarationTitle}</h2>
            <FormattedText text={frontMatter.declarationBody} />
          </div>
          <div className="test-signature-panel">
            <strong>{frontMatter.signatureLabel}</strong>
            <span aria-hidden="true" />
            <em>{frontMatter.signatureRole}</em>
          </div>
        </section>
      ) : null}

      {frontMatter.showInstructions ? (
        <section className="test-instructions-panel">
          <h2>{frontMatter.instructionsTitle}</h2>
          <FormattedText text={frontMatter.instructionsBody} className="test-instructions-body" />
        </section>
      ) : null}
    </header>
  );
}

function TestPreviewSegment({
  segment,
  frontMatter,
  firstOnPage = false,
  measureOnly = false,
  onGraphConfigChange,
}: {
  segment: PreviewSegment;
  frontMatter: FrontMatterConfig;
  firstOnPage?: boolean;
  measureOnly?: boolean;
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
          <span className="whitespace-nowrap font-bold">{markLabel(questionMarks(segment.question))}</span>
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
          blocks={[segment.block]}
          measureOnly={measureOnly}
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
    const partItems = orderedPartItems(part);
    const visiblePartBlocks = partItems.filter((item) => item.kind === "block");
    const firstContentItemId = visiblePartBlocks[0]?.id;
    return (
      <section
        className="test-preview-segment test-part-group"
        data-scroll-anchor={measureOnly ? undefined : partScrollAnchor(segment.question.id, part.id)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        {hasSubparts && !visiblePartBlocks.length ? (
          <div className="test-question-part">
            <span className="test-part-label">({partLabel})</span>
            <div className="test-part-content" />
            <span className="test-part-mark" />
          </div>
        ) : null}
        <div className={cn(hasSubparts && "test-subpart-group")}>
          {partItems.map((item) => {
            if (item.kind === "block") {
              return (
                <div
                  key={item.id}
                  data-scroll-anchor={measureOnly ? undefined : partBlockScrollAnchor(segment.question.id, part.id, item.block.id)}
                  className={cn("test-question-part", item.block.kind === "diagram" && "test-question-row-with-diagram")}
                >
                  <span className="test-part-label">{item.id === firstContentItemId ? `(${partLabel})` : ""}</span>
                  <div className="test-part-content">
                    <PreviewContentBlocks
                      blocks={[item.block]}
                      measureOnly={measureOnly}
                      onGraphConfigChange={(blockId, graphConfig) =>
                        onGraphConfigChange?.({ questionId: segment.question.id, partId: part.id, blockId, graphConfig })
                      }
                    />
                  </div>
                  <span className="test-part-mark">{!hasSubparts && item.id === firstContentItemId ? markLabel(part.marks) : ""}</span>
                </div>
              );
            }

            if (item.kind === "subpart") {
              const subpartIndex = part.subparts.findIndex((subpart) => subpart.id === item.subpart.id);
              return (
                <div
                  key={item.subpart.id}
                  data-scroll-anchor={measureOnly ? undefined : subpartScrollAnchor(segment.question.id, part.id, item.subpart.id)}
                  className={cn(
                    "test-question-subpart",
                    contentBlocksHaveDiagram(item.subpart.contentBlocks) && "test-question-row-with-diagram",
                  )}
                >
                  <span className="test-part-label">({romanLabel(Math.max(0, subpartIndex))})</span>
                  <div className="test-part-content">
                    <PreviewContentBlocks
                      blocks={item.subpart.contentBlocks}
                      measureOnly={measureOnly}
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
                  <span className="test-part-mark">{markLabel(item.subpart.marks)}</span>
                </div>
              );
            }

            return null;
          })}
        </div>
      </section>
    );
  }

  return <div className="test-preview-segment" data-measure-segment={measureOnly ? "true" : undefined} style={{ paddingTop }} />;
}

function PaginatedTestPreview({
  frontMatter,
  logos,
  totalMarks,
  questions,
  formattingConfig,
  scale = 1,
  onGraphConfigChange,
}: {
  frontMatter: FrontMatterConfig;
  logos: LogoAsset[];
  totalMarks: number;
  questions: QuestionBlock[];
  formattingConfig?: FormattingConfig;
  scale?: number;
  onGraphConfigChange?: (change: PreviewGraphConfigChange) => void;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const pageFormat = useMemo(() => pageFormatFromConfig(formattingConfig), [formattingConfig]);
  const previewStyle = useMemo(() => pageStyle(pageFormat, scale), [pageFormat, scale]);
  const segments = useMemo(() => buildPreviewSegments(questions), [questions]);
  const fallbackPages = useMemo<PreviewPage[]>(() => [{ segmentIndexes: segments.map((_, index) => index), overflow: false }], [segments]);
  const [pages, setPages] = useState<PreviewPage[]>(fallbackPages);
  const frontMatterLogo = useMemo(() => selectedLogoFromLibrary(logos, frontMatter.logoId), [frontMatter.logoId, logos]);

  useLayoutEffect(() => {
    const measureRoot = measureRef.current;
    if (!measureRoot) return;

    const segmentHeights = Array.from(measureRoot.querySelectorAll<HTMLElement>("[data-measure-segment]")).map(
      (element) => element.getBoundingClientRect().height,
    );
    const nextPages = buildMeasuredPages(segmentHeights, segments, pageFormat);
    setPages((currentPages) => (pagesAreEqual(currentPages, nextPages) ? currentPages : nextPages));
  }, [fallbackPages, frontMatter, pageFormat, questions, segments, totalMarks]);

  const visiblePages = pages.length ? pages : fallbackPages;

  return (
    <div className="a4-preview-root" style={previewStyle}>
      <div className="a4-preview-shell">
        <div className="a4-preview-stack">
          <section className="a4-page">
            <div className="a4-page-content">
              <TestFrontMatterPreview frontMatter={frontMatter} logo={frontMatterLogo} totalMarks={totalMarks} />
            </div>
          </section>
          {pageFormat.showPageBreaks ? (
            <div className="a4-page-break" aria-hidden="true">
              <span>A4 page break</span>
            </div>
          ) : null}
          {visiblePages.map((page, pageIndex) => {
            const visibleSegments = page.segmentIndexes.map((segmentIndex) => segments[segmentIndex]).filter(Boolean);
            return (
              <div key={`page-${pageIndex}`} className="contents">
                <section className={cn("a4-page", pageIndex === visiblePages.length - 1 && "a4-page-last")}>
                  <div className="a4-page-content">
                    <div className="test-preview-flow">
                      {visibleSegments.map((segment, segmentPageIndex) => (
                        <TestPreviewSegment
                          key={segment.id}
                          segment={segment}
                          frontMatter={frontMatter}
                          firstOnPage={segmentPageIndex === 0}
                          onGraphConfigChange={onGraphConfigChange}
                        />
                      ))}
                    </div>
                    {page.overflow ? (
                      <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                        A single block in this question is taller than the available A4 page space.
                      </div>
                    ) : null}
                  </div>
                </section>
                {pageFormat.showPageBreaks && pageIndex < visiblePages.length - 1 ? (
                  <div className="a4-page-break" aria-hidden="true">
                    <span>A4 page break</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div ref={measureRef} className="a4-measure" aria-hidden="true">
        <section className="a4-page">
          <div className="a4-page-content">
            <div className="test-preview-flow">
              {segments.map((segment) => (
                <TestPreviewSegment key={segment.id} segment={segment} frontMatter={frontMatter} measureOnly />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

interface DiagramBlockEditorProps {
  label: string;
  graphConfig: GraphConfig;
  alignment?: DiagramAlignment;
  dragHandle?: ReactNode;
  muted?: boolean;
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
  className,
  bodyClassName,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn("rounded-md border bg-background", className)}>
      <div data-panel-region="header" className="flex items-center gap-2 p-2">
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
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
          aria-expanded={open}
        >
          <span className="block max-w-full truncate text-sm font-semibold">{title}</span>
          {subtitle ? <span className="block max-w-full truncate text-xs text-muted-foreground">{subtitle}</span> : null}
        </button>
        {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
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
  onAddText,
  onAddChoices,
  onAddDiagram,
  onAddSpace,
  extraActions = [],
}: {
  buttonLabel?: "Add";
  className?: string;
  centered?: boolean;
  onAddText?: () => void;
  onAddChoices?: () => void;
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
          label: "Space",
          tooltip: `${actionVerb} blank working space here`,
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

function TestLevelInsertionActions({
  className,
  onAddQuestion,
  onAddPageBreak,
}: {
  className?: string;
  onAddQuestion: () => void;
  onAddPageBreak?: () => void;
}) {
  return (
    <div className={cn("flex flex-wrap justify-center gap-2", className)}>
      {onAddPageBreak ? (
        <Button type="button" variant="outline" onClick={onAddPageBreak}>
          <SeparatorHorizontal data-icon="inline-start" />
          Add Page Break
        </Button>
      ) : null}
      <Button type="button" variant="outline" onClick={onAddQuestion}>
        <PlusCircle data-icon="inline-start" />
        Add Question
      </Button>
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
    <div className="flex flex-col gap-3" data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}>
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

  return {
    chartType,
    values: current.values?.length ? current.values : chartType === "box" ? [1, 2, 3, 4, 5, 6, 7] : [3, 5, 7, 7, 8, 10],
    xLabel: current.xLabel || "Value",
    yLabel: chartType === "box" ? "" : current.yLabel || "Frequency",
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
  const range = data.range ?? [-3, 3];

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
      ) : (
        <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-[minmax(0,1fr)_120px_120px]">
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
          {data.chartType === "histogram" ? (
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

function SavedTestManager({
  savedTests,
  selectedSavedTestId,
  diskStorageMessage,
  onSelectSavedTest,
  onNewTest,
  onSaveTest,
  onSaveTestAs,
  onRenameSavedTest,
  onDeleteSavedTest,
}: {
  savedTests: SavedTest[];
  selectedSavedTestId: string;
  diskStorageMessage: string;
  onSelectSavedTest: (testId: string) => void;
  onNewTest: () => void;
  onSaveTest: () => void;
  onSaveTestAs: () => void;
  onRenameSavedTest: (testId: string) => void;
  onDeleteSavedTest: (testId: string) => void;
}) {
  const selectedSavedTest = savedTests.find((test) => test.id === selectedSavedTestId);

  return (
    <section className="rounded-lg border bg-card p-4 shadow-panel">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Saved tests</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Save and reload the current title page, questions, parts, diagrams, marks, and page breaks.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex min-w-0 flex-col gap-2 text-xs font-medium">
            Test
            <select
              value={selectedSavedTestId}
              onChange={(event) => onSelectSavedTest(event.target.value)}
              className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm font-normal"
              aria-label="Saved test"
            >
              <option value="">Current unsaved test</option>
              {savedTests.map((test) => (
                <option key={test.id} value={test.id}>
                  {test.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onNewTest}>
              <PlusCircle data-icon="inline-start" />
              New Test
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onSaveTest}>
              <Save data-icon="inline-start" />
              Save
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onSaveTestAs}>
              <Copy data-icon="inline-start" />
              Duplicate
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedSavedTest}
              onClick={() => {
                if (selectedSavedTest) onRenameSavedTest(selectedSavedTest.id);
              }}
            >
              <Pencil data-icon="inline-start" />
              Rename
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedSavedTest}
              onClick={() => {
                if (selectedSavedTest) onDeleteSavedTest(selectedSavedTest.id);
              }}
            >
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedSavedTest ? `Last saved ${new Date(selectedSavedTest.updatedAt).toLocaleString()}. ` : ""}
          {diskStorageMessage}
        </p>
      </div>
    </section>
  );
}

function FrontMatterEditor({
  frontMatter,
  logos,
  onChange,
  onAddLogo,
  onRemoveLogo,
}: {
  frontMatter: FrontMatterConfig;
  logos: LogoAsset[];
  onChange: (patch: Partial<FrontMatterConfig>) => void;
  onAddLogo: (file: File) => void;
  onRemoveLogo: (logoId: string) => void;
}) {
  const selectedLogo = selectedLogoFromLibrary(logos, frontMatter.logoId);

  return (
    <div className="flex flex-col gap-3">
      <CollapsiblePanel
        title={
          <InlineSummaryTitle label="Title" summary={`${frontMatter.subjectTitle} - ${assessmentTitleText(frontMatter.assessmentTitle)}`} />
        }
        defaultOpen={false}
        className="bg-muted/20"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                <label className="flex flex-col gap-2 text-xs font-medium">
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
                  {selectedLogo && !selectedLogo.builtIn ? (
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
          <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
            School name
            <Textarea
              value={frontMatter.schoolName}
              onChange={(event) => onChange({ schoolName: event.target.value })}
              className="min-h-16 font-mono text-sm"
            />
          </label>
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
          <div className="grid grid-cols-1 gap-3 rounded-md border bg-background p-3 md:col-span-2 md:grid-cols-[auto_minmax(0,1fr)] md:items-end">
            <label className="flex items-center gap-2 pb-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={frontMatter.showAssessmentSubtitle}
                onChange={(event) => onChange({ showAssessmentSubtitle: event.target.checked })}
              />
              Show assessment subtitle
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Assessment subtitle
              <input
                value={frontMatter.assessmentSubtitle}
                onChange={(event) => onChange({ assessmentSubtitle: event.target.value })}
                placeholder="Calculator Free Section"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
          </div>
        </div>
      </CollapsiblePanel>

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
    </div>
  );
}

interface TextBlockEditorProps {
  label: string;
  text: string;
  dragHandle?: ReactNode;
  muted?: boolean;
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

function TextBlockEditor({ label, text, dragHandle, muted = false, minHeightClassName, onChange, onRemove }: TextBlockEditorProps) {
  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label={label} summary={textBlockSummary(text)} />}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
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
  onChange: (patch: Partial<Extract<EditorContentBlock, { kind: "choices" }>>) => void;
  onRemove: () => void;
}

function ChoiceListBlockEditor({ label, block, dragHandle, muted = false, onChange, onRemove }: ChoiceListBlockEditorProps) {
  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label={label} summary={choiceListSummary(block)} />}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_160px_minmax(0,1fr)]">
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

interface SpaceBlockEditorProps {
  label: string;
  lines: number;
  dragHandle?: ReactNode;
  muted?: boolean;
  onChange: (lines: number) => void;
  onRemove: () => void;
}

function SpaceBlockEditor({ label, lines, dragHandle, muted = false, onChange, onRemove }: SpaceBlockEditorProps) {
  const normalizedLines = spaceLines(lines);

  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label={label} summary={`${normalizedLines} line${normalizedLines === 1 ? "" : "s"}`} />}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
    >
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
    </CollapsiblePanel>
  );
}

function PageBreakBlockEditor({ label, dragHandle, onRemove }: { label: string; dragHandle?: ReactNode; onRemove: () => void }) {
  return (
    <section className="rounded-md border bg-background">
      <div className="flex items-center gap-2 p-2">
        {dragHandle ? <div className="flex shrink-0 items-center">{dragHandle}</div> : null}
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
  dragHandle,
  muted = false,
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
    patchConfig({ functions: nextFunctions.length ? nextFunctions : [createGraphFunction(0, DEFAULT_2D_GRAPH.expression ?? "x")] });
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
        className="h-9 w-52 rounded-md border border-input bg-background px-2 text-sm font-normal"
      >
        {DIAGRAM_TYPES.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} position`}
        value={alignment}
        onChange={(event) => onAlignmentChange(event.target.value as DiagramAlignment)}
        className="h-9 w-32 rounded-md border border-input bg-background px-2 text-sm font-normal"
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
  if (isPenroseDiagramType(config.type)) {
    return (
      <CollapsiblePanel
        title={label}
        leading={dragHandle}
        actions={diagramActions}
        className={cn("bg-background", muted && "bg-muted/30")}
        bodyClassName="p-3"
      >
        <GeometricConstructionEditor config={config} onChange={patchConfig} />
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
      >
        <StatsChartEditor config={config} onChange={patchConfig} />
      </CollapsiblePanel>
    );
  }

  return (
    <CollapsiblePanel
      title={label}
      leading={dragHandle}
      actions={diagramActions}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
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
                  disabled={functions.length === 1}
                  className="size-8"
                >
                  <Trash2 />
                </Button>
              }
            >
              <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[minmax(52px,64px)_minmax(76px,0.6fr)_minmax(120px,0.8fr)_minmax(72px,88px)_minmax(96px,120px)_minmax(180px,1.4fr)] md:items-end">
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
                <div className="mt-2 grid grid-cols-1 gap-2 border-t pt-2 md:grid-cols-[160px_100px_100px] md:items-end">
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

              <div className="mt-2 grid grid-cols-1 gap-2 border-t pt-2 md:grid-cols-[auto_140px_90px_90px] md:items-end">
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
                    <div
                      key={piece.id ?? `${piece.expression}-${pieceIndex}`}
                      className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(140px,1fr)_86px_86px_auto_auto_40px] md:items-end"
                    >
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

      {features.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {features.map((feature, featureIndex) => {
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
                <div
                  className={cn(
                    "grid min-w-0 grid-cols-1 gap-2 md:items-end",
                    isFreeLabel
                      ? "md:grid-cols-[minmax(140px,1fr)_minmax(58px,70px)_minmax(160px,1fr)]"
                      : "md:grid-cols-[minmax(140px,1fr)_minmax(58px,70px)_minmax(72px,88px)_minmax(96px,120px)_minmax(100px,1fr)_minmax(130px,150px)]",
                  )}
                >
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
                  <div className="mt-2 grid grid-cols-1 gap-2 border-t pt-2 md:grid-cols-2">
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

                {feature.kind === "region_between_curves" || feature.kind === "intersection" ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 border-t pt-2 md:grid-cols-5">
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
                  <div className="mt-2 grid grid-cols-1 gap-2 border-t pt-2 md:grid-cols-5">
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
  const [frontMatter, setFrontMatter] = useState<FrontMatterConfig>(() => initialEditorDraft?.frontMatter ?? DEFAULT_FRONT_MATTER);
  const [logos, setLogos] = useState<LogoAsset[]>(loadLogoLibrary);
  const [savedTests, setSavedTests] = useState<SavedTest[]>(loadSavedTests);
  const [selectedSavedTestId, setSelectedSavedTestId] = useState("");
  const [questions, setQuestions] = useState<QuestionBlock[]>(() => initialEditorDraft?.questions ?? [createQuestion()]);
  const [diskStorageStatus, setDiskStorageStatus] = useState<DiskStorageStatus>("loading");
  const [diskStorageMessage, setDiskStorageMessage] = useState("Loading disk saves");
  const [diskStorageHydrated, setDiskStorageHydrated] = useState(false);
  const [collapsedQuestionIds, setCollapsedQuestionIds] = useState<Set<string>>(() => new Set());
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [dragOverQuestion, setDragOverQuestion] = useState<QuestionDropPreview | null>(null);
  const [draggedSubsection, setDraggedSubsection] = useState<SubsectionDragTarget | null>(null);
  const [dragOverSubsection, setDragOverSubsection] = useState<SubsectionDropPreview | null>(null);
  const [paneMode, setPaneMode] = useState<PaneMode>("split");
  const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [previewViewport, setPreviewViewport] = useState({ width: 0, height: 0 });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [printRequested, setPrintRequested] = useState(false);
  const editorPaneRef = useRef<HTMLElement>(null);
  const previewPaneRef = useRef<HTMLElement>(null);
  const mauthdownImportInputRef = useRef<HTMLInputElement>(null);
  const frontMatterRef = useRef(frontMatter);
  const questionsRef = useRef(questions);
  const logosRef = useRef(logos);
  const savedTestsRef = useRef(savedTests);
  const undoStackRef = useRef<EditorHistorySnapshot[]>([]);
  const redoStackRef = useRef<EditorHistorySnapshot[]>([]);
  const autosaveSequenceRef = useRef(0);
  const scrollSyncSourceRef = useRef<"editor" | "preview" | null>(null);
  const scrollSyncReleaseRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDiskStorage() {
      try {
        const [testsResponse, autosaveResponse] = await Promise.all([listStoredTests<unknown>(), getStorageAutosave<unknown>()]);
        if (cancelled) return;

        const diskSavedTests = normalizeSavedTests(testsResponse.tests);
        const mergedSavedTests = mergeSavedTests(diskSavedTests, savedTests);
        setSavedTests(mergedSavedTests);
        persistSavedTests(mergedSavedTests);

        const browserAutosave = loadCurrentDraft() as AutosavedEditorSnapshot | null;
        const diskAutosave = normalizeEditorSnapshot(autosaveResponse.autosave);
        const autosave = newerAutosave(browserAutosave, diskAutosave);
        if (autosave) {
          restoreEditorSnapshot(autosave);
          const selectedId =
            autosave.selectedSavedTestId && mergedSavedTests.some((test) => test.id === autosave.selectedSavedTestId)
              ? autosave.selectedSavedTestId
              : "";
          setSelectedSavedTestId(selectedId);
        }

        setDiskStorageStatus("ready");
        setDiskStorageMessage("Saving to disk");
      } catch {
        setDiskStorageStatus("unavailable");
        setDiskStorageMessage("API unavailable: using browser backup only");
      } finally {
        if (!cancelled) setDiskStorageHydrated(true);
      }
    }

    hydrateDiskStorage();
    return () => {
      cancelled = true;
    };
    // The initial disk hydrate intentionally merges with the browser tests captured at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!diskStorageHydrated) return;
    if (!shouldSeedScreenshotStarter(questions)) return;

    const nextFrontMatter = createScreenshotStarterFrontMatter();
    const nextQuestions = createScreenshotStarterQuestions();
    setFrontMatter(nextFrontMatter);
    setQuestions(nextQuestions);
    frontMatterRef.current = nextFrontMatter;
    questionsRef.current = nextQuestions;
    setCollapsedQuestionIds(new Set());
    setSelectedSavedTestId("");
    window.localStorage.setItem(STARTER_DOCUMENT_STORAGE_KEY, SCREENSHOT_STARTER_DOCUMENT_ID);
  }, [diskStorageHydrated, questions]);

  useLayoutEffect(() => {
    if (!diskStorageHydrated) return;
    persistCurrentDraft({ frontMatter, questions, selectedSavedTestId });
  }, [frontMatter, questions, selectedSavedTestId, diskStorageHydrated]);

  useEffect(() => {
    if (!diskStorageHydrated || diskStorageStatus === "unavailable") return;

    const selectedSavedTest = savedTestsRef.current.find((test) => test.id === selectedSavedTestId);
    const autosaveSequence = autosaveSequenceRef.current + 1;
    autosaveSequenceRef.current = autosaveSequence;
    setDiskStorageStatus("saving");
    setDiskStorageMessage(selectedSavedTest ? `Autosaving "${selectedSavedTest.name}"` : "Autosaving draft to disk");
    const timeoutId = window.setTimeout(() => {
      const saveSelectedTest = selectedSavedTest
        ? saveStoredTest<unknown>(
            createSavedTestSnapshot({
              testId: selectedSavedTest.id,
              name: selectedSavedTest.name,
              frontMatter,
              questions,
              logo: selectedLogoFromLibrary(logosRef.current, frontMatter.logoId),
              createdAt: selectedSavedTest.createdAt,
            }),
          )
        : Promise.resolve(null);

      Promise.all([saveStorageAutosave<AutosavedEditorSnapshot>({ frontMatter, questions, selectedSavedTestId }), saveSelectedTest])
        .then(([autosaveResponse, savedTestResponse]) => {
          if (autosaveSequenceRef.current !== autosaveSequence) return;
          if (savedTestResponse) {
            const diskSavedTest = normalizeSavedTest(savedTestResponse);
            if (diskSavedTest) {
              setSavedTests((current) => {
                const next = upsertSavedTestList(current, diskSavedTest);
                persistSavedTests(next);
                return next;
              });
            }
          }
          setDiskStorageStatus("saved");
          const updatedAt = autosaveResponse.autosave.updatedAt
            ? new Date(autosaveResponse.autosave.updatedAt).toLocaleTimeString()
            : "now";
          setDiskStorageMessage(
            selectedSavedTest ? `Autosaved "${selectedSavedTest.name}" at ${updatedAt}` : `Autosaved draft at ${updatedAt}`,
          );
        })
        .catch(() => {
          if (autosaveSequenceRef.current !== autosaveSequence) return;
          setDiskStorageStatus("unavailable");
          setDiskStorageMessage("Disk autosave failed: using browser backup only");
        });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
    // diskStorageStatus is used as a guard; including it would reschedule autosave status updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontMatter, questions, selectedSavedTestId, diskStorageHydrated]);

  const totalMarks = questions.reduce((sum, question) => sum + questionMarks(question), 0);
  const canUndo = historyVersion >= 0 && undoStackRef.current.length > 0;
  const canRedo = historyVersion >= 0 && redoStackRef.current.length > 0;
  const showEditor = paneMode !== "preview";
  const showPreview = paneMode !== "editor";
  const darkMode = theme === "dark";
  const previewScale = useMemo(() => {
    if (!previewViewport.width) return 1;
    const widthScale = (previewViewport.width - PREVIEW_FIT_PADDING_PX) / DEFAULT_PAGE_FORMAT.widthPx;
    return clamp(Math.min(widthScale, 1), MIN_PREVIEW_SCALE, 1);
  }, [previewViewport]);
  const workspaceStyle = useMemo(
    () => ({
      gridTemplateColumns: paneMode === "split" ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
    }),
    [paneMode],
  );

  useLayoutEffect(() => {
    frontMatterRef.current = frontMatter;
    questionsRef.current = questions;
    logosRef.current = logos;
    savedTestsRef.current = savedTests;
  }, [frontMatter, questions, logos, savedTests]);

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
      const rect = previewPane.getBoundingClientRect();
      setPreviewViewport({ width: rect.width, height: rect.height });
    };

    updatePreviewViewport();
    const observer = new ResizeObserver(updatePreviewViewport);
    observer.observe(previewPane);
    return () => observer.disconnect();
  }, [showPreview]);

  useLayoutEffect(() => {
    if (!printRequested || !showPreview) return;

    const timeoutId = window.setTimeout(() => {
      window.print();
      setPrintRequested(false);
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [printRequested, showPreview, frontMatter, questions, logos]);

  useEffect(() => {
    const editorPane = editorPaneRef.current;
    const previewPane = previewPaneRef.current;
    if (!scrollSyncEnabled || !showEditor || !showPreview || !editorPane || !previewPane) return;

    const releaseProgrammaticScroll = () => {
      if (scrollSyncReleaseRef.current !== null) {
        window.clearTimeout(scrollSyncReleaseRef.current);
      }
      scrollSyncReleaseRef.current = window.setTimeout(() => {
        scrollSyncSourceRef.current = null;
        scrollSyncReleaseRef.current = null;
      }, SCROLL_SYNC_RELEASE_MS);
    };

    const syncScroll = (source: HTMLElement, target: HTMLElement, sourceName: "editor" | "preview") => {
      if (scrollSyncSourceRef.current && scrollSyncSourceRef.current !== sourceName) return;
      scrollSyncSourceRef.current = sourceName;
      const anchorPosition = paneAnchorPosition(source);
      if (!anchorPosition || !scrollToAnchorPosition(target, anchorPosition)) {
        setScrollableRatio(target, scrollableRatio(source));
      }
      releaseProgrammaticScroll();
    };

    const syncFromEditor = () => syncScroll(editorPane, previewPane, "editor");
    const syncFromPreview = () => syncScroll(previewPane, editorPane, "preview");

    editorPane.addEventListener("scroll", syncFromEditor, { passive: true });
    previewPane.addEventListener("scroll", syncFromPreview, { passive: true });
    syncFromEditor();

    return () => {
      editorPane.removeEventListener("scroll", syncFromEditor);
      previewPane.removeEventListener("scroll", syncFromPreview);
      if (scrollSyncReleaseRef.current !== null) {
        window.clearTimeout(scrollSyncReleaseRef.current);
        scrollSyncReleaseRef.current = null;
      }
      scrollSyncSourceRef.current = null;
    };
  }, [scrollSyncEnabled, showEditor, showPreview, previewScale]);

  useLayoutEffect(() => {
    const editorPane = editorPaneRef.current;
    const previewPane = previewPaneRef.current;
    if (!scrollSyncEnabled || !showEditor || !showPreview || !editorPane || !previewPane) return;
    const anchorPosition = paneAnchorPosition(editorPane);
    if (!anchorPosition || !scrollToAnchorPosition(previewPane, anchorPosition)) {
      setScrollableRatio(previewPane, scrollableRatio(editorPane));
    }
  }, [frontMatter, questions, previewScale, scrollSyncEnabled, showEditor, showPreview]);

  function currentEditorSnapshot(): EditorHistorySnapshot {
    return {
      frontMatter: frontMatterRef.current,
      questions: questionsRef.current,
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

  function setFrontMatterWithHistory(updater: FrontMatterConfig | ((current: FrontMatterConfig) => FrontMatterConfig)) {
    pushEditorHistory();
    setFrontMatter((current) => (typeof updater === "function" ? updater(current) : updater));
  }

  function restoreEditorSnapshot(snapshot: EditorHistorySnapshot) {
    setFrontMatter(snapshot.frontMatter);
    setQuestions(snapshot.questions);
    frontMatterRef.current = snapshot.frontMatter;
    questionsRef.current = snapshot.questions;
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
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
    setQuestionsWithHistory((current) =>
      current.map((question) => (question.id === questionId ? withNormalizedQuestionOrder({ ...question, ...patch }) : question)),
    );
  }

  function updateFrontMatter(patch: Partial<FrontMatterConfig>) {
    setFrontMatterWithHistory((current) => ({ ...current, ...patch }));
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
      };
      setLogos((current) => {
        const next = [...current, logo];
        persistLogoLibrary(next);
        return next;
      });
      setFrontMatterWithHistory((current) => ({ ...current, logoId: logo.id }));
    };
    reader.readAsDataURL(file);
  }

  function removeLogo(logoId: string) {
    setLogos((current) => {
      const logo = current.find((candidate) => candidate.id === logoId);
      if (!logo || logo.builtIn) return current;
      const next = current.filter((candidate) => candidate.id !== logoId);
      persistLogoLibrary(next);
      return next;
    });
    setFrontMatterWithHistory((current) => (current.logoId === logoId ? { ...current, logoId: BUILT_IN_LOGOS[0].id } : current));
  }

  function startNewTest() {
    const shouldStart = window.confirm("Start a new test? This will replace the current editor contents.");
    if (!shouldStart) return;

    pushEditorHistory();
    const nextQuestion = createQuestion();
    const nextFrontMatter = cloneSerializable(DEFAULT_FRONT_MATTER);
    const nextQuestions = [nextQuestion];

    setFrontMatter(nextFrontMatter);
    setQuestions(nextQuestions);
    frontMatterRef.current = nextFrontMatter;
    questionsRef.current = nextQuestions;
    setCollapsedQuestionIds(new Set());
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setSelectedSavedTestId("");
  }

  function commitSavedTestLocally(savedTest: SavedTest) {
    setSavedTests((current) => {
      const next = upsertSavedTestList(current, savedTest);
      persistSavedTests(next);
      return next;
    });
    setSelectedSavedTestId(savedTest.id);
  }

  function writeSavedTestToDisk(savedTest: SavedTest) {
    setDiskStorageStatus("saving");
    setDiskStorageMessage(`Saving "${savedTest.name}" to disk`);
    saveStoredTest<unknown>(savedTest)
      .then((response) => {
        const diskSavedTest = normalizeSavedTest(response) ?? savedTest;
        setSavedTests((current) => {
          const next = upsertSavedTestList(current, diskSavedTest);
          persistSavedTests(next);
          return next;
        });
        setSelectedSavedTestId(diskSavedTest.id);
        setDiskStorageStatus("saved");
        setDiskStorageMessage(`Saved "${diskSavedTest.name}" to disk`);
      })
      .catch(() => {
        setDiskStorageStatus("unavailable");
        setDiskStorageMessage("Disk save failed: browser backup kept");
      });
  }

  function saveCurrentTest() {
    const existingTest = savedTests.find((test) => test.id === selectedSavedTestId);
    const testId = existingTest?.id ?? id("saved-test");
    const testName = existingTest?.name ?? uniqueSavedTestName(defaultSavedTestName(frontMatter), savedTests);
    const logo = selectedLogoFromLibrary(logos, frontMatter.logoId);
    const savedTest = createSavedTestSnapshot({
      testId,
      name: testName,
      frontMatter,
      questions,
      logo,
      createdAt: existingTest?.createdAt,
    });

    commitSavedTestLocally(savedTest);
    writeSavedTestToDisk(savedTest);
  }

  function saveCurrentTestAs() {
    const selectedTest = savedTests.find((test) => test.id === selectedSavedTestId);
    const testId = id("saved-test");
    const baseName = selectedTest?.name ?? defaultSavedTestName(frontMatter);
    const logo = selectedLogoFromLibrary(logos, frontMatter.logoId);
    const savedTest = createSavedTestSnapshot({
      testId,
      name: uniqueSavedTestName(`${baseName} copy`, savedTests),
      frontMatter,
      questions,
      logo,
    });

    commitSavedTestLocally(savedTest);
    writeSavedTestToDisk(savedTest);
  }

  async function selectSavedTest(testId: string) {
    if (!testId) {
      setSelectedSavedTestId("");
      return;
    }

    let savedTest = savedTests.find((test) => test.id === testId) ?? null;
    if (!savedTest) return;

    const shouldLoad = window.confirm(`Load saved test "${savedTest.name}"? This will replace the current editor contents.`);
    if (!shouldLoad) return;

    try {
      const storedTest = normalizeSavedTest(await getStoredTest<unknown>(testId));
      if (storedTest) {
        savedTest = storedTest;
        commitSavedTestLocally(storedTest);
      }
    } catch {
      setDiskStorageStatus("unavailable");
      setDiskStorageMessage("Could not load disk copy: using browser backup");
    }

    pushEditorHistory();
    const nextFrontMatter = cloneSerializable(savedTest.frontMatter);
    const nextQuestions = normalizeQuestionBlocks(savedTest.questions);
    setFrontMatter(nextFrontMatter);
    setQuestions(nextQuestions);
    frontMatterRef.current = nextFrontMatter;
    questionsRef.current = nextQuestions;
    setCollapsedQuestionIds(new Set());
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setSelectedSavedTestId(savedTest.id);

    if (savedTest.logo) {
      setLogos((current) => {
        const existingIndex = current.findIndex((logo) => logo.id === savedTest.logo?.id);
        if (existingIndex === -1) return [...current, savedTest.logo as LogoAsset];
        if (current[existingIndex]?.builtIn) return current;
        return current.map((logo) => (logo.id === savedTest.logo?.id ? (savedTest.logo as LogoAsset) : logo));
      });
    }
  }

  function renameSavedTest(testId: string) {
    const savedTest = savedTests.find((test) => test.id === testId);
    if (!savedTest) return;

    const requestedName = window.prompt("Rename saved test", savedTest.name);
    if (requestedName === null) return;
    const nextName = uniqueSavedTestName(requestedName, savedTests, savedTest.id);
    if (!nextName) return;

    const renamedSavedTest = { ...savedTest, name: nextName, updatedAt: new Date().toISOString() };
    setSavedTests((current) => {
      const next = current.map((test) => (test.id === savedTest.id ? renamedSavedTest : test));
      persistSavedTests(next);
      return next;
    });
    writeSavedTestToDisk(renamedSavedTest);
  }

  function deleteSavedTest(testId: string) {
    const savedTest = savedTests.find((test) => test.id === testId);
    if (!savedTest) return;

    const shouldDelete = window.confirm(`Delete saved test "${savedTest.name}"?`);
    if (!shouldDelete) return;

    setSavedTests((current) => {
      const next = current.filter((test) => test.id !== savedTest.id);
      persistSavedTests(next);
      return next;
    });
    setSelectedSavedTestId((current) => (current === savedTest.id ? "" : current));
    setDiskStorageStatus("saving");
    setDiskStorageMessage(`Deleting "${savedTest.name}" from disk`);
    deleteStoredTest(savedTest.id)
      .then(() => {
        setDiskStorageStatus("saved");
        setDiskStorageMessage(`Deleted "${savedTest.name}" from disk; backup kept`);
      })
      .catch(() => {
        setDiskStorageStatus("unavailable");
        setDiskStorageMessage("Disk delete failed: browser list removed only");
      });
  }

  function updateContentBlock(questionId: string, blockId: string, patch: Partial<EditorContentBlock>) {
    setQuestionsWithHistory((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              contentBlocks: question.contentBlocks.map((block) =>
                block.id === blockId ? ({ ...block, ...patch } as EditorContentBlock) : block,
              ),
            }
          : question,
      ),
    );
  }

  function updatePart(questionId: string, partId: string, patch: Partial<EditorPart>) {
    setQuestionsWithHistory((current) =>
      current.map((question) =>
        question.id === questionId
          ? withNormalizedQuestionOrder({
              ...question,
              parts: question.parts.map((part) => (part.id === partId ? withNormalizedPartOrder({ ...part, ...patch }) : part)),
            })
          : question,
      ),
    );
  }

  function updatePartContentBlock(questionId: string, partId: string, blockId: string, patch: Partial<EditorContentBlock>) {
    setQuestionsWithHistory((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              parts: question.parts.map((part) =>
                part.id === partId
                  ? {
                      ...part,
                      contentBlocks: part.contentBlocks.map((block) =>
                        block.id === blockId ? ({ ...block, ...patch } as EditorContentBlock) : block,
                      ),
                    }
                  : part,
              ),
            }
          : question,
      ),
    );
  }

  function updateSubpart(questionId: string, partId: string, subpartId: string, patch: Partial<EditorSubpart>) {
    setQuestionsWithHistory((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              parts: question.parts.map((part) =>
                part.id === partId
                  ? {
                      ...part,
                      subparts: (part.subparts ?? []).map((subpart) => (subpart.id === subpartId ? { ...subpart, ...patch } : subpart)),
                    }
                  : part,
              ),
            }
          : question,
      ),
    );
  }

  function updateSubpartContentBlock(
    questionId: string,
    partId: string,
    subpartId: string,
    blockId: string,
    patch: Partial<EditorContentBlock>,
  ) {
    setQuestionsWithHistory((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              parts: question.parts.map((part) =>
                part.id === partId
                  ? {
                      ...part,
                      subparts: (part.subparts ?? []).map((subpart) =>
                        subpart.id === subpartId
                          ? {
                              ...subpart,
                              contentBlocks: subpart.contentBlocks.map((block) =>
                                block.id === blockId ? ({ ...block, ...patch } as EditorContentBlock) : block,
                              ),
                            }
                          : subpart,
                      ),
                    }
                  : part,
              ),
            }
          : question,
      ),
    );
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

  function toggleQuestionCollapsed(questionId: string) {
    setCollapsedQuestionIds((current) => {
      const next = new Set(current);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  function showSplitPane() {
    setPaneMode("split");
  }

  function toggleScrollSync() {
    setScrollSyncEnabled((current) => !current);
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function hideEditorPane() {
    setPaneMode("preview");
  }

  function hidePreviewPane() {
    setPaneMode("editor");
  }

  function exportPdf() {
    setPaneMode("preview");
    setPrintRequested(true);
  }

  function exportMauthdownFile() {
    const logo = selectedLogoFromLibrary(logos, frontMatter.logoId);
    const mauthdownDocument = createMauthdownDocument({ frontMatter, questions, logo });
    const fileName = `${slugifyFileName(mauthdownDocument.testName)}.mauth.md`;
    downloadTextFile(fileName, buildMauthdownFile(mauthdownDocument));
  }

  async function importMauthdownFile(file: File) {
    let source = "";
    try {
      source = await file.text();
    } catch {
      window.alert("The selected file could not be read.");
      return;
    }

    const mauthdownDocument = parseMauthdownDocument(source);
    if (!mauthdownDocument) {
      window.alert("That file is not a valid Mauthdown export.");
      return;
    }

    if (mauthdownDocument.version > MAUTHDOWN_VERSION) {
      window.alert("This Mauthdown file was created by a newer version of the authoring tool.");
      return;
    }

    const shouldImport = window.confirm(`Import "${mauthdownDocument.testName}"? This will replace the current editor contents.`);
    if (!shouldImport) return;

    pushEditorHistory();
    const nextFrontMatter = cloneSerializable(mauthdownDocument.frontMatter);
    const nextQuestions = normalizeQuestionBlocks(mauthdownDocument.questions);
    const importedLogo = mauthdownDocument.logo;

    if (importedLogo) {
      setLogos((current) => {
        const existingIndex = current.findIndex((logo) => logo.id === importedLogo.id);
        const next =
          existingIndex === -1
            ? [...current, importedLogo]
            : current.map((logo) => (logo.id === importedLogo.id && !logo.builtIn ? importedLogo : logo));
        persistLogoLibrary(next);
        return next;
      });
      nextFrontMatter.logoId = importedLogo.id;
    }

    setFrontMatter(nextFrontMatter);
    setQuestions(nextQuestions);
    frontMatterRef.current = nextFrontMatter;
    questionsRef.current = nextQuestions;
    setCollapsedQuestionIds(new Set());
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setSelectedSavedTestId("");
  }

  function handleMauthdownImportFile(file?: File) {
    if (!file) return;
    void importMauthdownFile(file);
  }

  function reorderQuestion(draggedId: string, targetId: string, placement: Exclude<DropPlacement, "inside">) {
    if (draggedId === targetId) return;
    setQuestionsWithHistory((current) => {
      const fromIndex = current.findIndex((question) => question.id === draggedId);
      if (fromIndex === -1) return current;
      const movedQuestion = current[fromIndex];
      const withoutDragged = current.filter((question) => question.id !== draggedId);
      const targetIndex = withoutDragged.findIndex((question) => question.id === targetId);
      if (targetIndex === -1) return current;
      const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
      return [...withoutDragged.slice(0, insertIndex), movedQuestion, ...withoutDragged.slice(insertIndex)];
    });
  }

  function setModuleDragImage(event: DragEvent<HTMLElement>) {
    const preview = event.currentTarget.closest("[data-drag-preview]");
    if (preview instanceof HTMLElement) {
      const rect = preview.getBoundingClientRect();
      event.dataTransfer.setDragImage(preview, Math.min(48, rect.width / 2), 28);
    }
  }

  function handleQuestionDragStart(event: DragEvent<HTMLElement>, questionId: string) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", questionId);
    setModuleDragImage(event);
    setDraggedQuestionId(questionId);
  }

  function handleQuestionDragOver(event: DragEvent<HTMLElement>, questionId: string) {
    const activeSubsection = readSubsectionDrag(event);
    if (activeSubsection) return;

    const activeQuestionId = draggedQuestionId || event.dataTransfer.getData("text/plain");
    if (!activeQuestionId || activeQuestionId === questionId) return;
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

    event.preventDefault();
    const activeQuestionId = draggedQuestionId || event.dataTransfer.getData("text/plain");
    const placement = dragOverQuestion?.questionId === questionId ? dragOverQuestion.placement : dragPlacementFromEvent(event);
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
    if (activeQuestionId) reorderQuestion(activeQuestionId, questionId, placement);
  }

  function handleQuestionDragEnd() {
    setDraggedQuestionId(null);
    setDragOverQuestion(null);
  }

  function insertOrderItem(items: ContainerOrderItem[], item: ContainerOrderItem, beforeItem?: ContainerOrderItem) {
    if (!beforeItem) return [...items, item];
    return insertBeforeByKey(items, orderItemKey(beforeItem), item, orderItemKey);
  }

  function removeOrderItem(items: ContainerOrderItem[], item: ContainerOrderItem) {
    const key = orderItemKey(item);
    return items.filter((current) => orderItemKey(current) !== key);
  }

  function moveSubsection(active: SubsectionDragTarget, intent: SubsectionDropIntent) {
    const activeKind = subsectionItemKind(active);
    const sourceContainer = subsectionSourceContainer(active);
    const activeOrderItem = subsectionOrderItem(active);
    if (!activeOrderItem) return;

    setQuestionsWithHistory((current) => {
      let movedBlock: EditorContentBlock | null = null;
      let movedPart: EditorPart | null = null;
      let movedSubpart: EditorSubpart | null = null;

      const withoutActive = current.map((question) => {
        if (sourceContainer.kind === "question" && question.id === sourceContainer.questionId) {
          if (activeKind === "block") {
            movedBlock = question.contentBlocks.find((block) => block.id === active.id) ?? null;
            if (!movedBlock) return question;
            return withNormalizedQuestionOrder({
              ...question,
              contentBlocks: question.contentBlocks.filter((block) => block.id !== active.id),
              itemOrder: removeOrderItem(question.itemOrder, activeOrderItem),
            });
          }
          if (activeKind === "part") {
            movedPart = question.parts.find((part) => part.id === active.id) ?? null;
            if (!movedPart) return question;
            return withNormalizedQuestionOrder({
              ...question,
              parts: question.parts.filter((part) => part.id !== active.id),
              itemOrder: removeOrderItem(question.itemOrder, activeOrderItem),
            });
          }
        }

        if (sourceContainer.kind === "part" && question.id === sourceContainer.questionId) {
          return withNormalizedQuestionOrder({
            ...question,
            parts: question.parts.map((part) => {
              if (part.id !== sourceContainer.partId) return part;
              if (activeKind === "block") {
                movedBlock = part.contentBlocks.find((block) => block.id === active.id) ?? null;
                if (!movedBlock) return part;
                return withNormalizedPartOrder({
                  ...part,
                  contentBlocks: part.contentBlocks.filter((block) => block.id !== active.id),
                  itemOrder: removeOrderItem(part.itemOrder, activeOrderItem),
                });
              }
              if (activeKind === "subpart") {
                movedSubpart = (part.subparts ?? []).find((subpart) => subpart.id === active.id) ?? null;
                if (!movedSubpart) return part;
                return withNormalizedPartOrder({
                  ...part,
                  subparts: (part.subparts ?? []).filter((subpart) => subpart.id !== active.id),
                  itemOrder: removeOrderItem(part.itemOrder, activeOrderItem),
                });
              }
              return part;
            }),
          });
        }

        if (sourceContainer.kind === "subpart" && question.id === sourceContainer.questionId && activeKind === "block") {
          return withNormalizedQuestionOrder({
            ...question,
            parts: question.parts.map((part) => {
              if (part.id !== sourceContainer.partId) return part;
              return withNormalizedPartOrder({
                ...part,
                subparts: (part.subparts ?? []).map((subpart) => {
                  if (subpart.id !== sourceContainer.subpartId) return subpart;
                  movedBlock = subpart.contentBlocks.find((block) => block.id === active.id) ?? null;
                  if (!movedBlock) return subpart;
                  return {
                    ...subpart,
                    contentBlocks: subpart.contentBlocks.filter((block) => block.id !== active.id),
                  };
                }),
              });
            }),
          });
        }

        return question;
      });

      if ((activeKind === "block" && !movedBlock) || (activeKind === "part" && !movedPart) || (activeKind === "subpart" && !movedSubpart)) {
        return current;
      }

      const inserted = withoutActive.map((question) => {
        if (intent.container.kind === "question" && question.id === intent.container.questionId) {
          if (activeKind === "block" && movedBlock) {
            return withNormalizedQuestionOrder({
              ...question,
              contentBlocks: [...question.contentBlocks, movedBlock],
              itemOrder: insertOrderItem(question.itemOrder, { kind: "block", id: movedBlock.id }, intent.beforeItem),
            });
          }
          if (activeKind === "part" && movedPart) {
            return withNormalizedQuestionOrder({
              ...question,
              parts: [...question.parts, movedPart],
              itemOrder: insertOrderItem(question.itemOrder, { kind: "part", id: movedPart.id }, intent.beforeItem),
            });
          }
        }

        if (intent.container.kind === "part" && question.id === intent.container.questionId) {
          return withNormalizedQuestionOrder({
            ...question,
            parts: question.parts.map((part) => {
              if (part.id !== intent.container.partId) return part;
              if (activeKind === "block" && movedBlock) {
                return withNormalizedPartOrder({
                  ...part,
                  contentBlocks: [...part.contentBlocks, movedBlock],
                  itemOrder: insertOrderItem(part.itemOrder, { kind: "block", id: movedBlock.id }, intent.beforeItem),
                });
              }
              if (activeKind === "subpart" && movedSubpart) {
                return withNormalizedPartOrder({
                  ...part,
                  subparts: [...(part.subparts ?? []), movedSubpart],
                  itemOrder: insertOrderItem(part.itemOrder, { kind: "subpart", id: movedSubpart.id }, intent.beforeItem),
                });
              }
              return part;
            }),
          });
        }

        if (intent.container.kind === "subpart" && question.id === intent.container.questionId && activeKind === "block" && movedBlock) {
          return withNormalizedQuestionOrder({
            ...question,
            parts: question.parts.map((part) => {
              if (part.id !== intent.container.partId) return part;
              return withNormalizedPartOrder({
                ...part,
                subparts: (part.subparts ?? []).map((subpart) => {
                  if (subpart.id !== intent.container.subpartId) return subpart;
                  return {
                    ...subpart,
                    contentBlocks: intent.beforeBlockId
                      ? insertBeforeByKey(
                          subpart.contentBlocks,
                          intent.beforeBlockId,
                          movedBlock as EditorContentBlock,
                          (block) => block.id,
                        )
                      : [...subpart.contentBlocks, movedBlock as EditorContentBlock],
                  };
                }),
              });
            }),
          });
        }

        return question;
      });

      return inserted.map(withNormalizedQuestionOrder);
    });
  }

  function readSubsectionDrag(event: DragEvent<HTMLElement>) {
    return draggedSubsection ?? parseSubsectionDrag(event.dataTransfer.getData("application/x-math-subsection"));
  }

  function handleSubsectionDragStart(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-math-subsection", JSON.stringify(target));
    setModuleDragImage(event);
    setDraggedSubsection(target);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
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
    moveSubsection(active, intent);
  }

  function handleSubsectionDragEnd() {
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDragOverQuestion(null);
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
    setQuestionsWithHistory((current) => [...current, question]);
  }

  function insertQuestionAtStart() {
    const question = createQuestion();
    setQuestionsWithHistory((current) => insertAtStart(current, question));
  }

  function insertQuestionAfter(afterQuestionId: string) {
    const question = createQuestion();
    setQuestionsWithHistory((current) => insertAfter(current, afterQuestionId, question));
  }

  function addPageBreakAfterLastQuestion() {
    const question = questions.at(-1);
    if (!question || question.pageBreakAfter) return;
    updateQuestion(question.id, {
      pageBreakAfter: true,
      contentBlocks: question.contentBlocks.filter((block) => block.kind !== "pageBreak"),
    });
  }

  function addPageBreakAfterQuestion(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question || question.pageBreakAfter) return;
    updateQuestion(question.id, {
      pageBreakAfter: true,
      contentBlocks: question.contentBlocks.filter((block) => block.kind !== "pageBreak"),
    });
  }

  function removePageBreakAfterQuestion(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    updateQuestion(question.id, {
      pageBreakAfter: false,
      contentBlocks: question.contentBlocks.filter((block) => block.kind !== "pageBreak"),
    });
  }

  function removeQuestion(questionId: string) {
    const remainingQuestions = questions.filter((question) => question.id !== questionId);
    const nextQuestions = remainingQuestions.length ? remainingQuestions : [createQuestion()];
    setQuestionsWithHistory(nextQuestions);
    setCollapsedQuestionIds((current) => {
      const next = new Set(current);
      next.delete(questionId);
      return next;
    });
  }

  function addQuestionBlock(questionId: string, kind: ContentBlockKind) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const block = contentBlockForKind(kind);
    updateQuestion(question.id, {
      contentBlocks: [...question.contentBlocks, block],
      itemOrder: [...question.itemOrder, { kind: "block", id: block.id }],
    });
  }

  function removeQuestionBlock(questionId: string, blockId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    updateQuestion(question.id, {
      contentBlocks: question.contentBlocks.filter((block) => block.id !== blockId),
      itemOrder: question.itemOrder.filter((item) => orderItemKey(item) !== `block:${blockId}`),
    });
  }

  function createPart(): EditorPart {
    return {
      id: id("part"),
      label: "",
      text: "",
      marks: 0,
      contentBlocks: [],
      subparts: [],
      itemOrder: [],
    };
  }

  function addPart(questionId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const part = createPart();
    updateQuestion(question.id, {
      parts: relabelParts([...question.parts, part]),
      itemOrder: [...question.itemOrder, { kind: "part", id: part.id }],
    });
  }

  function removePart(questionId: string, partId: string) {
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    updateQuestion(question.id, {
      parts: relabelParts(question.parts.filter((part) => part.id !== partId)),
      itemOrder: question.itemOrder.filter((item) => orderItemKey(item) !== `part:${partId}`),
    });
  }

  function createSubpart(subpartIndex: number): EditorSubpart {
    return {
      id: id("subpart"),
      label: romanLabel(subpartIndex),
      text: "",
      marks: 0,
      contentBlocks: [],
    };
  }

  function addSubpart(questionId: string, part: EditorPart) {
    const subparts = part.subparts ?? [];
    const subpart = createSubpart(subparts.length);
    updatePart(questionId, part.id, {
      subparts: relabelSubparts([...subparts, subpart]),
      itemOrder: [...part.itemOrder, { kind: "subpart", id: subpart.id }],
    });
  }

  function removeSubpart(questionId: string, part: EditorPart, subpartId: string) {
    updatePart(questionId, part.id, {
      subparts: relabelSubparts((part.subparts ?? []).filter((subpart) => subpart.id !== subpartId)),
      itemOrder: part.itemOrder.filter((item) => orderItemKey(item) !== `subpart:${subpartId}`),
    });
  }

  function addPartBlock(questionId: string, part: EditorPart, kind: ContentBlockKind) {
    const block = contentBlockForKind(kind);
    updatePart(questionId, part.id, {
      contentBlocks: [...part.contentBlocks, block],
      itemOrder: [...part.itemOrder, { kind: "block", id: block.id }],
    });
  }

  function removePartBlock(questionId: string, part: EditorPart, blockId: string) {
    updatePart(questionId, part.id, {
      contentBlocks: part.contentBlocks.filter((block) => block.id !== blockId),
      itemOrder: part.itemOrder.filter((item) => orderItemKey(item) !== `block:${blockId}`),
    });
  }

  function addSubpartBlock(questionId: string, part: EditorPart, subpart: EditorSubpart, kind: ContentBlockKind) {
    updateSubpart(questionId, part.id, subpart.id, {
      contentBlocks: [...subpart.contentBlocks, contentBlockForKind(kind)],
    });
  }

  function removeSubpartBlock(questionId: string, part: EditorPart, subpart: EditorSubpart, blockId: string) {
    updateSubpart(questionId, part.id, subpart.id, {
      contentBlocks: subpart.contentBlocks.filter((block) => block.id !== blockId),
    });
  }

  function renderQuestionContentBlock(question: QuestionBlock, block: EditorContentBlock, _itemIndex: number, _itemCount: number) {
    const blockIndex = Math.max(
      0,
      question.contentBlocks.filter((current) => current.kind !== "pageBreak").findIndex((current) => current.id === block.id),
    );
    const blockTarget: SubsectionDragTarget = { kind: "question-block", questionId: question.id, id: block.id };
    const wrapperClassName = cn("rounded-md transition-all", subsectionDragClasses(blockTarget));
    const withInsertAfter = (node: ReactNode) => node;
    const wrapperProps = {
      "data-drag-preview": true,
      "data-scroll-anchor": questionBlockScrollAnchor(question.id, block.id),
      className: wrapperClassName,
      onDragOver: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragOver(event, blockTarget),
      onDragLeave: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragLeave(event, blockTarget),
      onDrop: (event: DragEvent<HTMLDivElement>) => handleSubsectionDrop(event, blockTarget),
    };

    if (block.kind === "space") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <SpaceBlockEditor
            label={`Space block ${blockIndex + 1}`}
            lines={block.lines}
            dragHandle={subsectionDragHandle(blockTarget, `Drag space block ${blockIndex + 1}`)}
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
            dragHandle={subsectionDragHandle(blockTarget, `Drag diagram block ${blockIndex + 1}`)}
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
    const withInsertAfter = (node: ReactNode) => node;
    const wrapperProps = {
      "data-drag-preview": true,
      "data-scroll-anchor": partBlockScrollAnchor(question.id, part.id, block.id),
      className: wrapperClassName,
      onDragOver: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragOver(event, partBlockTarget),
      onDragLeave: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragLeave(event, partBlockTarget),
      onDrop: (event: DragEvent<HTMLDivElement>) => handleSubsectionDrop(event, partBlockTarget),
    };

    if (block.kind === "space") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <SpaceBlockEditor
            label={`Part space ${blockIndex + 1}`}
            lines={block.lines}
            dragHandle={subsectionDragHandle(partBlockTarget, `Drag part space ${blockIndex + 1}`)}
            muted
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
            dragHandle={subsectionDragHandle(partBlockTarget, `Drag part diagram ${blockIndex + 1}`)}
            muted
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
    const subpartBlockTarget: SubsectionDragTarget = {
      kind: "subpart-block",
      questionId: question.id,
      partId: part.id,
      subpartId: subpart.id,
      id: block.id,
    };
    const wrapperClassName = cn("rounded-md transition-all", subsectionDragClasses(subpartBlockTarget));
    const withInsertAfter = (node: ReactNode) => node;
    const wrapperProps = {
      "data-drag-preview": true,
      "data-scroll-anchor": subpartBlockScrollAnchor(question.id, part.id, subpart.id, block.id),
      className: wrapperClassName,
      onDragOver: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragOver(event, subpartBlockTarget),
      onDragLeave: (event: DragEvent<HTMLDivElement>) => handleSubsectionDragLeave(event, subpartBlockTarget),
      onDrop: (event: DragEvent<HTMLDivElement>) => handleSubsectionDrop(event, subpartBlockTarget),
    };

    if (block.kind === "space") {
      return withInsertAfter(
        <div key={block.id} {...wrapperProps}>
          <SpaceBlockEditor
            label={`Subpart space ${blockIndex + 1}`}
            lines={block.lines}
            dragHandle={subsectionDragHandle(subpartBlockTarget, `Drag subpart space ${blockIndex + 1}`)}
            muted
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
            dragHandle={subsectionDragHandle(subpartBlockTarget, `Drag subpart diagram ${blockIndex + 1}`)}
            muted
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

    return (
      <div
        key={subpart.id}
        data-drag-preview
        data-scroll-anchor={subpartScrollAnchor(question.id, part.id, subpart.id)}
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
            onAddDiagram={() => addSubpartBlock(question.id, part, subpart, "diagram")}
            onAddSpace={() => addSubpartBlock(question.id, part, subpart, "space")}
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
    const partInsertAction = {
      label: "Subpart",
      tooltip: "Add a roman-numbered item, such as (i), inside this part",
      icon: <GitBranch className="size-4" aria-hidden="true" />,
      onClick: () => addSubpart(question.id, part),
    };

    return (
      <div key={part.id} data-scroll-anchor={partScrollAnchor(question.id, part.id)}>
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
                {subparts.length ? (
                  <div className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                    Marks
                    <div className="flex h-8 w-24 items-center rounded-md border border-input bg-muted px-2 text-sm font-normal text-muted-foreground">
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
              onAddDiagram={() => addPartBlock(question.id, part, "diagram")}
              onAddSpace={() => addPartBlock(question.id, part, "space")}
              extraActions={[partInsertAction]}
            />
          </CollapsiblePanel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-blue-300/15 bg-[#030817] text-white shadow-[0_14px_32px_rgba(3,8,23,0.22)]">
        <div className="flex min-h-16 items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <img
              src={BRAND_LOGO_SRC}
              alt="Mauth Studio"
              className="h-10 w-auto max-w-[190px] rounded-md border border-white/10 bg-[#020615] object-contain"
            />
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <input
              ref={mauthdownImportInputRef}
              type="file"
              accept=".mauth.md,.md,text/markdown,application/json"
              className="sr-only"
              onChange={(event) => {
                handleMauthdownImportFile(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title="Import Mauthdown file"
              aria-label="Import Mauthdown file"
              onClick={() => mauthdownImportInputRef.current?.click()}
              className={cn("ml-2", HEADER_ACTION_CLASS)}
            >
              <FileUp data-icon="inline-start" />
              Import File
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title="Export Mauthdown file"
              aria-label="Export Mauthdown file"
              onClick={exportMauthdownFile}
              className={HEADER_ACTION_CLASS}
            >
              <FileDown data-icon="inline-start" />
              Export File
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title="Export PDF"
              aria-label="Export PDF"
              onClick={exportPdf}
              className={cn("ml-2", HEADER_ACTION_CLASS)}
            >
              <FileDown data-icon="inline-start" />
              Export PDF
            </Button>
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
                title={scrollSyncEnabled ? "Turn scroll sync off" : "Turn scroll sync on"}
                aria-label={scrollSyncEnabled ? "Turn scroll sync off" : "Turn scroll sync on"}
                aria-pressed={scrollSyncEnabled}
                onClick={toggleScrollSync}
                className={cn(HEADER_ICON_BUTTON_CLASS, scrollSyncEnabled && HEADER_ICON_ACTIVE_CLASS)}
              >
                <Link2 />
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

      <main className="grid h-[calc(100vh-4rem)] min-h-0 bg-background" style={workspaceStyle}>
        {showEditor ? (
          <section ref={editorPaneRef} className="min-h-0 overflow-y-auto border-b bg-muted/35 p-4 lg:border-b-0 lg:border-r">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              <SavedTestManager
                savedTests={savedTests}
                selectedSavedTestId={selectedSavedTestId}
                diskStorageMessage={diskStorageMessage}
                onSelectSavedTest={selectSavedTest}
                onNewTest={startNewTest}
                onSaveTest={saveCurrentTest}
                onSaveTestAs={saveCurrentTestAs}
                onRenameSavedTest={renameSavedTest}
                onDeleteSavedTest={deleteSavedTest}
              />

              <div className="rounded-lg border bg-card p-4 shadow-panel">
                <div className="flex flex-col gap-3">
                  <FrontMatterEditor
                    frontMatter={frontMatter}
                    logos={logos}
                    onChange={updateFrontMatter}
                    onAddLogo={addLogo}
                    onRemoveLogo={removeLogo}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <TestLevelInsertionActions onAddQuestion={insertQuestionAtStart} />
                {questions.map((question, index) => {
                  const hasParts = question.parts.length > 0;
                  const questionItems = orderedQuestionItems(question);
                  const collapsed = collapsedQuestionIds.has(question.id);
                  const dragging = draggedQuestionId === question.id;
                  const questionDropPlacement =
                    dragOverQuestion?.questionId === question.id && draggedQuestionId !== question.id ? dragOverQuestion.placement : null;
                  const questionHasPageBreak =
                    question.pageBreakAfter || question.contentBlocks.some((block) => block.kind === "pageBreak");

                  return (
                    <div key={question.id} className="contents">
                      <article
                        className={cn(
                          "relative rounded-lg border bg-card p-4 shadow-panel transition-colors",
                          collapsed && "py-3",
                          dragging && "scale-[0.995] opacity-70 shadow-2xl",
                          questionDropPlacement === "before" &&
                            "before:absolute before:-top-3 before:left-3 before:right-3 before:z-20 before:h-1 before:rounded-full before:bg-primary before:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] before:content-['']",
                          questionDropPlacement === "after" &&
                            "after:absolute after:-bottom-3 after:left-3 after:right-3 after:z-20 after:h-1 after:rounded-full after:bg-primary after:shadow-[0_0_0_3px_hsl(var(--primary)/0.16)] after:content-['']",
                        )}
                        data-drag-preview
                        data-scroll-anchor={questionScrollAnchor(question.id)}
                        onDragOver={(event) => handleQuestionDragOver(event, question.id)}
                        onDragLeave={(event) => handleQuestionDragLeave(event, question.id)}
                        onDrop={(event) => handleQuestionDrop(event, question.id)}
                      >
                        <div className={cn("flex items-center justify-between gap-3", collapsed ? "flex-nowrap" : "mb-4 flex-wrap")}>
                          <div className={cn("flex min-w-0 items-center gap-2", collapsed ? "flex-nowrap overflow-hidden" : "flex-wrap")}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              draggable
                              title="Drag question"
                              aria-label={`Drag Question ${questionDisplayNumber(frontMatter, index)}`}
                              onClick={(event) => event.stopPropagation()}
                              onDragStart={(event) => handleQuestionDragStart(event, question.id)}
                              onDragEnd={handleQuestionDragEnd}
                              className="size-9 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                            >
                              <GripVertical />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleQuestionCollapsed(question.id);
                              }}
                              title={collapsed ? "Expand question" : "Collapse question"}
                              aria-label={collapsed ? "Expand question" : "Collapse question"}
                              aria-expanded={!collapsed}
                              className="size-9 shrink-0"
                            >
                              {collapsed ? <ChevronRight /> : <ChevronDown />}
                            </Button>
                            <Badge variant="outline" className="h-9 shrink-0 whitespace-nowrap px-3 text-sm">
                              Question {questionDisplayNumber(frontMatter, index)}
                            </Badge>
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
                            {collapsed ? <InlineMathSummary source={firstTextSource(question.contentBlocks)} /> : null}
                          </div>
                          <div className={cn("flex items-center gap-2", collapsed ? "shrink-0 flex-nowrap" : "flex-wrap")}>
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

                        {!collapsed ? (
                          <>
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
                              onAddDiagram={() => addQuestionBlock(question.id, "diagram")}
                              onAddSpace={() => addQuestionBlock(question.id, "space")}
                              extraActions={[
                                {
                                  label: "Part",
                                  tooltip: "Add a lettered question part, such as (a), (b), (c)",
                                  icon: <GitBranch className="size-4" aria-hidden="true" />,
                                  onClick: () => addPart(question.id),
                                },
                              ]}
                            />
                          </>
                        ) : null}
                      </article>
                      {questionHasPageBreak ? (
                        <PageBreakBlockEditor
                          label={`Page break after Question ${index + 1}`}
                          onRemove={() => removePageBreakAfterQuestion(question.id)}
                        />
                      ) : null}
                      {index < questions.length - 1 ? (
                        <TestLevelInsertionActions
                          className="py-1"
                          onAddQuestion={() => insertQuestionAfter(question.id)}
                          onAddPageBreak={questionHasPageBreak ? undefined : () => addPageBreakAfterQuestion(question.id)}
                        />
                      ) : null}
                    </div>
                  );
                })}
                <TestLevelInsertionActions
                  className="pb-6 pt-1"
                  onAddQuestion={addQuestion}
                  onAddPageBreak={
                    !questions.length ||
                    Boolean(questions.at(-1)?.pageBreakAfter || questions.at(-1)?.contentBlocks.some((block) => block.kind === "pageBreak"))
                      ? undefined
                      : addPageBreakAfterLastQuestion
                  }
                />
              </div>
            </div>
          </section>
        ) : null}

        {showPreview ? (
          <section ref={previewPaneRef} className="min-h-0 overflow-auto bg-muted/70 p-4">
            <PaginatedTestPreview
              frontMatter={frontMatter}
              logos={logos}
              totalMarks={totalMarks}
              questions={questions}
              scale={previewScale}
              onGraphConfigChange={updatePreviewGraphConfig}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}
