import type {
  ContentBlock,
  Graph2DGeometryAngle,
  Graph2DGeometryArc,
  Graph2DGeometryDecoration,
  Graph2DGeometryPoint,
  Graph2DGeometrySegment,
  GraphConfig,
} from "@mauth-studio/shared";
import { ArrowLeft } from "lucide-react";

import {
  createGeometry2DDecoration,
  geometry2dData,
  geometry2dPatch,
  geometry2dPrimitiveAt,
  geometry2dPrimitiveTarget,
  geometry2dPrimitiveWithSolutionOnly,
  updateGeometry2DPrimitive,
  updateGeometry2DAngle,
  updateGeometry2DArc,
  updateGeometry2DDecoration,
  updateGeometry2DPoint,
  updateGeometry2DSegment,
} from "../../lib/diagramGeometry2d";
import { GRAPH_LINE_STYLES } from "../../lib/diagramGraph2d";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { geometry2dParentAnchor, geometryPointLabel, type SelectedGeometryChild } from "../../lib/geometry2dInspectorSelection";
import { graphInspectorWidthPatch, inspectorNumberInputValue, inspectorOptionalNumber } from "../../lib/moduleSettingsPatches";
import { Button } from "../ui/button";
import { NumericExpressionInput } from "./NumericExpressionInput";

function csvList(value: readonly string[] | undefined) {
  return (value ?? []).join(", ");
}

function parseCsvList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

interface Geometry2DInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramConfig: GraphConfig;
  controlClassName: string;
  checkboxLabelClassName: string;
  selectedGeometryChild: SelectedGeometryChild | null;
  activeAnchor?: string;
  onActivateAnchor?: (anchor: string) => void;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
}

export function Geometry2DInspector({
  selectedBlock,
  selectedDiagramConfig,
  controlClassName,
  checkboxLabelClassName,
  selectedGeometryChild,
  activeAnchor,
  onActivateAnchor,
  onBlockChange,
  updateGraphConfig,
}: Geometry2DInspectorProps) {
  const data = geometry2dData(selectedDiagramConfig);
  const points = data.points ?? [];
  const segments = data.segments ?? [];
  const arcs = data.arcs ?? [];
  const angles = data.angles ?? [];
  const decorations = data.decorations ?? [];
  const pointOptions = points.map((point, index) => ({ value: point.id, label: geometryPointLabel(point, index) }));
  const segmentOptions = segments.map((segment, index) => ({ value: segment.id, label: segment.id || `Segment ${index + 1}` }));
  const angleOptions = angles.map((angle, index) => ({ value: angle.id, label: angle.id || `Angle ${index + 1}` }));
  const parentAnchor = geometry2dParentAnchor(activeAnchor);
  const writeData = (nextData: ReturnType<typeof geometry2dData>) => {
    onBlockChange(selectedBlock, {
      graphConfig: updateGraphConfig(selectedDiagramConfig, geometry2dPatch(selectedDiagramConfig, nextData)),
    });
  };
  const patchPoint = (index: number, patch: Partial<Graph2DGeometryPoint>) => writeData(updateGeometry2DPoint(data, index, patch));
  const patchSegment = (index: number, patch: Partial<Graph2DGeometrySegment>) => writeData(updateGeometry2DSegment(data, index, patch));
  const patchArc = (index: number, patch: Partial<Graph2DGeometryArc>) => writeData(updateGeometry2DArc(data, index, patch));
  const patchAngle = (index: number, patch: Partial<Graph2DGeometryAngle>) => writeData(updateGeometry2DAngle(data, index, patch));
  const patchDecoration = (index: number, patch: Partial<Graph2DGeometryDecoration>) =>
    writeData(updateGeometry2DDecoration(data, index, patch));
  const updateCanvas = (patch: Partial<GraphConfig>) => {
    onBlockChange(selectedBlock, { graphConfig: updateGraphConfig(selectedDiagramConfig, patch) });
  };
  const primitiveHeader = (title: string) => (
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {parentAnchor ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onActivateAnchor?.(parentAnchor)}>
          <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
          2D diagram
        </Button>
      ) : null}
    </div>
  );
  const selectedPrimitiveTarget = selectedGeometryChild
    ? geometry2dPrimitiveTarget(selectedGeometryChild.kind, selectedGeometryChild.index)
    : null;
  const selectedPrimitive = selectedPrimitiveTarget ? geometry2dPrimitiveAt(data, selectedPrimitiveTarget) : null;
  const solutionLayerControl =
    selectedPrimitiveTarget && selectedPrimitive ? (
      <label className={checkboxLabelClassName}>
        <input
          type="checkbox"
          checked={selectedPrimitive.solutionOnly === true}
          aria-label={`${selectedBlock.label} ${selectedGeometryChild?.kind ?? "element"} solutions only`}
          onChange={(event) =>
            writeData(
              updateGeometry2DPrimitive(
                data,
                selectedPrimitiveTarget,
                geometry2dPrimitiveWithSolutionOnly(selectedPrimitive, event.target.checked),
              ),
            )
          }
          className="size-4 rounded border-input"
        />
        Show in solutions only
      </label>
    ) : null;

  if (!selectedGeometryChild) {
    return (
      <div className="space-y-3 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2D diagram settings</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            x min
            <input
              type="number"
              step={1}
              value={inspectorNumberInputValue(selectedDiagramConfig.xMin)}
              aria-label={`${selectedBlock.label} 2D diagram x min`}
              onChange={(event) => updateCanvas({ xMin: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            x max
            <input
              type="number"
              step={1}
              value={inspectorNumberInputValue(selectedDiagramConfig.xMax)}
              aria-label={`${selectedBlock.label} 2D diagram x max`}
              onChange={(event) => updateCanvas({ xMax: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            y min
            <input
              type="number"
              step={1}
              value={inspectorNumberInputValue(selectedDiagramConfig.yMin)}
              aria-label={`${selectedBlock.label} 2D diagram y min`}
              onChange={(event) => updateCanvas({ yMin: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            y max
            <input
              type="number"
              step={1}
              value={inspectorNumberInputValue(selectedDiagramConfig.yMax)}
              aria-label={`${selectedBlock.label} 2D diagram y max`}
              onChange={(event) => updateCanvas({ yMax: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Width
            <input
              type="number"
              min={120}
              step={10}
              value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
              aria-label={`${selectedBlock.label} 2D diagram width`}
              onChange={(event) =>
                updateCanvas(
                  graphInspectorWidthPatch(selectedDiagramConfig, event.target.value, () => selectedDiagramConfig.heightPx ?? 340),
                )
              }
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Height
            <input
              type="number"
              min={120}
              step={10}
              value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
              aria-label={`${selectedBlock.label} 2D diagram height`}
              onChange={(event) => updateCanvas({ heightPx: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
        </div>
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={selectedDiagramConfig.equalScale ?? true}
            aria-label={`${selectedBlock.label} 2D diagram equal scale`}
            onChange={(event) => updateCanvas({ equalScale: event.target.checked })}
          />
          1:1 scale
        </label>
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={selectedDiagramConfig.showGrid ?? false}
            aria-label={`${selectedBlock.label} 2D diagram guide grid`}
            onChange={(event) =>
              updateCanvas({
                showGrid: event.target.checked,
                showMajorGrid: event.target.checked,
              })
            }
          />
          Guide grid
        </label>
      </div>
    );
  }

  if (selectedGeometryChild.kind === "point") {
    const point = points[selectedGeometryChild.index];
    if (!point) return null;
    return (
      <div className="space-y-3 border-t pt-3">
        {primitiveHeader("Point")}
        {solutionLayerControl}
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={point.show ?? true}
            aria-label={`${selectedBlock.label} point ${selectedGeometryChild.index + 1} visible`}
            onChange={(event) => patchPoint(selectedGeometryChild.index, { show: event.target.checked })}
          />
          Visible
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Id
            <input
              value={point.id}
              aria-label={`${selectedBlock.label} point ${selectedGeometryChild.index + 1} id`}
              onChange={(event) => patchPoint(selectedGeometryChild.index, { id: event.target.value })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Label
            <input
              value={point.label ?? ""}
              aria-label={`${selectedBlock.label} point ${selectedGeometryChild.index + 1} label`}
              onChange={(event) => patchPoint(selectedGeometryChild.index, { label: event.target.value })}
              className={controlClassName}
            />
          </label>
          {[
            ["x", "x"],
            ["y", "y"],
            ["Label x", "labelX"],
            ["Label y", "labelY"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <NumericExpressionInput
                step={1}
                value={point[field as keyof Graph2DGeometryPoint] as number | undefined}
                ariaLabel={`${selectedBlock.label} point ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onValueChange={(value) =>
                  patchPoint(selectedGeometryChild.index, {
                    [field]: value,
                  } as Partial<Graph2DGeometryPoint>)
                }
                className={controlClassName}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Colour
            <input
              type="color"
              value={point.color ?? "#000000"}
              aria-label={`${selectedBlock.label} point ${selectedGeometryChild.index + 1} colour`}
              onChange={(event) => patchPoint(selectedGeometryChild.index, { color: event.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background p-1"
            />
          </label>
        </div>
      </div>
    );
  }

  if (selectedGeometryChild.kind === "segment") {
    const segment = segments[selectedGeometryChild.index];
    if (!segment) return null;
    return (
      <div className="space-y-3 border-t pt-3">
        {primitiveHeader("Segment")}
        {solutionLayerControl}
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={segment.show ?? true}
            aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} visible`}
            onChange={(event) => patchSegment(selectedGeometryChild.index, { show: event.target.checked })}
          />
          Visible
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Id
            <input
              value={segment.id}
              aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} id`}
              onChange={(event) => patchSegment(selectedGeometryChild.index, { id: event.target.value })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Label
            <input
              value={segment.label ?? ""}
              aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} label`}
              onChange={(event) => patchSegment(selectedGeometryChild.index, { label: event.target.value })}
              className={controlClassName}
            />
          </label>
          {[
            ["From", "from"],
            ["To", "to"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <select
                value={String(segment[field as keyof Graph2DGeometrySegment] ?? "")}
                aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) =>
                  patchSegment(selectedGeometryChild.index, { [field]: event.target.value } as Partial<Graph2DGeometrySegment>)
                }
                className={controlClassName}
              >
                {pointOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Line style
            <select
              value={segment.strokeStyle ?? "solid"}
              aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} line style`}
              onChange={(event) => patchSegment(selectedGeometryChild.index, { strokeStyle: event.target.value as "solid" | "dashed" })}
              className={controlClassName}
            >
              {GRAPH_LINE_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Weight
            <input
              type="number"
              min={0.5}
              step={1}
              value={inspectorNumberInputValue(segment.strokeWidth)}
              aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} weight`}
              onChange={(event) => patchSegment(selectedGeometryChild.index, { strokeWidth: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          {[
            ["Label x", "labelX"],
            ["Label y", "labelY"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <input
                type="number"
                step={1}
                value={inspectorNumberInputValue(segment[field as keyof Graph2DGeometrySegment] as number | undefined)}
                aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) =>
                  patchSegment(selectedGeometryChild.index, {
                    [field]: inspectorOptionalNumber(event.target.value),
                  } as Partial<Graph2DGeometrySegment>)
                }
                className={controlClassName}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Colour
            <input
              type="color"
              value={segment.color ?? "#000000"}
              aria-label={`${selectedBlock.label} segment ${selectedGeometryChild.index + 1} colour`}
              onChange={(event) => patchSegment(selectedGeometryChild.index, { color: event.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background p-1"
            />
          </label>
        </div>
      </div>
    );
  }

  if (selectedGeometryChild.kind === "arc") {
    const arc = arcs[selectedGeometryChild.index];
    if (!arc) return null;
    return (
      <div className="space-y-3 border-t pt-3">
        {primitiveHeader("Arc")}
        {solutionLayerControl}
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={arc.show ?? true}
            aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} visible`}
            onChange={(event) => patchArc(selectedGeometryChild.index, { show: event.target.checked })}
          />
          Visible
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Id
            <input
              value={arc.id}
              aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} id`}
              onChange={(event) => patchArc(selectedGeometryChild.index, { id: event.target.value })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Label
            <input
              value={arc.label ?? ""}
              aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} label`}
              onChange={(event) => patchArc(selectedGeometryChild.index, { label: event.target.value })}
              className={controlClassName}
            />
          </label>
          {[
            ["Centre", "center"],
            ["From", "from"],
            ["To", "to"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <select
                value={String(arc[field as keyof Graph2DGeometryArc] ?? "")}
                aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) => patchArc(selectedGeometryChild.index, { [field]: event.target.value } as Partial<Graph2DGeometryArc>)}
                className={controlClassName}
              >
                {pointOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Line style
            <select
              value={arc.strokeStyle ?? "solid"}
              aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} line style`}
              onChange={(event) => patchArc(selectedGeometryChild.index, { strokeStyle: event.target.value as "solid" | "dashed" })}
              className={controlClassName}
            >
              {GRAPH_LINE_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Weight
            <input
              type="number"
              min={0.5}
              step={1}
              value={inspectorNumberInputValue(arc.strokeWidth)}
              aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} weight`}
              onChange={(event) => patchArc(selectedGeometryChild.index, { strokeWidth: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          {[
            ["Label x", "labelX"],
            ["Label y", "labelY"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <input
                type="number"
                step={1}
                value={inspectorNumberInputValue(arc[field as keyof Graph2DGeometryArc] as number | undefined)}
                aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) =>
                  patchArc(selectedGeometryChild.index, {
                    [field]: inspectorOptionalNumber(event.target.value),
                  } as Partial<Graph2DGeometryArc>)
                }
                className={controlClassName}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Colour
            <input
              type="color"
              value={arc.color ?? "#000000"}
              aria-label={`${selectedBlock.label} arc ${selectedGeometryChild.index + 1} colour`}
              onChange={(event) => patchArc(selectedGeometryChild.index, { color: event.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background p-1"
            />
          </label>
        </div>
      </div>
    );
  }

  if (selectedGeometryChild.kind === "angle") {
    const angle = angles[selectedGeometryChild.index];
    if (!angle) return null;
    return (
      <div className="space-y-3 border-t pt-3">
        {primitiveHeader("Angle")}
        {solutionLayerControl}
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={angle.show ?? true}
            aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} visible`}
            onChange={(event) => patchAngle(selectedGeometryChild.index, { show: event.target.checked })}
          />
          Visible
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Id
            <input
              value={angle.id}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} id`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { id: event.target.value })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Label
            <input
              value={angle.label ?? ""}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} label`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { label: event.target.value })}
              className={controlClassName}
            />
          </label>
          {[
            ["First arm", 0],
            ["Vertex", 1],
            ["Second arm", 2],
          ].map(([label, pointIndex]) => (
            <label key={String(pointIndex)} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <select
                value={angle.points[pointIndex as number] ?? ""}
                aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} ${String(label).toLowerCase()}`}
                onChange={(event) => {
                  const nextPoints = [...angle.points] as Graph2DGeometryAngle["points"];
                  nextPoints[pointIndex as number] = event.target.value;
                  patchAngle(selectedGeometryChild.index, { points: nextPoints });
                }}
                className={controlClassName}
              >
                {pointOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Radius
            <input
              type="number"
              min={0.05}
              step={1}
              value={inspectorNumberInputValue(angle.radius)}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} radius`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { radius: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Count
            <input
              type="number"
              min={1}
              max={4}
              step={1}
              value={inspectorNumberInputValue(angle.arcCount)}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} count`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { arcCount: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Line style
            <select
              value={angle.strokeStyle ?? "solid"}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} line style`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { strokeStyle: event.target.value as "solid" | "dashed" })}
              className={controlClassName}
            >
              {GRAPH_LINE_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Weight
            <input
              type="number"
              min={0.5}
              step={1}
              value={inspectorNumberInputValue(angle.strokeWidth)}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} weight`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { strokeWidth: inspectorOptionalNumber(event.target.value) })}
              className={controlClassName}
            />
          </label>
          {[
            ["Label x", "labelX"],
            ["Label y", "labelY"],
          ].map(([label, field]) => (
            <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {label}
              <input
                type="number"
                step={1}
                value={inspectorNumberInputValue(angle[field as keyof Graph2DGeometryAngle] as number | undefined)}
                aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} ${label.toLowerCase()}`}
                onChange={(event) =>
                  patchAngle(selectedGeometryChild.index, {
                    [field]: inspectorOptionalNumber(event.target.value),
                  } as Partial<Graph2DGeometryAngle>)
                }
                className={controlClassName}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Colour
            <input
              type="color"
              value={angle.color ?? "#000000"}
              aria-label={`${selectedBlock.label} angle ${selectedGeometryChild.index + 1} colour`}
              onChange={(event) => patchAngle(selectedGeometryChild.index, { color: event.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background p-1"
            />
          </label>
        </div>
      </div>
    );
  }

  const decoration = decorations[selectedGeometryChild.index];
  if (!decoration) return null;
  return (
    <div className="space-y-3 border-t pt-3">
      {primitiveHeader("Marker")}
      {solutionLayerControl}
      <label className={checkboxLabelClassName}>
        <input
          type="checkbox"
          checked={decoration.show ?? true}
          aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} visible`}
          onChange={(event) => patchDecoration(selectedGeometryChild.index, { show: event.target.checked })}
        />
        Visible
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Type
          <select
            value={decoration.kind}
            aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} type`}
            onChange={(event) =>
              writeData(
                updateGeometry2DDecoration(
                  data,
                  selectedGeometryChild.index,
                  createGeometry2DDecoration(event.target.value as Graph2DGeometryDecoration["kind"], data),
                ),
              )
            }
            className={controlClassName}
          >
            <option value="equalLength">Equal length</option>
            <option value="equalAngle">Equal angle</option>
            <option value="rightAngle">Right angle</option>
          </select>
        </label>
        {decoration.kind === "equalLength" ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Segments
            <input
              value={csvList(decoration.segments)}
              aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} segments`}
              list={`${selectedBlock.label}-geometry-segments`}
              onChange={(event) => patchDecoration(selectedGeometryChild.index, { segments: parseCsvList(event.target.value) })}
              className={controlClassName}
            />
          </label>
        ) : decoration.kind === "equalAngle" ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Angles
            <input
              value={csvList(decoration.angles)}
              aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} angles`}
              onChange={(event) => patchDecoration(selectedGeometryChild.index, { angles: parseCsvList(event.target.value) })}
              className={controlClassName}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Angle
            <select
              value={decoration.angle ?? ""}
              aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} angle`}
              onChange={(event) => patchDecoration(selectedGeometryChild.index, { angle: event.target.value })}
              className={controlClassName}
            >
              {angleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <datalist id={`${selectedBlock.label}-geometry-segments`}>
          {segmentOptions.map((option) => (
            <option key={option.value} value={option.value} />
          ))}
        </datalist>
        {decoration.kind !== "rightAngle" ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Count
            <input
              type="number"
              min={1}
              max={4}
              step={1}
              value={inspectorNumberInputValue(decoration.kind === "equalAngle" ? decoration.arcCount : decoration.tickCount)}
              aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} count`}
              onChange={(event) =>
                patchDecoration(
                  selectedGeometryChild.index,
                  decoration.kind === "equalAngle"
                    ? { arcCount: inspectorOptionalNumber(event.target.value) }
                    : { tickCount: inspectorOptionalNumber(event.target.value) },
                )
              }
              className={controlClassName}
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Size
          <input
            type="number"
            min={0.05}
            step={1}
            value={inspectorNumberInputValue(decoration.size ?? decoration.radius)}
            aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} size`}
            onChange={(event) =>
              patchDecoration(
                selectedGeometryChild.index,
                decoration.kind === "equalAngle"
                  ? { radius: inspectorOptionalNumber(event.target.value) }
                  : { size: inspectorOptionalNumber(event.target.value) },
              )
            }
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Colour
          <input
            type="color"
            value={decoration.color ?? "#000000"}
            aria-label={`${selectedBlock.label} marker ${selectedGeometryChild.index + 1} colour`}
            onChange={(event) => patchDecoration(selectedGeometryChild.index, { color: event.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background p-1"
          />
        </label>
      </div>
    </div>
  );
}
