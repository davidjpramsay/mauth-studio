import type { GraphConfig } from "@mauth-studio/shared";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { diagramFigureTextPatch, diagramTitle } from "@/lib/diagramFigureText";

export function DiagramFigureTextEditor({
  label,
  config,
  onChange,
}: {
  label: string;
  config: GraphConfig;
  onChange: (patch: Partial<GraphConfig>) => void;
}) {
  const [open, setOpen] = useState(Boolean(diagramTitle(config) || config.caption));
  return (
    <details className="mb-3 rounded-md border p-3" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-xs font-semibold">Title and caption</summary>
      <div className="mt-3 grid gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Title (above)
          <Textarea
            aria-label={`${label} title above`}
            value={diagramTitle(config)}
            onChange={(event) => onChange(diagramFigureTextPatch(config, { title: event.target.value }))}
            className="min-h-16 text-sm font-normal"
            placeholder="Optional centred title"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Caption (below)
          <Textarea
            aria-label={`${label} caption below`}
            value={config.caption ?? ""}
            onChange={(event) => onChange(diagramFigureTextPatch(config, { caption: event.target.value }))}
            className="min-h-16 text-sm font-normal"
            placeholder="Optional caption or diagram label"
          />
        </label>
        <p className="text-xs text-muted-foreground">Use $...$ for mathematics. Leave blank to hide.</p>
      </div>
    </details>
  );
}
