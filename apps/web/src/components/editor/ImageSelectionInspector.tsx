import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { imageInspectorDimensionPatch, imageInspectorSelection } from "../../lib/imageInspectorSelection";
import { imageDataPatch } from "../../lib/moduleSettingsPatches";
import { NumericExpressionInput } from "./NumericExpressionInput";

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
          <NumericExpressionInput
            min={40}
            step={10}
            value={selection.widthPx}
            ariaLabel={`${selectedBlock.label} image width`}
            onValueChange={(value) => updateCanvas(imageInspectorDimensionPatch("widthPx", value))}
            className={controlClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Height
          <NumericExpressionInput
            min={40}
            step={10}
            value={selection.heightPx}
            ariaLabel={`${selectedBlock.label} image height`}
            onValueChange={(value) => updateCanvas(imageInspectorDimensionPatch("heightPx", value))}
            className={controlClassName}
          />
        </label>
      </div>
    </div>
  );
}
