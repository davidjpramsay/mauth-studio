import { ImagePlus } from "lucide-react";

import type { InsertionAction } from "@/components/editor/EditorPanels";

const QUICK_INSERT_DIAGRAM_TYPES = [
  { value: "graph2d", label: "2D graph" },
  { value: "statsChart", label: "Statistics chart" },
  { value: "geometry2d", label: "2D diagram" },
  { value: "vector2d", label: "Vector graph" },
  { value: "graph3d", label: "3D graph" },
  { value: "geometricConstruction", label: "Geometric" },
  { value: "network", label: "Network" },
  { value: "setDiagram", label: "Venn diagram" },
  { value: "image", label: "Image" },
];

export function quickDiagramInsertActions(onAddDiagramType: (type: string) => void): InsertionAction[] {
  return QUICK_INSERT_DIAGRAM_TYPES.map((diagramType) => ({
    label: diagramType.label,
    tooltip: `Add ${diagramType.label.toLowerCase()} here`,
    icon: <ImagePlus className="size-4" aria-hidden="true" />,
    onClick: () => onAddDiagramType(diagramType.value),
  }));
}
