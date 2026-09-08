import type { ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";
import type { EditorDocumentTab } from "./editorDocumentTabs.ts";
import { testFileDisplayName, testPathBasename } from "./projectFiles.ts";

export interface DocumentTabSaveResult {
  documentId: string | null;
  sourcePath: string | null;
  sourceRevision: number | null;
  project: ProjectSummary;
  filePath: string;
  revision: number;
  fingerprint: string | null;
}

export function documentTabsAfterSave(
  tabs: EditorDocumentTab[],
  result: DocumentTabSaveResult,
  fingerprint: (tab: EditorDocumentTab) => string,
) {
  return tabs.map((tab) => {
    if (tab.id !== result.documentId || tab.filePath !== result.sourcePath || tab.revision !== result.sourceRevision) return tab;
    const dirty = fingerprint(tab) !== result.fingerprint;
    return {
      ...tab,
      project: result.project,
      filePath: result.filePath,
      revision: result.revision,
      title: testFileDisplayName(testPathBasename(result.filePath)),
      lastSaveFingerprint: result.fingerprint,
      cleanUnsavedFingerprint: null,
      conflict: null,
      dirty,
      saveStatus: dirty ? ("dirty" as const) : ("saved" as const),
      statusMessage: dirty ? "Unsaved changes" : "Saved",
      statusTitle: dirty ? "Newer edits have not been saved." : "Saved to file.",
    };
  });
}

export interface DocumentTabFileOperation {
  project: ProjectSummary;
  sourcePath: string;
  targetPath?: string;
  files: ProjectFileSummary[];
}

export function documentTabsAfterFileOperation(tabs: EditorDocumentTab[], operation: DocumentTabFileOperation) {
  const { project, sourcePath, targetPath, files } = operation;
  return tabs.map((tab) => {
    if (
      (tab.project?.documentsPath ?? tab.project?.id) !== (project.documentsPath ?? project.id) ||
      !tab.filePath ||
      (tab.filePath !== sourcePath && !tab.filePath.startsWith(sourcePath + "/"))
    )
      return tab;
    if (!targetPath)
      return {
        ...tab,
        filePath: null,
        revision: null,
        lastSaveFingerprint: null,
        cleanUnsavedFingerprint: null,
        conflict: null,
        dirty: true,
        saveStatus: "draft" as const,
        statusMessage: "File deleted; open draft retained",
        statusTitle: "Save as a new file to keep this document.",
      };
    const filePath = targetPath + tab.filePath.slice(sourcePath.length);
    const summary = files.find((file) => file.path === filePath);
    // Only advance a tab that had the moved revision. A stale tab must still
    // conflict instead of gaining permission to overwrite a newer disk file.
    const revision = summary && tab.revision === summary.revision - 1 ? summary.revision : tab.revision;
    return {
      ...tab,
      filePath,
      revision,
      title: testFileDisplayName(testPathBasename(filePath)),
      conflict: tab.conflict ? { ...tab.conflict, filePath } : null,
    };
  });
}
