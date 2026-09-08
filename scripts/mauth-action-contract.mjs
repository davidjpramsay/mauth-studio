import { z } from "zod/v4";

const id = z.string().min(1);
const record = z.record(z.string(), z.unknown());
const position = z.enum(["before", "after"]);
const orderItem = z.object({ kind: z.enum(["block", "part", "subpart"]), id });
const flowItem = z.object({ kind: z.enum(["question", "sectionHeading"]), id });
const blockPlacement = z.object({ blockId: id, position });
const partPlacement = z.object({ partId: id, position });
const subpartPlacement = z.object({ subpartId: id, position });
const orderPlacement = z.object({ item: orderItem, position });
const scope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("question"), questionId: id }),
  z.object({ kind: z.literal("part"), questionId: id, partId: id }),
  z.object({ kind: z.literal("subpart"), questionId: id, partId: id, subpartId: id }),
]);
// Renderer-specific payloads remain extensible. The editor remains the final
// validator for document invariants and typed settings, including new fields.
const block = z.object({ id, kind: z.string().min(1) }).passthrough();
const subpart = z.object({ id, text: z.string().optional(), marks: z.number(), contentBlocks: z.array(block) }).passthrough();
const part = subpart.extend({ subparts: z.array(subpart).optional(), itemOrder: z.array(orderItem).optional() });
const question = subpart.extend({ parts: z.array(part).optional(), itemOrder: z.array(orderItem).optional() });
const graphConfig = z.object({ type: z.string().optional() }).passthrough();
const settings = z.object({ kind: z.string().min(1) }).passthrough();
const partScope = z.object({ questionId: id, partId: id });
const variants = {
  "question.add": { question, afterQuestionId: id.optional() },
  "question.update": { questionId: id, patch: record },
  "question.delete": { questionId: id, fallbackQuestion: question.optional() },
  "question.reorder": { questionId: id, targetQuestionId: id, placement: position },
  "part.add": { questionId: id, part, placement: partPlacement.optional() },
  "part.update": { questionId: id, partId: id, patch: record },
  "part.delete": { questionId: id, partId: id },
  "part.reorder": { questionId: id, partId: id, targetPartId: id, placement: position },
  "part.move": { fromQuestionId: id, toQuestionId: id, partId: id, placement: z.union([partPlacement, orderPlacement]).optional() },
  "subpart.add": { questionId: id, partId: id, subpart, placement: subpartPlacement.optional() },
  "subpart.update": { questionId: id, partId: id, subpartId: id, patch: record },
  "subpart.delete": { questionId: id, partId: id, subpartId: id },
  "subpart.reorder": { questionId: id, partId: id, subpartId: id, targetSubpartId: id, placement: position },
  "subpart.move": { from: partScope, to: partScope, subpartId: id, placement: z.union([subpartPlacement, orderPlacement]).optional() },
  "module.add": { scope, blocks: z.array(block), placement: blockPlacement.optional() },
  "module.update": { scope, blockId: id, patch: record },
  "module.settings.update": { scope, blockId: id, settings },
  "module.delete": { scope, blockId: id },
  "module.reorder": { scope, blockId: id, targetBlockId: id, placement: position },
  "module.move": { fromScope: scope, toScope: scope, blockId: id, placement: z.union([blockPlacement, orderPlacement]).optional() },
  "solutionSlot.add": { scope, blocks: z.array(block), placement: blockPlacement.optional() },
  "marks.update": { target: scope, marks: z.number() },
  "diagram.update": { scope, blockId: id, graphConfig },
  "diagram.settings.update": {
    scope,
    blockId: id,
    settings: z
      .object({
        renderer: z.enum([
          "graph2d",
          "geometry2d",
          "vector2d",
          "graph3d",
          "statsChart",
          "geometricConstruction",
          "network",
          "setDiagram",
          "image",
        ]),
      })
      .passthrough(),
  },
  "pageBreak.set": { target: scope, enabled: z.boolean() },
  "validation.solution.run": {},
  "sectionHeading.add": {
    heading: z.object({ id, title: z.string(), titlePage: record.optional() }),
    beforeItem: flowItem.optional(),
    afterItem: flowItem.optional(),
  },
  "sectionHeading.update": { sectionHeadingId: id, patch: z.object({ title: z.string().optional(), titlePage: record.optional() }) },
  "sectionHeading.delete": { sectionHeadingId: id },
  "sectionHeading.reorder": { sectionHeadingId: id, targetItem: flowItem, placement: position },
  "frontMatter.update": { patch: record },
  "frontMatter.replace": { frontMatter: record },
  "frontMatter.logo.set": { logoId: z.string(), schoolName: z.string().optional() },
  "pageFormat.update": { patch: record },
  "formatting.update": { patch: record },
  "document.validation.run": {},
};

export const actionTypes = Object.keys(variants);
export const actionSchema = z.array(
  z.discriminatedUnion(
    "type",
    Object.entries(variants).map(([type, shape]) => z.object({ type: z.literal(type), ...shape }).passthrough()),
  ),
);
export const ACTION_CATALOG_URI = "mauth://authoring/actions/v1";
export const actionCatalog = {
  version: 1,
  scope: "MauthDocumentAction envelopes. Patch and renderer-specific settings are validated by the live editor during preview.",
  workflow: [
    "Read mauth_snapshot for documentId, ids and mutationBase",
    "Dry-run mauth_actions_preview",
    "Review warnings",
    "Apply the same batch with baseSnapshotId and a stable idempotencyKey",
    "Validate and inspect Student and Solutions output",
  ],
  actions: actionTypes,
  inputSchema: z.toJSONSchema(actionSchema),
  examples: [
    { type: "question.update", questionId: "q1", patch: { text: "Solve $x^2=9$." } },
    { type: "marks.update", target: { kind: "part", questionId: "q1", partId: "p1" }, marks: 2 },
    {
      type: "module.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "choices1",
      settings: { kind: "choices", solutionAnswerIndex: 1 },
    },
    { type: "pageBreak.set", target: { kind: "part", questionId: "q1", partId: "p2" }, enabled: true },
    {
      type: "diagram.settings.update",
      scope: { kind: "question", questionId: "q1" },
      blockId: "graph1",
      settings: { renderer: "graph2d", showAxisNumbers: true },
    },
  ],
};

export function projectSnapshot(output, questionId) {
  if (!questionId || output.httpStatus >= 400 || output.httpStatus === 0 || output.success === false) return output;
  const question = output.questions?.find((entry) => entry.id === questionId);
  if (!question)
    return {
      ...output,
      httpStatus: 404,
      success: false,
      code: "QUESTION_NOT_FOUND",
      error: "The question is not in this snapshot. Read mauth_snapshot again for current ids.",
    };
  return { ...output, questions: [question], snapshotScope: { questionId, summaryOnly: true }, questionCount: output.questionCount };
}
