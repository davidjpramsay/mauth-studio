import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_3D_GRAPH, DEFAULT_3D_VIEW_STATE } from "../../lib/diagram3d";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { graph3dInspectorSelection } from "../../lib/graph3dInspectorSelection";
import {
  graph3dResetViewPatch,
  graph3dViewPatch,
  inspectorNumberInputValue,
  inspectorOptionalNumber,
} from "../../lib/moduleSettingsPatches";
import { Button } from "../ui/button";

interface Graph3DSelectionInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramConfig: GraphConfig;
  controlClassName: string;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
}

export function Graph3DSelectionInspector({
  selectedBlock,
  selectedDiagramConfig,
  controlClassName,
  onBlockChange,
  updateGraphConfig,
}: Graph3DSelectionInspectorProps) {
  const selection = graph3dInspectorSelection(selectedDiagramConfig);
  const updateCanvas = (patch: Partial<GraphConfig>) =>
    onBlockChange(selectedBlock, { graphConfig: updateGraphConfig(selectedDiagramConfig, patch) });

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selection.title}</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Width
          <input
            type="number"
            min={240}
            step={10}
            value={inspectorNumberInputValue(selection.widthPx)}
            aria-label={`${selectedBlock.label} 3D width`}
            onChange={(event) => updateCanvas({ widthPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_GRAPH.widthPx })}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Height
          <input
            type="number"
            min={180}
            step={10}
            value={inspectorNumberInputValue(selection.heightPx)}
            aria-label={`${selectedBlock.label} 3D height`}
            onChange={(event) => updateCanvas({ heightPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_GRAPH.heightPx })}
            className={controlClassName}
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Azimuth
          <input
            type="number"
            step={1}
            value={inspectorNumberInputValue(selection.view.az)}
            aria-label={`${selectedBlock.label} 3D azimuth`}
            onChange={(event) =>
              updateCanvas(
                graph3dViewPatch(selectedDiagramConfig, {
                  az: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.az,
                }),
              )
            }
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Elevation
          <input
            type="number"
            step={1}
            value={inspectorNumberInputValue(selection.view.el)}
            aria-label={`${selectedBlock.label} 3D elevation`}
            onChange={(event) =>
              updateCanvas(
                graph3dViewPatch(selectedDiagramConfig, {
                  el: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.el,
                }),
              )
            }
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Bank
          <input
            type="number"
            step={1}
            value={inspectorNumberInputValue(selection.view.bank)}
            aria-label={`${selectedBlock.label} 3D bank`}
            onChange={(event) =>
              updateCanvas(
                graph3dViewPatch(selectedDiagramConfig, {
                  bank: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.bank,
                }),
              )
            }
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
