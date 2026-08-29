import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export interface MauthSelectOption {
  value: string;
  label: string;
}

interface MauthSelectProps {
  ariaLabel: string;
  value: string;
  options: MauthSelectOption[];
  onValueChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

function wrappedOptionIndex(index: number, change: number, length: number) {
  if (length <= 0) return 0;
  return (index + change + length) % length;
}

export function MauthSelect({ ariaLabel, value, options, onValueChange, className, disabled = false }: MauthSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnResize() {
      setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, open]);

  function openListbox(index = selectedIndex) {
    if (disabled || options.length === 0) return;
    setActiveIndex(index);
    setOpen(true);
  }

  function closeListbox({ restoreFocus = false } = {}) {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function chooseOption(index: number) {
    const option = options[index];
    if (!option) return;
    onValueChange(option.value);
    closeListbox({ restoreFocus: true });
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openListbox(event.key === "ArrowDown" ? selectedIndex : wrappedOptionIndex(selectedIndex, -1, options.length));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openListbox();
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(wrappedOptionIndex(index, event.key === "ArrowDown" ? 1 : -1, options.length));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseOption(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeListbox({ restoreFocus: true });
    } else if (event.key === "Tab") {
      closeListbox();
    }
  }

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)} data-mauth-select>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-2 text-left text-sm font-normal text-foreground outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => (open ? closeListbox() : openListbox())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="min-w-0 flex-1 truncate leading-5">{selectedOption?.label ?? "Select"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-card p-1 text-card-foreground shadow-xl"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value || "empty"}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={index === activeIndex ? 0 : -1}
                className={cn(
                  "flex min-h-10 w-full min-w-0 items-center rounded-md px-2 text-left text-sm font-normal outline-none transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-card-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                )}
                onClick={() => chooseOption(index)}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                  {selected ? <Check className="size-4" strokeWidth={2.5} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate pl-1 leading-5">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
