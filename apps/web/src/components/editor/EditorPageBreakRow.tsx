import type { DragEvent } from "react";
import { FileText, GripVertical, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MoveDirection } from "@/lib/documentNavigation";
import {
  editorPageBreakAriaLabel,
  editorPageBreakContextLabel,
  editorPageBreakSummary,
  editorPageBreakTitle,
} from "@/lib/editorPageBreakRows";
import { keyboardDeleteRequested, keyboardMoveDirection } from "@/lib/editorKeyboardShortcuts";
import type { EditorPageBreakTarget } from "@/lib/editorSubsectionDrag";
import { cn } from "@/lib/utils";

interface EditorPageBreakRowProps {
  target: EditorPageBreakTarget;
  isNotesTemplate: boolean;
  moving: boolean;
  onRemove: (target: EditorPageBreakTarget) => void;
  onMoveByKeyboard: (target: EditorPageBreakTarget, direction: MoveDirection) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, target: EditorPageBreakTarget) => void;
  onDragEnd: () => void;
}

export function EditorPageBreakRow({
  target,
  isNotesTemplate,
  moving,
  onRemove,
  onMoveByKeyboard,
  onDragStart,
  onDragEnd,
}: EditorPageBreakRowProps) {
  const contextLabel = editorPageBreakContextLabel(target, isNotesTemplate);

  return (
    <div
      data-drag-preview
      tabIndex={0}
      title={editorPageBreakTitle(contextLabel)}
      aria-label={editorPageBreakAriaLabel(contextLabel)}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete Backspace"
      onKeyDown={(event) => {
        if (keyboardDeleteRequested(event)) {
          event.preventDefault();
          event.stopPropagation();
          onRemove(target);
          return;
        }
        const direction = keyboardMoveDirection(event);
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        onMoveByKeyboard(target, direction);
      }}
      className={cn(
        "flex items-center gap-2 rounded-md border border-dashed border-primary/45 bg-primary/[0.035] px-2 py-1.5 text-sm text-primary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
        moving && "scale-[0.995] opacity-70 shadow-2xl",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        draggable
        title="Drag page break"
        aria-label="Drag page break"
        onClick={(event) => event.stopPropagation()}
        onDragStart={(event) => onDragStart(event, target)}
        onDragEnd={onDragEnd}
        className="size-7 cursor-grab text-primary/75 active:cursor-grabbing"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </Button>
      <FileText className="size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight">Page break</div>
        <div className="truncate text-xs text-muted-foreground">{editorPageBreakSummary(contextLabel)}</div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Remove page break"
        aria-label="Remove page break"
        onClick={(event) => {
          event.stopPropagation();
          onRemove(target);
        }}
        className="hover:text-destructive size-7 text-muted-foreground"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
