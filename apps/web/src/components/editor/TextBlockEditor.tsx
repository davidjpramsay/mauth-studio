import { useRef } from "react";
import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { insertSolutionMarkAnnotation } from "@/lib/solutionTextMarks";
import { cn } from "@/lib/utils";
import { CollapsiblePanel, RemoveActionButton } from "./EditorPanels";

const SOLUTION_MARK_TICK_OPTIONS = [1, 2, 3] as const;

interface TextBlockEditorProps {
  label: string;
  title: ReactNode;
  text: string;
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  minHeightClassName: string;
  solutionMarkTools?: boolean;
  onChange: (text: string) => void;
  onRemove: () => void;
}

export function TextBlockEditor({
  label,
  title,
  text,
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  minHeightClassName,
  solutionMarkTools = false,
  onChange,
  onRemove,
}: TextBlockEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertMarkTicks = (marks: number) => {
    const textarea = textareaRef.current;
    const result = insertSolutionMarkAnnotation(
      text,
      textarea?.selectionStart ?? text.length,
      textarea?.selectionEnd ?? text.length,
      marks,
    );
    onChange(result.text);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <CollapsiblePanel
      title={title}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
      active={active}
      openSignal={openSignal}
    >
      <div className="flex flex-col gap-2">
        {solutionMarkTools ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-300/20 bg-blue-500/[0.06] p-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Mark ticks</span>
            {SOLUTION_MARK_TICK_OPTIONS.map((marks) => (
              <Button
                key={marks}
                type="button"
                variant="outline"
                size="sm"
                title={`Insert hidden [[marks:${marks}]] annotation at the cursor`}
                onClick={() => insertMarkTicks(marks)}
                className="h-7 gap-1 px-2 text-xs"
              >
                <Check className="size-3 text-red-600" aria-hidden="true" />
                {marks}
              </Button>
            ))}
          </div>
        ) : null}
        <Textarea
          ref={textareaRef}
          aria-label={label}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={cn("font-mono", minHeightClassName)}
        />
      </div>
    </CollapsiblePanel>
  );
}
