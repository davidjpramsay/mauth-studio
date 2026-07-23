export type DropPlacement = "before" | "after" | "inside";
export type MoveDirection = -1 | 1;

export type TocItemKind =
  | "title"
  | "sectionHeading"
  | "question"
  | "pageBreak"
  | "text"
  | "choices"
  | "table"
  | "diagram"
  | "columns"
  | "space"
  | "part"
  | "subpart";

export interface QuestionDropPreview {
  questionId: string;
  placement: Exclude<DropPlacement, "inside">;
  surface?: "question" | "pageBreakBoundary";
}

export interface PageBreakDropPreview {
  questionId: string;
  placement: Exclude<DropPlacement, "inside">;
}

export interface DocumentTocItem {
  id: string;
  label: string;
  summary?: string;
  kind: TocItemKind;
  depth: number;
  editorAnchor: string;
  previewAnchor: string;
}

export interface DocumentNavigationPresentationPlan {
  showExpandedNavigator: boolean;
  showStructureControls: boolean;
  questionItemLabel: "question" | "heading";
  sectionItemPresentation: "section" | "titlePage";
  contextMenuSurface: "miniToc";
}

export function documentNavigationRailItems(
  items: DocumentTocItem[],
  sectionItemPresentation: DocumentNavigationPresentationPlan["sectionItemPresentation"],
) {
  const topLevelItems = items.filter(
    (item) => item.kind === "title" || item.kind === "sectionHeading" || (item.kind === "question" && item.depth === 0),
  );
  if (sectionItemPresentation !== "titlePage") return topLevelItems;

  if (!topLevelItems.some((item) => item.kind === "sectionHeading")) return topLevelItems;
  return topLevelItems.filter((item) => item.kind !== "title");
}

export function documentNavigationPresentationPlan({
  open,
  isNotesTemplate,
  isStandardTestTemplate,
  isInvestigationTemplate = false,
}: {
  open: boolean;
  isNotesTemplate: boolean;
  isStandardTestTemplate: boolean;
  isInvestigationTemplate?: boolean;
}): DocumentNavigationPresentationPlan {
  return {
    showExpandedNavigator: open,
    showStructureControls: !isInvestigationTemplate,
    questionItemLabel: isNotesTemplate ? "heading" : "question",
    sectionItemPresentation: isStandardTestTemplate ? "titlePage" : "section",
    contextMenuSurface: "miniToc",
  };
}
