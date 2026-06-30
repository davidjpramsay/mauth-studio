import { useCallback, useLayoutEffect, useRef } from "react";

interface NewDocumentResult<TDocument> {
  document: TDocument;
  activeQuestionId: string;
  anchor: string;
  cleanFingerprint?: string | null;
}

interface StarterDocumentResult<TDocument> {
  document: TDocument;
  activeQuestionId: string;
  anchor: string;
  markSeeded: () => void;
}

interface UseNewDocumentControllerOptions<TTemplate, TStarterChangeKey, TDocument> {
  storageHydrated: boolean;
  editorDocumentOpen: boolean;
  starterChangeKey: TStarterChangeKey;
  shouldSeedStarter: () => boolean;
  createStarterDocument: () => StarterDocumentResult<TDocument>;
  createTemplateDocument: (template: TTemplate) => NewDocumentResult<TDocument>;
  setDocument: (document: TDocument) => void;
  setDocumentOpen: (open: boolean) => void;
  setCleanUnsavedDocumentFingerprint: (fingerprint: string | null) => void;
  clearActiveProjectFileState: () => void;
  setActiveQuestionId: (questionId: string) => void;
  setActiveTocItemId: (anchor: string) => void;
  setActiveRailItemId: (anchor: string) => void;
  pushHistory: () => void;
  clearTransientEditorState: () => void;
  closeNewDocumentDialog: () => void;
  closeFileManager: () => void;
  queueDocumentJump: (editorAnchor: string, previewAnchor: string) => void;
}

export function useNewDocumentController<TTemplate, TStarterChangeKey, TDocument>(
  options: UseNewDocumentControllerOptions<TTemplate, TStarterChangeKey, TDocument>,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { storageHydrated, editorDocumentOpen, starterChangeKey } = options;

  const activateDocument = useCallback((result: NewDocumentResult<TDocument> | StarterDocumentResult<TDocument>, openDocument: boolean) => {
    const { setDocument, setDocumentOpen, clearActiveProjectFileState, setActiveQuestionId, setActiveTocItemId, setActiveRailItemId } =
      optionsRef.current;
    setDocument(result.document);
    if (openDocument) setDocumentOpen(true);
    clearActiveProjectFileState();
    setActiveQuestionId(result.activeQuestionId);
    setActiveTocItemId(result.anchor);
    setActiveRailItemId(result.anchor);
  }, []);

  useLayoutEffect(() => {
    if (!storageHydrated || !editorDocumentOpen) return;
    const { shouldSeedStarter, createStarterDocument } = optionsRef.current;
    if (!shouldSeedStarter()) return;

    const starterDocument = createStarterDocument();
    activateDocument(starterDocument, false);
    starterDocument.markSeeded();
  }, [activateDocument, editorDocumentOpen, starterChangeKey, storageHydrated]);

  function createNewDocumentFromTemplate(template: TTemplate) {
    const {
      createTemplateDocument,
      pushHistory,
      setCleanUnsavedDocumentFingerprint,
      clearTransientEditorState,
      closeNewDocumentDialog,
      closeFileManager,
      queueDocumentJump,
    } = optionsRef.current;
    pushHistory();
    const newDocument = createTemplateDocument(template);
    activateDocument(newDocument, true);
    setCleanUnsavedDocumentFingerprint(newDocument.cleanFingerprint ?? null);
    clearTransientEditorState();
    closeNewDocumentDialog();
    closeFileManager();
    queueDocumentJump(newDocument.anchor, newDocument.anchor);
  }

  return { createNewDocumentFromTemplate };
}
