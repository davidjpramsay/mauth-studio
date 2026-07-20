import { SelectionInspector, type SelectionInspectorProps } from "@/components/editor/SelectionInspector";

interface EditorInspectorPaneProps extends SelectionInspectorProps {
  open: boolean;
  visible: boolean;
}

export function EditorInspectorPane({ open, visible, ...selectionInspectorProps }: EditorInspectorPaneProps) {
  if (!open) return null;
  if (visible) return <SelectionInspector {...selectionInspectorProps} />;

  return (
    <aside
      data-inspector-placement="inline"
      className="selection-inspector-pane flex min-h-0 min-w-0 flex-col overflow-hidden border-b bg-card/95 lg:border-b-0 lg:border-r"
    >
      <div className="shrink-0 border-b p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</div>
        <div className="mt-1 truncate text-sm font-semibold">No module selected</div>
      </div>
    </aside>
  );
}
