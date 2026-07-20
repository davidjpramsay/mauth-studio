import type { AppHeaderProps } from "@/components/shell/AppHeader";

export interface AppHeaderBindingSources {
  pane: {
    paneMode: AppHeaderProps["paneMode"];
    showInspectorPane: AppHeaderProps["showInspectorPane"];
    toggleManualPane: AppHeaderProps["onToggleManualPane"];
    toggleInspectorPane: AppHeaderProps["onToggleInspectorPane"];
  };
  document: {
    editorDocumentOpen: AppHeaderProps["editorDocumentOpen"];
    currentProjectFileName: AppHeaderProps["currentProjectFileName"];
    headerFileStatusMessage: AppHeaderProps["headerFileStatusMessage"];
    headerFileStatusTitle: AppHeaderProps["headerFileStatusTitle"];
    headerStorageStatus: AppHeaderProps["headerStorageStatus"];
    startNewTest: AppHeaderProps["onNewTest"];
    saveCurrentTest: AppHeaderProps["onSaveTest"];
    openFileManager: AppHeaderProps["onOpenFiles"];
    closeCurrentDocument: () => void | Promise<unknown>;
  };
  systemStatus: {
    message: AppHeaderProps["systemStatusMessage"];
    state: AppHeaderProps["systemStatusState"];
    openPanel: () => void;
  };
  theme: {
    darkMode: AppHeaderProps["darkMode"];
    toggleTheme: AppHeaderProps["onToggleTheme"];
  };
  solutions: {
    supportsSolutionTools: AppHeaderProps["supportsSolutionTools"];
    showSolutions: AppHeaderProps["showSolutions"];
    effectiveShowSolutions: AppHeaderProps["effectiveShowSolutions"];
    printModeLabel: AppHeaderProps["printModeLabel"];
    printModeTitle: AppHeaderProps["printModeTitle"];
    solutionValidation: {
      issues: unknown[];
      errorCount: number;
    };
    setShowSolutions: AppHeaderProps["onShowSolutionsChange"];
    setSolutionValidationOpen: (open: boolean) => void;
  };
  printDocument: AppHeaderProps["onPrint"];
  history: {
    canUndo: AppHeaderProps["canUndo"];
    canRedo: AppHeaderProps["canRedo"];
    undoEdit: AppHeaderProps["onUndo"];
    redoEdit: AppHeaderProps["onRedo"];
  };
}

export function appHeaderBindings({
  pane,
  document,
  systemStatus,
  theme,
  solutions,
  printDocument,
  history,
}: AppHeaderBindingSources): AppHeaderProps {
  return {
    paneMode: pane.paneMode,
    showInspectorPane: pane.showInspectorPane,
    editorDocumentOpen: document.editorDocumentOpen,
    currentProjectFileName: document.currentProjectFileName,
    headerFileStatusMessage: document.headerFileStatusMessage,
    headerFileStatusTitle: document.headerFileStatusTitle,
    headerStorageStatus: document.headerStorageStatus,
    systemStatusMessage: systemStatus.message,
    systemStatusState: systemStatus.state,
    darkMode: theme.darkMode,
    supportsSolutionTools: solutions.supportsSolutionTools,
    showSolutions: solutions.showSolutions,
    effectiveShowSolutions: solutions.effectiveShowSolutions,
    printModeLabel: solutions.printModeLabel,
    printModeTitle: solutions.printModeTitle,
    solutionIssueCount: solutions.solutionValidation.issues.length,
    solutionErrorCount: solutions.solutionValidation.errorCount,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    onToggleManualPane: pane.toggleManualPane,
    onToggleInspectorPane: pane.toggleInspectorPane,
    onNewTest: document.startNewTest,
    onSaveTest: document.saveCurrentTest,
    onOpenFiles: document.openFileManager,
    onOpenSystemStatus: systemStatus.openPanel,
    onCloseFile: () => void document.closeCurrentDocument(),
    onToggleTheme: theme.toggleTheme,
    onShowSolutionsChange: solutions.setShowSolutions,
    onOpenSolutionValidation: () => solutions.setSolutionValidationOpen(true),
    onPrint: printDocument,
    onUndo: history.undoEdit,
    onRedo: history.redoEdit,
  };
}
