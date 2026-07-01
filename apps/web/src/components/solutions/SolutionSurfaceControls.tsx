import type { ContentBlock, ContentBlockVisibility } from "@mauth-studio/shared";
import { CopyPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CONTENT_BLOCK_DISPLAY_OPTIONS, contentBlockMarkTicksPatch, contentBlockVisibilityPatch } from "@/lib/moduleSettingsPatches";
import { solutionSurfaceControlState } from "@/lib/solutionSurfaceControls";

export interface SolutionSurfaceSelection {
  label: string;
  block: ContentBlock;
}

interface SolutionSurfaceControlsProps<TSelection extends SolutionSurfaceSelection> {
  selectedBlock: TSelection;
  controlClassName: string;
  onBlockChange: (selection: TSelection, patch: Partial<ContentBlock>) => void;
  onCreateSolutionCopy?: (selection: TSelection) => void;
}

export function SolutionSurfaceControls<TSelection extends SolutionSurfaceSelection>({
  selectedBlock,
  controlClassName,
  onBlockChange,
  onCreateSolutionCopy,
}: SolutionSurfaceControlsProps<TSelection>) {
  const state = solutionSurfaceControlState(selectedBlock.block);

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
      {onCreateSolutionCopy ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!state.canCreateSolutionCopy}
          title={state.copyTitle}
          onClick={() => onCreateSolutionCopy(selectedBlock)}
          className="justify-start gap-2"
        >
          <CopyPlus className="size-4" aria-hidden="true" />
          Copy to solutions
        </Button>
      ) : null}
      {state.visibility === "solution" && state.supportsSurfaceTicks ? (
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
    </div>
  );
}
