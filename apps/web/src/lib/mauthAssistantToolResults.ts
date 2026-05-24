import type { AssistantToolOutput } from "./api.ts";

export type MauthAssistantToolStatusTone = "tool-success" | "tool-warning" | "tool-error";
export type MauthAssistantToolStatusState = "committed" | "completed" | "preflight-failed" | "needs-repair" | "needs-review" | "unreadable";

export interface MauthAssistantToolStatusSummary {
  label: "Tool result" | "Final status";
  toolName: string;
  state: MauthAssistantToolStatusState;
  stateLabel: string;
  committedDocument: boolean | null;
  commitLabel: string;
  detail: string;
  changedLabel?: string;
}

export interface MauthAssistantToolStatusMessage {
  content: string;
  tone: MauthAssistantToolStatusTone;
  summary: MauthAssistantToolStatusSummary;
}

const LOCAL_TERMINAL_TOOL_NAMES = new Set([
  "mauth.question.upsert",
  "mauth.author.replaceQuestion",
  "mauth.author.addDiagram",
  "mauth.author.ensureSolutions",
  "mauth.author.adjustResponseSpaces",
  "mauth.format.apply",
  "mauth.settings.apply",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function assistantToolOutputRecord(toolOutput: AssistantToolOutput) {
  return asRecord(toolOutput.output);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toolNameForOutput(toolOutput: AssistantToolOutput) {
  const output = assistantToolOutputRecord(toolOutput);
  return stringValue(output?.toolName) || stringValue(toolOutput.name) || "assistant tool";
}

function compactDetail(value: unknown) {
  const text = stringValue(value).replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > 360 ? `${text.slice(0, 357)}...` : text;
}

function outputDetail(output: Record<string, unknown> | null) {
  return compactDetail(output?.error) || compactDetail(output?.message);
}

function semanticReviewDetail(output: Record<string, unknown> | null) {
  const semanticReview = asRecord(output?.semanticReview);
  const checklist = Array.isArray(semanticReview?.checklist) ? semanticReview.checklist : [];
  const firstChecklistItem = checklist.find((item) => typeof item === "string" && item.trim());
  return compactDetail(firstChecklistItem) || outputDetail(output);
}

function statusContent(toolName: string, status: string, detail: string) {
  const suffix = detail ? ` ${detail}` : "";
  return `**Tool result:** \`${toolName}\` ${status}.${suffix}`;
}

function finalStatusContent(toolName: string, message: string, detail: string) {
  const suffix = detail ? ` ${detail}` : "";
  return `**Final status:** ${message} \`${toolName}\`.${suffix}`;
}

function changedLabel(output: Record<string, unknown> | null) {
  const changedIds = Array.isArray(output?.changedIds) ? output.changedIds.length : 0;
  const changedPaths = Array.isArray(output?.changedPaths) ? output.changedPaths.length : 0;
  const parts: string[] = [];
  if (changedIds) parts.push(`${changedIds} item${changedIds === 1 ? "" : "s"}`);
  if (changedPaths) parts.push(`${changedPaths} path${changedPaths === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function commitLabel(committedDocument: boolean | null) {
  if (committedDocument === true) return "Yes";
  if (committedDocument === false) return "No";
  return "Unknown";
}

function statusSummary(
  label: MauthAssistantToolStatusSummary["label"],
  toolName: string,
  state: MauthAssistantToolStatusState,
  stateLabel: string,
  committedDocument: boolean | null,
  detail: string,
  output: Record<string, unknown> | null,
): MauthAssistantToolStatusSummary {
  return {
    label,
    toolName,
    state,
    stateLabel,
    committedDocument,
    commitLabel: commitLabel(committedDocument),
    detail,
    changedLabel: changedLabel(output) || undefined,
  };
}

export function assistantTerminalToolStatusMessage(toolOutput: AssistantToolOutput): MauthAssistantToolStatusMessage | null {
  const output = assistantToolOutputRecord(toolOutput);
  const toolName = toolNameForOutput(toolOutput);
  if (output?.ok !== true || !LOCAL_TERMINAL_TOOL_NAMES.has(toolName)) return null;
  const semanticReview = asRecord(output.semanticReview);
  if (semanticReview?.required === true) return null;
  const status = output.committedDocument === true ? "committed changes" : "completed";
  const detail = outputDetail(output) || "Completed the edit.";
  return {
    tone: "tool-success",
    content: statusContent(toolName, status, detail),
    summary: statusSummary(
      "Tool result",
      toolName,
      output.committedDocument === true ? "committed" : "completed",
      output.committedDocument === true ? "Committed" : "Completed",
      output.committedDocument === true,
      detail,
      output,
    ),
  };
}

export function assistantContinuingToolStatusMessages(toolOutputs: readonly AssistantToolOutput[]): MauthAssistantToolStatusMessage[] {
  return toolOutputs.flatMap((toolOutput) => {
    const output = assistantToolOutputRecord(toolOutput);
    const toolName = toolNameForOutput(toolOutput);
    if (!output) {
      return [
        {
          tone: "tool-error" as const,
          content: statusContent(toolName, "returned an unreadable result", "The local tool output was not an object."),
          summary: statusSummary(
            "Tool result",
            toolName,
            "unreadable",
            "Unreadable",
            null,
            "The local tool output was not an object.",
            null,
          ),
        },
      ];
    }

    if (output.ok !== true) {
      const committed = output.committedDocument === true;
      const detail = outputDetail(output) || "The local tool failed before the assistant could continue.";
      return [
        {
          tone: committed ? ("tool-warning" as const) : ("tool-error" as const),
          content: statusContent(toolName, committed ? "committed changes, but needs repair" : "did not commit changes", detail),
          summary: statusSummary(
            "Tool result",
            toolName,
            committed ? "needs-repair" : "preflight-failed",
            committed ? "Needs repair" : "Preflight failed",
            committed,
            detail,
            output,
          ),
        },
      ];
    }

    const semanticReview = asRecord(output.semanticReview);
    if (semanticReview?.required === true) {
      const detail = semanticReviewDetail(output);
      return [
        {
          tone: "tool-warning" as const,
          content: statusContent(toolName, "committed changes and requested review before declaring the edit complete", detail),
          summary: statusSummary(
            "Tool result",
            toolName,
            "needs-review",
            "Needs review",
            output.committedDocument === true,
            detail,
            output,
          ),
        },
      ];
    }

    return [];
  });
}

export function assistantFinalToolStateMessage(toolOutputs: readonly AssistantToolOutput[]): MauthAssistantToolStatusMessage | null {
  for (const toolOutput of toolOutputs) {
    const output = assistantToolOutputRecord(toolOutput);
    const toolName = toolNameForOutput(toolOutput);
    if (!output) {
      return {
        tone: "tool-error",
        content: finalStatusContent(toolName, "I could not verify the local result from", "The local tool output was not an object."),
        summary: statusSummary(
          "Final status",
          toolName,
          "unreadable",
          "Unreadable",
          null,
          "The local tool output was not an object.",
          null,
        ),
      };
    }

    if (output.ok !== true) {
      const detail = outputDetail(output) || "The local tool failed before the assistant could finish.";
      if (output.committedDocument === true) {
        return {
          tone: "tool-warning",
          content: finalStatusContent(
            toolName,
            "I applied changes with",
            `They need repair before this can be treated as complete. ${detail}`,
          ),
          summary: statusSummary("Final status", toolName, "needs-repair", "Needs repair", true, detail, output),
        };
      }

      return {
        tone: "tool-error",
        content: finalStatusContent(toolName, "I did not apply that edit through", detail),
        summary: statusSummary("Final status", toolName, "preflight-failed", "Preflight failed", false, detail, output),
      };
    }

    const semanticReview = asRecord(output.semanticReview);
    if (semanticReview?.required === true) {
      const detail = semanticReviewDetail(output);
      return {
        tone: "tool-warning",
        content: finalStatusContent(
          toolName,
          "I applied changes with",
          `They need review before this can be treated as complete. ${detail}`,
        ),
        summary: statusSummary("Final status", toolName, "needs-review", "Needs review", output.committedDocument === true, detail, output),
      };
    }
  }

  return null;
}
