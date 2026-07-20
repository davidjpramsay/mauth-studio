import type { ContentBlock, ContentBlockVisibility } from "@mauth-studio/shared";
import { CopyPlus, PencilLine } from "lucide-react";

import { ChoiceSolutionAnswerSelect } from "@/components/solutions/ChoiceSolutionAnswerSelect";
import { Button } from "@/components/ui/button";
import { CONTENT_BLOCK_DISPLAY_OPTIONS, contentBlockMarkTicksPatch, contentBlockVisibilityPatch } from "@/lib/moduleSettingsPatches";
import { solutionSurfaceControlState } from "@/lib/solutionSurfaceControls";

export interface SolutionSurfaceSelection {
  label: string;
  block: ContentBlock;
}

interface SolutionSurfaceControlsProps<TSelection extends SolutionSurfaceSelection> {
  selectedBlock: TSelection;
  showSolutions: boolean;
  controlClassName: string;
  onBlockChange: (selection: TSelection, patch: Partial<ContentBlock>) => void;
  onCreateSolutionCopy?: (selection: TSelection) => void;
}

export function SolutionSurfaceControls<TSelection extends SolutionSurfaceSelection>({
  selectedBlock,
  showSolutions,
  controlClassName,
  onBlockChange,
  onCreateSolutionCopy,
}: SolutionSurfaceControlsProps<TSelection>) {
  const state = solutionSurfaceControlState(selectedBlock.block, showSolutions);
  const CompleteIcon = selectedBlock.block.kind === "table" && state.visibility === "always" ? PencilLine : CopyPlus;

  return (
    <div className="space-y-3 border-b p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student / Solutions</div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
        Shown in
        <select
          value={state.visibility}
          aria-label={`${selectedBlock.label} display`}
          onChange={(event) =>
            onBlockChange(selectedBlock, contentBlockVisibilityPatch(selectedBlock.block, event.target.value as ContentBlockVisibility))
          }
          className={controlClassName}
        >
          {CONTENT_BLOCK_DISPLAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {onCreateSolutionCopy && selectedBlock.block.kind !== "choices" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!state.canCreateSolutionCopy}
          title={state.copyTitle}
          onClick={() => onCreateSolutionCopy(selectedBlock)}
          className="justify-start gap-2"
        >
          <CompleteIcon className="size-4" aria-hidden="true" />
          Complete in solutions
        </Button>
      ) : null}
      {state.showSurfaceTicks ? (
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground" title={state.tickHelp}>
          {state.tickLabel}
          <input
            type="number"
            min={0}
            max={20}
            step={1}
            value={state.markTicks}
            aria-label={`${selectedBlock.label} solution surface ticks`}
            onChange={(event) => onBlockChange(selectedBlock, contentBlockMarkTicksPatch(event.currentTarget.value))}
            className={controlClassName}
          />
        </label>
      ) : null}
      {showSolutions && state.visibility !== "student" && selectedBlock.block.kind === "choices" ? (
        <ChoiceSolutionAnswerSelect
          block={selectedBlock.block}
          ariaLabel={`${selectedBlock.label} circled answer`}
          selectClassName={controlClassName}
          onChange={(patch) => onBlockChange(selectedBlock, patch)}
        />
      ) : null}
    </div>
  );
}
