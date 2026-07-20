import { normalizeColumnsBlock } from "./contentBlockNormalization.ts";
import type { EditorColumnBlockPath } from "./editorDocumentDuplication.ts";
import type { EditorContentBlock, QuestionBlock } from "./editorDocumentNormalization.ts";
import type { MauthContentScope } from "./mauthActions.ts";
import { partBlockScrollAnchor, questionBlockScrollAnchor, subpartBlockScrollAnchor, type ParsedScrollAnchor } from "./scrollAnchors.ts";

export interface EditorRootBlockContext {
  block?: EditorContentBlock;
  scope: MauthContentScope;
  anchorForBlock: (blockId: string) => string;
}

export interface EditorColumnBlockContext extends EditorRootBlockContext {
  block: EditorContentBlock;
  rootBlock: Extract<EditorContentBlock, { kind: "columns" }>;
  rootAnchor: string;
}

export function columnBlockAtPath(rootBlock: EditorContentBlock, path: EditorColumnBlockPath): EditorContentBlock | null {
  let currentBlock = rootBlock;
  for (const entry of path) {
    if (currentBlock.kind !== "columns") return null;
    const column = normalizeColumnsBlock(currentBlock).columns[entry.columnIndex] ?? [];
    const nextBlock = column.find((candidate) => candidate.id === entry.blockId);
    if (!nextBlock) return null;
    currentBlock = nextBlock;
  }
  return currentBlock;
}

export function createEditorBlockContextRuntime(questions: QuestionBlock[]) {
  function rootBlockContextFromParsed(parsed: ParsedScrollAnchor): EditorRootBlockContext | null {
    const blockId = parsed.kind === "columnBlock" ? parsed.rootBlockId : parsed.blockId;
    if (!parsed.questionId || !blockId) return null;
    const question = questions.find((current) => current.id === parsed.questionId);
    if (!question) return null;

    if (parsed.partId && parsed.subpartId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const subpart = part?.subparts.find((current) => current.id === parsed.subpartId);
      const block = subpart?.contentBlocks.find((current) => current.id === blockId);
      return {
        block,
        scope: {
          kind: "subpart",
          questionId: parsed.questionId,
          partId: parsed.partId,
          subpartId: parsed.subpartId,
        },
        anchorForBlock: (nextBlockId: string) =>
          subpartBlockScrollAnchor(parsed.questionId ?? "", parsed.partId ?? "", parsed.subpartId ?? "", nextBlockId),
      };
    }

    if (parsed.partId) {
      const part = question.parts.find((current) => current.id === parsed.partId);
      const block = part?.contentBlocks.find((current) => current.id === blockId);
      return {
        block,
        scope: { kind: "part", questionId: parsed.questionId, partId: parsed.partId },
        anchorForBlock: (nextBlockId: string) => partBlockScrollAnchor(parsed.questionId ?? "", parsed.partId ?? "", nextBlockId),
      };
    }

    const block = question.contentBlocks.find((current) => current.id === blockId);
    return {
      block,
      scope: { kind: "question", questionId: parsed.questionId },
      anchorForBlock: (nextBlockId: string) => questionBlockScrollAnchor(parsed.questionId ?? "", nextBlockId),
    };
  }

  function blockContextFromParsed(parsed: ParsedScrollAnchor) {
    if (!parsed.questionId || !parsed.blockId) return null;
    if (parsed.kind !== "questionBlock" && parsed.kind !== "partBlock" && parsed.kind !== "subpartBlock") return null;
    return rootBlockContextFromParsed(parsed);
  }

  function columnBlockContextFromParsed(parsed: ParsedScrollAnchor): EditorColumnBlockContext | null {
    if (parsed.kind !== "columnBlock" || !parsed.columnPath?.length) return null;
    const rootContext = rootBlockContextFromParsed(parsed);
    if (!rootContext?.block || rootContext.block.kind !== "columns") return null;
    const block = columnBlockAtPath(rootContext.block, parsed.columnPath);
    if (!block) return null;
    return {
      ...rootContext,
      block,
      rootBlock: rootContext.block,
      rootAnchor: rootContext.anchorForBlock(rootContext.block.id),
    };
  }

  return {
    blockContextFromParsed,
    columnBlockContextFromParsed,
    rootBlockContextFromParsed,
  };
}
