import type { ContentBlock } from "@mauth-studio/shared";

import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
import type { MauthAction } from "@/lib/mauthActions";

interface SolutionSlotSubpartLike {
  id: string;
  marks: number;
}

interface SolutionSlotPartLike {
  id: string;
  marks: number;
  subparts?: SolutionSlotSubpartLike[];
}

interface SolutionSlotQuestionLike {
  id: string;
  marks: number;
  parts?: SolutionSlotPartLike[];
}

interface ApplyActionResult {
  ok: boolean;
}

interface UseSolutionSlotControllerOptions<TQuestion extends SolutionSlotQuestionLike, TBlock extends ContentBlock> {
  questions: TQuestion[];
  dialogs: MauthDialogActions;
  isEnabled: () => boolean;
  defaultLinesForMarks: (marks: number) => number;
  normalizeLines: (value: unknown) => number;
  buildSolutionSlotBlocks: (lines: number) => TBlock[];
  applyAction: (action: MauthAction) => ApplyActionResult;
  showSolutions: () => void;
}

function partMarkTotal(part: SolutionSlotPartLike) {
  const subparts = part.subparts ?? [];
  if (subparts.length) return subparts.reduce((sum, subpart) => sum + Number(subpart.marks || 0), 0);
  return Number(part.marks || 0);
}

function questionMarkTotal(question: SolutionSlotQuestionLike) {
  const parts = question.parts ?? [];
  if (parts.length) return parts.reduce((sum, part) => sum + partMarkTotal(part), 0);
  return Math.max(0, Number(question.marks) || 0);
}

export function useSolutionSlotController<
  TQuestion extends SolutionSlotQuestionLike,
  TPart extends SolutionSlotPartLike,
  TSubpart extends SolutionSlotSubpartLike,
  TBlock extends ContentBlock,
>({
  questions,
  dialogs,
  isEnabled,
  defaultLinesForMarks,
  normalizeLines,
  buildSolutionSlotBlocks,
  applyAction,
  showSolutions,
}: UseSolutionSlotControllerOptions<TQuestion, TBlock>) {
  async function requestSolutionSlotLines(defaultLines: number) {
    const requested = await dialogs.prompt({
      title: "Answer and solution space",
      label: "Student answer lines",
      description: "Set the number of student working lines paired with this solution slot.",
      defaultValue: String(defaultLines),
      confirmLabel: "Add slot",
      requireValue: true,
    });
    if (requested === null) return null;
    return Math.max(1, Math.floor(normalizeLines(requested)));
  }

  async function addQuestionSolutionSlot(questionId: string) {
    if (!isEnabled()) return;
    const question = questions.find((current) => current.id === questionId);
    if (!question) return;
    const defaultLines = defaultLinesForMarks(question.parts?.length ? questionMarkTotal(question) : question.marks);
    const lines = await requestSolutionSlotLines(defaultLines);
    if (lines === null) return;
    const result = applyAction({
      type: "solutionSlot.add",
      scope: { kind: "question", questionId: question.id },
      blocks: buildSolutionSlotBlocks(lines),
    });
    if (result.ok) showSolutions();
  }

  async function addPartSolutionSlot(questionId: string, part: TPart) {
    if (!isEnabled()) return;
    const defaultLines = defaultLinesForMarks(part.subparts?.length ? partMarkTotal(part) : part.marks);
    const lines = await requestSolutionSlotLines(defaultLines);
    if (lines === null) return;
    const result = applyAction({
      type: "solutionSlot.add",
      scope: { kind: "part", questionId, partId: part.id },
      blocks: buildSolutionSlotBlocks(lines),
    });
    if (result.ok) showSolutions();
  }

  async function addSubpartSolutionSlot(questionId: string, part: TPart, subpart: TSubpart) {
    if (!isEnabled()) return;
    const lines = await requestSolutionSlotLines(defaultLinesForMarks(subpart.marks));
    if (lines === null) return;
    const result = applyAction({
      type: "solutionSlot.add",
      scope: { kind: "subpart", questionId, partId: part.id, subpartId: subpart.id },
      blocks: buildSolutionSlotBlocks(lines),
    });
    if (result.ok) showSolutions();
  }

  return {
    addQuestionSolutionSlot,
    addPartSolutionSlot,
    addSubpartSolutionSlot,
  };
}
