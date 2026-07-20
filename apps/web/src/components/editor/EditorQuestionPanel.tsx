import { Fragment, type ReactNode } from "react";
import { FileText, GitBranch, Trash2 } from "lucide-react";

import { ContentInsertionActions, EDITOR_ACTIVE_PANEL_CLASS } from "@/components/editor/EditorPanels";
import { quickDiagramInsertActions } from "@/components/editor/diagramInsertionActions";
import { SolutionScopeStatus } from "@/components/solutions/SolutionScopeStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ContainerOrderItem,
  EditorContentBlock,
  EditorPart,
  OrderedQuestionItem,
  QuestionBlock,
} from "@/lib/editorDocumentNormalization";
import { orderedQuestionItems } from "@/lib/editorDocumentNormalization";
import { markLabel, questionMarks } from "@/lib/editorDocumentToc";
import type { EditorPageBreakTarget, SubsectionContainerRef } from "@/lib/editorSubsectionDrag";
import { solutionSlotInsertionPlan } from "@/lib/solutionSlotInsertionActions";
import type { SolutionValidationIssue, SolutionValidationResult } from "@/lib/solutionValidation";
import { questionScrollAnchor } from "@/lib/scrollAnchors";
import { cn } from "@/lib/utils";

type ContentBlockKind = "text" | "choices" | "table" | "diagram" | "columns" | "space";

interface EditorQuestionPanelProps {
  question: QuestionBlock;
  label: string;
  active: boolean;
  isNotesTemplate: boolean;
  supportsSolutionTools: boolean;
  effectiveShowSolutions: boolean;
  solutionValidation: SolutionValidationResult;
  draggedSubsectionActive: boolean;
  draggedEditorPageBreakActive: boolean;
  canAddPartPageBreak: boolean;
  itemDropZone: (container: SubsectionContainerRef, beforeItem: ContainerOrderItem, visible?: boolean) => ReactNode;
  containerDropZone: (container: SubsectionContainerRef, placement: "start" | "end", visible?: boolean) => ReactNode;
  renderQuestionContentBlock: (
    question: QuestionBlock,
    block: EditorContentBlock,
    itemIndex: number,
    itemCount: number,
    questionItems: OrderedQuestionItem[],
  ) => ReactNode;
  renderPartPanel: (question: QuestionBlock, part: EditorPart) => ReactNode;
  renderEditorPageBreakRow: (target: EditorPageBreakTarget) => ReactNode;
  onHeaderContextMenu: (event: React.MouseEvent<HTMLElement>, anchor: string) => void;
  onJumpPreview: (questionId: string) => void;
  updateQuestion: (questionId: string, patch: Partial<QuestionBlock>) => void;
  removeQuestion: (questionId: string) => void;
  addQuestionBlock: (questionId: string, kind: ContentBlockKind) => void;
  addQuestionDiagramBlock: (questionId: string, type: string) => void;
  addQuestionSolutionSlot: (questionId: string) => void;
  addPart: (questionId: string) => void;
  addPartPageBreak: (questionId: string) => void;
  onFixSolutionIssue: (issue: SolutionValidationIssue) => void;
  onJumpSolutionIssue: (anchor: string) => void;
}

function solutionSlotExtraActions(plan: ReturnType<typeof solutionSlotInsertionPlan>, onClick: () => void) {
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

export function EditorQuestionPanel({
  question,
  label,
  active,
  isNotesTemplate,
  supportsSolutionTools,
  effectiveShowSolutions,
  solutionValidation,
  draggedSubsectionActive,
  draggedEditorPageBreakActive,
  canAddPartPageBreak,
  itemDropZone,
  containerDropZone,
  renderQuestionContentBlock,
  renderPartPanel,
  renderEditorPageBreakRow,
  onHeaderContextMenu,
  onJumpPreview,
  updateQuestion,
  removeQuestion,
  addQuestionBlock,
  addQuestionDiagramBlock,
  addQuestionSolutionSlot,
  addPart,
  addPartPageBreak,
  onFixSolutionIssue,
  onJumpSolutionIssue,
}: EditorQuestionPanelProps) {
  const hasParts = question.parts.length > 0;
  const questionItems = orderedQuestionItems(question);
  const questionAnchor = questionScrollAnchor(question.id);
  const questionSolutionInsertion = solutionSlotInsertionPlan({
    supportsSolutionTools,
    marks: question.marks,
    scope: "question",
    hasNestedItems: hasParts,
  });
  const dragActive = draggedSubsectionActive || draggedEditorPageBreakActive;

  return (
    <article
      className={cn("relative rounded-lg border bg-card p-4 shadow-panel transition-colors", active && EDITOR_ACTIVE_PANEL_CLASS)}
      data-scroll-anchor={questionAnchor}
    >
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3"
        data-panel-region="header"
        onContextMenu={(event) => onHeaderContextMenu(event, questionAnchor)}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            title={`Jump preview to ${label}`}
            aria-label={`Jump preview to ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              onJumpPreview(question.id);
            }}
            className={cn(
              "h-9 shrink-0 whitespace-nowrap px-3 text-sm font-semibold",
              active && "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            )}
          >
            {label}
          </Button>
          {isNotesTemplate ? (
            <label className="flex h-9 min-w-[14rem] flex-1 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm">
              <span className="shrink-0 font-medium text-muted-foreground">Title</span>
              <input
                aria-label={`${label} title`}
                type="text"
                value={question.section}
                onChange={(event) => updateQuestion(question.id, { section: event.target.value })}
                placeholder="Heading title"
                className="h-7 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
              />
            </label>
          ) : null}
          {!isNotesTemplate && hasParts ? (
            <Badge variant="secondary" className="h-9 shrink-0 whitespace-nowrap px-3 text-sm">
              {markLabel(questionMarks(question))}
            </Badge>
          ) : null}
          {!isNotesTemplate && !hasParts ? (
            <label className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm">
              <span className="font-medium text-muted-foreground">Marks</span>
              <input
                aria-label={`${label} marks`}
                type="number"
                min={0}
                value={question.marks}
                onChange={(event) => updateQuestion(question.id, { marks: Number(event.target.value) })}
                className="h-7 w-14 bg-transparent text-sm font-semibold outline-none"
              />
            </label>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {supportsSolutionTools && effectiveShowSolutions ? (
            <SolutionScopeStatus
              result={solutionValidation}
              anchor={questionAnchor}
              marked={questionMarks(question) > 0}
              includeDescendants={hasParts}
              onFix={onFixSolutionIssue}
              onJump={onJumpSolutionIssue}
            />
          ) : null}
          <Button
            variant="outline"
            size="icon"
            title={`Remove ${label}`}
            aria-label={`Remove ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              removeQuestion(question.id);
            }}
            className="size-9 shrink-0"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {questionItems.map((item, itemIndex) => {
          const beforeItem: ContainerOrderItem = item.kind === "block" ? { kind: "block", id: item.id } : { kind: "part", id: item.id };
          const beforeDropZone = itemDropZone({ kind: "question", questionId: question.id }, beforeItem, dragActive);

          return item.kind === "block" ? (
            <Fragment key={item.id}>
              {beforeDropZone}
              {renderQuestionContentBlock(question, item.block, itemIndex, questionItems.length, questionItems)}
            </Fragment>
          ) : (
            <Fragment key={item.id}>
              {beforeDropZone}
              {item.part.pageBreakBefore ? renderEditorPageBreakRow({ kind: "part", questionId: question.id, partId: item.part.id }) : null}
              {renderPartPanel(question, item.part)}
            </Fragment>
          );
        })}
      </div>
      {containerDropZone({ kind: "question", questionId: question.id }, "end", dragActive)}
      <ContentInsertionActions
        buttonLabel="Add"
        solutionMode={effectiveShowSolutions}
        centered
        className="mt-4 pt-3"
        onAddText={() => addQuestionBlock(question.id, "text")}
        onAddChoices={() => addQuestionBlock(question.id, "choices")}
        onAddTable={() => addQuestionBlock(question.id, "table")}
        onAddDiagram={() => addQuestionBlock(question.id, "diagram")}
        diagramActions={quickDiagramInsertActions((type) => addQuestionDiagramBlock(question.id, type))}
        onAddColumns={() => addQuestionBlock(question.id, "columns")}
        onAddSpace={() =>
          questionSolutionInsertion.usesPairedSolutionSpace ? addQuestionSolutionSlot(question.id) : addQuestionBlock(question.id, "space")
        }
        spaceActionLabel={questionSolutionInsertion.spaceActionLabel}
        spaceActionTooltip={questionSolutionInsertion.spaceActionTooltip}
        extraActions={[
          ...solutionSlotExtraActions(questionSolutionInsertion, () => addQuestionSolutionSlot(question.id)),
          {
            label: isNotesTemplate ? "Subheading" : "Part",
            tooltip: isNotesTemplate ? "Add a nested notes subheading" : "Add a lettered question part, such as (a), (b), (c)",
            icon: <GitBranch className="size-4" aria-hidden="true" />,
            onClick: () => addPart(question.id),
          },
          {
            label: "Page break",
            tooltip: canAddPartPageBreak
              ? "Add a page-break row before an existing part"
              : "Add a part first, then insert a page-break row before it",
            icon: <FileText className="size-4" aria-hidden="true" />,
            disabled: !canAddPartPageBreak,
            onClick: () => addPartPageBreak(question.id),
          },
        ]}
      />
    </article>
  );
}
