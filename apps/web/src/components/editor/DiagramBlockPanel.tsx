import type { ReactNode } from "react";
import type { DiagramAlignment } from "@mauth-studio/shared";
import { CopyPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CollapsiblePanel, RemoveActionButton } from "./EditorPanels";

interface DiagramTypeOption {
  value: string;
  label: string;
}

interface DiagramTypeGroup {
  label: string;
  values: string[];
}

interface DiagramBlockPanelProps {
  label: string;
  title: ReactNode;
  type: string;
  alignment: DiagramAlignment;
  diagramTypes: DiagramTypeOption[];
  diagramTypeGroups: DiagramTypeGroup[];
  diagramAlignments: Array<{ value: DiagramAlignment; label: string }>;
  children: ReactNode;
  settingsMode?: "inline" | "inspector";
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  bodyClassName?: string;
  completeInSolutionsTitle?: string;
  onTypeChange: (type: string) => void;
  onAlignmentChange: (alignment: DiagramAlignment) => void;
  onCompleteInSolutions?: () => void;
  onRemove: () => void;
}

export function DiagramBlockPanel({
  label,
  title,
  type,
  alignment,
  diagramTypes,
  diagramTypeGroups,
  diagramAlignments,
  children,
  settingsMode = "inline",
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  bodyClassName = "p-3",
  completeInSolutionsTitle,
  onTypeChange,
  onAlignmentChange,
  onCompleteInSolutions,
  onRemove,
}: DiagramBlockPanelProps) {
  const showInlineSettings = settingsMode === "inline";
  const actions = (
    <>
      {onCompleteInSolutions ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          title={completeInSolutionsTitle}
          onClick={(event) => {
            event.stopPropagation();
            onCompleteInSolutions();
          }}
          className="h-8 gap-2"
        >
          <CopyPlus className="size-4" aria-hidden="true" />
          Complete in solutions
        </Button>
      ) : null}
      {showInlineSettings ? (
        <>
          <select
            aria-label={`${label} position`}
            value={alignment}
            onChange={(event) => onAlignmentChange(event.target.value as DiagramAlignment)}
            className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm font-normal"
          >
            {diagramAlignments.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      ) : null}
      <select
        aria-label={`${label} type`}
        value={type}
        onChange={(event) => onTypeChange(event.target.value)}
        className="h-9 w-52 max-w-full rounded-md border border-input bg-background px-2 text-sm font-normal"
      >
        {diagramTypeGroups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.values.map((value) => {
              const diagramType = diagramTypes.find((candidate) => candidate.value === value);
              if (!diagramType) return null;
              return (
                <option key={diagramType.value} value={diagramType.value}>
                  {diagramType.label}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
      <RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />
    </>
  );

  return (
    <CollapsiblePanel
      title={title}
      leading={dragHandle}
      actions={actions}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName={bodyClassName}
      active={active}
      openSignal={openSignal}
    >
      {children}
    </CollapsiblePanel>
  );
}
