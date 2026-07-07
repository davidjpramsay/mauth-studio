import { ExamCoverEditor, ExamInstructionsEditor, ExamTimeMaterialsEditor } from "@/components/front-matter/ExamDetailsEditors";
import { ExamStructureEditor } from "@/components/front-matter/ExamStructureEditor";
import { FrontMatterTitleEditor } from "@/components/front-matter/FrontMatterTitleEditor";
import { StandardFrontMatterEditor } from "@/components/front-matter/StandardFrontMatterEditor";
import {
  normalizeExamTitlePage,
  nonNegativeNumberOrDefault,
  type ExamStructureRowConfig,
  type ExamTitlePageConfig,
  type FrontMatterConfig,
} from "@/lib/frontMatterConfig";
import type { LogoAsset } from "@/lib/logoLibrary";

interface FrontMatterEditorProps {
  frontMatter: FrontMatterConfig;
  logos: LogoAsset[];
  openSignal?: number;
  questionCount: number;
  totalMarks: number;
  onChange: (patch: Partial<FrontMatterConfig>) => void;
  onAddLogo: (file: File) => void;
  onUpdateLogo: (logoId: string, patch: { name: string; schoolName: string }) => void;
  onRemoveLogo: (logoId: string) => void;
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function FrontMatterEditor({
  frontMatter,
  logos,
  openSignal,
  questionCount,
  totalMarks,
  onChange,
  onAddLogo,
  onUpdateLogo,
  onRemoveLogo,
}: FrontMatterEditorProps) {
  const titlePageTemplate = frontMatter.titlePageTemplate ?? "standard";
  const exam = normalizeExamTitlePage(frontMatter.exam);
  const updateExam = (patch: Partial<ExamTitlePageConfig>) => onChange({ exam: { ...exam, ...patch } });
  const updateExamRow = (rowId: string, patch: Partial<ExamStructureRowConfig>) =>
    updateExam({
      structureRows: exam.structureRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    });
  const updateExamRowNumber = (
    rowId: string,
    key: keyof Pick<
      ExamStructureRowConfig,
      "questionsAvailable" | "questionsToBeAnswered" | "workingTimeMinutes" | "marksAvailable" | "percentage"
    >,
    value: string,
  ) => updateExamRow(rowId, { [key]: nonNegativeNumberOrDefault(Number(value), 0) } as Partial<ExamStructureRowConfig>);
  const addExamRow = () =>
    updateExam({
      structureRows: [
        ...exam.structureRows,
        {
          id: id("exam-section"),
          section: "Section",
          useCurrentDocument: false,
          questionsAvailable: 0,
          questionsToBeAnswered: 0,
          workingTimeMinutes: 0,
          marksAvailable: 0,
          percentage: 0,
        },
      ],
    });
  const removeExamRow = (rowId: string) =>
    updateExam({
      structureRows: exam.structureRows.length <= 1 ? exam.structureRows : exam.structureRows.filter((row) => row.id !== rowId),
    });

  return (
    <div className="flex flex-col gap-3">
      <FrontMatterTitleEditor
        frontMatter={frontMatter}
        logos={logos}
        openSignal={openSignal}
        onChange={onChange}
        onAddLogo={onAddLogo}
        onUpdateLogo={onUpdateLogo}
        onRemoveLogo={onRemoveLogo}
      />

      {titlePageTemplate === "exam" ? (
        <>
          <ExamCoverEditor exam={exam} onUpdateExam={updateExam} />
          <ExamTimeMaterialsEditor exam={exam} onUpdateExam={updateExam} />

          <ExamStructureEditor
            exam={exam}
            questionCount={questionCount}
            totalMarks={totalMarks}
            onUpdateExam={updateExam}
            onAddRow={addExamRow}
            onRemoveRow={removeExamRow}
            onUpdateRow={updateExamRow}
            onUpdateRowNumber={updateExamRowNumber}
          />

          <ExamInstructionsEditor exam={exam} onUpdateExam={updateExam} />
        </>
      ) : null}

      {titlePageTemplate === "standard" ? <StandardFrontMatterEditor frontMatter={frontMatter} onChange={onChange} /> : null}
    </div>
  );
}
