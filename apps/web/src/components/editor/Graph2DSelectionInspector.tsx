import { useState } from "react";
import type { ContentBlock, GraphConfig, GraphFeature, GraphFunction } from "@mauth-studio/shared";

import {
  GRAPH_COLORS,
  GRAPH_FEATURE_LINE_STYLES,
  GRAPH_INTERSECTION_TARGETS,
  GRAPH_LINE_STYLES,
  graphFunctionLabel,
  graphHeight,
  isRegionFeatureKind,
  isStrokeStyledFeatureKind,
  lockedAspectHeight,
} from "../../lib/diagramGraph2d";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import {
  graphFeatureInspectorLabel,
  graphFeatureLabelModeOptions,
  graphFeaturePatch,
  graphFeatureSolutionOnlyPatch,
  graphFunctionInspectorLabel,
  graphFunctionPatch,
  graphFunctionSolutionOnlyPatch,
  type Graph2DInspectorSelection,
} from "../../lib/graph2dInspectorSelection";
import { graphInspectorWidthPatch, inspectorNumberInputValue, inspectorOptionalNumber } from "../../lib/moduleSettingsPatches";
import { cn } from "../../lib/utils";

function inspectorNumberInputSpinnerMin(min?: number, step?: number) {
  if (step === 1 && typeof min === "number" && Number.isFinite(min) && !Number.isInteger(min)) return Math.floor(min);
  return min;
}

function inspectorNumberInputSpinnerValue(nextValue: string, previousValue: string | number, step?: number, nativeEvent?: Event) {
  if (step !== 1 || nextValue === "") return nextValue;
  const inputType = nativeEvent && "inputType" in nativeEvent ? String((nativeEvent as InputEvent).inputType) : "";
  if (inputType) return nextValue;

  const previous = Number(previousValue);
  const next = Number(nextValue);
  if (!Number.isFinite(previous) || !Number.isFinite(next) || Number.isInteger(previous)) return nextValue;
  if (Math.abs(Math.abs(next - previous) - 1) > 1e-9) return nextValue;

  const previousFraction = previous - Math.trunc(previous);
  const nextFraction = next - Math.trunc(next);
  if (Math.abs(previousFraction - nextFraction) > 1e-9) return nextValue;

  return String(next > previous ? Math.ceil(previous) : Math.floor(previous));
}

function DraftInspectorNumberInput({
  value,
  fallbackValue,
  min,
  step,
  className,
  onChange,
}: {
  value?: number;
  fallbackValue?: number;
  min?: number;
  step?: number;
  className?: string;
  onChange: (value: number | undefined) => void;
}) {
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const displayValue = draftValue ?? inspectorNumberInputValue(value ?? fallbackValue);

  return (
    <input
      type="number"
      min={inspectorNumberInputSpinnerMin(min, step)}
      step={step}
      value={displayValue}
      onChange={(event) => {
        const nextValue = inspectorNumberInputSpinnerValue(event.target.value, displayValue, step, event.nativeEvent);
        setDraftValue(nextValue);
        if (nextValue === "") {
          onChange(undefined);
          return;
        }
        const parsed = Number(nextValue);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => setDraftValue(null)}
      className={className}
    />
  );
}

interface Graph2DSelectionInspectorProps {
  selectedBlock: SelectedEditorBlock;
  selectedDiagramConfig: GraphConfig;
  selection: Graph2DInspectorSelection;
  controlClassName: string;
  checkboxLabelClassName: string;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
}

export function Graph2DSelectionInspector({
  selectedBlock,
  selectedDiagramConfig,
  selection,
  controlClassName,
  checkboxLabelClassName,
  onBlockChange,
  updateGraphConfig,
}: Graph2DSelectionInspectorProps) {
  const {
    functions: selectedGraphFunctions,
    features: selectedGraphFeatures,
    selectedFunction: selectedGraphFunction,
    selectedFeature: selectedGraphFeature,
  } = selection;

  return (
    <div className="space-y-3 border-t pt-3">
      {!selectedGraphFunction && !selectedGraphFeature ? (
        <>
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
        </>
      ) : null}
      {selectedGraphFunction ? (
        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Function display</div>
          <div className="space-y-2">
            {[selectedGraphFunction].map(({ graphFunction, functionIndex }) => {
              const functionLabel = graphFunction.label || graphFunctionLabel(functionIndex);
              const functionDomainMode = graphFunction.domainMode ?? "auto";
              return (
                <details open key={graphFunction.id ?? `function-${functionIndex}`} className="rounded-md border bg-muted/20 px-2 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-foreground">
                    {graphFunctionInspectorLabel(graphFunction, functionIndex)}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={graphFunction.show ?? true}
                        aria-label={`${selectedBlock.label} function ${functionIndex + 1} visible`}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                              functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                show: event.target.checked,
                              }),
                            }),
                          })
                        }
                      />
                      Visible
                    </label>
                    <label className={checkboxLabelClassName}>
                      <input
                        type="checkbox"
                        checked={graphFunction.solutionOnly === true}
                        aria-label={`${selectedBlock.label} function ${functionIndex + 1} show in solutions only`}
                        onChange={(event) =>
                          onBlockChange(selectedBlock, {
                            graphConfig: updateGraphConfig(selectedDiagramConfig, {
                              functions: graphFunctionSolutionOnlyPatch(selectedGraphFunctions, functionIndex, event.target.checked),
                            }),
                          })
                        }
                      />
                      Show in solutions only
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Label
                        <input
                          value={functionLabel}
                          aria-label={`${selectedBlock.label} function ${functionIndex + 1} label`}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                  label: event.target.value,
                                }),
                              }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Colour
                        <input
                          type="color"
                          value={graphFunction.color ?? GRAPH_COLORS[functionIndex % GRAPH_COLORS.length]}
                          aria-label={`${selectedBlock.label} function ${functionIndex + 1} colour`}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                  color: event.target.value,
                                }),
                              }),
                            })
                          }
                          className="h-9 w-full rounded-md border border-input bg-background p-1"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Weight
                        <input
                          type="number"
                          min={0.5}
                          max={10}
                          step={1}
                          value={inspectorNumberInputValue(graphFunction.strokeWidth)}
                          aria-label={`${selectedBlock.label} function ${functionIndex + 1} weight`}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                  strokeWidth: inspectorOptionalNumber(event.target.value),
                                }),
                              }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Line style
                        <select
                          value={graphFunction.strokeStyle ?? "solid"}
                          aria-label={`${selectedBlock.label} function ${functionIndex + 1} line style`}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                  strokeStyle: event.target.value as NonNullable<GraphFunction["strokeStyle"]>,
                                }),
                              }),
                            })
                          }
                          className={controlClassName}
                        >
                          {GRAPH_LINE_STYLES.map((style) => (
                            <option key={style.value} value={style.value}>
                              {style.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {graphFunction.kind !== "piecewise" ? (
                      <div className="grid grid-cols-2 gap-2 border-t pt-2">
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          Domain
                          <select
                            value={functionDomainMode}
                            aria-label={`${selectedBlock.label} function ${functionIndex + 1} domain`}
                            onChange={(event) => {
                              const domainMode = event.target.value as NonNullable<GraphFunction["domainMode"]>;
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  functions: graphFunctionPatch(
                                    selectedGraphFunctions,
                                    functionIndex,
                                    domainMode === "manual"
                                      ? {
                                          domainMode,
                                          domainMin: graphFunction.domainMin ?? selectedDiagramConfig.xMin,
                                          domainMax: graphFunction.domainMax ?? selectedDiagramConfig.xMax,
                                        }
                                      : { domainMode },
                                  ),
                                }),
                              });
                            }}
                            className={controlClassName}
                          >
                            <option value="auto">Auto</option>
                            <option value="manual">Manual</option>
                          </select>
                        </label>
                        {functionDomainMode === "manual" ? (
                          <>
                            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                              Left x
                              <input
                                type="number"
                                step={1}
                                value={inspectorNumberInputValue(graphFunction.domainMin ?? selectedDiagramConfig.xMin)}
                                aria-label={`${selectedBlock.label} function ${functionIndex + 1} left domain`}
                                onChange={(event) =>
                                  onBlockChange(selectedBlock, {
                                    graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                      functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                        domainMin: inspectorOptionalNumber(event.target.value),
                                      }),
                                    }),
                                  })
                                }
                                className={controlClassName}
                              />
                            </label>
                            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                              Right x
                              <input
                                type="number"
                                step={1}
                                value={inspectorNumberInputValue(graphFunction.domainMax ?? selectedDiagramConfig.xMax)}
                                aria-label={`${selectedBlock.label} function ${functionIndex + 1} right domain`}
                                onChange={(event) =>
                                  onBlockChange(selectedBlock, {
                                    graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                      functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                        domainMax: inspectorOptionalNumber(event.target.value),
                                      }),
                                    }),
                                  })
                                }
                                className={controlClassName}
                              />
                            </label>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="space-y-2 border-t pt-2">
                      <label className={checkboxLabelClassName}>
                        <input
                          type="checkbox"
                          checked={graphFunction.showLabel ?? false}
                          aria-label={`${selectedBlock.label} function ${functionIndex + 1} graph label`}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                  showLabel: event.target.checked,
                                }),
                              }),
                            })
                          }
                        />
                        Graph label
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          Label style
                          <select
                            value={graphFunction.labelMode ?? "equation"}
                            aria-label={`${selectedBlock.label} function ${functionIndex + 1} graph label style`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                    labelMode: event.target.value as NonNullable<GraphFunction["labelMode"]>,
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          >
                            <option value="equation">Equation</option>
                            <option value="name">Name only</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          Label x
                          <input
                            type="number"
                            step={1}
                            value={inspectorNumberInputValue(graphFunction.labelX)}
                            aria-label={`${selectedBlock.label} function ${functionIndex + 1} label x`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                    labelX: inspectorOptionalNumber(event.target.value),
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          Label y
                          <input
                            type="number"
                            step={1}
                            value={inspectorNumberInputValue(graphFunction.labelY)}
                            aria-label={`${selectedBlock.label} function ${functionIndex + 1} label y`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  functions: graphFunctionPatch(selectedGraphFunctions, functionIndex, {
                                    labelY: inspectorOptionalNumber(event.target.value),
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      ) : null}
      {selectedGraphFeature ? (
        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feature display</div>
          <div className="space-y-2">
            {[selectedGraphFeature].map(({ feature, featureIndex }) => {
              const isFreeLabel = feature.kind === "label";
              const featureStrokeStyle = feature.strokeStyle ?? (isRegionFeatureKind(feature.kind) ? "none" : "solid");
              const featureLineStyles = isRegionFeatureKind(feature.kind) ? GRAPH_FEATURE_LINE_STYLES : GRAPH_LINE_STYLES;
              const showFeatureStrokeControls = isStrokeStyledFeatureKind(feature.kind);
              const functionOptions = selectedGraphFunctions.map((graphFunction, index) => ({
                value: index,
                label: `${index + 1}: ${graphFunction.label || graphFunctionLabel(index)}`,
              }));
              return (
                <details open key={feature.id ?? `feature-${featureIndex}`} className="rounded-md border bg-muted/20 px-2 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-foreground">
                    {graphFeatureInspectorLabel(feature, featureIndex)}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="space-y-2">
                      <label className={checkboxLabelClassName}>
                        <input
                          type="checkbox"
                          checked={feature.show ?? true}
                          aria-label={`${selectedBlock.label} feature ${featureIndex + 1} visible`}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                features: graphFeaturePatch(selectedGraphFeatures, featureIndex, { show: event.target.checked }),
                              }),
                            })
                          }
                        />
                        Visible
                      </label>
                      <label className={checkboxLabelClassName}>
                        <input
                          type="checkbox"
                          checked={feature.solutionOnly === true}
                          aria-label={`${selectedBlock.label} feature ${featureIndex + 1} show in solutions only`}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                features: graphFeatureSolutionOnlyPatch(selectedGraphFeatures, featureIndex, event.target.checked),
                              }),
                            })
                          }
                        />
                        Show in solutions only
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        {isFreeLabel ? "LaTeX label" : "Label"}
                        <input
                          value={feature.label ?? ""}
                          aria-label={`${selectedBlock.label} feature ${featureIndex + 1} label`}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                features: graphFeaturePatch(selectedGraphFeatures, featureIndex, { label: event.target.value }),
                              }),
                            })
                          }
                          className={controlClassName}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        Colour
                        <input
                          type="color"
                          value={feature.color ?? GRAPH_COLORS[featureIndex % GRAPH_COLORS.length]}
                          aria-label={`${selectedBlock.label} feature ${featureIndex + 1} colour`}
                          onChange={(event) =>
                            onBlockChange(selectedBlock, {
                              graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                features: graphFeaturePatch(selectedGraphFeatures, featureIndex, { color: event.target.value }),
                              }),
                            })
                          }
                          className="h-9 w-full rounded-md border border-input bg-background p-1"
                        />
                      </label>
                      {isFreeLabel ? null : (
                        <>
                          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                            Label display
                            <select
                              value={feature.labelMode ?? "name"}
                              aria-label={`${selectedBlock.label} feature ${featureIndex + 1} label display`}
                              onChange={(event) =>
                                onBlockChange(selectedBlock, {
                                  graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                    features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                      labelMode: event.target.value as NonNullable<GraphFeature["labelMode"]>,
                                    }),
                                  }),
                                })
                              }
                              className={controlClassName}
                            >
                              {graphFeatureLabelModeOptions(feature).map((mode) => (
                                <option key={mode.value} value={mode.value}>
                                  {mode.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {showFeatureStrokeControls ? (
                            <>
                              <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                                Line style
                                <select
                                  value={featureStrokeStyle}
                                  aria-label={`${selectedBlock.label} feature ${featureIndex + 1} line style`}
                                  onChange={(event) =>
                                    onBlockChange(selectedBlock, {
                                      graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                        features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                          strokeStyle: event.target.value as NonNullable<GraphFeature["strokeStyle"]>,
                                        }),
                                      }),
                                    })
                                  }
                                  className={controlClassName}
                                >
                                  {featureLineStyles.map((style) => (
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
                                  max={10}
                                  step={1}
                                  value={inspectorNumberInputValue(feature.strokeWidth)}
                                  disabled={featureStrokeStyle === "none"}
                                  aria-label={`${selectedBlock.label} feature ${featureIndex + 1} weight`}
                                  onChange={(event) =>
                                    onBlockChange(selectedBlock, {
                                      graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                        features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                          strokeWidth: inspectorOptionalNumber(event.target.value),
                                        }),
                                      }),
                                    })
                                  }
                                  className={cn(controlClassName, "disabled:cursor-not-allowed disabled:opacity-60")}
                                />
                              </label>
                            </>
                          ) : null}
                        </>
                      )}
                      {isRegionFeatureKind(feature.kind) ? (
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          Opacity
                          <input
                            type="number"
                            min={0.05}
                            max={0.8}
                            step={1}
                            value={inspectorNumberInputValue(feature.fillOpacity)}
                            aria-label={`${selectedBlock.label} feature ${featureIndex + 1} fill opacity`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                    fillOpacity: inspectorOptionalNumber(event.target.value),
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          />
                        </label>
                      ) : null}
                    </div>
                    {feature.kind === "point" || feature.kind === "label" ? (
                      <div className="grid grid-cols-2 gap-2 border-t pt-2">
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          x
                          <input
                            type="number"
                            step={1}
                            value={inspectorNumberInputValue(feature.x)}
                            aria-label={`${selectedBlock.label} feature ${featureIndex + 1} x`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                    x: inspectorOptionalNumber(event.target.value),
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          y
                          <input
                            type="number"
                            step={1}
                            value={inspectorNumberInputValue(feature.y)}
                            aria-label={`${selectedBlock.label} feature ${featureIndex + 1} y`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                    y: inspectorOptionalNumber(event.target.value),
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          />
                        </label>
                      </div>
                    ) : null}
                    {feature.kind === "line_segment" ? (
                      <div className="grid grid-cols-2 gap-2 border-t pt-2">
                        <label className="col-span-2 flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          Span
                          <select
                            value={feature.span ?? "manual"}
                            aria-label={`${selectedBlock.label} feature ${featureIndex + 1} span`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                    span: event.target.value as NonNullable<GraphFeature["span"]>,
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          >
                            <option value="manual">Manual endpoints</option>
                            <option value="grid">Span grid</option>
                          </select>
                        </label>
                        {[
                          ["Start x", "x1"],
                          ["Start y", "y1"],
                          ["End x", "x2"],
                          ["End y", "y2"],
                        ].map(([label, field]) => (
                          <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                            {label}
                            <input
                              type="number"
                              step={1}
                              value={inspectorNumberInputValue(feature[field as keyof GraphFeature] as number | undefined)}
                              aria-label={`${selectedBlock.label} feature ${featureIndex + 1} ${label.toLowerCase()}`}
                              onChange={(event) =>
                                onBlockChange(selectedBlock, {
                                  graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                    features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                      [field]: inspectorOptionalNumber(event.target.value),
                                    }),
                                  }),
                                })
                              }
                              className={controlClassName}
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {feature.kind === "angle_marker" ? (
                      <div className="grid grid-cols-2 gap-2 border-t pt-2">
                        <label className={cn(checkboxLabelClassName, "col-span-2")}>
                          <input
                            type="checkbox"
                            checked={feature.rightAngle === true}
                            aria-label={`${selectedBlock.label} feature ${featureIndex + 1} right angle`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                    rightAngle: event.target.checked,
                                  }),
                                }),
                              })
                            }
                          />
                          Right angle square
                        </label>
                        {[
                          ["Vertex x", "x"],
                          ["Vertex y", "y"],
                          ["First arm x", "x1"],
                          ["First arm y", "y1"],
                          ["Second arm x", "x2"],
                          ["Second arm y", "y2"],
                          ["Radius", "size"],
                        ].map(([label, field]) => (
                          <label key={field} className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                            {label}
                            <input
                              type="number"
                              min={field === "size" ? 0.05 : undefined}
                              step={1}
                              value={inspectorNumberInputValue(feature[field as keyof GraphFeature] as number | undefined)}
                              aria-label={`${selectedBlock.label} feature ${featureIndex + 1} ${label.toLowerCase()}`}
                              onChange={(event) =>
                                onBlockChange(selectedBlock, {
                                  graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                    features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                      [field]: inspectorOptionalNumber(event.target.value),
                                    } as Partial<GraphFeature>),
                                  }),
                                })
                              }
                              className={controlClassName}
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {feature.kind === "region_between_curves" || feature.kind === "intersection" ? (
                      <div className="grid grid-cols-2 gap-2 border-t pt-2">
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          First function
                          <select
                            value={feature.functionAIndex ?? 0}
                            aria-label={`${selectedBlock.label} feature ${featureIndex + 1} first function`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                    functionAIndex: Number(event.target.value),
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          >
                            {functionOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {feature.kind === "intersection" ? (
                          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                            Intersect with
                            <select
                              value={feature.intersectionTarget ?? "function"}
                              aria-label={`${selectedBlock.label} feature ${featureIndex + 1} intersection target`}
                              onChange={(event) =>
                                onBlockChange(selectedBlock, {
                                  graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                    features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                      intersectionTarget: event.target.value as NonNullable<GraphFeature["intersectionTarget"]>,
                                    }),
                                  }),
                                })
                              }
                              className={controlClassName}
                            >
                              {GRAPH_INTERSECTION_TARGETS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {feature.kind === "region_between_curves" ||
                        (feature.kind === "intersection" && (feature.intersectionTarget ?? "function") === "function") ? (
                          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                            Second function
                            <select
                              value={feature.functionBIndex ?? 1}
                              aria-label={`${selectedBlock.label} feature ${featureIndex + 1} second function`}
                              onChange={(event) =>
                                onBlockChange(selectedBlock, {
                                  graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                    features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                      functionBIndex: Number(event.target.value),
                                    }),
                                  }),
                                })
                              }
                              className={controlClassName}
                            >
                              {functionOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          From x
                          <input
                            type="number"
                            step={1}
                            value={inspectorNumberInputValue(feature.xMin)}
                            aria-label={`${selectedBlock.label} feature ${featureIndex + 1} from x`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                    xMin: inspectorOptionalNumber(event.target.value),
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          To x
                          <input
                            type="number"
                            step={1}
                            value={inspectorNumberInputValue(feature.xMax)}
                            aria-label={`${selectedBlock.label} feature ${featureIndex + 1} to x`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                    xMax: inspectorOptionalNumber(event.target.value),
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          />
                        </label>
                      </div>
                    ) : null}
                    {feature.kind === "region_curve_axis" || feature.kind === "turning_point" || feature.kind === "tangent" ? (
                      <div className="grid grid-cols-2 gap-2 border-t pt-2">
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                          Function
                          <select
                            value={feature.functionIndex ?? 0}
                            aria-label={`${selectedBlock.label} feature ${featureIndex + 1} function`}
                            onChange={(event) =>
                              onBlockChange(selectedBlock, {
                                graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                  features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                    functionIndex: Number(event.target.value),
                                  }),
                                }),
                              })
                            }
                            className={controlClassName}
                          >
                            {functionOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {feature.kind === "region_curve_axis" ? (
                          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                            Axis
                            <select
                              value={feature.axis ?? "x"}
                              aria-label={`${selectedBlock.label} feature ${featureIndex + 1} axis`}
                              onChange={(event) =>
                                onBlockChange(selectedBlock, {
                                  graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                    features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                      axis: event.target.value as NonNullable<GraphFeature["axis"]>,
                                    }),
                                  }),
                                })
                              }
                              className={controlClassName}
                            >
                              <option value="x">x-axis</option>
                              <option value="y">y-axis</option>
                            </select>
                          </label>
                        ) : null}
                        {feature.kind === "tangent" ? (
                          <>
                            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                              x
                              <input
                                type="number"
                                step={1}
                                value={inspectorNumberInputValue(feature.x)}
                                aria-label={`${selectedBlock.label} feature ${featureIndex + 1} tangent x`}
                                onChange={(event) =>
                                  onBlockChange(selectedBlock, {
                                    graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                      features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                        x: inspectorOptionalNumber(event.target.value),
                                      }),
                                    }),
                                  })
                                }
                                className={controlClassName}
                              />
                            </label>
                            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                              y
                              <input
                                type="number"
                                step={1}
                                value={inspectorNumberInputValue(feature.y)}
                                aria-label={`${selectedBlock.label} feature ${featureIndex + 1} tangent y`}
                                onChange={(event) =>
                                  onBlockChange(selectedBlock, {
                                    graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                      features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                        y: inspectorOptionalNumber(event.target.value),
                                      }),
                                    }),
                                  })
                                }
                                className={controlClassName}
                              />
                            </label>
                          </>
                        ) : (
                          <>
                            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                              From x
                              <input
                                type="number"
                                step={1}
                                value={inspectorNumberInputValue(feature.xMin)}
                                aria-label={`${selectedBlock.label} feature ${featureIndex + 1} from x`}
                                onChange={(event) =>
                                  onBlockChange(selectedBlock, {
                                    graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                      features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                        xMin: inspectorOptionalNumber(event.target.value),
                                      }),
                                    }),
                                  })
                                }
                                className={controlClassName}
                              />
                            </label>
                            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                              To x
                              <input
                                type="number"
                                step={1}
                                value={inspectorNumberInputValue(feature.xMax)}
                                aria-label={`${selectedBlock.label} feature ${featureIndex + 1} to x`}
                                onChange={(event) =>
                                  onBlockChange(selectedBlock, {
                                    graphConfig: updateGraphConfig(selectedDiagramConfig, {
                                      features: graphFeaturePatch(selectedGraphFeatures, featureIndex, {
                                        xMax: inspectorOptionalNumber(event.target.value),
                                      }),
                                    }),
                                  })
                                }
                                className={controlClassName}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      ) : null}
      {!selectedGraphFunction && !selectedGraphFeature ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Domain min
              <DraftInspectorNumberInput
                step={1}
                value={selectedDiagramConfig.xMin}
                onChange={(value) =>
                  onBlockChange(selectedBlock, {
                    graphConfig: updateGraphConfig(selectedDiagramConfig, { xMin: value }),
                  })
                }
                className={controlClassName}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Domain max
              <DraftInspectorNumberInput
                step={1}
                value={selectedDiagramConfig.xMax}
                onChange={(value) =>
                  onBlockChange(selectedBlock, {
                    graphConfig: updateGraphConfig(selectedDiagramConfig, { xMax: value }),
                  })
                }
                className={controlClassName}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Range min
              <DraftInspectorNumberInput
                step={1}
                value={selectedDiagramConfig.yMin}
                onChange={(value) =>
                  onBlockChange(selectedBlock, {
                    graphConfig: updateGraphConfig(selectedDiagramConfig, { yMin: value }),
                  })
                }
                className={controlClassName}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Range max
              <DraftInspectorNumberInput
                step={1}
                value={selectedDiagramConfig.yMax}
                onChange={(value) =>
                  onBlockChange(selectedBlock, {
                    graphConfig: updateGraphConfig(selectedDiagramConfig, { yMax: value }),
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
                step={10}
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
                  step={10}
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
              <DraftInspectorNumberInput
                min={0.1}
                step={1}
                value={selectedDiagramConfig.gridMajorStepX}
                fallbackValue={selectedDiagramConfig.gridMajorStep}
                onChange={(value) =>
                  onBlockChange(selectedBlock, {
                    graphConfig: updateGraphConfig(selectedDiagramConfig, {
                      gridMajorStepX: value,
                      axisLabelStepX: value,
                    }),
                  })
                }
                className={controlClassName}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Y major
              <DraftInspectorNumberInput
                min={0.1}
                step={1}
                value={selectedDiagramConfig.gridMajorStepY}
                fallbackValue={selectedDiagramConfig.gridMajorStep}
                onChange={(value) =>
                  onBlockChange(selectedBlock, {
                    graphConfig: updateGraphConfig(selectedDiagramConfig, {
                      gridMajorStepY: value,
                      axisLabelStepY: value,
                    }),
                  })
                }
                className={controlClassName}
              />
            </label>
          </div>
          <label className={checkboxLabelClassName}>
            <input
              type="checkbox"
              checked={selectedDiagramConfig.showMinorGrid ?? false}
              onChange={(event) =>
                onBlockChange(selectedBlock, {
                  graphConfig: updateGraphConfig(selectedDiagramConfig, { showMinorGrid: event.target.checked, showGrid: true }),
                })
              }
            />
            Minor grid
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              X minor
              <DraftInspectorNumberInput
                min={0.1}
                step={1}
                value={selectedDiagramConfig.gridMinorStepX}
                fallbackValue={selectedDiagramConfig.gridMinorStep}
                onChange={(value) =>
                  onBlockChange(selectedBlock, {
                    graphConfig: updateGraphConfig(selectedDiagramConfig, {
                      gridMinorStepX: value,
                    }),
                  })
                }
                className={controlClassName}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              Y minor
              <DraftInspectorNumberInput
                min={0.1}
                step={1}
                value={selectedDiagramConfig.gridMinorStepY}
                fallbackValue={selectedDiagramConfig.gridMinorStep}
                onChange={(value) =>
                  onBlockChange(selectedBlock, {
                    graphConfig: updateGraphConfig(selectedDiagramConfig, {
                      gridMinorStepY: value,
                    }),
                  })
                }
                className={controlClassName}
              />
            </label>
          </div>
        </>
      ) : null}
    </div>
  );
}
