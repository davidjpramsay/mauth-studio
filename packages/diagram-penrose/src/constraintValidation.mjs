import { evalFns, optimize, prettyPrintFn, resample, showError } from "@penrose/core";

const CONSTRAINT_TOLERANCE = 0.001;
const MAX_LAYOUT_ATTEMPTS = 8;
export const UNSATISFIED_LAYOUT_MESSAGE =
  "No layout satisfying the geometry constraints could be found. Try Resample again or review the construction.";

function inspectConstraints(state, standardGeometryStyle) {
  const { constrEngs } = evalFns(state);
  const active = state.constraintSets.get(state.optStages[state.currentStageIndex]).constrMask;
  const constraints = state.constrFns.flatMap((fn, index) => {
    if (!active[index]) return [];
    const description = prettyPrintFn(fn);
    // The school preset's label-clearance rules are layout preferences. Fixed
    // label placements can make these impossible even in exact constructions;
    // report them separately, never relax mathematical relationships or custom
    // Style constraints. Saved teacher label offsets are applied after solving.
    const labelLayoutPreference =
      standardGeometryStyle && /^(disjoint|onCanvas)\(/.test(description) && /\.(labelText|text)\b/.test(description);
    const residual = constrEngs[index];
    return [{ description, residual, violation: Math.max(0, residual), labelLayoutPreference }];
  });
  const required = constraints.filter((entry) => !entry.labelLayoutPreference);
  const finite = state.varyingValues.every(Number.isFinite) && constraints.every((entry) => Number.isFinite(entry.residual));
  const maxViolation = Math.max(0, ...required.map((entry) => entry.violation));
  return {
    valid: finite && maxViolation <= CONSTRAINT_TOLERANCE,
    checkedConstraints: required.length,
    maxViolation,
    labelLayoutWarnings: constraints
      .filter((entry) => entry.labelLayoutPreference && entry.violation > CONSTRAINT_TOLERANCE)
      .map(({ description, violation }) => ({ description, violation })),
  };
}

export async function optimizeValidatedLayout(compiled, { standardGeometryStyle = false, rankCandidate } = {}) {
  const requestedVariation = compiled.variation;
  let optimizerError;
  let best;
  let candidatesEvaluated = 0;
  for (let attempt = 0; attempt < MAX_LAYOUT_ATTEMPTS; attempt++) {
    const resolvedVariation = attempt === 0 ? requestedVariation : `${requestedVariation}::mauth-constraint-retry-${attempt}`;
    const initial = attempt === 0 ? compiled : resample({ ...compiled, variation: resolvedVariation });
    const optimized = optimize(initial);
    if (optimized.isErr()) {
      optimizerError = showError(optimized.error);
      continue;
    }
    const inspection = inspectConstraints(optimized.value, standardGeometryStyle);
    if (inspection.valid) {
      candidatesEvaluated++;
      const ranked = rankCandidate ? await rankCandidate(optimized.value) : undefined;
      const candidate = {
        ranked,
        state: optimized.value,
        validation: {
          status: "satisfied",
          scope: "activeSolverConstraints",
          tolerance: CONSTRAINT_TOLERANCE,
          checkedConstraints: inspection.checkedConstraints,
          maxViolation: inspection.maxViolation,
          labelLayoutWarnings: inspection.labelLayoutWarnings,
          attempts: attempt + 1,
          requestedVariation,
          resolvedVariation,
        },
      };
      if (!rankCandidate) return candidate;
      if (!best || ranked.score < best.ranked.score) best = candidate;
      if (attempt >= 2 && best.ranked.score === 0) break;
    }
  }
  if (best) return { ...best, validation: { ...best.validation, candidatesEvaluated } };
  throw new Error(UNSATISFIED_LAYOUT_MESSAGE, optimizerError ? { cause: optimizerError } : undefined);
}
