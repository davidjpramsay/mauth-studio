import { useEffect, useMemo } from "react";
import type { GraphConfig } from "@mauth-studio/shared";
import JXG from "jsxgraph";

import { graphLabelAttributes } from "./graphTypography";

const DEFAULT_GRAPH_WIDTH = 680;
const DEFAULT_GRAPH_HEIGHT = 300;
const LABEL_ATTRIBUTES = graphLabelAttributes();
const AXIS_3D_LABEL_ATTRIBUTES = {
  label: LABEL_ATTRIBUTES,
  ticks3d: { label: LABEL_ATTRIBUTES },
};

export function Basic3DGraph({ graphConfig }: { graphConfig?: GraphConfig | null }) {
  const boardId = useMemo(() => `jxg-3d-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    const board = JXG.JSXGraph.initBoard(boardId, {
      boundingbox: [-6, 6, 6, -6],
      axis: true,
      showCopyright: false,
      showNavigation: false,
      text: LABEL_ATTRIBUTES,
      defaultAxes: {
        x: { label: LABEL_ATTRIBUTES, ticks: { label: LABEL_ATTRIBUTES } },
        y: { label: LABEL_ATTRIBUTES, ticks: { label: LABEL_ATTRIBUTES } },
      },
    } as Record<string, unknown>);
    try {
      const view = board.create(
        "view3d",
        [
          [-4, -3],
          [8, 8],
          [
            [-5, 5],
            [-5, 5],
            [-5, 5],
          ],
        ],
        {
          xAxis: { point2: { name: "x", label: LABEL_ATTRIBUTES } },
          yAxis: { point2: { name: "y", label: LABEL_ATTRIBUTES } },
          zAxis: { point2: { name: "z", label: LABEL_ATTRIBUTES } },
          xAxisBorder: AXIS_3D_LABEL_ATTRIBUTES,
          yAxisBorder: AXIS_3D_LABEL_ATTRIBUTES,
          zAxisBorder: AXIS_3D_LABEL_ATTRIBUTES,
          ticks3d: { label: LABEL_ATTRIBUTES },
        } as Record<string, unknown>,
      ) as unknown as { create: (type: string, parents: unknown[], attributes?: Record<string, unknown>) => unknown };
      view.create("point3d", [2, 2, 2], { name: "P", label: LABEL_ATTRIBUTES });
    } catch {
      board.create("text", [-4.8, 4.8, "3D graph adapter"], LABEL_ATTRIBUTES);
    }
    return () => JXG.JSXGraph.freeBoard(board);
  }, [boardId]);

  return (
    <div
      id={boardId}
      className="w-full overflow-hidden bg-white"
      style={{
        height: graphConfig?.heightPx ?? DEFAULT_GRAPH_HEIGHT,
        maxWidth: graphConfig?.widthPx ?? DEFAULT_GRAPH_WIDTH,
      }}
    />
  );
}
