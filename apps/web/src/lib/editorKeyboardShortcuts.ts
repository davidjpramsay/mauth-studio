import type { KeyboardEvent } from "react";

import type { MoveDirection } from "@/lib/documentNavigation";

export function keyboardMoveDirection(event: KeyboardEvent<HTMLElement>): MoveDirection | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === "ArrowUp") return -1;
  if (event.key === "ArrowDown") return 1;
  return null;
}

export function keyboardDeleteRequested(event: KeyboardEvent<HTMLElement>) {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === "Delete" || event.key === "Backspace");
}

export function nativeKeyboardDeleteRequested(event: globalThis.KeyboardEvent) {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === "Delete" || event.key === "Backspace");
}
