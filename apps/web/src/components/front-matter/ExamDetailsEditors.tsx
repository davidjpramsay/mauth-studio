import { InlineSummaryTitle } from "@/components/MathText";
import { CollapsiblePanel } from "@/components/editor/EditorPanels";
import { Textarea } from "@/components/ui/textarea";
import { nonNegativeNumberOrDefault, type ExamTitlePageConfig } from "@/lib/frontMatterConfig";

interface ExamDetailsEditorProps {
  exam: ExamTitlePageConfig;
  onUpdateExam: (patch: Partial<ExamTitlePageConfig>) => void;
}

type ExamTextField = keyof Pick<
  ExamTitlePageConfig,
  | "examHeading"
  | "bookletTitle"
  | "courseHeader"
  | "sectionHeader"
  | "studentNumberLabel"
  | "timeTitle"
  | "readingTimeLabel"
  | "readingTime"
  | "workingTimeLabel"
  | "workingTime"
  | "additionalBookletsLabel"
  | "materialsTitle"
  | "supervisorMaterialsTitle"
  | "supervisorMaterials"
  | "standardItems"
  | "specialItems"
  | "importantNoteBody"
  | "instructionsTitle"
  | "instructionsBody"
  | "footerText"
  | "endOfQuestionsFooterText"
  | "supplementaryPageTitle"
  | "supplementaryQuestionNumberLabel"
>;

interface ExamFieldProps {
  label: string;
  field: ExamTextField;
  exam: ExamTitlePageConfig;
  onUpdateExam: (patch: Partial<ExamTitlePageConfig>) => void;
  className?: string;
}

function ExamInputField({ label, field, exam, onUpdateExam, className }: ExamFieldProps) {
  return (
    <label className={`flex flex-col gap-2 text-xs font-medium${className ? ` ${className}` : ""}`}>
      {label}
      <input
        value={String(exam[field] ?? "")}
        onChange={(event) => onUpdateExam({ [field]: event.target.value })}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
      />
    </label>
  );
}

function ExamTextareaField({
  label,
  field,
  exam,
  onUpdateExam,
  className = "",
  textareaClassName = "min-h-16 text-sm",
}: ExamFieldProps & {
  textareaClassName?: string;
}) {
  return (
    <label className={`flex flex-col gap-2 text-xs font-medium${className ? ` ${className}` : ""}`}>
      {label}
      <Textarea
        value={String(exam[field] ?? "")}
        onChange={(event) => onUpdateExam({ [field]: event.target.value })}
        className={textareaClassName}
      />
    </label>
  );
}

export function ExamCoverEditor({ exam, onUpdateExam }: ExamDetailsEditorProps) {
  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label="Exam cover" summary={`${exam.examHeading} · ${exam.sectionHeader}`} />}
      defaultOpen={false}
      className="bg-muted/20"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ExamInputField label="Exam heading" field="examHeading" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamInputField label="Booklet title" field="bookletTitle" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamInputField label="Running header course" field="courseHeader" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamInputField label="Running header section" field="sectionHeader" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamInputField label="Student name label" field="studentNumberLabel" exam={exam} onUpdateExam={onUpdateExam} />
      </div>
    </CollapsiblePanel>
  );
}

export function ExamTimeMaterialsEditor({ exam, onUpdateExam }: ExamDetailsEditorProps) {
  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label="Exam time and materials" summary={`${exam.workingTimeLabel} ${exam.workingTime}`} />}
      defaultOpen={false}
      className="bg-muted/20"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ExamInputField label="Time section title" field="timeTitle" exam={exam} onUpdateExam={onUpdateExam} className="md:col-span-2" />
        <ExamInputField label="Reading time label" field="readingTimeLabel" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamInputField label="Reading time" field="readingTime" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamInputField label="Working time label" field="workingTimeLabel" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamInputField label="Working time" field="workingTime" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamTextareaField
          label="Additional booklets label"
          field="additionalBookletsLabel"
          exam={exam}
          onUpdateExam={onUpdateExam}
          className="md:col-span-2"
        />
        <ExamInputField label="Materials title" field="materialsTitle" exam={exam} onUpdateExam={onUpdateExam} className="md:col-span-2" />
        <ExamInputField label="Supervisor materials heading" field="supervisorMaterialsTitle" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamTextareaField
          label="Supervisor materials"
          field="supervisorMaterials"
          exam={exam}
          onUpdateExam={onUpdateExam}
          textareaClassName="min-h-20 text-sm"
        />
        <ExamTextareaField
          label="Standard items"
          field="standardItems"
          exam={exam}
          onUpdateExam={onUpdateExam}
          textareaClassName="min-h-24 text-sm"
        />
        <ExamTextareaField
          label="Special items"
          field="specialItems"
          exam={exam}
          onUpdateExam={onUpdateExam}
          textareaClassName="min-h-24 text-sm"
        />
        <ExamTextareaField
          label="Important note"
          field="importantNoteBody"
          exam={exam}
          onUpdateExam={onUpdateExam}
          className="md:col-span-2"
          textareaClassName="min-h-24 text-sm"
        />
      </div>
    </CollapsiblePanel>
  );
}

export function ExamInstructionsEditor({ exam, onUpdateExam }: ExamDetailsEditorProps) {
  return (
    <CollapsiblePanel
      title={<InlineSummaryTitle label="Exam instructions" summary={exam.instructionsTitle} />}
      defaultOpen={false}
      className="bg-muted/20"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ExamInputField
          label="Instructions heading"
          field="instructionsTitle"
          exam={exam}
          onUpdateExam={onUpdateExam}
          className="md:col-span-2"
        />
        <ExamTextareaField
          label="Numbered instructions"
          field="instructionsBody"
          exam={exam}
          onUpdateExam={onUpdateExam}
          className="md:col-span-2"
          textareaClassName="min-h-52 text-sm"
        />
        <ExamInputField label="Continued footer text" field="footerText" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamInputField label="Last question footer text" field="endOfQuestionsFooterText" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamInputField label="Supplementary page title" field="supplementaryPageTitle" exam={exam} onUpdateExam={onUpdateExam} />
        <ExamInputField
          label="Supplementary question label"
          field="supplementaryQuestionNumberLabel"
          exam={exam}
          onUpdateExam={onUpdateExam}
        />
        <label className="flex flex-col gap-2 text-xs font-medium">
          Minimum supplementary pages
          <input
            type="number"
            min={0}
            step={1}
            value={exam.supplementaryPageCount}
            onChange={(event) => onUpdateExam({ supplementaryPageCount: nonNegativeNumberOrDefault(Number(event.target.value), 0) })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
      </div>
    </CollapsiblePanel>
  );
}
