import { useCallback, useMemo, useState } from "react";

import {
  previewPaginationReportsEqual,
  previewReadinessWarnings,
  type PreviewCopyMode,
  type PreviewPaginationReport,
} from "@/lib/previewPagination";

interface PreviewReadinessState {
  documentKey: string;
  reports: Partial<Record<PreviewCopyMode, PreviewPaginationReport>>;
}

export function usePreviewReadinessController({ documentKey, activeMode }: { documentKey: string; activeMode: PreviewCopyMode }) {
  const [state, setState] = useState<PreviewReadinessState>({ documentKey, reports: {} });
  const reports = useMemo(() => (state.documentKey === documentKey ? state.reports : {}), [documentKey, state]);

  const onPaginationReport = useCallback(
    (report: PreviewPaginationReport) => {
      setState((current) => {
        const currentReports = current.documentKey === documentKey ? current.reports : {};
        if (previewPaginationReportsEqual(currentReports[report.mode] ?? null, report)) return current;
        return {
          documentKey,
          reports: { ...currentReports, [report.mode]: report },
        };
      });
    },
    [documentKey],
  );

  const warnings = useMemo(
    () => (["student", "solutions"] as const).flatMap((mode) => previewReadinessWarnings(reports[mode] ?? null)),
    [reports],
  );
  const activeReport = reports[activeMode] ?? null;
  const activeWarnings = useMemo(() => previewReadinessWarnings(activeReport), [activeReport]);

  return {
    activeReport,
    activeWarnings,
    reports,
    warnings,
    onPaginationReport,
  };
}
