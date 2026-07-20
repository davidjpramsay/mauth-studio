export interface AppOverlayPresentationInput {
  solutionValidationOpen: boolean;
  actionProposalOpen: boolean;
  printPreviewMounted: boolean;
  editorDocumentOpen: boolean;
}

export interface AppOverlayPresentationPlan {
  showSolutionValidation: boolean;
  showActionProposal: boolean;
  showPrintPreview: boolean;
}

export function appOverlayPresentationPlan({
  solutionValidationOpen,
  actionProposalOpen,
  printPreviewMounted,
  editorDocumentOpen,
}: AppOverlayPresentationInput): AppOverlayPresentationPlan {
  return {
    showSolutionValidation: solutionValidationOpen,
    showActionProposal: actionProposalOpen,
    showPrintPreview: printPreviewMounted && editorDocumentOpen,
  };
}

export function applyActionProposalTextChange(nextValue: string, setValue: (value: string) => void, clearFeedback: () => void) {
  setValue(nextValue);
  clearFeedback();
}
