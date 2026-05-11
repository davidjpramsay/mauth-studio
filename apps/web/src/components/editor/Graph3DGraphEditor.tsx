import type { GraphConfig } from "@mauth-studio/shared";

import { Button } from "@/components/ui/button";
import { DEFAULT_3D_GRAPH, DEFAULT_3D_VIEW_STATE, graph3dViewState, type Graph3DViewState } from "@/lib/diagram3d";

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function numberInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

type Graph3DGraphEditorProps = {
  config: GraphConfig;
  onChange: (patch: Partial<GraphConfig>) => void;
};

export function Graph3DGraphEditor({ config, onChange }: Graph3DGraphEditorProps) {
  const view = graph3dViewState(config);
  const updateView = (patch: Partial<Graph3DViewState>) =>
    onChange({
      metadata: {
        ...(config.metadata ?? {}),
        view3d: {
          ...view,
          ...patch,
        },
      },
    });
  const resetView = () =>
    onChange({
      metadata: {
        ...(config.metadata ?? {}),
        view3d: DEFAULT_3D_VIEW_STATE,
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Diagram width
          <input
            type="number"
            min={240}
            step={20}
            value={numberInputValue(config.widthPx)}
            onChange={(event) => onChange({ widthPx: optionalNumber(event.target.value) ?? DEFAULT_3D_GRAPH.widthPx })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Diagram height
          <input
            type="number"
            min={180}
            step={20}
            value={numberInputValue(config.heightPx)}
            onChange={(event) => onChange({ heightPx: optionalNumber(event.target.value) ?? DEFAULT_3D_GRAPH.heightPx })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
      </section>

      <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Azimuth
          <input
            type="number"
            step={0.05}
            value={numberInputValue(view.az)}
            onChange={(event) => updateView({ az: optionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.az })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Elevation
          <input
            type="number"
            step={0.05}
            value={numberInputValue(view.el)}
            onChange={(event) => updateView({ el: optionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.el })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Bank
          <input
            type="number"
            step={0.05}
            value={numberInputValue(view.bank)}
            onChange={(event) => updateView({ bank: optionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.bank })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <Button type="button" variant="outline" className="self-end" onClick={resetView}>
          Reset view
        </Button>
      </section>
    </div>
  );
}
