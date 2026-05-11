import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, ImagePlus, ListOrdered, PlusCircle, SeparatorHorizontal, Table2, Trash2, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const EDITOR_ACTIVE_PANEL_CLASS = "border-primary/70 bg-primary/[0.03] shadow-[0_0_0_2px_hsl(var(--primary)/0.16)]";
const EDITOR_ACTIVE_HEADER_CLASS = "bg-primary/10 text-primary";
const INSERT_MENU_OPEN_EVENT = "mauth-studio:insert-menu-open";

let nextInsertMenuId = 0;

interface CollapsiblePanelProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  openSignal?: number;
  active?: boolean;
  className?: string;
  bodyClassName?: string;
}

export function CollapsiblePanel({
  title,
  subtitle,
  leading,
  actions,
  children,
  defaultOpen = true,
  openSignal,
  active = false,
  className,
  bodyClassName,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen || openSignal !== undefined);

  useEffect(() => {
    if (openSignal === undefined) return;
    setOpen(true);
  }, [openSignal]);

  return (
    <section className={cn("rounded-md border bg-background transition-colors", className, active && EDITOR_ACTIVE_PANEL_CLASS)}>
      <div
        data-panel-region="header"
        className={cn("flex flex-wrap items-center gap-2 p-2 transition-colors", active && EDITOR_ACTIVE_HEADER_CLASS)}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="size-8 shrink-0"
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </Button>
        {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-36 flex-1 flex-col items-start gap-0.5 text-left"
          aria-expanded={open}
        >
          <span className="block max-w-full truncate text-sm font-semibold">{title}</span>
          {subtitle ? <span className="block max-w-full truncate text-xs text-muted-foreground">{subtitle}</span> : null}
        </button>
        {actions ? <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
      {open ? (
        <div data-panel-region="body" className={cn("border-t p-3", bodyClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function RemoveActionButton({ label, disabled = false, onRemove }: { label: string; disabled?: boolean; onRemove: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
      className="size-8"
    >
      <Trash2 />
    </Button>
  );
}

export interface InsertionAction {
  label: string;
  tooltip?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

export function ContentInsertionActions({
  buttonLabel = "Add",
  className,
  centered = false,
  spaceActionLabel = "Space",
  spaceActionTooltip,
  onAddText,
  onAddChoices,
  onAddTable,
  onAddDiagram,
  onAddSpace,
  extraActions = [],
}: {
  buttonLabel?: "Add";
  className?: string;
  centered?: boolean;
  spaceActionLabel?: string;
  spaceActionTooltip?: string;
  onAddText?: () => void;
  onAddChoices?: () => void;
  onAddTable?: () => void;
  onAddDiagram?: () => void;
  onAddSpace?: () => void;
  extraActions?: InsertionAction[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuIdRef = useRef<string | null>(null);
  if (!menuIdRef.current) {
    nextInsertMenuId += 1;
    menuIdRef.current = `insert-menu-${nextInsertMenuId}`;
  }
  const menuId = menuIdRef.current;
  const [open, setOpen] = useState(false);
  const actionVerb = buttonLabel;
  const actions: InsertionAction[] = [
    onAddText
      ? {
          label: "Text",
          tooltip: `${actionVerb} a text block here`,
          icon: <Type className="size-4" aria-hidden="true" />,
          onClick: onAddText,
        }
      : null,
    onAddChoices
      ? {
          label: "Choice list",
          tooltip: `${actionVerb} answer choices such as i, ii, iii`,
          icon: <ListOrdered className="size-4" aria-hidden="true" />,
          onClick: onAddChoices,
        }
      : null,
    onAddTable
      ? {
          label: "Table",
          tooltip: `${actionVerb} a table with LaTeX-ready cells`,
          icon: <Table2 className="size-4" aria-hidden="true" />,
          onClick: onAddTable,
        }
      : null,
    onAddDiagram
      ? {
          label: "Diagram",
          tooltip: `${actionVerb} a diagram block here`,
          icon: <ImagePlus className="size-4" aria-hidden="true" />,
          onClick: onAddDiagram,
        }
      : null,
    onAddSpace
      ? {
          label: spaceActionLabel,
          tooltip: spaceActionTooltip ?? `${actionVerb} blank working space here`,
          icon: <SeparatorHorizontal className="size-4" aria-hidden="true" />,
          onClick: onAddSpace,
        }
      : null,
    ...extraActions,
  ].filter((action): action is InsertionAction => Boolean(action));

  useLayoutEffect(() => {
    const closeOtherMenus = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== menuId) {
        setOpen(false);
      }
    };

    window.addEventListener(INSERT_MENU_OPEN_EVENT, closeOtherMenus);
    return () => window.removeEventListener(INSERT_MENU_OPEN_EVENT, closeOtherMenus);
  }, [menuId]);

  useLayoutEffect(() => {
    if (!open) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
  }, [open]);

  if (!actions.length) return null;

  return (
    <div className={cn("relative z-20 flex flex-wrap gap-2", centered && "justify-center", open && "z-50", className)}>
      <div
        ref={containerRef}
        className="relative inline-flex"
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
          setOpen(false);
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          className="relative z-10 bg-background shadow-sm"
          onClick={() =>
            setOpen((current) => {
              const nextOpen = !current;
              if (nextOpen) {
                window.dispatchEvent(new CustomEvent(INSERT_MENU_OPEN_EVENT, { detail: menuId }));
              }
              return nextOpen;
            })
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          <PlusCircle data-icon="inline-start" />
          {buttonLabel}
          <ChevronDown className="ml-1 size-4" aria-hidden="true" />
        </Button>
        {open ? (
          <div
            id={menuId}
            role="menu"
            className="absolute left-0 top-full z-[100] mt-2 min-w-48 overflow-hidden rounded-md border border-border bg-card p-1 text-card-foreground shadow-2xl ring-1 ring-slate-900/5 dark:ring-blue-300/10"
          >
            {actions.map((action, index) => (
              <button
                key={`${action.label}-${index}`}
                type="button"
                role="menuitem"
                title={action.tooltip}
                disabled={action.disabled}
                onClick={() => {
                  if (action.disabled) return;
                  setOpen(false);
                  action.onClick();
                }}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action.icon ?? <PlusCircle className="size-4" aria-hidden="true" />}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
