import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { CollapsiblePanel, RemoveActionButton } from "./EditorPanels";

interface SpaceBlockEditorProps {
  label: string;
  title: ReactNode;
  lines: number;
  settingsMode?: "inline" | "inspector";
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  onChange: (lines: number) => void;
  onRemove: () => void;
}

function normalizeSpaceLines(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : 3;
}

export function SpaceBlockEditor({
  label,
  title,
  lines,
  settingsMode = "inline",
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  onChange,
  onRemove,
}: SpaceBlockEditorProps) {
  const normalizedLines = normalizeSpaceLines(lines);
  const showInlineSettings = settingsMode === "inline";

  return (
    <CollapsiblePanel
      title={title}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName={showInlineSettings ? "p-3" : "hidden"}
      collapsible={false}
      active={active}
      openSignal={openSignal}
    >
      {showInlineSettings ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,11rem)_minmax(0,10rem)]">
          <label className="flex max-w-40 flex-col gap-2 text-xs font-medium">
            Lines
            <input
              type="number"
              min={0}
              step={1}
              value={normalizedLines}
              onChange={(event) => onChange(normalizeSpaceLines(event.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </div>
      ) : null}
    </CollapsiblePanel>
  );
}
