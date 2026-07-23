import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { parseNumericExpression, steppedNumericValue } from "../../lib/numericExpression";
import { cn } from "../../lib/utils";

interface NumericExpressionInputProps {
  value?: number;
  fallbackValue?: number;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: number | undefined) => void;
}

const EXPRESSION_INPUT_TITLE = "Enter a number or expression, for example pi/2, sqrt(2), or 1/3.";

function numericInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

export function NumericExpressionInput({
  value,
  fallbackValue,
  min,
  max,
  step = 1,
  ariaLabel,
  className,
  disabled,
  onValueChange,
}: NumericExpressionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const displayValue = draftValue ?? numericInputValue(value ?? fallbackValue);
  const parsedDraft = parseNumericExpression(displayValue);
  const invalid =
    displayValue.trim() !== "" &&
    (parsedDraft === undefined || (min !== undefined && parsedDraft < min) || (max !== undefined && parsedDraft > max));

  const updateDraft = (nextDraft: string) => {
    setDraftValue(nextDraft);
    const parsed = parseNumericExpression(nextDraft);
    if (parsed !== undefined && (min === undefined || parsed >= min) && (max === undefined || parsed <= max)) {
      onValueChange(parsed);
    }
  };

  const stepValue = (direction: 1 | -1) => {
    const baseValue = parsedDraft ?? value ?? fallbackValue ?? 0;
    const nextValue = steppedNumericValue(baseValue, direction, step, min, max);
    setDraftValue(String(nextValue));
    onValueChange(nextValue);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      stepValue(event.key === "ArrowUp" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setDraftValue(null);
      event.currentTarget.blur();
    }
  };

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        role="spinbutton"
        value={displayValue}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={parsedDraft}
        aria-invalid={invalid || undefined}
        title={EXPRESSION_INPUT_TITLE}
        disabled={disabled}
        onChange={(event) => updateDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setDraftValue(null)}
        className={cn(className, "w-full pr-8", invalid && "border-destructive focus-visible:ring-destructive")}
      />
      <div className="absolute inset-y-px right-px flex w-7 flex-col overflow-hidden rounded-r-md border-l border-input">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || (max !== undefined && (parsedDraft ?? value ?? fallbackValue ?? 0) >= max)}
          aria-label={`${ariaLabel ?? "Value"} increase`}
          title="Increase"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepValue(1)}
          className="flex min-h-0 flex-1 items-center justify-center bg-muted/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
        >
          <ChevronUp className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || (min !== undefined && (parsedDraft ?? value ?? fallbackValue ?? 0) <= min)}
          aria-label={`${ariaLabel ?? "Value"} decrease`}
          title="Decrease"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => stepValue(-1)}
          className="flex min-h-0 flex-1 items-center justify-center border-t border-input bg-muted/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
        >
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
