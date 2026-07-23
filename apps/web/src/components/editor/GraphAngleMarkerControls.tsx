import type { GraphFeature } from "@mauth-studio/shared";

import { graphAngleMarkerSegmentIds, graphLineSegmentsShareEndpoint } from "../../lib/graphFeatureGeometry";
import { cn } from "../../lib/utils";

interface GraphAngleMarkerControlsProps {
  feature: GraphFeature;
  features: readonly GraphFeature[];
  variant: "inline" | "inspector";
  ariaPrefix: string;
  controlClassName: string;
  checkboxLabelClassName?: string;
  onChange: (patch: Partial<GraphFeature>) => void;
}

function lineSegmentOptions(features: readonly GraphFeature[]) {
  return features.flatMap((feature, index) => {
    if (feature.kind !== "line_segment") return [];
    const id = feature.id?.trim() || `feature-${index}`;
    const label = feature.label?.trim();
    return [{ id, label: label ? `Line segment ${index + 1}: ${label}` : `Line segment ${index + 1}` }];
  });
}

export function GraphAngleMarkerControls({
  feature,
  features,
  variant,
  ariaPrefix,
  controlClassName,
  checkboxLabelClassName,
  onChange,
}: GraphAngleMarkerControlsProps) {
  const segmentOptions = lineSegmentOptions(features);
  const references = graphAngleMarkerSegmentIds(feature, features);
  const firstSegmentId = references?.firstSegmentId ?? feature.firstSegmentId ?? "";
  const secondSegmentId = references?.secondSegmentId ?? feature.secondSegmentId ?? "";
  const applyPatch = (patch: Partial<GraphFeature>) => onChange({ ...(references ?? {}), ...patch });
  const labelClassName =
    variant === "inspector"
      ? "flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground"
      : "flex flex-col gap-2 text-xs font-medium";

  return (
    <div className={variant === "inspector" ? "grid grid-cols-2 gap-2 border-t pt-2" : "graph-auto-grid mt-2 border-t pt-2"}>
      <label
        className={cn(variant === "inspector" ? checkboxLabelClassName : "flex items-center gap-2 text-xs font-medium", "col-span-full")}
      >
        <input
          type="checkbox"
          checked={feature.rightAngle === true}
          aria-label={`${ariaPrefix} right angle`}
          onChange={(event) => applyPatch({ rightAngle: event.target.checked })}
          className={variant === "inline" ? "size-4" : undefined}
        />
        Right angle square
      </label>
      <label className={labelClassName}>
        First segment
        <select
          value={firstSegmentId}
          aria-label={`${ariaPrefix} first segment`}
          onChange={(event) => {
            const nextId = event.target.value || undefined;
            onChange({
              firstSegmentId: nextId,
              secondSegmentId: nextId && nextId === secondSegmentId ? undefined : secondSegmentId || undefined,
            });
          }}
          className={controlClassName}
        >
          <option value="">Select segment</option>
          {segmentOptions.map((option) => (
            <option
              key={option.id}
              value={option.id}
              disabled={
                option.id === secondSegmentId ||
                (Boolean(secondSegmentId) && !graphLineSegmentsShareEndpoint(features, option.id, secondSegmentId))
              }
            >
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClassName}>
        Second segment
        <select
          value={secondSegmentId}
          aria-label={`${ariaPrefix} second segment`}
          onChange={(event) => {
            const nextId = event.target.value || undefined;
            onChange({
              firstSegmentId: nextId && nextId === firstSegmentId ? undefined : firstSegmentId || undefined,
              secondSegmentId: nextId,
            });
          }}
          className={controlClassName}
        >
          <option value="">Select segment</option>
          {segmentOptions.map((option) => (
            <option
              key={option.id}
              value={option.id}
              disabled={
                option.id === firstSegmentId ||
                (Boolean(firstSegmentId) && !graphLineSegmentsShareEndpoint(features, firstSegmentId, option.id))
              }
            >
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClassName}>
        Radius
        <input
          type="number"
          min={0.05}
          step={1}
          value={typeof feature.size === "number" && Number.isFinite(feature.size) ? feature.size : ""}
          aria-label={`${ariaPrefix} radius`}
          onChange={(event) => applyPatch({ size: event.target.value === "" ? undefined : Number(event.target.value) })}
          className={controlClassName}
        />
      </label>
    </div>
  );
}
