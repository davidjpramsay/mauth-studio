from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

InputFormat = Literal["plain", "latex"]


class WorkedStep(BaseModel):
    name: str | None = None
    title: str
    expression: str | None = None
    latex: str | None = None
    explanation: str | None = None


class GraphFunctionPiece(BaseModel):
    id: str | None = None
    expression: str
    xMin: float | None = None
    xMax: float | None = None
    includeStart: bool = True
    includeEnd: bool = True


class GraphFunction(BaseModel):
    id: str | None = None
    kind: Literal["expression", "piecewise", "relation"] = "expression"
    expression: str
    latex: str | None = None
    label: str | None = None
    color: str | None = None
    strokeWidth: float = 3
    strokeStyle: Literal["solid", "dashed"] = "solid"
    show: bool = True
    showLabel: bool = False
    labelMode: Literal["name", "equation"] = "equation"
    labelX: float | None = None
    labelY: float | None = None
    domainMode: Literal["auto", "manual"] = "auto"
    domainMin: float | None = None
    domainMax: float | None = None
    functionExtensionMode: Literal["auto", "manual"] = "auto"
    functionExtension: float = 0.25
    functionExtensionLeft: float | None = 0.25
    functionExtensionRight: float | None = 0.25
    pieces: list[GraphFunctionPiece] = Field(default_factory=list)


class GraphFeature(BaseModel):
    id: str | None = None
    kind: Literal[
        "point",
        "point_between_points",
        "region_between_curves",
        "region_curve_axis",
        "turning_point",
        "intersection",
        "tangent",
        "line_segment",
        "perpendicular_line",
        "perpendicular_symbol",
        "label",
        "region_clipped_by_curve",
    ] = "point"
    label: str | None = None
    labelMode: Literal[
        "none",
        "name",
        "coordinates",
        "name_and_coordinates",
        "area",
        "name_and_area",
        "value",
        "name_and_value",
    ] = "name"
    color: str | None = None
    show: bool = True
    fillOpacity: float | None = 0.18
    strokeWidth: float | None = 2
    strokeStyle: Literal["solid", "dashed"] | None = "solid"
    size: float | None = 0.35
    x: float | None = None
    y: float | None = None
    x1: float | None = None
    y1: float | None = None
    x2: float | None = None
    y2: float | None = None
    ratio: float | None = 0.5
    functionIndex: int | None = 0
    functionAIndex: int | None = 0
    functionBIndex: int | None = 1
    baseFeatureIndex: int | None = 0
    clipFunctionIndex: int | None = 0
    clipSide: Literal["above", "below", "left", "right", "inside", "outside"] | None = "inside"
    axis: Literal["x", "y"] | None = "x"
    xMin: float | None = None
    xMax: float | None = None
    labelX: float | None = None
    labelY: float | None = None


class GraphConfig(BaseModel):
    type: str
    data: dict[str, Any] = Field(default_factory=dict)
    style: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)
    expression: str | None = None
    latex: str | None = None
    functions: list[GraphFunction] = Field(default_factory=list)
    features: list[GraphFeature] = Field(default_factory=list)
    xMin: float = -10
    xMax: float = 10
    yMin: float = -10
    yMax: float = 10
    widthPx: float = 680
    heightPx: float = 300
    equalScale: bool = False
    showGrid: bool = True
    showMajorGrid: bool = True
    showMinorGrid: bool = False
    showGridBorder: bool = False
    showAxes: bool = True
    showArrows: bool = True
    showAxisLabels: bool = True
    axisLabelIntervalMode: Literal["auto", "manual"] = "auto"
    axisLabelStepX: float | None = None
    axisLabelStepY: float | None = None
    axisLabelMinSpacingPx: float = 48
    showFunctionArrows: bool = True
    gridMajorStep: float = 1
    gridMinorStep: float | None = 0.5
    gridMajorStepX: float | None = 1
    gridMajorStepY: float | None = 1
    gridMinorStepX: float | None = 0.5
    gridMinorStepY: float | None = 0.5
    gridMajorColor: str = "#b9b9b9"
    gridMinorColor: str = "#dddddd"
    axisExtensionMode: Literal["auto", "manual"] = "auto"
    functionExtensionMode: Literal["auto", "manual"] = "auto"
    axisExtension: float = 0.5
    functionExtension: float = 0.25
    functionExtensionLeft: float | None = 0.25
    functionExtensionRight: float | None = 0.25
    metadata: dict[str, Any] = Field(default_factory=dict)


class ContentBlock(BaseModel):
    id: str | None = None
    kind: Literal["text", "choices", "table", "diagram", "space", "pageBreak"]
    text: str | None = None
    choices: list[str] = Field(default_factory=list)
    numberingStyle: Literal["roman", "upper-alpha", "lower-alpha", "decimal", "bullet"] | None = "roman"
    layout: Literal["vertical", "two-column", "inline"] | None = "vertical"
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    showHeader: bool | None = True
    tableAlign: Literal["left", "center", "right"] | None = "center"
    cellAlignment: Literal["left", "center", "right"] | None = "center"
    lines: float | None = None
    diagramAlign: Literal["left", "center", "right"] | None = None
    graphConfig: GraphConfig | None = None


class DiagramSpec(BaseModel):
    type: str
    data: dict[str, Any] = Field(default_factory=dict)
    style: str | None = "school"
    options: dict[str, Any] = Field(default_factory=dict)


class PenroseDiagramResponse(BaseModel):
    svg: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class MathRequest(BaseModel):
    expression: str
    inputFormat: InputFormat = "plain"
    variable: str = "x"
    includeSteps: bool = True
    includeGraph: bool = False


class MathResponse(BaseModel):
    result: str
    latex: str
    steps: list[WorkedStep] = Field(default_factory=list)
    graphConfig: GraphConfig | None = None


class QuestionGenerateRequest(BaseModel):
    type: str = "quadratic_factor"
    seed: int | None = None
    formatting: str = "default"
    marking: str = "default"


class QuestionSubpart(BaseModel):
    id: str | None = None
    label: str
    text: str
    marks: int = Field(ge=0)
    contentBlocks: list[ContentBlock] = Field(default_factory=list)


class QuestionPart(BaseModel):
    id: str | None = None
    label: str
    text: str
    marks: int = Field(ge=0)
    contentBlocks: list[ContentBlock] = Field(default_factory=list)
    subparts: list[QuestionSubpart] = Field(default_factory=list)


class TestQuestionSpec(BaseModel):
    type: str
    count: int = Field(ge=1, le=50)


class TestGenerateRequest(BaseModel):
    title: str
    questions: list[TestQuestionSpec]
    formatting: str = "default"
    marking: str = "default"
    seed: int | None = None


class AuthoredQuestion(BaseModel):
    id: str | None = None
    type: str = "authored"
    section: str = "Algebra"
    questionText: str
    questionLatex: str | None = None
    contentBlocks: list[ContentBlock] = Field(default_factory=list)
    answer: str = ""
    answerLatex: str | None = None
    parts: list[QuestionPart] = Field(default_factory=list)
    workedSolution: list[WorkedStep] = Field(default_factory=list)
    marksBreakdown: dict[str, int] = Field(default_factory=dict)
    totalMarks: int | None = None
    graphConfig: GraphConfig | None = None
    tableConfig: dict[str, Any] | None = None
    formatting: str = "default"
    marking: str = "default"
    metadata: dict[str, Any] = Field(default_factory=dict)


class TestSectionBuildRequest(BaseModel):
    title: str
    questions: list[AuthoredQuestion] = Field(default_factory=list)


class TestBuildRequest(BaseModel):
    title: str = "High School Mathematics"
    sections: list[TestSectionBuildRequest] = Field(default_factory=list)
    formatting: str = "default"
    marking: str = "default"
    testRule: str = "high_school_mathematics"


class FormatRenderRequest(BaseModel):
    title: str = "Worksheet"
    questions: list[dict[str, Any]] = Field(default_factory=list)
    formatting: str = "default"


class SavedTestRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = None
    name: str = "Untitled test"
    frontMatter: dict[str, Any] = Field(default_factory=dict)
    questions: list[dict[str, Any]] = Field(default_factory=list)
    logo: dict[str, Any] | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


class AutosaveRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    frontMatter: dict[str, Any] = Field(default_factory=dict)
    questions: list[dict[str, Any]] = Field(default_factory=list)
    formattingConfig: dict[str, Any] = Field(default_factory=dict)
    logo: dict[str, Any] | None = None
    activeProjectFilePath: str | None = None
    activeProjectFileRevision: int | None = None


class LogoAssetRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = None
    name: str = "Custom logo"
    src: str = ""
    schoolName: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


class ProjectRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = None
    name: str = "Untitled project"
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProjectFileRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    content: str | None = ""
    kind: Literal["file", "folder"] = "file"
    fileType: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    sortOrder: int = 0
    baseRevision: int | None = None


class AssistantChatMessage(BaseModel):
    role: Literal["user", "assistant", "system", "developer"] = "user"
    content: str


class AssistantToolOutput(BaseModel):
    callId: str
    name: str | None = None
    output: Any


class AssistantChatRequest(BaseModel):
    messages: list[AssistantChatMessage] = Field(default_factory=list)
    previousResponseId: str | None = None
    toolOutputs: list[AssistantToolOutput] = Field(default_factory=list)
    documentSummary: dict[str, Any] | None = None
    model: str | None = None


class AssistantToolCallResponse(BaseModel):
    id: str | None = None
    callId: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    mauthToolName: str | None = None
    mauthArguments: Any = Field(default_factory=dict)


class AssistantUsageSummary(BaseModel):
    model: str
    inputTokens: int = 0
    cachedInputTokens: int = 0
    billableInputTokens: int = 0
    outputTokens: int = 0
    totalTokens: int = 0
    estimatedCostUsd: float | None = None
    pricingSource: str | None = None


class AssistantChatResponse(BaseModel):
    configured: bool
    model: str
    message: str = ""
    responseId: str | None = None
    toolCalls: list[AssistantToolCallResponse] = Field(default_factory=list)
    usage: AssistantUsageSummary | None = None
    error: str | None = None
