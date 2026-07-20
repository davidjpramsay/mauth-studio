import type { ProjectSummary } from "@mauth-studio/shared";

import { getDefaultProject, getProjectFile, listProjectFileVersions } from "@/lib/api";
import {
  resolveProjectAutosaveAgainstFile,
  type ProjectAutosaveResolution,
  type ProjectAutosaveSnapshotLike,
} from "@/lib/projectAutosaveResolution";

interface UseProjectAutosaveResolutionControllerOptions<TAutosave extends ProjectAutosaveSnapshotLike, TSavedDocument> {
  activeProject: ProjectSummary | null;
  parseSavedDocument: (content: string | null) => TSavedDocument | null;
  savedDocumentFingerprint: (document: TSavedDocument) => string;
  autosaveSnapshotFingerprint: (snapshot: TAutosave) => string;
  savedDocumentToAutosaveSnapshot: (document: TSavedDocument, filePath: string, revision: number | null) => TAutosave;
}

export type { ProjectAutosaveResolution } from "@/lib/projectAutosaveResolution";

export function useProjectAutosaveResolutionController<TAutosave extends ProjectAutosaveSnapshotLike, TSavedDocument>({
  activeProject,
  parseSavedDocument,
  savedDocumentFingerprint,
  autosaveSnapshotFingerprint,
  savedDocumentToAutosaveSnapshot,
}: UseProjectAutosaveResolutionControllerOptions<TAutosave, TSavedDocument>) {
  async function resolveAutosaveAgainstProjectFile(snapshot: TAutosave): Promise<ProjectAutosaveResolution<TAutosave>> {
    return resolveProjectAutosaveAgainstFile(snapshot, {
      activeProject,
      getDefaultProject,
      getProjectFile,
      listProjectFileVersions,
      parseSavedDocument,
      savedDocumentFingerprint,
      autosaveSnapshotFingerprint,
      savedDocumentToAutosaveSnapshot,
    });
  }

  return { resolveAutosaveAgainstProjectFile };
}
