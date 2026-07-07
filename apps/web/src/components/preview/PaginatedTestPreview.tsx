import { Fragment, memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ChoiceNumberingStyle, FormattingConfig } from "@mauth-studio/shared";

import { FrontMatterInlineText, MixedMath, SolutionMarkTicks } from "@/components/MathText";
import {
  PreviewContentBlocks as PreviewContentBlocksBase,
  type PreviewContentBlocksProps as PreviewContentBlocksBaseProps,
  type PreviewContentRenderers,
  type PreviewContentRuntime,
} from "@/components/preview/PreviewContentBlocks";
import { PreviewDiagram } from "@/components/preview/PreviewDiagram";
import {
  FrontMatterPreviewPages,
  NotesHeaderPreview,
  SchoolExamPageFooter,
  SchoolExamRunningHeader,
  SchoolExamSupplementaryPage,
  WorksheetHeaderPreview,
} from "@/components/preview/FrontMatterPreviewPages";
import { A4PreviewPageFrame } from "@/components/preview/PreviewPageFrame";
import {
  normalizeChoiceItems,
  normalizeChoiceListLayout,
  normalizeChoiceNumberingStyle,
  normalizeTableBlock,
  plainTableRows,
} from "@/lib/contentBlockNormalization";
import { graphHeight } from "@/lib/diagramGraph2d";
import { diagramAlignmentClass, effectiveDiagramTextSide, withGraphDefaults } from "@/lib/editorDiagramConfig";
import {
  isOrderedBlockVisible,
  isOrderedDiagramBesideContentBlock,
  markLabel,
  notesSectionTitle,
  questionMarks,
  visibilityReplacementSlotAtOrderedItems,
} from "@/lib/editorDocumentToc";
import {
  alphaLabel,
  orderedPartItems,
  romanLabel,
  type DocumentFlowItem,
  type DocumentSectionHeading,
  type QuestionBlock,
} from "@/lib/editorDocumentNormalization";
import { DEFAULT_FORMATTING_CONFIG, normalizeFormattingConfig } from "@/lib/editorFormattingConfig";
import {
  buildPreviewSegments,
  contentBlocksHaveDiagram,
  contentBlocksHaveVisibilityReplacementSlot,
  previewPartBlockRowIds,
  promptTextBlock,
  type PreviewGraphConfigChange,
  type PreviewSegment,
} from "@/lib/editorPreviewSegments";
import { questionDisplayNumber } from "@/lib/editorSolutionValidationRuntime";
import { spaceLines } from "@/lib/editorContentBlockNormalization";
import { normalizeExamTitlePage, type FrontMatterConfig } from "@/lib/frontMatterConfig";
import { selectedLogoForFrontMatter, type LogoAsset } from "@/lib/logoLibrary";
import { pageFormatFromConfig, pageStyle } from "@/lib/previewPageFormat";
import {
  bookletSupplementaryPageCount,
  buildExplicitBreakPages,
  buildMeasuredPages,
  examQuestionPageReservedHeight,
  frontMatterPageCount,
  groupPreviewPageSegments,
  pagesAreEqual,
  type PreviewPage,
  type PreviewPageSegmentEntry,
  type PreviewQuestionSegmentGroup,
} from "@/lib/previewPagination";
import {
  partBlockScrollAnchor,
  partScrollAnchor,
  previewSelectionAttr,
  questionBlockScrollAnchor,
  questionScrollAnchor,
  sectionHeadingScrollAnchor,
  subpartBlockScrollAnchor,
  subpartScrollAnchor,
} from "@/lib/scrollAnchors";
import {
  isContentBlockVisibleInScope,
  isDiagramBesideContentBlockInScope,
  isSolutionTextBlock,
  visibilityReplacementSlotAt,
} from "@/lib/solutionBlockVisibility";
import { measuredLineHeightPx, solutionSlotToleranceLines } from "@/lib/solutionValidation";
import { cn } from "@/lib/utils";

function choiceLabel(style: ChoiceNumberingStyle | undefined, index: number) {
  const normalizedStyle = normalizeChoiceNumberingStyle(style);
  if (normalizedStyle === "bullet") return "•";
  if (normalizedStyle === "decimal") return `${index + 1}.`;
  if (normalizedStyle === "upper-alpha") return `${alphaLabel(index).toUpperCase()}.`;
  if (normalizedStyle === "lower-alpha") return `${alphaLabel(index)}.`;
  return `${romanLabel(index)}.`;
}

type AppPreviewContentBlocksProps = Omit<PreviewContentBlocksBaseProps, "runtime" | "renderers">;

const previewContentRuntime: PreviewContentRuntime = {
  choiceLabel,
  diagramAlignmentClass,
  effectiveDiagramTextSide,
  graphHeight,
  isContentBlockVisibleInScope,
  isDiagramBesideContentBlockInScope,
  isSolutionTextBlock,
  measuredLineHeightPx,
  normalizeChoiceItems,
  normalizeChoiceListLayout,
  normalizeTableBlock,
  plainTableRows: (table) => plainTableRows(table as ReturnType<typeof normalizeTableBlock>),
  previewSelectionAttr,
  solutionSlotToleranceLines: (studentBlock) => solutionSlotToleranceLines(studentBlock, { spaceLines }),
  spaceLines,
  visibilityReplacementSlotAt,
};

const previewContentRenderers: PreviewContentRenderers = {
  renderDiagram: (props) => <PreviewDiagram {...props} withGraphDefaults={withGraphDefaults} />,
  renderMath: (source, options) => (
    <MixedMath
      source={source}
      showSolutionMarks={Boolean(options?.showSolutionMarks)}
      plainSimpleInlineLatex={options?.plainSimpleInlineLatex ?? true}
    />
  ),
  renderSolutionMarkTicks: (count) => <SolutionMarkTicks count={count} />,
};

function PreviewContentBlocks(props: AppPreviewContentBlocksProps) {
  return <PreviewContentBlocksBase {...props} runtime={previewContentRuntime} renderers={previewContentRenderers} />;
}

type AppPreviewPageSegmentEntry = PreviewPageSegmentEntry<PreviewSegment>;
type AppPreviewQuestionSegmentGroup = PreviewQuestionSegmentGroup<PreviewSegment>;

const TestPreviewSegment = memo(function TestPreviewSegment({
  segment,
  frontMatter,
  logo,
  totalMarks = 0,
  firstOnPage = false,
  measureOnly = false,
  showSolutions = true,
  showMarks = true,
  activePreviewAnchor,
  onGraphConfigChange,
}: {
  segment: PreviewSegment;
  frontMatter: FrontMatterConfig;
  logo?: LogoAsset;
  totalMarks?: number;
  firstOnPage?: boolean;
  measureOnly?: boolean;
  showSolutions?: boolean;
  showMarks?: boolean;
  activePreviewAnchor?: string;
  onGraphConfigChange?: (change: PreviewGraphConfigChange) => void;
}) {
  const questionNumber =
    typeof segment.questionIndex === "number" ? questionDisplayNumber(frontMatter, segment.questionIndex) : frontMatter.startQuestionNumber;
  const paddingTop = firstOnPage ? 0 : segment.spacingTop;

  if (segment.kind === "worksheet-header") {
    return (
      <div className="test-preview-segment worksheet-header-segment" data-measure-segment={measureOnly ? "true" : undefined}>
        <WorksheetHeaderPreview
          frontMatter={frontMatter}
          logo={logo}
          totalMarks={totalMarks}
          activePreviewAnchor={measureOnly ? undefined : activePreviewAnchor}
        />
      </div>
    );
  }

  if (segment.kind === "notes-header") {
    return (
      <div className="test-preview-segment notes-header-segment" data-measure-segment={measureOnly ? "true" : undefined}>
        <NotesHeaderPreview frontMatter={frontMatter} logo={logo} activePreviewAnchor={measureOnly ? undefined : activePreviewAnchor} />
      </div>
    );
  }

  if (segment.kind === "section-heading" && segment.sectionHeading) {
    const anchor = sectionHeadingScrollAnchor(segment.sectionHeading.id);
    return (
      <div
        className="test-preview-segment test-section-heading"
        data-scroll-anchor={measureOnly ? undefined : anchor}
        data-preview-structure-anchor={measureOnly ? undefined : "true"}
        data-preview-selected={previewSelectionAttr(measureOnly ? undefined : anchor, activePreviewAnchor)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        <h3>
          <FrontMatterInlineText text={segment.sectionHeading.title || "Section heading"} />
        </h3>
      </div>
    );
  }

  if (segment.kind === "question-start" && segment.question) {
    const isNotesTemplate = frontMatter.titlePageTemplate === "notes";
    const questionPromptBlock = isNotesTemplate ? null : promptTextBlock(`${segment.question.id}:prompt`, segment.question.text);
    return (
      <div
        className={cn("test-preview-segment test-question-start", isNotesTemplate && "notes-section-start")}
        data-scroll-anchor={measureOnly ? undefined : questionScrollAnchor(segment.question.id)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        <div className="test-question-header flex items-start justify-between gap-4">
          <h3 className="font-bold">
            {isNotesTemplate ? <FrontMatterInlineText text={notesSectionTitle(segment.question, segment.questionIndex ?? 0)} /> : null}
            {!isNotesTemplate ? `Question ${questionNumber}` : null}
          </h3>
          <span className="whitespace-nowrap font-bold">
            {showMarks && !isNotesTemplate ? markLabel(questionMarks(segment.question)) : ""}
          </span>
        </div>
        {questionPromptBlock ? (
          <div className="test-question-prompt-row">
            <PreviewContentBlocks
              blocks={[questionPromptBlock]}
              measureOnly={measureOnly}
              showSolutions={showSolutions}
              activePreviewAnchor={activePreviewAnchor}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (segment.kind === "question-block" && segment.question && segment.block) {
    const question = segment.question;
    return (
      <div
        className="test-preview-segment test-question-block"
        data-scroll-anchor={measureOnly ? undefined : questionBlockScrollAnchor(question.id, segment.block.id)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        <PreviewContentBlocks
          blocks={segment.blocks ?? (segment.block ? [segment.block] : [])}
          measureOnly={measureOnly}
          showSolutions={showSolutions}
          activePreviewAnchor={activePreviewAnchor}
          blockAnchorFor={(block) => questionBlockScrollAnchor(question.id, block.id)}
          onGraphConfigChange={(blockId, graphConfig) => onGraphConfigChange?.({ questionId: question.id, blockId, graphConfig })}
        />
      </div>
    );
  }

  if (segment.kind === "page-break") {
    return <div className="test-preview-segment" data-measure-segment={measureOnly ? "true" : undefined} />;
  }

  if (segment.kind === "part-group" && segment.question && segment.part) {
    const question = segment.question;
    const part = segment.part;
    const isNotesTemplate = frontMatter.titlePageTemplate === "notes";
    const hasSubparts = part.subparts.length > 0;
    const partLabel = alphaLabel(segment.partIndex ?? 0);
    const partItems = segment.partItems ?? orderedPartItems(part);
    const visiblePartBlockRowIds = previewPartBlockRowIds(partItems, showSolutions);
    const firstContentItemId = visiblePartBlockRowIds[0];
    const showPartLabel = !isNotesTemplate && segment.showPartLabel !== false;
    const partPromptBlock = promptTextBlock(`${part.id}:prompt`, part.text);
    return (
      <section
        className="test-preview-segment test-part-group"
        data-scroll-anchor={measureOnly ? undefined : partScrollAnchor(question.id, part.id)}
        data-preview-structure-anchor={measureOnly ? undefined : "true"}
        data-preview-selected={previewSelectionAttr(measureOnly ? undefined : partScrollAnchor(question.id, part.id), activePreviewAnchor)}
        data-measure-segment={measureOnly ? "true" : undefined}
        style={{ paddingTop }}
      >
        {showPartLabel && partPromptBlock ? (
          <div className="test-question-part">
            <span className="test-part-label">({partLabel})</span>
            <div className="test-part-content">
              <PreviewContentBlocks
                blocks={[partPromptBlock]}
                measureOnly={measureOnly}
                showSolutions={showSolutions}
                activePreviewAnchor={activePreviewAnchor}
              />
            </div>
            <span className="test-part-mark">{showMarks && !hasSubparts ? markLabel(part.marks) : ""}</span>
          </div>
        ) : showPartLabel && hasSubparts && !visiblePartBlockRowIds.length ? (
          <div className="test-question-part">
            <span className="test-part-label">({partLabel})</span>
            <div className="test-part-content" />
            <span className="test-part-mark" />
          </div>
        ) : null}
        <div
          className={cn(
            hasSubparts && "test-subpart-group",
            showPartLabel && hasSubparts && !visiblePartBlockRowIds.length && "test-subpart-group-after-label",
          )}
        >
          {(() => {
            const rows: ReactNode[] = [];
            for (let itemIndex = 0; itemIndex < partItems.length; itemIndex += 1) {
              const item = partItems[itemIndex];
              if (item.kind === "block") {
                const nextItem = partItems[itemIndex + 1];
                const replacementSlotFollows = visibilityReplacementSlotAtOrderedItems(partItems, itemIndex + 1);
                const diagramReplacementBlocks =
                  item.block.kind === "diagram" &&
                  isOrderedBlockVisible(partItems, itemIndex, showSolutions) &&
                  replacementSlotFollows &&
                  effectiveDiagramTextSide(item.block, true) !== "none"
                    ? [item.block, ...replacementSlotFollows.blocks]
                    : undefined;
                const replacementSlot = visibilityReplacementSlotAtOrderedItems(partItems, itemIndex);
                const replacementBlocks = replacementSlot?.blocks;
                if (!diagramReplacementBlocks && !replacementBlocks && !isOrderedBlockVisible(partItems, itemIndex, showSolutions))
                  continue;
                const pairedBlocks =
                  item.block.kind === "diagram" &&
                  nextItem?.kind === "block" &&
                  isOrderedDiagramBesideContentBlock(partItems, itemIndex + 1, showSolutions) &&
                  effectiveDiagramTextSide(item.block, true) !== "none"
                    ? [item.block, nextItem.block]
                    : undefined;
                const rowBlocks = diagramReplacementBlocks ?? replacementBlocks ?? pairedBlocks ?? [item.block];
                const rowHasVisibilitySlot = Boolean(diagramReplacementBlocks || replacementBlocks);
                rows.push(
                  <div
                    key={rowBlocks.length > 1 ? `${item.id}:${rowBlocks[1].id}` : item.id}
                    data-scroll-anchor={measureOnly ? undefined : partBlockScrollAnchor(question.id, part.id, item.block.id)}
                    className={cn(
                      "test-question-part",
                      item.block.kind === "diagram" && "test-question-row-with-diagram",
                      rowHasVisibilitySlot && "test-question-row-with-visibility-slot",
                      item.block.kind === "text" && isSolutionTextBlock(item.block) && "test-solution-row",
                    )}
                  >
                    <span className="test-part-label">
                      {showPartLabel && !partPromptBlock && item.id === firstContentItemId ? `(${partLabel})` : ""}
                    </span>
                    <div className="test-part-content">
                      <PreviewContentBlocks
                        blocks={rowBlocks}
                        measureOnly={measureOnly}
                        showSolutions={showSolutions}
                        activePreviewAnchor={activePreviewAnchor}
                        blockAnchorFor={(block) => partBlockScrollAnchor(question.id, part.id, block.id)}
                        onGraphConfigChange={(blockId, graphConfig) =>
                          onGraphConfigChange?.({ questionId: question.id, partId: part.id, blockId, graphConfig })
                        }
                      />
                    </div>
                    <span className="test-part-mark">
                      {showMarks && !hasSubparts && !partPromptBlock && item.id === firstContentItemId ? markLabel(part.marks) : ""}
                    </span>
                  </div>,
                );
                if (diagramReplacementBlocks && replacementSlotFollows) itemIndex = replacementSlotFollows.endItemIndex;
                else if (replacementBlocks && replacementSlot) itemIndex = replacementSlot.endItemIndex;
                else if (pairedBlocks) itemIndex += 1;
                continue;
              }

              const subpartIndex = part.subparts.findIndex((subpart) => subpart.id === item.subpart.id);
              const subpartPromptBlock = promptTextBlock(`${item.subpart.id}:prompt`, item.subpart.text);
              const subpartBlocks = subpartPromptBlock ? [subpartPromptBlock, ...item.subpart.contentBlocks] : item.subpart.contentBlocks;
              rows.push(
                <div
                  key={item.subpart.id}
                  data-scroll-anchor={measureOnly ? undefined : subpartScrollAnchor(question.id, part.id, item.subpart.id)}
                  data-preview-structure-anchor={measureOnly ? undefined : "true"}
                  data-preview-selected={previewSelectionAttr(
                    measureOnly ? undefined : subpartScrollAnchor(question.id, part.id, item.subpart.id),
                    activePreviewAnchor,
                  )}
                  className={cn(
                    "test-question-subpart",
                    contentBlocksHaveDiagram(item.subpart.contentBlocks, showSolutions) && "test-question-row-with-diagram",
                    contentBlocksHaveVisibilityReplacementSlot(item.subpart.contentBlocks) && "test-question-row-with-visibility-slot",
                  )}
                >
                  <span className="test-part-label">{isNotesTemplate ? "" : `(${romanLabel(Math.max(0, subpartIndex))})`}</span>
                  <div className="test-part-content">
                    <PreviewContentBlocks
                      blocks={subpartBlocks}
                      measureOnly={measureOnly}
                      showSolutions={showSolutions}
                      activePreviewAnchor={activePreviewAnchor}
                      blockAnchorFor={(block) =>
                        block.id === subpartPromptBlock?.id
                          ? undefined
                          : subpartBlockScrollAnchor(question.id, part.id, item.subpart.id, block.id)
                      }
                      onGraphConfigChange={(blockId, graphConfig) =>
                        onGraphConfigChange?.({
                          questionId: question.id,
                          partId: part.id,
                          subpartId: item.subpart.id,
                          blockId,
                          graphConfig,
                        })
                      }
                    />
                  </div>
                  <span className="test-part-mark">{showMarks ? markLabel(item.subpart.marks) : ""}</span>
                </div>,
              );
            }
            return rows;
          })()}
        </div>
      </section>
    );
  }

  return <div className="test-preview-segment" data-measure-segment={measureOnly ? "true" : undefined} style={{ paddingTop }} />;
});

interface PaginatedTestPreviewProps {
  frontMatter: FrontMatterConfig;
  logos: LogoAsset[];
  totalMarks: number;
  questions: QuestionBlock[];
  sectionHeadings: DocumentSectionHeading[];
  documentFlow: DocumentFlowItem[];
  normalizeDocumentFlow: (value: unknown, questions: QuestionBlock[], sectionHeadings: DocumentSectionHeading[]) => DocumentFlowItem[];
  formattingConfig?: FormattingConfig;
  scale?: number;
  showSolutions?: boolean;
  activePreviewAnchor?: string;
  onGraphConfigChange?: (change: PreviewGraphConfigChange) => void;
}

export const PaginatedTestPreview = memo(function PaginatedTestPreview({
  frontMatter,
  logos,
  totalMarks,
  questions,
  sectionHeadings,
  documentFlow,
  normalizeDocumentFlow,
  formattingConfig,
  scale = 1,
  showSolutions = true,
  activePreviewAnchor,
  onGraphConfigChange,
}: PaginatedTestPreviewProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const normalizedFormatting = useMemo(() => normalizeFormattingConfig(formattingConfig), [formattingConfig]);
  const pageFormat = useMemo(() => pageFormatFromConfig(normalizedFormatting), [normalizedFormatting]);
  const showMarks = normalizedFormatting.showMarks ?? DEFAULT_FORMATTING_CONFIG.showMarks ?? true;
  const previewStyle = useMemo(() => pageStyle(pageFormat, scale), [pageFormat, scale]);
  const segments = useMemo(
    () =>
      buildPreviewSegments({
        frontMatter,
        questions,
        sectionHeadings,
        documentFlow,
        showSolutions,
        formattingConfig: normalizedFormatting,
        normalizeDocumentFlow,
      }),
    [documentFlow, frontMatter, normalizeDocumentFlow, normalizedFormatting, questions, sectionHeadings, showSolutions],
  );
  const fallbackPages = useMemo<PreviewPage[]>(() => buildExplicitBreakPages(segments), [segments]);
  const [pages, setPages] = useState<PreviewPage[]>(fallbackPages);
  const frontMatterLogo = useMemo(() => selectedLogoForFrontMatter(logos, frontMatter), [frontMatter, logos]);
  const exam = useMemo(() => normalizeExamTitlePage(frontMatter.exam), [frontMatter.exam]);
  const isExamTemplate = frontMatter.titlePageTemplate === "exam";
  const reservedPageHeight = examQuestionPageReservedHeight(frontMatter);

  useLayoutEffect(() => {
    const measureRoot = measureRef.current;
    if (!measureRoot) return;

    const segmentHeights = Array.from(measureRoot.querySelectorAll<HTMLElement>("[data-measure-segment]")).map(
      (element) => element.getBoundingClientRect().height,
    );
    const nextPages = buildMeasuredPages(segmentHeights, segments, pageFormat, reservedPageHeight);
    setPages((currentPages) => (pagesAreEqual(currentPages, nextPages) ? currentPages : nextPages));
  }, [frontMatterLogo, pageFormat, reservedPageHeight, segments, showMarks]);

  const visiblePages = pages.length ? pages : fallbackPages;
  const supplementaryPageCount = bookletSupplementaryPageCount(frontMatter, visiblePages.length);
  const visiblePageGroups = useMemo(
    () =>
      visiblePages.map((page) => {
        const entries: AppPreviewPageSegmentEntry[] = [];
        page.segmentIndexes.forEach((segmentIndex, segmentPageIndex) => {
          const segment = segments[segmentIndex];
          if (segment) entries.push({ segment, segmentPageIndex });
        });

        return {
          page,
          groups: groupPreviewPageSegments(entries),
        };
      }),
    [segments, visiblePages],
  );

  const renderPreviewGroup = (group: AppPreviewQuestionSegmentGroup) => {
    const content = group.entries.map(({ segment, segmentPageIndex }) => (
      <TestPreviewSegment
        key={segment.id}
        segment={segment}
        frontMatter={frontMatter}
        logo={frontMatterLogo}
        totalMarks={totalMarks}
        firstOnPage={segmentPageIndex === 0}
        showSolutions={showSolutions}
        showMarks={showMarks}
        activePreviewAnchor={activePreviewAnchor}
        onGraphConfigChange={onGraphConfigChange}
      />
    ));

    if (!group.question) {
      return (
        <div key={group.id} className="test-preview-document-group">
          {content}
        </div>
      );
    }

    return (
      <div
        key={group.id}
        className="test-preview-question-group"
        data-scroll-anchor={questionScrollAnchor(group.question.id)}
        data-preview-structure-anchor="true"
        data-preview-selected={previewSelectionAttr(questionScrollAnchor(group.question.id), activePreviewAnchor)}
      >
        {content}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "a4-preview-root",
        frontMatter.titlePageTemplate === "worksheet" && "a4-preview-root-worksheet",
        frontMatter.titlePageTemplate === "notes" && "a4-preview-root-notes",
      )}
      style={previewStyle}
    >
      <div className="a4-preview-shell">
        <div className="a4-preview-stack">
          {frontMatter.titlePageTemplate !== "worksheet" && frontMatter.titlePageTemplate !== "notes" ? (
            <FrontMatterPreviewPages
              frontMatter={frontMatter}
              logo={frontMatterLogo}
              totalMarks={totalMarks}
              questionCount={questions.length}
              activePreviewAnchor={activePreviewAnchor}
              showPageBreaks={pageFormat.showPageBreaks}
            />
          ) : null}
          {frontMatter.titlePageTemplate !== "worksheet" && frontMatter.titlePageTemplate !== "notes" && pageFormat.showPageBreaks ? (
            <div className="a4-page-break" aria-hidden="true">
              <span>A4 page break</span>
            </div>
          ) : null}
          {visiblePageGroups.map(({ page, groups }, pageIndex) => {
            const isLastQuestionPage = pageIndex === visiblePages.length - 1;
            const isLastRenderedPage = isLastQuestionPage && supplementaryPageCount === 0;
            const pageNumber = frontMatterPageCount(frontMatter) + pageIndex + 1;
            return (
              <Fragment key={`page-${pageIndex}`}>
                <A4PreviewPageFrame last={isLastRenderedPage}>
                  <section className={cn("a4-page", isExamTemplate && "school-exam-question-page", isLastRenderedPage && "a4-page-last")}>
                    <div className="a4-page-content">
                      {isExamTemplate ? <SchoolExamRunningHeader exam={exam} pageNumber={pageNumber} /> : null}
                      <div className={cn("test-preview-flow", isExamTemplate && "school-exam-question-flow")}>
                        <div className="test-preview-question-list">{groups.map(renderPreviewGroup)}</div>
                      </div>
                      {page.overflow ? (
                        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                          A single block in this question is taller than the available A4 page space.
                        </div>
                      ) : null}
                      {isExamTemplate ? (
                        <SchoolExamPageFooter text={isLastQuestionPage ? exam.endOfQuestionsFooterText : exam.footerText} />
                      ) : null}
                    </div>
                  </section>
                </A4PreviewPageFrame>
                {pageFormat.showPageBreaks && !isLastRenderedPage ? (
                  <div className="a4-page-break" aria-hidden="true">
                    <span>A4 page break</span>
                  </div>
                ) : null}
              </Fragment>
            );
          })}
          {Array.from({ length: supplementaryPageCount }).map((_, supplementaryPageIndex) => {
            const finalPage = supplementaryPageIndex === supplementaryPageCount - 1;
            const pageNumber = frontMatterPageCount(frontMatter) + visiblePages.length + supplementaryPageIndex + 1;
            return (
              <Fragment key={`exam-supplementary-page-${supplementaryPageIndex}`}>
                <A4PreviewPageFrame last={finalPage}>
                  <SchoolExamSupplementaryPage frontMatter={frontMatter} pageNumber={pageNumber} />
                </A4PreviewPageFrame>
                {pageFormat.showPageBreaks && !finalPage ? (
                  <div className="a4-page-break" aria-hidden="true">
                    <span>A4 page break</span>
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div ref={measureRef} className="a4-measure" aria-hidden="true">
        <section className="a4-page">
          <div className="a4-page-content">
            <div className="test-preview-flow">
              {segments.map((segment) => (
                <TestPreviewSegment
                  key={segment.id}
                  segment={segment}
                  frontMatter={frontMatter}
                  logo={frontMatterLogo}
                  totalMarks={totalMarks}
                  measureOnly
                  showSolutions={showSolutions}
                  showMarks={showMarks}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
});
