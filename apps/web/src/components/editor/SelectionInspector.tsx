import type {
  ChoiceListLayout,
  ChoiceNumberingStyle,
  ContentBlock,
  DiagramAlignment,
  GraphConfig,
  TableCellAlignment,
} from "@mauth-studio/shared";
import {
  DEFAULT_STATS_CHART_SPEC,
  STATS_CHART_TYPES,
  normalizeStatsChartSpec,
  type StatsChartData,
  type StatsChartOptions,
  type StatsChartType,
} from "@mauth-studio/diagram-plotly";
import { Shuffle } from "lucide-react";

import { defaultStatsDataForType } from "./StatsChartEditor";
import {
  CHOICE_LIST_LAYOUTS,
  CHOICE_NUMBERING_STYLES,
  COLUMN_COUNT_OPTIONS,
  DIAGRAM_ALIGNMENTS,
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_GROUPS,
  TABLE_CELL_ALIGNMENTS,
  VECTOR_2D_LABEL_STYLES,
} from "./editorOptions";
import {
  INSPECTOR_MAX_TABLE_COLUMNS,
  INSPECTOR_MAX_TABLE_ROWS,
  INSPECTOR_MIN_TABLE_COLUMNS,
  INSPECTOR_MIN_TABLE_ROWS,
  INSPECTOR_SET_SHADING_OPTIONS,
  columnsColumnCountPatch,
  graph3dResetViewPatch,
  graph3dViewPatch,
  graphInspectorWidthPatch,
  imageDataPatch,
  inspectorNumberInputValue,
  inspectorOptionalNumber,
  inspectorSpaceLines,
  inspectorTableColumnCount,
  isInspectorPenroseDiagramType,
  networkPresetPatch,
  networkVisibilityPatch,
  penroseResamplePatch,
  penroseScalePatch,
  setDiagramCountLabelsPatch,
  setDiagramNotationPatch,
  setDiagramShadingPatch,
  tableColumnCountPatch,
  tableRowsCountPatch,
  vector2dLabelStylePatch,
  type InspectorColumnsBlock,
  type InspectorTableBlock,
} from "../../lib/moduleSettingsPatches";
import { Button } from "../ui/button";
import {
  normalizeChoiceListLayout,
  normalizeChoiceNumberingStyle,
  normalizeColumnsBlock,
  normalizeDiagramAlignment,
  normalizeTableBlock,
  plainTableRows,
} from "../../lib/contentBlockNormalization";
import { DEFAULT_3D_GRAPH, DEFAULT_3D_VIEW_STATE, graph3dViewState } from "../../lib/diagram3d";
import { graphHeight, lockedAspectHeight } from "../../lib/diagramGraph2d";
import { DEFAULT_IMAGE_DIAGRAM, finiteGraphNumber, imageDiagramData } from "../../lib/diagramImage";
import { normalizedNetworkDiagramData } from "../../lib/diagramNetwork";
import { DEFAULT_PENROSE_SCALE_PERCENT, penroseScalePercent } from "../../lib/diagramPenrose";
import { DEFAULT_VECTOR_2D_GRAPH, vector2dLabelStyle, vector2dMetadata, type Vector2DLabelStyle } from "../../lib/diagramVector2d";
import { cn } from "../../lib/utils";

export type SelectedEditorBaseBlockScope =
  | { kind: "question"; questionId: string }
  | { kind: "part"; questionId: string; partId: string }
  | { kind: "subpart"; questionId: string; partId: string; subpartId: string };

export interface ColumnBlockPathEntry {
  columnIndex: number;
  blockId: string;
}

export type ColumnBlockPath = ColumnBlockPathEntry[];

export type SelectedEditorBlockScope =
  | SelectedEditorBaseBlockScope
  | { kind: "column"; rootScope: SelectedEditorBaseBlockScope; rootBlockId: string; path: ColumnBlockPath };

export interface SelectedEditorBlock {
  scope: SelectedEditorBlockScope;
  block: ContentBlock;
  label: string;
  summary: string;
}

export interface SelectionInspectorProps {
  selectedBlock: SelectedEditorBlock | null;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  createTextBlock: () => ContentBlock;
  diagramTypePatch: (type: string, current: GraphConfig) => Partial<GraphConfig>;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function SelectionInspector({
  selectedBlock,
  createTextBlock,
  diagramTypePatch,
  updateGraphConfig,
  withGraphDefaults,
  onBlockChange,
}: SelectionInspectorProps) {
  if (!selectedBlock) return null;

  const selectedColumnsBlock = selectedBlock.block.kind === "columns" ? normalizeColumnsBlock(selectedBlock.block) : null;
  const selectedChoiceBlock = selectedBlock.block.kind === "choices" ? selectedBlock.block : null;
  const selectedTableBlock = selectedBlock.block.kind === "table" ? normalizeTableBlock(selectedBlock.block) : null;
  const selectedTableRows = selectedTableBlock ? plainTableRows(selectedTableBlock) : [];
  const selectedTableColumnCount = inspectorTableColumnCount(selectedTableRows);
  const selectedSpaceBlock = selectedBlock.block.kind === "space" ? selectedBlock.block : null;
  const selectedDiagramBlock = selectedBlock.block.kind === "diagram" ? selectedBlock.block : null;
  const selectedDiagramConfig = selectedDiagramBlock ? withGraphDefaults(selectedDiagramBlock.graphConfig) : null;
  const selectedNetworkData = selectedDiagramConfig?.type === "network" ? normalizedNetworkDiagramData(selectedDiagramConfig) : null;
  const selectedImageData = selectedDiagramConfig?.type === "image" ? imageDiagramData(selectedDiagramConfig) : null;
  const selectedStatsChartSpec = selectedDiagramConfig?.type === "statsChart" ? normalizeStatsChartSpec(selectedDiagramConfig) : null;
  const updateSelectedStatsChartData = (patch: Partial<StatsChartData>) => {
    if (!selectedDiagramConfig || !selectedStatsChartSpec) return;
    const nextData = { ...selectedStatsChartSpec.data, ...patch };
    onBlockChange(selectedBlock, {
      graphConfig: updateGraphConfig(selectedDiagramConfig, {
        data: nextData,
        options: selectedStatsChartSpec.options,
        widthPx: selectedStatsChartSpec.options?.widthPx,
        heightPx: selectedStatsChartSpec.options?.heightPx,
      }),
    });
  };
  const updateSelectedStatsChartOptions = (patch: Partial<StatsChartOptions>) => {
    if (!selectedDiagramConfig || !selectedStatsChartSpec) return;
    const nextOptions = { ...selectedStatsChartSpec.options, ...patch };
    onBlockChange(selectedBlock, {
      graphConfig: updateGraphConfig(selectedDiagramConfig, {
        options: nextOptions,
        widthPx: nextOptions.widthPx,
        heightPx: nextOptions.heightPx,
      }),
    });
  };
  const controlClassName = "h-9 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground";
  const checkboxLabelClassName = "flex items-center gap-2 text-xs font-semibold text-muted-foreground";

  return (
    <aside
      data-inspector-placement="inline"
      className="selection-inspector-pane flex min-h-0 min-w-0 flex-col overflow-hidden border-b bg-card/95 lg:border-b-0 lg:border-r"
    >
      <div className="shrink-0 border-b p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</div>
        <div className="mt-1 truncate text-sm font-semibold">{selectedBlock.label}</div>
        <div className="mt-1 text-xs text-muted-foreground">{selectedBlock.summary}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedColumnsBlock ? (
          <div className="space-y-3 p-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Layout
              <select
                value={selectedColumnsBlock.columnCount}
                aria-label={`${selectedBlock.label} layout`}
                onChange={(event) =>
                  onBlockChange(
                    selectedBlock,
                    columnsColumnCountPatch(selectedBlock.block as InspectorColumnsBlock, event.target.value, createTextBlock),
                  )
                }
                className={controlClassName}
              >
                {COLUMN_COUNT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : selectedChoiceBlock ? (
          <div className="space-y-3 p-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Labels
              <select
                value={normalizeChoiceNumberingStyle(selectedChoiceBlock.numberingStyle)}
                aria-label={`${selectedBlock.label} labels`}
                onChange={(event) => onBlockChange(selectedBlock, { numberingStyle: event.target.value as ChoiceNumberingStyle })}
                className={controlClassName}
              >
                {CHOICE_NUMBERING_STYLES.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Layout
              <select
                value={normalizeChoiceListLayout(selectedChoiceBlock.layout)}
                aria-label={`${selectedBlock.label} layout`}
                onChange={(event) => onBlockChange(selectedBlock, { layout: event.target.value as ChoiceListLayout })}
                className={controlClassName}
              >
                {CHOICE_LIST_LAYOUTS.map((layout) => (
                  <option key={layout.value} value={layout.value}>
                    {layout.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : selectedTableBlock ? (
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-1">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Position
              <select
                value={selectedTableBlock.tableAlign}
                aria-label={`${selectedBlock.label} position`}
                onChange={(event) => onBlockChange(selectedBlock, { tableAlign: event.target.value as DiagramAlignment })}
                className={controlClassName}
              >
                {DIAGRAM_ALIGNMENTS.map((alignment) => (
                  <option key={alignment.value} value={alignment.value}>
                    {alignment.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Cell text
              <select
                value={selectedTableBlock.cellAlignment}
                aria-label={`${selectedBlock.label} cell text`}
                onChange={(event) => onBlockChange(selectedBlock, { cellAlignment: event.target.value as TableCellAlignment })}
                className={controlClassName}
              >
                {TABLE_CELL_ALIGNMENTS.map((alignment) => (
                  <option key={alignment.value} value={alignment.value}>
                    {alignment.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Rows
              <input
                type="number"
                min={INSPECTOR_MIN_TABLE_ROWS}
                max={INSPECTOR_MAX_TABLE_ROWS}
                value={selectedTableRows.length}
                aria-label={`${selectedBlock.label} rows`}
                onChange={(event) =>
                  onBlockChange(
                    selectedBlock,
                    tableRowsCountPatch(selectedBlock.block as InspectorTableBlock, event.currentTarget.valueAsNumber),
                  )
                }
                className={controlClassName}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Columns
              <input
                type="number"
                min={INSPECTOR_MIN_TABLE_COLUMNS}
                max={INSPECTOR_MAX_TABLE_COLUMNS}
                value={selectedTableColumnCount}
                aria-label={`${selectedBlock.label} columns`}
                onChange={(event) =>
                  onBlockChange(
                    selectedBlock,
                    tableColumnCountPatch(selectedBlock.block as InspectorTableBlock, event.currentTarget.valueAsNumber),
                  )
                }
                className={controlClassName}
              />
            </label>
          </div>
        ) : selectedSpaceBlock ? (
          <div className="space-y-3 p-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Lines
              <input
                type="number"
                min={0}
                step={1}
                value={inspectorSpaceLines(selectedSpaceBlock.lines)}
                aria-label={`${selectedBlock.label} lines`}
                onChange={(event) => onBlockChange(selectedBlock, { lines: inspectorSpaceLines(event.currentTarget.valueAsNumber) })}
                className={controlClassName}
              />
            </label>
          </div>
        ) : selectedDiagramBlock && selectedDiagramConfig ? (
          <div className="space-y-3 p-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Type
              <select
                value={selectedDiagramConfig.type ?? "graph2d"}
                aria-label={`${selectedBlock.label} type`}
                onChange={(event) =>
                  onBlockChange(selectedBlock, {
                    graphConfig: updateGraphConfig(selectedDiagramConfig, diagramTypePatch(event.target.value, selectedDiagramConfig)),
                  })
                }
                className={controlClassName}
              >
                {DIAGRAM_TYPE_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.values.map((value) => {
                      const diagramType = DIAGRAM_TYPES.find((candidate) => candidate.value === value);
                      if (!diagramType) return null;
                      return (
                        <option key={diagramType.value} value={diagramType.value}>
                          {diagramType.label}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Position
              <select
                value={normalizeDiagramAlignment(selectedDiagramBlock.diagramAlign)}
                aria-label={`${selectedBlock.label} position`}
                onChange={(event) => onBlockChange(selectedBlock, { diagramAlign: event.target.value as DiagramAlignment })}
                className={controlClassName}
              >
                {DIAGRAM_ALIGNMENTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {isInspectorPenroseDiagramType(selectedDiagramConfig.type) ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {selectedDiagramConfig.type === "network"
                    ? "Network settings"
                    : selectedDiagramConfig.type === "setDiagram"
                      ? "Set diagram settings"
                      : "Penrose settings"}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Scale
                    <input
                      type="number"
                      min={25}
                      max={250}
                      step={5}
                      value={inspectorNumberInputValue(penroseScalePercent(selectedDiagramConfig))}
                      aria-label={`${selectedBlock.label} Penrose scale`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(
                            selectedDiagramConfig,
                            penroseScalePatch(
                              selectedDiagramConfig,
                              inspectorOptionalNumber(event.target.value) ?? DEFAULT_PENROSE_SCALE_PERCENT,
                            ),
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
                        {INSPECTOR_SET_SHADING_OPTIONS.map((option) => (
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
            ) : selectedDiagramConfig.type === "image" && selectedImageData ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Image settings</div>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Name
                  <input
                    value={selectedImageData.name}
                    aria-label={`${selectedBlock.label} image name`}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(
                          selectedDiagramConfig,
                          imageDataPatch(selectedDiagramConfig, { name: event.target.value }),
                        ),
                      })
                    }
                    className={controlClassName}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Alt text
                  <input
                    value={selectedImageData.alt}
                    aria-label={`${selectedBlock.label} image alt text`}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(
                          selectedDiagramConfig,
                          imageDataPatch(selectedDiagramConfig, { alt: event.target.value }),
                        ),
                      })
                    }
                    className={controlClassName}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Width
                    <input
                      type="number"
                      min={40}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
                      aria-label={`${selectedBlock.label} image width`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            widthPx: finiteGraphNumber(event.target.value, DEFAULT_IMAGE_DIAGRAM.widthPx),
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Height
                    <input
                      type="number"
                      min={40}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
                      aria-label={`${selectedBlock.label} image height`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            heightPx: finiteGraphNumber(event.target.value, DEFAULT_IMAGE_DIAGRAM.heightPx),
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
              </div>
            ) : selectedDiagramConfig.type === "graph2d" ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Graph settings</div>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.showAxes ?? true}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, { showAxes: event.target.checked }),
                      })
                    }
                  />
                  Axes
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.showArrows ?? true}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, { showArrows: event.target.checked }),
                      })
                    }
                  />
                  Axis arrows
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.showAxisLabels ?? true}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, { showAxisLabels: event.target.checked }),
                      })
                    }
                  />
                  Axis labels
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.showAxisNumbers ?? true}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, { showAxisNumbers: event.target.checked }),
                      })
                    }
                  />
                  Axis numbers
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.showFunctionArrows ?? true}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, { showFunctionArrows: event.target.checked }),
                      })
                    }
                  />
                  Function arrows
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Domain min
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.xMin)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, { xMin: inspectorOptionalNumber(event.target.value) }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Domain max
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.xMax)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, { xMax: inspectorOptionalNumber(event.target.value) }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Range min
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.yMin)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, { yMin: inspectorOptionalNumber(event.target.value) }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Range max
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.yMax)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, { yMax: inspectorOptionalNumber(event.target.value) }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Width
                    <input
                      type="number"
                      min={240}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(
                            selectedDiagramConfig,
                            graphInspectorWidthPatch(selectedDiagramConfig, event.target.value, lockedAspectHeight),
                          ),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  {selectedDiagramConfig.equalScale || selectedDiagramConfig.lockAspectRatio ? (
                    <div className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                      Height
                      <div className="flex h-9 items-center rounded-md border border-input bg-muted px-2 text-sm font-normal text-muted-foreground">
                        {Math.round(graphHeight(selectedDiagramConfig))} px
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                      Height
                      <input
                        type="number"
                        min={160}
                        step={20}
                        value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                              heightPx: inspectorOptionalNumber(event.target.value),
                            }),
                          })
                        }
                        className={controlClassName}
                      />
                    </label>
                  )}
                </div>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={(selectedDiagramConfig.lockAspectRatio ?? false) && !(selectedDiagramConfig.equalScale ?? false)}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                          lockAspectRatio: event.target.checked,
                          equalScale: event.target.checked ? false : selectedDiagramConfig.equalScale,
                        }),
                      })
                    }
                  />
                  Lock ratio
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.equalScale ?? false}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                          equalScale: event.target.checked,
                          lockAspectRatio: event.target.checked ? false : selectedDiagramConfig.lockAspectRatio,
                        }),
                      })
                    }
                  />
                  1:1 scale
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.showMajorGrid ?? true}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, { showMajorGrid: event.target.checked, showGrid: true }),
                      })
                    }
                  />
                  Major grid
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    X major
                    <input
                      type="number"
                      min={0.1}
                      step={0.5}
                      value={inspectorNumberInputValue(selectedDiagramConfig.gridMajorStepX ?? selectedDiagramConfig.gridMajorStep)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            gridMajorStepX: inspectorOptionalNumber(event.target.value),
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Y major
                    <input
                      type="number"
                      min={0.1}
                      step={0.5}
                      value={inspectorNumberInputValue(selectedDiagramConfig.gridMajorStepY ?? selectedDiagramConfig.gridMajorStep)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            gridMajorStepY: inspectorOptionalNumber(event.target.value),
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
              </div>
            ) : selectedDiagramConfig.type === "vector2d" ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vector settings</div>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Label style
                  <select
                    value={vector2dLabelStyle(vector2dMetadata(selectedDiagramConfig).labelStyle)}
                    aria-label={`${selectedBlock.label} vector label style`}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(
                          selectedDiagramConfig,
                          vector2dLabelStylePatch(selectedDiagramConfig, event.target.value as Vector2DLabelStyle),
                        ),
                      })
                    }
                    className={controlClassName}
                  >
                    {VECTOR_2D_LABEL_STYLES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.showAxes ?? true}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                          showAxes: event.target.checked,
                          showArrows: event.target.checked ? selectedDiagramConfig.showArrows : false,
                        }),
                      })
                    }
                  />
                  Axes
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.showGrid ?? true}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, {
                          showGrid: event.target.checked,
                          showMajorGrid: event.target.checked,
                        }),
                      })
                    }
                  />
                  Grid
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedDiagramConfig.equalScale ?? false}
                    onChange={(event) =>
                      onBlockChange(selectedBlock, {
                        graphConfig: updateGraphConfig(selectedDiagramConfig, { equalScale: event.target.checked }),
                      })
                    }
                  />
                  1:1 scale
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    x min
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.xMin)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            xMin: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMin,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    x max
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.xMax)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            xMax: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.xMax,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    y min
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.yMin)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            yMin: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMin,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    y max
                    <input
                      type="number"
                      value={inspectorNumberInputValue(selectedDiagramConfig.yMax)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            yMax: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.yMax,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Width
                    <input
                      type="number"
                      min={160}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            widthPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.widthPx,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Height
                    <input
                      type="number"
                      min={120}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            heightPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_VECTOR_2D_GRAPH.heightPx,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
              </div>
            ) : selectedDiagramConfig.type === "graph3d" ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3D settings</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Width
                    <input
                      type="number"
                      min={240}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.widthPx)}
                      aria-label={`${selectedBlock.label} 3D width`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            widthPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_GRAPH.widthPx,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Height
                    <input
                      type="number"
                      min={180}
                      step={20}
                      value={inspectorNumberInputValue(selectedDiagramConfig.heightPx)}
                      aria-label={`${selectedBlock.label} 3D height`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(selectedDiagramConfig, {
                            heightPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_GRAPH.heightPx,
                          }),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Azimuth
                    <input
                      type="number"
                      step={0.05}
                      value={inspectorNumberInputValue(graph3dViewState(selectedDiagramConfig).az)}
                      aria-label={`${selectedBlock.label} 3D azimuth`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(
                            selectedDiagramConfig,
                            graph3dViewPatch(selectedDiagramConfig, {
                              az: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.az,
                            }),
                          ),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Elevation
                    <input
                      type="number"
                      step={0.05}
                      value={inspectorNumberInputValue(graph3dViewState(selectedDiagramConfig).el)}
                      aria-label={`${selectedBlock.label} 3D elevation`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(
                            selectedDiagramConfig,
                            graph3dViewPatch(selectedDiagramConfig, {
                              el: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.el,
                            }),
                          ),
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Bank
                    <input
                      type="number"
                      step={0.05}
                      value={inspectorNumberInputValue(graph3dViewState(selectedDiagramConfig).bank)}
                      aria-label={`${selectedBlock.label} 3D bank`}
                      onChange={(event) =>
                        onBlockChange(selectedBlock, {
                          graphConfig: updateGraphConfig(
                            selectedDiagramConfig,
                            graph3dViewPatch(selectedDiagramConfig, {
                              bank: inspectorOptionalNumber(event.target.value) ?? DEFAULT_3D_VIEW_STATE.bank,
                            }),
                          ),
                        })
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
                  onClick={() =>
                    onBlockChange(selectedBlock, {
                      graphConfig: updateGraphConfig(selectedDiagramConfig, graph3dResetViewPatch(selectedDiagramConfig)),
                    })
                  }
                >
                  Reset view
                </Button>
              </div>
            ) : selectedDiagramConfig.type === "statsChart" && selectedStatsChartSpec ? (
              <div className="space-y-3 border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chart settings</div>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Chart type
                  <select
                    value={selectedStatsChartSpec.data.chartType}
                    aria-label={`${selectedBlock.label} chart type`}
                    onChange={(event) =>
                      updateSelectedStatsChartData(
                        defaultStatsDataForType(event.target.value as StatsChartType, selectedStatsChartSpec.data),
                      )
                    }
                    className={controlClassName}
                  >
                    {STATS_CHART_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Width
                    <input
                      type="number"
                      min={240}
                      step={20}
                      value={inspectorNumberInputValue(selectedStatsChartSpec.options?.widthPx)}
                      aria-label={`${selectedBlock.label} chart width`}
                      onChange={(event) =>
                        updateSelectedStatsChartOptions({
                          widthPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_STATS_CHART_SPEC.options?.widthPx,
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Height
                    <input
                      type="number"
                      min={180}
                      step={20}
                      value={inspectorNumberInputValue(selectedStatsChartSpec.options?.heightPx)}
                      aria-label={`${selectedBlock.label} chart height`}
                      onChange={(event) =>
                        updateSelectedStatsChartOptions({
                          heightPx: inspectorOptionalNumber(event.target.value) ?? DEFAULT_STATS_CHART_SPEC.options?.heightPx,
                        })
                      }
                      className={controlClassName}
                    />
                  </label>
                </div>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedStatsChartSpec.options?.showGrid ?? true}
                    onChange={(event) => updateSelectedStatsChartOptions({ showGrid: event.target.checked })}
                  />
                  Gridlines
                </label>
                <label className={checkboxLabelClassName}>
                  <input
                    type="checkbox"
                    checked={selectedStatsChartSpec.options?.showFill !== false}
                    onChange={(event) => updateSelectedStatsChartOptions({ showFill: event.target.checked })}
                  />
                  Fill
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Fill colour
                    <input
                      type="color"
                      value={
                        typeof selectedStatsChartSpec.options?.fillColor === "string" ? selectedStatsChartSpec.options.fillColor : "#f5f5f5"
                      }
                      aria-label={`${selectedBlock.label} fill colour`}
                      disabled={selectedStatsChartSpec.options?.showFill === false}
                      onChange={(event) => updateSelectedStatsChartOptions({ fillColor: event.target.value, showFill: true })}
                      className="h-9 rounded-md border border-input bg-background p-1 disabled:opacity-45"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Opacity
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={inspectorNumberInputValue(
                        typeof selectedStatsChartSpec.options?.fillOpacity === "number" ? selectedStatsChartSpec.options.fillOpacity : 1,
                      )}
                      aria-label={`${selectedBlock.label} fill opacity`}
                      disabled={selectedStatsChartSpec.options?.showFill === false}
                      onChange={(event) => {
                        const nextOpacity = inspectorOptionalNumber(event.target.value);
                        updateSelectedStatsChartOptions({
                          fillOpacity:
                            typeof nextOpacity === "number" && Number.isFinite(nextOpacity) ? clamp(nextOpacity, 0, 1) : undefined,
                          showFill: true,
                        });
                      }}
                      className={cn(controlClassName, "disabled:opacity-45")}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="p-3 text-sm text-muted-foreground">No settings</div>
        )}
      </div>
    </aside>
  );
}
