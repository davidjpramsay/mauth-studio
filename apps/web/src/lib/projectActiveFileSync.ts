import type { ProjectFileSummary } from "@mauth-studio/shared";

export type ActiveProjectFileSyncOutcome = "skipped" | "current" | "reloaded" | "conflict" | "missing" | "unavailable" | "reload-failed";

export type ActiveProjectFileSyncPlan =
  | { kind: "current"; remoteRevision: number }
  | { kind: "reload"; remoteRevision: number }
  | { kind: "conflict"; remoteRevision: number }
  | { kind: "missing" };

export function activeProjectFileSyncPlan({
  summary,
  localRevision,
  dirty,
}: {
  summary: ProjectFileSummary | undefined;
  localRevision: number | null;
  dirty: boolean;
}): ActiveProjectFileSyncPlan {
  if (!summary || summary.kind !== "file") return { kind: "missing" };
  if (typeof localRevision === "number" && summary.revision <= localRevision) {
    return { kind: "current", remoteRevision: summary.revision };
  }
  if (dirty) return { kind: "conflict", remoteRevision: summary.revision };
  return { kind: "reload", remoteRevision: summary.revision };
}

export interface ActiveProjectFileSyncAttempt {
  outcome: ActiveProjectFileSyncOutcome;
  unavailable: boolean;
  becameUnavailable: boolean;
  recovered: boolean;
  error?: unknown;
}

function outcomeConfirmsAvailableFile(outcome: ActiveProjectFileSyncOutcome) {
  return outcome === "current" || outcome === "reloaded";
}

export async function runActiveProjectFileSyncAttempt({
  wasUnavailable,
  sync,
}: {
  wasUnavailable: boolean;
  sync: () => ActiveProjectFileSyncOutcome | Promise<ActiveProjectFileSyncOutcome>;
}): Promise<ActiveProjectFileSyncAttempt> {
  try {
    const outcome = await sync();
    if (outcome === "skipped") {
      return {
        outcome,
        unavailable: wasUnavailable,
        becameUnavailable: false,
        recovered: false,
      };
    }

    const unavailable = outcome === "unavailable";
    return {
      outcome,
      unavailable,
      becameUnavailable: unavailable && !wasUnavailable,
      recovered: wasUnavailable && outcomeConfirmsAvailableFile(outcome),
    };
  } catch (error) {
    return {
      outcome: "unavailable",
      unavailable: true,
      becameUnavailable: !wasUnavailable,
      recovered: false,
      error,
    };
  }
}
