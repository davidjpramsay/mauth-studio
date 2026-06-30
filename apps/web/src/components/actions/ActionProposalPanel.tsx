import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { MauthActionPreviewSummary, MauthDocumentActionResult, MauthQuestionLike } from "@/lib/mauthActions";
import { cn } from "@/lib/utils";

function shortActionPreviewList(values: readonly string[], limit = 8) {
  if (!values.length) return "";
  const visible = values.slice(0, limit);
  const remaining = values.length - visible.length;
  return remaining > 0 ? `${visible.join(", ")} + ${remaining} more` : visible.join(", ");
}

function actionPreviewSummaryLines(preview: MauthActionPreviewSummary) {
  const lines: string[] = [];
  const actionCounts = Object.entries(preview.actionCounts)
    .filter((entry): entry is [string, number] => Number(entry[1]) > 0)
    .map(([type, count]) => `${type} x${count}`);

  if (actionCounts.length) lines.push(`Actions: ${actionCounts.join(", ")}`);
  if (preview.changedIds.length) lines.push(`Changed: ${shortActionPreviewList(preview.changedIds)}`);
  if (preview.addedIds.length) lines.push(`Added: ${shortActionPreviewList(preview.addedIds)}`);
  if (preview.deletedIds.length) lines.push(`Deleted: ${shortActionPreviewList(preview.deletedIds)}`);
  if (preview.movedIds.length) lines.push(`Moved: ${shortActionPreviewList(preview.movedIds)}`);
  if (preview.reorderedIds.length) lines.push(`Reordered: ${shortActionPreviewList(preview.reorderedIds)}`);
  if (preview.updatedIds.length) lines.push(`Updated: ${shortActionPreviewList(preview.updatedIds)}`);
  if (preview.frontMatterFields.length) lines.push(`Front matter: ${shortActionPreviewList(preview.frontMatterFields)}`);
  if (preview.formattingFields.length) lines.push(`Formatting: ${shortActionPreviewList(preview.formattingFields)}`);
  if (preview.pageFormatFields.length) lines.push(`Page format: ${shortActionPreviewList(preview.pageFormatFields)}`);
  return lines;
}

export function ActionProposalPanel<TQuestion extends MauthQuestionLike, TFrontMatter extends object, TFormatting extends object>({
  value,
  message,
  result,
  onChange,
  onPreview,
  onApply,
  onClose,
  onClear,
}: {
  value: string;
  message: string;
  result: MauthDocumentActionResult<TQuestion, TFrontMatter, TFormatting> | null;
  onChange: (value: string) => void;
  onPreview: () => void;
  onApply: () => void;
  onClose: () => void;
  onClear: () => void;
}) {
  const preview = result?.preview;
  const summaryLines = preview ? actionPreviewSummaryLines(preview) : [];
  const canSubmit = Boolean(value.trim());
  const validPreview = Boolean(result?.ok && preview?.valid);

  return (
    <aside className="fixed right-4 top-20 z-50 w-[min(34rem,calc(100vw-2rem))] rounded-xl border bg-background shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Action proposal</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Paste Mauth document action JSON, preview it, then apply it.</p>
        </div>
        <Button type="button" variant="ghost" size="icon" title="Close" aria-label="Close action proposal" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="max-h-[72vh] space-y-3 overflow-y-auto p-3">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={12}
          spellCheck={false}
          className="min-h-56 font-mono text-xs"
          placeholder='{"actions":[{"type":"module.update","scope":{"kind":"question","questionId":"..."},"blockId":"...","patch":{"text":"..."}}]}'
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={onPreview} disabled={!canSubmit}>
            Preview
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onApply} disabled={!canSubmit}>
            Apply
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={!value && !result && !message}>
            Clear
          </Button>
        </div>
        {message ? (
          <p className={cn("rounded-md border p-2 text-xs", validPreview ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "")}>
            {message}
          </p>
        ) : null}
        {preview ? (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className={cn(validPreview ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900")}>
                {validPreview ? "Dry run valid" : "Needs attention"}
              </Badge>
              <span className="text-muted-foreground">
                {preview.attemptedActionCount} of {preview.requestedActionCount} action
                {preview.requestedActionCount === 1 ? "" : "s"} checked
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Added</span>
                <span className="font-semibold">{preview.counts.added}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Updated</span>
                <span className="font-semibold">{preview.counts.updated}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Moved</span>
                <span className="font-semibold">{preview.counts.moved}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Deleted</span>
                <span className="font-semibold">{preview.counts.deleted}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Fields</span>
                <span className="font-semibold">
                  {preview.counts.frontMatterFields + preview.counts.formattingFields + preview.counts.pageFormatFields}
                </span>
              </div>
              <div className="rounded-md bg-background p-2">
                <span className="block text-[10px] uppercase text-muted-foreground">Warnings</span>
                <span className="font-semibold">{preview.counts.warnings}</span>
              </div>
            </div>
            {summaryLines.length ? (
              <ul className="space-y-1 text-muted-foreground">
                {summaryLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No content changes in the dry run.</p>
            )}
            {result?.error ? <p className="text-red-700">{result.error}</p> : null}
            {result?.warnings.length ? (
              <ul className="space-y-1 text-amber-800">
                {result.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${warning.targetId ?? index}`}>{warning.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
