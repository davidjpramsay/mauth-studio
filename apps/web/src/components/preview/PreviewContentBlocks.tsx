import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  ChoiceListLayout,
  ChoiceNumberingStyle,
  ContentBlock,
  DiagramAlignment,
  DiagramTextSide,
  GraphConfig,
  TableCellAlignment,
} from "@mauth-studio/shared";

import { cn } from "@/lib/utils";

type EditorContentBlock = ContentBlock;
type PreviewTable = {
  tableAlign: DiagramAlignment;
  cellAlignment: TableCellAlignment;
  headers: string[];
  rows: string[][];
  showHeader: boolean;
};

export interface VisibilityReplacementSlotGroup {
  studentBlock: EditorContentBlock;
  solutionBlocks: EditorContentBlock[];
  blocks: EditorContentBlock[];
  endIndex: number;
}

export interface PreviewContentRuntime {
  choiceLabel: (style: ChoiceNumberingStyle | undefined, index: number) => string;
  diagramAlignmentClass: (alignment?: DiagramAlignment) => string;
  effectiveDiagramTextSide: (block: Extract<EditorContentBlock, { kind: "diagram" }>, hasBesideContent: boolean) => DiagramTextSide;
  graphHeight: (graphConfig?: GraphConfig | null) => number;
  isContentBlockVisible: (block: EditorContentBlock, showSolutions: boolean) => boolean;
  isDiagramBesideContentBlock: (block: EditorContentBlock | undefined, showSolutions: boolean) => boolean;
  isSolutionTextBlock: (block: EditorContentBlock) => boolean;
  measuredLineHeightPx: (element: HTMLElement) => number;
  normalizeChoiceItems: (value: unknown) => string[];
  normalizeChoiceListLayout: (value: unknown) => ChoiceListLayout;
  normalizeTableBlock: (block: Extract<EditorContentBlock, { kind: "table" }>) => PreviewTable;
  plainTableRows: (table: PreviewTable) => string[][];
  previewSelectionAttr: (anchor: string | undefined, activeAnchor?: string) => "true" | undefined;
  solutionSlotToleranceLines: (studentBlock: EditorContentBlock) => number;
  spaceLines: (value: unknown) => number;
  visibilityReplacementSlotAt: (blocks: EditorContentBlock[], startIndex: number) => VisibilityReplacementSlotGroup | null;
}

export interface PreviewContentRenderers {
  renderDiagram: (props: {
    graphConfig?: GraphConfig | null;
    measureOnly?: boolean;
    showSolutions?: boolean;
    onGraphConfigChange?: (graphConfig: GraphConfig) => void;
  }) => ReactNode;
  renderMath: (source: string, options?: { showSolutionMarks?: boolean }) => ReactNode;
}

export interface PreviewContentBlocksProps {
  blocks: EditorContentBlock[];
  measureOnly?: boolean;
  showSolutions?: boolean;
  onGraphConfigChange?: (blockId: string, graphConfig: GraphConfig) => void;
  blockAnchorFor?: (block: EditorContentBlock) => string | undefined;
  activePreviewAnchor?: string;
  runtime: PreviewContentRuntime;
  renderers: PreviewContentRenderers;
}

function ChoiceListPreview({
  block,
  runtime,
  renderers,
}: {
  block: Extract<EditorContentBlock, { kind: "choices" }>;
  runtime: PreviewContentRuntime;
  renderers: PreviewContentRenderers;
}) {
  const choices = runtime.normalizeChoiceItems(block.choices);
  const layout = runtime.normalizeChoiceListLayout(block.layout);

  return (
    <div
      className={cn(
        "test-choice-list",
        layout === "two-column" && "test-choice-list-two-column",
        layout === "inline" && "test-choice-list-inline",
      )}
    >
      {choices.map((choice, index) => (
        <div key={`${choice}-${index}`} className="test-choice-item">
          <span className="test-choice-label">{runtime.choiceLabel(block.numberingStyle, index)}</span>
          <div className="test-choice-content">{renderers.renderMath(choice)}</div>
        </div>
      ))}
    </div>
  );
}

function TablePreview({
  block,
  runtime,
  renderers,
}: {
  block: Extract<EditorContentBlock, { kind: "table" }>;
  runtime: PreviewContentRuntime;
  renderers: PreviewContentRenderers;
}) {
  const table = runtime.normalizeTableBlock(block);
  const rows = runtime.plainTableRows(table);

  return (
    <div className={cn("test-table-wrap", `test-table-${table.tableAlign}`)}>
      <table className="test-table">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`} className={cn("test-table-cell", `test-table-cell-${table.cellAlignment}`)}>
                  {renderers.renderMath(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisibilityReplacementSlot({
  studentBlock,
  solutionBlocks,
  measureOnly,
  showSolutions,
  onGraphConfigChange,
  blockAnchorFor,
  activePreviewAnchor,
  runtime,
  renderers,
}: {
  studentBlock: EditorContentBlock;
  solutionBlocks: EditorContentBlock[];
  measureOnly: boolean;
  showSolutions: boolean;
  onGraphConfigChange?: (blockId: string, graphConfig: GraphConfig) => void;
  blockAnchorFor?: (block: EditorContentBlock) => string | undefined;
  activePreviewAnchor?: string;
  runtime: PreviewContentRuntime;
  renderers: PreviewContentRenderers;
}) {
  const studentRef = useRef<HTMLDivElement | null>(null);
  const solutionRef = useRef<HTMLDivElement | null>(null);
  const [overflowLines, setOverflowLines] = useState(0);
  const solutionBlocksKey = solutionBlocks.map((block) => block.id).join(":");

  useLayoutEffect(() => {
    if (measureOnly || !showSolutions) {
      setOverflowLines(0);
      return;
    }

    const studentElement = studentRef.current;
    const solutionElement = solutionRef.current;
    if (!studentElement || !solutionElement) return;

    let animationFrame = 0;
    const updateOverflow = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const studentHeight = studentElement.getBoundingClientRect().height;
        const solutionHeight = solutionElement.getBoundingClientRect().height;
        const difference = solutionHeight - studentHeight;
        const spaceLineHeight = studentBlock.kind === "space" ? studentHeight / runtime.spaceLines(studentBlock.lines) : 0;
        const lineHeight =
          Number.isFinite(spaceLineHeight) && spaceLineHeight > 0 ? spaceLineHeight : runtime.measuredLineHeightPx(studentElement);
        const tolerancePx = runtime.solutionSlotToleranceLines(studentBlock) * lineHeight;

        setOverflowLines(difference > tolerancePx ? Math.max(1, Math.ceil(difference / lineHeight)) : 0);
      });
    };

    updateOverflow();
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(studentElement);
    resizeObserver.observe(solutionElement);
    void document.fonts?.ready.then(updateOverflow);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [measureOnly, renderers, runtime, showSolutions, solutionBlocksKey, studentBlock]);

  return (
    <div className="test-visibility-slot">
      <div
        ref={studentRef}
        className={cn("test-visibility-slot-copy", showSolutions && "test-visibility-slot-copy-hidden")}
        aria-hidden={showSolutions}
      >
        <PreviewContentBlocks
          blocks={[studentBlock]}
          measureOnly={measureOnly}
          showSolutions={false}
          blockAnchorFor={showSolutions ? undefined : blockAnchorFor}
          activePreviewAnchor={activePreviewAnchor}
          onGraphConfigChange={onGraphConfigChange}
          runtime={runtime}
          renderers={renderers}
        />
      </div>
      <div
        ref={solutionRef}
        className={cn("test-visibility-slot-copy", !showSolutions && "test-visibility-slot-copy-hidden")}
        aria-hidden={!showSolutions}
      >
        <PreviewContentBlocks
          blocks={solutionBlocks}
          measureOnly={measureOnly}
          showSolutions
          blockAnchorFor={showSolutions ? blockAnchorFor : undefined}
          activePreviewAnchor={activePreviewAnchor}
          onGraphConfigChange={onGraphConfigChange}
          runtime={runtime}
          renderers={renderers}
        />
      </div>
      {!measureOnly && overflowLines ? (
        <div className="test-visibility-slot-warning" role="status">
          Solution needs about {overflowLines} more line{overflowLines === 1 ? "" : "s"} than the student space.
        </div>
      ) : null}
    </div>
  );
}

function DiagramWithBesideNode({
  diagramBlock,
  diagramAnchor,
  textSide,
  besideNode,
  besideAnchor,
  besideNodeHasOwnAnchor = false,
  activePreviewAnchor,
  measureOnly,
  showSolutions,
  onGraphConfigChange,
  runtime,
  renderers,
}: {
  diagramBlock: Extract<EditorContentBlock, { kind: "diagram" }>;
  diagramAnchor?: string;
  textSide: DiagramTextSide;
  besideNode: ReactNode;
  besideAnchor?: string;
  besideNodeHasOwnAnchor?: boolean;
  activePreviewAnchor?: string;
  measureOnly: boolean;
  showSolutions: boolean;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
  runtime: PreviewContentRuntime;
  renderers: PreviewContentRenderers;
}) {
  const diagramNode = (
    <div
      data-scroll-anchor={diagramAnchor}
      data-preview-module-anchor={diagramAnchor ? "true" : undefined}
      data-preview-selected={runtime.previewSelectionAttr(diagramAnchor, activePreviewAnchor)}
      className={cn("test-diagram-pair-diagram flex min-w-0", runtime.diagramAlignmentClass(diagramBlock.diagramAlign))}
    >
      {renderers.renderDiagram({
        graphConfig: diagramBlock.graphConfig,
        measureOnly,
        showSolutions,
        onGraphConfigChange: measureOnly ? undefined : onGraphConfigChange,
      })}
    </div>
  );
  const textNode = (
    <div
      data-scroll-anchor={besideNodeHasOwnAnchor ? undefined : besideAnchor}
      data-preview-module-anchor={!besideNodeHasOwnAnchor && besideAnchor ? "true" : undefined}
      data-preview-selected={besideNodeHasOwnAnchor ? undefined : runtime.previewSelectionAttr(besideAnchor, activePreviewAnchor)}
      className="test-diagram-pair-text min-w-0"
    >
      {besideNode}
    </div>
  );

  return (
    <div className={cn("test-diagram-text-pair", textSide === "left" ? "test-diagram-text-left" : "test-diagram-text-right")}>
      {diagramNode}
      {textNode}
    </div>
  );
}

function DiagramBesideContentBlock({
  block,
  blockAnchor,
  activePreviewAnchor,
  measureOnly,
  showSolutions,
  onGraphConfigChange,
  runtime,
  renderers,
}: {
  block: EditorContentBlock;
  blockAnchor?: string;
  activePreviewAnchor?: string;
  measureOnly: boolean;
  showSolutions: boolean;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
  runtime: PreviewContentRuntime;
  renderers: PreviewContentRenderers;
}) {
  if (block.kind === "text") {
    const isSolutionText = runtime.isSolutionTextBlock(block);
    return (
      <div
        data-scroll-anchor={blockAnchor}
        data-preview-module-anchor={blockAnchor ? "true" : undefined}
        data-preview-selected={runtime.previewSelectionAttr(blockAnchor, activePreviewAnchor)}
        className={cn("test-text-block", isSolutionText && "test-solution-block")}
      >
        {renderers.renderMath(block.text ?? "", { showSolutionMarks: isSolutionText })}
      </div>
    );
  }

  if (block.kind === "space") {
    return (
      <div
        data-scroll-anchor={blockAnchor}
        data-preview-module-anchor={blockAnchor ? "true" : undefined}
        data-preview-selected={runtime.previewSelectionAttr(blockAnchor, activePreviewAnchor)}
        className="test-space-block"
        style={{ "--space-lines": String(runtime.spaceLines(block.lines)) } as CSSProperties & Record<`--${string}`, string>}
      />
    );
  }

  if (block.kind === "choices") {
    return (
      <div
        data-scroll-anchor={blockAnchor}
        data-preview-module-anchor={blockAnchor ? "true" : undefined}
        data-preview-selected={runtime.previewSelectionAttr(blockAnchor, activePreviewAnchor)}
      >
        <ChoiceListPreview block={block} runtime={runtime} renderers={renderers} />
      </div>
    );
  }

  if (block.kind === "table") {
    return (
      <div
        data-scroll-anchor={blockAnchor}
        data-preview-module-anchor={blockAnchor ? "true" : undefined}
        data-preview-selected={runtime.previewSelectionAttr(blockAnchor, activePreviewAnchor)}
      >
        <TablePreview block={block} runtime={runtime} renderers={renderers} />
      </div>
    );
  }

  if (block.kind === "diagram") {
    return (
      <div
        data-scroll-anchor={blockAnchor}
        data-preview-module-anchor={blockAnchor ? "true" : undefined}
        data-preview-selected={runtime.previewSelectionAttr(blockAnchor, activePreviewAnchor)}
        className={cn("test-diagram-wrap flex min-w-0", runtime.diagramAlignmentClass(block.diagramAlign))}
      >
        {renderers.renderDiagram({
          graphConfig: block.graphConfig,
          measureOnly,
          showSolutions,
          onGraphConfigChange: measureOnly ? undefined : onGraphConfigChange,
        })}
      </div>
    );
  }

  return null;
}

function DiagramBesideContentBlocks({
  blocks,
  measureOnly,
  showSolutions,
  onGraphConfigChange,
  blockAnchorFor,
  activePreviewAnchor,
  runtime,
  renderers,
}: {
  blocks: EditorContentBlock[];
  measureOnly: boolean;
  showSolutions: boolean;
  onGraphConfigChange?: (blockId: string, graphConfig: GraphConfig) => void;
  blockAnchorFor?: (block: EditorContentBlock) => string | undefined;
  activePreviewAnchor?: string;
  runtime: PreviewContentRuntime;
  renderers: PreviewContentRenderers;
}) {
  return (
    <>
      {blocks
        .filter((block) => runtime.isContentBlockVisible(block, showSolutions))
        .map((block) => (
          <DiagramBesideContentBlock
            key={block.id}
            block={block}
            blockAnchor={measureOnly ? undefined : blockAnchorFor?.(block)}
            activePreviewAnchor={activePreviewAnchor}
            measureOnly={measureOnly}
            showSolutions={showSolutions}
            onGraphConfigChange={!onGraphConfigChange ? undefined : (graphConfig) => onGraphConfigChange(block.id, graphConfig)}
            runtime={runtime}
            renderers={renderers}
          />
        ))}
    </>
  );
}

function DiagramWithBesideSolutionSlot({
  diagramBlock,
  diagramAnchor,
  textSide,
  studentBlock,
  solutionBlocks,
  activePreviewAnchor,
  measureOnly,
  showSolutions,
  onGraphConfigChange,
  blockAnchorFor,
  runtime,
  renderers,
}: {
  diagramBlock: Extract<EditorContentBlock, { kind: "diagram" }>;
  diagramAnchor?: string;
  textSide: DiagramTextSide;
  studentBlock: EditorContentBlock;
  solutionBlocks: EditorContentBlock[];
  activePreviewAnchor?: string;
  measureOnly: boolean;
  showSolutions: boolean;
  onGraphConfigChange?: (blockId: string, graphConfig: GraphConfig) => void;
  blockAnchorFor?: (block: EditorContentBlock) => string | undefined;
  runtime: PreviewContentRuntime;
  renderers: PreviewContentRenderers;
}) {
  const lines = studentBlock.kind === "space" ? runtime.spaceLines(studentBlock.lines) : 0;
  return (
    <div
      className={cn(
        "test-diagram-text-pair test-diagram-solution-pair",
        textSide === "left" ? "test-diagram-text-left" : "test-diagram-text-right",
      )}
      style={
        {
          "--space-lines": String(lines),
        } as CSSProperties & Record<`--${string}`, string>
      }
    >
      <div
        data-scroll-anchor={diagramAnchor}
        data-preview-module-anchor={diagramAnchor ? "true" : undefined}
        data-preview-selected={runtime.previewSelectionAttr(diagramAnchor, activePreviewAnchor)}
        className={cn("test-diagram-pair-diagram flex min-w-0", runtime.diagramAlignmentClass(diagramBlock.diagramAlign))}
      >
        {renderers.renderDiagram({
          graphConfig: diagramBlock.graphConfig,
          measureOnly,
          showSolutions,
          onGraphConfigChange:
            measureOnly || !onGraphConfigChange ? undefined : (graphConfig) => onGraphConfigChange(diagramBlock.id, graphConfig),
        })}
      </div>
      <DiagramBesideContentBlocks
        blocks={solutionBlocks}
        measureOnly={measureOnly}
        showSolutions={showSolutions}
        blockAnchorFor={blockAnchorFor}
        activePreviewAnchor={activePreviewAnchor}
        onGraphConfigChange={onGraphConfigChange}
        runtime={runtime}
        renderers={renderers}
      />
    </div>
  );
}

function DiagramWithBesideSpaceNode({
  diagramBlock,
  diagramAnchor,
  textSide,
  spaceBlock,
  spaceAnchor,
  activePreviewAnchor,
  measureOnly,
  showSolutions,
  onGraphConfigChange,
  runtime,
  renderers,
}: {
  diagramBlock: Extract<EditorContentBlock, { kind: "diagram" }>;
  diagramAnchor?: string;
  textSide: DiagramTextSide;
  spaceBlock: Extract<EditorContentBlock, { kind: "space" }>;
  spaceAnchor?: string;
  activePreviewAnchor?: string;
  measureOnly: boolean;
  showSolutions: boolean;
  onGraphConfigChange?: (graphConfig: GraphConfig) => void;
  runtime: PreviewContentRuntime;
  renderers: PreviewContentRenderers;
}) {
  const lines = runtime.spaceLines(spaceBlock.lines);
  return (
    <div
      className={cn("test-diagram-space-pair", textSide === "left" ? "test-diagram-text-left" : "test-diagram-text-right")}
      style={
        {
          "--space-lines": String(lines),
        } as CSSProperties & Record<`--${string}`, string>
      }
    >
      <div
        data-scroll-anchor={diagramAnchor}
        data-preview-module-anchor={diagramAnchor ? "true" : undefined}
        data-preview-selected={runtime.previewSelectionAttr(diagramAnchor, activePreviewAnchor)}
        className={cn("test-diagram-pair-diagram flex min-w-0", runtime.diagramAlignmentClass(diagramBlock.diagramAlign))}
      >
        {renderers.renderDiagram({
          graphConfig: diagramBlock.graphConfig,
          measureOnly,
          showSolutions,
          onGraphConfigChange: measureOnly ? undefined : onGraphConfigChange,
        })}
      </div>
      <div
        data-scroll-anchor={spaceAnchor}
        data-preview-module-anchor={spaceAnchor ? "true" : undefined}
        data-preview-module-shape="l-space"
        data-preview-selected={runtime.previewSelectionAttr(spaceAnchor, activePreviewAnchor)}
        className="test-diagram-l-space-segment test-diagram-l-space-side"
      />
      <div
        data-scroll-anchor={spaceAnchor}
        data-preview-module-anchor={spaceAnchor ? "true" : undefined}
        data-preview-module-shape="l-space"
        data-preview-selected={runtime.previewSelectionAttr(spaceAnchor, activePreviewAnchor)}
        className="test-diagram-l-space-segment test-diagram-l-space-under-side"
      />
      <div
        data-scroll-anchor={spaceAnchor}
        data-preview-module-anchor={spaceAnchor ? "true" : undefined}
        data-preview-module-shape="l-space"
        data-preview-selected={runtime.previewSelectionAttr(spaceAnchor, activePreviewAnchor)}
        className="test-diagram-l-space-segment test-diagram-l-space-under-diagram"
      />
    </div>
  );
}

export function PreviewContentBlocks({
  blocks,
  measureOnly = false,
  showSolutions = true,
  onGraphConfigChange,
  blockAnchorFor,
  activePreviewAnchor,
  runtime,
  renderers,
}: PreviewContentBlocksProps) {
  const renderedBlocks: ReactNode[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.kind === "pageBreak") continue;
    const replacementSlot = runtime.visibilityReplacementSlotAt(blocks, index);
    if (replacementSlot) {
      const { studentBlock, solutionBlocks } = replacementSlot;
      renderedBlocks.push(
        <VisibilityReplacementSlot
          key={`${studentBlock.id}:${solutionBlocks.map((solutionBlock) => solutionBlock.id).join(":")}`}
          studentBlock={studentBlock}
          solutionBlocks={solutionBlocks}
          measureOnly={measureOnly}
          showSolutions={showSolutions}
          blockAnchorFor={blockAnchorFor}
          activePreviewAnchor={activePreviewAnchor}
          onGraphConfigChange={onGraphConfigChange}
          runtime={runtime}
          renderers={renderers}
        />,
      );
      index = replacementSlot.endIndex;
      continue;
    }
    const nextBlock = blocks[index + 1];
    if (!runtime.isContentBlockVisible(block, showSolutions)) continue;
    const blockAnchor = measureOnly ? undefined : blockAnchorFor?.(block);
    if (block.kind === "diagram") {
      const replacementSlotFollows = runtime.visibilityReplacementSlotAt(blocks, index + 1);
      const replacementTextSide = runtime.effectiveDiagramTextSide(block, Boolean(replacementSlotFollows));
      if (replacementTextSide !== "none" && replacementSlotFollows) {
        const { studentBlock, solutionBlocks } = replacementSlotFollows;
        if (!showSolutions && studentBlock.kind === "space") {
          renderedBlocks.push(
            <DiagramWithBesideSpaceNode
              key={`${block.id}:${studentBlock.id}:student-space`}
              diagramBlock={block}
              diagramAnchor={blockAnchor}
              textSide={replacementTextSide}
              spaceBlock={studentBlock}
              spaceAnchor={measureOnly ? undefined : blockAnchorFor?.(studentBlock)}
              activePreviewAnchor={activePreviewAnchor}
              measureOnly={measureOnly}
              showSolutions={showSolutions}
              onGraphConfigChange={!onGraphConfigChange ? undefined : (graphConfig) => onGraphConfigChange(block.id, graphConfig)}
              runtime={runtime}
              renderers={renderers}
            />,
          );
          index = replacementSlotFollows.endIndex;
          continue;
        }
        if (showSolutions) {
          renderedBlocks.push(
            <DiagramWithBesideSolutionSlot
              key={`${block.id}:${studentBlock.id}:${solutionBlocks.map((solutionBlock) => solutionBlock.id).join(":")}:solutions`}
              diagramBlock={block}
              diagramAnchor={blockAnchor}
              textSide={replacementTextSide}
              studentBlock={studentBlock}
              solutionBlocks={solutionBlocks}
              activePreviewAnchor={activePreviewAnchor}
              measureOnly={measureOnly}
              showSolutions={showSolutions}
              onGraphConfigChange={onGraphConfigChange}
              blockAnchorFor={blockAnchorFor}
              runtime={runtime}
              renderers={renderers}
            />,
          );
          index = replacementSlotFollows.endIndex;
          continue;
        }

        const besideAnchor = measureOnly ? undefined : blockAnchorFor?.(studentBlock);
        renderedBlocks.push(
          <div key={`${block.id}:${studentBlock.id}:${solutionBlocks.map((solutionBlock) => solutionBlock.id).join(":")}`}>
            <DiagramWithBesideNode
              diagramBlock={block}
              diagramAnchor={blockAnchor}
              textSide={replacementTextSide}
              besideAnchor={besideAnchor}
              besideNodeHasOwnAnchor
              activePreviewAnchor={activePreviewAnchor}
              measureOnly={measureOnly}
              showSolutions={showSolutions}
              onGraphConfigChange={!onGraphConfigChange ? undefined : (graphConfig) => onGraphConfigChange(block.id, graphConfig)}
              runtime={runtime}
              renderers={renderers}
              besideNode={
                <DiagramBesideContentBlock
                  block={studentBlock}
                  blockAnchor={besideAnchor}
                  activePreviewAnchor={activePreviewAnchor}
                  measureOnly={measureOnly}
                  showSolutions={showSolutions}
                  onGraphConfigChange={
                    !onGraphConfigChange ? undefined : (graphConfig) => onGraphConfigChange(studentBlock.id, graphConfig)
                  }
                  runtime={runtime}
                  renderers={renderers}
                />
              }
            />
          </div>,
        );
        index = replacementSlotFollows.endIndex;
        continue;
      }
      const besideBlockFollows = runtime.isDiagramBesideContentBlock(nextBlock, showSolutions);
      const textSide = runtime.effectiveDiagramTextSide(block, besideBlockFollows);
      if (textSide !== "none" && nextBlock && runtime.isDiagramBesideContentBlock(nextBlock, showSolutions)) {
        if (nextBlock.kind === "space") {
          renderedBlocks.push(
            <DiagramWithBesideSpaceNode
              key={`${block.id}:${nextBlock.id}`}
              diagramBlock={block}
              diagramAnchor={blockAnchor}
              textSide={textSide}
              spaceBlock={nextBlock}
              spaceAnchor={measureOnly ? undefined : blockAnchorFor?.(nextBlock)}
              activePreviewAnchor={activePreviewAnchor}
              measureOnly={measureOnly}
              showSolutions={showSolutions}
              onGraphConfigChange={!onGraphConfigChange ? undefined : (graphConfig) => onGraphConfigChange(block.id, graphConfig)}
              runtime={runtime}
              renderers={renderers}
            />,
          );
          index += 1;
          continue;
        }
        renderedBlocks.push(
          <div key={`${block.id}:${nextBlock.id}`}>
            <DiagramWithBesideNode
              diagramBlock={block}
              diagramAnchor={blockAnchor}
              textSide={textSide}
              besideAnchor={measureOnly ? undefined : blockAnchorFor?.(nextBlock)}
              besideNodeHasOwnAnchor
              activePreviewAnchor={activePreviewAnchor}
              measureOnly={measureOnly}
              showSolutions={showSolutions}
              onGraphConfigChange={!onGraphConfigChange ? undefined : (graphConfig) => onGraphConfigChange(block.id, graphConfig)}
              runtime={runtime}
              renderers={renderers}
              besideNode={
                <DiagramBesideContentBlock
                  block={nextBlock}
                  blockAnchor={measureOnly ? undefined : blockAnchorFor?.(nextBlock)}
                  activePreviewAnchor={activePreviewAnchor}
                  measureOnly={measureOnly}
                  showSolutions={showSolutions}
                  onGraphConfigChange={!onGraphConfigChange ? undefined : (graphConfig) => onGraphConfigChange(nextBlock.id, graphConfig)}
                  runtime={runtime}
                  renderers={renderers}
                />
              }
            />
          </div>,
        );
        index += 1;
        continue;
      }
    }

    if (block.kind === "space") {
      renderedBlocks.push(
        <div
          key={block.id}
          data-scroll-anchor={blockAnchor}
          data-preview-module-anchor={blockAnchor ? "true" : undefined}
          data-preview-selected={runtime.previewSelectionAttr(blockAnchor, activePreviewAnchor)}
          className="test-space-block"
          style={{ "--space-lines": String(runtime.spaceLines(block.lines)) } as CSSProperties & Record<`--${string}`, string>}
        />,
      );
      continue;
    }
    if (block.kind === "diagram") {
      renderedBlocks.push(
        <div
          key={block.id}
          data-scroll-anchor={blockAnchor}
          data-preview-module-anchor={blockAnchor ? "true" : undefined}
          data-preview-selected={runtime.previewSelectionAttr(blockAnchor, activePreviewAnchor)}
          className={cn("test-diagram-wrap flex min-w-0", runtime.diagramAlignmentClass(block.diagramAlign))}
        >
          {renderers.renderDiagram({
            graphConfig: block.graphConfig,
            measureOnly,
            showSolutions,
            onGraphConfigChange:
              measureOnly || !onGraphConfigChange ? undefined : (graphConfig) => onGraphConfigChange(block.id, graphConfig),
          })}
        </div>,
      );
      continue;
    }
    if (block.kind === "choices") {
      renderedBlocks.push(
        <div
          key={block.id}
          data-scroll-anchor={blockAnchor}
          data-preview-module-anchor={blockAnchor ? "true" : undefined}
          data-preview-selected={runtime.previewSelectionAttr(blockAnchor, activePreviewAnchor)}
        >
          <ChoiceListPreview block={block} runtime={runtime} renderers={renderers} />
        </div>,
      );
      continue;
    }
    if (block.kind === "table") {
      renderedBlocks.push(
        <div
          key={block.id}
          data-scroll-anchor={blockAnchor}
          data-preview-module-anchor={blockAnchor ? "true" : undefined}
          data-preview-selected={runtime.previewSelectionAttr(blockAnchor, activePreviewAnchor)}
        >
          <TablePreview block={block} runtime={runtime} renderers={renderers} />
        </div>,
      );
      continue;
    }

    const isSolutionText = runtime.isSolutionTextBlock(block);
    renderedBlocks.push(
      <div
        key={block.id}
        data-scroll-anchor={blockAnchor}
        data-preview-module-anchor={blockAnchor ? "true" : undefined}
        data-preview-selected={runtime.previewSelectionAttr(blockAnchor, activePreviewAnchor)}
        className={cn("test-text-block", isSolutionText && "test-solution-block")}
      >
        {renderers.renderMath(block.text ?? "", { showSolutionMarks: isSolutionText })}
      </div>,
    );
  }

  return <div className="test-content-stack">{renderedBlocks}</div>;
}
