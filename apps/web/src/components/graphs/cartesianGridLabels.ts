import type JXG from "jsxgraph";

/** Keep renderer-owned scale numbers clear of the closed frame without editing the document. */
export function clearAxisNumbersFromGrid(
  board: JXG.Board,
  numbers: JXG.Text[],
  axis: "x" | "y",
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
) {
  const container = board.containerObj.getBoundingClientRect();
  const scaleX = container.width / board.canvasWidth;
  const scaleY = container.height / board.canvasHeight;
  if (!(scaleX > 0 && scaleY > 0) || !numbers.length) return;
  const left = container.left + (board.origin.scrCoords[1] + bounds.xMin * board.unitX) * scaleX;
  const right = container.left + (board.origin.scrCoords[1] + bounds.xMax * board.unitX) * scaleX;
  const top = container.top + (board.origin.scrCoords[2] - bounds.yMax * board.unitY) * scaleY;
  const bottom = container.top + (board.origin.scrCoords[2] - bounds.yMin * board.unitY) * scaleY;
  const gapX = 4 * scaleX,
    gapY = 4 * scaleY;
  const boxes = numbers.map((number) => number.rendNode.getBoundingClientRect());
  const touchesEdge = boxes.some((box) => {
    const crossesVertical = [left, right].some((x) => box.left < x + gapX && box.right > x - gapX);
    const crossesHorizontal = [top, bottom].some((y) => box.top < y + gapY && box.bottom > y - gapY);
    return (
      (crossesVertical && box.bottom > top - gapY && box.top < bottom + gapY) ||
      (crossesHorizontal && box.right > left - gapX && box.left < right + gapX)
    );
  });
  if (!touchesEdge) return;
  // Move the complete row/column together, perpendicular to its axis only.
  const dx = axis === "y" ? left - gapX - Math.max(...boxes.map((box) => box.right)) : 0;
  const dy = axis === "x" ? bottom + gapY - Math.min(...boxes.map((box) => box.top)) : 0;
  for (const number of numbers) number.moveTo([number.X() + dx / (board.unitX * scaleX), number.Y() - dy / (board.unitY * scaleY)]);
}
