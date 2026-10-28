import { useLayoutEffect, useRef, type RefObject } from "react";
import { useStableEvent } from "./useStableEvent";

export type PenroseLabelMove = (id: string, offset: [number, number]) => void;

export function usePenroseLabelDragging(ref: RefObject<HTMLDivElement | null>, svg: string, onMove?: PenroseLabelMove) {
  const commit = useStableEvent((id: string, offset: [number, number]) => onMove?.(id, offset));
  const editable = Boolean(onMove);
  const focusTarget = useRef<string | null>(null);
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container || !editable) return;
    const labels = [...container.querySelectorAll<SVGGElement>("[data-mauth-penrose-label]")];
    let cancelDrag: (() => void) | undefined;
    let focusFrame = 0;
    for (const label of labels) {
      label.style.cursor = "grab";
      label.style.pointerEvents = "bounding-box";
      label.style.touchAction = "none";
      label.style.userSelect = "none";
      label.setAttribute("tabindex", "0");
      label.setAttribute("role", "button");
      label.setAttribute("aria-label", `Move label ${label.dataset.mauthPenroseLabel?.split(".")[0]}`);
      label.setAttribute("aria-description", "Drag or use arrow keys to move this label. Home restores its automatic position.");
      if (label.dataset.mauthPenroseLabel === focusTarget.current) {
        const focus = () => {
          if (
            label.isConnected &&
            label.getClientRects().length &&
            (document.activeElement === document.body || container.contains(document.activeElement))
          )
            label.focus({ preventScroll: true });
        };
        focus();
        // Pagination may settle visibility after child layout effects.
        focusFrame = window.requestAnimationFrame(focus);
      }
    }
    if (labels.length) focusTarget.current = null;
    function target(event: Event) {
      const label = (event.target as Element)?.closest<SVGGElement>("[data-mauth-penrose-label]");
      return label && container?.contains(label) ? label : null;
    }
    function startMove(label: SVGGElement) {
      const root = label.ownerSVGElement;
      const matrix = root?.getScreenCTM();
      if (!root || !matrix) return null;
      const inverse = matrix.inverse();
      const frame = root.getBoundingClientRect();
      const box = label.getBoundingClientRect();
      const start: [number, number] = [Number(label.dataset.labelOffsetX) || 0, Number(label.dataset.labelOffsetY) || 0];
      const id = label.dataset.mauthPenroseLabel!;
      return {
        id,
        start,
        position: (dx: number, dy: number): [number, number] => {
          // Keep labels inside the existing drawing frame. Moving a label must
          // not change page allocation, fit scale or the mathematical layout.
          dx = Math.max(frame.left + 2 - box.left, Math.min(frame.right - 2 - box.right, dx));
          dy = Math.max(frame.top + 2 - box.top, Math.min(frame.bottom - 2 - box.bottom, dy));
          return [start[0] + inverse.a * dx + inverse.c * dy, start[1] + inverse.b * dx + inverse.d * dy];
        },
      };
    }
    function down(event: PointerEvent) {
      if (event.button !== 0 || cancelDrag) return;
      const label = target(event);
      const move = label && startMove(label);
      if (!label || !move) return;
      event.preventDefault();
      event.stopPropagation();
      label.focus({ preventScroll: true });
      label.setPointerCapture(event.pointerId);
      const original = label.getAttribute("transform");
      let position = move.start;
      label.style.cursor = "grabbing";
      function update(next: PointerEvent) {
        if (next.pointerId !== event.pointerId) return;
        next.preventDefault();
        position = move!.position(next.clientX - event.clientX, next.clientY - event.clientY);
        label!.setAttribute("transform", `translate(${position[0]}, ${position[1]})`);
      }
      function cleanup() {
        window.removeEventListener("pointermove", update);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        window.removeEventListener("keydown", escape, true);
        label!.removeEventListener("lostpointercapture", lost);
        cancelDrag = undefined;
        label!.style.cursor = "grab";
        if (label!.hasPointerCapture(event.pointerId)) label!.releasePointerCapture(event.pointerId);
      }
      function cancel() {
        cleanup();
        if (original === null) label!.removeAttribute("transform");
        else label!.setAttribute("transform", original);
      }
      function finish(next: PointerEvent) {
        if (next.pointerId !== event.pointerId) return;
        if (next.type === "pointercancel") return cancel();
        update(next);
        cleanup();
        if (label!.isConnected && Math.hypot(position[0] - move!.start[0], position[1] - move!.start[1]) > 0.01) {
          focusTarget.current = move!.id;
          commit(move!.id, position);
        }
      }
      function escape(next: KeyboardEvent) {
        if (next.key !== "Escape") return;
        next.preventDefault();
        next.stopPropagation();
        cancel();
      }
      function lost() {
        cancel();
      }
      cancelDrag = cancel;
      window.addEventListener("pointermove", update, { passive: false });
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
      window.addEventListener("keydown", escape, true);
      label.addEventListener("lostpointercapture", lost);
    }
    function key(event: KeyboardEvent) {
      const label = target(event);
      const move = label && startMove(label);
      if (!move || cancelDrag) return;
      const step = event.shiftKey ? 10 : 2;
      const direction: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (event.key !== "Home" && !direction[event.key]) return;
      event.preventDefault();
      event.stopPropagation();
      focusTarget.current = move.id;
      commit(move.id, event.key === "Home" ? [0, 0] : move.position(...direction[event.key]));
    }
    const click = (event: MouseEvent) => {
      if (target(event)) event.stopPropagation();
    };
    container.addEventListener("pointerdown", down);
    container.addEventListener("keydown", key);
    container.addEventListener("click", click);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      cancelDrag?.();
      container.removeEventListener("pointerdown", down);
      container.removeEventListener("keydown", key);
      container.removeEventListener("click", click);
    };
  }, [ref, svg, editable, commit]);
}
