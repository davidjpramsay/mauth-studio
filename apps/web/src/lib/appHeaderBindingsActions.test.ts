import assert from "node:assert/strict";
import test from "node:test";

import { appHeaderBindings, type AppHeaderBindingSources } from "./appHeaderBindings.ts";

function bindingSources(events: string[]): AppHeaderBindingSources {
  return {
    pane: {
      paneMode: "split",
      showInspectorPane: true,
      toggleManualPane: () => events.push("manual"),
      toggleInspectorPane: () => events.push("inspector"),
    },
    document: {
      editorDocumentOpen: true,
      currentProjectFileName: "Current exam",
      headerFileStatusMessage: "Saved",
      headerFileStatusTitle: "Saved at revision 4",
      headerStorageStatus: "saved",
      startNewTest: () => events.push("new"),
      saveCurrentTest: () => events.push("save"),
      openFileManager: () => events.push("files"),
      closeCurrentDocument: async () => events.push("close"),
    },
    systemStatus: {
      message: "Mauth is ready",
      state: "ready",
      openPanel: () => events.push("status"),
    },
    theme: {
      darkMode: true,
      toggleTheme: () => events.push("theme"),
    },
    solutions: {
      supportsSolutionTools: true,
      showSolutions: false,
      effectiveShowSolutions: false,
      printModeLabel: "Student",
      printModeTitle: "Print the student copy",
      solutionValidation: { issues: [{ id: "one" }, { id: "two" }], errorCount: 1 },
      setShowSolutions: (show) => events.push(`solutions:${show}`),
      setSolutionValidationOpen: (open) => events.push(`validation:${open}`),
    },
    printDocument: () => events.push("print"),
    history: {
      canUndo: true,
      canRedo: false,
      undoEdit: () => events.push("undo"),
      redoEdit: () => events.push("redo"),
    },
  };
}

test("header bindings preserve controller state and solution counts", () => {
  const props = appHeaderBindings(bindingSources([]));

  assert.equal(props.paneMode, "split");
  assert.equal(props.currentProjectFileName, "Current exam");
  assert.equal(props.headerStorageStatus, "saved");
  assert.equal(props.systemStatusState, "ready");
  assert.equal(props.printModeLabel, "Student");
  assert.equal(props.solutionIssueCount, 2);
  assert.equal(props.solutionErrorCount, 1);
  assert.equal(props.canUndo, true);
  assert.equal(props.canRedo, false);
});

test("header bindings keep every command on its owning controller path", () => {
  const events: string[] = [];
  const props = appHeaderBindings(bindingSources(events));

  props.onToggleManualPane();
  props.onToggleInspectorPane();
  props.onNewTest();
  props.onSaveTest();
  props.onOpenFiles();
  props.onOpenSystemStatus();
  props.onCloseFile();
  props.onToggleTheme();
  props.onShowSolutionsChange(true);
  props.onOpenSolutionValidation();
  props.onPrint();
  props.onUndo();
  props.onRedo();

  assert.deepEqual(events, [
    "manual",
    "inspector",
    "new",
    "save",
    "files",
    "status",
    "close",
    "theme",
    "solutions:true",
    "validation:true",
    "print",
    "undo",
    "redo",
  ]);
});
