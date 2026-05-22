import type { AssistantToolOutput } from "./api.ts";

export type MauthAssistantToolStatusTone = "tool-success" | "tool-warning" | "tool-error";

export interface MauthAssistantToolStatusMessage {
  content: string;
  tone: MauthAssistantToolStatusTone;
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

export function assistantTerminalToolStatusMessage(toolOutput: AssistantToolOutput): MauthAssistantToolStatusMessage | null {
  const output = assistantToolOutputRecord(toolOutput);
  const toolName = toolNameForOutput(toolOutput);
  if (output?.ok !== true || !LOCAL_TERMINAL_TOOL_NAMES.has(toolName)) return null;
  const semanticReview = asRecord(output.semanticReview);
  if (semanticReview?.required === true) return null;
  const status = output.committedDocument === true ? "committed changes" : "completed";
  const detail = outputDetail(output) || "Completed the edit.";
  return { tone: "tool-success", content: statusContent(toolName, status, detail) };
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
        },
      ];
    }

    if (output.ok !== true) {
      const committed = output.committedDocument === true;
      return [
        {
          tone: committed ? ("tool-warning" as const) : ("tool-error" as const),
          content: statusContent(
            toolName,
            committed ? "committed changes, but needs repair" : "did not commit changes",
            outputDetail(output) || "The local tool failed before the assistant could continue.",
          ),
        },
      ];
    }

    const semanticReview = asRecord(output.semanticReview);
    if (semanticReview?.required === true) {
      return [
        {
          tone: "tool-warning" as const,
          content: statusContent(
            toolName,
            "committed changes and requested review before declaring the edit complete",
            semanticReviewDetail(output),
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
        };
      }

      return {
        tone: "tool-error",
        content: finalStatusContent(toolName, "I did not apply that edit through", detail),
      };
    }

    const semanticReview = asRecord(output.semanticReview);
    if (semanticReview?.required === true) {
      return {
        tone: "tool-warning",
        content: finalStatusContent(
          toolName,
          "I applied changes with",
          `They need review before this can be treated as complete. ${semanticReviewDetail(output)}`,
        ),
      };
    }
  }

  return null;
}
