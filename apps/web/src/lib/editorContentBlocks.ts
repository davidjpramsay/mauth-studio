import type { ColumnCount, ContentBlock, ContentBlockVisibility, GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_SOLUTION_SLOT_LINES, DEFAULT_SOLUTION_SLOT_TEXT, DEFAULT_SOLUTION_SPACE_SHOW_LINES } from "./solutionSlotDefaults.ts";
import type { SolutionInsertionBlockKind } from "./solutionBlockVisibility.ts";

export interface EditorContentBlockFactoryOptions {
  id: (prefix: string) => string;
  defaultGraphConfig: GraphConfig;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
  diagramTypePatch: (type: string, current: GraphConfig) => Partial<GraphConfig>;
}

export function contentBlockVisibilityFields(visibility?: ContentBlockVisibility) {
  if (!visibility) return {};
  return {
    visibility,
    ...(visibility === "solution" ? { solutionOnly: true } : {}),
    ...(visibility === "student" ? { studentOnly: true } : {}),
  };
}

export function createEditorContentBlockFactory({
  id,
  defaultGraphConfig,
  withGraphDefaults,
  updateGraphConfig,
  diagramTypePatch,
}: EditorContentBlockFactoryOptions) {
  function textBlock(text = "", visibilityOrSolutionOnly?: ContentBlockVisibility | boolean): ContentBlock {
    const visibility = visibilityOrSolutionOnly === true ? "solution" : visibilityOrSolutionOnly || undefined;
    return {
      id: id(visibility === "solution" ? "solution" : "text"),
      kind: "text",
      text,
      ...contentBlockVisibilityFields(visibility),
    };
  }

  function choiceListBlock(choices: string[] = ["", "", ""], visibility?: ContentBlockVisibility): ContentBlock {
    return {
      id: id(visibility === "solution" ? "solution-choices" : "choices"),
      kind: "choices",
      choices,
      numberingStyle: "roman",
      layout: "vertical",
      ...contentBlockVisibilityFields(visibility),
    };
  }

  function tableBlock(visibility?: ContentBlockVisibility): ContentBlock {
    return {
      id: id(visibility === "solution" ? "solution-table" : "table"),
      kind: "table",
      headers: ["", "", ""],
      rows: [
        ["x", "0", "1"],
        ["P(X=x)", "$1-p$", "$p$"],
      ],
      showHeader: false,
      tableAlign: "center",
      cellAlignment: "center",
      ...contentBlockVisibilityFields(visibility),
    };
  }

  function diagramBlock(graphConfig: GraphConfig = defaultGraphConfig, visibility?: ContentBlockVisibility): ContentBlock {
    return {
      id: id(visibility === "solution" ? "solution-diagram" : "diagram"),
      kind: "diagram",
      diagramAlign: "center",
      graphConfig: withGraphDefaults(graphConfig),
      ...contentBlockVisibilityFields(visibility),
    };
  }

  function diagramBlockForType(type: string, visibility?: ContentBlockVisibility): ContentBlock {
    const baseConfig = withGraphDefaults(defaultGraphConfig);
    return diagramBlock(updateGraphConfig(baseConfig, diagramTypePatch(type, baseConfig)), visibility);
  }

  function spaceBlock(lines = 3, visibility: ContentBlockVisibility = "student"): Extract<ContentBlock, { kind: "space" }> {
    return { id: id("space"), kind: "space", lines, ...contentBlockVisibilityFields(visibility) };
  }

  function columnsBlock(columnCount: ColumnCount = 2, visibility?: ContentBlockVisibility): ContentBlock {
    return {
      id: id(visibility === "solution" ? "solution-columns" : "columns"),
      kind: "columns",
      columnCount,
      columns: Array.from({ length: columnCount }, () => [textBlock("", visibility)]),
      ...contentBlockVisibilityFields(visibility),
    };
  }

  function solutionSlotBlocks(lines = DEFAULT_SOLUTION_SLOT_LINES): ContentBlock[] {
    return [studentSpaceBlock(lines), solutionTextBlock()];
  }

  function solutionTextBlock(): ContentBlock {
    return textBlock(DEFAULT_SOLUTION_SLOT_TEXT, "solution");
  }

  function studentSpaceBlock(lines = 3): Extract<ContentBlock, { kind: "space" }> {
    return { ...spaceBlock(lines, "student"), showLines: DEFAULT_SOLUTION_SPACE_SHOW_LINES };
  }

  function contentBlockForKind(kind: SolutionInsertionBlockKind, visibility?: ContentBlockVisibility): ContentBlock {
    if (kind === "choices") return choiceListBlock(undefined, visibility);
    if (kind === "table") return tableBlock(visibility);
    if (kind === "diagram") return diagramBlock(undefined, visibility);
    if (kind === "columns") return columnsBlock(undefined, visibility);
    if (kind === "space") return spaceBlock(undefined, visibility ?? "student");
    return textBlock("", visibility);
  }

  return {
    textBlock,
    choiceListBlock,
    tableBlock,
    diagramBlock,
    diagramBlockForType,
    spaceBlock,
    columnsBlock,
    solutionSlotBlocks,
    solutionTextBlock,
    studentSpaceBlock,
    contentBlockForKind,
  };
}
