import { Fragment, type CSSProperties } from "react";

import { FormattedText, FrontMatterInlineText } from "@/components/MathText";
import { TestFrontMatterPreview } from "@/components/preview/FrontMatterPreviewPages";
import { A4PreviewPageFrame } from "@/components/preview/PreviewPageFrame";
import { PreviewDiagram } from "@/components/preview/PreviewDiagram";
import {
  investigationCriterionMarks,
  investigationTotalMarks,
  normalizeInvestigation,
  type FrontMatterConfig,
  type InvestigationConfig,
  type InvestigationCriterionConfig,
  type InvestigationDiagramConfig,
  type InvestigationStudentPageConfig,
} from "@/lib/frontMatterConfig";
import { withGraphDefaults } from "@/lib/editorDiagramConfig";
import type { LogoAsset } from "@/lib/logoLibrary";
import { INVESTIGATION_RUBRIC_CRITERIA_PER_PAGE } from "@/lib/previewPagination";
import {
  SCROLL_ANCHOR_FRONT_MATTER,
  SCROLL_ANCHOR_INVESTIGATION_RUBRIC,
  investigationDiagramScrollAnchor,
  investigationPageScrollAnchor,
  investigationTextSectionScrollAnchor,
  previewSelectionAttr,
} from "@/lib/scrollAnchors";

function InvestigationDiagramGallery({
  diagrams,
  pageId,
  activePreviewAnchor,
}: {
  diagrams: InvestigationDiagramConfig[];
  pageId: string;
  activePreviewAnchor?: string;
}) {
  if (!diagrams.length) return null;
  return (
    <div className="investigation-diagram-gallery">
      {diagrams.map((diagram) => {
        const anchor = investigationDiagramScrollAnchor(pageId, diagram.id);
        return (
          <figure
            key={diagram.id}
            className={`investigation-diagram investigation-diagram-${diagram.alignment}`}
            data-investigation-diagram-id={diagram.id}
            data-scroll-anchor={anchor}
            data-preview-structure-anchor="true"
            data-preview-selected={previewSelectionAttr(anchor, activePreviewAnchor)}
          >
            <h3>
              <FrontMatterInlineText text={diagram.title} />
            </h3>
            <div className="investigation-diagram-surface">
              <PreviewDiagram graphConfig={diagram.graphConfig} showSolutions={false} withGraphDefaults={withGraphDefaults} />
            </div>
            {diagram.caption ? (
              <figcaption>
                <FormattedText text={diagram.caption} />
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

function InvestigationGuidance({ investigation }: { investigation: InvestigationConfig }) {
  return (
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
            <FormattedText text={criterion.guidance} className="investigation-guidance-copy" />
          </li>
        ))}
      </ol>
    </section>
  );
}

function InvestigationPageContents({
  investigation,
  page,
  activePreviewAnchor,
}: {
  investigation: InvestigationConfig;
  page: InvestigationStudentPageConfig;
  activePreviewAnchor?: string;
}) {
  const diagrams = investigation.diagrams.filter((diagram) => diagram.pageId === page.id);
  return (
    <div className="investigation-student-content">
      {page.sections.map((section) => {
        const anchor = investigationTextSectionScrollAnchor(page.id, section.id);
        return (
          <section
            key={section.id}
            className="investigation-task investigation-text-section"
            data-scroll-anchor={anchor}
            data-preview-structure-anchor="true"
            data-preview-selected={previewSelectionAttr(anchor, activePreviewAnchor)}
          >
            {section.heading ? (
              <h3>
                <FrontMatterInlineText text={section.heading} />
              </h3>
            ) : null}
            <FormattedText text={section.body} />
          </section>
        );
      })}
      <InvestigationDiagramGallery diagrams={diagrams} pageId={page.id} activePreviewAnchor={activePreviewAnchor} />
    </div>
  );
}

function InvestigationStudentContinuation({
  frontMatter,
  investigation,
  page,
  showGuidance,
  activePreviewAnchor,
}: {
  frontMatter: FrontMatterConfig;
  investigation: InvestigationConfig;
  page: InvestigationStudentPageConfig;
  showGuidance: boolean;
  activePreviewAnchor?: string;
}) {
  const context = [frontMatter.subjectTitle, frontMatter.assessmentTitle, frontMatter.assessmentSubtitle].filter(Boolean).join(" · ");
  const pageAnchor = investigationPageScrollAnchor(page.id);

  return (
    <section
      className="investigation-page investigation-student-continuation-page"
      data-scroll-anchor={pageAnchor}
      data-preview-structure-anchor="true"
      data-preview-selected={previewSelectionAttr(pageAnchor, activePreviewAnchor)}
    >
      <p className="investigation-rubric-context">
        <FrontMatterInlineText text={context} />
      </p>
      <h2>
        <FrontMatterInlineText text={page.title} />
      </h2>
      <InvestigationPageContents investigation={investigation} page={page} activePreviewAnchor={activePreviewAnchor} />
      {showGuidance ? <InvestigationGuidance investigation={investigation} /> : null}
    </section>
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
    <section
      className="investigation-page investigation-teacher-page"
      data-scroll-anchor={pageIndex === 0 ? SCROLL_ANCHOR_INVESTIGATION_RUBRIC : undefined}
      data-preview-structure-anchor={pageIndex === 0 ? "true" : undefined}
    >
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
  const studentPages = investigation.studentPages;
  const firstStudentPage = studentPages[0];

  return (
    <div className="a4-preview-root a4-preview-root-investigation" style={style}>
      <div className="a4-preview-shell">
        <div className="a4-preview-stack">
          <A4PreviewPageFrame last={!showSolutions && studentPages.length === 1}>
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
                  {firstStudentPage ? (
                    <div
                      data-scroll-anchor={investigationPageScrollAnchor(firstStudentPage.id)}
                      data-preview-structure-anchor="true"
                      data-preview-selected={previewSelectionAttr(investigationPageScrollAnchor(firstStudentPage.id), activePreviewAnchor)}
                    >
                      <section className="investigation-task">
                        <h2>
                          <FrontMatterInlineText text={firstStudentPage.title} />
                        </h2>
                        <InvestigationPageContents
                          investigation={investigation}
                          page={firstStudentPage}
                          activePreviewAnchor={activePreviewAnchor}
                        />
                      </section>
                      {studentPages.length === 1 ? <InvestigationGuidance investigation={investigation} /> : null}
                    </div>
                  ) : null}
                </TestFrontMatterPreview>
              </div>
            </section>
          </A4PreviewPageFrame>
          {studentPages.slice(1).map((page, pageIndex) => (
            <Fragment key={page.id}>
              {showPageBreaks ? (
                <div className="a4-page-break" aria-hidden="true">
                  <span>A4 page break</span>
                </div>
              ) : null}
              <A4PreviewPageFrame last={!showSolutions && pageIndex === studentPages.length - 2}>
                <section className="a4-page">
                  <div className="a4-page-content">
                    <InvestigationStudentContinuation
                      frontMatter={frontMatter}
                      investigation={investigation}
                      page={page}
                      showGuidance={pageIndex === studentPages.length - 2}
                      activePreviewAnchor={activePreviewAnchor}
                    />
                  </div>
                </section>
              </A4PreviewPageFrame>
            </Fragment>
          ))}
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
