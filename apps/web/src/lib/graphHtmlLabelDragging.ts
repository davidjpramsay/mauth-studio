import type JXG from "jsxgraph";
import { showDiagramLabelFeedback } from "./diagramLabelFeedback";

type LabelText = {
  X?: () => number;
  Y?: () => number;
  coords?: { usrCoords?: number[] };
  moveTo?: (coords: [number, number], time?: number) => void;
  isDraggable?: boolean;
  rendNode?: HTMLElement;
};

export function enableHtmlTextDragging(board: JXG.Board, text: unknown, onMove: (x: number, y: number) => void) {
  const label = text as LabelText;
  const node = label.rendNode;
  if (!node?.isConnected || node.dataset.mauthDragBound === "true") return;
  const coordinates = () => {
    const x = label.X?.() ?? label.coords?.usrCoords?.[1];
    const y = label.Y?.() ?? label.coords?.usrCoords?.[2];
    return Number.isFinite(x) && Number.isFinite(y) ? ([x as number, y as number] as [number, number]) : null;
  };
  node.dataset.mauthDragBound = "true";
  label.isDraggable = false;
  Object.assign(node.style, { cursor: "move", pointerEvents: "auto", userSelect: "none", webkitUserSelect: "none", touchAction: "none" });
  node.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || node.dataset.mauthLabelDragging === "true") return;
    const start = coordinates();
    if (!start) return;
    const rect = board.containerObj.getBoundingClientRect();
    const scaleX = rect.width / (board.canvasWidth || rect.width) || 1;
    const scaleY = rect.height / (board.canvasHeight || rect.height) || 1;
    const unitX = (board.unitX || 1) * scaleX;
    const unitY = (board.unitY || 1) * scaleY;
    const startX = event.clientX,
      startY = event.clientY;
    event.preventDefault();
    event.stopPropagation();
    node.setPointerCapture?.(event.pointerId);
    node.dataset.mauthLabelDragging = "true";
    const stopFeedback = showDiagramLabelFeedback(node);
    const move = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId || !node.isConnected) return;
      next.preventDefault();
      label.moveTo?.([start[0] + (next.clientX - startX) / unitX, start[1] - (next.clientY - startY) / unitY], 0);
      board.update();
    };
    const finish = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      node.removeEventListener("lostpointercapture", finish);
      delete node.dataset.mauthLabelDragging;
      stopFeedback();
      if (node.hasPointerCapture?.(event.pointerId)) node.releasePointerCapture?.(event.pointerId);
      if (!node.isConnected) return;
      if (next.type !== "pointerup") {
        label.moveTo?.(start, 0);
        board.update();
        return;
      }
      const position = coordinates();
      if (position) onMove(position[0], position[1]);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    node.addEventListener("lostpointercapture", finish);
  });
}
