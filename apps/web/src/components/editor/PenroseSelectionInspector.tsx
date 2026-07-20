import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";
import { Shuffle } from "lucide-react";

import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { DEFAULT_PENROSE_SCALE_PERCENT, penroseScalePercent } from "../../lib/diagramPenrose";
import {
  inspectorNumberInputValue,
  inspectorOptionalNumber,
  inspectorSetShadingOptions,
  networkPresetPatch,
  networkVisibilityPatch,
  penroseResamplePatch,
  penroseScalePatch,
  setDiagramCountLabelsPatch,
  setDiagramNotationPatch,
  setDiagramSetCountPatch,
  setDiagramShadingPatch,
} from "../../lib/moduleSettingsPatches";
import { penroseInspectorSelection } from "../../lib/penroseInspectorSelection";
import { Button } from "../ui/button";

interface PenroseSelectionInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramConfig: GraphConfig;
  controlClassName: string;
  checkboxLabelClassName: string;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
}

export function PenroseSelectionInspector({
  selectedBlock,
  selectedDiagramConfig,
  controlClassName,
  checkboxLabelClassName,
  onBlockChange,
  updateGraphConfig,
}: PenroseSelectionInspectorProps) {
  const { title, networkData: selectedNetworkData, setData: selectedSetData } = penroseInspectorSelection(selectedDiagramConfig);

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
          Scale
          <input
            type="number"
            min={25}
            max={250}
            step={1}
            value={inspectorNumberInputValue(penroseScalePercent(selectedDiagramConfig))}
            aria-label={`${selectedBlock.label} Penrose scale`}
            onChange={(event) =>
              onBlockChange(selectedBlock, {
                graphConfig: updateGraphConfig(
                  selectedDiagramConfig,
                  penroseScalePatch(selectedDiagramConfig, inspectorOptionalNumber(event.target.value) ?? DEFAULT_PENROSE_SCALE_PERCENT),
                ),
              })
            }
            className={controlClassName}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-end"
          onClick={() =>
            onBlockChange(selectedBlock, {
              graphConfig: updateGraphConfig(
                selectedDiagramConfig,
                penroseScalePatch(selectedDiagramConfig, DEFAULT_PENROSE_SCALE_PERCENT),
              ),
            })
          }
        >
          Original
        </Button>
      </div>
      {selectedDiagramConfig.type === "geometricConstruction" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() =>
            onBlockChange(selectedBlock, {
              graphConfig: updateGraphConfig(selectedDiagramConfig, penroseResamplePatch(selectedDiagramConfig)),
            })
          }
        >
          <Shuffle className="mr-2 size-4" aria-hidden="true" />
          Resample
        </Button>
      ) : null}
      {selectedDiagramConfig.type === "network" && selectedNetworkData ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              onBlockChange(selectedBlock, {
                graphConfig: updateGraphConfig(selectedDiagramConfig, networkPresetPatch(selectedDiagramConfig)),
              })
            }
          >
            Network preset
          </Button>
          <label className={checkboxLabelClassName}>
            <input
              type="checkbox"
              checked={!selectedNetworkData.hidePoints}
              aria-label={`${selectedBlock.label} show node dots`}
              onChange={(event) =>
                onBlockChange(selectedBlock, {
                  graphConfig: updateGraphConfig(
                    selectedDiagramConfig,
                    networkVisibilityPatch(selectedDiagramConfig, { hidePoints: !event.target.checked }),
                  ),
                })
              }
            />
            Show node dots
          </label>
          <label className={checkboxLabelClassName}>
            <input
              type="checkbox"
              checked={!selectedNetworkData.hidePointLabels}
              aria-label={`${selectedBlock.label} show node labels`}
              onChange={(event) =>
                onBlockChange(selectedBlock, {
                  graphConfig: updateGraphConfig(
                    selectedDiagramConfig,
                    networkVisibilityPatch(selectedDiagramConfig, { hidePointLabels: !event.target.checked }),
                  ),
                })
              }
            />
            Show node labels
          </label>
        </>
      ) : null}
      {selectedDiagramConfig.type === "setDiagram" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={selectedSetData?.setCount === 2 ? "default" : "outline"}
              size="sm"
              onClick={() =>
                onBlockChange(selectedBlock, {
                  graphConfig: updateGraphConfig(selectedDiagramConfig, setDiagramSetCountPatch(selectedDiagramConfig, 2)),
                })
              }
            >
              2 sets
            </Button>
            <Button
              type="button"
              variant={selectedSetData?.setCount === 3 ? "default" : "outline"}
              size="sm"
              onClick={() =>
                onBlockChange(selectedBlock, {
                  graphConfig: updateGraphConfig(selectedDiagramConfig, setDiagramSetCountPatch(selectedDiagramConfig, 3)),
                })
              }
            >
              3 sets
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 2xl:grid-cols-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onBlockChange(selectedBlock, {
                  graphConfig: updateGraphConfig(selectedDiagramConfig, setDiagramNotationPatch(selectedDiagramConfig)),
                })
              }
            >
              Set notation
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onBlockChange(selectedBlock, {
                  graphConfig: updateGraphConfig(selectedDiagramConfig, setDiagramCountLabelsPatch(selectedDiagramConfig, false)),
                })
              }
            >
              Counts
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onBlockChange(selectedBlock, {
                  graphConfig: updateGraphConfig(selectedDiagramConfig, setDiagramCountLabelsPatch(selectedDiagramConfig, true)),
                })
              }
            >
              Counts + totals
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-muted-foreground">Shading</div>
            <div className="grid grid-cols-2 gap-2">
              {inspectorSetShadingOptions(selectedDiagramConfig).map((option) => (
                <Button
                  key={`${option.label}-${option.regionIndex ?? "none"}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onBlockChange(selectedBlock, {
                      graphConfig: updateGraphConfig(
                        selectedDiagramConfig,
                        setDiagramShadingPatch(selectedDiagramConfig, option.regionIndex),
                      ),
                    })
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
