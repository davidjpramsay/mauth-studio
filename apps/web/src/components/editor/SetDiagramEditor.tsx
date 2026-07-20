import type { GraphConfig } from "@mauth-studio/shared";

import { CollapsiblePanel } from "@/components/editor/EditorPanels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PENROSE_SCALE_PERCENT, penroseOptions, penroseScalePercent, removePenroseSubstanceOverride } from "@/lib/diagramPenrose";
import {
  DEFAULT_SET_DATA,
  DEFAULT_THREE_SET_DATA,
  generatedSetPenroseSubstance,
  normalizedSetDiagramData,
  setDiagramCountLabels,
  setDiagramNotationLabel,
  setDiagramRegionEditorLabels,
  setDiagramRegionNameAt,
  setDiagramSetTotalLabels,
} from "@/lib/diagramSet";

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
  showSolutions?: boolean;
  onChange: (patch: Partial<GraphConfig>) => void;
};

export function SetDiagramEditor({ config, showSolutions = true, settingsMode = "inline", onChange }: SetDiagramEditorProps) {
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
  const switchSetCount = (setCount: 2 | 3) => {
    const defaults = setCount === 3 ? DEFAULT_THREE_SET_DATA : DEFAULT_SET_DATA;
    patchSetData({
      ...data,
      setCount,
      sets: defaults.sets.map((fallback, index) => ({
        ...fallback,
        ...(data.sets[index] ?? {}),
        countLabel: data.sets[index]?.countLabel ?? "",
      })),
      regions: defaults.regions.map((region) => ({ ...region, shaded: false })),
    });
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
      regions: data.regions.map((region, index) =>
        index === regionIndex
          ? {
              ...region,
              ...patch,
              ...(showSolutions && patch.solutionOnly === undefined ? { solutionOnly: true } : {}),
            }
          : region,
      ),
    });
  };
  const applyNotationLabels = () => {
    patchSetData({
      ...data,
      regions: data.regions.map((region, index) => ({
        ...region,
        label: setDiagramNotationLabel(setDiagramRegionNameAt(data.setCount, index, region.name), data.sets),
      })),
    });
  };
  const regionCountLabels = setDiagramCountLabels(data.setCount);
  const regionEditorLabels = setDiagramRegionEditorLabels(data.setCount);
  const shadingOptions = [
    { label: "None", regionIndex: null },
    ...regionEditorLabels.map((label, index) => ({ label, regionIndex: index })),
  ];
  const applyCountLabels = (includeTotals: boolean) => {
    patchSetData({
      ...data,
      universe: { ...data.universe, countLabel: includeTotals ? "30" : "" },
      sets: data.sets.map((set, index) => ({ ...set, countLabel: includeTotals ? setDiagramSetTotalLabels(data.setCount)[index] : "" })),
      regions: data.regions.map((region, index) => ({
        ...region,
        label: regionCountLabels[index] ?? "",
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
          <Button
            type="button"
            variant={data.setCount === 2 ? "default" : "outline"}
            className="self-end"
            onClick={() => switchSetCount(2)}
          >
            2 sets
          </Button>
          <Button
            type="button"
            variant={data.setCount === 3 ? "default" : "outline"}
            className="self-end"
            onClick={() => switchSetCount(3)}
          >
            3 sets
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

      <section className="grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-4">
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
        {data.setCount === 3 ? (
          <label className="flex flex-col gap-2 text-xs font-medium">
            C label
            <input
              value={String(data.sets[2]?.label ?? "")}
              onChange={(event) => updateSet(2, { label: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional totals</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
          {data.setCount === 3 ? (
            <label className="flex flex-col gap-2 text-xs font-medium">
              C total box
              <input
                value={String(data.sets[2]?.countLabel ?? "")}
                onChange={(event) => updateSet(2, { countLabel: event.target.value })}
                placeholder="optional"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regions</div>
          {showInlineSettings ? (
            <div className="flex flex-wrap gap-2">
              {shadingOptions.map((option) => (
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
          {data.regions
            .map((region, regionIndex) => ({ region, regionIndex }))
            .filter(({ region }) => showSolutions || region.solutionOnly !== true)
            .map(({ region, regionIndex }) => (
              <div
                key={region.name ?? regionIndex}
                data-penrose-item-kind="region"
                data-penrose-item-id={region.name}
                data-solution-only={region.solutionOnly === true ? "true" : undefined}
                className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {regionEditorLabels[regionIndex]}
                    {region.solutionOnly === true ? <Badge variant="outline">Solution</Badge> : null}
                  </span>
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={region.solutionOnly === true}
                      aria-label={`${regionEditorLabels[regionIndex]} show in solutions only`}
                      onChange={(event) => updateRegion(regionIndex, { solutionOnly: event.target.checked })}
                    />
                    Show in solutions only
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_100px] sm:items-end">
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
