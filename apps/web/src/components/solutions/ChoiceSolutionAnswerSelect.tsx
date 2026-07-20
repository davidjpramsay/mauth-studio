import type { ContentBlock } from "@mauth-studio/shared";

import { choiceSolutionAnswerOptions, choiceSolutionAnswerPatch, normalizeChoiceSolutionAnswerIndex } from "@/lib/choiceSolutionAnswers";
import { cn } from "@/lib/utils";

type ChoiceListBlock = Extract<ContentBlock, { kind: "choices" }>;

interface ChoiceSolutionAnswerSelectProps {
  block: ChoiceListBlock;
  label?: string;
  ariaLabel?: string;
  className?: string;
  selectClassName?: string;
  onChange: (patch: Partial<ChoiceListBlock>) => void;
}

export function ChoiceSolutionAnswerSelect({
  block,
  label = "Circled answer",
  ariaLabel = "Solution choice answer",
  className,
  selectClassName,
  onChange,
}: ChoiceSolutionAnswerSelectProps) {
  const answerIndex = normalizeChoiceSolutionAnswerIndex(block.solutionAnswerIndex, block.choices.length);

  return (
    <label className={cn("flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground", className)}>
      {label}
      <select
        value={answerIndex === undefined ? "" : String(answerIndex)}
        aria-label={ariaLabel}
        onChange={(event) => onChange(choiceSolutionAnswerPatch(block, event.currentTarget.value))}
        className={cn("h-9 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground", selectClassName)}
      >
        <option value="">Not selected</option>
        {choiceSolutionAnswerOptions(block).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
