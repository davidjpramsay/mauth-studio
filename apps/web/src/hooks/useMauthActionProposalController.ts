import { useState } from "react";

import type { MauthDocumentAction, MauthDocumentActionResult, MauthQuestionLike } from "@/lib/mauthActions";

interface UseMauthActionProposalControllerOptions<
  TQuestion extends MauthQuestionLike,
  TFrontMatter extends object,
  TFormatting extends object,
> {
  parseActions: (source: string) => MauthDocumentAction[];
  previewActions: (actions: MauthDocumentAction[]) => MauthDocumentActionResult<TQuestion, TFrontMatter, TFormatting>;
  applyActions: (actions: MauthDocumentAction[]) => MauthDocumentActionResult<TQuestion, TFrontMatter, TFormatting>;
}

export function useMauthActionProposalController<
  TQuestion extends MauthQuestionLike,
  TFrontMatter extends object,
  TFormatting extends object,
>({ parseActions, previewActions, applyActions }: UseMauthActionProposalControllerOptions<TQuestion, TFrontMatter, TFormatting>) {
  const [actionProposalOpen, setActionProposalOpen] = useState(false);
  const [actionProposalText, setActionProposalText] = useState("");
  const [actionProposalMessage, setActionProposalMessage] = useState("");
  const [actionProposalResult, setActionProposalResult] = useState<MauthDocumentActionResult<TQuestion, TFrontMatter, TFormatting> | null>(
    null,
  );

  function readActionProposalActions(): MauthDocumentAction[] | null {
    try {
      return parseActions(actionProposalText);
    } catch (error) {
      setActionProposalResult(null);
      setActionProposalMessage(error instanceof Error ? error.message : "Invalid action proposal JSON.");
      return null;
    }
  }

  function previewActionProposal() {
    const actions = readActionProposalActions();
    if (!actions) return;
    const result = previewActions(actions);
    setActionProposalResult(result);
    setActionProposalMessage(
      result.ok && result.preview?.valid
        ? `Dry run valid: ${result.preview.requestedActionCount} action${result.preview.requestedActionCount === 1 ? "" : "s"} checked.`
        : result.error || result.preview?.error || "Dry run found an issue.",
    );
  }

  function applyActionProposal() {
    const actions = readActionProposalActions();
    if (!actions) return;
    const previewResult = previewActions(actions);
    setActionProposalResult(previewResult);
    if (!previewResult.ok || !previewResult.preview?.valid) {
      setActionProposalMessage(previewResult.error || previewResult.preview?.error || "Dry run failed. Nothing was applied.");
      return;
    }

    const result = applyActions(actions);
    setActionProposalResult({ ...result, preview: previewResult.preview });
    setActionProposalMessage(
      result.ok
        ? `Applied ${actions.length} action${actions.length === 1 ? "" : "s"}${result.changedIds.length ? `, changed ${result.changedIds.length} item${result.changedIds.length === 1 ? "" : "s"}` : ""}.`
        : result.error || "Action proposal failed. Nothing was applied.",
    );
  }

  function clearActionProposal() {
    setActionProposalText("");
    setActionProposalMessage("");
    setActionProposalResult(null);
  }

  function clearActionProposalFeedback() {
    setActionProposalMessage("");
    setActionProposalResult(null);
  }

  return {
    actionProposalOpen,
    setActionProposalOpen,
    actionProposalText,
    setActionProposalText,
    actionProposalMessage,
    actionProposalResult,
    previewActionProposal,
    applyActionProposal,
    clearActionProposal,
    clearActionProposalFeedback,
  };
}
