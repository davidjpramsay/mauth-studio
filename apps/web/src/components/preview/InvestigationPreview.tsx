import { Fragment, type CSSProperties } from "react";

import { FormattedText, FrontMatterInlineText } from "@/components/MathText";
import { TestFrontMatterPreview } from "@/components/preview/FrontMatterPreviewPages";
import { A4PreviewPageFrame } from "@/components/preview/PreviewPageFrame";
import {
  investigationCriterionMarks,
  investigationTotalMarks,
  normalizeInvestigation,
  type FrontMatterConfig,
  type InvestigationConfig,
  type InvestigationCriterionConfig,
} from "@/lib/frontMatterConfig";
import type { LogoAsset } from "@/lib/logoLibrary";
import { INVESTIGATION_RUBRIC_CRITERIA_PER_PAGE } from "@/lib/previewPagination";
import { SCROLL_ANCHOR_FRONT_MATTER } from "@/lib/scrollAnchors";

function InvestigationStudentContent({ frontMatter }: { frontMatter: FrontMatterConfig }) {
  const investigation = normalizeInvestigation(frontMatter.investigation);

  return (
    <div className="investigation-student-content">
      <section className="investigation-task">
        <h2>
          <FrontMatterInlineText text={investigation.taskTitle} />
        </h2>
        <FormattedText text={investigation.taskBody} />
      </section>

      <section className="investigation-guidance">
        <h2>
          <FrontMatterInlineText text={investigation.guidanceTitle} />
        </h2>
        <ol>
          {investigation.criteria.map((criterion) => (
            <li key={criterion.id}>
              <strong>
                <FrontMatterInlineText text={criterion.heading} />
              </strong>
              <FormattedText text={criterion.guidance} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function rubricCriterionPages(criteria: InvestigationCriterionConfig[]) {
  if (!criteria.length) return [[]];
  const pages: InvestigationCriterionConfig[][] = [];
  for (let index = 0; index < criteria.length; index += INVESTIGATION_RUBRIC_CRITERIA_PER_PAGE) {
    pages.push(criteria.slice(index, index + INVESTIGATION_RUBRIC_CRITERIA_PER_PAGE));
  }
  return pages;
}

function InvestigationTeacherRubricPage({
  frontMatter,
  investigation,
  criteria,
  pageIndex,
  pageCount,
}: {
  frontMatter: FrontMatterConfig;
  investigation: InvestigationConfig;
  criteria: InvestigationCriterionConfig[];
  pageIndex: number;
  pageCount: number;
}) {
  const totalMarks = investigationTotalMarks(investigation);
  const rubricAllocationHeading = investigation.criteria.every((criterion) => criterion.scoringMode === "holistic")
    ? "Performance level descriptors"
    : investigation.criteria.some((criterion) => criterion.scoringMode === "holistic")
      ? "Mark allocations or performance levels"
      : "Mark allocation";

  return (
    <section className="investigation-page investigation-teacher-page">
      <div className="investigation-rubric-heading">
        <p className="investigation-rubric-context">
          <FrontMatterInlineText text={`${frontMatter.subjectTitle} · ${frontMatter.assessmentTitle} · ${totalMarks} marks`} />
        </p>
        <h2>
          <FrontMatterInlineText text={investigation.rubricTitle} />
          {pageIndex > 0 ? <span className="investigation-rubric-continuation"> (continued)</span> : null}
        </h2>
        {pageIndex === 0 ? <FormattedText text={investigation.rubricInstructions} /> : null}
        {pageCount > 1 ? (
          <p className="investigation-rubric-page-number">
            Rubric page {pageIndex + 1} of {pageCount}
          </p>
        ) : null}
      </div>
      <table className="investigation-rubric">
        <thead>
          <tr>
            <th>Criterion</th>
            <th>{rubricAllocationHeading}</th>
            <th>Marks</th>
          </tr>
        </thead>
        <tbody>
          {criteria.map((criterion) => (
            <tr key={criterion.id}>
              <td>
                <strong>
                  <FrontMatterInlineText text={criterion.heading} />
                </strong>
                <FormattedText text={criterion.guidance} />
              </td>
              <td>
                <ul>
                  {criterion.allocations.map((allocation) => (
                    <li key={allocation.id}>
                      <strong>{allocation.marks}</strong>
                      <span>
                        <FrontMatterInlineText text={allocation.description} />
                      </span>
                    </li>
                  ))}
                </ul>
              </td>
              <td className="investigation-rubric-score">____ / {investigationCriterionMarks(criterion)}</td>
            </tr>
          ))}
        </tbody>
        {pageIndex === pageCount - 1 ? (
          <tfoot>
            <tr>
              <th colSpan={2}>Total</th>
              <th className="investigation-rubric-score">____ / {totalMarks}</th>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </section>
  );
}

export function InvestigationPreview({
  frontMatter,
  logo,
  showSolutions,
  showPageBreaks,
  activePreviewAnchor,
  style,
}: {
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  showSolutions: boolean;
  showPageBreaks: boolean;
  activePreviewAnchor?: string;
  style?: CSSProperties;
}) {
  const investigation = normalizeInvestigation(frontMatter.investigation);
  const rubricPages = rubricCriterionPages(investigation.criteria);

  return (
    <div className="a4-preview-root a4-preview-root-investigation" style={style}>
      <div className="a4-preview-shell">
        <div className="a4-preview-stack">
          <A4PreviewPageFrame last={!showSolutions}>
            <section className="a4-page">
              <div className="a4-page-content">
                <TestFrontMatterPreview
                  frontMatter={frontMatter}
                  logo={logo}
                  totalMarks={investigationTotalMarks(investigation)}
                  activePreviewAnchor={activePreviewAnchor}
                  scrollAnchor={SCROLL_ANCHOR_FRONT_MATTER}
                  className="test-front-matter-investigation"
                  contentPosition="after-student-row"
                >
                  <InvestigationStudentContent frontMatter={frontMatter} />
                </TestFrontMatterPreview>
              </div>
            </section>
          </A4PreviewPageFrame>
          {showSolutions
            ? rubricPages.map((criteria, pageIndex) => (
                <Fragment key={`investigation-rubric-${pageIndex}`}>
                  {showPageBreaks ? (
                    <div className="a4-page-break" aria-hidden="true">
                      <span>A4 page break</span>
                    </div>
                  ) : null}
                  <A4PreviewPageFrame last={pageIndex === rubricPages.length - 1}>
                    <section className="a4-page">
                      <div className="a4-page-content">
                        <InvestigationTeacherRubricPage
                          frontMatter={frontMatter}
                          investigation={investigation}
                          criteria={criteria}
                          pageIndex={pageIndex}
                          pageCount={rubricPages.length}
                        />
                      </div>
                    </section>
                  </A4PreviewPageFrame>
                </Fragment>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
