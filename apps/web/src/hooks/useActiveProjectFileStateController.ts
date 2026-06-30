import { useLayoutEffect, useRef } from "react";

import type { ProjectSaveConflict } from "@/hooks/useProjectFilesController";

interface UseActiveProjectFileStateControllerOptions {
  activeProjectFilePath: string | null;
  activeProjectFileRevision: number | null;
  setActiveProjectFilePath: (filePath: string | null) => void;
  setActiveProjectFileRevision: (revision: number | null) => void;
  setProjectSaveConflict: (conflict: ProjectSaveConflict | null) => void;
  updateLastProjectSaveFingerprint: (fingerprint: string | null) => void;
}

export function useActiveProjectFileStateController({
  activeProjectFilePath,
  activeProjectFileRevision,
  setActiveProjectFilePath,
  setActiveProjectFileRevision,
  setProjectSaveConflict,
  updateLastProjectSaveFingerprint,
}: UseActiveProjectFileStateControllerOptions) {
  const activeProjectFilePathRef = useRef(activeProjectFilePath);
  const activeProjectFileRevisionRef = useRef(activeProjectFileRevision);

  function setActiveProjectFileState(filePath: string | null, revision: number | null) {
    activeProjectFilePathRef.current = filePath;
    activeProjectFileRevisionRef.current = revision;
    setActiveProjectFilePath(filePath);
    setActiveProjectFileRevision(revision);
  }

  function clearActiveProjectFileState() {
    setActiveProjectFileState(null, null);
    setProjectSaveConflict(null);
    updateLastProjectSaveFingerprint(null);
  }

  useLayoutEffect(() => {
    activeProjectFilePathRef.current = activeProjectFilePath;
    activeProjectFileRevisionRef.current = activeProjectFileRevision;
  }, [activeProjectFilePath, activeProjectFileRevision]);

  return {
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    setActiveProjectFileState,
    clearActiveProjectFileState,
  };
}
