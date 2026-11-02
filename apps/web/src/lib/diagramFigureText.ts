import type { GraphConfig } from "@mauth-studio/shared";

export function diagramTitle(config: GraphConfig): string {
  if (typeof config.title === "string") return config.title;
  const data = config.data as Record<string, unknown> | undefined;
  return config.type === "statsChart" && typeof data?.title === "string" ? data.title : "";
}

export function diagramFigureTextPatch(config: GraphConfig, patch: { title?: string; caption?: string }): Partial<GraphConfig> {
  return {
    ...patch,
    ...(patch.title !== undefined && config.type === "statsChart" && config.data ? { data: { ...config.data, title: "" } } : {}),
  };
}
