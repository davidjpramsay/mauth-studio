import { ClipboardCheck, Eye, EyeOff, FileText, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { solutionModeCopy } from "@/lib/solutionModeCopy";
import { cn } from "@/lib/utils";

export function SolutionModeControls({
  editorDocumentOpen,
  supportsSolutionTools,
  showSolutions,
  effectiveShowSolutions,
  printModeLabel,
  printModeTitle,
  solutionIssueCount,
  solutionErrorCount,
  onShowSolutionsChange,
  onOpenSolutionValidation,
  onPrint,
}: {
  editorDocumentOpen: boolean;
  supportsSolutionTools: boolean;
  showSolutions: boolean;
  effectiveShowSolutions: boolean;
  printModeLabel: string;
  printModeTitle: string;
  solutionIssueCount: number;
  solutionErrorCount: number;
  onShowSolutionsChange: (showSolutions: boolean) => void;
  onOpenSolutionValidation: () => void;
  onPrint: () => void;
}) {
  const solutionCheckTone =
    solutionIssueCount > 0
      ? solutionErrorCount > 0
        ? "border-red-300/25 bg-red-500/15 text-red-50 hover:bg-red-500/25 hover:text-white"
        : "border-amber-300/25 bg-amber-500/15 text-amber-50 hover:bg-amber-500/25 hover:text-white"
      : "border-blue-300/20 bg-slate-950/20 text-blue-100 hover:bg-blue-500/15 hover:text-white";
  const modeCopy = solutionModeCopy({ supportsSolutionTools, effectiveShowSolutions });

  return (
    <>
      {editorDocumentOpen && supportsSolutionTools ? (
        <div
          role="radiogroup"
          aria-label="Editor mode"
          className="flex h-8 items-center rounded-md border border-blue-300/20 bg-slate-950/20 p-0.5"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            role="radio"
            aria-checked={!showSolutions}
            title="Edit the student copy"
            onClick={() => onShowSolutionsChange(false)}
            className={cn(
              "h-7 gap-1.5 px-2 text-xs text-blue-100 hover:bg-blue-500/15 hover:text-white",
              !showSolutions && "bg-blue-500/20 text-white",
            )}
          >
            <EyeOff className="size-3.5" aria-hidden="true" />
            <span>Student</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            role="radio"
            aria-checked={showSolutions}
            title="Edit the solutions copy"
            onClick={() => onShowSolutionsChange(true)}
            className={cn(
              "h-7 gap-1.5 px-2 text-xs text-blue-100 hover:bg-blue-500/15 hover:text-white",
              showSolutions && "bg-blue-500/20 text-white",
            )}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            <span>Solutions</span>
          </Button>
        </div>
      ) : null}
      {editorDocumentOpen ? (
        <span
          title={modeCopy.layerTitle}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold",
            effectiveShowSolutions ? "border-blue-300/25 bg-blue-500/15 text-blue-50" : "border-slate-300/20 bg-slate-950/20 text-blue-100",
          )}
        >
          <Layers className="size-3.5" aria-hidden="true" />
          <span className="hidden 2xl:inline">{modeCopy.layerLabel}</span>
        </span>
      ) : null}
      {editorDocumentOpen && supportsSolutionTools ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={
            solutionIssueCount
              ? `Open solution validation: ${solutionIssueCount} issue${solutionIssueCount === 1 ? "" : "s"}`
              : "Open solution validation: no issues found"
          }
          aria-label="Open solution validation"
          onClick={onOpenSolutionValidation}
          className={cn("h-8 gap-1.5 rounded-md border px-2 text-xs font-semibold transition-colors", solutionCheckTone)}
        >
          <ClipboardCheck className="size-4" aria-hidden="true" />
          <span className="hidden xl:inline">Check</span>
          <span>{solutionIssueCount || "OK"}</span>
        </Button>
      ) : null}
      <button
        type="button"
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition-colors",
          !editorDocumentOpen && "cursor-not-allowed opacity-50",
          effectiveShowSolutions
            ? "border-red-300/25 bg-red-500/15 text-red-50 hover:bg-red-500/25 hover:text-white"
            : "border-emerald-300/30 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25 hover:text-white",
        )}
        title={`${printModeTitle} Open print dialog.`}
        aria-label={`Print mode: ${printModeLabel}`}
        disabled={!editorDocumentOpen}
        onClick={onPrint}
      >
        <FileText className="size-4" aria-hidden="true" />
        <span className="hidden xl:inline">Print:</span>
        <span>{printModeLabel}</span>
      </button>
    </>
  );
}
