import { useCallback } from "react";
import type { ProjectFileDocument, ProjectFileSaveRequest, ProjectFileSummary, ProjectSummary } from "@mauth-studio/shared";

import {
  deleteProjectFile,
  getProjectFile,
  listProjectFiles,
  listProjectFileVersions,
  restoreProjectFileVersion,
  saveProjectFile,
} from "@/lib/api";
import type { MauthAssistantAdapterHost, MauthAssistantToolCommitContext } from "@/lib/mauthAssistantAdapter";
import type { MauthDocumentActionOptions, MauthDocumentLike, MauthQuestionLike } from "@/lib/mauthActions";

type RefValue<T> = {
  current: T;
};

interface UseMauthAssistantHostOptions<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>> {
  getDocument: () => MauthDocumentLike<Q, F, C>;
  commitDocument: (document: MauthDocumentLike<Q, F, C>, context: MauthAssistantToolCommitContext) => void;
  documentOptions: () => MauthDocumentActionOptions<Q, F, C>;
  ensureProject: () => ProjectSummary | Promise<ProjectSummary>;
  activeProjectFilePathRef: RefValue<string | null>;
  activeProjectFileRevisionRef: RefValue<number | null>;
  setActiveProjectFilePath: (filePath: string | null) => void;
  setActiveProjectFileRevision: (revision: number | null) => void;
  setProjectSaveConflict: (conflict: null) => void;
  setLastProjectSaveFingerprint: (fingerprint: string | null) => void;
  currentDocumentFingerprint: () => string;
  closeFileManager: () => void;
  setProjectFiles: (files: ProjectFileSummary[]) => void;
  setProjectFilesStatusReady: () => void;
  serializeDocument: (document: MauthDocumentLike<Q, F, C>, context: MauthAssistantToolCommitContext) => string;
  parseProjectFileDocument: (document: ProjectFileDocument, context: MauthAssistantToolCommitContext) => MauthDocumentLike<Q, F, C>;
}

const assistantFileDriver = {
  listFiles: async (projectId: string) => (await listProjectFiles(projectId)).files,
  getFile: (projectId: string, filePath: string) => getProjectFile(projectId, filePath),
  saveFile: (projectId: string, filePath: string, file: ProjectFileSaveRequest) => saveProjectFile(projectId, filePath, file),
  deleteFile: (projectId: string, filePath: string, baseRevision?: number) => deleteProjectFile(projectId, filePath, baseRevision),
  listVersions: async (projectId: string, filePath: string) => (await listProjectFileVersions(projectId, filePath)).versions,
  restoreVersion: (projectId: string, filePath: string, versionId: string) => restoreProjectFileVersion(projectId, filePath, versionId),
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function revisionFromToolContext(context: MauthAssistantToolCommitContext) {
  const contextData = asRecord(context.data);
  const contextDocument = asRecord(contextData?.document);
  return typeof contextDocument?.revision === "number" ? contextDocument.revision : null;
}

export function useMauthAssistantHost<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>({
  getDocument,
  commitDocument,
  documentOptions,
  ensureProject,
  activeProjectFilePathRef,
  activeProjectFileRevisionRef,
  setActiveProjectFilePath,
  setActiveProjectFileRevision,
  setProjectSaveConflict,
  setLastProjectSaveFingerprint,
  currentDocumentFingerprint,
  closeFileManager,
  setProjectFiles,
  setProjectFilesStatusReady,
  serializeDocument,
  parseProjectFileDocument,
}: UseMauthAssistantHostOptions<Q, F, C>) {
  return useCallback((): MauthAssistantAdapterHost<Q, F, C> => {
    return {
      getDocument,
      commitDocument,
      documentOptions,
      fileDriver: assistantFileDriver,
      getProjectId: async () => (await ensureProject()).id,
      getActiveFilePath: () => activeProjectFilePathRef.current,
      getActiveFileRevision: () => activeProjectFileRevisionRef.current,
      setActiveFilePath: (filePath, context) => {
        const revision = filePath ? revisionFromToolContext(context) : null;
        activeProjectFilePathRef.current = filePath;
        activeProjectFileRevisionRef.current = revision;
        setActiveProjectFilePath(filePath);
        setActiveProjectFileRevision(revision);
        setProjectSaveConflict(null);
        setLastProjectSaveFingerprint(filePath ? currentDocumentFingerprint() : null);
        if (filePath && context.toolName === "mauth.files.open") closeFileManager();
      },
      serializeDocument,
      parseProjectFileDocument,
      onFilesChanged: (files) => {
        setProjectFiles(files);
        setProjectFilesStatusReady();
      },
    };
  }, [
    activeProjectFilePathRef,
    activeProjectFileRevisionRef,
    closeFileManager,
    commitDocument,
    currentDocumentFingerprint,
    documentOptions,
    ensureProject,
    getDocument,
    parseProjectFileDocument,
    serializeDocument,
    setActiveProjectFilePath,
    setActiveProjectFileRevision,
    setLastProjectSaveFingerprint,
    setProjectFiles,
    setProjectFilesStatusReady,
    setProjectSaveConflict,
  ]);
}
