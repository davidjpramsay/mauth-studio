import { SelectionInspector, type SelectionInspectorProps } from "@/components/editor/SelectionInspector";

interface EditorInspectorPaneProps extends SelectionInspectorProps {
  open: boolean;
  visible: boolean;
}

export function EditorInspectorPane({ open, visible, ...selectionInspectorProps }: EditorInspectorPaneProps) {
  if (!open) return null;
  return <SelectionInspector {...selectionInspectorProps} selectedBlock={visible ? selectionInspectorProps.selectedBlock : null} />;
}
