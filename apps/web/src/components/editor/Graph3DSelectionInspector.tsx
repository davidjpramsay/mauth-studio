import type {
  ContentBlock,
  Graph3DDimensionData,
  Graph3DFaceData,
  Graph3DPointData,
  Graph3DSegmentData,
  Graph3DSolidData,
  GraphConfig,
} from "@mauth-studio/shared";
import { ArrowLeft, RotateCcw } from "lucide-react";

import { DEFAULT_3D_GRAPH, DEFAULT_3D_VIEW_STATE } from "../../lib/diagram3d";
import {
  graph3dElementWithSolutionOnly,
  isSolutionOnlyGraph3DElement,
  updateGraph3DElement,
  type Graph3DElement,
} from "../../lib/diagramGraph3d";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { graph3dElementInspectorSelection, graph3dInspectorSelection } from "../../lib/graph3dInspectorSelection";
import { graph3dResetViewPatch, graph3dViewPatch } from "../../lib/moduleSettingsPatches";
import { graphChildParentScrollAnchor } from "../../lib/scrollAnchors";
import { Button } from "../ui/button";
import { NumericExpressionInput } from "./NumericExpressionInput";

interface Graph3DSelectionInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramConfig: GraphConfig;
  activeAnchor?: string;
  onActivateAnchor?: (anchor: string) => void;
  controlClassName: string;
  checkboxLabelClassName: string;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
}

export function Graph3DSelectionInspector({
  selectedBlock,
  selectedDiagramConfig,
  activeAnchor,
  onActivateAnchor,
  controlClassName,
  checkboxLabelClassName,
  onBlockChange,
  updateGraphConfig,
}: Graph3DSelectionInspectorProps) {
  const selection = graph3dInspectorSelection(selectedDiagramConfig);
  const selectedElement = graph3dElementInspectorSelection(selectedDiagramConfig, activeAnchor);
  const updateCanvas = (patch: Partial<GraphConfig>) =>
    onBlockChange(selectedBlock, { graphConfig: updateGraphConfig(selectedDiagramConfig, patch) });
  const updateElement = (patch: Partial<Graph3DElement>) => {
    if (!selectedElement) return;
    updateCanvas({ data: updateGraph3DElement(selectedDiagramConfig, selectedElement.target, patch) });
  };

  if (selectedElement) {
    const { element, target } = selectedElement;
    const point = target.kind === "point" ? (element as Graph3DPointData) : null;
    const segment = target.kind === "segment" ? (element as Graph3DSegmentData) : null;
    const dimension = target.kind === "dimension" ? (element as Graph3DDimensionData) : null;
    const face = target.kind === "face" ? (element as Graph3DFaceData) : null;
    const solid = target.kind === "solid" ? (element as Graph3DSolidData) : null;
    const lineElement = segment ?? dimension;
    const colorElement = point ?? lineElement;
    const parentAnchor = activeAnchor ? graphChildParentScrollAnchor(activeAnchor) : null;
    const dimensionDisplay = dimension?.display ?? "bracket";
    return (
      <div className="space-y-3 border-t pt-3">
        {parentAnchor && onActivateAnchor ? (
          <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => onActivateAnchor(parentAnchor)}>
            <ArrowLeft data-icon="inline-start" />
            Diagram settings
          </Button>
        ) : null}
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Display</div>
        <label className={checkboxLabelClassName}>
          <input type="checkbox" checked={element.show !== false} onChange={(event) => updateElement({ show: event.target.checked })} />
          Visible
        </label>
        <label className={checkboxLabelClassName}>
          <input
            type="checkbox"
            checked={isSolutionOnlyGraph3DElement(element)}
            onChange={(event) => updateElement(graph3dElementWithSolutionOnly(element, event.target.checked))}
          />
          Show in solutions only
        </label>
        {colorElement ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Colour
            <input
              type="color"
              value={colorElement.color ?? (dimension ? "#000000" : "#111827")}
              onChange={(event) => updateElement({ color: event.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background p-1"
            />
          </label>
        ) : null}
        {segment || (dimension && dimensionDisplay === "bracket") ? (
          <label className={checkboxLabelClassName}>
            <input
              type="checkbox"
              checked={lineElement?.dashed === true || lineElement?.strokeStyle === "dashed"}
              onChange={(event) => updateElement({ dashed: event.target.checked, strokeStyle: event.target.checked ? "dashed" : "solid" })}
            />
            Dashed
          </label>
        ) : null}
        {dimension ? (
          <div className="grid grid-cols-1 gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Style
              <select
                value={dimensionDisplay}
                onChange={(event) => updateElement({ display: event.target.value as Graph3DDimensionData["display"] })}
                className={controlClassName}
              >
                <option value="label">Label beside edge</option>
                <option value="guide">Dashed guide</option>
                <option value="bracket">Bracket (fixed view)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Label gap (px)
              <NumericExpressionInput
                min={1}
                step={1}
                value={dimension.labelOffsetPx ?? 12}
                fallbackValue={12}
                ariaLabel={`${selectedBlock.label} dimension label gap`}
                onValueChange={(value) => updateElement({ labelOffsetPx: value ?? 12 })}
                className={controlClassName}
              />
            </label>
          </div>
        ) : null}
        {solid ? (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            Style
            <select
              value={solid.renderStyle ?? "surface"}
              onChange={(event) => updateElement({ renderStyle: event.target.value as Graph3DSolidData["renderStyle"] })}
              className={controlClassName}
            >
              <option value="surface">Surface</option>
              <option value="wireframe">Wireframe</option>
              <option value="outline">Outline</option>
            </select>
          </label>
        ) : null}
        {(point || segment || dimension || face) && Array.isArray(element.labelScreenOffsetPx) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => updateElement({ labelScreenOffsetPx: undefined })}
          >
            <RotateCcw data-icon="inline-start" />
            Reset label position
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selection.title}</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Frame width
          <NumericExpressionInput
            min={240}
            step={10}
            value={selection.widthPx}
            fallbackValue={DEFAULT_3D_GRAPH.widthPx}
            ariaLabel={`${selectedBlock.label} 3D frame width`}
            onValueChange={(value) => updateCanvas({ widthPx: value ?? DEFAULT_3D_GRAPH.widthPx })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Frame height
          <NumericExpressionInput
            min={180}
            step={10}
            value={selection.heightPx}
            fallbackValue={DEFAULT_3D_GRAPH.heightPx}
            ariaLabel={`${selectedBlock.label} 3D frame height`}
            onValueChange={(value) => updateCanvas({ heightPx: value ?? DEFAULT_3D_GRAPH.heightPx })}
            className={controlClassName}
          />
        </label>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Frame size only. The 3D horizontal and vertical scale stays 1:1.</p>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
        Object size (%)
        <NumericExpressionInput
          min={50}
          max={300}
          step={10}
          value={selection.view.zoom * 100}
          fallbackValue={DEFAULT_3D_VIEW_STATE.zoom * 100}
          ariaLabel={`${selectedBlock.label} 3D object size`}
          onValueChange={(value) =>
            updateCanvas(graph3dViewPatch(selectedDiagramConfig, { zoom: (value ?? DEFAULT_3D_VIEW_STATE.zoom * 100) / 100 }))
          }
          className={controlClassName}
        />
      </label>
      <p className="text-xs leading-5 text-muted-foreground">Changes the geometry size inside the frame without distorting its scale.</p>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Azimuth
          <NumericExpressionInput
            step={1}
            value={selection.view.az}
            fallbackValue={DEFAULT_3D_VIEW_STATE.az}
            ariaLabel={`${selectedBlock.label} 3D azimuth`}
            onValueChange={(value) => updateCanvas(graph3dViewPatch(selectedDiagramConfig, { az: value ?? DEFAULT_3D_VIEW_STATE.az }))}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Elevation
          <NumericExpressionInput
            step={1}
            value={selection.view.el}
            fallbackValue={DEFAULT_3D_VIEW_STATE.el}
            ariaLabel={`${selectedBlock.label} 3D elevation`}
            onValueChange={(value) => updateCanvas(graph3dViewPatch(selectedDiagramConfig, { el: value ?? DEFAULT_3D_VIEW_STATE.el }))}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Bank
          <NumericExpressionInput
            step={1}
            value={selection.view.bank}
            fallbackValue={DEFAULT_3D_VIEW_STATE.bank}
            ariaLabel={`${selectedBlock.label} 3D bank`}
            onValueChange={(value) => updateCanvas(graph3dViewPatch(selectedDiagramConfig, { bank: value ?? DEFAULT_3D_VIEW_STATE.bank }))}
            className={controlClassName}
          />
        </label>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => updateCanvas(graph3dResetViewPatch(selectedDiagramConfig))}
      >
        Reset view
      </Button>
    </div>
  );
}
