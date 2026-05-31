import type { ReactNode } from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CollapsiblePanel, RemoveActionButton } from "./EditorPanels";

interface TextBlockEditorProps {
  label: string;
  title: ReactNode;
  text: string;
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  minHeightClassName: string;
  onChange: (text: string) => void;
  onRemove: () => void;
}

export function TextBlockEditor({
  label,
  title,
  text,
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  minHeightClassName,
  onChange,
  onRemove,
}: TextBlockEditorProps) {
  return (
    <CollapsiblePanel
      title={title}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
      active={active}
      openSignal={openSignal}
    >
      <div className="flex flex-col gap-2">
        <Textarea
          aria-label={label}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={cn("font-mono", minHeightClassName)}
        />
      </div>
    </CollapsiblePanel>
  );
}
