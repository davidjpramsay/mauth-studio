import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  editorAnchorActivationPlan,
  editorRevealOpenSignal,
  nextEditorRevealRequest,
  type EditorRevealRequest,
} from "@/lib/editorAnchorActions";

interface NavigationTocItem {
  id: string;
  editorAnchor: string;
  previewAnchor: string;
}

interface PreviewEditClickStart {
  x: number;
  y: number;
  pointerId: number;
}

interface UseEditorNavigationControllerOptions<TTocItem extends NavigationTocItem> {
  editorPaneRef: MutableRefObject<HTMLElement | null>;
  previewPaneRef: MutableRefObject<HTMLElement | null>;
  documentTocItems: TTocItem[];
  showEditor: boolean;
  showPreview: boolean;
  paneMode: "split" | "preview";
  activeQuestionId: string | null;
  activeTocItemId: string;
  previewFitScale: number;
  documentLayoutKey: unknown;
  previewEditClickMoveTolerancePx: number;
  setPaneMode: (mode: "split" | "preview") => void;
  setInspectorOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setActiveTocItemId: (anchor: string) => void;
  setActiveRailItemId: (anchor: string) => void;
  setActiveQuestionId: (questionId: string) => void;
  resetPreviewZoom: () => void;
  scrollToAnchorPosition: (container: HTMLElement, position: { anchor: string; progress: number }) => boolean;
  scrollAnchorFallbacks: (anchor: string) => string[];
  graphChildParentScrollAnchor: (anchor: string) => string | null;
  previewAnchorForEditorAnchor: (anchor: string, items: TTocItem[]) => string;
  previewAnchorFromEventTarget: (target: EventTarget | null, previewPane: HTMLElement | null) => string | null;
  questionIdFromScrollAnchor: (anchor: string) => string | null;
  questionScrollAnchor: (questionId: string) => string;
  scrollAnchorContains: (containerAnchor: string, selectedAnchor?: string | null) => boolean;
}

export function useEditorNavigationController<TTocItem extends NavigationTocItem>({
  editorPaneRef,
  previewPaneRef,
  documentTocItems,
  showEditor,
  showPreview,
  paneMode,
  activeQuestionId,
  activeTocItemId,
  previewFitScale,
  documentLayoutKey,
  previewEditClickMoveTolerancePx,
  setPaneMode,
  setInspectorOpen,
  setActiveTocItemId,
  setActiveRailItemId,
  setActiveQuestionId,
  resetPreviewZoom,
  scrollToAnchorPosition,
  scrollAnchorFallbacks,
  graphChildParentScrollAnchor,
  previewAnchorForEditorAnchor,
  previewAnchorFromEventTarget,
  questionIdFromScrollAnchor,
  questionScrollAnchor,
  scrollAnchorContains,
}: UseEditorNavigationControllerOptions<TTocItem>) {
  const pendingEditorJumpAnchorRef = useRef<string | null>(null);
  const pendingPreviewJumpAnchorRef = useRef<string | null>(null);
  const previewEditClickStartRef = useRef<PreviewEditClickStart | null>(null);
  const [editorRevealRequest, setEditorRevealRequest] = useState<EditorRevealRequest | null>(null);

  function selectQuestionInEditor(questionId: string) {
    if (questionId) setActiveQuestionId(questionId);
  }

  function revealEditorAnchor(anchor: string) {
    const questionId = questionIdFromScrollAnchor(anchor);
    if (questionId) selectQuestionInEditor(questionId);
    setEditorRevealRequest((current) => nextEditorRevealRequest(current, anchor));
  }

  function activateEditorAnchor(anchor: string) {
    const plan = editorAnchorActivationPlan({
      anchor,
      showPreview,
      documentTocItems,
      questionIdFromScrollAnchor,
      graphChildParentScrollAnchor,
      previewAnchorForEditorAnchor,
    });
    if (plan.questionId) selectQuestionInEditor(plan.questionId);
    setActiveTocItemId(plan.activeAnchor);
    setActiveRailItemId(plan.activeAnchor);
    if (plan.previewAnchor) queuePreviewJump(plan.previewAnchor);
  }

  function openSignalForAnchor(anchor: string) {
    return editorRevealOpenSignal(anchor, editorRevealRequest, scrollAnchorContains);
  }

  const jumpPendingDocumentAnchors = useCallback(() => {
    let attemptedJump = false;
    const editorAnchor = pendingEditorJumpAnchorRef.current;
    const previewAnchor = pendingPreviewJumpAnchorRef.current;

    if (editorAnchor && showEditor && editorPaneRef.current) {
      attemptedJump = true;
      if (scrollToAnchorPosition(editorPaneRef.current, { anchor: editorAnchor, progress: 0 })) {
        pendingEditorJumpAnchorRef.current = null;
      }
    }

    if (previewAnchor && showPreview && previewPaneRef.current) {
      attemptedJump = true;
      if (scrollToAnchorPosition(previewPaneRef.current, { anchor: previewAnchor, progress: 0 })) {
        pendingPreviewJumpAnchorRef.current = null;
      }
    }

    return attemptedJump;
  }, [editorPaneRef, previewPaneRef, scrollToAnchorPosition, showEditor, showPreview]);

  function schedulePendingDocumentJump() {
    window.requestAnimationFrame(() => {
      if (!jumpPendingDocumentAnchors()) {
        window.requestAnimationFrame(() => {
          jumpPendingDocumentAnchors();
        });
      }
    });
  }

  useLayoutEffect(() => {
    if (!pendingEditorJumpAnchorRef.current && !pendingPreviewJumpAnchorRef.current) return;

    let firstFrame = 0;
    let secondFrame = 0;
    let retryFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (!jumpPendingDocumentAnchors()) {
          retryFrame = window.requestAnimationFrame(() => {
            jumpPendingDocumentAnchors();
          });
        }
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.cancelAnimationFrame(retryFrame);
    };
  }, [activeQuestionId, activeTocItemId, documentLayoutKey, editorRevealRequest?.sequence, jumpPendingDocumentAnchors, previewFitScale]);

  useLayoutEffect(() => {
    const editorPane = editorPaneRef.current;
    if (!editorPane || !showEditor) return;

    editorPane.scrollLeft = 0;
    const keepEditorPinnedLeft = () => {
      if (editorPane.scrollLeft !== 0) editorPane.scrollLeft = 0;
    };
    editorPane.addEventListener("scroll", keepEditorPinnedLeft, { passive: true });
    return () => editorPane.removeEventListener("scroll", keepEditorPinnedLeft);
  }, [editorPaneRef, showEditor]);

  function clearPendingDocumentJumps() {
    pendingEditorJumpAnchorRef.current = null;
    pendingPreviewJumpAnchorRef.current = null;
  }

  function queueDocumentJump(editorAnchor: string, previewAnchor: string, options: { preservePaneMode?: boolean } = {}) {
    pendingEditorJumpAnchorRef.current = options.preservePaneMode && !showEditor ? null : editorAnchor;
    pendingPreviewJumpAnchorRef.current = options.preservePaneMode && !showPreview ? null : previewAnchor;

    if (!options.preservePaneMode && (!showEditor || !showPreview)) {
      setPaneMode("split");
    }

    schedulePendingDocumentJump();
  }

  function queueEditorJump(editorAnchor: string) {
    pendingEditorJumpAnchorRef.current = editorAnchor;
    pendingPreviewJumpAnchorRef.current = null;
    schedulePendingDocumentJump();
  }

  function queuePreviewJump(previewAnchor: string) {
    pendingPreviewJumpAnchorRef.current = previewAnchor;
    schedulePendingDocumentJump();
  }

  function tocItemForPreviewAnchor(anchor: string) {
    for (const fallback of scrollAnchorFallbacks(anchor)) {
      const item = documentTocItems.find((tocItem) => tocItem.previewAnchor === fallback || tocItem.editorAnchor === fallback);
      if (item) return item;
    }
    return null;
  }

  function openEditorFromPreviewAnchor(anchor: string) {
    if (!anchor) return;
    const tocItem = tocItemForPreviewAnchor(anchor);
    const graphChildParentAnchor = graphChildParentScrollAnchor(anchor);
    const graphChildSuffix =
      graphChildParentAnchor && anchor.startsWith(`${graphChildParentAnchor}/`) ? anchor.slice(graphChildParentAnchor.length) : "";
    const editorAnchor =
      graphChildSuffix && tocItem?.editorAnchor ? `${tocItem.editorAnchor}${graphChildSuffix}` : (tocItem?.editorAnchor ?? anchor);
    const activeAnchor = graphChildSuffix ? editorAnchor : (tocItem?.id ?? editorAnchor);
    const questionId = questionIdFromScrollAnchor(editorAnchor);
    if (questionId) selectQuestionInEditor(questionId);
    setActiveTocItemId(activeAnchor);
    setActiveRailItemId(activeAnchor);
    if (!showEditor) {
      setPaneMode("split");
    }
    revealEditorAnchor(editorAnchor);
    queueEditorJump(editorAnchor);
  }

  function handlePreviewPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!showEditor || event.button !== 0) {
      previewEditClickStartRef.current = null;
      return;
    }
    previewEditClickStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
  }

  function handlePreviewClick(event: ReactMouseEvent<HTMLElement>) {
    const start = previewEditClickStartRef.current;
    previewEditClickStartRef.current = null;
    if (!showEditor || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (!start) return;

    const movement = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (movement > previewEditClickMoveTolerancePx) return;

    const anchor = previewAnchorFromEventTarget(event.target, previewPaneRef.current);
    if (!anchor) return;
    openEditorFromPreviewAnchor(anchor);
  }

  function jumpToTocItem(item: TTocItem) {
    setActiveTocItemId(item.id);
    setActiveRailItemId(item.id);
    const questionId = questionIdFromScrollAnchor(item.editorAnchor);
    if (questionId) selectQuestionInEditor(questionId);
    revealEditorAnchor(item.editorAnchor);
    queueDocumentJump(item.editorAnchor, item.previewAnchor);
  }

  function jumpPreviewToTocItem(item: TTocItem) {
    setActiveRailItemId(item.id);
    const questionId = questionIdFromScrollAnchor(item.editorAnchor);

    if (showEditor) {
      setActiveTocItemId(item.id);
      if (questionId) selectQuestionInEditor(questionId);
      revealEditorAnchor(item.editorAnchor);
    }

    if (!showPreview) {
      return;
    }

    pendingPreviewJumpAnchorRef.current = item.previewAnchor;

    const previewPane = previewPaneRef.current;
    if (previewPane && scrollToAnchorPosition(previewPane, { anchor: item.previewAnchor, progress: 0 })) {
      pendingPreviewJumpAnchorRef.current = null;
      return;
    }

    window.requestAnimationFrame(() => {
      const nextPreviewPane = previewPaneRef.current;
      if (nextPreviewPane && scrollToAnchorPosition(nextPreviewPane, { anchor: item.previewAnchor, progress: 0 })) {
        pendingPreviewJumpAnchorRef.current = null;
      }
    });
  }

  function selectPageBreakInRail(item: TTocItem) {
    setActiveRailItemId(item.id);
    clearPendingDocumentJumps();
  }

  function toggleEditorAtTocItem(item: TTocItem) {
    if (showEditor) {
      setPaneMode("preview");
      return;
    }

    jumpToTocItem(item);
  }

  function jumpPreviewToQuestion(questionId: string) {
    const anchor = questionScrollAnchor(questionId);
    setActiveTocItemId(anchor);
    setActiveRailItemId(anchor);
    selectQuestionInEditor(questionId);
    pendingPreviewJumpAnchorRef.current = anchor;

    if (!showPreview) {
      setPaneMode("split");
      return;
    }

    const previewPane = previewPaneRef.current;
    if (previewPane && scrollToAnchorPosition(previewPane, { anchor, progress: 0 })) {
      pendingPreviewJumpAnchorRef.current = null;
      return;
    }

    window.requestAnimationFrame(() => {
      const nextPreviewPane = previewPaneRef.current;
      if (nextPreviewPane && scrollToAnchorPosition(nextPreviewPane, { anchor, progress: 0 })) {
        pendingPreviewJumpAnchorRef.current = null;
      }
    });
  }

  function toggleManualPane() {
    const nextPaneMode = paneMode === "split" ? "preview" : "split";
    resetPreviewZoom();
    setPaneMode(nextPaneMode);
  }

  function toggleInspectorPane() {
    if (!showEditor) {
      resetPreviewZoom();
      setInspectorOpen(true);
      setPaneMode("split");
      return;
    }

    setInspectorOpen((current) => !current);
  }

  return {
    selectQuestionInEditor,
    activateEditorAnchor,
    revealEditorAnchor,
    openSignalForAnchor,
    clearPendingDocumentJumps,
    queueDocumentJump,
    queueEditorJump,
    queuePreviewJump,
    handlePreviewPointerDown,
    handlePreviewClick,
    jumpToTocItem,
    jumpPreviewToTocItem,
    selectPageBreakInRail,
    toggleEditorAtTocItem,
    jumpPreviewToQuestion,
    toggleManualPane,
    toggleInspectorPane,
  };
}
