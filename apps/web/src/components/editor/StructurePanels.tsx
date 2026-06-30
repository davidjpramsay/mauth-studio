import { SeparatorHorizontal } from "lucide-react";

import { EDITOR_ACTIVE_PANEL_CLASS, RemoveActionButton } from "@/components/editor/EditorPanels";
import { cn } from "@/lib/utils";

type StructureSectionHeading = {
  id: string;
  title: string;
};

export function PageBreakStructurePanel({ label, active, onRemove }: { label: string; active: boolean; onRemove: () => void }) {
  return (
    <section className={cn("rounded-lg border bg-card p-4 shadow-panel transition-colors", active && EDITOR_ACTIVE_PANEL_CLASS)}>
      <div className="flex items-center gap-2 p-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SeparatorHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">{label}</span>
        </div>
        <RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />
      </div>
    </section>
  );
}

export function SectionHeadingStructurePanel({
  heading,
  active,
  onChange,
  onRemove,
}: {
  heading: StructureSectionHeading;
  active: boolean;
  onChange: (title: string) => void;
  onRemove: () => void;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-4 shadow-panel transition-colors", active && EDITOR_ACTIVE_PANEL_CLASS)}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor={`section-heading-${heading.id}`}>
            Section title
          </label>
          <input
            id={`section-heading-${heading.id}`}
            type="text"
            value={heading.title}
            onChange={(event) => onChange(event.target.value)}
            className="h-11 rounded-md border border-input bg-background px-3 text-base font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            placeholder="Multiple choice"
          />
        </div>
        <RemoveActionButton label="Remove section heading" onRemove={onRemove} />
      </div>
    </section>
  );
}
