import type { ContentBlock } from "@mauth-studio/shared";

import type { ColumnBlockPath, SelectedEditorBaseBlockScope, SelectedEditorBlock } from "@/lib/editorBlockSelection";
import { studentSurfaceBlockPatch } from "@/lib/editorDocumentDuplication";
import type { MauthAction, MauthContentScope } from "@/lib/mauthActions";
import type { QuestionBlock } from "@/lib/editorDocumentNormalization";
import { columnPathScrollAnchor, partBlockScrollAnchor, questionBlockScrollAnchor, subpartBlockScrollAnchor } from "@/lib/scrollAnchors";
import { solutionBlockVisibility } from "@/lib/solutionBlockVisibility";

interface ApplyActionResult {
  ok: boolean;
}

type ColumnsContentBlock = Extract<ContentBlock, { kind: "columns" }>;

interface SolutionSurfaceColumnCopyResult {
  rootBlock: ColumnsContentBlock;
  solutionPath: ColumnBlockPath;
}

interface UseSolutionSurfaceCopyControllerOptions {
  questions: QuestionBlock[];
  showEditor: boolean;
  applyAction: (action: MauthAction) => ApplyActionResult;
  applyActions: (actions: MauthAction[]) => ApplyActionResult;
  showSolutions: () => void;
  selectContextAnchor: (anchor: string, options?: { openEditor?: boolean; openInspector?: boolean; previewOnly?: boolean }) => void;
  solutionSurfaceContentBlock: (block: ContentBlock) => ContentBlock | null;
  solutionSurfaceColumnBlockCopyAtPath: (rootBlock: ColumnsContentBlock, path: ColumnBlockPath) => SolutionSurfaceColumnCopyResult | null;
}

function contentBlockContextFromBaseScope(questions: QuestionBlock[], scope: SelectedEditorBaseBlockScope, blockId: string) {
  const question = questions.find((current) => current.id === scope.questionId);
  if (!question) return null;

  if (scope.kind === "subpart") {
    const part = question.parts.find((current) => current.id === scope.partId);
    const subpart = part?.subparts.find((current) => current.id === scope.subpartId);
    const block = subpart?.contentBlocks.find((current) => current.id === blockId);
    if (!block) return null;
    return {
      block,
      scope: {
        kind: "subpart",
        questionId: scope.questionId,
        partId: scope.partId,
        subpartId: scope.subpartId,
      } satisfies MauthContentScope,
      anchorForBlock: (nextBlockId: string) => subpartBlockScrollAnchor(scope.questionId, scope.partId, scope.subpartId, nextBlockId),
    };
  }

  if (scope.kind === "part") {
    const part = question.parts.find((current) => current.id === scope.partId);
    const block = part?.contentBlocks.find((current) => current.id === blockId);
    if (!block) return null;
    return {
      block,
      scope: { kind: "part", questionId: scope.questionId, partId: scope.partId } satisfies MauthContentScope,
      anchorForBlock: (nextBlockId: string) => partBlockScrollAnchor(scope.questionId, scope.partId, nextBlockId),
    };
  }

  const block = question.contentBlocks.find((current) => current.id === blockId);
  if (!block) return null;
  return {
    block,
    scope: { kind: "question", questionId: scope.questionId } satisfies MauthContentScope,
    anchorForBlock: (nextBlockId: string) => questionBlockScrollAnchor(scope.questionId, nextBlockId),
  };
}

export function useSolutionSurfaceCopyController({
  questions,
  showEditor,
  applyAction,
  applyActions,
  showSolutions,
  selectContextAnchor,
  solutionSurfaceContentBlock,
  solutionSurfaceColumnBlockCopyAtPath,
}: UseSolutionSurfaceCopyControllerOptions) {
  function createSolutionCopyForSelectedBlock(selection: SelectedEditorBlock) {
    if (solutionBlockVisibility(selection.block) === "solution") return;

    if (selection.scope.kind === "column") {
      const rootContext = contentBlockContextFromBaseScope(questions, selection.scope.rootScope, selection.scope.rootBlockId);
      if (!rootContext?.block || rootContext.block.kind !== "columns") return;
      const solutionCopy = solutionSurfaceColumnBlockCopyAtPath(rootContext.block, selection.scope.path);
      if (!solutionCopy) return;
      const result = applyAction({
        type: "module.update",
        scope: rootContext.scope,
        blockId: rootContext.block.id,
        patch: {
          columnCount: solutionCopy.rootBlock.columnCount,
          columns: solutionCopy.rootBlock.columns,
          visibility: "always",
          solutionOnly: false,
          studentOnly: false,
          markTicks: undefined,
        },
      });
      if (!result.ok) return;
      showSolutions();
      const rootAnchor = rootContext.anchorForBlock(rootContext.block.id);
      selectContextAnchor(columnPathScrollAnchor(rootAnchor, solutionCopy.solutionPath), { openEditor: showEditor, openInspector: true });
      return;
    }

    const nextBlock = solutionSurfaceContentBlock(selection.block);
    if (!nextBlock) return;
    const result = applyActions([
      {
        type: "module.update",
        scope: selection.scope,
        blockId: selection.block.id,
        patch: studentSurfaceBlockPatch() as Record<string, unknown>,
      },
      {
        type: "module.add",
        scope: selection.scope,
        blocks: [nextBlock],
        placement: { blockId: selection.block.id, position: "after" },
      },
    ]);
    if (!result.ok) return;
    showSolutions();
    const context = contentBlockContextFromBaseScope(questions, selection.scope, selection.block.id);
    if (context) selectContextAnchor(context.anchorForBlock(nextBlock.id), { openEditor: showEditor, openInspector: true });
  }

  return { createSolutionCopyForSelectedBlock };
}
