export type DropPlacement = "before" | "after" | "inside";
export type MoveDirection = -1 | 1;

export type TocItemKind =
  | "title"
  | "investigationPage"
  | "investigationText"
  | "investigationRubric"
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
  showInvestigationControls: boolean;
  questionItemLabel: "question" | "heading";
  sectionItemPresentation: "section" | "titlePage";
  contextMenuSurface: "miniToc";
}

export function documentNavigationShowsTeacherRubric(isInvestigationTemplate: boolean, item: Pick<DocumentTocItem, "kind">) {
  return isInvestigationTemplate && item.kind === "investigationRubric";
}

export function documentNavigationRailItems(
  items: DocumentTocItem[],
  sectionItemPresentation: DocumentNavigationPresentationPlan["sectionItemPresentation"],
) {
  const topLevelItems = items.filter(
    (item) =>
      item.kind === "title" ||
      item.kind === "investigationPage" ||
      item.kind === "investigationRubric" ||
      item.kind === "sectionHeading" ||
      (item.kind === "question" && item.depth === 0),
  );
  if (sectionItemPresentation !== "titlePage") return topLevelItems;

  if (!topLevelItems.some((item) => item.kind === "sectionHeading")) return topLevelItems;
  return topLevelItems.filter((item) => item.kind !== "title");
}

export function activeDocumentNavigationRailItemId(items: DocumentTocItem[], railItems: DocumentTocItem[], activeItemId: string) {
  if (railItems.some((item) => item.id === activeItemId)) return activeItemId;
  const activeIndex = items.findIndex((item) => item.id === activeItemId);
  if (activeIndex === -1) return activeItemId;

  for (let index = activeIndex; index >= 0; index -= 1) {
    const item = items[index];
    if (
      item.kind === "title" ||
      item.kind === "investigationPage" ||
      item.kind === "sectionHeading" ||
      (item.kind === "question" && item.depth === 0)
    ) {
      if (railItems.some((railItem) => railItem.id === item.id)) return item.id;
      return railItems.find((railItem) => railItem.previewAnchor === item.previewAnchor)?.id ?? item.id;
    }
  }

  return activeItemId;
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
    showInvestigationControls: isInvestigationTemplate,
    questionItemLabel: isNotesTemplate ? "heading" : "question",
    sectionItemPresentation: isStandardTestTemplate ? "titlePage" : "section",
    contextMenuSurface: "miniToc",
  };
}
