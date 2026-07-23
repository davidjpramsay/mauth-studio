import type { FormattingConfig } from "@mauth-studio/shared";

import { DEFAULT_PAGE_FORMAT } from "./previewPageFormat.ts";

export const DEFAULT_FORMATTING_CONFIG: FormattingConfig = {
  id: "high-school-mathematics-test",
  showMarks: true,
  marksStyle: "right-aligned",
  questionSpacing: "large",
  diagramPosition: "below",
  fontSize: "12pt",
  numbering: "numeric",
  sectionHeaders: true,
  page: {
    size: "A4",
    orientation: "portrait",
    ...DEFAULT_PAGE_FORMAT,
  },
};

export const DEFAULT_WORKSHEET_FORMATTING_CONFIG: FormattingConfig = {
  ...DEFAULT_FORMATTING_CONFIG,
  id: "worksheet",
  showMarks: false,
  questionSpacing: "compact",
  fontSize: "11pt",
  sectionHeaders: false,
  page: {
    size: "A4",
    orientation: "portrait",
    ...DEFAULT_PAGE_FORMAT,
    paddingXPx: 56,
    paddingYPx: 52,
  },
};

export const DEFAULT_NOTES_FORMATTING_CONFIG: FormattingConfig = {
  ...DEFAULT_WORKSHEET_FORMATTING_CONFIG,
  id: "math-notes",
  questionSpacing: "compact",
  fontSize: "11pt",
  sectionHeaders: true,
};

export const DEFAULT_INVESTIGATION_FORMATTING_CONFIG: FormattingConfig = {
  ...DEFAULT_WORKSHEET_FORMATTING_CONFIG,
  id: "investigation",
  showMarks: true,
  questionSpacing: "compact",
  fontSize: "11pt",
  sectionHeaders: false,
  page: {
    size: "A4",
    orientation: "portrait",
    ...DEFAULT_PAGE_FORMAT,
    paddingXPx: 52,
    paddingYPx: 44,
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function finiteNumberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizePageFormattingConfig(value: unknown): NonNullable<FormattingConfig["page"]> {
  const record = asRecord(value);
  const defaultPage = DEFAULT_FORMATTING_CONFIG.page ?? {};
  return {
    size: typeof record?.size === "string" ? record.size : defaultPage.size,
    orientation: typeof record?.orientation === "string" ? record.orientation : defaultPage.orientation,
    widthPx: finiteNumberOrDefault(record?.widthPx, defaultPage.widthPx ?? DEFAULT_PAGE_FORMAT.widthPx),
    heightPx: finiteNumberOrDefault(record?.heightPx, defaultPage.heightPx ?? DEFAULT_PAGE_FORMAT.heightPx),
    paddingXPx: finiteNumberOrDefault(record?.paddingXPx, defaultPage.paddingXPx ?? DEFAULT_PAGE_FORMAT.paddingXPx),
    paddingYPx: finiteNumberOrDefault(record?.paddingYPx, defaultPage.paddingYPx ?? DEFAULT_PAGE_FORMAT.paddingYPx),
    showPageBreaks: typeof record?.showPageBreaks === "boolean" ? record.showPageBreaks : defaultPage.showPageBreaks,
  };
}

export function normalizeFormattingConfig(value: unknown): FormattingConfig {
  const record = asRecord(value);
  return {
    id: typeof record?.id === "string" ? record.id : DEFAULT_FORMATTING_CONFIG.id,
    showMarks: typeof record?.showMarks === "boolean" ? record.showMarks : DEFAULT_FORMATTING_CONFIG.showMarks,
    marksStyle: typeof record?.marksStyle === "string" ? record.marksStyle : DEFAULT_FORMATTING_CONFIG.marksStyle,
    questionSpacing: typeof record?.questionSpacing === "string" ? record.questionSpacing : DEFAULT_FORMATTING_CONFIG.questionSpacing,
    diagramPosition: typeof record?.diagramPosition === "string" ? record.diagramPosition : DEFAULT_FORMATTING_CONFIG.diagramPosition,
    fontSize: typeof record?.fontSize === "string" ? record.fontSize : DEFAULT_FORMATTING_CONFIG.fontSize,
    numbering: typeof record?.numbering === "string" ? record.numbering : DEFAULT_FORMATTING_CONFIG.numbering,
    sectionHeaders: typeof record?.sectionHeaders === "boolean" ? record.sectionHeaders : DEFAULT_FORMATTING_CONFIG.sectionHeaders,
    page: normalizePageFormattingConfig(record?.page),
  };
}

export function formattingConfigForPresetId(presetId: FormattingConfig["id"]): FormattingConfig {
  if (presetId === "worksheet") return cloneSerializable(DEFAULT_WORKSHEET_FORMATTING_CONFIG);
  if (presetId === "math-notes") return cloneSerializable(DEFAULT_NOTES_FORMATTING_CONFIG);
  if (presetId === "investigation") return cloneSerializable(DEFAULT_INVESTIGATION_FORMATTING_CONFIG);
  return {
    ...cloneSerializable(DEFAULT_FORMATTING_CONFIG),
    id: presetId ?? DEFAULT_FORMATTING_CONFIG.id,
  };
}
