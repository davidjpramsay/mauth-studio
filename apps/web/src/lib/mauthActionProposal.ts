import type { MauthDocumentAction } from "./mauthActions.ts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function strippedJsonProposalSource(source: string) {
  const trimmed = source.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function actionFromUnknown(value: unknown): MauthDocumentAction | null {
  const record = asRecord(value);
  if (!record || typeof record.type !== "string") return null;
  return record as MauthDocumentAction;
}

export function parseMauthDocumentActionProposal(source: string): MauthDocumentAction[] {
  const proposalSource = strippedJsonProposalSource(source);
  if (!proposalSource) throw new Error("Paste a JSON action, an action array, or an object with an actions array.");

  const parsed = JSON.parse(proposalSource) as unknown;
  const proposalRecord = asRecord(parsed);
  const rawActions = Array.isArray(parsed)
    ? parsed
    : Array.isArray(proposalRecord?.actions)
      ? proposalRecord.actions
      : proposalRecord?.action
        ? [proposalRecord.action]
        : [parsed];

  const actions = rawActions.flatMap((action) => {
    const parsedAction = actionFromUnknown(action);
    return parsedAction ? [parsedAction] : [];
  });
  if (actions.length !== rawActions.length) throw new Error("Every proposed action must be an object with a string type.");
  if (!actions.length) throw new Error("No actions found in that proposal.");
  return actions;
}
