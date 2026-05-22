import { AlertTriangle, CircleCheck, CircleX, FileText, ImageIcon, MessageSquare, Paperclip, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantAttachment } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface MauthAssistantChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: AssistantAttachment[];
  usage?: MauthAssistantUsageSummary | null;
  tone?: MauthAssistantChatMessageTone;
}

export type MauthAssistantChatMessageTone = "tool-success" | "tool-warning" | "tool-error";

export interface MauthAssistantUsageSummary {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  billableInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number | null;
  pricingSource?: string | null;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={`${keyPrefix}-code-${match.index}`} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.95em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function assistantMarkdownBlocks(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={`code-${index}`} className="overflow-auto rounded bg-muted p-2 font-mono text-xs leading-relaxed">
          {codeLines.join("\n")}
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (heading) {
      const Tag = heading[1].length === 1 ? "h3" : "h4";
      blocks.push(
        <Tag key={`heading-${index}`} className="mt-3 text-sm font-semibold first:mt-0">
          {renderInlineMarkdown(heading[2], `heading-${index}`)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        const itemText = lines[index].replace(/^\s*[-*]\s+/, "");
        items.push(
          <li key={`li-${index}`} className="pl-1">
            {renderInlineMarkdown(itemText, `li-${index}`)}
          </li>,
        );
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`} className="ml-4 list-disc space-y-1">
          {items}
        </ul>,
      );
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trimStart().startsWith("```") &&
      !/^(#{1,3})\s+/.test(lines[index].trim()) &&
      !/^\s*[-*]\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    const paragraph = paragraphLines.join(" ");
    blocks.push(
      <p key={`p-${index}`} className="leading-relaxed">
        {renderInlineMarkdown(paragraph, `p-${index}`)}
      </p>,
    );
  }

  return blocks;
}

function AssistantMarkdown({ content }: { content: string }) {
  return <div className="space-y-2">{assistantMarkdownBlocks(content)}</div>;
}

function formatAssistantCost(value: number) {
  if (value < 0.0001) return "<$0.0001";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function assistantUsageLabel(usage: MauthAssistantUsageSummary) {
  const costLabel =
    typeof usage.estimatedCostUsd === "number" ? `${formatAssistantCost(usage.estimatedCostUsd)} estimated` : "cost unavailable";
  return `${costLabel} · ${usage.totalTokens.toLocaleString()} tokens`;
}

function AssistantUsageDetails({ usage }: { usage: MauthAssistantUsageSummary }) {
  return (
    <details className="group mt-2 border-t border-border/70 pt-1.5 text-[11px] leading-tight text-muted-foreground">
      <summary className="cursor-pointer select-none list-none rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {assistantUsageLabel(usage)}
      </summary>
      <div className="mt-2 grid gap-1 rounded-lg border bg-background/80 p-2 text-[11px] text-muted-foreground shadow-sm">
        <div className="flex justify-between gap-3">
          <span>Model</span>
          <span className="font-medium text-foreground">{usage.model}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Input</span>
          <span>{usage.inputTokens.toLocaleString()} tokens</span>
        </div>
        {usage.cachedInputTokens ? (
          <div className="flex justify-between gap-3">
            <span>Cached input</span>
            <span>{usage.cachedInputTokens.toLocaleString()} tokens</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <span>Output</span>
          <span>{usage.outputTokens.toLocaleString()} tokens</span>
        </div>
        {usage.pricingSource ? <p className="pt-1 text-[10px] leading-snug">{usage.pricingSource}</p> : null}
      </div>
    </details>
  );
}

function formatAttachmentSize(sizeBytes?: number | null) {
  if (!sizeBytes) return "";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ attachment }: { attachment: AssistantAttachment }) {
  return attachment.mimeType.startsWith("image/") ? (
    <ImageIcon className="size-3.5" aria-hidden="true" />
  ) : (
    <FileText className="size-3.5" aria-hidden="true" />
  );
}

function AttachmentPill({ attachment, onRemove }: { attachment: AssistantAttachment; onRemove?: (id: string) => void }) {
  const sizeLabel = formatAttachmentSize(attachment.sizeBytes);
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background/80 px-2 py-1 text-xs text-foreground">
      <AttachmentIcon attachment={attachment} />
      <span className="truncate">{attachment.name}</span>
      {sizeLabel ? <span className="text-muted-foreground">{sizeLabel}</span> : null}
      {onRemove && attachment.id ? (
        <button
          type="button"
          className="ml-0.5 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Remove ${attachment.name}`}
          onClick={() => onRemove(attachment.id ?? "")}
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

function assistantBubbleClass(tone?: MauthAssistantChatMessageTone) {
  if (tone === "tool-success") return "mr-auto border border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "tool-warning") return "mr-auto border border-amber-200 bg-amber-50 text-amber-950";
  if (tone === "tool-error") return "mr-auto border border-red-200 bg-red-50 text-red-950";
  return "mr-auto bg-muted/45";
}

function AssistantToolStatusIcon({ tone }: { tone?: MauthAssistantChatMessageTone }) {
  if (tone === "tool-success") return <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />;
  if (tone === "tool-warning") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />;
  if (tone === "tool-error") return <CircleX className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden="true" />;
  return null;
}

export function MauthAssistantPanel({
  placement = "floating",
  chatMessages,
  chatInput,
  chatAttachments,
  attachmentNotice,
  chatRunning,
  providerConfigured,
  providerStatusMessage,
  activityLabel = "Working",
  activityStartedAt = null,
  onChatInputChange,
  onAddAttachments,
  onRemoveAttachment,
  onSendChat,
  onClose,
}: {
  placement?: "floating" | "preview-left" | "workspace";
  chatMessages: MauthAssistantChatMessage[];
  chatInput: string;
  chatAttachments: AssistantAttachment[];
  attachmentNotice?: string;
  chatRunning: boolean;
  providerConfigured: boolean | null;
  providerStatusMessage: string;
  activityLabel?: string;
  activityStartedAt?: number | null;
  onChatInputChange: (value: string) => void;
  onAddAttachments: (files: File[]) => void | Promise<void>;
  onRemoveAttachment: (id: string) => void;
  onSendChat: () => void;
  onClose: () => void;
}) {
  const canSend = Boolean(chatInput.trim() || chatAttachments.length) && !chatRunning && providerConfigured !== false;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const statusPopoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const connected = providerConfigured === true;
  const statusTitle = providerStatusMessage || (connected ? "Assistant connected" : "Assistant disconnected");
  const elapsedSeconds = activityStartedAt ? Math.max(0, Math.floor((now - activityStartedAt) / 1000)) : 0;
  const elapsedLabel =
    elapsedSeconds >= 60 ? `${Math.floor(elapsedSeconds / 60)}m ${String(elapsedSeconds % 60).padStart(2, "0")}s` : `${elapsedSeconds}s`;
  const workspacePlacement = placement === "workspace";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages.length, chatRunning]);

  useEffect(() => {
    if (!chatRunning || !activityStartedAt) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activityStartedAt, chatRunning]);

  useEffect(() => {
    if (!statusOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!statusPopoverRef.current?.contains(event.target as Node)) setStatusOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [statusOpen]);

  return (
    <aside
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-background",
        workspacePlacement
          ? "h-full min-h-0 w-full shadow-panel"
          : cn(
              "fixed bottom-4 z-50 shadow-2xl",
              placement === "preview-left"
                ? "left-[4.25rem] top-32 w-[min(38rem,calc(100vw-6rem))]"
                : "right-4 max-h-[min(44rem,calc(100vh-6rem))] w-[min(42rem,calc(100vw-2rem))]",
            ),
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="relative flex min-w-0 items-center gap-2" ref={statusPopoverRef}>
          <button
            type="button"
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              connected ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-red-100 text-red-800 hover:bg-red-200",
            )}
            aria-label={statusTitle}
            aria-expanded={statusOpen}
            onClick={() => setStatusOpen((open) => !open)}
          >
            {connected ? <CircleCheck className="size-4" aria-hidden="true" /> : <CircleX className="size-4" aria-hidden="true" />}
          </button>
          {statusOpen ? (
            <div className="bg-popover text-popover-foreground absolute left-0 top-full z-10 mt-2 w-72 rounded-xl border p-3 text-xs shadow-xl">
              <div className="flex items-center gap-2 font-semibold">
                {connected ? (
                  <CircleCheck className="size-4 text-emerald-700" aria-hidden="true" />
                ) : (
                  <CircleX className="size-4 text-red-700" aria-hidden="true" />
                )}
                {connected ? "Assistant connected" : "Assistant disconnected"}
              </div>
              <p className="mt-2 leading-relaxed text-muted-foreground">{statusTitle}</p>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Assistant</h2>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Close assistant" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-3">
            {chatMessages.length ? (
              chatMessages.map((chatMessage) => (
                <div
                  key={chatMessage.id}
                  className={cn(
                    "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    chatMessage.role === "user" ? "ml-auto bg-primary text-primary-foreground" : assistantBubbleClass(chatMessage.tone),
                  )}
                >
                  {chatMessage.role === "assistant" ? (
                    chatMessage.tone ? (
                      <div className="flex min-w-0 gap-2">
                        <AssistantToolStatusIcon tone={chatMessage.tone} />
                        <div className="min-w-0 flex-1">
                          <AssistantMarkdown content={chatMessage.content} />
                        </div>
                      </div>
                    ) : (
                      <AssistantMarkdown content={chatMessage.content} />
                    )
                  ) : (
                    chatMessage.content
                  )}
                  {chatMessage.attachments?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {chatMessage.attachments.map((attachment) => (
                        <AttachmentPill key={attachment.id ?? attachment.name} attachment={attachment} />
                      ))}
                    </div>
                  ) : null}
                  {chatMessage.role === "assistant" && chatMessage.usage ? <AssistantUsageDetails usage={chatMessage.usage} /> : null}
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                Ask for a focused edit, for example “check every question has a solution and fix any missing spaces”.
              </p>
            )}
            {chatRunning ? (
              <div className="mr-auto rounded-2xl bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
                {activityLabel}
                {activityStartedAt ? <span className="ml-1 text-xs">for {elapsedLabel}</span> : null}
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div
          className="border-t p-3"
          onDragOver={(event) => {
            if (chatRunning) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            if (chatRunning) return;
            const files = Array.from(event.dataTransfer.files ?? []);
            if (!files.length) return;
            event.preventDefault();
            void onAddAttachments(files);
          }}
        >
          {chatAttachments.length ? (
            <div className="mb-2 flex flex-wrap gap-1">
              {chatAttachments.map((attachment) => (
                <AttachmentPill key={attachment.id ?? attachment.name} attachment={attachment} onRemove={onRemoveAttachment} />
              ))}
            </div>
          ) : null}
          <Textarea
            value={chatInput}
            onChange={(event) => onChatInputChange(event.target.value)}
            rows={3}
            className="min-h-20 resize-none rounded-xl"
            placeholder="Ask Mauth to inspect, edit, validate, save, or organise this document."
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files ?? []);
              if (!files.length) return;
              event.preventDefault();
              void onAddAttachments(files);
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                if (canSend) onSendChat();
              }
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/*,.txt,.md,.markdown,.csv,.tsv,.json,.tex,.yaml,.yml"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) void onAddAttachments(files);
              event.currentTarget.value = "";
            }}
          />
          {attachmentNotice ? <p className="text-destructive mt-2 text-xs">{attachmentNotice}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Attach image, PDF, Word, or text file"
              disabled={chatRunning}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" aria-hidden="true" />
            </Button>
            <Button type="button" size="sm" onClick={onSendChat} disabled={!canSend}>
              <Send data-icon="inline-start" />
              {chatRunning ? "Working" : "Ask"}
            </Button>
            {providerConfigured === false ? (
              <span className="text-xs text-muted-foreground">Add the backend API key, then restart the API server.</span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {chatAttachments.length
                  ? "Attachments can increase API cost. Press Cmd/Ctrl + Enter to send."
                  : "Press Cmd/Ctrl + Enter to send."}
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
