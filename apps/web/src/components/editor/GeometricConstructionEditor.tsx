import type { GraphConfig } from "@mauth-studio/shared";
import { Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NumericExpressionInput } from "@/components/editor/NumericExpressionInput";
import { Textarea } from "@/components/ui/textarea";
import { PenroseSolutionElementsEditor } from "@/components/editor/PenroseSolutionElementsEditor";
import { DEFAULT_PENROSE_SCALE_PERCENT, PENROSE_ORIGINAL_WIDTH, penroseOptions, penroseScalePercent } from "@/lib/diagramPenrose";

function penroseVariationId() {
  return `penrose-layout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type GeometricConstructionEditorProps = {
  config: GraphConfig;
  substanceSource: string;
  settingsMode?: "inline" | "inspector";
  showSolutions?: boolean;
  onChange: (patch: Partial<GraphConfig>) => void;
};

export function GeometricConstructionEditor({
  config,
  substanceSource,
  showSolutions = true,
  settingsMode = "inline",
  onChange,
}: GeometricConstructionEditorProps) {
  const scalePercent = penroseScalePercent(config);
  const showInlineSettings = settingsMode === "inline";
  const updateScale = (value: number) =>
    onChange({
      scalePercent: value,
      options: { ...penroseOptions(config), scalePercent: value },
      widthPx: undefined,
      heightPx: undefined,
    });
  const updateSubstance = (value: string) =>
    onChange({
      options: { ...penroseOptions(config), substanceSource: value },
      widthPx: undefined,
      heightPx: undefined,
    });
  const resampleLayout = () =>
    onChange({
      options: { ...penroseOptions(config), variation: penroseVariationId() },
      widthPx: undefined,
      heightPx: undefined,
    });

  return (
    <div className="flex flex-col gap-3">
      {showInlineSettings ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex w-36 flex-col gap-2 text-xs font-medium">
              Diagram scale
              <NumericExpressionInput
                min={25}
                max={250}
                step={1}
                value={scalePercent}
                ariaLabel="Geometric diagram scale"
                onValueChange={(value) => updateScale(value ?? DEFAULT_PENROSE_SCALE_PERCENT)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
            <Button type="button" variant="outline" className="self-end" onClick={() => updateScale(DEFAULT_PENROSE_SCALE_PERCENT)}>
              Original
            </Button>
            <Button type="button" variant="outline" className="self-end" onClick={resampleLayout}>
              <Shuffle className="mr-2 size-4" />
              Resample
            </Button>
          </div>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Original construction canvas is {PENROSE_ORIGINAL_WIDTH}px wide. Scale changes display size only. Resample asks Penrose for
            another valid automatic layout.
          </p>
        </>
      ) : null}
      <PenroseSolutionElementsEditor config={config} showSolutions={showSolutions} onChange={onChange} />
      <label className="flex flex-col gap-2 text-xs font-medium">
        Substance
        <Textarea
          key={`substance-${substanceSource}`}
          defaultValue={substanceSource}
          className="min-h-40 font-mono text-xs"
          spellCheck={false}
          onBlur={(event) => updateSubstance(event.currentTarget.value)}
        />
      </label>
    </div>
  );
}
