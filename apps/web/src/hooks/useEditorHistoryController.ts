import { useRef, useState } from "react";

interface UseEditorHistoryControllerOptions<TSnapshot> {
  historyLimit: number;
  currentSnapshot: () => TSnapshot;
  restoreSnapshot: (snapshot: TSnapshot) => void;
}

export function useEditorHistoryController<TSnapshot>({
  historyLimit,
  currentSnapshot,
  restoreSnapshot,
}: UseEditorHistoryControllerOptions<TSnapshot>) {
  const [historyVersion, setHistoryVersion] = useState(0);
  const undoStackRef = useRef<TSnapshot[]>([]);
  const redoStackRef = useRef<TSnapshot[]>([]);

  function pushEditorHistory() {
    undoStackRef.current = [...undoStackRef.current.slice(-(historyLimit - 1)), currentSnapshot()];
    redoStackRef.current = [];
    setHistoryVersion((current) => current + 1);
  }

  function undoEdit() {
    const snapshot = undoStackRef.current.at(-1);
    if (!snapshot) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current.slice(-(historyLimit - 1)), currentSnapshot()];
    restoreSnapshot(snapshot);
    setHistoryVersion((current) => current + 1);
  }

  function redoEdit() {
    const snapshot = redoStackRef.current.at(-1);
    if (!snapshot) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current.slice(-(historyLimit - 1)), currentSnapshot()];
    restoreSnapshot(snapshot);
    setHistoryVersion((current) => current + 1);
  }

  return {
    canUndo: historyVersion >= 0 && undoStackRef.current.length > 0,
    canRedo: historyVersion >= 0 && redoStackRef.current.length > 0,
    pushEditorHistory,
    undoEdit,
    redoEdit,
  };
}
