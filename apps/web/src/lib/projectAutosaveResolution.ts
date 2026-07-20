import type { ProjectSummary } from "@mauth-studio/shared";

import { fileChangedProjectSaveConflict, type ProjectSaveConflict } from "./projectSaveConflicts.ts";

export interface ProjectAutosaveSnapshotLike {
  activeProjectFilePath?: string;
  activeProjectFileRevision?: number;
}

interface ProjectFileDocumentLike {
  content: string | null;
  revision: number;
}

interface ProjectFileVersionLike {
  content: string | null;
  revision: number;
}

export interface ProjectAutosaveResolution<TAutosave> {
  snapshot: TAutosave;
  project: ProjectSummary | null;
  cleanFingerprint: string | null;
  conflict: ProjectSaveConflict | null;
}

interface ProjectAutosaveResolutionRuntime<TAutosave, TSavedDocument> {
  activeProject: ProjectSummary | null;
  getDefaultProject: () => Promise<ProjectSummary>;
  getProjectFile: (projectId: string, filePath: string) => Promise<ProjectFileDocumentLike>;
  listProjectFileVersions: (projectId: string, filePath: string) => Promise<{ versions: ProjectFileVersionLike[] }>;
  parseSavedDocument: (content: string | null) => TSavedDocument | null;
  savedDocumentFingerprint: (document: TSavedDocument) => string;
  autosaveSnapshotFingerprint: (snapshot: TAutosave) => string;
  savedDocumentToAutosaveSnapshot: (document: TSavedDocument, filePath: string, revision: number | null) => TAutosave;
}

async function projectFileRevisionFingerprint<TSavedDocument>(
  projectId: string,
  filePath: string,
  revision: number,
  runtime: Pick<
    ProjectAutosaveResolutionRuntime<unknown, TSavedDocument>,
    "listProjectFileVersions" | "parseSavedDocument" | "savedDocumentFingerprint"
  >,
) {
  try {
    const versionsResponse = await runtime.listProjectFileVersions(projectId, filePath);
    const matchingVersion = versionsResponse.versions.find((version) => version.revision === revision);
    const savedDocument = matchingVersion ? runtime.parseSavedDocument(matchingVersion.content) : null;
    return savedDocument ? runtime.savedDocumentFingerprint(savedDocument) : null;
  } catch {
    return null;
  }
}

export async function resolveProjectAutosaveAgainstFile<TAutosave extends ProjectAutosaveSnapshotLike, TSavedDocument>(
  snapshot: TAutosave,
  runtime: ProjectAutosaveResolutionRuntime<TAutosave, TSavedDocument>,
): Promise<ProjectAutosaveResolution<TAutosave>> {
  const filePath = snapshot.activeProjectFilePath;
  const localRevision = snapshot.activeProjectFileRevision;
  if (!filePath || typeof localRevision !== "number") {
    return { snapshot, project: null, cleanFingerprint: null, conflict: null };
  }

  const project = runtime.activeProject ?? (await runtime.getDefaultProject());
  const document = await runtime.getProjectFile(project.id, filePath);
  const savedDocument = runtime.parseSavedDocument(document.content);
  if (!savedDocument) {
    return {
      snapshot,
      project,
      cleanFingerprint: null,
      conflict: document.revision > localRevision ? fileChangedProjectSaveConflict(filePath, localRevision, document.revision) : null,
    };
  }

  const currentFingerprint = runtime.savedDocumentFingerprint(savedDocument);
  if (document.revision <= localRevision) {
    return { snapshot, project, cleanFingerprint: currentFingerprint, conflict: null };
  }

  const snapshotFingerprint = runtime.autosaveSnapshotFingerprint(snapshot);
  const baseFingerprint = await projectFileRevisionFingerprint(project.id, filePath, localRevision, runtime);
  if (baseFingerprint && snapshotFingerprint === baseFingerprint) {
    return {
      snapshot: runtime.savedDocumentToAutosaveSnapshot(savedDocument, filePath, document.revision),
      project,
      cleanFingerprint: currentFingerprint,
      conflict: null,
    };
  }

  return {
    snapshot,
    project,
    cleanFingerprint: baseFingerprint,
    conflict: fileChangedProjectSaveConflict(filePath, localRevision, document.revision),
  };
}
