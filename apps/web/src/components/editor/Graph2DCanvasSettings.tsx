import type { GraphConfig } from "@mauth-studio/shared";

import { graphHeight, lockedAspectHeight } from "@/lib/diagramGraph2d";
import { graphInspectorWidthPatch } from "@/lib/moduleSettingsPatches";
import { GraphAxisArrowControls } from "./GraphAxisArrowControls";
import { NumericExpressionInput } from "./NumericExpressionInput";

interface Graph2DCanvasSettingsProps {
  blockLabel: string;
  config: GraphConfig;
  controlClassName: string;
  checkboxLabelClassName: string;
  onChange: (patch: Partial<GraphConfig>) => void;
}

const sectionClassName = "border-t pt-3 first:border-t-0 first:pt-0";
const summaryClassName = "cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const fieldClassName = "flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground";

export function Graph2DCanvasSettings({
  blockLabel,
  config,
  controlClassName,
  checkboxLabelClassName,
  onChange,
}: Graph2DCanvasSettingsProps) {
  return (
    <div className="space-y-3">
      <details open className={sectionClassName}>
        <summary className={summaryClassName}>Axes</summary>
        <div className="mt-3 space-y-3">
          <label className={checkboxLabelClassName}>
            <input type="checkbox" checked={config.showAxes ?? true} onChange={(event) => onChange({ showAxes: event.target.checked })} />
            Show axes
          </label>
          <GraphAxisArrowControls config={config} onChange={onChange} />
          <label className={checkboxLabelClassName}>
            <input
              type="checkbox"
              checked={config.showAxisLabels ?? true}
              onChange={(event) => onChange({ showAxisLabels: event.target.checked })}
            />
            Axis letters
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={checkboxLabelClassName}>
              <input
                type="checkbox"
                checked={config.showXAxisNumbers ?? config.showAxisNumbers ?? true}
                onChange={(event) => onChange({ showXAxisNumbers: event.target.checked })}
              />
              X-axis numbers
            </label>
            <label className={checkboxLabelClassName}>
              <input
                type="checkbox"
                checked={config.showYAxisNumbers ?? config.showAxisNumbers ?? true}
                onChange={(event) => onChange({ showYAxisNumbers: event.target.checked })}
              />
              Y-axis numbers
            </label>
          </div>
          <label className={checkboxLabelClassName}>
            <input
              type="checkbox"
              checked={config.showFunctionArrows ?? true}
              onChange={(event) => onChange({ showFunctionArrows: event.target.checked })}
            />
            Function arrows
          </label>
        </div>
      </details>

      <details open className={sectionClassName}>
        <summary className={summaryClassName}>View window</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={fieldClassName}>
              X min
              <NumericExpressionInput
                step={1}
                value={config.xMin}
                ariaLabel={`${blockLabel} view x minimum`}
                onValueChange={(value) => onChange({ xMin: value })}
                className={controlClassName}
              />
            </label>
            <label className={fieldClassName}>
              X max
              <NumericExpressionInput
                step={1}
                value={config.xMax}
                ariaLabel={`${blockLabel} view x maximum`}
                onValueChange={(value) => onChange({ xMax: value })}
                className={controlClassName}
              />
            </label>
            <label className={fieldClassName}>
              Y min
              <NumericExpressionInput
                step={1}
                value={config.yMin}
                ariaLabel={`${blockLabel} view y minimum`}
                onValueChange={(value) => onChange({ yMin: value })}
                className={controlClassName}
              />
            </label>
            <label className={fieldClassName}>
              Y max
              <NumericExpressionInput
                step={1}
                value={config.yMax}
                ariaLabel={`${blockLabel} view y maximum`}
                onValueChange={(value) => onChange({ yMax: value })}
                className={controlClassName}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className={fieldClassName}>
              Width
              <NumericExpressionInput
                min={240}
                step={10}
                value={config.widthPx}
                ariaLabel={`${blockLabel} graph width`}
                onValueChange={(value) =>
                  onChange(graphInspectorWidthPatch(config, value === undefined ? "" : String(value), lockedAspectHeight))
                }
                className={controlClassName}
              />
            </label>
            {config.equalScale || config.lockAspectRatio ? (
              <div className={fieldClassName}>
                Height
                <div className="flex h-9 items-center rounded-md border border-input bg-muted px-2 text-sm font-normal text-muted-foreground">
                  {Math.round(graphHeight(config))} px
                </div>
              </div>
            ) : (
              <label className={fieldClassName}>
                Height
                <NumericExpressionInput
                  min={160}
                  step={10}
                  value={config.heightPx}
                  ariaLabel={`${blockLabel} graph height`}
                  onValueChange={(value) => onChange({ heightPx: value })}
                  className={controlClassName}
                />
              </label>
            )}
          </div>
          <label className={checkboxLabelClassName}>
            <input
              type="checkbox"
              checked={(config.lockAspectRatio ?? false) && !(config.equalScale ?? false)}
              onChange={(event) =>
                onChange({
                  lockAspectRatio: event.target.checked,
                  equalScale: event.target.checked ? false : config.equalScale,
                })
              }
            />
            Lock width and height ratio
          </label>
          <label className={checkboxLabelClassName}>
            <input
              type="checkbox"
              checked={config.equalScale ?? false}
              onChange={(event) =>
                onChange({
                  equalScale: event.target.checked,
                  lockAspectRatio: event.target.checked ? false : config.lockAspectRatio,
                })
              }
            />
            Equal x and y scale
          </label>
        </div>
      </details>

      <details className={sectionClassName}>
        <summary className={summaryClassName}>Scale and grid</summary>
        <div className="mt-3 space-y-3">
          <label className={checkboxLabelClassName}>
            <input
              type="checkbox"
              checked={config.showMajorGrid ?? true}
              onChange={(event) => onChange({ showMajorGrid: event.target.checked, showGrid: true })}
            />
            Major grid
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={fieldClassName}>
              X number/grid step
              <NumericExpressionInput
                min={0.1}
                step={1}
                value={config.gridMajorStepX}
                fallbackValue={config.gridMajorStep}
                ariaLabel={`${blockLabel} x number and grid step`}
                onValueChange={(value) => onChange({ gridMajorStepX: value, axisLabelStepX: value })}
                className={controlClassName}
              />
            </label>
            <label className={fieldClassName}>
              Y number/grid step
              <NumericExpressionInput
                min={0.1}
                step={1}
                value={config.gridMajorStepY}
                fallbackValue={config.gridMajorStep}
                ariaLabel={`${blockLabel} y number and grid step`}
                onValueChange={(value) => onChange({ gridMajorStepY: value, axisLabelStepY: value })}
                className={controlClassName}
              />
            </label>
          </div>
          <label className={checkboxLabelClassName}>
            <input
              type="checkbox"
              checked={config.showMinorGrid ?? false}
              onChange={(event) => onChange({ showMinorGrid: event.target.checked, showGrid: true })}
            />
            Minor grid
          </label>
          {config.showMinorGrid ? (
            <div className="grid grid-cols-2 gap-2">
              <label className={fieldClassName}>
                X minor step
                <NumericExpressionInput
                  min={0.1}
                  step={1}
                  value={config.gridMinorStepX}
                  fallbackValue={config.gridMinorStep}
                  ariaLabel={`${blockLabel} x minor grid step`}
                  onValueChange={(value) => onChange({ gridMinorStepX: value })}
                  className={controlClassName}
                />
              </label>
              <label className={fieldClassName}>
                Y minor step
                <NumericExpressionInput
                  min={0.1}
                  step={1}
                  value={config.gridMinorStepY}
                  fallbackValue={config.gridMinorStep}
                  ariaLabel={`${blockLabel} y minor grid step`}
                  onValueChange={(value) => onChange({ gridMinorStepY: value })}
                  className={controlClassName}
                />
              </label>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
