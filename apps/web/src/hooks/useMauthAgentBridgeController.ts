import type { MauthAgentFileState, MauthAgentOpenDocument, MauthAgentSnapshot } from "@mauth-studio/shared";

import {
  type MauthDocumentAction,
  type MauthDocumentActionResult,
  type MauthDocumentLike,
  type MauthQuestionLike,
} from "@/lib/mauthActions";
import {
  formatMauthActionValidationIssues,
  typedMauthDocumentActions,
  validateMauthDocumentActionPayloads,
} from "@/lib/mauthActionValidation";
import { buildMauthAgentSnapshot } from "@/lib/mauthAgentSnapshot";
import { useMauthAgentBridge, type MauthAgentBridgeHandlerResult } from "@/lib/useMauthAgentBridge";

interface UseMauthAgentBridgeControllerOptions<
  Q extends MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
> {
  enabled: boolean;
  currentDocument: () => MauthDocumentLike<Q, F, C>;
  fileState: (document: MauthDocumentLike<Q, F, C>) => MauthAgentFileState;
  validate: () => unknown;
  warnings?: () => MauthAgentSnapshot["warnings"];
  previewActions: (actions: MauthDocumentAction[]) => MauthDocumentActionResult<Q, F, C>;
  applyActionsWithoutCommit: (actions: MauthDocumentAction[]) => MauthDocumentActionResult<Q, F, C>;
  commitDocument: (document: MauthDocumentLike<Q, F, C>) => void;
  activeFilePath: () => string | null;
  saveAppliedDocument: (filePath: string, document: MauthDocumentLike<Q, F, C>) => Promise<void>;
  saveConflictMessage: (error: unknown, filePath: string) => string;
  activeDocumentId?: () => string | null;
  openDocuments?: () => MauthAgentOpenDocument[];
  activateDocument?: (documentId: string) => Promise<boolean>;
}

function agentBridgeError(status: number, code: string, error: string, extra: Record<string, unknown> = {}): MauthAgentBridgeHandlerResult {
  return {
    status,
    body: { success: false, code, error, ...extra },
  };
}

export function useMauthAgentBridgeController<
  Q extends MauthQuestionLike,
  F extends object = Record<string, unknown>,
  C extends object = Record<string, unknown>,
>({
  enabled,
  currentDocument,
  fileState,
  validate,
  warnings,
  previewActions,
  applyActionsWithoutCommit,
  commitDocument,
  activeFilePath,
  saveAppliedDocument,
  saveConflictMessage,
  activeDocumentId,
  openDocuments,
  activateDocument,
}: UseMauthAgentBridgeControllerOptions<Q, F, C>) {
  function buildCurrentAgentSnapshot(validation: unknown = validate(), document?: MauthDocumentLike<Q, F, C>): MauthAgentSnapshot {
    const current = document ?? currentDocument();
    return buildMauthAgentSnapshot<Q, F, C>({
      document: current,
      file: fileState(current),
      validation,
      warnings: document ? [] : warnings?.(),
      activeDocumentId: activeDocumentId?.(),
      openDocuments: openDocuments?.(),
    });
  }

  async function ensureTargetDocument(payload: Record<string, unknown>): Promise<MauthAgentBridgeHandlerResult | null> {
    const targetId = payload.documentId;
    if (targetId === undefined || targetId === null || targetId === activeDocumentId?.()) return null;
    if (typeof targetId !== "string" || !targetId) {
      return agentBridgeError(400, "INVALID_REQUEST", "documentId must be a non-empty string when provided.");
    }
    if (!activateDocument || !(await activateDocument(targetId))) {
      return agentBridgeError(404, "INVALID_REQUEST", `Open document tab not found: ${targetId}`);
    }
    return null;
  }

  function readAgentDocumentActions(
    payload: Record<string, unknown>,
  ): { ok: true; actions: MauthDocumentAction[] } | { ok: false; response: MauthAgentBridgeHandlerResult } {
    const rawActions = payload.actions;
    if (!Array.isArray(rawActions)) {
      return {
        ok: false,
        response: agentBridgeError(400, "INVALID_REQUEST", "Payload must include actions as an array."),
      };
    }

    const validation = validateMauthDocumentActionPayloads(rawActions);
    if (!validation.ok) {
      return {
        ok: false,
        response: agentBridgeError(400, "VALIDATION_FAILED", formatMauthActionValidationIssues(validation.issues), {
          validationIssues: validation.issues,
          snapshot: buildCurrentAgentSnapshot(),
        }),
      };
    }

    return { ok: true, actions: typedMauthDocumentActions(rawActions) };
  }

  async function handleAgentSnapshot(payload: Record<string, unknown>): Promise<MauthAgentBridgeHandlerResult> {
    const targetError = await ensureTargetDocument(payload);
    if (targetError) return targetError;
    return {
      status: 200,
      body: buildCurrentAgentSnapshot() as unknown as Record<string, unknown>,
    };
  }

  async function handleAgentActionsPreview(payload: Record<string, unknown>): Promise<MauthAgentBridgeHandlerResult> {
    const targetError = await ensureTargetDocument(payload);
    if (targetError) return targetError;
    const parsed = readAgentDocumentActions(payload);
    if (!parsed.ok) return parsed.response;

    const result = previewActions(parsed.actions);
    if (!result.ok || result.preview?.valid === false) {
      return agentBridgeError(400, "ACTION_FAILED", result.error || result.preview?.error || "Action preview failed.", {
        result,
        snapshot: buildCurrentAgentSnapshot(result.validation),
      });
    }

    return {
      status: 200,
      body: {
        success: true,
        result,
        snapshot: buildCurrentAgentSnapshot(result.validation, result.document),
      },
    };
  }

  async function handleAgentActionsApply(payload: Record<string, unknown>): Promise<MauthAgentBridgeHandlerResult> {
    const targetError = await ensureTargetDocument(payload);
    if (targetError) return targetError;
    const baseSnapshotId = payload.baseSnapshotId;
    if (typeof baseSnapshotId !== "string" || !baseSnapshotId) {
      return agentBridgeError(400, "INVALID_REQUEST", "actions.apply requires baseSnapshotId.");
    }

    const parsed = readAgentDocumentActions(payload);
    if (!parsed.ok) return parsed.response;

    const currentSnapshot = buildCurrentAgentSnapshot();
    if (baseSnapshotId !== currentSnapshot.snapshotId) {
      return agentBridgeError(409, "STALE_SNAPSHOT", "Current editor state no longer matches baseSnapshotId.", {
        snapshot: currentSnapshot,
      });
    }

    const result = applyActionsWithoutCommit(parsed.actions);
    if (!result.ok) {
      return agentBridgeError(400, "ACTION_FAILED", result.error || "Action apply failed.", {
        result,
        snapshot: currentSnapshot,
      });
    }

    const filePath = activeFilePath();
    if (result.changedIds.length && filePath) {
      try {
        await saveAppliedDocument(filePath, result.document);
      } catch (error) {
        return agentBridgeError(409, "SAVE_CONFLICT", saveConflictMessage(error, filePath), {
          result,
          snapshot: currentSnapshot,
        });
      }
    }

    if (result.changedIds.length) {
      commitDocument(result.document);
    }

    return {
      status: 200,
      body: {
        success: true,
        result,
        snapshot: buildCurrentAgentSnapshot(result.validation, result.document),
      },
    };
  }

  async function handleAgentValidation(payload: Record<string, unknown>): Promise<MauthAgentBridgeHandlerResult> {
    const targetError = await ensureTargetDocument(payload);
    if (targetError) return targetError;
    const validation = validate();
    return {
      status: 200,
      body: {
        success: true,
        validation,
        snapshot: buildCurrentAgentSnapshot(validation),
      },
    };
  }

  useMauthAgentBridge({
    enabled,
    handlers: {
      snapshot: handleAgentSnapshot,
      preview: handleAgentActionsPreview,
      apply: handleAgentActionsApply,
      validation: handleAgentValidation,
    },
  });
}
