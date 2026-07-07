export function insertionActionLabel(label: string, solutionMode: boolean) {
  return solutionMode ? `Solution ${label.toLowerCase()}` : label;
}

export function insertionActionTooltip({
  actionVerb,
  label,
  fallback,
  solutionMode,
}: {
  actionVerb: string;
  label: string;
  fallback: string;
  solutionMode: boolean;
}) {
  return solutionMode ? `${actionVerb} a solution-only ${label.toLowerCase()} here` : fallback;
}
