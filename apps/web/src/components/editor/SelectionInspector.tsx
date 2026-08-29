import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";
import { ArrowLeft } from "lucide-react";
import { BasicBlockSelectionInspector } from "./BasicBlockSelectionInspector";
import { DiagramSelectionInspector } from "./DiagramSelectionInspector";
import { SolutionSurfaceControls } from "../solutions/SolutionSurfaceControls";
import { basicBlockInspectorSelection } from "../../lib/basicBlockInspectorSelection";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { geometry2dInspectorSelection } from "../../lib/geometry2dInspectorSelection";
import { graph2dInspectorSelection } from "../../lib/graph2dInspectorSelection";
import { graph3dElementInspectorSelection } from "../../lib/graph3dInspectorSelection";
import type { MauthDialogActions } from "../../hooks/useMauthDialogController";
import { Button } from "../ui/button";

export interface SelectionInspectorProps {
  selectedBlock: SelectedEditorBlock | null;
  showSolutions: boolean;
  showSolutionControls?: boolean;
  activeAnchor?: string;
  onActivateAnchor?: (anchor: string) => void;
  onShowContent?: () => void;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  onCreateSolutionCopy?: (selection: SelectedEditorBlock) => void;
  confirmDiagramTypeChange: MauthDialogActions["confirm"];
  createTextBlock: () => ContentBlock;
  diagramTypePatch: (type: string, current: GraphConfig) => Partial<GraphConfig>;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
}

export function SelectionInspector({
  selectedBlock,
  showSolutions,
  showSolutionControls = true,
  activeAnchor,
  onActivateAnchor,
  onShowContent,
  createTextBlock,
  diagramTypePatch,
  updateGraphConfig,
  withGraphDefaults,
  onBlockChange,
  onCreateSolutionCopy,
  confirmDiagramTypeChange,
}: SelectionInspectorProps) {
  const paneClassName =
    "selection-inspector-pane workspace-control-surface flex min-h-0 min-w-0 flex-col overflow-hidden border-b bg-card/95 lg:border-b-0 lg:border-r";

  if (!selectedBlock) {
    return (
      <aside id="mauth-inspector-pane" data-inspector-placement="inline" data-inspector-state="empty" className={paneClassName}>
        <div className="shrink-0 border-b p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Settings</div>
            {onShowContent ? (
              <Button type="button" variant="ghost" size="sm" className="settings-back-button" onClick={onShowContent}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Content
              </Button>
            ) : null}
          </div>
          <div className="mt-1 text-sm font-semibold">Nothing selected</div>
        </div>
        <div className="p-3 text-sm leading-relaxed text-muted-foreground">
          Select a configurable block in Content, or use its settings button. Answer spaces, choices, tables, columns, and diagrams have
          settings.
        </div>
      </aside>
    );
  }

  const selectedBasicBlock = basicBlockInspectorSelection(selectedBlock.block);
  const selectedDiagramBlock = selectedBlock.block.kind === "diagram" ? selectedBlock.block : null;
  const selectedDiagramConfig = selectedDiagramBlock ? withGraphDefaults(selectedDiagramBlock.graphConfig) : null;
  const selectedGraphSelection =
    selectedDiagramConfig?.type === "graph2d" ? graph2dInspectorSelection(selectedDiagramConfig, activeAnchor) : null;
  const selectedGeometry =
    selectedDiagramConfig?.type === "geometry2d" ? geometry2dInspectorSelection(selectedDiagramConfig, activeAnchor) : null;
  const selectedGraph3dElement =
    selectedDiagramConfig?.type === "graph3d" ? graph3dElementInspectorSelection(selectedDiagramConfig, activeAnchor) : null;
  const selectedGeometryChild = selectedGeometry?.child ?? null;
  const selectedGeometryTitle = selectedGeometry?.title ?? null;
  const controlClassName = "h-9 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground";
  const checkboxLabelClassName = "flex items-center gap-2 text-xs font-semibold text-muted-foreground";
  const inspectorTitle = selectedGraphSelection?.title
    ? `${selectedBlock.label} ${selectedGraphSelection.title}`
    : selectedGeometryTitle
      ? `${selectedBlock.label} ${selectedGeometryTitle}`
      : selectedGraph3dElement
        ? `${selectedBlock.label} ${selectedGraph3dElement.title}`
        : selectedBlock.label;
  const inspectorSummary = selectedGraphSelection?.summary
    ? selectedGraphSelection.summary
    : selectedGeometryChild
      ? "2D diagram element settings"
      : (selectedGraph3dElement?.summary ?? selectedBlock.summary);

  return (
    <aside id="mauth-inspector-pane" data-inspector-placement="inline" data-inspector-state="selection" className={paneClassName}>
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Settings</div>
          {onShowContent ? (
            <Button type="button" variant="ghost" size="sm" className="settings-back-button" onClick={onShowContent}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Content
            </Button>
          ) : null}
        </div>
        <div className="mt-1 truncate text-sm font-semibold">{inspectorTitle}</div>
        <div className="mt-1 text-xs text-muted-foreground">{inspectorSummary}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showSolutionControls ? (
          <SolutionSurfaceControls
            selectedBlock={selectedBlock}
            showSolutions={showSolutions}
            controlClassName={controlClassName}
            onBlockChange={onBlockChange}
            onCreateSolutionCopy={onCreateSolutionCopy}
          />
        ) : null}
        {selectedBasicBlock ? (
          <BasicBlockSelectionInspector
            selectedBlock={selectedBlock}
            selection={selectedBasicBlock}
            controlClassName={controlClassName}
            createTextBlock={createTextBlock}
            onBlockChange={onBlockChange}
          />
        ) : selectedDiagramBlock && selectedDiagramConfig ? (
          <DiagramSelectionInspector
            selectedBlock={selectedBlock}
            selectedDiagramBlock={selectedDiagramBlock}
            selectedDiagramConfig={selectedDiagramConfig}
            selectedGraphSelection={selectedGraphSelection}
            selectedGeometryChild={selectedGeometryChild}
            activeAnchor={activeAnchor}
            controlClassName={controlClassName}
            checkboxLabelClassName={checkboxLabelClassName}
            onActivateAnchor={onActivateAnchor}
            onBlockChange={onBlockChange}
            confirmDiagramTypeChange={confirmDiagramTypeChange}
            diagramTypePatch={diagramTypePatch}
            updateGraphConfig={updateGraphConfig}
          />
        ) : showSolutionControls ? null : (
          <div className="p-3 text-sm text-muted-foreground">This content has no additional settings.</div>
        )}
      </div>
    </aside>
  );
}
