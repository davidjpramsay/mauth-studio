import { tocBlockKind } from "./editorBlockSummaries.ts";
import type { SelectedEditorBlock } from "./editorBlockSelection.ts";
import type { QuestionBlock } from "./editorDocumentNormalization.ts";
import type { DocumentTocItem } from "./documentNavigation.ts";
import {
  graphChildParentScrollAnchor,
  parseScrollAnchor,
  previewAnchorForEditorAnchor,
  questionIdFromScrollAnchor,
  scrollAnchorFallbacks,
} from "./scrollAnchors.ts";

export interface EditorContextDescriptorRuntimeOptions {
  documentTocItems: DocumentTocItem[];
  questions: QuestionBlock[];
  selectedEditorBlockFromAnchor: (questions: QuestionBlock[], anchor: string) => SelectedEditorBlock | null;
  summaryText: (source: string) => string;
}

function tocItemMatchesAnchor(item: DocumentTocItem, anchor: string) {
  return item.id === anchor || item.editorAnchor === anchor || item.previewAnchor === anchor;
}

export function fallbackContextLabel(anchor: string) {
  const parsed = parseScrollAnchor(anchor);
  if (parsed.kind === "frontMatter") return "Title Page";
  if (parsed.kind === "sectionHeading") return "Section heading";
  if (parsed.kind === "pageBreak") return "Page break";
  if (parsed.kind === "question") return "Question";
  if (parsed.kind === "part") return "Part";
  if (parsed.kind === "subpart") return "Subpart";
  if (parsed.blockId) return "Module";
  return "Document item";
}

export function createEditorContextDescriptorRuntime({
  documentTocItems,
  questions,
  selectedEditorBlockFromAnchor,
  summaryText,
}: EditorContextDescriptorRuntimeOptions) {
  function tocItemForContextAnchor(anchor: string) {
    for (const fallback of scrollAnchorFallbacks(anchor)) {
      const item = documentTocItems.find((tocItem) => tocItemMatchesAnchor(tocItem, fallback));
      if (item) return item;
    }
    return null;
  }

  function exactTocItemForAnchor(anchor: string) {
    return documentTocItems.find((tocItem) => tocItemMatchesAnchor(tocItem, anchor)) ?? null;
  }

  function contextDescriptorForAnchor(anchor: string): DocumentTocItem {
    const editorAnchor = graphChildParentScrollAnchor(anchor) ?? anchor;
    const exactItem = exactTocItemForAnchor(editorAnchor);
    if (exactItem) return exactItem;

    const selectedBlock = selectedEditorBlockFromAnchor(questions, editorAnchor);
    if (selectedBlock) {
      return {
        id: editorAnchor,
        label: selectedBlock.label,
        summary: selectedBlock.summary,
        kind: tocBlockKind(selectedBlock.block),
        depth: 0,
        editorAnchor,
        previewAnchor: previewAnchorForEditorAnchor(editorAnchor, documentTocItems),
      };
    }

    const fallbackItem = tocItemForContextAnchor(editorAnchor);
    if (fallbackItem && !editorAnchor.includes("/c:")) return fallbackItem;

    const parsed = parseScrollAnchor(editorAnchor);
    return {
      id: editorAnchor,
      label: fallbackContextLabel(editorAnchor),
      kind: parsed.kind === "pageBreak" ? "pageBreak" : "text",
      depth: 0,
      editorAnchor,
      previewAnchor: previewAnchorForEditorAnchor(editorAnchor, documentTocItems),
    };
  }

  function contextReferenceText(anchor: string) {
    const item = contextDescriptorForAnchor(anchor);
    const questionId = questionIdFromScrollAnchor(item.editorAnchor);
    const questionIndex = questionId ? questions.findIndex((question) => question.id === questionId) : -1;
    const questionLabel = questionIndex >= 0 ? `Question ${questionIndex + 1}` : "";
    const target = questionLabel && item.kind !== "question" ? `${questionLabel} · ${item.label}` : item.label;
    const summary = item.summary ? summaryText(item.summary) : "";
    return [
      `Mauth target: @mauth[${item.editorAnchor}]`,
      `Item: ${target || item.editorAnchor}`,
      item.kind ? `Type: ${item.kind}` : "",
      summary ? `Summary: ${summary}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return {
    contextDescriptorForAnchor,
    contextReferenceText,
    exactTocItemForAnchor,
    tocItemForContextAnchor,
  };
}
