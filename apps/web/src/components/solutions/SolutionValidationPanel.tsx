import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { solutionValidationFixLabel, solutionValidationSummary } from "@/lib/solutionValidation";
import type { SolutionValidationIssue, SolutionValidationResult } from "@/lib/solutionValidation";
import { cn } from "@/lib/utils";

export function SolutionValidationPanel({
  result,
  onClose,
  onJump,
  onFix,
}: {
  result: SolutionValidationResult;
  onClose: () => void;
  onJump: (anchor: string) => void;
  onFix: (issue: SolutionValidationIssue) => void;
}) {
  const summary = solutionValidationSummary(result);
  return (
    <aside className="fixed right-4 top-20 z-50 w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-background shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Solution validation</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" title="Close" aria-label="Close solution validation" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-3">
        {!result.checkedItems ? (
          <p className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            No marked questions, parts, or subparts were found.
          </p>
        ) : !result.issues.length ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            All marked items have a student response surface and a solution.
          </div>
        ) : (
          <div className="space-y-2">
            {result.issues.map((issue) => {
              const fixLabel = solutionValidationFixLabel(issue.fix);
              return (
                <div
                  key={issue.id}
                  className={cn(
                    "w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent",
                    issue.severity === "error" ? "border-red-300 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950",
                  )}
                >
                  <span className="mb-1 flex items-center justify-between gap-2">
                    <button type="button" className="min-w-0 text-left font-semibold hover:underline" onClick={() => onJump(issue.anchor)}>
                      {issue.label}
                    </button>
                    <Badge
                      variant="secondary"
                      className={cn(issue.severity === "error" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900")}
                    >
                      {issue.severity}
                    </Badge>
                  </span>
                  <span className="block text-xs leading-relaxed">{issue.message}</span>
                  <span className="mt-2 flex flex-wrap gap-2">
                    {fixLabel ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 bg-background/80 px-2 text-xs"
                        onClick={() => onFix(issue)}
                      >
                        {fixLabel}
                      </Button>
                    ) : null}
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onJump(issue.anchor)}>
                      Jump
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
