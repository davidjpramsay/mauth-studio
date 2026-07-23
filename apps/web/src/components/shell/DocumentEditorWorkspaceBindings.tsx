import type { ComponentProps } from "react";

import { createEditorPanelRenderers } from "@/components/editor/createEditorPanelRenderers";
import { DocumentEditorWorkspace } from "@/components/shell/DocumentEditorWorkspace";
import { documentWorkspaceSolutionCopyHandler, documentWorkspaceVoidAction } from "@/lib/documentWorkspaceBindings";
import { SCROLL_ANCHOR_FRONT_MATTER } from "@/lib/scrollAnchors";

type WorkspaceProps = ComponentProps<typeof DocumentEditorWorkspace>;
type EditorSurfaceProps = WorkspaceProps["editor"]["surface"];
type FrontMatterProps = EditorSurfaceProps["frontMatterProps"];
type QuestionPanelProps = EditorSurfaceProps["questionPanelBindings"];
type InspectorProps = WorkspaceProps["inspectorProps"];
type PreviewProps = WorkspaceProps["preview"];
type PanelRendererOptions = Parameters<typeof createEditorPanelRenderers>[0];
type ScopedPanelProps = PanelRendererOptions["scopedPanelProps"];
type NestedPartPanelProps = PanelRendererOptions["nestedPartPanelProps"];

interface WorkspaceLayoutBindings {
  style: WorkspaceProps["style"];
  paneMode: WorkspaceProps["paneMode"];
  showEditor: WorkspaceProps["editor"]["show"];
  showInspectorPane: InspectorProps["open"];
  showPreview: PreviewProps["show"];
  editorPaneRef: WorkspaceProps["editor"]["paneRef"];
  previewPaneRef: PreviewProps["paneRef"];
}

interface WorkspaceDocumentBindings {
  frontMatter: EditorSurfaceProps["frontMatter"];
  questions: EditorSurfaceProps["questions"];
  sectionHeadings: EditorSurfaceProps["sectionHeadings"];
  documentFlow: EditorSurfaceProps["documentFlow"];
  logos: FrontMatterProps["logos"];
  totalMarks: FrontMatterProps["totalMarks"];
}

interface WorkspaceSelectionBindings extends Pick<
  EditorSurfaceProps,
  | "editingFrontMatter"
  | "editingPageBreak"
  | "editingSectionHeading"
  | "activePageBreakQuestion"
  | "activeSectionHeading"
  | "activeQuestion"
> {
  activeTocItemId: EditorSurfaceProps["activeAnchor"];
  activePreviewAnchor: PreviewProps["activeAnchor"];
  isActiveEditorAnchor: EditorSurfaceProps["isActiveAnchor"];
  selectedEditorBlock: InspectorProps["selectedBlock"];
  selectionInspectorVisible: InspectorProps["visible"];
}

interface WorkspaceSolutionBindings {
  isNotesTemplate: QuestionPanelProps["isNotesTemplate"];
  supportsSolutionTools: QuestionPanelProps["supportsSolutionTools"];
  effectiveShowSolutions: QuestionPanelProps["effectiveShowSolutions"];
  previewShowSolutions: PreviewProps["props"]["showSolutions"];
  createSolutionCopyForAnchor: NonNullable<ScopedPanelProps["onCompleteBlockInSolutions"]>;
  createSolutionCopyForSelectedBlock: InspectorProps["onCreateSolutionCopy"];
  addQuestionSolutionSlot: QuestionPanelProps["addQuestionSolutionSlot"];
  addPartSolutionSlot: NestedPartPanelProps["addPartSolutionSlot"];
  addSubpartSolutionSlot: NestedPartPanelProps["addSubpartSolutionSlot"];
}

interface WorkspaceSolutionValidationBindings {
  solutionValidation: QuestionPanelProps["solutionValidation"];
  applySolutionValidationFix: QuestionPanelProps["onFixSolutionIssue"];
  jumpToSolutionValidationIssue: QuestionPanelProps["onJumpSolutionIssue"];
}

interface WorkspaceNavigationBindings {
  openSignalForAnchor: ScopedPanelProps["openSignalForAnchor"];
  activateEditorAnchor: NonNullable<ScopedPanelProps["onActivateAnchor"]>;
  jumpPreviewToQuestion: QuestionPanelProps["onJumpPreview"];
  handlePreviewPointerDown: PreviewProps["onPointerDownCapture"];
  handlePreviewClick: PreviewProps["onClickCapture"];
}

interface WorkspaceContextMenuBindings {
  openContextMenu: (event: Parameters<QuestionPanelProps["onHeaderContextMenu"]>[0], anchor: string, origin: "editor") => void;
  handleEditorHeaderContextMenu: ScopedPanelProps["onContextMenuAnchor"];
  handlePreviewContextMenu: PreviewProps["onContextMenuCapture"];
}

interface WorkspaceDragBindings extends Pick<
  NestedPartPanelProps,
  "draggedSubsectionActive" | "draggedEditorPageBreakActive" | "itemDropZone" | "containerDropZone" | "renderEditorPageBreakRow"
> {
  subsectionDragClasses: ScopedPanelProps["dragClasses"];
  subsectionDragHandle: ScopedPanelProps["dragHandle"];
  handleSubsectionDragOver: NestedPartPanelProps["onSubsectionDragOver"];
  handleSubsectionDragLeave: NestedPartPanelProps["onSubsectionDragLeave"];
  handleSubsectionDrop: NestedPartPanelProps["onSubsectionDrop"];
  handleEditorPageBreakDragOver: NestedPartPanelProps["onEditorPageBreakDragOver"];
  handleEditorPageBreakDragLeave: NestedPartPanelProps["onEditorPageBreakDragLeave"];
  handleEditorPageBreakDrop: NestedPartPanelProps["onEditorPageBreakDrop"];
  editorPageBreakDestinationHasBreak: EditorSurfaceProps["hasPartPageBreak"];
}

interface WorkspaceMutationBindings {
  updateQuestion: QuestionPanelProps["updateQuestion"];
  updateContentBlock: PanelRendererOptions["updateQuestionContentBlock"];
  updatePart: NestedPartPanelProps["updatePart"];
  updatePartContentBlock: PanelRendererOptions["updatePartContentBlock"];
  updateSubpart: NestedPartPanelProps["updateSubpart"];
  updateSubpartContentBlock: PanelRendererOptions["updateSubpartContentBlock"];
  updateSelectedBlock: InspectorProps["onBlockChange"];
  addQuestionBlock: QuestionPanelProps["addQuestionBlock"];
  addQuestionDiagramBlock: QuestionPanelProps["addQuestionDiagramBlock"];
  removeQuestionBlock: PanelRendererOptions["removeQuestionContentBlock"];
  addPart: QuestionPanelProps["addPart"];
  addPartPageBreak: QuestionPanelProps["addPartPageBreak"];
  removePart: NestedPartPanelProps["removePart"];
  addSubpart: NestedPartPanelProps["addSubpart"];
  addSubpartPageBreak: NestedPartPanelProps["addSubpartPageBreak"];
  removeSubpart: NestedPartPanelProps["removeSubpart"];
  addPartBlock: NestedPartPanelProps["addPartBlock"];
  addPartDiagramBlock: NestedPartPanelProps["addPartDiagramBlock"];
  removePartBlock: PanelRendererOptions["removePartContentBlock"];
  addSubpartBlock: NestedPartPanelProps["addSubpartBlock"];
  addSubpartDiagramBlock: NestedPartPanelProps["addSubpartDiagramBlock"];
  removeSubpartBlock: PanelRendererOptions["removeSubpartContentBlock"];
}

interface WorkspaceQuestionLifecycleBindings {
  removePageBreakAfterQuestion: EditorSurfaceProps["onRemovePageBreak"];
  removeQuestion: QuestionPanelProps["removeQuestion"];
}

interface WorkspaceSectionHeadingBindings {
  updateSectionHeading: EditorSurfaceProps["onUpdateSectionHeading"];
  removeSectionHeading: EditorSurfaceProps["onRemoveSectionHeading"];
}

interface WorkspaceFrontMatterActionBindings {
  updateFrontMatter: FrontMatterProps["onChange"];
  addLogo: FrontMatterProps["onAddLogo"];
  updateLogo: FrontMatterProps["onUpdateLogo"];
  removeLogo: FrontMatterProps["onRemoveLogo"];
}

interface WorkspaceConflictBindings {
  activeProjectRevisionIssue: WorkspaceProps["editor"]["conflictBannerProps"]["conflict"];
  fileOperationBusy: NonNullable<WorkspaceProps["editor"]["conflictBannerProps"]["disabled"]>;
  saveConflictRecoveryCopy: () => void | Promise<unknown>;
  reloadConflictFileFromDisk: () => void | Promise<unknown>;
}

interface WorkspaceFactoryBindings
  extends
    Pick<ScopedPanelProps, "contentBlockForKind" | "diagramBlockForType">,
    Pick<InspectorProps, "createTextBlock" | "diagramTypePatch" | "updateGraphConfig" | "withGraphDefaults"> {}

export interface DocumentEditorWorkspaceBindingsProps {
  layout: WorkspaceLayoutBindings;
  document: WorkspaceDocumentBindings;
  selection: WorkspaceSelectionBindings;
  solutions: WorkspaceSolutionBindings;
  solutionValidation: WorkspaceSolutionValidationBindings;
  navigation: WorkspaceNavigationBindings;
  contextMenu: WorkspaceContextMenuBindings;
  drag: WorkspaceDragBindings;
  mutations: WorkspaceMutationBindings;
  questionLifecycle: WorkspaceQuestionLifecycleBindings;
  sectionHeadings: WorkspaceSectionHeadingBindings;
  frontMatterActions: WorkspaceFrontMatterActionBindings;
  conflict: WorkspaceConflictBindings;
  factories: WorkspaceFactoryBindings;
  previewDocument: PreviewProps["props"];
}

export function DocumentEditorWorkspaceBindings({
  layout,
  document,
  selection,
  solutions,
  solutionValidation,
  navigation,
  contextMenu,
  drag,
  mutations,
  questionLifecycle,
  sectionHeadings,
  frontMatterActions,
  conflict,
  factories,
  previewDocument,
}: DocumentEditorWorkspaceBindingsProps) {
  const { renderQuestionContentBlock, renderPartPanel } = createEditorPanelRenderers({
    showSolutions: solutions.effectiveShowSolutions,
    scopedPanelProps: {
      isNotesTemplate: solutions.isNotesTemplate,
      showSolutions: solutions.effectiveShowSolutions,
      activeAnchor: selection.activeTocItemId,
      dragClasses: drag.subsectionDragClasses,
      dragHandle: drag.subsectionDragHandle,
      openSignalForAnchor: navigation.openSignalForAnchor,
      contentBlockForKind: factories.contentBlockForKind,
      diagramBlockForType: factories.diagramBlockForType,
      onActivateAnchor: navigation.activateEditorAnchor,
      onContextMenuAnchor: contextMenu.handleEditorHeaderContextMenu,
      onCompleteBlockInSolutions: documentWorkspaceSolutionCopyHandler(
        solutions.supportsSolutionTools,
        solutions.createSolutionCopyForAnchor,
      ),
      onDragOver: drag.handleSubsectionDragOver,
      onDragLeave: drag.handleSubsectionDragLeave,
      onDrop: drag.handleSubsectionDrop,
    },
    nestedPartPanelProps: {
      isNotesTemplate: solutions.isNotesTemplate,
      supportsSolutionTools: solutions.supportsSolutionTools,
      effectiveShowSolutions: solutions.effectiveShowSolutions,
      solutionValidation: solutionValidation.solutionValidation,
      onFixSolutionIssue: solutionValidation.applySolutionValidationFix,
      onJumpSolutionIssue: solutionValidation.jumpToSolutionValidationIssue,
      draggedSubsectionActive: drag.draggedSubsectionActive,
      draggedEditorPageBreakActive: drag.draggedEditorPageBreakActive,
      openSignalForAnchor: navigation.openSignalForAnchor,
      isActiveEditorAnchor: selection.isActiveEditorAnchor,
      onHeaderContextMenu: (event, anchor) => contextMenu.openContextMenu(event, anchor, "editor"),
      dragClasses: drag.subsectionDragClasses,
      dragHandle: drag.subsectionDragHandle,
      itemDropZone: drag.itemDropZone,
      containerDropZone: drag.containerDropZone,
      renderEditorPageBreakRow: drag.renderEditorPageBreakRow,
      onEditorPageBreakDragOver: drag.handleEditorPageBreakDragOver,
      onEditorPageBreakDragLeave: drag.handleEditorPageBreakDragLeave,
      onEditorPageBreakDrop: drag.handleEditorPageBreakDrop,
      onSubsectionDragOver: drag.handleSubsectionDragOver,
      onSubsectionDragLeave: drag.handleSubsectionDragLeave,
      onSubsectionDrop: drag.handleSubsectionDrop,
      updatePart: mutations.updatePart,
      updateSubpart: mutations.updateSubpart,
      removePart: mutations.removePart,
      removeSubpart: mutations.removeSubpart,
      addPartBlock: mutations.addPartBlock,
      addPartDiagramBlock: mutations.addPartDiagramBlock,
      addPartSolutionSlot: solutions.addPartSolutionSlot,
      addSubpart: mutations.addSubpart,
      addSubpartPageBreak: mutations.addSubpartPageBreak,
      addSubpartBlock: mutations.addSubpartBlock,
      addSubpartDiagramBlock: mutations.addSubpartDiagramBlock,
      addSubpartSolutionSlot: solutions.addSubpartSolutionSlot,
    },
    updateQuestionContentBlock: mutations.updateContentBlock,
    updatePartContentBlock: mutations.updatePartContentBlock,
    updateSubpartContentBlock: mutations.updateSubpartContentBlock,
    removeQuestionContentBlock: mutations.removeQuestionBlock,
    removePartContentBlock: mutations.removePartBlock,
    removeSubpartContentBlock: mutations.removeSubpartBlock,
  });

  return (
    <DocumentEditorWorkspace
      style={layout.style}
      paneMode={layout.paneMode}
      editor={{
        show: layout.showEditor,
        paneRef: layout.editorPaneRef,
        conflictBannerProps: {
          conflict: conflict.activeProjectRevisionIssue,
          disabled: conflict.fileOperationBusy,
          onSaveRecoveryCopy: documentWorkspaceVoidAction(conflict.saveConflictRecoveryCopy),
          onReloadFromDisk: documentWorkspaceVoidAction(conflict.reloadConflictFileFromDisk),
        },
        surface: {
          editingFrontMatter: selection.editingFrontMatter,
          editingPageBreak: selection.editingPageBreak,
          editingSectionHeading: selection.editingSectionHeading,
          activePageBreakQuestion: selection.activePageBreakQuestion,
          activeSectionHeading: selection.activeSectionHeading,
          activeQuestion: selection.activeQuestion,
          questions: document.questions,
          sectionHeadings: document.sectionHeadings,
          documentFlow: document.documentFlow,
          frontMatter: document.frontMatter,
          activeAnchor: selection.activeTocItemId,
          isActiveAnchor: selection.isActiveEditorAnchor,
          frontMatterProps: {
            frontMatter: document.frontMatter,
            logos: document.logos,
            openSignal: navigation.openSignalForAnchor(SCROLL_ANCHOR_FRONT_MATTER),
            questionCount: document.questions.length,
            totalMarks: document.totalMarks,
            onChange: frontMatterActions.updateFrontMatter,
            onAddLogo: frontMatterActions.addLogo,
            onUpdateLogo: frontMatterActions.updateLogo,
            onRemoveLogo: frontMatterActions.removeLogo,
          },
          questionPanelBindings: {
            isNotesTemplate: solutions.isNotesTemplate,
            supportsSolutionTools: solutions.supportsSolutionTools,
            effectiveShowSolutions: solutions.effectiveShowSolutions,
            solutionValidation: solutionValidation.solutionValidation,
            draggedSubsectionActive: drag.draggedSubsectionActive,
            draggedEditorPageBreakActive: drag.draggedEditorPageBreakActive,
            itemDropZone: drag.itemDropZone,
            containerDropZone: drag.containerDropZone,
            renderQuestionContentBlock,
            renderPartPanel,
            renderEditorPageBreakRow: drag.renderEditorPageBreakRow,
            onHeaderContextMenu: (event, anchor) => contextMenu.openContextMenu(event, anchor, "editor"),
            onJumpPreview: navigation.jumpPreviewToQuestion,
            updateQuestion: mutations.updateQuestion,
            removeQuestion: questionLifecycle.removeQuestion,
            addQuestionBlock: mutations.addQuestionBlock,
            addQuestionDiagramBlock: mutations.addQuestionDiagramBlock,
            addQuestionSolutionSlot: solutions.addQuestionSolutionSlot,
            addPart: mutations.addPart,
            addPartPageBreak: mutations.addPartPageBreak,
            onFixSolutionIssue: solutionValidation.applySolutionValidationFix,
            onJumpSolutionIssue: solutionValidation.jumpToSolutionValidationIssue,
          },
          hasPartPageBreak: drag.editorPageBreakDestinationHasBreak,
          onRemovePageBreak: questionLifecycle.removePageBreakAfterQuestion,
          onUpdateSectionHeading: sectionHeadings.updateSectionHeading,
          onRemoveSectionHeading: sectionHeadings.removeSectionHeading,
        },
      }}
      inspectorProps={{
        open: layout.showInspectorPane,
        visible: selection.selectionInspectorVisible,
        selectedBlock: selection.selectedEditorBlock,
        showSolutions: solutions.effectiveShowSolutions,
        activeAnchor: selection.activeTocItemId,
        onActivateAnchor: navigation.activateEditorAnchor,
        onBlockChange: mutations.updateSelectedBlock,
        onCreateSolutionCopy: solutions.createSolutionCopyForSelectedBlock,
        createTextBlock: factories.createTextBlock,
        diagramTypePatch: factories.diagramTypePatch,
        updateGraphConfig: factories.updateGraphConfig,
        withGraphDefaults: factories.withGraphDefaults,
      }}
      preview={{
        show: layout.showPreview,
        paneRef: layout.previewPaneRef,
        activeAnchor: selection.activePreviewAnchor,
        onPointerDownCapture: navigation.handlePreviewPointerDown,
        onClickCapture: navigation.handlePreviewClick,
        onContextMenuCapture: contextMenu.handlePreviewContextMenu,
        props: { ...previewDocument, showSolutions: solutions.previewShowSolutions },
      }}
    />
  );
}
