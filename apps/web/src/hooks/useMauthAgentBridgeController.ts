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
import { reconcileAgentDraftState } from "@/lib/mauthAgentFileState";
import { afterEditorStateSettles } from "@/lib/mauthAgentBridgeRetry";
import { useMauthAgentBridge, type MauthAgentBridgeHandlerResult } from "@/lib/useMauthAgentBridge";
import { useStableEvent } from "@/hooks/useStableEvent";

export interface MauthAgentDocumentLifecycleHandlers {
  list: (payload: Record<string, unknown>) => MauthAgentBridgeHandlerResult | Promise<MauthAgentBridgeHandlerResult>;
  create: (payload: Record<string, unknown>) => MauthAgentBridgeHandlerResult | Promise<MauthAgentBridgeHandlerResult>;
  open: (payload: Record<string, unknown>) => MauthAgentBridgeHandlerResult | Promise<MauthAgentBridgeHandlerResult>;
  close: (payload: Record<string, unknown>) => MauthAgentBridgeHandlerResult | Promise<MauthAgentBridgeHandlerResult>;
}

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
  documentLifecycle: MauthAgentDocumentLifecycleHandlers;
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
  documentLifecycle,
}: UseMauthAgentBridgeControllerOptions<Q, F, C>) {
  const selectedDocumentId = useStableEvent(() => activeDocumentId?.());

  function buildCurrentAgentSnapshot(validation: unknown = validate(), document?: MauthDocumentLike<Q, F, C>): MauthAgentSnapshot {
    const current = document ?? currentDocument();
    const activeId = activeDocumentId?.();
    const tabs = openDocuments?.();
    const file = fileState(current);
    return buildMauthAgentSnapshot<Q, F, C>({
      document: current,
      file: document
        ? file
        : reconcileAgentDraftState(
            file,
            tabs?.find((tab) => tab.id === activeId),
          ),
      validation,
      warnings: document ? [] : warnings?.(),
      activeDocumentId: activeId,
      openDocuments: tabs,
    });
  }

  async function ensureTargetDocument(payload: Record<string, unknown>): Promise<MauthAgentBridgeHandlerResult | null> {
    const targetId = payload.documentId;
    if (targetId === undefined || targetId === null || targetId === selectedDocumentId()) return null;
    if (typeof targetId !== "string" || !targetId) {
      return agentBridgeError(400, "INVALID_REQUEST", "documentId must be a non-empty string when provided.");
    }
    if (!activateDocument || !(await activateDocument(targetId))) {
      return agentBridgeError(404, "INVALID_REQUEST", `Open document tab not found: ${targetId}`);
    }
    await afterEditorStateSettles();
    if (selectedDocumentId() !== targetId) {
      return agentBridgeError(
        409,
        "DOCUMENT_CHANGED",
        "The selected document changed while preparing this request. Read a fresh snapshot.",
      );
    }
    return null;
  }

  async function withTargetDocument(
    payload: Record<string, unknown>,
    operation: (payload: Record<string, unknown>) => MauthAgentBridgeHandlerResult | Promise<MauthAgentBridgeHandlerResult>,
  ): Promise<MauthAgentBridgeHandlerResult> {
    const targetError = await ensureTargetDocument(payload);
    // Stable operations read the committed render after a tab's document and save state settle.
    return targetError ?? operation(payload);
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

  const handleAgentSnapshot = useStableEvent((): MauthAgentBridgeHandlerResult => {
    return {
      status: 200,
      body: buildCurrentAgentSnapshot() as unknown as Record<string, unknown>,
    };
  });

  const handleAgentActionsPreview = useStableEvent((payload: Record<string, unknown>): MauthAgentBridgeHandlerResult => {
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
  });

  const handleAgentActionsApply = useStableEvent(async (payload: Record<string, unknown>): Promise<MauthAgentBridgeHandlerResult> => {
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
  });

  const handleAgentValidation = useStableEvent((): MauthAgentBridgeHandlerResult => {
    const validation = validate();
    return {
      status: 200,
      body: {
        success: true,
        validation,
        snapshot: buildCurrentAgentSnapshot(validation),
      },
    };
  });

  useMauthAgentBridge({
    enabled,
    handlers: {
      snapshot: (payload) => withTargetDocument(payload, handleAgentSnapshot),
      preview: (payload) => withTargetDocument(payload, handleAgentActionsPreview),
      apply: (payload) => withTargetDocument(payload, handleAgentActionsApply),
      validation: (payload) => withTargetDocument(payload, handleAgentValidation),
      documentsList: documentLifecycle.list,
      documentCreate: documentLifecycle.create,
      documentOpen: documentLifecycle.open,
      documentClose: documentLifecycle.close,
    },
  });
}
