export type InputFormat = "plain" | "latex";

export type DiagramType =
  | "graph2d"
  | "geometry2d"
  | "graph3d"
  | "geometricConstruction"
  | "image"
  | "network"
  | "setDiagram"
  | "statsChart"
  | "vector2d"
  | string;

export type StatsChartType = "histogram" | "binomial" | "normal" | "box" | "density" | "blankAxes" | "scatter" | "bar" | string;
export type HistogramBarType = "continuous" | "discrete";
export type StatsChartDataMode = "raw" | "manualProbabilities" | "manualFrequencies";
export type StatsChartYAxisMode = "frequency" | "relativeFrequency";
export type StatsChartYLabelOrientation = "vertical" | "horizontal";

export interface StatsChartData {
  chartType: StatsChartType;
  barType?: HistogramBarType;
  dataMode?: StatsChartDataMode;
  yAxisMode?: StatsChartYAxisMode;
  yLabelOrientation?: StatsChartYLabelOrientation;
  values?: number[];
  xValues?: number[];
  yValues?: number[];
  probabilities?: number[];
  mean?: number;
  stdDev?: number;
  trials?: number;
  probability?: number;
  range?: [number, number];
  yRange?: [number, number];
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

export interface Graph3DPointData {
  id?: string;
  name?: string;
  label?: string;
  coords?: [number, number, number];
  coordinates?: [number, number, number];
  position?: [number, number, number];
  x?: number;
  y?: number;
  z?: number;
  color?: string;
  show?: boolean;
  [key: string]: unknown;
}

export interface Graph3DSegmentData {
  from?: string;
  to?: string;
  points?: string[];
  label?: string;
  color?: string;
  strokeStyle?: "solid" | "dashed";
  strokeWidth?: number;
  dashed?: boolean;
  show?: boolean;
  [key: string]: unknown;
}

export interface Graph3DFaceData {
  points?: Array<string | [number, number, number] | Graph3DPointData>;
  vertices?: Array<string | [number, number, number] | Graph3DPointData>;
  label?: string;
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeStyle?: "solid" | "dashed";
  strokeWidth?: number;
  dashed?: boolean;
  show?: boolean;
  [key: string]: unknown;
}

export interface Graph3DSolidData {
  kind?: "circle" | "cone" | "cylinder" | "sphere" | "sphereCap" | "sphericalCap" | string;
  type?: "circle" | "cone" | "cylinder" | "sphere" | "sphereCap" | "sphericalCap" | string;
  center?: string | [number, number, number] | Graph3DPointData;
  baseCenter?: string | [number, number, number] | Graph3DPointData;
  topCenter?: string | [number, number, number] | Graph3DPointData;
  apex?: string | [number, number, number] | Graph3DPointData;
  normal?: [number, number, number];
  axis?: [number, number, number];
  radius?: number;
  height?: number;
  depth?: number;
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  stepsU?: number;
  stepsV?: number;
  show?: boolean;
  [key: string]: unknown;
}

export interface Graph3DData {
  points?: Graph3DPointData[];
  vertices?: Graph3DPointData[];
  segments?: Graph3DSegmentData[];
  edges?: Graph3DSegmentData[];
  faces?: Graph3DFaceData[];
  solids?: Graph3DSolidData[];
  surfaces?: Graph3DSolidData[];
  xRange?: [number, number];
  yRange?: [number, number];
  zRange?: [number, number];
  [key: string]: unknown;
}

export interface ImageDiagramData {
  src?: string;
  name?: string;
  alt?: string;
  mimeType?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  [key: string]: unknown;
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
  data?:
    | GeometricDiagramData
    | Graph2DGeometryData
    | StatsChartData
    | Graph3DData
    | ImageDiagramData
    | ({ geometry2d?: Graph2DGeometryData; polarGrid?: Graph2DPolarGridData } & Record<string, unknown>);
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
  xAxisLabel?: string;
  yAxisLabel?: string;
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

export interface Graph2DPolarGridData {
  show?: boolean;
  center?: [number, number];
  radii?: number[];
  radius?: number;
  angleLinesDeg?: number[];
  anglesDeg?: number[];
  angleLinesRad?: number[];
  color?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed";
}

export interface Graph2DGeometryPoint {
  id: string;
  x: number;
  y: number;
  label?: string;
  labelX?: number;
  labelY?: number;
  color?: string;
  show?: boolean;
}

export interface Graph2DGeometrySegment {
  id: string;
  from: string;
  to: string;
  label?: string;
  labelX?: number;
  labelY?: number;
  color?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed";
  show?: boolean;
}

export interface Graph2DGeometryArc {
  id: string;
  center: string;
  from: string;
  to: string;
  label?: string;
  labelX?: number;
  labelY?: number;
  color?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed";
  show?: boolean;
}

export interface Graph2DGeometryAngle {
  id: string;
  points: [string, string, string];
  label?: string;
  labelX?: number;
  labelY?: number;
  radius?: number;
  arcCount?: number;
  color?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed";
  show?: boolean;
}

export interface Graph2DGeometryDecoration {
  kind: "equalLength" | "equalAngle" | "rightAngle";
  id?: string;
  segments?: string[];
  pointPairs?: Array<[string, string]>;
  angles?: string[];
  anglePoints?: Array<[string, string, string]>;
  angle?: string;
  points?: [string, string, string];
  tickCount?: number;
  arcCount?: number;
  radius?: number;
  size?: number;
  color?: string;
  show?: boolean;
}

export interface Graph2DGeometryData {
  points?: Graph2DGeometryPoint[];
  segments?: Graph2DGeometrySegment[];
  arcs?: Graph2DGeometryArc[];
  angles?: Graph2DGeometryAngle[];
  decorations?: Graph2DGeometryDecoration[];
}

export interface GeometricDiagramObject {
  type: "point" | "line" | "circle" | "angle" | string;
  name: string;
  label?: string;
  [key: string]: unknown;
}

export interface GeometricDiagramRelationship {
  type:
    | "triangle"
    | "rightAngle"
    | "labelLength"
    | "labelAngle"
    | "segment"
    | "equalLength"
    | "angleMark"
    | "perpendicular"
    | "parallel"
    | "on"
    | "between"
    | string;
  points?: string[];
  at?: string;
  name?: string;
  segmentNames?: string[];
  between?: string[];
  value?: string;
  label?: string;
  marks?: number;
  markCount?: number;
  tickCount?: number;
  arcCount?: number;
  count?: number;
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
    | "line_segment"
    | "angle_marker"
    | "label"
    | "region_clipped_by_curve";
  label?: string;
  labelMode?: "none" | "name" | "coordinates" | "name_and_coordinates" | "area" | "name_and_area" | "value" | "name_and_value";
  color?: string;
  show?: boolean;
  fillOpacity?: number;
  strokeWidth?: number;
  strokeStyle?: "none" | "solid" | "dashed";
  span?: "manual" | "grid";
  size?: number;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  rightAngle?: boolean;
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
  solutionOnly?: boolean;
}

export interface GraphSlopeFieldPoint {
  x: number;
  y: number;
  slope?: number;
  label?: string;
  color?: string;
  show?: boolean;
}

export interface GraphSlopeFieldSpec {
  expression: string;
  xValues?: number[];
  yValues?: number[];
  xRange?: [number, number];
  yRange?: [number, number];
  xStep?: number;
  yStep?: number;
  segmentLength?: number;
  color?: string;
  strokeWidth?: number;
  show?: boolean;
  points?: GraphSlopeFieldPoint[];
  highlightedPoints?: GraphSlopeFieldPoint[];
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
  pageBreakBefore?: boolean;
  contentBlocks?: ContentBlock[];
  subparts?: QuestionSubpart[];
}

export interface QuestionSubpart {
  id: string;
  label: string;
  text: string;
  marks: number;
  pageBreakBefore?: boolean;
  contentBlocks?: ContentBlock[];
}

export type ContentBlock =
  | TextContentBlock
  | ChoiceListContentBlock
  | TableContentBlock
  | DiagramContentBlock
  | ColumnsContentBlock
  | SpaceContentBlock
  | PageBreakContentBlock;
export type DiagramAlignment = "left" | "center" | "right";
export type DiagramTextSide = "none" | "left" | "right";
export type ColumnCount = 2 | 3 | 4;
export type ChoiceNumberingStyle = "roman" | "upper-alpha" | "lower-alpha" | "decimal" | "bullet";
export type ChoiceListLayout = "vertical" | "two-column" | "inline";
export type TableCellAlignment = "left" | "center" | "right";
export type ContentBlockVisibility = "always" | "student" | "solution";

export interface ContentBlockVisibilityOptions {
  visibility?: ContentBlockVisibility;
  solutionOnly?: boolean;
  studentOnly?: boolean;
  markTicks?: number;
}

export interface TextContentBlock extends ContentBlockVisibilityOptions {
  id: string;
  kind: "text";
  text: string;
}

export interface ChoiceListContentBlock extends ContentBlockVisibilityOptions {
  id: string;
  kind: "choices";
  choices: string[];
  numberingStyle?: ChoiceNumberingStyle;
  layout?: ChoiceListLayout;
}

export interface TableContentBlock extends ContentBlockVisibilityOptions {
  id: string;
  kind: "table";
  headers: string[];
  rows: string[][];
  showHeader?: boolean;
  tableAlign?: DiagramAlignment;
  cellAlignment?: TableCellAlignment;
}

export interface DiagramContentBlock extends ContentBlockVisibilityOptions {
  id: string;
  kind: "diagram";
  diagramAlign?: DiagramAlignment;
  diagramTextSide?: DiagramTextSide;
  graphConfig: GraphConfig;
}

export interface ColumnsContentBlock extends ContentBlockVisibilityOptions {
  id: string;
  kind: "columns";
  columnCount?: ColumnCount;
  columns: ContentBlock[][];
}

export interface SpaceContentBlock extends ContentBlockVisibilityOptions {
  id: string;
  kind: "space";
  lines: number;
}

export interface PageBreakContentBlock extends ContentBlockVisibilityOptions {
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

export type ProjectFileKind = "file" | "folder";

export type MauthProjectFileType =
  | "folder"
  | "mauthdown"
  | "worksheet"
  | "test"
  | "diagram"
  | "config"
  | "markdown"
  | "json"
  | "generated"
  | "asset"
  | "text"
  | string;

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string | null;
  metadata: Record<string, unknown>;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFileSummary {
  id: string;
  projectId: string;
  parentId?: string | null;
  parentPath?: string | null;
  path: string;
  name: string;
  kind: ProjectFileKind;
  fileType?: MauthProjectFileType | null;
  metadata: Record<string, unknown>;
  sortOrder: number;
  revision: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFileDocument extends ProjectFileSummary {
  content: string | null;
  versionCount: number;
}

export interface ProjectFileVersion {
  id: string;
  projectId: string;
  filePath: string;
  fileId?: string | null;
  fileType?: MauthProjectFileType | null;
  metadata: Record<string, unknown>;
  revision: number;
  reason?: string;
  content: string;
  createdAt: string;
}

export interface ProjectFileSaveRequest {
  content?: string | null;
  kind?: ProjectFileKind;
  fileType?: MauthProjectFileType | null;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
  baseRevision?: number | null;
}

export type MauthAgentBridgeErrorCode =
  | "APP_NOT_CONNECTED"
  | "MULTIPLE_ACTIVE_EDITORS"
  | "STALE_SNAPSHOT"
  | "VALIDATION_FAILED"
  | "ACTION_FAILED"
  | "SAVE_CONFLICT"
  | "BRIDGE_TIMEOUT"
  | "INVALID_REQUEST"
  | "IDEMPOTENCY_KEY_REUSED";

export type MauthAgentRequestKind = "snapshot" | "actions.preview" | "actions.apply" | "validation.run";

export interface MauthAgentMutationBase {
  snapshotId: string;
  activeProjectFilePath?: string | null;
  activeProjectFileRevision?: number | null;
  dirty: boolean;
  preferredPrecondition: "baseSnapshotId";
}

export interface MauthAgentFileState {
  projectId?: string | null;
  projectName?: string | null;
  activePath?: string | null;
  activeRevision?: number | null;
  dirty: boolean;
  saveStatus: "saved" | "dirty" | "draft" | "conflict" | "loading" | "unknown";
  autosaveStatus?: string;
  autosaveMessage?: string;
}

export interface MauthAgentModuleSummary {
  id: string;
  kind: ContentBlock["kind"] | string;
  visibility?: ContentBlockVisibility;
  textPreview?: string;
  marks?: number;
  lines?: number;
  choiceCount?: number;
  rowCount?: number;
  columnCount?: number;
  graphType?: DiagramType | string;
  diagramAlign?: DiagramAlignment;
  childModules?: MauthAgentModuleSummary[];
}

export interface MauthAgentSubpartSummary {
  id: string;
  label?: string;
  marks: number;
  textPreview?: string;
  pageBreakBefore?: boolean;
  modules: MauthAgentModuleSummary[];
}

export interface MauthAgentPartSummary {
  id: string;
  label?: string;
  marks: number;
  textPreview?: string;
  pageBreakBefore?: boolean;
  modules: MauthAgentModuleSummary[];
  subparts: MauthAgentSubpartSummary[];
}

export interface MauthAgentQuestionSummary {
  id: string;
  label: string;
  marks: number;
  textPreview?: string;
  pageBreakAfter?: boolean;
  modules: MauthAgentModuleSummary[];
  parts: MauthAgentPartSummary[];
}

export interface MauthAgentSectionHeadingSummary {
  id: string;
  title: string;
}

export type MauthAgentDocumentFlowItem =
  | { kind: "sectionHeading"; id: string; title?: string }
  | { kind: "question"; id: string; label?: string };

export interface MauthAgentSnapshot {
  success: true;
  snapshotId: string;
  generatedAt: string;
  mutationBase: MauthAgentMutationBase;
  file: MauthAgentFileState;
  frontMatter: Record<string, unknown>;
  formattingConfig?: Record<string, unknown>;
  sectionHeadings: MauthAgentSectionHeadingSummary[];
  documentFlow: MauthAgentDocumentFlowItem[];
  questions: MauthAgentQuestionSummary[];
  questionCount: number;
  totalMarks: number;
  validation?: unknown;
  warnings: Array<{ code: string; message: string; targetId?: string }>;
  _links: {
    snapshot: string;
    preview: { method: "POST"; href: string };
    apply: { method: "POST"; href: string };
    validation: { method: "POST"; href: string };
    presence: { method: "POST"; href: string };
    events: string;
    comments: string;
    suggestions: string;
    docs: string;
  };
}

export interface MauthAgentQueuedRequest {
  requestId: string;
  kind: MauthAgentRequestKind;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface MauthAgentRequest {
  request: MauthAgentQueuedRequest | null;
}

export interface MauthAgentApplyResult {
  success: boolean;
  snapshot?: MauthAgentSnapshot;
  result?: unknown;
  code?: MauthAgentBridgeErrorCode | string;
  error?: string;
  validationIssues?: unknown;
}

export interface MauthAgentEvent {
  id: number;
  type: string;
  actor?: string;
  message?: string;
  requestId?: string;
  at: string;
  data?: Record<string, unknown>;
}

export interface MauthAgentPresence {
  id: string;
  name?: string;
  status: string;
  details?: string;
  at: string;
}

export interface MauthAgentReviewTarget {
  kind: "document" | "question" | "part" | "subpart" | "module" | "textRange";
  questionId?: string;
  partId?: string;
  subpartId?: string;
  blockId?: string;
  start?: number;
  end?: number;
  label?: string;
}

export interface MauthAgentComment {
  id: string;
  actor?: string;
  body: string;
  severity: "note" | "warning" | "error";
  target?: MauthAgentReviewTarget;
  snapshotId?: string;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
}

export interface MauthAgentSuggestion {
  id: string;
  actor?: string;
  title?: string;
  body: string;
  target?: MauthAgentReviewTarget;
  actions?: unknown[];
  replacementText?: string;
  snapshotId?: string;
  status: "proposed" | "accepted" | "rejected";
  createdAt: string;
  updatedAt: string;
}
