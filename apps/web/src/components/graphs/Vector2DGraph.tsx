import { useEffect, useMemo } from "react";
import type { GraphConfig } from "@mauth-studio/shared";
import JXG from "jsxgraph";

import { graphLabelAttributes } from "./graphTypography";

const DEFAULT_GRAPH_WIDTH = 680;
const DEFAULT_GRAPH_HEIGHT = 300;
const LABEL_ATTRIBUTES = graphLabelAttributes();

export function Vector2DGraph({ graphConfig }: { graphConfig?: GraphConfig | null }) {
  const boardId = useMemo(() => `jxg-vector-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    const board = JXG.JSXGraph.initBoard(boardId, {
      boundingbox: [graphConfig?.xMin ?? -6, graphConfig?.yMax ?? 6, graphConfig?.xMax ?? 6, graphConfig?.yMin ?? -6],
      axis: true,
      showCopyright: false,
      showNavigation: false,
      text: LABEL_ATTRIBUTES,
      defaultAxes: {
        x: { label: LABEL_ATTRIBUTES, ticks: { label: LABEL_ATTRIBUTES } },
        y: { label: LABEL_ATTRIBUTES, ticks: { label: LABEL_ATTRIBUTES } },
      },
    } as Record<string, unknown>);
    const vector = (graphConfig?.metadata?.vector as [number, number] | undefined) ?? [3, 2];
    board.create("arrow", [[0, 0], vector], { strokeColor: "#b45309", strokeWidth: 3 });
    return () => JXG.JSXGraph.freeBoard(board);
  }, [boardId, graphConfig]);

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
