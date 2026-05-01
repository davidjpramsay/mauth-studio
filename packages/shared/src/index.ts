export type InputFormat = "plain" | "latex";

export type DiagramType =
  | "graph2d"
  | "graph3d"
  | "geometricConstruction"
  | "vectorRelationship"
  | "setDiagram"
  | "statsChart"
  | "vector2d"
  | string;

export type StatsChartType = "histogram" | "binomial" | "normal" | "box" | "scatter" | "bar" | string;

export interface StatsChartData {
  chartType: StatsChartType;
  values?: number[];
  mean?: number;
  stdDev?: number;
  trials?: number;
  probability?: number;
  range?: [number, number];
  bins?: number;
  binSize?: number;
  xLabel?: string;
  yLabel?: string;
  title?: string;
  categories?: string[];
  frequencies?: number[];
  points?: Array<{ x: number; y: number; label?: string }>;
  series?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface StatsChartOptions {
  widthPx?: number;
  heightPx?: number;
  showGrid?: boolean;
  blackAndWhite?: boolean;
  showFill?: boolean;
  fillColor?: string;
  fillOpacity?: number;
  interactive?: boolean;
  showLegend?: boolean;
  fontSizePt?: number;
  normalPointCount?: number;
  [key: string]: unknown;
}

export interface StatsChartSpec {
  type: "statsChart";
  data: StatsChartData;
  style?: string;
  options?: StatsChartOptions;
}

export interface WorkedStep {
  name?: string;
  title: string;
  expression?: string;
  latex?: string;
  explanation?: string;
}

export interface GraphConfig {
  type: DiagramType;
  data?: GeometricDiagramData | StatsChartData | Record<string, unknown>;
  style?: string;
  options?: Record<string, unknown>;
  expression?: string;
  latex?: string;
  functions?: GraphFunction[];
  features?: GraphFeature[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  widthPx?: number;
  heightPx?: number;
  scalePercent?: number;
  penrosePreset?: string;
  lockAspectRatio?: boolean;
  equalScale?: boolean;
  showGrid?: boolean;
  showMajorGrid?: boolean;
  showMinorGrid?: boolean;
  showGridBorder?: boolean;
  showAxes?: boolean;
  showArrows?: boolean;
  showAxisLabels?: boolean;
  showAxisNumbers?: boolean;
  axisLabelIntervalMode?: "auto" | "manual";
  axisLabelStepX?: number;
  axisLabelStepY?: number;
  axisLabelMinSpacingPx?: number;
  showFunctionArrows?: boolean;
  gridMajorStep?: number;
  gridMinorStep?: number;
  gridMajorStepX?: number;
  gridMajorStepY?: number;
  gridMinorStepX?: number;
  gridMinorStepY?: number;
  gridMajorColor?: string;
  gridMinorColor?: string;
  axisExtensionMode?: "auto" | "manual";
  functionExtensionMode?: "auto" | "manual";
  axisExtension?: number;
  functionExtension?: number;
  functionExtensionLeft?: number;
  functionExtensionRight?: number;
  metadata?: Record<string, unknown>;
}

export interface GeometricDiagramObject {
  type: "point" | "line" | "circle" | "angle" | string;
  name: string;
  label?: string;
  [key: string]: unknown;
}

export interface GeometricDiagramRelationship {
  type: "triangle" | "rightAngle" | "labelLength" | "equalLength" | "perpendicular" | "parallel" | "on" | "between" | string;
  points?: string[];
  at?: string;
  between?: string[];
  value?: string;
  first?: string[];
  second?: string[];
  segmentA?: string[];
  segmentB?: string[];
  segments?: string[][];
  [key: string]: unknown;
}

export interface GeometricDiagramData {
  objects: GeometricDiagramObject[];
  relationships: GeometricDiagramRelationship[];
}

export interface DiagramSpec {
  type: DiagramType;
  data: GeometricDiagramData | Record<string, unknown>;
  style?: string;
  options?: Record<string, unknown>;
}

export interface PenroseDiagramResponse {
  svg: string;
  metadata?: Record<string, unknown>;
}

export interface GraphFunction {
  id?: string;
  kind?: "expression" | "piecewise" | "relation";
  expression: string;
  latex?: string;
  label?: string;
  color?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed";
  show?: boolean;
  showLabel?: boolean;
  labelMode?: "name" | "equation";
  labelX?: number;
  labelY?: number;
  domainMode?: "auto" | "manual";
  domainMin?: number;
  domainMax?: number;
  functionExtensionMode?: "auto" | "manual";
  functionExtension?: number;
  functionExtensionLeft?: number;
  functionExtensionRight?: number;
  pieces?: GraphFunctionPiece[];
}

export interface GraphFunctionPiece {
  id?: string;
  expression: string;
  xMin?: number;
  xMax?: number;
  includeStart?: boolean;
  includeEnd?: boolean;
}

export interface GraphFeature {
  id?: string;
  kind:
    | "point"
    | "point_between_points"
    | "region_between_curves"
    | "region_curve_axis"
    | "turning_point"
    | "intersection"
    | "tangent"
    | "label"
    | "region_clipped_by_curve";
  label?: string;
  labelMode?: "none" | "name" | "coordinates" | "name_and_coordinates" | "area" | "name_and_area" | "value" | "name_and_value";
  color?: string;
  show?: boolean;
  fillOpacity?: number;
  strokeWidth?: number;
  strokeStyle?: "none" | "solid" | "dashed";
  size?: number;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  ratio?: number;
  functionIndex?: number;
  functionAIndex?: number;
  functionBIndex?: number;
  intersectionTarget?: "function" | "xAxis" | "yAxis";
  baseFeatureIndex?: number;
  clipFunctionIndex?: number;
  clipSide?: "above" | "below" | "left" | "right" | "inside" | "outside";
  axis?: "x" | "y";
  xMin?: number;
  xMax?: number;
  labelX?: number;
  labelY?: number;
}

export interface MathRequest {
  expression: string;
  inputFormat: InputFormat;
  variable?: string;
  includeSteps?: boolean;
  includeGraph?: boolean;
}

export interface MathResponse {
  result: string;
  latex: string;
  steps: WorkedStep[];
  graphConfig?: GraphConfig | null;
}

export interface Question {
  id: string;
  type: string;
  section: string;
  questionText: string;
  questionLatex: string;
  contentBlocks?: ContentBlock[];
  answer: string;
  answerLatex: string;
  parts?: QuestionPart[];
  workedSolution: WorkedStep[];
  marksBreakdown: Record<string, number>;
  totalMarks: number;
  graphConfig?: GraphConfig | null;
  tableConfig?: TableConfig | null;
  formatting: string;
  marking: string;
  metadata: Record<string, unknown>;
}

export interface QuestionPart {
  id: string;
  label: string;
  text: string;
  marks: number;
  contentBlocks?: ContentBlock[];
  subparts?: QuestionSubpart[];
}

export interface QuestionSubpart {
  id: string;
  label: string;
  text: string;
  marks: number;
  contentBlocks?: ContentBlock[];
}

export type ContentBlock = TextContentBlock | ChoiceListContentBlock | DiagramContentBlock | SpaceContentBlock | PageBreakContentBlock;
export type DiagramAlignment = "left" | "center" | "right";
export type ChoiceNumberingStyle = "roman" | "upper-alpha" | "lower-alpha" | "decimal" | "bullet";
export type ChoiceListLayout = "vertical" | "two-column" | "inline";

export interface TextContentBlock {
  id: string;
  kind: "text";
  text: string;
}

export interface ChoiceListContentBlock {
  id: string;
  kind: "choices";
  choices: string[];
  numberingStyle?: ChoiceNumberingStyle;
  layout?: ChoiceListLayout;
}

export interface DiagramContentBlock {
  id: string;
  kind: "diagram";
  diagramAlign?: DiagramAlignment;
  graphConfig: GraphConfig;
}

export interface SpaceContentBlock {
  id: string;
  kind: "space";
  lines: number;
}

export interface PageBreakContentBlock {
  id: string;
  kind: "pageBreak";
}

export interface TableConfig {
  headers: string[];
  rows: string[][];
}

export interface TestQuestionSpec {
  type: string;
  count: number;
}

export interface TestSection {
  title: string;
  instructions?: string;
  questions: Question[];
}

export interface TestBuildRequest {
  title: string;
  sections: TestSection[];
  formatting: string;
  marking: string;
  testRule: string;
}

export interface PageFormattingConfig {
  size?: "A4" | string;
  orientation?: "portrait" | "landscape" | string;
  widthPx?: number;
  heightPx?: number;
  paddingXPx?: number;
  paddingYPx?: number;
  showPageBreaks?: boolean;
}

export interface FormattingConfig {
  id?: string;
  showMarks?: boolean;
  marksStyle?: string;
  questionSpacing?: string;
  diagramPosition?: string;
  fontSize?: string;
  numbering?: string;
  sectionHeaders?: boolean;
  page?: PageFormattingConfig;
}

export interface GeneratedTest {
  title: string;
  questions: Question[];
  sections: TestSection[];
  totalMarks: number;
  formatting: string;
  marking: string;
  testRule?: string;
  renderedHtml: string;
  blocks: Array<Record<string, unknown>>;
  formattedSections: Array<Record<string, unknown>>;
  formattingConfig?: FormattingConfig;
}
