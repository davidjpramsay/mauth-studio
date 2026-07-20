import { useLayoutEffect } from "react";
import type { ComponentProps, CSSProperties, MouseEventHandler, PointerEventHandler, RefObject } from "react";

import { EditorInspectorPane } from "@/components/editor/EditorInspectorPane";
import { EDITOR_ACTIVE_PANEL_CLASS } from "@/components/editor/EditorPanels";
import { EditorQuestionPanel } from "@/components/editor/EditorQuestionPanel";
import { PageBreakStructurePanel, SectionHeadingStructurePanel } from "@/components/editor/StructurePanels";
import { ProjectFileConflictBanner } from "@/components/files/ProjectFileConflictBanner";
import { FrontMatterEditor } from "@/components/front-matter/FrontMatterEditor";
import { PaginatedTestPreview } from "@/components/preview/PaginatedTestPreview";
import { documentEditorSurfaceKind, documentPageBreakPanelLabel, documentQuestionPanelLabel } from "@/lib/documentWorkspaceRenderPlan";
import { syncPreviewSelection } from "@/lib/editorDomNavigation";
import type { PartPageBreakTarget } from "@/lib/editorPageBreakLifecycle";
import type { DocumentSectionHeading, QuestionBlock } from "@/lib/editorDocumentNormalization";
import { questionDisplayNumber } from "@/lib/editorSolutionValidationRuntime";
import type { FrontMatterConfig } from "@/lib/frontMatterConfig";
import { SCROLL_ANCHOR_FRONT_MATTER, pageBreakScrollAnchor, questionScrollAnchor, sectionHeadingScrollAnchor } from "@/lib/scrollAnchors";
import { partPageBreakInsertTarget } from "@/lib/editorPageBreakLifecycle";
import { cn } from "@/lib/utils";

type PaneMode = "split" | "preview";

type QuestionPanelBindings = Omit<ComponentProps<typeof EditorQuestionPanel>, "question" | "label" | "active" | "canAddPartPageBreak">;

interface DocumentEditorSurfaceProps {
  editingFrontMatter: boolean;
  editingPageBreak: boolean;
  editingSectionHeading: boolean;
  activePageBreakQuestion: QuestionBlock | null;
  activeSectionHeading: DocumentSectionHeading | null;
  activeQuestion: QuestionBlock | null;
  questions: QuestionBlock[];
  frontMatter: FrontMatterConfig;
  activeAnchor: string;
  isActiveAnchor: (anchor: string) => boolean;
  frontMatterProps: ComponentProps<typeof FrontMatterEditor>;
  questionPanelBindings: QuestionPanelBindings;
  hasPartPageBreak: (target: PartPageBreakTarget) => boolean;
  onRemovePageBreak: (questionId: string) => void;
  onUpdateSectionHeading: (headingId: string, title: string) => void;
  onRemoveSectionHeading: (headingId: string) => void;
}

interface DocumentEditorWorkspaceProps {
  style: CSSProperties;
  paneMode: PaneMode;
  editor: {
    show: boolean;
    paneRef: RefObject<HTMLElement | null>;
    conflictBannerProps: ComponentProps<typeof ProjectFileConflictBanner>;
    surface: DocumentEditorSurfaceProps;
  };
  inspectorProps: ComponentProps<typeof EditorInspectorPane>;
  preview: {
    show: boolean;
    paneRef: RefObject<HTMLElement | null>;
    activeAnchor?: string;
    onPointerDownCapture: PointerEventHandler<HTMLElement>;
    onClickCapture: MouseEventHandler<HTMLElement>;
    onContextMenuCapture: MouseEventHandler<HTMLElement>;
    props: ComponentProps<typeof PaginatedTestPreview>;
  };
}

function ActiveDocumentEditorSurface({
  editingFrontMatter,
  editingPageBreak,
  editingSectionHeading,
  activePageBreakQuestion,
  activeSectionHeading,
  activeQuestion,
  questions,
  frontMatter,
  activeAnchor,
  isActiveAnchor,
  frontMatterProps,
  questionPanelBindings,
  hasPartPageBreak,
  onRemovePageBreak,
  onUpdateSectionHeading,
  onRemoveSectionHeading,
}: DocumentEditorSurfaceProps) {
  const activeQuestionIndex = activeQuestion ? questions.findIndex((question) => question.id === activeQuestion.id) : -1;
  const surfaceKind = documentEditorSurfaceKind({
    editingFrontMatter,
    editingPageBreak,
    editingSectionHeading,
    hasActivePageBreak: Boolean(activePageBreakQuestion),
    hasActiveSectionHeading: Boolean(activeSectionHeading),
    hasActiveQuestion: activeQuestionIndex >= 0,
  });

  if (surfaceKind === "frontMatter") {
    return (
      <div
        className={cn(
          "rounded-lg border bg-card p-4 shadow-panel transition-colors",
          isActiveAnchor(SCROLL_ANCHOR_FRONT_MATTER) && EDITOR_ACTIVE_PANEL_CLASS,
        )}
        data-scroll-anchor={SCROLL_ANCHOR_FRONT_MATTER}
      >
        <div className="flex flex-col gap-3">
          <FrontMatterEditor {...frontMatterProps} />
        </div>
      </div>
    );
  }

  if (surfaceKind === "pageBreak" && activePageBreakQuestion) {
    const questionIndex = Math.max(
      0,
      questions.findIndex((question) => question.id === activePageBreakQuestion.id),
    );
    const anchor = pageBreakScrollAnchor(activePageBreakQuestion.id);
    return (
      <div className="flex flex-col gap-4">
        <div data-scroll-anchor={anchor}>
          <PageBreakStructurePanel
            label={documentPageBreakPanelLabel({
              isNotesTemplate: questionPanelBindings.isNotesTemplate,
              questionIndex,
              displayNumber: questionDisplayNumber(frontMatter, questionIndex),
            })}
            active={isActiveAnchor(anchor)}
            onRemove={() => onRemovePageBreak(activePageBreakQuestion.id)}
          />
        </div>
      </div>
    );
  }

  if (surfaceKind === "sectionHeading" && activeSectionHeading) {
    const anchor = sectionHeadingScrollAnchor(activeSectionHeading.id);
    return (
      <div className="flex flex-col gap-4">
        <div data-scroll-anchor={anchor}>
          <SectionHeadingStructurePanel
            heading={activeSectionHeading}
            active={isActiveAnchor(anchor)}
            onChange={(title) => onUpdateSectionHeading(activeSectionHeading.id, title)}
            onRemove={() => onRemoveSectionHeading(activeSectionHeading.id)}
          />
        </div>
      </div>
    );
  }

  if (surfaceKind === "question" && activeQuestion && activeQuestionIndex >= 0) {
    const anchor = questionScrollAnchor(activeQuestion.id);
    return (
      <div className="flex flex-col gap-4">
        <EditorQuestionPanel
          {...questionPanelBindings}
          question={activeQuestion}
          label={documentQuestionPanelLabel({
            isNotesTemplate: questionPanelBindings.isNotesTemplate,
            questionIndex: activeQuestionIndex,
            displayNumber: questionDisplayNumber(frontMatter, activeQuestionIndex),
          })}
          active={isActiveAnchor(anchor)}
          canAddPartPageBreak={Boolean(
            partPageBreakInsertTarget({
              question: activeQuestion,
              activeAnchor,
              hasBreak: hasPartPageBreak,
            }),
          )}
        />
      </div>
    );
  }

  return null;
}

export function DocumentEditorWorkspace({ style, paneMode, editor, inspectorProps, preview }: DocumentEditorWorkspaceProps) {
  useLayoutEffect(() => {
    const previewPane = preview.paneRef.current;
    if (!previewPane || !preview.show || paneMode !== "split") return;
    syncPreviewSelection(previewPane, preview.activeAnchor);
  }, [
    paneMode,
    preview.activeAnchor,
    preview.paneRef,
    preview.props.documentFlow,
    preview.props.formattingConfig,
    preview.props.frontMatter,
    preview.props.questions,
    preview.props.sectionHeadings,
    preview.props.showSolutions,
    preview.show,
  ]);

  return (
    <div className="app-workspace grid min-h-0 min-w-0 bg-background" style={style}>
      {editor.show ? (
        <section
          ref={editor.paneRef}
          className={cn(
            "editor-pane min-h-0 overflow-y-auto overflow-x-hidden border-b bg-muted/35 p-4 lg:border-b-0 lg:border-r",
            paneMode === "split" && "split-pane-scroll",
          )}
        >
          <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4">
            <div className="flex w-full min-w-0 flex-col gap-4">
              <ProjectFileConflictBanner {...editor.conflictBannerProps} />
              <ActiveDocumentEditorSurface {...editor.surface} />
            </div>
          </div>
        </section>
      ) : null}

      <EditorInspectorPane {...inspectorProps} />

      {preview.show ? (
        <section
          ref={preview.paneRef}
          className={cn(
            "preview-pane min-h-0 overflow-auto bg-muted/70 p-4",
            paneMode === "split" && "preview-pane-edit-sync split-pane-scroll",
          )}
          onPointerDownCapture={preview.onPointerDownCapture}
          onClickCapture={preview.onClickCapture}
          onContextMenuCapture={preview.onContextMenuCapture}
        >
          <PaginatedTestPreview {...preview.props} />
        </section>
      ) : null}
    </div>
  );
}
