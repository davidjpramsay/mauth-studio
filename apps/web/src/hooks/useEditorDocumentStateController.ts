import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { useEditorHistoryController } from "@/hooks/useEditorHistoryController";

export interface EditorDocumentSnapshot<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormattingConfig> {
  frontMatter: TFrontMatter;
  questions: TQuestion[];
  sectionHeadings: TSectionHeading[];
  documentFlow: TDocumentFlow[];
  formattingConfig: TFormattingConfig;
}

interface EditorDocumentPatch<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormattingConfig> {
  frontMatter: TFrontMatter;
  questions: TQuestion[];
  sectionHeadings?: TSectionHeading[];
  documentFlow?: TDocumentFlow[];
  formattingConfig?: TFormattingConfig;
}

interface UseEditorDocumentStateControllerOptions<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormattingConfig, TSnapshot> {
  historyLimit: number;
  initialFrontMatter: TFrontMatter;
  initialQuestions: TQuestion[];
  initialSectionHeadings: TSectionHeading[];
  initialDocumentFlow: TDocumentFlow[];
  initialFormattingConfig: TFormattingConfig;
  initialDocumentOpen: boolean;
  normalizeQuestions: (questions: TQuestion[]) => TQuestion[];
  normalizeSectionHeadings: (sectionHeadings?: TSectionHeading[]) => TSectionHeading[];
  normalizeDocumentFlow: (
    documentFlow: TDocumentFlow[] | undefined,
    questions: TQuestion[],
    sectionHeadings: TSectionHeading[],
  ) => TDocumentFlow[];
  normalizeFormattingConfig: (formattingConfig?: TFormattingConfig) => TFormattingConfig;
  documentFlowFromQuestionChange: (
    previousQuestions: TQuestion[],
    nextQuestions: TQuestion[],
    sectionHeadings: TSectionHeading[],
    documentFlow: TDocumentFlow[],
  ) => TDocumentFlow[];
  getActiveQuestionId: () => string;
  getActiveTocItemId: () => string;
  existingOrFirstQuestionId: (questions: TQuestion[], activeQuestionId: string) => string;
  questionScrollAnchor: (questionId: string) => string;
  frontMatterAnchor: string;
  firstDocumentFlowAnchor: (documentFlow: TDocumentFlow[], questions: TQuestion[]) => string;
  sectionHeadingIdFromScrollAnchor: (anchor: string) => string | null | undefined;
  questionIdFromScrollAnchor: (anchor: string) => string | null | undefined;
  setActiveQuestionId: Dispatch<SetStateAction<string>>;
  setActiveTocItemId: Dispatch<SetStateAction<string>>;
  setActiveRailItemId: Dispatch<SetStateAction<string>>;
  onRestoreSnapshotExtra?: (snapshot: TSnapshot) => void;
  clearTransientEditorState?: () => void;
}

export function useEditorDocumentStateController<
  TFrontMatter,
  TQuestion,
  TSectionHeading,
  TDocumentFlow,
  TFormattingConfig,
  TSnapshot extends EditorDocumentSnapshot<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormattingConfig>,
>({
  historyLimit,
  initialFrontMatter,
  initialQuestions,
  initialSectionHeadings,
  initialDocumentFlow,
  initialFormattingConfig,
  initialDocumentOpen,
  normalizeQuestions,
  normalizeSectionHeadings,
  normalizeDocumentFlow,
  normalizeFormattingConfig,
  documentFlowFromQuestionChange,
  getActiveQuestionId,
  getActiveTocItemId,
  existingOrFirstQuestionId,
  questionScrollAnchor,
  frontMatterAnchor,
  firstDocumentFlowAnchor,
  sectionHeadingIdFromScrollAnchor,
  questionIdFromScrollAnchor,
  setActiveQuestionId,
  setActiveTocItemId,
  setActiveRailItemId,
  onRestoreSnapshotExtra,
  clearTransientEditorState,
}: UseEditorDocumentStateControllerOptions<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormattingConfig, TSnapshot>) {
  const [frontMatter, setFrontMatter] = useState<TFrontMatter>(() => initialFrontMatter);
  const [formattingConfig, setFormattingConfig] = useState<TFormattingConfig>(() => initialFormattingConfig);
  const [editorDocumentOpen, setEditorDocumentOpen] = useState(initialDocumentOpen);
  const [questions, setQuestions] = useState<TQuestion[]>(() => initialQuestions);
  const [sectionHeadings, setSectionHeadings] = useState<TSectionHeading[]>(() => initialSectionHeadings);
  const [documentFlow, setDocumentFlow] = useState<TDocumentFlow[]>(() => initialDocumentFlow);

  const frontMatterRef = useRef(frontMatter);
  const formattingConfigRef = useRef(formattingConfig);
  const questionsRef = useRef(questions);
  const sectionHeadingsRef = useRef(sectionHeadings);
  const documentFlowRef = useRef(documentFlow);
  const editorDocumentOpenRef = useRef(editorDocumentOpen);

  function setEditorDocumentOpenState(open: boolean) {
    editorDocumentOpenRef.current = open;
    setEditorDocumentOpen(open);
  }

  function currentEditorSnapshot(): TSnapshot {
    return {
      frontMatter: frontMatterRef.current,
      questions: questionsRef.current,
      sectionHeadings: sectionHeadingsRef.current,
      documentFlow: documentFlowRef.current,
      formattingConfig: formattingConfigRef.current,
    } as TSnapshot;
  }

  function restoreEditorSnapshot(snapshot: TSnapshot) {
    const activeQuestionId = getActiveQuestionId();
    const activeTocItemId = getActiveTocItemId();
    const nextActiveQuestionId = existingOrFirstQuestionId(snapshot.questions, activeQuestionId);
    const nextSectionHeadings = normalizeSectionHeadings(snapshot.sectionHeadings);
    const nextDocumentFlow = normalizeDocumentFlow(snapshot.documentFlow, snapshot.questions, nextSectionHeadings);

    onRestoreSnapshotExtra?.(snapshot);

    setFrontMatter(snapshot.frontMatter);
    setQuestions(snapshot.questions);
    setSectionHeadings(nextSectionHeadings);
    setDocumentFlow(nextDocumentFlow);
    setFormattingConfig(snapshot.formattingConfig);
    frontMatterRef.current = snapshot.frontMatter;
    questionsRef.current = snapshot.questions;
    sectionHeadingsRef.current = nextSectionHeadings;
    documentFlowRef.current = nextDocumentFlow;
    formattingConfigRef.current = snapshot.formattingConfig;

    if (nextActiveQuestionId !== activeQuestionId) {
      const nextAnchor = nextActiveQuestionId ? questionScrollAnchor(nextActiveQuestionId) : frontMatterAnchor;
      setActiveQuestionId(nextActiveQuestionId);
      setActiveTocItemId(nextAnchor);
      setActiveRailItemId(nextAnchor);
    } else {
      const activeTocSectionHeadingId = sectionHeadingIdFromScrollAnchor(activeTocItemId);
      if (activeTocSectionHeadingId && !nextSectionHeadings.some((heading) => headingId(heading) === activeTocSectionHeadingId)) {
        const nextAnchor = firstDocumentFlowAnchor(nextDocumentFlow, snapshot.questions);
        setActiveTocItemId(nextAnchor);
        setActiveRailItemId(nextAnchor);
      }
      const activeTocQuestionId = questionIdFromScrollAnchor(activeTocItemId);
      if (activeTocQuestionId && !snapshot.questions.some((question) => questionId(question) === activeTocQuestionId)) {
        const nextAnchor = nextActiveQuestionId ? questionScrollAnchor(nextActiveQuestionId) : frontMatterAnchor;
        setActiveTocItemId(nextAnchor);
        setActiveRailItemId(nextAnchor);
      }
    }

    clearTransientEditorState?.();
  }

  const { canUndo, canRedo, pushEditorHistory, undoEdit, redoEdit } = useEditorHistoryController<TSnapshot>({
    historyLimit,
    currentSnapshot: currentEditorSnapshot,
    restoreSnapshot: restoreEditorSnapshot,
  });

  function setQuestionsWithHistory(updater: TQuestion[] | ((current: TQuestion[]) => TQuestion[])) {
    pushEditorHistory();
    const previousQuestions = questionsRef.current;
    const nextQuestions = typeof updater === "function" ? updater(previousQuestions) : updater;
    const nextFlow = documentFlowFromQuestionChange(previousQuestions, nextQuestions, sectionHeadingsRef.current, documentFlowRef.current);
    questionsRef.current = nextQuestions;
    documentFlowRef.current = nextFlow;
    setQuestions(nextQuestions);
    setDocumentFlow(nextFlow);
  }

  function currentEditorDocument() {
    return currentEditorSnapshot();
  }

  function setEditorDocument(document: EditorDocumentPatch<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormattingConfig>) {
    const nextFormattingConfig = normalizeFormattingConfig(document.formattingConfig);
    const previousQuestions = questionsRef.current;
    const nextQuestions = normalizeQuestions(document.questions);
    const nextSectionHeadings = normalizeSectionHeadings(document.sectionHeadings ?? sectionHeadingsRef.current);
    const nextDocumentFlow = documentFlowFromQuestionChange(
      previousQuestions,
      nextQuestions,
      nextSectionHeadings,
      document.documentFlow ?? documentFlowRef.current,
    );
    setFrontMatter(document.frontMatter);
    setQuestions(nextQuestions);
    setSectionHeadings(nextSectionHeadings);
    setDocumentFlow(nextDocumentFlow);
    setFormattingConfig(nextFormattingConfig);
    frontMatterRef.current = document.frontMatter;
    questionsRef.current = nextQuestions;
    sectionHeadingsRef.current = nextSectionHeadings;
    documentFlowRef.current = nextDocumentFlow;
    formattingConfigRef.current = nextFormattingConfig;
  }

  function setEditorDocumentWithHistory(
    document: EditorDocumentPatch<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormattingConfig>,
  ) {
    pushEditorHistory();
    setEditorDocument(document);
  }

  function setSectionFlowWithHistory(nextSectionHeadings: TSectionHeading[], nextDocumentFlow: TDocumentFlow[]) {
    const normalizedHeadings = normalizeSectionHeadings(nextSectionHeadings);
    const normalizedFlow = normalizeDocumentFlow(nextDocumentFlow, questionsRef.current, normalizedHeadings);
    pushEditorHistory();
    sectionHeadingsRef.current = normalizedHeadings;
    documentFlowRef.current = normalizedFlow;
    setSectionHeadings(normalizedHeadings);
    setDocumentFlow(normalizedFlow);
  }

  useLayoutEffect(() => {
    frontMatterRef.current = frontMatter;
    formattingConfigRef.current = formattingConfig;
    questionsRef.current = questions;
    sectionHeadingsRef.current = sectionHeadings;
    documentFlowRef.current = documentFlow;
    editorDocumentOpenRef.current = editorDocumentOpen;
  }, [documentFlow, editorDocumentOpen, formattingConfig, frontMatter, questions, sectionHeadings]);

  return {
    frontMatter,
    setFrontMatter,
    formattingConfig,
    setFormattingConfig,
    editorDocumentOpen,
    setEditorDocumentOpen,
    setEditorDocumentOpenState,
    questions,
    setQuestions,
    sectionHeadings,
    setSectionHeadings,
    documentFlow,
    setDocumentFlow,
    frontMatterRef,
    formattingConfigRef,
    questionsRef,
    sectionHeadingsRef,
    documentFlowRef,
    editorDocumentOpenRef,
    currentEditorSnapshot,
    currentEditorDocument,
    restoreEditorSnapshot,
    setEditorDocument,
    setQuestionsWithHistory,
    setEditorDocumentWithHistory,
    setSectionFlowWithHistory,
    canUndo,
    canRedo,
    pushEditorHistory,
    undoEdit,
    redoEdit,
  };
}

function headingId<TSectionHeading>(heading: TSectionHeading) {
  return typeof heading === "object" && heading !== null && "id" in heading ? String(heading.id) : "";
}

function questionId<TQuestion>(question: TQuestion) {
  return typeof question === "object" && question !== null && "id" in question ? String(question.id) : "";
}
