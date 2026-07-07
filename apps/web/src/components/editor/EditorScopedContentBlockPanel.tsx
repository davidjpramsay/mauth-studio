import type { ContentBlockVisibility } from "@mauth-studio/shared";
import type { DragEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { EditorContentBlockPanel } from "@/components/editor/EditorContentBlockPanel";
import type { EditorContentBlock } from "@/lib/editorDocumentNormalization";
import { type SubsectionDragTarget, subsectionTargetDataAttributes } from "@/lib/editorSubsectionDrag";
import { scrollAnchorContains } from "@/lib/scrollAnchors";
import type { SolutionInsertionBlockKind } from "@/lib/solutionBlockVisibility";
import { tableSolutionEntryMasksForBlocks } from "@/lib/tableSolutionEntries";
import { cn } from "@/lib/utils";

type EditorBlockPanelContext = "question" | "part" | "subpart";

interface EditorScopedContentBlockPanelProps {
  block: EditorContentBlock;
  scopeBlocks: EditorContentBlock[];
  context: EditorBlockPanelContext;
  target: SubsectionDragTarget;
  anchor: string;
  isNotesTemplate: boolean;
  showSolutions: boolean;
  activeAnchor: string;
  openSignal?: number;
  dragClasses: (target: SubsectionDragTarget) => string;
  dragHandle: (target: SubsectionDragTarget, label: string) => ReactNode;
  openSignalForAnchor: (anchor: string) => number | undefined;
  contentBlockForKind: (kind: SolutionInsertionBlockKind, visibility?: ContentBlockVisibility) => EditorContentBlock;
  diagramBlockForType: (type: string, visibility?: ContentBlockVisibility) => EditorContentBlock;
  onActivateAnchor: (anchor: string) => void;
  onContextMenuAnchor: (event: ReactMouseEvent<HTMLElement>, anchor: string) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, target: SubsectionDragTarget) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>, target: SubsectionDragTarget) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, target: SubsectionDragTarget) => void;
  onChange: (patch: Partial<EditorContentBlock>) => void;
  onRemove: () => void;
}

export function EditorScopedContentBlockPanel({
  block,
  scopeBlocks,
  context,
  target,
  anchor,
  isNotesTemplate,
  showSolutions,
  activeAnchor,
  openSignal,
  dragClasses,
  dragHandle,
  openSignalForAnchor,
  contentBlockForKind,
  diagramBlockForType,
  onActivateAnchor,
  onContextMenuAnchor,
  onDragOver,
  onDragLeave,
  onDrop,
  onChange,
  onRemove,
}: EditorScopedContentBlockPanelProps) {
  const blockIndex = Math.max(
    0,
    scopeBlocks.filter((current) => current.kind !== "pageBreak").findIndex((current) => current.id === block.id),
  );
  const blockActive = scrollAnchorContains(anchor, activeAnchor);
  const tableSolutionEntryMasks = block.kind === "table" ? tableSolutionEntryMasksForBlocks(scopeBlocks) : undefined;
  const activateBlockAnchor = () => onActivateAnchor(anchor);

  return (
    <div
      data-drag-preview
      data-scroll-anchor={anchor}
      {...subsectionTargetDataAttributes(target)}
      className={cn("rounded-md transition-all", dragClasses(target))}
      onPointerDownCapture={activateBlockAnchor}
      onFocusCapture={activateBlockAnchor}
      onContextMenu={(event) => onContextMenuAnchor(event, anchor)}
      onDragOver={(event) => onDragOver(event, target)}
      onDragLeave={(event) => onDragLeave(event, target)}
      onDrop={(event) => onDrop(event, target)}
    >
      <EditorContentBlockPanel
        block={block}
        blockIndex={blockIndex}
        context={context}
        isNotesTemplate={isNotesTemplate}
        showSolutions={showSolutions}
        anchor={anchor}
        activeAnchor={activeAnchor}
        active={blockActive}
        openSignal={openSignal}
        solutionEntryMask={tableSolutionEntryMasks?.[block.id]}
        dragHandleForLabel={(label) => dragHandle(target, label)}
        openSignalForAnchor={openSignalForAnchor}
        contentBlockForKind={contentBlockForKind}
        diagramBlockForType={diagramBlockForType}
        onActivateAnchor={onActivateAnchor}
        onContextMenuAnchor={onContextMenuAnchor}
        onChange={onChange}
        onRemove={onRemove}
      />
    </div>
  );
}
