import { useCallback } from "react";
import type {
  ContentBlock,
  GraphConfig,
  ProjectFileDocument,
  ProjectFileSaveRequest,
  ProjectFileSummary,
  ProjectSummary,
} from "@mauth-studio/shared";

import {
  deleteProjectFile,
  getProjectFile,
  listProjectFiles,
  listProjectFileVersions,
  renderPenroseDiagram,
  restoreProjectFileVersion,
  saveProjectFile,
} from "@/lib/api";
import { penroseRenderRequest } from "@/lib/diagramPenrose";
import type {
  MauthAssistantAdapterHost,
  MauthAssistantDocumentPreflightResult,
  MauthAssistantToolCommitContext,
} from "@/lib/mauthAssistantAdapter";
import {
  validateAssistantDiagramPreservationBeforeCommit,
  validateAssistantDiagramSemanticsBeforeCommit,
  validateAssistantSolutionMarkingBeforeCommit,
} from "@/lib/mauthAssistantPreflight";
import type { MauthPreviewRenderedMetrics } from "@/lib/mauthAssistantTools";
import type { MauthDocumentActionOptions, MauthDocumentLike, MauthPartLike, MauthQuestionLike, MauthSubpartLike } from "@/lib/mauthActions";

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
  getActiveAnchor?: () => string | null;
  getRenderedPreviewMetrics?: () => MauthPreviewRenderedMetrics | null;
  waitForRenderedPreviewMetrics?: (context: MauthAssistantToolCommitContext) => Promise<MauthPreviewRenderedMetrics | null>;
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

function isPenroseGraphConfig(graphConfig: GraphConfig) {
  return graphConfig.type === "geometricConstruction" || graphConfig.type === "setDiagram" || graphConfig.type === "vectorRelationship";
}

interface PenrosePreflightCandidate {
  graphConfig: GraphConfig;
  path: string;
  targetId: string;
}

function collectChangedPenroseBlocks<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>(
  document: MauthDocumentLike<Q, F, C>,
  changedIds: readonly string[],
) {
  const changedIdSet = new Set(changedIds);
  const validateAll = changedIdSet.size === 0;
  const candidates: PenrosePreflightCandidate[] = [];

  function collectBlocks(blocks: readonly ContentBlock[], pathPrefix: string, inheritedChanged: boolean) {
    blocks.forEach((block, blockIndex) => {
      const blockChanged = inheritedChanged || changedIdSet.has(block.id);
      if (block.kind !== "diagram" || !blockChanged || !isPenroseGraphConfig(block.graphConfig)) return;
      candidates.push({
        graphConfig: block.graphConfig,
        path: `${pathPrefix}.contentBlocks[${blockIndex}].graphConfig`,
        targetId: block.id,
      });
    });
  }

  function collectSubpart(subpart: MauthSubpartLike, pathPrefix: string, inheritedChanged: boolean) {
    const subpartChanged = inheritedChanged || changedIdSet.has(subpart.id);
    collectBlocks(subpart.contentBlocks, pathPrefix, subpartChanged);
  }

  function collectPart(part: MauthPartLike, pathPrefix: string, inheritedChanged: boolean) {
    const partChanged = inheritedChanged || changedIdSet.has(part.id);
    collectBlocks(part.contentBlocks, pathPrefix, partChanged);
    part.subparts?.forEach((subpart, subpartIndex) => {
      collectSubpart(subpart, `${pathPrefix}.subparts[${subpartIndex}]`, partChanged);
    });
  }

  document.questions.forEach((question, questionIndex) => {
    const questionChanged = validateAll || changedIdSet.has(question.id);
    const questionPath = `questions[${questionIndex}]`;
    collectBlocks(question.contentBlocks, questionPath, questionChanged);
    question.parts?.forEach((part, partIndex) => {
      collectPart(part, `${questionPath}.parts[${partIndex}]`, questionChanged);
    });
  });

  return candidates;
}

async function validatePenroseDiagramsBeforeCommit<
  Q extends MauthQuestionLike,
  F extends object,
  C extends object = Record<string, unknown>,
>(
  document: MauthDocumentLike<Q, F, C>,
  _context: MauthAssistantToolCommitContext,
  changedIds: string[],
): Promise<MauthAssistantDocumentPreflightResult> {
  const candidates = collectChangedPenroseBlocks(document, changedIds);
  for (const candidate of candidates) {
    try {
      await renderPenroseDiagram(penroseRenderRequest(candidate.graphConfig));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const message = `Penrose diagram did not render for ${candidate.path}. Fix graphConfig.options.substanceSource and retry.`;
      return {
        ok: false,
        error: `${message} ${detail}`,
        warnings: [{ code: "assistant-penrose-render-failed", message, targetId: candidate.targetId }],
        validationIssues: [
          {
            path: candidate.path,
            message: `Penrose diagram did not render. ${detail}`,
            expected:
              "A renderable Penrose graphConfig. For angle labels, define `Label angleName $...$` and then call `LabelsAngle(angleName, A, B, C)`.",
            targetId: candidate.targetId,
          },
        ],
      };
    }
  }
  return { ok: true };
}

async function validateAssistantDocumentBeforeCommit<
  Q extends MauthQuestionLike,
  F extends object,
  C extends object = Record<string, unknown>,
>(
  document: MauthDocumentLike<Q, F, C>,
  context: MauthAssistantToolCommitContext,
  changedIds: string[],
  previousDocument: MauthDocumentLike<Q, F, C>,
): Promise<MauthAssistantDocumentPreflightResult> {
  const diagramPreservation = validateAssistantDiagramPreservationBeforeCommit(previousDocument, document, context, changedIds);
  if (!diagramPreservation.ok) return diagramPreservation;

  const solutionMarking = validateAssistantSolutionMarkingBeforeCommit(document, context, changedIds);
  if (!solutionMarking.ok) return solutionMarking;

  const penroseRender = await validatePenroseDiagramsBeforeCommit(document, context, changedIds);
  if (!penroseRender.ok) return penroseRender;

  return validateAssistantDiagramSemanticsBeforeCommit(document, context, changedIds);
}

export function useMauthAssistantHost<Q extends MauthQuestionLike, F extends object, C extends object = Record<string, unknown>>({
  getDocument,
  commitDocument,
  documentOptions,
  ensureProject,
  activeProjectFilePathRef,
  activeProjectFileRevisionRef,
  getActiveAnchor,
  getRenderedPreviewMetrics,
  waitForRenderedPreviewMetrics,
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
      getActiveAnchor,
      getRenderedPreviewMetrics,
      waitForRenderedPreviewMetrics,
      validateDocumentBeforeCommit: validateAssistantDocumentBeforeCommit,
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
    getActiveAnchor,
    getRenderedPreviewMetrics,
    waitForRenderedPreviewMetrics,
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
