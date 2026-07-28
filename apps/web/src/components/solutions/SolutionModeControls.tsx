import { ClipboardCheck, Eye, EyeOff, FileText, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { solutionModeCopy } from "@/lib/solutionModeCopy";
import { cn } from "@/lib/utils";

export function SolutionModeControls({
  editorDocumentOpen,
  supportsSolutionTools,
  supportsSolutionValidation,
  isInvestigationTemplate,
  showSolutions,
  effectiveShowSolutions,
  printModeLabel,
  printModeTitle,
  studentModeLabel,
  solutionModeLabel,
  solutionIssueCount,
  solutionErrorCount,
  onShowSolutionsChange,
  onOpenSolutionValidation,
  onPrint,
}: {
  editorDocumentOpen: boolean;
  supportsSolutionTools: boolean;
  supportsSolutionValidation: boolean;
  isInvestigationTemplate: boolean;
  showSolutions: boolean;
  effectiveShowSolutions: boolean;
  printModeLabel: string;
  printModeTitle: string;
  studentModeLabel: string;
  solutionModeLabel: string;
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
  const modeCopy = solutionModeCopy({ supportsSolutionTools, effectiveShowSolutions, isInvestigationTemplate });
  const nativeMenuOwnsAuxiliaryControls = Boolean(window.mauthDesktop);

  return (
    <>
      {editorDocumentOpen && supportsSolutionTools ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={showSolutions}
          aria-label={showSolutions ? `Switch to ${studentModeLabel} mode` : `Switch to ${solutionModeLabel} mode`}
          title={
            showSolutions
              ? `${solutionModeLabel} mode. Switch to ${studentModeLabel.toLowerCase()} mode.`
              : `${studentModeLabel} mode. Switch to ${solutionModeLabel.toLowerCase()} mode.`
          }
          onClick={() => onShowSolutionsChange(!showSolutions)}
          className={cn(
            "h-8 w-8 shrink-0 border border-blue-300/20 bg-slate-950/20 text-blue-100 hover:bg-blue-500/15 hover:text-white",
            showSolutions && "bg-blue-500/20 text-white",
          )}
        >
          {showSolutions ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
        </Button>
      ) : null}
      {editorDocumentOpen && !nativeMenuOwnsAuxiliaryControls ? (
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
      {editorDocumentOpen && supportsSolutionValidation && !nativeMenuOwnsAuxiliaryControls ? (
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
        <span className="hidden xl:inline">{printModeLabel}</span>
      </button>
    </>
  );
}
