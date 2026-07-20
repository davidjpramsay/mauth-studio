import type { EditorPageBreakTarget } from "./editorSubsectionDrag.ts";

export function editorPageBreakContextLabel(target: Pick<EditorPageBreakTarget, "kind">, isNotesTemplate: boolean) {
  if (isNotesTemplate) return target.kind === "part" ? "next subheading" : "next detail";
  return target.kind === "part" ? "next part" : "next subpart";
}

export function editorPageBreakTitle(contextLabel: string) {
  return `Page break. The ${contextLabel} starts on a new page. Drag or press Alt+Up/Alt+Down to move it. Delete removes it.`;
}

export function editorPageBreakAriaLabel(contextLabel: string) {
  return `Page break. The ${contextLabel} starts on a new page.`;
}

export function editorPageBreakSummary(contextLabel: string) {
  return `${contextLabel[0]?.toUpperCase() ?? ""}${contextLabel.slice(1)} starts on a new page`;
}
