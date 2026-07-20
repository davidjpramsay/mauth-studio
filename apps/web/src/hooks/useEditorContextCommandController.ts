import { createEditorContextCommandRuntime, type EditorContextCommandRuntimeOptions } from "@/lib/editorContextCommandRuntime";
import { useEditorGlobalDeleteController } from "@/hooks/useEditorGlobalDeleteController";

interface UseEditorContextCommandControllerOptions extends EditorContextCommandRuntimeOptions {
  globalDeleteEnabled: boolean;
  fileManagerOpen: boolean;
  activeGlobalDeleteAnchor: string;
  isDeleteEvent: (event: globalThis.KeyboardEvent) => boolean;
  targetConsumesDelete: (target: EventTarget | null) => boolean;
}

export function useEditorContextCommandController({
  globalDeleteEnabled,
  fileManagerOpen,
  activeGlobalDeleteAnchor,
  isDeleteEvent,
  targetConsumesDelete,
  ...runtimeOptions
}: UseEditorContextCommandControllerOptions) {
  const commands = createEditorContextCommandRuntime(runtimeOptions);

  useEditorGlobalDeleteController({
    enabled: globalDeleteEnabled,
    fileManagerOpen,
    activeAnchor: activeGlobalDeleteAnchor,
    deleteSelection: commands.deleteEditorSelection,
    isDeleteEvent,
    targetConsumesDelete,
  });

  return commands;
}
