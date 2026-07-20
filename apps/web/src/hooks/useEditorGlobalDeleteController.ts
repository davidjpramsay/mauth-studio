import { useEffect, useRef } from "react";

interface UseEditorGlobalDeleteControllerOptions {
  enabled: boolean;
  fileManagerOpen: boolean;
  activeAnchor: string;
  deleteSelection: (anchor: string) => boolean;
  isDeleteEvent: (event: globalThis.KeyboardEvent) => boolean;
  targetConsumesDelete: (target: EventTarget | null) => boolean;
}

export function useEditorGlobalDeleteController({
  enabled,
  fileManagerOpen,
  activeAnchor,
  deleteSelection,
  isDeleteEvent,
  targetConsumesDelete,
}: UseEditorGlobalDeleteControllerOptions) {
  const deleteActiveSelectionRef = useRef<() => boolean>(() => false);

  deleteActiveSelectionRef.current = () => (enabled ? deleteSelection(activeAnchor) : false);

  useEffect(() => {
    function handleGlobalDelete(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || fileManagerOpen || !isDeleteEvent(event)) return;
      if (targetConsumesDelete(event.target)) return;
      if (!deleteActiveSelectionRef.current()) return;
      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("keydown", handleGlobalDelete);
    return () => window.removeEventListener("keydown", handleGlobalDelete);
  }, [fileManagerOpen, isDeleteEvent, targetConsumesDelete]);
}
