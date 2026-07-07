import type { DropPlacement } from "./documentNavigation.ts";
import { cn } from "./utils.ts";

export function editorSubsectionDragClassName({ isDragging, dropPlacement }: { isDragging: boolean; dropPlacement: DropPlacement | null }) {
  return cn(
    "relative",
    isDragging && "scale-[0.995] opacity-70 shadow-2xl",
    dropPlacement === "inside" &&
      "bg-primary/5 ring-2 ring-primary/60 ring-offset-2 ring-offset-background shadow-[0_0_0_4px_hsl(var(--primary)/0.10)]",
  );
}

export function editorSubsectionDropZoneLabel({
  pageBreakCanDrop,
  subsectionCanDrop,
  fallbackLabel,
}: {
  pageBreakCanDrop: boolean;
  subsectionCanDrop: boolean;
  fallbackLabel: string;
}) {
  return pageBreakCanDrop && !subsectionCanDrop ? "Drop page break here" : fallbackLabel;
}

export function editorSubsectionDropZoneClassName({ active, kind }: { active: boolean; kind: "container" | "item" }) {
  const base =
    kind === "container"
      ? "relative my-1 h-2 rounded-md border border-dashed border-transparent bg-transparent text-muted-foreground transition-all"
      : "relative my-0.5 h-2 rounded-md border border-dashed border-transparent bg-transparent text-muted-foreground transition-all";
  const activeClass =
    kind === "container"
      ? "my-3 h-11 border-primary bg-primary/10 text-primary shadow-inner"
      : "my-2 h-12 border-primary bg-primary/10 text-primary shadow-inner";

  return cn(base, active && activeClass);
}
