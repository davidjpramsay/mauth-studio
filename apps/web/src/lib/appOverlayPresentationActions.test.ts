import assert from "node:assert/strict";
import test from "node:test";

import { appOverlayPresentationPlan, applyActionProposalTextChange } from "./appOverlayPresentation.ts";

test("overlay presentation keeps independent panels visible and gates print preview on an open document", () => {
  assert.deepEqual(
    appOverlayPresentationPlan({
      solutionValidationOpen: true,
      actionProposalOpen: false,
      printPreviewMounted: true,
      editorDocumentOpen: true,
    }),
    {
      showSolutionValidation: true,
      showActionProposal: false,
      showPrintPreview: true,
    },
  );

  assert.equal(
    appOverlayPresentationPlan({
      solutionValidationOpen: false,
      actionProposalOpen: true,
      printPreviewMounted: true,
      editorDocumentOpen: false,
    }).showPrintPreview,
    false,
  );
});

test("proposal text changes clear stale preview feedback after updating the draft", () => {
  const events: string[] = [];

  applyActionProposalTextChange(
    '{"actions":[]}',
    (value) => events.push(`set:${value}`),
    () => events.push("clear"),
  );

  assert.deepEqual(events, ['set:{"actions":[]}', "clear"]);
});
