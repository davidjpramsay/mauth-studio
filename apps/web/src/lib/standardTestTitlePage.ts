import type { StandardTestTitlePageConfig } from "@mauth-studio/shared";

import type { FrontMatterConfig } from "./frontMatterConfig.ts";

export type StandardSectionTitlePageConfig = StandardTestTitlePageConfig;

export interface StandardSectionTitlePageHeadingLike {
  title: string;
  titlePage?: StandardSectionTitlePageConfig;
}

const STRING_FIELDS = [
  "nameLabel",
  "markLabel",
  "declarationTitle",
  "declarationBody",
  "signatureLabel",
  "signatureRole",
  "instructionsTitle",
  "instructionsBody",
] as const satisfies ReadonlyArray<keyof StandardSectionTitlePageConfig>;

const BOOLEAN_FIELDS = ["showAssessmentSubtitle", "showDeclaration", "showInstructions"] as const satisfies ReadonlyArray<
  keyof StandardSectionTitlePageConfig
>;

const SHARED_FIELDS = ["logoId", "schoolName", "subjectTitle", "assessmentTitle", "startQuestionNumber"] as const satisfies ReadonlyArray<
  keyof FrontMatterConfig
>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function normalizeStandardSectionTitlePage(value: unknown): StandardSectionTitlePageConfig | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const normalized: StandardSectionTitlePageConfig = {};
  STRING_FIELDS.forEach((field) => {
    if (typeof record[field] === "string") normalized[field] = record[field];
  });
  BOOLEAN_FIELDS.forEach((field) => {
    if (typeof record[field] === "boolean") normalized[field] = record[field];
  });
  return Object.keys(normalized).length ? normalized : undefined;
}

export function standardSectionTitlePageFrontMatter(
  frontMatter: FrontMatterConfig,
  heading: StandardSectionTitlePageHeadingLike,
): FrontMatterConfig {
  return {
    ...frontMatter,
    ...heading.titlePage,
    assessmentSubtitle: heading.title || "Section",
    showAssessmentSubtitle: heading.titlePage?.showAssessmentSubtitle ?? true,
  };
}

export function standardSectionTitlePageChange(
  heading: StandardSectionTitlePageHeadingLike,
  patch: Partial<FrontMatterConfig>,
): {
  sharedPatch: Partial<FrontMatterConfig>;
  headingPatch: Partial<StandardSectionTitlePageHeadingLike>;
} {
  const sharedPatch: Partial<FrontMatterConfig> = {};
  SHARED_FIELDS.forEach((field) => {
    if (field in patch) Object.assign(sharedPatch, { [field]: patch[field] });
  });

  const titlePagePatch: StandardSectionTitlePageConfig = {};
  STRING_FIELDS.forEach((field) => {
    if (field in patch && typeof patch[field] === "string") Object.assign(titlePagePatch, { [field]: patch[field] });
  });
  BOOLEAN_FIELDS.forEach((field) => {
    if (field in patch && typeof patch[field] === "boolean") Object.assign(titlePagePatch, { [field]: patch[field] });
  });

  const headingPatch: Partial<StandardSectionTitlePageHeadingLike> = {};
  if (typeof patch.assessmentSubtitle === "string") headingPatch.title = patch.assessmentSubtitle;
  if (Object.keys(titlePagePatch).length) headingPatch.titlePage = { ...heading.titlePage, ...titlePagePatch };
  return { sharedPatch, headingPatch };
}
