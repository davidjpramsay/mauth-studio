import type { ProjectSummary } from "@mauth-studio/shared";

export function desktopDocumentPath(project: ProjectSummary | null, filePath: string | null) {
  if (!project?.documentsPath || !filePath?.startsWith("tests/")) return null;
  return `${project.documentsPath.replace(/[\\/]+$/, "")}/${filePath.slice(6)}`;
}
