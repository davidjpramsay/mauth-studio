import type { ExamStructureRowConfig, ExamTitlePageConfig } from "@/lib/frontMatterConfig";
import { PlusCircle, Trash2 } from "lucide-react";

import { InlineSummaryTitle } from "@/components/MathText";
import { CollapsiblePanel } from "@/components/editor/EditorPanels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { markLabel } from "@/lib/editorDocumentToc";
import { examStructurePercentageTotal } from "@/lib/previewPagination";

type ExamStructureNumberKey = keyof Pick<
  ExamStructureRowConfig,
  "questionsAvailable" | "questionsToBeAnswered" | "workingTimeMinutes" | "marksAvailable" | "percentage"
>;

interface ExamStructureEditorProps {
  exam: ExamTitlePageConfig;
  questionCount: number;
  totalMarks: number;
  onUpdateExam: (patch: Partial<ExamTitlePageConfig>) => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: string) => void;
  onUpdateRow: (rowId: string, patch: Partial<ExamStructureRowConfig>) => void;
  onUpdateRowNumber: (rowId: string, key: ExamStructureNumberKey, value: string) => void;
}

export function ExamStructureEditor({
  exam,
  questionCount,
  totalMarks,
  onUpdateExam,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
  onUpdateRowNumber,
}: ExamStructureEditorProps) {
  return (
    <CollapsiblePanel
      title={
        <InlineSummaryTitle
          label="Exam structure table"
          summary={`Current document: ${questionCount} questions, ${markLabel(totalMarks)}`}
        />
      }
      defaultOpen={false}
      className="bg-muted/20"
      actions={
        <Button type="button" variant="outline" size="sm" onClick={onAddRow}>
          <PlusCircle data-icon="inline-start" />
          Row
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Table title
          <input
            value={exam.structureTitle}
            onChange={(event) => onUpdateExam({ structureTitle: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <div className="flex flex-col gap-3">
          {exam.structureRows.map((row, index) => {
            const rowQuestionsAvailable = row.useCurrentDocument ? questionCount : row.questionsAvailable;
            const rowQuestionsToBeAnswered = row.useCurrentDocument ? questionCount : row.questionsToBeAnswered;
            const rowMarks = row.useCurrentDocument ? totalMarks : row.marksAvailable;

            return (
              <div key={row.id} className="rounded-md border bg-background p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <strong className="text-sm">Row {index + 1}</strong>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={row.useCurrentDocument === true}
                        onChange={(event) => onUpdateRow(row.id, { useCurrentDocument: event.target.checked })}
                      />
                      Auto from current document
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Remove structure row"
                      aria-label="Remove structure row"
                      disabled={exam.structureRows.length <= 1}
                      onClick={() => onRemoveRow(row.id)}
                      className="size-8"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                  <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                    Section
                    <Textarea
                      value={row.section}
                      onChange={(event) => onUpdateRow(row.id, { section: event.target.value })}
                      className="min-h-20 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Available
                    <input
                      type="number"
                      min={0}
                      value={rowQuestionsAvailable}
                      disabled={row.useCurrentDocument === true}
                      onChange={(event) => onUpdateRowNumber(row.id, "questionsAvailable", event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:bg-muted disabled:text-muted-foreground"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Answered
                    <input
                      type="number"
                      min={0}
                      value={rowQuestionsToBeAnswered}
                      disabled={row.useCurrentDocument === true}
                      onChange={(event) => onUpdateRowNumber(row.id, "questionsToBeAnswered", event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:bg-muted disabled:text-muted-foreground"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Minutes
                    <input
                      type="number"
                      min={0}
                      value={row.workingTimeMinutes}
                      onChange={(event) => onUpdateRowNumber(row.id, "workingTimeMinutes", event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Marks
                    <input
                      type="number"
                      min={0}
                      value={rowMarks}
                      disabled={row.useCurrentDocument === true}
                      onChange={(event) => onUpdateRowNumber(row.id, "marksAvailable", event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal disabled:bg-muted disabled:text-muted-foreground"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Percentage
                    <input
                      type="number"
                      min={0}
                      value={row.percentage}
                      onChange={(event) => onUpdateRowNumber(row.id, "percentage", event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Use the Exam section selector to choose which row represents the current paper. Rows marked auto use the current document question
          count and total marks in the preview and print output. Percentage total: {examStructurePercentageTotal(exam.structureRows)}.
        </p>
      </div>
    </CollapsiblePanel>
  );
}
