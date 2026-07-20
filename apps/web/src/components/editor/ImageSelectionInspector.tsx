import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { imageInspectorDimensionPatch, imageInspectorSelection } from "../../lib/imageInspectorSelection";
import { imageDataPatch, inspectorNumberInputValue } from "../../lib/moduleSettingsPatches";

interface ImageSelectionInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramConfig: GraphConfig;
  controlClassName: string;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
}

export function ImageSelectionInspector({
  selectedBlock,
  selectedDiagramConfig,
  controlClassName,
  onBlockChange,
  updateGraphConfig,
}: ImageSelectionInspectorProps) {
  const selection = imageInspectorSelection(selectedDiagramConfig);
  const updateCanvas = (patch: Partial<GraphConfig>) =>
    onBlockChange(selectedBlock, { graphConfig: updateGraphConfig(selectedDiagramConfig, patch) });

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selection.title}</div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
        Name
        <input
          value={selection.data.name}
          aria-label={`${selectedBlock.label} image name`}
          onChange={(event) => updateCanvas(imageDataPatch(selectedDiagramConfig, { name: event.target.value }))}
          className={controlClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
        Alt text
        <input
          value={selection.data.alt}
          aria-label={`${selectedBlock.label} image alt text`}
          onChange={(event) => updateCanvas(imageDataPatch(selectedDiagramConfig, { alt: event.target.value }))}
          className={controlClassName}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Width
          <input
            type="number"
            min={40}
            step={10}
            value={inspectorNumberInputValue(selection.widthPx)}
            aria-label={`${selectedBlock.label} image width`}
            onChange={(event) => updateCanvas(imageInspectorDimensionPatch("widthPx", event.target.value))}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Height
          <input
            type="number"
            min={40}
            step={10}
            value={inspectorNumberInputValue(selection.heightPx)}
            aria-label={`${selectedBlock.label} image height`}
            onChange={(event) => updateCanvas(imageInspectorDimensionPatch("heightPx", event.target.value))}
            className={controlClassName}
          />
        </label>
      </div>
    </div>
  );
}
