import type { GraphConfig } from "@mauth-studio/shared";

import { graphAxisArrowPatch, graphAxisArrowVisibility, type GraphAxisArrowKey } from "../../lib/diagramGraph2d";

interface GraphAxisArrowControlsProps {
  config: GraphConfig;
  onChange: (patch: Partial<GraphConfig>) => void;
  className?: string;
}

const ARROW_CONTROLS: Array<{ key: GraphAxisArrowKey; visibilityKey: "xMin" | "xMax" | "yMin" | "yMax"; label: string }> = [
  { key: "showXAxisMinArrow", visibilityKey: "xMin", label: "x min" },
  { key: "showXAxisMaxArrow", visibilityKey: "xMax", label: "x max" },
  { key: "showYAxisMinArrow", visibilityKey: "yMin", label: "y min" },
  { key: "showYAxisMaxArrow", visibilityKey: "yMax", label: "y max" },
];

export function GraphAxisArrowControls({ config, onChange, className = "" }: GraphAxisArrowControlsProps) {
  const visibility = graphAxisArrowVisibility(config);
  return (
    <fieldset className={className}>
      <legend className="text-xs font-semibold text-muted-foreground">Axis arrowheads</legend>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {ARROW_CONTROLS.map((control) => (
          <label key={control.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={visibility[control.visibilityKey]}
              onChange={(event) => onChange(graphAxisArrowPatch(control.key, event.target.checked))}
            />
            {control.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
