import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";
import { BasicBlockSelectionInspector } from "./BasicBlockSelectionInspector";
import { DiagramSelectionInspector } from "./DiagramSelectionInspector";
import { SolutionSurfaceControls } from "../solutions/SolutionSurfaceControls";
import { basicBlockInspectorSelection } from "../../lib/basicBlockInspectorSelection";
import type { SelectedEditorBlock } from "../../lib/editorBlockSelection";
import { geometry2dInspectorSelection } from "../../lib/geometry2dInspectorSelection";
import { graph2dInspectorSelection } from "../../lib/graph2dInspectorSelection";

export interface SelectionInspectorProps {
  selectedBlock: SelectedEditorBlock | null;
  showSolutions: boolean;
  activeAnchor?: string;
  onActivateAnchor?: (anchor: string) => void;
  onBlockChange: (selection: SelectedEditorBlock, patch: Partial<ContentBlock>) => void;
  onCreateSolutionCopy?: (selection: SelectedEditorBlock) => void;
  createTextBlock: () => ContentBlock;
  diagramTypePatch: (type: string, current: GraphConfig) => Partial<GraphConfig>;
  updateGraphConfig: (graphConfig: GraphConfig, patch: Partial<GraphConfig>) => GraphConfig;
  withGraphDefaults: (graphConfig?: GraphConfig | null) => GraphConfig;
}

export function SelectionInspector({
  selectedBlock,
  showSolutions,
  activeAnchor,
  onActivateAnchor,
  createTextBlock,
  diagramTypePatch,
  updateGraphConfig,
  withGraphDefaults,
  onBlockChange,
  onCreateSolutionCopy,
}: SelectionInspectorProps) {
  if (!selectedBlock) return null;

  const selectedBasicBlock = basicBlockInspectorSelection(selectedBlock.block);
  const selectedDiagramBlock = selectedBlock.block.kind === "diagram" ? selectedBlock.block : null;
  const selectedDiagramConfig = selectedDiagramBlock ? withGraphDefaults(selectedDiagramBlock.graphConfig) : null;
  const selectedGraphSelection =
    selectedDiagramConfig?.type === "graph2d" ? graph2dInspectorSelection(selectedDiagramConfig, activeAnchor) : null;
  const selectedGeometry =
    selectedDiagramConfig?.type === "geometry2d" ? geometry2dInspectorSelection(selectedDiagramConfig, activeAnchor) : null;
  const selectedGeometryChild = selectedGeometry?.child ?? null;
  const selectedGeometryTitle = selectedGeometry?.title ?? null;
  const controlClassName = "h-9 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground";
  const checkboxLabelClassName = "flex items-center gap-2 text-xs font-semibold text-muted-foreground";
  const inspectorTitle = selectedGraphSelection?.title
    ? `${selectedBlock.label} ${selectedGraphSelection.title}`
    : selectedGeometryTitle
      ? `${selectedBlock.label} ${selectedGeometryTitle}`
      : selectedBlock.label;
  const inspectorSummary = selectedGraphSelection?.summary
    ? selectedGraphSelection.summary
    : selectedGeometryChild
      ? "2D diagram element settings"
      : selectedBlock.summary;

  return (
    <aside
      data-inspector-placement="inline"
      className="selection-inspector-pane flex min-h-0 min-w-0 flex-col overflow-hidden border-b bg-card/95 lg:border-b-0 lg:border-r"
    >
      <div className="shrink-0 border-b p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</div>
        <div className="mt-1 truncate text-sm font-semibold">{inspectorTitle}</div>
        <div className="mt-1 text-xs text-muted-foreground">{inspectorSummary}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SolutionSurfaceControls
          selectedBlock={selectedBlock}
          showSolutions={showSolutions}
          controlClassName={controlClassName}
          onBlockChange={onBlockChange}
          onCreateSolutionCopy={onCreateSolutionCopy}
        />
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
            diagramTypePatch={diagramTypePatch}
            updateGraphConfig={updateGraphConfig}
          />
        ) : (
          <div className="p-3 text-sm text-muted-foreground">No settings</div>
        )}
      </div>
    </aside>
  );
}
