import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { GripVertical } from "lucide-react";

import type { ContainerOrderItem } from "@/lib/editorDocumentNormalization";
import { type SubsectionContainerRef, type SubsectionDragTarget, subsectionContainerDataAttributes } from "@/lib/editorSubsectionDrag";
import { editorSubsectionDropZoneClassName } from "@/lib/editorSubsectionDragControls";

interface EditorSubsectionDropZoneProps {
  active: boolean;
  label: string;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

export function EditorSubsectionContainerDropZone({
  container,
  placement,
  active,
  label,
  onDragOver,
  onDragLeave,
  onDrop,
}: EditorSubsectionDropZoneProps & {
  container: SubsectionContainerRef;
  placement: "start" | "end";
}) {
  return (
    <div
      data-subsection-container-drop="true"
      data-subsection-container-placement={placement}
      {...subsectionContainerDataAttributes(container)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={editorSubsectionDropZoneClassName({ active, kind: "container" })}
    >
      {active ? <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">{label}</div> : null}
    </div>
  );
}

export function EditorSubsectionItemDropZone({
  container,
  beforeItem,
  active,
  label,
  onDragOver,
  onDragLeave,
  onDrop,
}: EditorSubsectionDropZoneProps & {
  container: SubsectionContainerRef;
  beforeItem: ContainerOrderItem;
}) {
  return (
    <div
      data-subsection-item-drop="true"
      data-subsection-before-item-kind={beforeItem.kind}
      data-subsection-before-item-id={beforeItem.id}
      {...subsectionContainerDataAttributes(container)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={editorSubsectionDropZoneClassName({ active, kind: "item" })}
    >
      {active ? <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">{label}</div> : null}
    </div>
  );
}

export function EditorSubsectionDragHandle({
  target,
  label,
  onPointerDown,
  onDragStart,
  onDragEnd,
}: {
  target: SubsectionDragTarget;
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, target: SubsectionDragTarget) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, target: SubsectionDragTarget) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-subsection-drag-handle="true"
      title={label}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => onPointerDown(event, target)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDragStart={(event) => onDragStart(event, target)}
      onDragEnd={onDragEnd}
      className="inline-flex size-8 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
    >
      <GripVertical className="pointer-events-none size-4" aria-hidden="true" />
    </div>
  );
}
