import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  solutionScopeValidationStatus,
  solutionValidationFixLabel,
  type SolutionValidationIssue,
  type SolutionValidationResult,
} from "@/lib/solutionValidation";
import { cn } from "@/lib/utils";

export function SolutionScopeStatus({
  result,
  anchor,
  marked,
  includeDescendants = false,
  onFix,
  onJump,
}: {
  result: SolutionValidationResult;
  anchor: string;
  marked: boolean;
  includeDescendants?: boolean;
  onFix: (issue: SolutionValidationIssue) => void;
  onJump: (anchor: string) => void;
}) {
  const status = solutionScopeValidationStatus({ result, anchor, marked, includeDescendants });
  if (!status) return null;

  if (status.tone === "ready") {
    return (
      <span
        role="status"
        data-solution-scope-status="ready"
        data-solution-scope-anchor={anchor}
        title="Student response space, solution content, and mark ticks are complete."
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-semibold text-emerald-900"
      >
        <CircleCheck className="size-3.5" aria-hidden="true" />
        Solution ready
      </span>
    );
  }

  const primaryIssue = status.primaryIssue;
  if (!primaryIssue) return null;

  const fixLabel = solutionValidationFixLabel(primaryIssue.fix);
  const aggregate = includeDescendants && primaryIssue.anchor !== anchor;
  const label = aggregate ? `${status.issueCount} solution issue${status.issueCount === 1 ? "" : "s"}` : fixLabel || "Review solution";
  const Icon = status.tone === "error" ? CircleX : TriangleAlert;
  const title = `${status.issueCount} solution ${status.issueCount === 1 ? "issue" : "issues"}. ${primaryIssue.message}`;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-solution-scope-status={status.tone}
      data-solution-scope-anchor={anchor}
      title={title}
      aria-label={`${label}. ${title}`}
      onClick={(event) => {
        event.stopPropagation();
        if (aggregate || !primaryIssue.fix) onJump(primaryIssue.anchor);
        else onFix(primaryIssue);
      }}
      className={cn(
        "h-8 shrink-0 gap-1.5 px-2 text-xs font-semibold",
        status.tone === "error"
          ? "border-red-300 bg-red-50 text-red-950 hover:bg-red-100 hover:text-red-950"
          : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 hover:text-amber-950",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span>{label}</span>
      {!aggregate && status.issueCount > 1 ? (
        <span className="bg-current/10 rounded-full px-1.5" aria-label={`${status.issueCount} issues total`}>
          {status.issueCount}
        </span>
      ) : null}
    </Button>
  );
}
