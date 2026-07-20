import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { ContentBlockVisibility } from "@mauth-studio/shared";

import { InlineSummaryTitle } from "@/components/MathText";
import { ChoiceListBlockEditor } from "@/components/editor/ChoiceListBlockEditor";
import { ColumnsBlockEditor } from "@/components/editor/ColumnsBlockEditor";
import { DiagramBlockEditor } from "@/components/editor/DiagramBlockEditor";
import { SpaceBlockEditor } from "@/components/editor/SpaceBlockEditor";
import { TableBlockEditor } from "@/components/editor/TableBlockEditor";
import { TextBlockEditor } from "@/components/editor/TextBlockEditor";
import {
  CHOICE_LIST_LAYOUTS,
  CHOICE_NUMBERING_STYLES,
  DIAGRAM_ALIGNMENTS,
  DIAGRAM_TYPES,
  TABLE_CELL_ALIGNMENTS,
} from "@/components/editor/editorOptions";
import {
  columnsBlockSummary,
  createEditorBlockSummaryRuntime,
  spaceBlockSummary,
  tableBlockSummary,
  textBlockSummary,
} from "@/lib/editorBlockSummaries";
import type { EditorContentBlock } from "@/lib/editorDocumentNormalization";
import { normalizeDiagramType, withGraphDefaults } from "@/lib/editorDiagramConfig";
import { isSolutionTextBlock, type SolutionInsertionBlockKind } from "@/lib/solutionBlockVisibility";
import { solutionSurfaceControlState } from "@/lib/solutionSurfaceControls";
import type { TableSolutionEntryMask } from "@/lib/tableSolutionEntries";

const { choiceListSummary } = createEditorBlockSummaryRuntime({
  withGraphDefaults,
  normalizeDiagramType,
  diagramTypes: DIAGRAM_TYPES,
  choiceNumberingStyles: CHOICE_NUMBERING_STYLES,
});

type EditorBlockPanelContext = "question" | "part" | "subpart";

interface BlockLabelSet {
  label: string;
  dragLabel: string;
}

function contextLabelPrefix(context: EditorBlockPanelContext) {
  if (context === "part") return "Part ";
  if (context === "subpart") return "Subpart ";
  return "";
}

function blockLabel(
  kind: Exclude<EditorContentBlock["kind"], "pageBreak">,
  context: EditorBlockPanelContext,
  blockIndex: number,
): BlockLabelSet {
  const itemNumber = blockIndex + 1;
  const contextPrefix = contextLabelPrefix(context);
  const displayPrefix = contextPrefix ? `${contextPrefix}${kind === "choices" ? "choice list" : kind}` : "";
  if (kind === "diagram") {
    const label = context === "question" ? `Diagram block ${itemNumber}` : `${contextPrefix}diagram ${itemNumber}`;
    const dragLabel =
      context === "question" ? `Drag diagram block ${itemNumber}` : `Drag ${contextPrefix.toLowerCase()}diagram ${itemNumber}`;
    return { label, dragLabel };
  }
  if (kind === "columns") {
    const label = context === "question" ? `Columns block ${itemNumber}` : `${contextPrefix}columns ${itemNumber}`;
    const dragLabel =
      context === "question" ? `Drag columns block ${itemNumber}` : `Drag ${contextPrefix.toLowerCase()}columns ${itemNumber}`;
    return { label, dragLabel };
  }
  if (kind === "choices") {
    const label = context === "question" ? `Choice list ${itemNumber}` : `${displayPrefix} ${itemNumber}`;
    const dragLabel =
      context === "question" ? `Drag choice list ${itemNumber}` : `Drag ${contextPrefix.toLowerCase()}choice list ${itemNumber}`;
    return { label, dragLabel };
  }
  if (kind === "table") {
    const label = context === "question" ? `Table block ${itemNumber}` : `${contextPrefix}table ${itemNumber}`;
    const dragLabel = context === "question" ? `Drag table block ${itemNumber}` : `Drag ${contextPrefix.toLowerCase()}table ${itemNumber}`;
    return { label, dragLabel };
  }
  if (kind === "text") {
    const label = context === "question" ? `Text block ${itemNumber}` : `${contextPrefix}text ${itemNumber}`;
    const dragLabel = context === "question" ? `Drag text block ${itemNumber}` : `Drag ${contextPrefix.toLowerCase()}text ${itemNumber}`;
    return { label, dragLabel };
  }
  return { label: "", dragLabel: "" };
}

function spaceBlockLabel(context: EditorBlockPanelContext, isNotesTemplate: boolean, blockIndex: number): string {
  const itemNumber = blockIndex + 1;
  if (context === "question") return isNotesTemplate ? `Blank space ${itemNumber}` : `Answer space ${itemNumber}`;
  if (context === "part") return isNotesTemplate ? `Subheading blank space ${itemNumber}` : `Part answer space ${itemNumber}`;
  return isNotesTemplate ? `Detail blank space ${itemNumber}` : `Subpart answer space ${itemNumber}`;
}

function spaceLabelPrefix(context: EditorBlockPanelContext, isNotesTemplate: boolean): string {
  if (!isNotesTemplate) return "Answer space";
  if (context === "question") return "Blank space";
  if (context === "part") return "Subheading blank space";
  return "Detail blank space";
}

function textMinHeightClassName(context: EditorBlockPanelContext) {
  if (context === "question") return "min-h-[110px]";
  if (context === "part") return "min-h-[74px]";
  return "min-h-[68px]";
}

interface EditorContentBlockPanelProps {
  block: EditorContentBlock;
  blockIndex: number;
  context: EditorBlockPanelContext;
  isNotesTemplate: boolean;
  showSolutions: boolean;
  anchor: string;
  activeAnchor: string;
  active: boolean;
  openSignal?: number;
  solutionEntryMask?: TableSolutionEntryMask;
  dragHandleForLabel: (label: string) => ReactNode;
  openSignalForAnchor?: (anchor: string) => number | undefined;
  contentBlockForKind: (kind: SolutionInsertionBlockKind, visibility?: ContentBlockVisibility) => EditorContentBlock;
  diagramBlockForType: (type: string, visibility?: ContentBlockVisibility) => EditorContentBlock;
  onActivateAnchor: (anchor: string) => void;
  onContextMenuAnchor: (event: ReactMouseEvent<HTMLElement>, anchor: string) => void;
  onCompleteBlockInSolutions?: (nestedAnchor?: string) => void;
  onChange: (patch: Partial<EditorContentBlock>) => void;
  onRemove: () => void;
}

export function EditorContentBlockPanel({
  block,
  blockIndex,
  context,
  isNotesTemplate,
  showSolutions,
  anchor,
  activeAnchor,
  active,
  openSignal,
  solutionEntryMask,
  dragHandleForLabel,
  openSignalForAnchor,
  contentBlockForKind,
  diagramBlockForType,
  onActivateAnchor,
  onContextMenuAnchor,
  onCompleteBlockInSolutions,
  onChange,
  onRemove,
}: EditorContentBlockPanelProps) {
  const muted = context !== "question";

  if (block.kind === "space") {
    const label = spaceBlockLabel(context, isNotesTemplate, blockIndex);
    return (
      <SpaceBlockEditor
        label={label}
        title={<InlineSummaryTitle label={label} summary={spaceBlockSummary(block.lines)} />}
        lines={block.lines}
        showLines={block.showLines ?? true}
        settingsMode="inspector"
        dragHandle={dragHandleForLabel(`Drag ${label}`)}
        muted={muted}
        active={active}
        openSignal={openSignal}
        onChange={(patch) => onChange(patch as Partial<EditorContentBlock>)}
        onRemove={onRemove}
      />
    );
  }

  if (block.kind === "diagram") {
    const { label, dragLabel } = blockLabel(block.kind, context, blockIndex);
    const solutionSurfaceState = solutionSurfaceControlState(block);
    return (
      <DiagramBlockEditor
        label={label}
        graphConfig={block.graphConfig}
        alignment={block.diagramAlign}
        showSolutions={showSolutions}
        settingsMode="inspector"
        anchor={anchor}
        activeAnchor={activeAnchor}
        onActivateAnchor={onActivateAnchor}
        dragHandle={dragHandleForLabel(dragLabel)}
        muted={muted}
        active={active}
        openSignal={openSignal}
        onChange={(graphConfig) => onChange({ graphConfig } as Partial<EditorContentBlock>)}
        onAlignmentChange={(diagramAlign) => onChange({ diagramAlign } as Partial<EditorContentBlock>)}
        completeInSolutionsTitle={solutionSurfaceState.copyTitle}
        onCompleteInSolutions={
          onCompleteBlockInSolutions && solutionSurfaceState.canCreateSolutionCopy ? () => onCompleteBlockInSolutions() : undefined
        }
        onRemove={onRemove}
      />
    );
  }

  if (block.kind === "columns") {
    const { label, dragLabel } = blockLabel(block.kind, context, blockIndex);
    return (
      <ColumnsBlockEditor
        label={label}
        title={<InlineSummaryTitle label={label} summary={columnsBlockSummary(block)} />}
        block={block}
        anchor={anchor}
        activeAnchor={activeAnchor}
        showSolutions={showSolutions}
        spaceLabelPrefix={spaceLabelPrefix(context, isNotesTemplate)}
        dragHandle={dragHandleForLabel(dragLabel)}
        muted={muted}
        active={active}
        openSignal={openSignal}
        openSignalForAnchor={openSignalForAnchor}
        contentBlockForKind={contentBlockForKind}
        diagramBlockForType={diagramBlockForType}
        onActivateAnchor={onActivateAnchor}
        onContextMenuAnchor={onContextMenuAnchor}
        onCompleteBlockInSolutions={onCompleteBlockInSolutions}
        onChange={(patch) => onChange(patch as Partial<EditorContentBlock>)}
        onRemove={onRemove}
      />
    );
  }

  if (block.kind === "choices") {
    const { label, dragLabel } = blockLabel(block.kind, context, blockIndex);
    return (
      <ChoiceListBlockEditor
        label={label}
        title={<InlineSummaryTitle label={label} summary={choiceListSummary(block)} />}
        block={block}
        numberingStyleOptions={CHOICE_NUMBERING_STYLES}
        layoutOptions={CHOICE_LIST_LAYOUTS}
        showSolutions={showSolutions}
        settingsMode="inspector"
        dragHandle={dragHandleForLabel(dragLabel)}
        muted={muted}
        active={active}
        openSignal={openSignal}
        onChange={(patch) => onChange(patch as Partial<EditorContentBlock>)}
        onRemove={onRemove}
      />
    );
  }

  if (block.kind === "table") {
    const { label, dragLabel } = blockLabel(block.kind, context, blockIndex);
    return (
      <TableBlockEditor
        label={label}
        title={<InlineSummaryTitle label={label} summary={tableBlockSummary(block)} />}
        block={block}
        diagramAlignments={DIAGRAM_ALIGNMENTS}
        cellAlignments={TABLE_CELL_ALIGNMENTS}
        settingsMode="inspector"
        showSolutions={showSolutions}
        solutionEntryMask={solutionEntryMask}
        dragHandle={dragHandleForLabel(dragLabel)}
        muted={muted}
        active={active}
        openSignal={openSignal}
        onChange={(patch) => onChange(patch as Partial<EditorContentBlock>)}
        onCompleteInSolutions={onCompleteBlockInSolutions ? () => onCompleteBlockInSolutions() : undefined}
        onRemove={onRemove}
      />
    );
  }

  if (block.kind === "text") {
    const { label, dragLabel } = blockLabel(block.kind, context, blockIndex);
    return (
      <TextBlockEditor
        label={label}
        title={<InlineSummaryTitle label={label} summary={textBlockSummary(block.text ?? "")} />}
        text={block.text ?? ""}
        dragHandle={dragHandleForLabel(dragLabel)}
        muted={muted}
        active={active}
        openSignal={openSignal}
        minHeightClassName={textMinHeightClassName(context)}
        solutionMarkTools={isSolutionTextBlock(block)}
        onChange={(text) => onChange({ text } as Partial<EditorContentBlock>)}
        onRemove={onRemove}
      />
    );
  }

  return null;
}
