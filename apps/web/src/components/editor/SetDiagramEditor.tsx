import type { GraphConfig } from "@mauth-studio/shared";

import { CollapsiblePanel } from "@/components/editor/EditorPanels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PENROSE_SCALE_PERCENT, penroseOptions, penroseScalePercent, removePenroseSubstanceOverride } from "@/lib/diagramPenrose";
import { generatedSetPenroseSubstance, normalizedSetDiagramData } from "@/lib/diagramSet";

const SET_REGION_EDITOR_LABELS = ["A only", "A and B", "B only", "Outside"] as const;
const SET_REGION_COUNT_LABELS = ["8", "10", "6", "6"] as const;
const SET_SHADING_OPTIONS: Array<{ label: string; regionIndex: number | null }> = [
  { label: "None", regionIndex: null },
  { label: "A only", regionIndex: 0 },
  { label: "A and B", regionIndex: 1 },
  { label: "B only", regionIndex: 2 },
  { label: "Outside", regionIndex: 3 },
];

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function numberInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function setPenroseSubstanceSource(config: GraphConfig) {
  const value = config.options?.substanceSource;
  return typeof value === "string" && value.trim() ? value : generatedSetPenroseSubstance(config);
}

type SetDiagramEditorProps = {
  config: GraphConfig;
  settingsMode?: "inline" | "inspector";
  onChange: (patch: Partial<GraphConfig>) => void;
};

export function SetDiagramEditor({ config, settingsMode = "inline", onChange }: SetDiagramEditorProps) {
  const scalePercent = penroseScalePercent(config);
  const data = normalizedSetDiagramData(config);
  const hasSubstanceOverride = typeof config.options?.substanceSource === "string" && config.options.substanceSource.trim().length > 0;
  const showInlineSettings = settingsMode === "inline";
  const patchSetData = (nextData: typeof data) => {
    onChange({
      data: nextData,
      options: removePenroseSubstanceOverride(config),
      widthPx: undefined,
      heightPx: undefined,
    });
  };
  const updateScale = (value: number) =>
    onChange({
      scalePercent: value,
      options: { ...penroseOptions(config), scalePercent: value },
      widthPx: undefined,
      heightPx: undefined,
    });
  const updateUniverse = (patch: Partial<(typeof data)["universe"]>) => {
    patchSetData({ ...data, universe: { ...data.universe, ...patch } });
  };
  const updateSet = (setIndex: number, patch: Partial<(typeof data)["sets"][number]>) => {
    patchSetData({
      ...data,
      sets: data.sets.map((set, index) => (index === setIndex ? { ...set, ...patch } : set)),
    });
  };
  const updateRegion = (regionIndex: number, patch: Partial<(typeof data)["regions"][number]>) => {
    patchSetData({
      ...data,
      regions: data.regions.map((region, index) => (index === regionIndex ? { ...region, ...patch } : region)),
    });
  };
  const applyNotationLabels = () => {
    const [leftSet, rightSet] = data.sets;
    patchSetData({
      ...data,
      regions: data.regions.map((region, index) => ({
        ...region,
        label:
          index === 0
            ? `${leftSet.name} \\cap ${rightSet.name}'`
            : index === 1
              ? `${leftSet.name} \\cap ${rightSet.name}`
              : index === 2
                ? `${leftSet.name}' \\cap ${rightSet.name}`
                : `(${leftSet.name} \\cup ${rightSet.name})'`,
      })),
    });
  };
  const applyCountLabels = (includeTotals: boolean) => {
    patchSetData({
      ...data,
      universe: { ...data.universe, countLabel: includeTotals ? "30" : "" },
      sets: data.sets.map((set, index) => ({ ...set, countLabel: includeTotals ? (index === 0 ? "18" : "16") : "" })),
      regions: data.regions.map((region, index) => ({
        ...region,
        label: SET_REGION_COUNT_LABELS[index] ?? "",
      })),
    });
  };
  const clearShading = () => {
    patchSetData({
      ...data,
      regions: data.regions.map((region) => ({ ...region, shaded: false })),
    });
  };
  const setSingleShadedRegion = (regionIndex: number | null) => {
    patchSetData({
      ...data,
      regions: data.regions.map((region, index) => ({ ...region, shaded: regionIndex === index })),
    });
  };
  const updateSubstance = (value: string) =>
    onChange({
      options: { ...penroseOptions(config), substanceSource: value },
      widthPx: undefined,
      heightPx: undefined,
    });

  return (
    <div className="flex flex-col gap-4">
      {showInlineSettings ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-36 flex-col gap-2 text-xs font-medium">
            Diagram scale
            <input
              type="number"
              min={25}
              max={250}
              step={1}
              value={numberInputValue(scalePercent)}
              onChange={(event) => updateScale(optionalNumber(event.target.value) ?? DEFAULT_PENROSE_SCALE_PERCENT)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <Button type="button" variant="outline" className="self-end" onClick={() => updateScale(DEFAULT_PENROSE_SCALE_PERCENT)}>
            Original
          </Button>
          <Button type="button" variant="outline" className="self-end" onClick={applyNotationLabels}>
            Set notation
          </Button>
          <Button type="button" variant="outline" className="self-end" onClick={() => applyCountLabels(false)}>
            Counts
          </Button>
          <Button type="button" variant="outline" className="self-end" onClick={() => applyCountLabels(true)}>
            Counts + totals
          </Button>
        </div>
      ) : null}

      {hasSubstanceOverride ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This Venn diagram has custom Substance. Changing the controls below will clear that Substance override and return to structured
          Venn diagram data.
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Universe label
          <input
            value={String(data.universe.label ?? "")}
            onChange={(event) => updateUniverse({ label: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          A label
          <input
            value={String(data.sets[0]?.label ?? "")}
            onChange={(event) => updateSet(0, { label: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          B label
          <input
            value={String(data.sets[1]?.label ?? "")}
            onChange={(event) => updateSet(1, { label: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional totals</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-xs font-medium">
            U total box
            <input
              value={String(data.universe.countLabel ?? "")}
              onChange={(event) => updateUniverse({ countLabel: event.target.value })}
              placeholder="optional"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            A total tab
            <input
              value={String(data.sets[0]?.countLabel ?? "")}
              onChange={(event) => updateSet(0, { countLabel: event.target.value })}
              placeholder="optional"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            B total tab
            <input
              value={String(data.sets[1]?.countLabel ?? "")}
              onChange={(event) => updateSet(1, { countLabel: event.target.value })}
              placeholder="optional"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regions</div>
          {showInlineSettings ? (
            <div className="flex flex-wrap gap-2">
              {SET_SHADING_OPTIONS.map((option) => (
                <Button
                  key={`${option.label}-${option.regionIndex ?? "none"}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => (option.regionIndex === null ? clearShading() : setSingleShadedRegion(option.regionIndex))}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.regions.map((region, regionIndex) => (
            <div
              key={region.name ?? regionIndex}
              className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-[90px_minmax(0,1fr)_90px] md:items-end"
            >
              <div className="text-sm font-medium">{SET_REGION_EDITOR_LABELS[regionIndex]}</div>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Label or count
                <input
                  value={String(region.label ?? "")}
                  onChange={(event) => updateRegion(regionIndex, { label: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={region.shaded === true}
                  onChange={(event) => updateRegion(regionIndex, { shaded: event.target.checked })}
                />
                Shaded
              </label>
            </div>
          ))}
        </div>
      </section>

      <CollapsiblePanel title="Advanced Substance" defaultOpen={false} className="bg-muted/20">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Substance
          <Textarea
            key={`set-substance-${setPenroseSubstanceSource(config)}`}
            defaultValue={setPenroseSubstanceSource(config)}
            className="min-h-40 font-mono text-xs"
            spellCheck={false}
            onBlur={(event) => updateSubstance(event.currentTarget.value)}
          />
        </label>
      </CollapsiblePanel>
    </div>
  );
}
