import type { ContentBlock, DiagramAlignment, FormattingConfig, GraphConfig } from "@mauth-studio/shared";

import { browserStorageItem, type BrowserStorageLike } from "./browserStorage.ts";
import { DEFAULT_STATS_CHART } from "./editorDiagramConfig.ts";
import { DEFAULT_2D_GRAPH } from "./diagramGraph2d.ts";
import { DEFAULT_FORMATTING_CONFIG, formattingConfigForPresetId } from "./editorFormattingConfig.ts";
import {
  defaultDocumentFlow,
  relabelParts,
  type DocumentFlowItem,
  type DocumentSectionHeading,
  type EditorContentBlock,
  type EditorPart,
  type QuestionBlock,
} from "./editorDocumentNormalization.ts";
import {
  DEFAULT_EXAM_FRONT_MATTER,
  DEFAULT_FRONT_MATTER,
  DEFAULT_NOTES_FRONT_MATTER,
  DEFAULT_WORKSHEET_FRONT_MATTER,
  type FrontMatterConfig,
  type TitlePageTemplate,
} from "./frontMatterConfig.ts";
import { selectedLogoFromLibrary, type LogoAsset } from "./logoLibrary.ts";
import { questionScrollAnchor } from "./scrollAnchors.ts";

export const STARTER_DOCUMENT_STORAGE_KEY = "mauth-studio.starter-document.v1";
export const LEGACY_STARTER_DOCUMENT_STORAGE_KEY = "math-app.starter-document.v1";
export const SCREENSHOT_STARTER_DOCUMENT_ID = "calculus-area-screenshot-questions-v4";

export interface ScreenshotStarterRuntime {
  id: (prefix: string) => string;
  textBlock: (text?: string) => ContentBlock;
  choiceListBlock: (choices?: string[]) => ContentBlock;
  spaceBlock: (lines?: number) => Extract<ContentBlock, { kind: "space" }>;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
}

export interface StarterEditorDocument {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  formattingConfig: FormattingConfig;
}

export interface StarterEditorDocumentPlan {
  document: StarterEditorDocument;
  activeQuestionId: string;
  anchor: string;
  cleanFingerprint?: string | null;
}

export interface CreateTemplateEditorDocumentPlanOptions {
  template: TitlePageTemplate;
  formatPresetId?: FormattingConfig["id"];
  id: (prefix: string) => string;
  logos: LogoAsset[];
  currentFrontMatter: FrontMatterConfig;
  editorDocumentFingerprint: (
    frontMatter: FrontMatterConfig,
    questions: QuestionBlock[],
    formattingConfig: FormattingConfig,
    logo?: LogoAsset | null,
    sectionHeadings?: DocumentSectionHeading[],
    documentFlow?: DocumentFlowItem[],
  ) => string;
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createQuestion(id: (prefix: string) => string): QuestionBlock {
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

export function createNotesSection(id: (prefix: string) => string): QuestionBlock {
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

export function createScreenshotStarterFrontMatter(): FrontMatterConfig {
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

function starterDiagramBlock(
  { id, withGraphDefaults }: Pick<ScreenshotStarterRuntime, "id" | "withGraphDefaults">,
  graphConfig: GraphConfig,
  diagramAlign: DiagramAlignment = "center",
): EditorContentBlock {
  return {
    id: id("diagram"),
    kind: "diagram",
    diagramAlign,
    graphConfig: withGraphDefaults(graphConfig),
  };
}

function starterQuestion(
  { id }: Pick<ScreenshotStarterRuntime, "id">,
  contentBlocks: EditorContentBlock[],
  marks: number,
  section = "Calculus",
): QuestionBlock {
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

function starterPart({ id }: Pick<ScreenshotStarterRuntime, "id">, contentBlocks: EditorContentBlock[], marks: number): EditorPart {
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

function starterPartsQuestion(runtime: ScreenshotStarterRuntime, intro: string, parts: EditorPart[], section = "Calculus"): QuestionBlock {
  const introBlock = runtime.textBlock(intro);
  const labelledParts = relabelParts(parts);
  return {
    id: runtime.id("question"),
    section,
    marks: 0,
    contentBlocks: [introBlock],
    parts: labelledParts,
    itemOrder: [{ kind: "block", id: introBlock.id }, ...labelledParts.map((part) => ({ kind: "part" as const, id: part.id }))],
    pageBreakAfter: false,
  };
}

function shadedAreaGraphConfig(id: ScreenshotStarterRuntime["id"]): GraphConfig {
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

export function createScreenshotStarterQuestions(runtime: ScreenshotStarterRuntime): QuestionBlock[] {
  return [
    starterPartsQuestion(runtime, "Answer the following trigonometric calculus questions.", [
      starterPart(
        runtime,
        [
          runtime.textBlock("Find the equation of the tangent to the curve $y=\\cos(3x)$ at the point where $x=\\frac{\\pi}{6}$."),
          runtime.spaceBlock(8),
        ],
        5,
      ),
      starterPart(
        runtime,
        [
          runtime.textBlock("Differentiate with respect to $t$.\n\n$$\\frac{d}{dt}\\left(\\frac{\\sin^3 t}{t^2}\\right)$$"),
          runtime.spaceBlock(7),
        ],
        2,
      ),
      starterPart(
        runtime,
        [runtime.textBlock("Differentiate with respect to $x$.\n\n$$\\frac{d}{dx}\\left(\\sin^2 x\\right)$$"), runtime.spaceBlock(4)],
        1,
      ),
      starterPart(
        runtime,
        [runtime.textBlock("Find the indefinite integral.\n\n$$\\int \\sin x\\cos 3x-\\sin 3x\\cos x\\,dx$$"), runtime.spaceBlock(6)],
        2,
      ),
    ]),
    starterQuestion(
      runtime,
      [
        runtime.textBlock(
          "Find, but **do not evaluate**, an expression to calculate the total area of the shaded regions in the following diagram.",
        ),
        starterDiagramBlock(runtime, shadedAreaGraphConfig(runtime.id)),
        runtime.spaceBlock(8),
      ],
      4,
    ),
    starterQuestion(
      runtime,
      [
        runtime.textBlock("Given a binomially distributed variable $X$ has $E(X)=1$ and $\\operatorname{Var}(X)=0.8$, find $n$ and $p$."),
        runtime.spaceBlock(5),
      ],
      2,
      "Statistics",
    ),
    starterQuestion(
      runtime,
      [
        runtime.textBlock("Which of the following distributions does the graph below represent?"),
        runtime.choiceListBlock([
          "$X \\sim \\operatorname{Bin}(8,0.2)$",
          "$X \\sim \\operatorname{Bin}(8,0.8)$",
          "$X \\sim \\operatorname{Bin}(8,0.5)$",
        ]),
        starterDiagramBlock(runtime, binomialDistributionGraphConfig(), "right"),
        runtime.spaceBlock(3),
      ],
      1,
      "Statistics",
    ),
  ];
}

function firstQuestionPlanAnchor(questions: QuestionBlock[]) {
  const activeQuestionId = questions[0]?.id ?? "";
  return {
    activeQuestionId,
    anchor: activeQuestionId ? questionScrollAnchor(activeQuestionId) : "",
  };
}

export function createScreenshotStarterDocumentPlan(runtime: ScreenshotStarterRuntime): StarterEditorDocumentPlan {
  const questions = createScreenshotStarterQuestions(runtime);
  const sectionHeadings: DocumentSectionHeading[] = [];
  const documentFlow = defaultDocumentFlow(questions);

  return {
    document: {
      frontMatter: createScreenshotStarterFrontMatter(),
      questions,
      sectionHeadings,
      documentFlow,
      formattingConfig: formattingConfigForPresetId(DEFAULT_FORMATTING_CONFIG.id),
    },
    ...firstQuestionPlanAnchor(questions),
  };
}

export function frontMatterForTemplate(template: TitlePageTemplate) {
  if (template === "exam") return cloneSerializable(DEFAULT_EXAM_FRONT_MATTER);
  if (template === "worksheet") return cloneSerializable(DEFAULT_WORKSHEET_FRONT_MATTER);
  if (template === "notes") return cloneSerializable(DEFAULT_NOTES_FRONT_MATTER);
  return cloneSerializable(DEFAULT_FRONT_MATTER);
}

export function createTemplateEditorDocumentPlan({
  template,
  formatPresetId,
  id,
  logos,
  currentFrontMatter,
  editorDocumentFingerprint,
}: CreateTemplateEditorDocumentPlanOptions): StarterEditorDocumentPlan {
  const currentLogo = selectedLogoFromLibrary(logos, currentFrontMatter.logoId);
  const nextFrontMatter = {
    ...frontMatterForTemplate(template),
    logoId: currentLogo.id,
    schoolName: currentLogo.schoolName ?? currentFrontMatter.schoolName,
  };
  const questions = template === "notes" ? [createNotesSection(id)] : [createQuestion(id)];
  const sectionHeadings: DocumentSectionHeading[] = [];
  const documentFlow = defaultDocumentFlow(questions);
  const formattingConfig = formattingConfigForPresetId(formatPresetId ?? DEFAULT_FORMATTING_CONFIG.id);

  return {
    document: {
      frontMatter: nextFrontMatter,
      questions,
      sectionHeadings,
      documentFlow,
      formattingConfig,
    },
    ...firstQuestionPlanAnchor(questions),
    cleanFingerprint: editorDocumentFingerprint(nextFrontMatter, questions, formattingConfig, currentLogo, sectionHeadings, documentFlow),
  };
}

export function isBlankStarterQuestion(question?: QuestionBlock) {
  return (
    Boolean(question) &&
    question?.marks === 0 &&
    question.contentBlocks.length === 0 &&
    question.parts.length === 0 &&
    question.itemOrder.length === 0 &&
    !question.pageBreakAfter
  );
}

export function shouldSeedScreenshotStarter(questions: QuestionBlock[], storage?: BrowserStorageLike | null) {
  if (storage === undefined && typeof window === "undefined") return false;
  if (browserStorageItem(STARTER_DOCUMENT_STORAGE_KEY, LEGACY_STARTER_DOCUMENT_STORAGE_KEY, storage) !== null) return false;
  return questions.length === 1 && isBlankStarterQuestion(questions[0]);
}
