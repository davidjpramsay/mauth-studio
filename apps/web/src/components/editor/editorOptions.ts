import type { ChoiceListLayout, ChoiceNumberingStyle, ColumnCount, DiagramAlignment, TableCellAlignment } from "@mauth-studio/shared";

import type { Vector2DLabelStyle } from "../../lib/diagramVector2d";

export const DIAGRAM_TYPES: Array<{ value: string; label: string }> = [
  { value: "graph2d", label: "2D graph" },
  { value: "geometry2d", label: "2D diagram" },
  { value: "vector2d", label: "2D vector graph" },
  { value: "graph3d", label: "3D graph" },
  { value: "image", label: "Image" },
  { value: "geometricConstruction", label: "Geometric" },
  { value: "network", label: "Network" },
  { value: "setDiagram", label: "Venn diagram" },
  { value: "statsChart", label: "Statistics chart" },
];

export const DIAGRAM_TYPE_GROUPS: Array<{ label: string; values: string[] }> = [
  { label: "Coordinate", values: ["graph2d", "vector2d", "graph3d"] },
  { label: "Construction", values: ["geometry2d", "geometricConstruction", "network", "setDiagram"] },
  { label: "Statistics", values: ["statsChart"] },
  { label: "Media", values: ["image"] },
];

export const DIAGRAM_ALIGNMENTS: Array<{ value: DiagramAlignment; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

export const CHOICE_NUMBERING_STYLES: Array<{ value: ChoiceNumberingStyle; label: string }> = [
  { value: "roman", label: "Roman numerals" },
  { value: "upper-alpha", label: "A, B, C" },
  { value: "lower-alpha", label: "a, b, c" },
  { value: "decimal", label: "1, 2, 3" },
  { value: "bullet", label: "Bullets" },
];

export const CHOICE_LIST_LAYOUTS: Array<{ value: ChoiceListLayout; label: string }> = [
  { value: "vertical", label: "Vertical" },
  { value: "two-column", label: "Two columns" },
  { value: "inline", label: "Inline" },
];

export const TABLE_CELL_ALIGNMENTS: Array<{ value: TableCellAlignment; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

export const COLUMN_COUNT_OPTIONS: Array<{ value: ColumnCount; label: string }> = [
  { value: 2, label: "2 columns" },
  { value: 3, label: "3 columns" },
  { value: 4, label: "4 columns" },
];

export const VECTOR_2D_LABEL_STYLES: Array<{ value: Vector2DLabelStyle; label: string }> = [
  { value: "boldLower", label: "Bold lower-case" },
  { value: "arrow", label: "Arrow over points" },
  { value: "custom", label: "Custom LaTeX" },
];
