import { Fragment } from "react";

import { FormattedText, FrontMatterInlineText } from "@/components/MathText";
import { A4PreviewPageFrame } from "@/components/preview/PreviewPageFrame";
import type { QuestionBlock } from "@/lib/editorDocumentNormalization";
import {
  DEFAULT_EXAM_TITLE_PAGE,
  assessmentTitleText,
  normalizeExamTitlePage,
  type ExamTitlePageConfig,
  type FrontMatterConfig,
} from "@/lib/frontMatterConfig";
import { schoolInitials, type LogoAsset } from "@/lib/logoLibrary";
import { examStructurePercentageTotal, examStructureRows } from "@/lib/previewPagination";
import { SCROLL_ANCHOR_FRONT_MATTER, previewSelectionAttr } from "@/lib/scrollAnchors";

function ExamTextLines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <Fragment key={`${line}-${index}`}>
          {index ? <br /> : null}
          <FrontMatterInlineText text={line} />
        </Fragment>
      ))}
    </>
  );
}

function examStudentNameLabel(exam: ExamTitlePageConfig) {
  const label = exam.studentNumberLabel.trim();
  if (!label || /^(?:wa\s+)?student\s+number:?$/i.test(label)) return "NAME:";
  return label;
}

function ExamInstructionList({ text }: { text: string }) {
  const items = text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(\d+)\.\s*([\s\S]+)$/);
      return match ? { number: match[1], text: match[2] } : { number: "", text: item };
    });

  return (
    <div className="exam-instructions-list">
      {items.map((item, index) => (
        <div key={`${item.number}-${index}`} className="exam-instruction-item">
          <span>{item.number ? `${item.number}.` : ""}</span>
          <div>
            <FormattedText text={item.text} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SchoolExamRunningHeader({
  exam,
  pageNumber,
  variant = "content",
}: {
  exam: ExamTitlePageConfig;
  pageNumber: number;
  variant?: "structure" | "content" | "supplementary";
}) {
  const course = exam.courseHeader || DEFAULT_EXAM_TITLE_PAGE.courseHeader;
  const section = exam.sectionHeader || DEFAULT_EXAM_TITLE_PAGE.sectionHeader;
  const sectionOnLeft = variant === "supplementary" || (variant === "content" && pageNumber % 2 === 1);
  const leftText = sectionOnLeft ? section : course;
  const rightText = sectionOnLeft ? course : section;

  return (
    <header className="school-exam-running-header">
      <strong>
        <FrontMatterInlineText text={leftText} />
      </strong>
      <strong>{pageNumber}</strong>
      <strong>
        <FrontMatterInlineText text={rightText} />
      </strong>
    </header>
  );
}

export function SchoolExamPageFooter({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <footer className="school-exam-page-footer">
      <FrontMatterInlineText text={text} />
    </footer>
  );
}

function ExamCoverPage({
  frontMatter,
  logo,
  activePreviewAnchor,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  activePreviewAnchor?: string;
}) {
  const exam = normalizeExamTitlePage(frontMatter.exam);
  const schoolNameLines = frontMatter.schoolName
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const initials = schoolInitials(schoolNameLines);

  return (
    <header
      className="exam-title-page school-exam-cover-page"
      data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}
      data-preview-structure-anchor="true"
      data-preview-selected={previewSelectionAttr(SCROLL_ANCHOR_FRONT_MATTER, activePreviewAnchor)}
    >
      <section className="school-exam-logo-lockup">
        <div className="school-exam-logo-frame">
          {logo ? (
            <img className="school-exam-logo" src={logo.src} alt={`${logo.name} logo`} />
          ) : (
            <div className="school-exam-monogram" aria-hidden="true">
              {initials}
            </div>
          )}
        </div>
        <div className="school-exam-school-name">
          <ExamTextLines text={frontMatter.schoolName} />
        </div>
      </section>

      <section className="school-exam-heading">
        <div />
        <div>
          <h1>
            <FrontMatterInlineText text={exam.examHeading} />
          </h1>
          <p>
            <FrontMatterInlineText text={exam.bookletTitle} />
          </p>
        </div>
      </section>

      <section className="school-exam-course-row">
        <div className="school-exam-course-block">
          <h2>
            <ExamTextLines text={frontMatter.subjectTitle} />
          </h2>
          {frontMatter.showAssessmentSubtitle && frontMatter.assessmentSubtitle.trim() ? (
            <p>
              <ExamTextLines text={frontMatter.assessmentSubtitle} />
            </p>
          ) : null}
        </div>
        <div className="school-exam-student-number">
          <span>
            <FrontMatterInlineText text={examStudentNameLabel(exam)} />
          </span>
          <span className="school-exam-student-name-line" aria-hidden="true" />
        </div>
      </section>

      <section className="school-exam-time-block">
        <h3>
          <FrontMatterInlineText text={exam.timeTitle} />
        </h3>
        <dl>
          <dt>
            <FrontMatterInlineText text={exam.readingTimeLabel} />
          </dt>
          <dd>
            <FrontMatterInlineText text={exam.readingTime} />
          </dd>
          <dt>
            <FrontMatterInlineText text={exam.workingTimeLabel} />
          </dt>
          <dd>
            <FrontMatterInlineText text={exam.workingTime} />
          </dd>
        </dl>
      </section>

      <section className="school-exam-materials-block">
        <h3>
          <FrontMatterInlineText text={exam.materialsTitle} />
        </h3>
        <p className="exam-italic-heading">
          <FrontMatterInlineText text={exam.supervisorMaterialsTitle} />
        </p>
        <p>
          <ExamTextLines text={exam.supervisorMaterials} />
        </p>
        <p className="exam-italic-heading">
          <FrontMatterInlineText text={exam.candidateMaterialsTitle} />
        </p>
        <div className="exam-material-row">
          <strong>
            <FrontMatterInlineText text={exam.standardItemsLabel} />
          </strong>
          <span>
            <ExamTextLines text={exam.standardItems} />
          </span>
        </div>
        <div className="exam-material-row">
          <strong>
            <FrontMatterInlineText text={exam.specialItemsLabel} />
          </strong>
          <span>
            <ExamTextLines text={exam.specialItems} />
          </span>
        </div>
      </section>

      <section className="school-exam-important-note">
        <h3>
          <FrontMatterInlineText text={exam.importantNoteTitle} />
        </h3>
        <FormattedText text={exam.importantNoteBody} />
      </section>
    </header>
  );
}

function ExamStructurePage({
  frontMatter,
  totalMarks,
  questionCount,
}: {
  frontMatter: FrontMatterConfig;
  totalMarks: number;
  questionCount: number;
}) {
  const exam = normalizeExamTitlePage(frontMatter.exam);
  const rows = examStructureRows(frontMatter, totalMarks, questionCount);

  return (
    <section className="exam-title-page school-exam-structure-page">
      <SchoolExamRunningHeader exam={exam} pageNumber={2} variant="structure" />

      <section>
        <h2>
          <FrontMatterInlineText text={exam.structureTitle} />
        </h2>
        <table className="exam-structure-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Number of questions available</th>
              <th>Number of questions to be answered</th>
              <th>Working time (minutes)</th>
              <th>Marks available</th>
              <th>Percentage of examination</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <ExamTextLines text={row.section} />
                </td>
                <td>{row.questionsAvailable}</td>
                <td>{row.questionsToBeAnswered}</td>
                <td>{row.workingTimeMinutes}</td>
                <td>{row.marksAvailable}</td>
                <td>{row.percentage}</td>
              </tr>
            ))}
            <tr className="exam-structure-total-row">
              <td className="exam-structure-total-spacer" colSpan={4} aria-hidden="true" />
              <td className="exam-structure-total-label">Total</td>
              <td>{examStructurePercentageTotal(rows)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="exam-candidate-instructions">
        <h2>
          <FrontMatterInlineText text={exam.instructionsTitle} />
        </h2>
        <ExamInstructionList text={exam.instructionsBody} />
      </section>
      <SchoolExamPageFooter text={exam.footerText} />
    </section>
  );
}

export function SchoolExamSupplementaryPage({ frontMatter, pageNumber }: { frontMatter: FrontMatterConfig; pageNumber: number }) {
  const exam = normalizeExamTitlePage(frontMatter.exam);

  return (
    <section className="a4-page school-exam-question-page">
      <div className="a4-page-content">
        <div className="exam-title-page school-exam-supplementary-page">
          <SchoolExamRunningHeader exam={exam} pageNumber={pageNumber} variant="supplementary" />
          <section className="school-exam-supplementary-content">
            <h2>
              <FrontMatterInlineText text={exam.supplementaryPageTitle} />
            </h2>
            <p>
              <FrontMatterInlineText text={`${exam.supplementaryQuestionNumberLabel} ________`} />
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}

function TestFrontMatterPreview({
  frontMatter,
  logo,
  totalMarks,
  activePreviewAnchor,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  totalMarks: number;
  activePreviewAnchor?: string;
}) {
  const schoolNameLines = frontMatter.schoolName
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const initials = schoolInitials(schoolNameLines);
  const isSolutionsTitle = frontMatter.nameLabel.trim().toLowerCase() === "solutions";

  return (
    <header
      className="test-front-matter"
      data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}
      data-preview-structure-anchor="true"
      data-preview-selected={previewSelectionAttr(SCROLL_ANCHOR_FRONT_MATTER, activePreviewAnchor)}
    >
      <section className="test-title-panel">
        <div className="test-school-lockup">
          {logo ? (
            <img className="test-school-logo" src={logo.src} alt={`${logo.name} logo`} />
          ) : (
            <div className="test-school-monogram" aria-hidden="true">
              {initials}
            </div>
          )}
          <div className="test-school-name">
            {schoolNameLines.map((line) => (
              <span key={line}>
                <FrontMatterInlineText text={line} />
              </span>
            ))}
          </div>
        </div>
        <div className="test-title-main">
          <h1>
            <FrontMatterInlineText text={frontMatter.subjectTitle} />
          </h1>
          <p>
            <FrontMatterInlineText text={assessmentTitleText(frontMatter.assessmentTitle)} />
          </p>
          {frontMatter.showAssessmentSubtitle && frontMatter.assessmentSubtitle.trim() ? (
            <p className="test-assessment-subtitle">
              <FrontMatterInlineText text={frontMatter.assessmentSubtitle} />
            </p>
          ) : null}
          {isSolutionsTitle ? (
            <p className="test-solutions-title">
              <FrontMatterInlineText text={frontMatter.nameLabel} />
            </p>
          ) : null}
        </div>
      </section>

      <section className={`test-student-row ${isSolutionsTitle ? "test-student-row-solutions" : ""}`}>
        {isSolutionsTitle ? null : (
          <div className="test-name-line">
            <span>
              <FrontMatterInlineText text={`${frontMatter.nameLabel}:`} />
            </span>
            <span aria-hidden="true" />
          </div>
        )}
        <div className="test-mark-line">
          <span>
            <FrontMatterInlineText text={`${frontMatter.markLabel}:`} />
          </span>
          <span aria-hidden="true" />
          <strong>{totalMarks}</strong>
        </div>
      </section>

      {frontMatter.showDeclaration ? (
        <section className="test-declaration-panel">
          <div className="test-declaration-copy">
            <h2>
              <FrontMatterInlineText text={frontMatter.declarationTitle} />
            </h2>
            <FormattedText text={frontMatter.declarationBody} />
          </div>
          <div className="test-signature-panel">
            <strong>
              <FrontMatterInlineText text={frontMatter.signatureLabel} />
            </strong>
            <span aria-hidden="true" />
            <em>
              <FrontMatterInlineText text={frontMatter.signatureRole} />
            </em>
          </div>
        </section>
      ) : null}

      {frontMatter.showInstructions ? (
        <section className="test-instructions-panel">
          <h2>
            <FrontMatterInlineText text={frontMatter.instructionsTitle} />
          </h2>
          <FormattedText text={frontMatter.instructionsBody} className="test-instructions-body" />
        </section>
      ) : null}
    </header>
  );
}

export function WorksheetHeaderPreview({
  frontMatter,
  logo,
  totalMarks,
  activePreviewAnchor,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  totalMarks: number;
  activePreviewAnchor?: string;
}) {
  const schoolName = frontMatter.schoolName
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  return (
    <header
      className="worksheet-header"
      data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}
      data-preview-structure-anchor="true"
      data-preview-selected={previewSelectionAttr(SCROLL_ANCHOR_FRONT_MATTER, activePreviewAnchor)}
    >
      <div className="worksheet-heading-lockup">
        {logo ? (
          <div className="worksheet-mini-logo">
            <img src={logo.src} alt={`${logo.name} logo`} />
          </div>
        ) : null}
        <div className="worksheet-title-copy">
          {schoolName ? (
            <p className="worksheet-school-name">
              <FrontMatterInlineText text={schoolName} />
            </p>
          ) : null}
          <h1>
            <FrontMatterInlineText text={frontMatter.assessmentTitle} />
          </h1>
          <p className="worksheet-subject-line">
            <FrontMatterInlineText text={frontMatter.subjectTitle} />
          </p>
        </div>
      </div>
      <div className="worksheet-student-fields">
        <div className="worksheet-name-line">
          <span>Name:</span>
          <span aria-hidden="true" />
        </div>
        {totalMarks > 0 ? (
          <div className="worksheet-mark-line">
            <span>
              <FrontMatterInlineText text={`${frontMatter.markLabel}:`} />
            </span>
            <span aria-hidden="true" />
            <strong>{totalMarks}</strong>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function NotesHeaderPreview({
  frontMatter,
  logo,
  activePreviewAnchor,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  activePreviewAnchor?: string;
}) {
  const schoolName = frontMatter.schoolName
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  return (
    <header
      className="notes-header"
      data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}
      data-preview-structure-anchor="true"
      data-preview-selected={previewSelectionAttr(SCROLL_ANCHOR_FRONT_MATTER, activePreviewAnchor)}
    >
      {logo ? (
        <div className="notes-mini-logo">
          <img src={logo.src} alt={`${logo.name} logo`} />
        </div>
      ) : null}
      <div className="notes-title-copy">
        {schoolName ? (
          <p className="notes-school-name">
            <FrontMatterInlineText text={schoolName} />
          </p>
        ) : null}
        <h1>
          <FrontMatterInlineText text={frontMatter.assessmentTitle || "Math Notes"} />
        </h1>
        <p className="notes-subject-line">
          <FrontMatterInlineText text={frontMatter.subjectTitle || "Mathematics"} />
        </p>
        {frontMatter.showAssessmentSubtitle && frontMatter.assessmentSubtitle.trim() ? (
          <p className="notes-subtitle-line">
            <FrontMatterInlineText text={frontMatter.assessmentSubtitle} />
          </p>
        ) : null}
      </div>
    </header>
  );
}

export function notesSectionTitle(question: QuestionBlock, index: number) {
  return question.text?.trim() || question.section.trim() || `Heading ${index + 1}`;
}

export function FrontMatterPreviewPages({
  frontMatter,
  logo,
  totalMarks,
  questionCount,
  activePreviewAnchor,
  showPageBreaks,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  totalMarks: number;
  questionCount: number;
  activePreviewAnchor?: string;
  showPageBreaks: boolean;
}) {
  if (frontMatter.titlePageTemplate === "worksheet" || frontMatter.titlePageTemplate === "notes") return null;

  if (frontMatter.titlePageTemplate === "exam") {
    return (
      <>
        <A4PreviewPageFrame>
          <section className="a4-page">
            <div className="a4-page-content">
              <ExamCoverPage frontMatter={frontMatter} logo={logo} activePreviewAnchor={activePreviewAnchor} />
            </div>
          </section>
        </A4PreviewPageFrame>
        {showPageBreaks ? (
          <div className="a4-page-break" aria-hidden="true">
            <span>A4 page break</span>
          </div>
        ) : null}
        <A4PreviewPageFrame>
          <section className="a4-page">
            <div className="a4-page-content">
              <ExamStructurePage frontMatter={frontMatter} totalMarks={totalMarks} questionCount={questionCount} />
            </div>
          </section>
        </A4PreviewPageFrame>
      </>
    );
  }

  return (
    <A4PreviewPageFrame>
      <section className="a4-page">
        <div className="a4-page-content">
          <TestFrontMatterPreview frontMatter={frontMatter} logo={logo} totalMarks={totalMarks} activePreviewAnchor={activePreviewAnchor} />
        </div>
      </section>
    </A4PreviewPageFrame>
  );
}
