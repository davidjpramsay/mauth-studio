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
  questionItemLabel: "question" | "heading";
  contextMenuSurface: "miniToc";
}

export function documentNavigationPresentationPlan({
  open,
  isNotesTemplate,
}: {
  open: boolean;
  isNotesTemplate: boolean;
}): DocumentNavigationPresentationPlan {
  return {
    showExpandedNavigator: open,
    questionItemLabel: isNotesTemplate ? "heading" : "question",
    contextMenuSurface: "miniToc",
  };
}
