export function resolveEditorDocumentFlow<TQuestion, TSectionHeading, TDocumentFlow>({
  previousQuestions,
  nextQuestions,
  sectionHeadings,
  currentDocumentFlow,
  explicitDocumentFlow,
  normalizeDocumentFlow,
  documentFlowFromQuestionChange,
}: {
  previousQuestions: TQuestion[];
  nextQuestions: TQuestion[];
  sectionHeadings: TSectionHeading[];
  currentDocumentFlow: TDocumentFlow[];
  explicitDocumentFlow?: TDocumentFlow[];
  normalizeDocumentFlow: (
    documentFlow: TDocumentFlow[] | undefined,
    questions: TQuestion[],
    sectionHeadings: TSectionHeading[],
  ) => TDocumentFlow[];
  documentFlowFromQuestionChange: (
    previousQuestions: TQuestion[],
    nextQuestions: TQuestion[],
    sectionHeadings: TSectionHeading[],
    documentFlow: TDocumentFlow[],
  ) => TDocumentFlow[];
}) {
  if (explicitDocumentFlow !== undefined) {
    return normalizeDocumentFlow(explicitDocumentFlow, nextQuestions, sectionHeadings);
  }
  return documentFlowFromQuestionChange(previousQuestions, nextQuestions, sectionHeadings, currentDocumentFlow);
}
