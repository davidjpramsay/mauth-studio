import type { ContentBlock } from "@mauth-studio/shared";

import type { MauthAction, MauthContentScope } from "./mauthActions.ts";
import { partBlockScrollAnchor, questionBlockScrollAnchor, subpartBlockScrollAnchor } from "./scrollAnchors.ts";

export type ModuleAddAction = Extract<MauthAction, { type: "module.add" }>;
export type ModuleDeleteAction = Extract<MauthAction, { type: "module.delete" }>;

export interface EditorModuleInsertionPlan {
  action: ModuleAddAction;
  anchor: string;
}

export function moduleAnchorForScope(scope: MauthContentScope, blockId: string) {
  if (scope.kind === "subpart") return subpartBlockScrollAnchor(scope.questionId, scope.partId, scope.subpartId, blockId);
  if (scope.kind === "part") return partBlockScrollAnchor(scope.questionId, scope.partId, blockId);
  return questionBlockScrollAnchor(scope.questionId, blockId);
}

export function moduleInsertionPlan(scope: MauthContentScope, block: ContentBlock): EditorModuleInsertionPlan {
  return {
    action: { type: "module.add", scope, blocks: [block] },
    anchor: moduleAnchorForScope(scope, block.id),
  };
}

export function moduleDeletionAction(scope: MauthContentScope, blockId: string): ModuleDeleteAction {
  return { type: "module.delete", scope, blockId };
}
