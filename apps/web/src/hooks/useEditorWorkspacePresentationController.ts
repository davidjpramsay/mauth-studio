import { useDeferredValue, useMemo, type MutableRefObject } from "react";
import type { FormattingConfig } from "@mauth-studio/shared";

import { usePreviewZoomController } from "@/hooks/usePreviewZoomController";
import { buildDocumentToc, questionMarks, type BuildDocumentTocOptions } from "@/lib/editorDocumentToc";
import type { DocumentFlowItem, DocumentSectionHeading, EditorContentBlock, QuestionBlock } from "@/lib/editorDocumentNormalization";
import {
  activePreviewAnchorForTocItem,
  editorAppShellGridStyle,
  editorWorkspaceGridStyle,
  editorWorkspaceVisibility,
  type EditorPaneMode,
} from "@/lib/editorWorkspacePresentation";
import type { FrontMatterConfig } from "@/lib/frontMatterConfig";
import type { LogoAsset } from "@/lib/logoLibrary";
import { pageFormatFromConfig } from "@/lib/previewPageFormat";
import { previewAnchorForEditorAnchor } from "@/lib/scrollAnchors";

interface UseEditorWorkspacePresentationControllerOptions {
  frontMatter: FrontMatterConfig;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  formattingConfig: FormattingConfig;
  logos: LogoAsset[];
  paneMode: EditorPaneMode;
  inspectorOpen: boolean;
  tocOpen: boolean;
  activeTocItemId: string;
  effectiveShowSolutions: boolean;
  previewPaneRef: MutableRefObject<HTMLElement | null>;
  normalizeDocumentFlow: BuildDocumentTocOptions["normalizeDocumentFlow"];
  tocBlockSummary: (block: EditorContentBlock) => string;
}

export function useEditorWorkspacePresentationController({
  frontMatter,
  questions,
  sectionHeadings,
  documentFlow,
  formattingConfig,
  logos,
  paneMode,
  inspectorOpen,
  tocOpen,
  activeTocItemId,
  effectiveShowSolutions,
  previewPaneRef,
  normalizeDocumentFlow,
  tocBlockSummary,
}: UseEditorWorkspacePresentationControllerOptions) {
  const previewFrontMatter = useDeferredValue(frontMatter);
  const previewQuestions = useDeferredValue(questions);
  const previewSectionHeadings = useDeferredValue(sectionHeadings);
  const previewDocumentFlow = useDeferredValue(documentFlow);
  const previewFormattingConfig = useDeferredValue(formattingConfig);
  const previewLogos = useDeferredValue(logos);
  const totalMarks = useMemo(() => questions.reduce((sum, question) => sum + questionMarks(question), 0), [questions]);
  const previewTotalMarks = useMemo(() => previewQuestions.reduce((sum, question) => sum + questionMarks(question), 0), [previewQuestions]);
  const { showEditor, showPreview, showInspectorPane } = editorWorkspaceVisibility(paneMode, inspectorOpen);
  const currentPageFormat = useMemo(() => pageFormatFromConfig(formattingConfig), [formattingConfig]);
  const { previewFitScale, previewLayoutScale, resetPreviewZoom } = usePreviewZoomController({
    previewPaneRef,
    currentPageFormat,
    showPreview,
  });
  const workspaceStyle = useMemo(() => editorWorkspaceGridStyle(paneMode, showInspectorPane), [paneMode, showInspectorPane]);
  const appShellStyle = useMemo(() => editorAppShellGridStyle(tocOpen), [tocOpen]);
  const documentTocItems = useMemo(
    () =>
      buildDocumentToc({
        frontMatter,
        questions,
        sectionHeadings,
        documentFlow,
        showSolutions: effectiveShowSolutions,
        normalizeDocumentFlow,
        tocBlockSummary,
      }),
    [documentFlow, effectiveShowSolutions, frontMatter, normalizeDocumentFlow, questions, sectionHeadings, tocBlockSummary],
  );
  const activePreviewAnchor = useMemo(
    () => activePreviewAnchorForTocItem(activeTocItemId, documentTocItems, previewAnchorForEditorAnchor),
    [activeTocItemId, documentTocItems],
  );

  return {
    previewFrontMatter,
    previewQuestions,
    previewSectionHeadings,
    previewDocumentFlow,
    previewFormattingConfig,
    previewLogos,
    totalMarks,
    previewTotalMarks,
    showEditor,
    showPreview,
    showInspectorPane,
    previewFitScale,
    previewLayoutScale,
    resetPreviewZoom,
    workspaceStyle,
    appShellStyle,
    documentTocItems,
    activePreviewAnchor,
  };
}
