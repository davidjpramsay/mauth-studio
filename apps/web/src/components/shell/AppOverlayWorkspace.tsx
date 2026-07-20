import type { Dispatch, ReactNode, SetStateAction } from "react";

import { AppOverlays, type AppOverlaysProps } from "@/components/shell/AppOverlays";
import { appOverlayPresentationPlan, applyActionProposalTextChange } from "@/lib/appOverlayPresentation";

type FileManagementProps = AppOverlaysProps["fileManagement"];
type SystemStatusProps = AppOverlaysProps["systemStatusPanel"];
type PrintPreviewProps = NonNullable<AppOverlaysProps["printPreview"]>;

interface FileOverlayBindings {
  fileManagerOpen: boolean;
  setFileManagerOpen: Dispatch<SetStateAction<boolean>>;
  activeProject: FileManagementProps["activeProject"];
  projectFiles: FileManagementProps["projectFiles"];
  projectFilesStatus: FileManagementProps["projectFilesStatus"];
  projectFilesMessage: FileManagementProps["projectFilesMessage"];
  activeProjectFilePath: FileManagementProps["activeProjectFilePath"];
  buildVersionPreview: FileManagementProps["buildVersionPreview"];
  startNewTest: FileManagementProps["onNewTest"];
  openProjectFile: FileManagementProps["onOpenProjectFile"];
  createProjectFolder: FileManagementProps["onCreateProjectFolder"];
  exportCurrentProjectBackup: FileManagementProps["onExportProjectBackup"];
  importProjectBackupFile: FileManagementProps["onImportProjectBackup"];
  chooseDocumentsFolder: FileManagementProps["onChooseDocumentsFolder"];
  openDocumentsFolder: FileManagementProps["onOpenDocumentsFolder"];
  resetDocumentsFolder: FileManagementProps["onResetDocumentsFolder"];
  refreshProjectFiles: FileManagementProps["onRefreshProjectFiles"];
  renameProjectFile: FileManagementProps["onRenameProjectFile"];
  duplicateProjectFiles: FileManagementProps["onDuplicateProjectFiles"];
  moveProjectFiles: FileManagementProps["onMoveProjectFiles"];
  removeProjectFiles: FileManagementProps["onDeleteProjectFiles"];
  loadProjectFileVersions: FileManagementProps["onListProjectFileVersions"];
  restoreProjectFileFromVersion: FileManagementProps["onRestoreProjectFileVersion"];
}

interface NewDocumentOverlayBindings {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  create: AppOverlaysProps["newTestDialog"]["onCreate"];
}

interface SystemStatusOverlayBindings extends Omit<SystemStatusProps, "open" | "onRefresh" | "onClose"> {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  refresh: SystemStatusProps["onRefresh"];
}

interface SolutionValidationOverlayBindings {
  solutionValidation: AppOverlaysProps["solutionValidationPanel"]["result"];
  solutionValidationOpen: boolean;
  setSolutionValidationOpen: Dispatch<SetStateAction<boolean>>;
  jumpToSolutionValidationIssue: AppOverlaysProps["solutionValidationPanel"]["onJump"];
  applySolutionValidationFix: AppOverlaysProps["solutionValidationPanel"]["onFix"];
}

interface ActionProposalOverlayBindings {
  actionProposalOpen: boolean;
  setActionProposalOpen: Dispatch<SetStateAction<boolean>>;
  actionProposalText: AppOverlaysProps["actionProposalPanel"]["value"];
  setActionProposalText: Dispatch<SetStateAction<string>>;
  actionProposalMessage: AppOverlaysProps["actionProposalPanel"]["message"];
  actionProposalResult: AppOverlaysProps["actionProposalPanel"]["result"];
  previewActionProposal: AppOverlaysProps["actionProposalPanel"]["onPreview"];
  applyActionProposal: AppOverlaysProps["actionProposalPanel"]["onApply"];
  clearActionProposal: AppOverlaysProps["actionProposalPanel"]["onClear"];
  clearActionProposalFeedback: () => void;
}

interface ContextMenuOverlayBindings {
  contextMenu: AppOverlaysProps["contextMenu"]["menu"];
  closeContextMenu: AppOverlaysProps["contextMenu"]["onClose"];
}

interface PrintOverlayBindings {
  mounted: boolean;
  editorDocumentOpen: boolean;
  preview: PrintPreviewProps;
}

export interface AppOverlayWorkspaceProps {
  files: FileOverlayBindings;
  dialogNode: ReactNode;
  newDocument: NewDocumentOverlayBindings;
  systemStatus: SystemStatusOverlayBindings;
  solutionValidation: SolutionValidationOverlayBindings;
  actionProposal: ActionProposalOverlayBindings;
  contextMenu: ContextMenuOverlayBindings;
  print: PrintOverlayBindings;
}

export function AppOverlayWorkspace({
  files,
  dialogNode,
  newDocument,
  systemStatus,
  solutionValidation,
  actionProposal,
  contextMenu,
  print,
}: AppOverlayWorkspaceProps) {
  const presentation = appOverlayPresentationPlan({
    solutionValidationOpen: solutionValidation.solutionValidationOpen,
    actionProposalOpen: actionProposal.actionProposalOpen,
    printPreviewMounted: print.mounted,
    editorDocumentOpen: print.editorDocumentOpen,
  });

  return (
    <AppOverlays
      fileManagement={{
        open: files.fileManagerOpen,
        activeProject: files.activeProject,
        projectFiles: files.projectFiles,
        projectFilesStatus: files.projectFilesStatus,
        projectFilesMessage: files.projectFilesMessage,
        activeProjectFilePath: files.activeProjectFilePath,
        buildVersionPreview: files.buildVersionPreview,
        onClose: () => files.setFileManagerOpen(false),
        onNewTest: files.startNewTest,
        onOpenProjectFile: (filePath) => void files.openProjectFile(filePath),
        onCreateProjectFolder: (folderPath) => void files.createProjectFolder(folderPath),
        onExportProjectBackup: () => void files.exportCurrentProjectBackup(),
        onImportProjectBackup: (file) => void files.importProjectBackupFile(file),
        onChooseDocumentsFolder: () => void files.chooseDocumentsFolder(),
        onOpenDocumentsFolder: (folderPath) => void files.openDocumentsFolder(folderPath),
        onResetDocumentsFolder: () => void files.resetDocumentsFolder(),
        onRefreshProjectFiles: () => void files.refreshProjectFiles(),
        onRenameProjectFile: (filePath) => void files.renameProjectFile(filePath),
        onDuplicateProjectFiles: (filePaths) => void files.duplicateProjectFiles(filePaths),
        onMoveProjectFiles: (filePaths, targetFolderPath) => void files.moveProjectFiles(filePaths, targetFolderPath),
        onDeleteProjectFiles: (filePaths) => void files.removeProjectFiles(filePaths),
        onListProjectFileVersions: files.loadProjectFileVersions,
        onRestoreProjectFileVersion: files.restoreProjectFileFromVersion,
      }}
      dialogNode={dialogNode}
      newTestDialog={{
        open: newDocument.open,
        onClose: () => newDocument.setOpen(false),
        onCreate: newDocument.create,
      }}
      systemStatusPanel={{
        ...systemStatus,
        onRefresh: () => void systemStatus.refresh(),
        onClose: () => systemStatus.setOpen(false),
      }}
      solutionValidationPanel={{
        open: presentation.showSolutionValidation,
        result: solutionValidation.solutionValidation,
        onClose: () => solutionValidation.setSolutionValidationOpen(false),
        onJump: solutionValidation.jumpToSolutionValidationIssue,
        onFix: solutionValidation.applySolutionValidationFix,
      }}
      actionProposalPanel={{
        open: presentation.showActionProposal,
        value: actionProposal.actionProposalText,
        message: actionProposal.actionProposalMessage,
        result: actionProposal.actionProposalResult,
        onChange: (nextValue) =>
          applyActionProposalTextChange(nextValue, actionProposal.setActionProposalText, actionProposal.clearActionProposalFeedback),
        onPreview: actionProposal.previewActionProposal,
        onApply: actionProposal.applyActionProposal,
        onClose: () => actionProposal.setActionProposalOpen(false),
        onClear: actionProposal.clearActionProposal,
      }}
      contextMenu={{ menu: contextMenu.contextMenu, onClose: contextMenu.closeContextMenu }}
      printPreview={presentation.showPrintPreview ? print.preview : null}
    />
  );
}
