import { useEffect, useState } from "react";
import type { ProjectFileSummary } from "@mauth-studio/shared";

import {
  getAssistantStatus,
  sendAssistantChat,
  type AssistantAttachment,
  type AssistantChatMessage,
  type AssistantProviderToolCall,
  type AssistantToolOutput,
  type AssistantUsageSummary,
} from "@/lib/api";
import {
  runMauthAssistantAdapterTool,
  type MauthAssistantAdapterHost,
  type MauthAssistantAdapterResult,
  type MauthAssistantAdapterToolCall,
} from "@/lib/mauthAssistantAdapter";
import type { MauthQuestionLike } from "@/lib/mauthActions";
import type { MauthAssistantChatMessage } from "@/components/assistant/MauthAssistantPanel";

const ASSISTANT_MAX_TOOL_ROUNDS = 4;
const ASSISTANT_MAX_ATTACHMENTS = 4;
const ASSISTANT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ASSISTANT_DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ASSISTANT_TEXT_ATTACHMENT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".tex", ".yaml", ".yml"]);
const ASSISTANT_PAUSED_MESSAGE = "I paused before applying more changes. Ask me to continue if you want me to keep going.";
const ASSISTANT_OLD_PAUSED_MESSAGE_PREFIX = "I stopped after several tool rounds.";

interface AssistantPendingToolContinuation {
  responseId: string | null;
  toolCalls: AssistantProviderToolCall[];
}

interface AssistantToolLoopResult {
  responseId: string | null;
  usage: AssistantUsageSummary | null;
  pending: AssistantPendingToolContinuation | null;
}

interface UseMauthAssistantControllerOptions<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>> {
  previewModeActive: boolean;
  openPreviewMode: () => void;
  createHost: () => MauthAssistantAdapterHost<Q, F, C>;
  onFileToolStart?: (toolName: string) => void;
  onFileToolComplete?: () => void;
  onFileToolError?: () => void;
}

function assistantMessageId() {
  return `assistant-message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assistantAttachmentId() {
  return `assistant-attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assistantFileExtension(fileName: string) {
  const normalizedName = fileName.toLowerCase();
  const dotIndex = normalizedName.lastIndexOf(".");
  return dotIndex === -1 ? "" : normalizedName.slice(dotIndex);
}

function supportedAssistantAttachment(file: File) {
  const extension = assistantFileExtension(file.name);
  return (
    file.type.startsWith("image/") ||
    file.type === "application/pdf" ||
    file.type === ASSISTANT_DOCX_MIME_TYPE ||
    file.type.startsWith("text/") ||
    extension === ".pdf" ||
    extension === ".docx" ||
    ASSISTANT_TEXT_ATTACHMENT_EXTENSIONS.has(extension)
  );
}

function assistantAttachmentMimeType(file: File) {
  if (file.type) return file.type;
  const extension = assistantFileExtension(file.name);
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".docx") return ASSISTANT_DOCX_MIME_TYPE;
  if (extension === ".json") return "application/json";
  if (extension === ".csv") return "text/csv";
  if (ASSISTANT_TEXT_ATTACHMENT_EXTENSIONS.has(extension)) return "text/plain";
  return "application/octet-stream";
}

function readAssistantAttachment(file: File): Promise<AssistantAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`Could not read ${file.name}.`));
        return;
      }
      resolve({
        id: assistantAttachmentId(),
        name: file.name,
        mimeType: assistantAttachmentMimeType(file),
        dataUrl: reader.result,
        sizeBytes: file.size,
      });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function assistantResultMessage<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  result: MauthAssistantAdapterResult<Q, F, C>,
) {
  if (!result.ok) return result.error || "Tool failed.";
  const data = asRecord(result.data);
  if (result.toolName === "mauth.document.inspect") {
    const counts = asRecord(data?.counts);
    const questionsCount = typeof counts?.questions === "number" ? counts.questions : 0;
    const marksTotal = typeof counts?.marksTotal === "number" ? counts.marksTotal : 0;
    return `Inspected ${questionsCount} question${questionsCount === 1 ? "" : "s"} and ${marksTotal} mark${marksTotal === 1 ? "" : "s"}.`;
  }
  if (result.toolName === "mauth.validation.run") {
    return result.warnings.length
      ? `Validation completed with ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}.`
      : "Validation completed with no warnings.";
  }
  if (result.toolName === "mauth.actions.preview") {
    const preview = asRecord(data?.preview);
    const requested = typeof preview?.requestedActionCount === "number" ? preview.requestedActionCount : result.changedIds.length;
    return `Previewed ${requested} action${requested === 1 ? "" : "s"}.`;
  }
  if (result.toolName === "mauth.actions.apply") {
    return `Applied changes to ${result.changedIds.length} item${result.changedIds.length === 1 ? "" : "s"}.`;
  }
  if (result.toolName === "mauth.author.replaceQuestion") {
    return result.changedIds.length ? "Replaced the question." : "Question authoring completed.";
  }
  if (result.toolName === "mauth.author.addDiagram") {
    return result.changedIds.length ? "Added the diagram." : "Diagram authoring completed.";
  }
  if (result.toolName === "mauth.author.ensureSolutions") {
    return result.changedIds.length ? "Updated the solutions." : "Solution authoring completed.";
  }
  if (result.toolName === "mauth.author.adjustResponseSpaces") {
    return result.changedIds.length ? "Updated the answer space." : "Answer-space update completed.";
  }
  if (result.toolName === "mauth.files.list") {
    const files = Array.isArray(data?.files) ? data.files : (result.files ?? []);
    return `Listed ${files.length} file${files.length === 1 ? "" : "s"} or folder${files.length === 1 ? "" : "s"}.`;
  }
  if (result.changedPaths.length) {
    return `Changed ${result.changedPaths.length} path${result.changedPaths.length === 1 ? "" : "s"}.`;
  }
  return "Tool completed.";
}

function mergeAssistantUsageSummary(
  current: AssistantUsageSummary | null | undefined,
  next: AssistantUsageSummary | null | undefined,
): AssistantUsageSummary | null {
  if (!current) return next ?? null;
  if (!next) return current;
  const currentCost = typeof current.estimatedCostUsd === "number" ? current.estimatedCostUsd : null;
  const nextCost = typeof next.estimatedCostUsd === "number" ? next.estimatedCostUsd : null;
  return {
    model: current.model === next.model ? current.model : `${current.model} + ${next.model}`,
    inputTokens: current.inputTokens + next.inputTokens,
    cachedInputTokens: current.cachedInputTokens + next.cachedInputTokens,
    billableInputTokens: current.billableInputTokens + next.billableInputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    totalTokens: current.totalTokens + next.totalTokens,
    estimatedCostUsd: currentCost === null || nextCost === null ? null : currentCost + nextCost,
    pricingSource: current.pricingSource === next.pricingSource ? current.pricingSource : current.pricingSource || next.pricingSource,
  };
}

function addUsageToLastAssistantMessage(messages: MauthAssistantChatMessage[], usage: AssistantUsageSummary): MauthAssistantChatMessage[] {
  const nextMessages = [...messages];
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index];
    if (message.role === "assistant") {
      nextMessages[index] = { ...message, usage };
      return nextMessages;
    }
  }
  return [...messages, { id: assistantMessageId(), role: "assistant", content: "Done.", usage }];
}

function assistantToolCallFromProvider(toolCall: AssistantProviderToolCall): MauthAssistantAdapterToolCall | null {
  const mauthToolName =
    typeof toolCall.mauthToolName === "string" ? toolCall.mauthToolName : toolCall.name.startsWith("mauth.") ? toolCall.name : "";
  if (!mauthToolName) return null;
  return {
    name: mauthToolName as MauthAssistantAdapterToolCall["name"],
    arguments: toolCall.mauthArguments ?? toolCall.arguments ?? {},
  } as MauthAssistantAdapterToolCall;
}

function assistantActivityLabelForTool(name: MauthAssistantAdapterToolCall["name"]) {
  if (name === "mauth.document.inspect") return "Inspecting document";
  if (name === "mauth.validation.run") return "Checking document";
  if (name === "mauth.actions.preview") return "Previewing changes";
  if (name === "mauth.actions.apply") return "Applying changes";
  if (name === "mauth.author.replaceQuestion") return "Writing question";
  if (name === "mauth.author.addDiagram") return "Adding diagram";
  if (name === "mauth.author.ensureSolutions") return "Writing solutions";
  if (name === "mauth.author.adjustResponseSpaces") return "Adjusting answer space";
  if (name === "mauth.files.list") return "Reading files";
  if (name === "mauth.files.open") return "Opening file";
  if (name === "mauth.files.save" || name === "mauth.files.saveAs") return "Saving file";
  if (name.startsWith("mauth.files.")) return "Updating files";
  return "Using Mauth tools";
}

function compactAssistantProviderOutput<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  result: MauthAssistantAdapterResult<Q, F, C>,
): Record<string, unknown> {
  const data = asRecord(result.data);
  const preview = asRecord(data?.preview);
  const validation = asRecord(data?.validation);
  const files = result.files ?? (Array.isArray(data?.files) ? data.files : undefined);
  const output: Record<string, unknown> = {
    ok: result.ok,
    toolName: result.toolName,
    kind: result.kind,
    message: assistantResultMessage(result),
    changedIds: result.changedIds,
    changedPaths: result.changedPaths,
    warnings: result.warnings.map((warning) => ({ code: warning.code, message: warning.message })),
    error: result.error ?? null,
    committedDocument: result.committedDocument,
    activeFilePath: result.activeFilePath ?? null,
  };

  if (result.toolName === "mauth.document.inspect") output.documentSummary = result.data ?? null;
  if (result.toolName === "mauth.validation.run") output.validation = result.data ?? null;
  if (Array.isArray(data?.validationIssues)) output.validationIssues = data.validationIssues;
  if (preview) output.preview = preview;
  if (validation) output.validation = validation;
  if (files) {
    output.files = files
      .filter((file): file is ProjectFileSummary => asRecord(file) !== null)
      .map((file) => ({
        path: file.path,
        name: file.name,
        kind: file.kind,
        fileType: file.fileType,
        updatedAt: file.updatedAt,
      }));
  }

  return output;
}

function toolOutputRecord(toolOutput: AssistantToolOutput) {
  return asRecord(toolOutput.output);
}

function failedToolOutputs(toolOutputs: readonly AssistantToolOutput[]) {
  return toolOutputs.filter((toolOutput) => toolOutputRecord(toolOutput)?.ok === false);
}

function failedToolOutputMessage(toolOutput: AssistantToolOutput) {
  const output = toolOutputRecord(toolOutput);
  const message = typeof output?.message === "string" ? output.message : "";
  const error = typeof output?.error === "string" ? output.error : "";
  return error || message || "That edit step failed.";
}

function terminalFailedToolMessage(toolOutputs: readonly AssistantToolOutput[]) {
  const failed = failedToolOutputs(toolOutputs);
  if (!failed.length) return "";
  const firstMessage = failedToolOutputMessage(failed[0]);
  const remaining = failed.length - 1;
  const suffix = remaining > 0 ? ` ${remaining} other edit step${remaining === 1 ? "" : "s"} also failed.` : "";
  return `I could not apply that edit after one repair attempt. ${firstMessage}${suffix}`;
}

export function useMauthAssistantController<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>({
  previewModeActive,
  openPreviewMode,
  createHost,
  onFileToolStart,
  onFileToolComplete,
  onFileToolError,
}: UseMauthAssistantControllerOptions<Q, F, C>) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatAttachments, setChatAttachments] = useState<AssistantAttachment[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [chatMessages, setChatMessages] = useState<MauthAssistantChatMessage[]>([]);
  const [chatRunning, setChatRunning] = useState(false);
  const [activityLabel, setActivityLabel] = useState("Thinking");
  const [activityStartedAt, setActivityStartedAt] = useState<number | null>(null);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const [providerStatusMessage, setProviderStatusMessage] = useState("Checking assistant provider");
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(null);
  const [pendingToolContinuation, setPendingToolContinuation] = useState<AssistantPendingToolContinuation | null>(null);

  useEffect(() => {
    if (!panelOpen) return;

    let cancelled = false;
    setProviderStatusMessage("Checking assistant provider");

    getAssistantStatus()
      .then((status) => {
        if (cancelled) return;
        setProviderConfigured(status.configured);
        setProviderStatusMessage(
          status.configured
            ? `Connected to ${status.provider} (${status.model})`
            : `Assistant provider missing ${status.missingSetting ?? "configuration"}`,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setProviderConfigured(false);
        setProviderStatusMessage(error instanceof Error ? error.message : "Assistant provider is unavailable.");
      });

    return () => {
      cancelled = true;
    };
  }, [panelOpen]);

  useEffect(() => {
    if (!previewModeActive && panelOpen) {
      setPanelOpen(false);
    }
  }, [panelOpen, previewModeActive]);

  function togglePanel() {
    setPanelOpen((current) => {
      const nextOpen = !current;
      if (nextOpen && !previewModeActive) openPreviewMode();
      return nextOpen;
    });
  }

  async function addChatAttachments(files: File[]) {
    if (!files.length || chatRunning) return;
    setAttachmentNotice("");

    const accepted: File[] = [];
    const rejected: string[] = [];
    let totalBytes = chatAttachments.reduce((sum, attachment) => sum + (attachment.sizeBytes ?? 0), 0);

    for (const file of files) {
      if (!supportedAssistantAttachment(file)) {
        rejected.push(`${file.name} is not a supported image, PDF, Word, or text file.`);
        continue;
      }
      if (file.size > ASSISTANT_MAX_ATTACHMENT_BYTES) {
        rejected.push(`${file.name} is larger than 10 MB.`);
        continue;
      }
      if (chatAttachments.length + accepted.length >= ASSISTANT_MAX_ATTACHMENTS) {
        rejected.push(`Only ${ASSISTANT_MAX_ATTACHMENTS} attachments can be sent at once.`);
        break;
      }
      if (totalBytes + file.size > ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES) {
        rejected.push("Attachments are limited to 20 MB per request.");
        break;
      }
      accepted.push(file);
      totalBytes += file.size;
    }

    if (rejected.length) setAttachmentNotice(rejected.join(" "));
    if (!accepted.length) return;

    try {
      const attachments = await Promise.all(accepted.map(readAssistantAttachment));
      setChatAttachments((current) => [...current, ...attachments]);
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : "Could not read attachment.");
    }
  }

  function removeChatAttachment(id: string) {
    setChatAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  async function assistantDocumentSummary(host: MauthAssistantAdapterHost<Q, F, C>) {
    setActivityLabel("Inspecting document");
    const result = await runMauthAssistantAdapterTool(host, { name: "mauth.document.inspect", arguments: {} });
    return result.ok ? (asRecord(result.data) ?? null) : null;
  }

  async function runAssistantProviderToolCall(
    host: MauthAssistantAdapterHost<Q, F, C>,
    toolCall: AssistantProviderToolCall,
  ): Promise<AssistantToolOutput> {
    const call = assistantToolCallFromProvider(toolCall);
    if (!call) {
      return {
        callId: toolCall.callId,
        name: toolCall.name,
        output: {
          ok: false,
          error: `Unsupported assistant tool call: ${toolCall.name}`,
        },
      };
    }

    setActivityLabel(assistantActivityLabelForTool(call.name));
    if (call.name.startsWith("mauth.files.")) {
      onFileToolStart?.(call.name);
    }

    const result = await runMauthAssistantAdapterTool(host, call);

    return {
      callId: toolCall.callId,
      name: toolCall.name,
      output: compactAssistantProviderOutput(result),
    };
  }

  function localTerminalAssistantToolMessage(toolOutput: AssistantToolOutput) {
    const output = asRecord(toolOutput.output);
    const toolName = typeof output?.toolName === "string" ? output.toolName : "";
    if (output?.ok !== true) return "";
    if (
      toolName !== "mauth.author.replaceQuestion" &&
      toolName !== "mauth.author.addDiagram" &&
      toolName !== "mauth.author.ensureSolutions" &&
      toolName !== "mauth.author.adjustResponseSpaces"
    ) {
      return "";
    }
    return typeof output?.message === "string" && output.message.trim() ? output.message.trim() : "Completed the edit.";
  }

  async function continueToolLoop(
    host: MauthAssistantAdapterHost<Q, F, C>,
    initialResponseId: string | null,
    initialToolCalls: AssistantProviderToolCall[],
  ): Promise<AssistantToolLoopResult> {
    let responseId = initialResponseId;
    let toolCalls = initialToolCalls;
    let rounds = 0;
    let totalUsage: AssistantUsageSummary | null = null;
    let repairAttemptUsed = false;

    while (toolCalls.length && rounds < ASSISTANT_MAX_TOOL_ROUNDS) {
      rounds += 1;
      const toolOutputs: AssistantToolOutput[] = [];
      for (const toolCall of toolCalls) {
        toolOutputs.push(await runAssistantProviderToolCall(host, toolCall));
      }

      const localMessages = toolOutputs.map(localTerminalAssistantToolMessage).filter(Boolean);
      if (localMessages.length === toolOutputs.length) {
        setChatMessages((current) => [
          ...current,
          ...localMessages.map((message) => ({ id: assistantMessageId(), role: "assistant" as const, content: message })),
        ]);
        setPendingToolContinuation(null);
        setPreviousResponseId(null);
        return { responseId: null, usage: totalUsage, pending: null };
      }

      if (failedToolOutputs(toolOutputs).length) {
        if (repairAttemptUsed) {
          setPendingToolContinuation(null);
          setPreviousResponseId(null);
          setChatMessages((current) => [
            ...current,
            { id: assistantMessageId(), role: "assistant", content: terminalFailedToolMessage(toolOutputs) },
          ]);
          return { responseId: null, usage: totalUsage, pending: null };
        }
        repairAttemptUsed = true;
      }

      const documentSummary = await assistantDocumentSummary(host);
      setActivityLabel("Thinking");
      const response = await sendAssistantChat({
        previousResponseId: responseId,
        toolOutputs,
        documentSummary,
      });

      responseId = response.responseId ?? responseId;
      totalUsage = mergeAssistantUsageSummary(totalUsage, response.usage);
      if (response.message.trim()) {
        setChatMessages((current) => [...current, { id: assistantMessageId(), role: "assistant", content: response.message.trim() }]);
      }
      toolCalls = response.toolCalls;
    }

    if (toolCalls.length) {
      const pending = { responseId, toolCalls };
      setPendingToolContinuation(pending);
      setPreviousResponseId(null);
      setChatMessages((current) => [
        ...current,
        {
          id: assistantMessageId(),
          role: "assistant",
          content: ASSISTANT_PAUSED_MESSAGE,
        },
      ]);
      return { responseId, usage: totalUsage, pending };
    }

    setPendingToolContinuation(null);
    setPreviousResponseId(responseId);
    return { responseId, usage: totalUsage, pending: null };
  }

  async function sendChatMessage() {
    const userContent = chatInput.trim();
    if ((!userContent && !chatAttachments.length) || chatRunning) return;
    const requestAttachments = [...chatAttachments];
    const displayedUserContent = userContent || "Use the attached file(s).";

    const pendingContinuation = pendingToolContinuation;
    const resumePendingTools = Boolean(pendingContinuation && displayedUserContent.toLowerCase().startsWith("continue"));
    const previousId = pendingContinuation ? null : previousResponseId;
    const priorMessages = chatMessages
      .filter(
        (chatMessage) =>
          !chatMessage.content.startsWith(ASSISTANT_PAUSED_MESSAGE) && !chatMessage.content.startsWith(ASSISTANT_OLD_PAUSED_MESSAGE_PREFIX),
      )
      .slice(-8)
      .map(
        (chatMessage): AssistantChatMessage => ({
          role: chatMessage.role,
          content: chatMessage.content.length > 2000 ? `${chatMessage.content.slice(0, 2000)}...` : chatMessage.content,
        }),
      );
    const outgoingMessages: AssistantChatMessage[] = previousId
      ? [{ role: "user", content: displayedUserContent }]
      : [...priorMessages, { role: "user", content: displayedUserContent }];

    setChatInput("");
    setChatAttachments([]);
    setAttachmentNotice("");
    setChatMessages((current) => [
      ...current,
      { id: assistantMessageId(), role: "user", content: displayedUserContent, attachments: requestAttachments },
    ]);
    setChatRunning(true);
    setActivityLabel(resumePendingTools ? "Continuing" : "Thinking");
    setActivityStartedAt(Date.now());
    setProviderStatusMessage((current) => current || "Assistant working");

    try {
      const host = createHost();
      if (resumePendingTools && pendingContinuation) {
        setPendingToolContinuation(null);
        const loopResult = await continueToolLoop(host, pendingContinuation.responseId, pendingContinuation.toolCalls);
        const resumedUsage = loopResult.usage;
        if (resumedUsage) {
          setChatMessages((current) => addUsageToLastAssistantMessage(current, resumedUsage));
        }
        onFileToolComplete?.();
        return;
      }

      if (pendingContinuation) {
        setPendingToolContinuation(null);
        setPreviousResponseId(null);
      }

      const documentSummary = await assistantDocumentSummary(host);
      setActivityLabel("Thinking");
      const response = await sendAssistantChat({
        previousResponseId: previousId,
        messages: outgoingMessages,
        documentSummary,
        attachments: requestAttachments,
      });

      let requestUsage = response.usage ?? null;
      setProviderConfigured(response.configured);
      if (!response.configured) {
        setProviderStatusMessage(response.error || response.message || "Assistant provider is not configured.");
      }

      const nextResponseId = response.responseId ?? previousId;
      if (response.message.trim()) {
        setChatMessages((current) => [...current, { id: assistantMessageId(), role: "assistant", content: response.message.trim() }]);
      }

      if (response.toolCalls.length) {
        const loopResult = await continueToolLoop(host, nextResponseId, response.toolCalls);
        requestUsage = mergeAssistantUsageSummary(requestUsage, loopResult.usage);
      } else {
        setPendingToolContinuation(null);
        setPreviousResponseId(nextResponseId);
      }

      if (requestUsage) {
        setChatMessages((current) => addUsageToLastAssistantMessage(current, requestUsage));
      }

      onFileToolComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assistant request failed.";
      setProviderConfigured(false);
      setProviderStatusMessage(message);
      setPendingToolContinuation(null);
      setPreviousResponseId(null);
      setChatMessages((current) => [...current, { id: assistantMessageId(), role: "assistant", content: message }]);
      onFileToolError?.();
    } finally {
      setChatRunning(false);
      setActivityStartedAt(null);
      setActivityLabel("Thinking");
    }
  }

  return {
    panelOpen,
    chatInput,
    chatMessages,
    chatAttachments,
    attachmentNotice,
    chatRunning,
    providerConfigured,
    providerStatusMessage,
    activityLabel,
    activityStartedAt,
    setChatInput,
    addChatAttachments,
    removeChatAttachment,
    setPanelOpen,
    togglePanel,
    sendChatMessage,
  };
}
