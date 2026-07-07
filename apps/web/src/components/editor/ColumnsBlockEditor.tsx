import { Fragment, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { ContentBlockVisibility } from "@mauth-studio/shared";

import { InlineSummaryTitle } from "@/components/MathText";
import { ChoiceListBlockEditor } from "@/components/editor/ChoiceListBlockEditor";
import { DiagramBlockEditor } from "@/components/editor/DiagramBlockEditor";
import { CollapsiblePanel, ContentInsertionActions, RemoveActionButton } from "@/components/editor/EditorPanels";
import { SpaceBlockEditor } from "@/components/editor/SpaceBlockEditor";
import { TableBlockEditor } from "@/components/editor/TableBlockEditor";
import { TextBlockEditor } from "@/components/editor/TextBlockEditor";
import { quickDiagramInsertActions } from "@/components/editor/diagramInsertionActions";
import {
  CHOICE_LIST_LAYOUTS,
  CHOICE_NUMBERING_STYLES,
  DIAGRAM_ALIGNMENTS,
  DIAGRAM_TYPES,
  TABLE_CELL_ALIGNMENTS,
} from "@/components/editor/editorOptions";
import { normalizeColumnsBlock } from "@/lib/contentBlockNormalization";
import {
  columnsBlockSummary,
  createEditorBlockSummaryRuntime,
  spaceBlockSummary,
  tableBlockSummary,
  textBlockSummary,
} from "@/lib/editorBlockSummaries";
import type { EditorContentBlock } from "@/lib/editorDocumentNormalization";
import { normalizeDiagramType, withGraphDefaults } from "@/lib/editorDiagramConfig";
import { columnChildScrollAnchor, scrollAnchorContains } from "@/lib/scrollAnchors";
import { isSolutionTextBlock, solutionModeInsertedBlockVisibility, type SolutionInsertionBlockKind } from "@/lib/solutionBlockVisibility";
import { tableSolutionEntryMasksForBlocks } from "@/lib/tableSolutionEntries";
import { cn } from "@/lib/utils";

type EditorColumnsBlock = Extract<EditorContentBlock, { kind: "columns" }>;
type ColumnsChildBlockKind = Exclude<SolutionInsertionBlockKind, "columns">;

interface ColumnsBlockEditorProps {
  label: string;
  title?: ReactNode;
  block: EditorColumnsBlock;
  anchor?: string;
  activeAnchor?: string;
  showSolutions?: boolean;
  spaceLabelPrefix?: string;
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  openSignalForAnchor?: (anchor: string) => number | undefined;
  contentBlockForKind: (kind: SolutionInsertionBlockKind, visibility?: ContentBlockVisibility) => EditorContentBlock;
  diagramBlockForType: (type: string, visibility?: ContentBlockVisibility) => EditorContentBlock;
  onActivateAnchor?: (anchor: string) => void;
  onContextMenuAnchor?: (event: ReactMouseEvent<HTMLElement>, anchor: string) => void;
  onChange: (patch: Partial<EditorColumnsBlock>) => void;
  onRemove: () => void;
}

const { choiceListSummary } = createEditorBlockSummaryRuntime({
  withGraphDefaults,
  normalizeDiagramType,
  diagramTypes: DIAGRAM_TYPES,
  choiceNumberingStyles: CHOICE_NUMBERING_STYLES,
});

export function ColumnsBlockEditor({
  label,
  title,
  block,
  anchor,
  activeAnchor,
  showSolutions = false,
  spaceLabelPrefix = "Answer space",
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  openSignalForAnchor: openNestedSignalForAnchor,
  contentBlockForKind,
  diagramBlockForType,
  onActivateAnchor,
  onContextMenuAnchor,
  onChange,
  onRemove,
}: ColumnsBlockEditorProps) {
  const normalized = normalizeColumnsBlock(block);
  const updateColumns = (columns: EditorContentBlock[][], columnCount = normalized.columnCount) => onChange({ columnCount, columns });
  const addColumnBlock = (
    columnIndex: number,
    kind: ColumnsChildBlockKind,
    visibility = solutionModeInsertedBlockVisibility(kind, showSolutions),
  ) => {
    const block = contentBlockForKind(kind, visibility);
    const columns = normalized.columns.map((column, index) => (index === columnIndex ? [...column, block] : column));
    updateColumns(columns);
    if (anchor) onActivateAnchor?.(columnChildScrollAnchor(anchor, columnIndex, block.id));
  };
  const addColumnDiagramBlock = (
    columnIndex: number,
    type: string,
    visibility = solutionModeInsertedBlockVisibility("diagram", showSolutions),
  ) => {
    const block = diagramBlockForType(type, visibility);
    const columns = normalized.columns.map((column, index) => (index === columnIndex ? [...column, block] : column));
    updateColumns(columns);
    if (anchor) onActivateAnchor?.(columnChildScrollAnchor(anchor, columnIndex, block.id));
  };
  const updateColumnBlock = (columnIndex: number, blockId: string, patch: Record<string, unknown>) => {
    const columns = normalized.columns.map((column, index) =>
      index === columnIndex
        ? column.map((child) => (child.id === blockId ? ({ ...child, ...patch } as EditorContentBlock) : child))
        : column,
    );
    updateColumns(columns);
  };
  const removeColumnBlock = (columnIndex: number, blockId: string) => {
    const columns = normalized.columns.map((column, index) =>
      index === columnIndex ? column.filter((child) => child.id !== blockId) : column,
    );
    updateColumns(columns);
  };

  const renderColumnChildBlock = (columnIndex: number, child: EditorContentBlock, childIndex: number) => {
    const columnBlocks = normalized.columns[columnIndex] ?? [];
    const columnTableSolutionEntryMasks = child.kind === "table" ? tableSolutionEntryMasksForBlocks(columnBlocks) : undefined;
    const childNumber = childIndex + 1;
    const childLabelPrefix = `Column ${columnIndex + 1}`;
    const childAnchor = anchor ? columnChildScrollAnchor(anchor, columnIndex, child.id) : "";
    const childActive = Boolean(childAnchor && scrollAnchorContains(childAnchor, activeAnchor));
    const childOpenSignal = childAnchor && openNestedSignalForAnchor ? openNestedSignalForAnchor(childAnchor) : undefined;
    const wrapChild = (node: ReactNode) => {
      if (!childAnchor) return <Fragment key={child.id}>{node}</Fragment>;
      const activateChildAnchor = () => onActivateAnchor?.(childAnchor);
      return (
        <div
          key={child.id}
          data-scroll-anchor={childAnchor}
          className="rounded-md transition-colors"
          onPointerDownCapture={activateChildAnchor}
          onFocusCapture={activateChildAnchor}
          onContextMenu={(event) => onContextMenuAnchor?.(event, childAnchor)}
        >
          {node}
        </div>
      );
    };

    if (child.kind === "space") {
      const spaceLabel = `${spaceLabelPrefix} ${childNumber}`;
      return wrapChild(
        <SpaceBlockEditor
          label={`${childLabelPrefix} ${spaceLabelPrefix.toLowerCase()} ${childNumber}`}
          title={<InlineSummaryTitle label={spaceLabel} summary={spaceBlockSummary(child.lines)} />}
          lines={child.lines}
          showLines={child.showLines ?? true}
          settingsMode="inspector"
          muted
          active={childActive}
          openSignal={childOpenSignal}
          onChange={(patch) => updateColumnBlock(columnIndex, child.id, patch)}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    if (child.kind === "diagram") {
      return wrapChild(
        <DiagramBlockEditor
          label={`${childLabelPrefix} diagram ${childNumber}`}
          graphConfig={child.graphConfig}
          alignment={child.diagramAlign}
          showSolutions={showSolutions}
          settingsMode="inspector"
          anchor={childAnchor}
          activeAnchor={activeAnchor}
          onActivateAnchor={onActivateAnchor}
          muted
          active={childActive}
          openSignal={childOpenSignal}
          onChange={(graphConfig) => updateColumnBlock(columnIndex, child.id, { graphConfig })}
          onAlignmentChange={(diagramAlign) => updateColumnBlock(columnIndex, child.id, { diagramAlign })}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    if (child.kind === "choices") {
      return wrapChild(
        <ChoiceListBlockEditor
          label={`${childLabelPrefix} choice list ${childNumber}`}
          title={<InlineSummaryTitle label={`Choice list ${childNumber}`} summary={choiceListSummary(child)} />}
          block={child}
          numberingStyleOptions={CHOICE_NUMBERING_STYLES}
          layoutOptions={CHOICE_LIST_LAYOUTS}
          settingsMode="inspector"
          muted
          active={childActive}
          openSignal={childOpenSignal}
          onChange={(patch) => updateColumnBlock(columnIndex, child.id, patch as Record<string, unknown>)}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    if (child.kind === "table") {
      return wrapChild(
        <TableBlockEditor
          label={`${childLabelPrefix} table ${childNumber}`}
          title={<InlineSummaryTitle label={`Table ${childNumber}`} summary={tableBlockSummary(child)} />}
          block={child}
          diagramAlignments={DIAGRAM_ALIGNMENTS}
          cellAlignments={TABLE_CELL_ALIGNMENTS}
          settingsMode="inspector"
          solutionEntryMask={columnTableSolutionEntryMasks?.[child.id]}
          muted
          active={childActive}
          openSignal={childOpenSignal}
          onChange={(patch) => updateColumnBlock(columnIndex, child.id, patch as Record<string, unknown>)}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    if (child.kind === "columns") {
      return wrapChild(
        <ColumnsBlockEditor
          label={`${childLabelPrefix} nested columns ${childNumber}`}
          title={<InlineSummaryTitle label={`Nested columns ${childNumber}`} summary={columnsBlockSummary(child)} />}
          block={child}
          anchor={childAnchor}
          activeAnchor={activeAnchor}
          showSolutions={showSolutions}
          spaceLabelPrefix={spaceLabelPrefix}
          muted
          active={childActive}
          openSignal={childOpenSignal}
          openSignalForAnchor={openNestedSignalForAnchor}
          contentBlockForKind={contentBlockForKind}
          diagramBlockForType={diagramBlockForType}
          onActivateAnchor={onActivateAnchor}
          onChange={(patch) => updateColumnBlock(columnIndex, child.id, patch as Record<string, unknown>)}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    if (child.kind === "text") {
      return wrapChild(
        <TextBlockEditor
          label={`${childLabelPrefix} text ${childNumber}`}
          title={<InlineSummaryTitle label={`Text ${childNumber}`} summary={textBlockSummary(child.text ?? "")} />}
          text={child.text ?? ""}
          muted
          active={childActive}
          openSignal={childOpenSignal}
          minHeightClassName="min-h-[74px]"
          solutionMarkTools={isSolutionTextBlock(child)}
          onChange={(text) => updateColumnBlock(columnIndex, child.id, { text })}
          onRemove={() => removeColumnBlock(columnIndex, child.id)}
        />,
      );
    }

    return null;
  };

  return (
    <CollapsiblePanel
      title={title ?? <InlineSummaryTitle label={label} summary={columnsBlockSummary(block)} />}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn(muted && "bg-muted/25")}
      bodyClassName="space-y-3"
      active={active}
      openSignal={openSignal}
    >
      <div className="grid min-w-0 gap-3" style={{ gridTemplateColumns: `repeat(${normalized.columnCount}, minmax(0, 1fr))` }}>
        {normalized.columns.map((column, columnIndex) => (
          <section key={columnIndex} className="min-w-0 space-y-3 rounded-md border bg-background p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Column {columnIndex + 1}</div>
            {column.length ? (
              <div className="min-w-0 space-y-3">
                {column.map((child, childIndex) => renderColumnChildBlock(columnIndex, child, childIndex))}
              </div>
            ) : null}
            <ContentInsertionActions
              buttonLabel="Add"
              solutionMode={showSolutions}
              className="pt-1"
              onAddText={() => addColumnBlock(columnIndex, "text")}
              onAddChoices={() => addColumnBlock(columnIndex, "choices")}
              onAddTable={() => addColumnBlock(columnIndex, "table")}
              onAddDiagram={() => addColumnBlock(columnIndex, "diagram")}
              diagramActions={quickDiagramInsertActions((type) => addColumnDiagramBlock(columnIndex, type))}
              onAddSpace={() => addColumnBlock(columnIndex, "space")}
            />
          </section>
        ))}
      </div>
    </CollapsiblePanel>
  );
}
