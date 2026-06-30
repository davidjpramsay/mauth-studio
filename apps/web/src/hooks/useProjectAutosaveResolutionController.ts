import type { ProjectSummary } from "@mauth-studio/shared";

import type { ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { getDefaultProject, getProjectFile, listProjectFileVersions } from "@/lib/api";

interface ProjectAutosaveSnapshotLike {
  activeProjectFilePath?: string;
  activeProjectFileRevision?: number;
}

interface UseProjectAutosaveResolutionControllerOptions<TAutosave extends ProjectAutosaveSnapshotLike, TSavedDocument> {
  activeProject: ProjectSummary | null;
  parseSavedDocument: (content: string | null) => TSavedDocument | null;
  savedDocumentFingerprint: (document: TSavedDocument) => string;
  autosaveSnapshotFingerprint: (snapshot: TAutosave) => string;
  savedDocumentToAutosaveSnapshot: (document: TSavedDocument, filePath: string, revision: number | null) => TAutosave;
}

export interface ProjectAutosaveResolution<TAutosave> {
  snapshot: TAutosave;
  project: ProjectSummary | null;
  cleanFingerprint: string | null;
  conflict: ProjectSaveConflict | null;
}

export function useProjectAutosaveResolutionController<TAutosave extends ProjectAutosaveSnapshotLike, TSavedDocument>({
  activeProject,
  parseSavedDocument,
  savedDocumentFingerprint,
  autosaveSnapshotFingerprint,
  savedDocumentToAutosaveSnapshot,
}: UseProjectAutosaveResolutionControllerOptions<TAutosave, TSavedDocument>) {
  async function currentProject() {
    return activeProject ?? (await getDefaultProject());
  }

  async function projectFileRevisionFingerprint(projectId: string, filePath: string, revision: number) {
    try {
      const versionsResponse = await listProjectFileVersions(projectId, filePath);
      const matchingVersion = versionsResponse.versions.find((version) => version.revision === revision);
      const savedDocument = matchingVersion ? parseSavedDocument(matchingVersion.content) : null;
      return savedDocument ? savedDocumentFingerprint(savedDocument) : null;
    } catch {
      return null;
    }
  }

  async function resolveAutosaveAgainstProjectFile(snapshot: TAutosave): Promise<ProjectAutosaveResolution<TAutosave>> {
    const filePath = snapshot.activeProjectFilePath;
    const localRevision = snapshot.activeProjectFileRevision;
    if (!filePath || typeof localRevision !== "number") {
      return { snapshot, project: null, cleanFingerprint: null, conflict: null };
    }

    const project = await currentProject();
    const document = await getProjectFile(project.id, filePath);
    const savedDocument = parseSavedDocument(document.content);
    if (!savedDocument) return { snapshot, project, cleanFingerprint: null, conflict: null };

    const currentFingerprint = savedDocumentFingerprint(savedDocument);
    if (document.revision <= localRevision) {
      return { snapshot, project, cleanFingerprint: currentFingerprint, conflict: null };
    }

    const snapshotFingerprint = autosaveSnapshotFingerprint(snapshot);
    const baseFingerprint = await projectFileRevisionFingerprint(project.id, filePath, localRevision);
    if (baseFingerprint && snapshotFingerprint === baseFingerprint) {
      return {
        snapshot: savedDocumentToAutosaveSnapshot(savedDocument, filePath, document.revision),
        project,
        cleanFingerprint: currentFingerprint,
        conflict: null,
      };
    }

    return {
      snapshot,
      project,
      cleanFingerprint: baseFingerprint,
      conflict: {
        filePath,
        message: "File changed on disk. Reload it before saving, or use Save as to keep this draft as a copy.",
        localRevision,
        currentRevision: document.revision,
      },
    };
  }

  return { resolveAutosaveAgainstProjectFile };
}
