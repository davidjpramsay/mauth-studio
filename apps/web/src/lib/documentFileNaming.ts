import type { MauthProjectFileType } from "@mauth-studio/shared";

import { safeProjectFileName } from "./projectFiles.ts";

export interface DocumentFileNamingFrontMatter {
  titlePageTemplate?: string;
  subjectTitle?: string;
  assessmentTitle?: string;
}

function trimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function projectFileTypeForFrontMatter(frontMatter: DocumentFileNamingFrontMatter): MauthProjectFileType {
  if (frontMatter.titlePageTemplate === "notes") return "notes";
  if (frontMatter.titlePageTemplate === "worksheet") return "worksheet";
  return "test";
}

export function defaultSavedTestName(frontMatter: DocumentFileNamingFrontMatter) {
  const name = [trimmedText(frontMatter.subjectTitle), trimmedText(frontMatter.assessmentTitle)].filter(Boolean).join(" - ");
  return name || "Untitled test";
}

export function printFileNameForDocument(frontMatter: DocumentFileNamingFrontMatter, baseName: string, showSolutions: boolean) {
  const cleanBaseName = safeProjectFileName(baseName || defaultSavedTestName(frontMatter));
  if (frontMatter.titlePageTemplate === "notes") return cleanBaseName;
  return `${cleanBaseName} - ${showSolutions ? "Solutions" : "Student"}`;
}
