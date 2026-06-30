import { Eye, EyeOff, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SolutionModeControls({
  editorDocumentOpen,
  supportsSolutionTools,
  showSolutions,
  effectiveShowSolutions,
  printModeLabel,
  printModeTitle,
  onShowSolutionsChange,
  onPrint,
}: {
  editorDocumentOpen: boolean;
  supportsSolutionTools: boolean;
  showSolutions: boolean;
  effectiveShowSolutions: boolean;
  printModeLabel: string;
  printModeTitle: string;
  onShowSolutionsChange: (showSolutions: boolean) => void;
  onPrint: () => void;
}) {
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
