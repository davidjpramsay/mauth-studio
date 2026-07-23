import { Fragment, type DragEvent, type ReactNode } from "react";
import { FileText, GitBranch } from "lucide-react";

import { InlineSummaryTitle } from "@/components/MathText";
import { ContainerWordingEditor } from "@/components/editor/ContainerWordingEditor";
import { CollapsiblePanel, ContentInsertionActions, RemoveActionButton, type InsertionAction } from "@/components/editor/EditorPanels";
import { quickDiagramInsertActions } from "@/components/editor/diagramInsertionActions";
import { SolutionScopeStatus } from "@/components/solutions/SolutionScopeStatus";
import type {
  ContainerOrderItem,
  EditorContentBlock,
  EditorPart,
  EditorSubpart,
  OrderedPartItem,
  QuestionBlock,
} from "@/lib/editorDocumentNormalization";
import { alphaLabel, orderedPartItems, romanLabel } from "@/lib/editorDocumentNormalization";
import { markLabel, partMarks, partPanelSummary } from "@/lib/editorDocumentToc";
import {
  type EditorPageBreakTarget,
  type SubsectionContainerRef,
  type SubsectionDragTarget,
  subsectionTargetDataAttributes,
} from "@/lib/editorSubsectionDrag";
import { solutionSlotInsertionPlan } from "@/lib/solutionSlotInsertionActions";
import type { SolutionValidationIssue, SolutionValidationResult } from "@/lib/solutionValidation";
import { partScrollAnchor, subpartScrollAnchor } from "@/lib/scrollAnchors";
import { cn } from "@/lib/utils";

type ContentBlockKind = "text" | "choices" | "table" | "diagram" | "columns" | "space";

export interface NestedPanelDragHandlers {
  onEditorPageBreakDragOver: (event: DragEvent<HTMLElement>, target: SubsectionDragTarget) => boolean;
  onEditorPageBreakDragLeave: (event: DragEvent<HTMLElement>, target: SubsectionDragTarget) => void;
  onEditorPageBreakDrop: (event: DragEvent<HTMLElement>, target: SubsectionDragTarget) => boolean;
  onSubsectionDragOver: (event: DragEvent<HTMLElement>, target: SubsectionDragTarget) => void;
  onSubsectionDragLeave: (event: DragEvent<HTMLElement>, target: SubsectionDragTarget) => void;
  onSubsectionDrop: (event: DragEvent<HTMLElement>, target: SubsectionDragTarget) => void;
}

export interface NestedPanelRenderers {
  dragClasses: (target: SubsectionDragTarget) => string;
  dragHandle: (target: SubsectionDragTarget, label: string) => ReactNode;
  itemDropZone: (container: SubsectionContainerRef, beforeItem: ContainerOrderItem, visible?: boolean) => ReactNode;
  containerDropZone: (container: SubsectionContainerRef, placement: "start" | "end", visible?: boolean) => ReactNode;
  renderPartContentBlock: (
    question: QuestionBlock,
    part: EditorPart,
    block: EditorContentBlock,
    itemIndex: number,
    itemCount: number,
    partItems: OrderedPartItem[],
  ) => ReactNode;
  renderSubpartContentBlock: (
    question: QuestionBlock,
    part: EditorPart,
    subpart: EditorSubpart,
    block: EditorContentBlock,
    blockIndex: number,
  ) => ReactNode;
  renderEditorPageBreakRow: (target: EditorPageBreakTarget) => ReactNode;
}

export interface NestedPanelActions {
  updatePart: (questionId: string, partId: string, patch: Partial<EditorPart>) => void;
  updateSubpart: (questionId: string, partId: string, subpartId: string, patch: Partial<EditorSubpart>) => void;
  removePart: (questionId: string, partId: string) => void;
  removeSubpart: (questionId: string, part: EditorPart, subpartId: string) => void;
  addPartBlock: (questionId: string, part: EditorPart, kind: ContentBlockKind) => void;
  addPartDiagramBlock: (questionId: string, part: EditorPart, type: string) => void;
  addPartSolutionSlot: (questionId: string, part: EditorPart) => void;
  addSubpart: (questionId: string, part: EditorPart) => void;
  addSubpartPageBreak: (questionId: string, part: EditorPart) => void;
  addSubpartBlock: (questionId: string, part: EditorPart, subpart: EditorSubpart, kind: ContentBlockKind) => void;
  addSubpartDiagramBlock: (questionId: string, part: EditorPart, subpart: EditorSubpart, type: string) => void;
  addSubpartSolutionSlot: (questionId: string, part: EditorPart, subpart: EditorSubpart) => void;
}

export interface EditorNestedPartPanelProps extends NestedPanelDragHandlers, NestedPanelRenderers, NestedPanelActions {
  question: QuestionBlock;
  part: EditorPart;
  isNotesTemplate: boolean;
  supportsSolutionTools: boolean;
  effectiveShowSolutions: boolean;
  solutionValidation: SolutionValidationResult;
  draggedSubsectionActive: boolean;
  draggedEditorPageBreakActive: boolean;
  openSignalForAnchor: (anchor: string) => number | undefined;
  isActiveEditorAnchor: (anchor: string) => boolean;
  onHeaderContextMenu: (event: React.MouseEvent<HTMLElement>, anchor: string) => void;
  onFixSolutionIssue: (issue: SolutionValidationIssue) => void;
  onJumpSolutionIssue: (anchor: string) => void;
}

function solutionSlotExtraActions(plan: ReturnType<typeof solutionSlotInsertionPlan>, onClick: () => void): InsertionAction[] {
  if (!plan.showManualSolutionSlotAction) return [];
  return [
    {
      label: plan.solutionSlotActionLabel,
      tooltip: plan.solutionSlotActionTooltip,
      icon: <FileText className="size-4" aria-hidden="true" />,
      onClick,
    },
  ];
}

function hasInsertableSubpartPageBreak(part: EditorPart) {
  return part.subparts.some((subpart) => !subpart.pageBreakBefore);
}

export function EditorNestedPartPanel({
  question,
  part,
  isNotesTemplate,
  supportsSolutionTools,
  effectiveShowSolutions,
  solutionValidation,
  draggedSubsectionActive,
  draggedEditorPageBreakActive,
  openSignalForAnchor,
  isActiveEditorAnchor,
  onHeaderContextMenu,
  onFixSolutionIssue,
  onJumpSolutionIssue,
  dragClasses,
  dragHandle,
  itemDropZone,
  containerDropZone,
  renderPartContentBlock,
  renderSubpartContentBlock,
  renderEditorPageBreakRow,
  onEditorPageBreakDragOver,
  onEditorPageBreakDragLeave,
  onEditorPageBreakDrop,
  onSubsectionDragOver,
  onSubsectionDragLeave,
  onSubsectionDrop,
  updatePart,
  updateSubpart,
  removePart,
  removeSubpart,
  addPartBlock,
  addPartDiagramBlock,
  addPartSolutionSlot,
  addSubpart,
  addSubpartPageBreak,
  addSubpartBlock,
  addSubpartDiagramBlock,
  addSubpartSolutionSlot,
}: EditorNestedPartPanelProps) {
  const subparts = part.subparts ?? [];
  const partItems = orderedPartItems(part);
  const partIndex = Math.max(
    0,
    question.parts.findIndex((current) => current.id === part.id),
  );
  const partTarget: SubsectionDragTarget = { kind: "part", questionId: question.id, id: part.id };
  const partLabel = alphaLabel(partIndex);
  const partAnchor = partScrollAnchor(question.id, part.id);
  const partOpenSignal = openSignalForAnchor(partAnchor);
  const partActive = isActiveEditorAnchor(partAnchor);
  const partPanelLabel = isNotesTemplate ? `Subheading ${partIndex + 1}` : `Part (${partLabel})`;
  const partSolutionInsertion = solutionSlotInsertionPlan({
    supportsSolutionTools,
    marks: part.marks,
    scope: "part",
    hasNestedItems: Boolean(subparts.length),
  });
  const partContainer: SubsectionContainerRef = { kind: "part", questionId: question.id, partId: part.id };
  const partInsertAction: InsertionAction = {
    label: isNotesTemplate ? "Detail" : "Subpart",
    tooltip: isNotesTemplate
      ? "Add a nested detail section inside this subheading"
      : "Add a roman-numbered item, such as (i), inside this part",
    icon: <GitBranch className="size-4" aria-hidden="true" />,
    onClick: () => addSubpart(question.id, part),
  };
  const partPageBreakInsertAction: InsertionAction = {
    label: "Page break",
    tooltip: hasInsertableSubpartPageBreak(part)
      ? "Add a page-break row before an existing subpart"
      : "Add a subpart first, then insert a page-break row before it",
    icon: <FileText className="size-4" aria-hidden="true" />,
    disabled: !hasInsertableSubpartPageBreak(part),
    onClick: () => addSubpartPageBreak(question.id, part),
  };

  return (
    <div key={part.id} data-scroll-anchor={partAnchor}>
      <div
        data-drag-preview
        {...subsectionTargetDataAttributes(partTarget)}
        className={cn("rounded-md transition-all", dragClasses(partTarget))}
        onDragOver={(event) => {
          if (onEditorPageBreakDragOver(event, partTarget)) return;
          onSubsectionDragOver(event, partTarget);
        }}
        onDragLeave={(event) => {
          onEditorPageBreakDragLeave(event, partTarget);
          onSubsectionDragLeave(event, partTarget);
        }}
        onDrop={(event) => {
          if (onEditorPageBreakDrop(event, partTarget)) return;
          onSubsectionDrop(event, partTarget);
        }}
      >
        <CollapsiblePanel
          title={<InlineSummaryTitle label={partPanelLabel} summary={part.text?.trim() || partPanelSummary(part.contentBlocks)} />}
          leading={dragHandle(partTarget, `Drag ${partPanelLabel}`)}
          onHeaderContextMenu={(event) => onHeaderContextMenu(event, partAnchor)}
          actions={
            <>
              {supportsSolutionTools && effectiveShowSolutions ? (
                <SolutionScopeStatus
                  result={solutionValidation}
                  anchor={partAnchor}
                  marked={partMarks(part) > 0}
                  includeDescendants={Boolean(subparts.length)}
                  onFix={onFixSolutionIssue}
                  onJump={onJumpSolutionIssue}
                />
              ) : null}
              {!isNotesTemplate && subparts.length ? (
                <div className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                  Marks
                  <div className="flex h-8 w-20 items-center rounded-md border border-input bg-muted px-2 text-sm font-normal text-muted-foreground">
                    {markLabel(partMarks(part))}
                  </div>
                </div>
              ) : null}
              {!isNotesTemplate && !subparts.length ? (
                <label className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                  Marks
                  <input
                    type="number"
                    min={0}
                    value={part.marks}
                    onChange={(event) => updatePart(question.id, part.id, { marks: Number(event.target.value) })}
                    className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
              ) : null}
              <RemoveActionButton label={`Remove ${partPanelLabel}`} onRemove={() => removePart(question.id, part.id)} />
            </>
          }
          className="bg-background"
          bodyClassName="p-3"
          defaultOpen={false}
          active={partActive}
          openSignal={partOpenSignal}
        >
          <div className="flex flex-col gap-3">
            {!isNotesTemplate ? (
              <ContainerWordingEditor
                label="Part wording"
                value={part.text}
                placeholder="Enter the wording for this part"
                onChange={(text) => updatePart(question.id, part.id, { text })}
              />
            ) : null}
            {partItems.map((item, partItemIndex) => {
              const beforeItem: ContainerOrderItem =
                item.kind === "block" ? { kind: "block", id: item.id } : { kind: "subpart", id: item.id };
              const beforeDropZone = itemDropZone(partContainer, beforeItem, draggedSubsectionActive || draggedEditorPageBreakActive);

              if (item.kind === "block") {
                return (
                  <Fragment key={item.id}>
                    {beforeDropZone}
                    {renderPartContentBlock(question, part, item.block, partItemIndex, partItems.length, partItems)}
                  </Fragment>
                );
              }

              return (
                <Fragment key={item.id}>
                  {beforeDropZone}
                  <div className="ml-6 space-y-2 border-l-2 border-blue-200 pl-4">
                    {item.subpart.pageBreakBefore
                      ? renderEditorPageBreakRow({
                          kind: "subpart",
                          questionId: question.id,
                          partId: part.id,
                          subpartId: item.subpart.id,
                        })
                      : null}
                    <EditorSubpartPanel
                      question={question}
                      part={part}
                      subpart={item.subpart}
                      isNotesTemplate={isNotesTemplate}
                      supportsSolutionTools={supportsSolutionTools}
                      effectiveShowSolutions={effectiveShowSolutions}
                      solutionValidation={solutionValidation}
                      draggedSubsectionActive={draggedSubsectionActive}
                      openSignalForAnchor={openSignalForAnchor}
                      isActiveEditorAnchor={isActiveEditorAnchor}
                      onHeaderContextMenu={onHeaderContextMenu}
                      onFixSolutionIssue={onFixSolutionIssue}
                      onJumpSolutionIssue={onJumpSolutionIssue}
                      dragClasses={dragClasses}
                      dragHandle={dragHandle}
                      itemDropZone={itemDropZone}
                      containerDropZone={containerDropZone}
                      renderSubpartContentBlock={renderSubpartContentBlock}
                      onEditorPageBreakDragOver={onEditorPageBreakDragOver}
                      onEditorPageBreakDragLeave={onEditorPageBreakDragLeave}
                      onEditorPageBreakDrop={onEditorPageBreakDrop}
                      onSubsectionDragOver={onSubsectionDragOver}
                      onSubsectionDragLeave={onSubsectionDragLeave}
                      onSubsectionDrop={onSubsectionDrop}
                      updateSubpart={updateSubpart}
                      removeSubpart={removeSubpart}
                      addSubpartBlock={addSubpartBlock}
                      addSubpartDiagramBlock={addSubpartDiagramBlock}
                      addSubpartSolutionSlot={addSubpartSolutionSlot}
                    />
                  </div>
                </Fragment>
              );
            })}
          </div>
          {containerDropZone(partContainer, "end", draggedSubsectionActive || draggedEditorPageBreakActive)}
          <ContentInsertionActions
            buttonLabel="Add"
            solutionMode={effectiveShowSolutions}
            centered
            className="mt-3 pt-3"
            onAddText={() => addPartBlock(question.id, part, "text")}
            onAddChoices={() => addPartBlock(question.id, part, "choices")}
            onAddTable={() => addPartBlock(question.id, part, "table")}
            onAddDiagram={() => addPartBlock(question.id, part, "diagram")}
            diagramActions={quickDiagramInsertActions((type) => addPartDiagramBlock(question.id, part, type))}
            onAddColumns={() => addPartBlock(question.id, part, "columns")}
            onAddSpace={() =>
              partSolutionInsertion.usesPairedSolutionSpace
                ? addPartSolutionSlot(question.id, part)
                : addPartBlock(question.id, part, "space")
            }
            spaceActionLabel={partSolutionInsertion.spaceActionLabel}
            spaceActionTooltip={partSolutionInsertion.spaceActionTooltip}
            extraActions={[
              ...solutionSlotExtraActions(partSolutionInsertion, () => addPartSolutionSlot(question.id, part)),
              partInsertAction,
              partPageBreakInsertAction,
            ]}
          />
        </CollapsiblePanel>
      </div>
    </div>
  );
}

interface EditorSubpartPanelProps extends Omit<NestedPanelDragHandlers, "onEditorPageBreakDragOver" | "onEditorPageBreakDrop"> {
  question: QuestionBlock;
  part: EditorPart;
  subpart: EditorSubpart;
  isNotesTemplate: boolean;
  supportsSolutionTools: boolean;
  effectiveShowSolutions: boolean;
  solutionValidation: SolutionValidationResult;
  draggedSubsectionActive: boolean;
  openSignalForAnchor: (anchor: string) => number | undefined;
  isActiveEditorAnchor: (anchor: string) => boolean;
  onHeaderContextMenu: (event: React.MouseEvent<HTMLElement>, anchor: string) => void;
  onFixSolutionIssue: (issue: SolutionValidationIssue) => void;
  onJumpSolutionIssue: (anchor: string) => void;
  dragClasses: (target: SubsectionDragTarget) => string;
  dragHandle: (target: SubsectionDragTarget, label: string) => ReactNode;
  itemDropZone: (container: SubsectionContainerRef, beforeItem: ContainerOrderItem, visible?: boolean) => ReactNode;
  containerDropZone: (container: SubsectionContainerRef, placement: "start" | "end", visible?: boolean) => ReactNode;
  renderSubpartContentBlock: (
    question: QuestionBlock,
    part: EditorPart,
    subpart: EditorSubpart,
    block: EditorContentBlock,
    blockIndex: number,
  ) => ReactNode;
  onEditorPageBreakDragOver: (event: DragEvent<HTMLElement>, target: SubsectionDragTarget) => boolean;
  onEditorPageBreakDrop: (event: DragEvent<HTMLElement>, target: SubsectionDragTarget) => boolean;
  updateSubpart: (questionId: string, partId: string, subpartId: string, patch: Partial<EditorSubpart>) => void;
  removeSubpart: (questionId: string, part: EditorPart, subpartId: string) => void;
  addSubpartBlock: (questionId: string, part: EditorPart, subpart: EditorSubpart, kind: ContentBlockKind) => void;
  addSubpartDiagramBlock: (questionId: string, part: EditorPart, subpart: EditorSubpart, type: string) => void;
  addSubpartSolutionSlot: (questionId: string, part: EditorPart, subpart: EditorSubpart) => void;
}

function EditorSubpartPanel({
  question,
  part,
  subpart,
  isNotesTemplate,
  supportsSolutionTools,
  effectiveShowSolutions,
  solutionValidation,
  draggedSubsectionActive,
  openSignalForAnchor,
  isActiveEditorAnchor,
  onHeaderContextMenu,
  onFixSolutionIssue,
  onJumpSolutionIssue,
  dragClasses,
  dragHandle,
  itemDropZone,
  containerDropZone,
  renderSubpartContentBlock,
  onEditorPageBreakDragOver,
  onEditorPageBreakDragLeave,
  onEditorPageBreakDrop,
  onSubsectionDragOver,
  onSubsectionDragLeave,
  onSubsectionDrop,
  updateSubpart,
  removeSubpart,
  addSubpartBlock,
  addSubpartDiagramBlock,
  addSubpartSolutionSlot,
}: EditorSubpartPanelProps) {
  const subpartIndex = Math.max(
    0,
    (part.subparts ?? []).findIndex((current) => current.id === subpart.id),
  );
  const subpartLabel = romanLabel(subpartIndex);
  const subpartTarget: SubsectionDragTarget = {
    kind: "subpart",
    questionId: question.id,
    partId: part.id,
    id: subpart.id,
  };
  const subpartAnchor = subpartScrollAnchor(question.id, part.id, subpart.id);
  const subpartOpenSignal = openSignalForAnchor(subpartAnchor);
  const subpartActive = isActiveEditorAnchor(subpartAnchor);
  const subpartPanelLabel = isNotesTemplate ? `Detail ${subpartIndex + 1}` : `Subpart (${subpartLabel})`;
  const subpartSolutionInsertion = solutionSlotInsertionPlan({
    supportsSolutionTools,
    marks: subpart.marks,
    scope: "subpart",
  });
  const subpartContainer: SubsectionContainerRef = {
    kind: "subpart",
    questionId: question.id,
    partId: part.id,
    subpartId: subpart.id,
  };

  return (
    <div
      key={subpart.id}
      data-drag-preview
      data-scroll-anchor={subpartAnchor}
      {...subsectionTargetDataAttributes(subpartTarget)}
      className={cn("rounded-md transition-all", dragClasses(subpartTarget))}
      onDragOver={(event) => {
        if (onEditorPageBreakDragOver(event, subpartTarget)) return;
        onSubsectionDragOver(event, subpartTarget);
      }}
      onDragLeave={(event) => {
        onEditorPageBreakDragLeave(event, subpartTarget);
        onSubsectionDragLeave(event, subpartTarget);
      }}
      onDrop={(event) => {
        if (onEditorPageBreakDrop(event, subpartTarget)) return;
        onSubsectionDrop(event, subpartTarget);
      }}
    >
      <CollapsiblePanel
        title={<InlineSummaryTitle label={subpartPanelLabel} summary={subpart.text?.trim() || partPanelSummary(subpart.contentBlocks)} />}
        leading={dragHandle(subpartTarget, `Drag ${subpartPanelLabel}`)}
        onHeaderContextMenu={(event) => onHeaderContextMenu(event, subpartAnchor)}
        actions={
          <>
            {supportsSolutionTools && effectiveShowSolutions ? (
              <SolutionScopeStatus
                result={solutionValidation}
                anchor={subpartAnchor}
                marked={Math.max(0, Number(subpart.marks) || 0) > 0}
                onFix={onFixSolutionIssue}
                onJump={onJumpSolutionIssue}
              />
            ) : null}
            {!isNotesTemplate ? (
              <label className="flex flex-col gap-1 text-[11px] font-medium leading-none">
                Marks
                <input
                  type="number"
                  min={0}
                  value={subpart.marks}
                  onChange={(event) => updateSubpart(question.id, part.id, subpart.id, { marks: Number(event.target.value) })}
                  className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            ) : null}
            <RemoveActionButton label={`Remove ${subpartPanelLabel}`} onRemove={() => removeSubpart(question.id, part, subpart.id)} />
          </>
        }
        className="bg-muted/20"
        bodyClassName="p-3"
        defaultOpen={false}
        active={subpartActive}
        openSignal={subpartOpenSignal}
      >
        <div className="flex flex-col gap-3">
          <ContainerWordingEditor
            label={isNotesTemplate ? "Detail wording" : "Subpart wording"}
            value={subpart.text}
            placeholder={isNotesTemplate ? "Enter the detail text" : "Enter the wording for this subpart"}
            minHeightClassName="min-h-[68px]"
            onChange={(text) => updateSubpart(question.id, part.id, subpart.id, { text })}
          />
          {subpart.contentBlocks.map((block, blockIndex) => {
            if (block.kind === "pageBreak") return null;
            const beforeItem: ContainerOrderItem = { kind: "block", id: block.id };
            return (
              <Fragment key={block.id}>
                {itemDropZone(subpartContainer, beforeItem, draggedSubsectionActive)}
                {renderSubpartContentBlock(question, part, subpart, block, blockIndex)}
              </Fragment>
            );
          })}
        </div>
        {containerDropZone(subpartContainer, "end", draggedSubsectionActive)}
        <ContentInsertionActions
          buttonLabel="Add"
          solutionMode={effectiveShowSolutions}
          centered
          className="mt-3 pt-3"
          onAddText={() => addSubpartBlock(question.id, part, subpart, "text")}
          onAddChoices={() => addSubpartBlock(question.id, part, subpart, "choices")}
          onAddTable={() => addSubpartBlock(question.id, part, subpart, "table")}
          onAddDiagram={() => addSubpartBlock(question.id, part, subpart, "diagram")}
          diagramActions={quickDiagramInsertActions((type) => addSubpartDiagramBlock(question.id, part, subpart, type))}
          onAddColumns={() => addSubpartBlock(question.id, part, subpart, "columns")}
          onAddSpace={() =>
            subpartSolutionInsertion.usesPairedSolutionSpace
              ? addSubpartSolutionSlot(question.id, part, subpart)
              : addSubpartBlock(question.id, part, subpart, "space")
          }
          spaceActionLabel={subpartSolutionInsertion.spaceActionLabel}
          spaceActionTooltip={subpartSolutionInsertion.spaceActionTooltip}
          extraActions={[...solutionSlotExtraActions(subpartSolutionInsertion, () => addSubpartSolutionSlot(question.id, part, subpart))]}
        />
      </CollapsiblePanel>
    </div>
  );
}
