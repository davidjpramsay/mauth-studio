import type { ContentBlock, ContentBlockVisibility } from "@mauth-studio/shared";

export interface SolutionVisibilityReplacementSlotGroup<TBlock extends ContentBlock = ContentBlock> {
  studentBlock: TBlock;
  solutionBlocks: TBlock[];
  blocks: TBlock[];
  endIndex: number;
}

export function normalizeContentBlockVisibility(value: unknown): ContentBlockVisibility | undefined {
  return value === "always" || value === "student" || value === "solution" ? value : undefined;
}

export function solutionBlockVisibility(block: ContentBlock): ContentBlockVisibility {
  const explicitVisibility = normalizeContentBlockVisibility(block.visibility);
  if (block.solutionOnly === true || (block.solutionOnly !== false && block.id.startsWith("solution-"))) return "solution";
  if (explicitVisibility === "solution") return "solution";
  if (explicitVisibility === "student" || block.studentOnly === true) return "student";
  return "always";
}

export function isSolutionOnlyBlock(block: ContentBlock) {
  return solutionBlockVisibility(block) === "solution";
}

export function isContentBlockVisible(block: ContentBlock, showSolutions: boolean) {
  const visibility = solutionBlockVisibility(block);
  if (visibility === "solution") return showSolutions;
  if (visibility === "student") return !showSolutions;
  return true;
}

export function solutionTextHasMarkAnnotation(block: ContentBlock) {
  return block.kind === "text" && isSolutionOnlyBlock(block) && /\[\[marks:\s*\d+\s*]]/i.test(block.text);
}

export function isSolutionSurfaceMissingTicks(block: ContentBlock) {
  if (block.kind !== "table" && block.kind !== "diagram") return false;
  if (!isSolutionOnlyBlock(block)) return false;
  const markTicks = Number(block.markTicks);
  return !Number.isInteger(markTicks);
}

export function recoverMissingSolutionSurfaceTicks<TBlock extends ContentBlock>(blocks: TBlock[], marks: unknown) {
  const markValue = typeof marks === "number" ? marks : Number(marks);
  const markTicks = Math.max(0, Math.min(20, Math.round(Number.isFinite(markValue) ? markValue : 0)));
  if (!markTicks || blocks.some(solutionTextHasMarkAnnotation)) return blocks;

  const candidateIds = blocks.filter(isSolutionSurfaceMissingTicks).map((block) => block.id);
  if (candidateIds.length !== 1) return blocks;

  const [targetId] = candidateIds;
  return blocks.map((block) => (block.id === targetId ? ({ ...block, markTicks } as TBlock) : block));
}

export function isStudentReplacementBlock(block: ContentBlock) {
  return solutionBlockVisibility(block) === "student";
}

export function isSolutionReplacementBlock(block: ContentBlock) {
  return solutionBlockVisibility(block) === "solution";
}

export function canShareReplacementSlot(studentBlock: ContentBlock, solutionBlock: ContentBlock) {
  if (studentBlock.kind === "space") return true;
  return studentBlock.kind === solutionBlock.kind;
}

export function visibilityReplacementSlotAt<TBlock extends ContentBlock>(
  blocks: TBlock[],
  startIndex: number,
): SolutionVisibilityReplacementSlotGroup<TBlock> | null {
  const block = blocks[startIndex];
  if (!block || block.kind === "pageBreak") return null;

  if (isStudentReplacementBlock(block)) {
    const solutionBlocks: TBlock[] = [];
    let cursor = startIndex + 1;
    while (cursor < blocks.length && isSolutionReplacementBlock(blocks[cursor]) && canShareReplacementSlot(block, blocks[cursor])) {
      solutionBlocks.push(blocks[cursor]);
      cursor += 1;
    }
    if (!solutionBlocks.length) return null;
    return {
      studentBlock: block,
      solutionBlocks,
      blocks: [block, ...solutionBlocks],
      endIndex: cursor - 1,
    };
  }

  if (isSolutionReplacementBlock(block)) {
    const solutionBlocks: TBlock[] = [];
    let cursor = startIndex;
    while (cursor < blocks.length && isSolutionReplacementBlock(blocks[cursor])) {
      solutionBlocks.push(blocks[cursor]);
      cursor += 1;
    }
    const studentBlock = blocks[cursor];
    if (!studentBlock || !isStudentReplacementBlock(studentBlock)) return null;
    const compatibleSolutionBlocks = solutionBlocks.filter((solutionBlock) => canShareReplacementSlot(studentBlock, solutionBlock));
    if (!compatibleSolutionBlocks.length || compatibleSolutionBlocks.length !== solutionBlocks.length) return null;
    return {
      studentBlock,
      solutionBlocks: compatibleSolutionBlocks,
      blocks: [...compatibleSolutionBlocks, studentBlock],
      endIndex: cursor,
    };
  }

  return null;
}

export function replacementSlotContainingBlock<TBlock extends ContentBlock>(blocks: TBlock[], blockIndex: number) {
  const block = blocks[blockIndex];
  if (!block) return null;

  const directSlot = visibilityReplacementSlotAt(blocks, blockIndex);
  if (directSlot) return directSlot;

  for (let cursor = blockIndex - 1; cursor >= 0; cursor -= 1) {
    const candidate = blocks[cursor];
    if (!candidate || candidate.kind === "pageBreak" || !isSolutionReplacementBlock(candidate)) break;
    const slot = visibilityReplacementSlotAt(blocks, cursor);
    if (slot && blockIndex <= slot.endIndex) return slot;
  }

  return null;
}

export function isUnpairedStudentAnswerSpace<TBlock extends ContentBlock>(blocks: TBlock[], blockIndex: number) {
  const block = blocks[blockIndex];
  return Boolean(
    block?.kind === "space" && solutionBlockVisibility(block) === "student" && !replacementSlotContainingBlock(blocks, blockIndex),
  );
}

export function isContentBlockVisibleInScope<TBlock extends ContentBlock>(blocks: TBlock[], blockIndex: number, showSolutions: boolean) {
  const block = blocks[blockIndex];
  if (!block) return false;
  if (showSolutions && isUnpairedStudentAnswerSpace(blocks, blockIndex)) return true;
  return isContentBlockVisible(block, showSolutions);
}

export function isDiagramBesideContentBlockInScope<TBlock extends ContentBlock>(
  blocks: TBlock[],
  blockIndex: number,
  showSolutions: boolean,
) {
  const block = blocks[blockIndex];
  return Boolean(
    block && (block.kind === "text" || block.kind === "space") && isContentBlockVisibleInScope(blocks, blockIndex, showSolutions),
  );
}

export function isSolutionTextBlock(block: ContentBlock) {
  return block.kind === "text" && solutionBlockVisibility(block) === "solution";
}
