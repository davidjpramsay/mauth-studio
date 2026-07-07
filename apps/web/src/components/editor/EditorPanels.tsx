import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  ImagePlus,
  ListOrdered,
  PlusCircle,
  SeparatorHorizontal,
  Table2,
  Trash2,
  Type,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { insertionActionLabel, insertionActionTooltip } from "@/lib/editorInsertionActions";
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
  collapsible?: boolean;
  active?: boolean;
  className?: string;
  bodyClassName?: string;
  onHeaderContextMenu?: (event: MouseEvent<HTMLElement>) => void;
}

export function CollapsiblePanel({
  title,
  subtitle,
  leading,
  actions,
  children,
  defaultOpen = true,
  openSignal,
  collapsible = true,
  active = false,
  className,
  bodyClassName,
  onHeaderContextMenu,
}: CollapsiblePanelProps) {
  const [panelOpen, setPanelOpen] = useState(defaultOpen || openSignal !== undefined);
  const open = collapsible ? panelOpen : true;

  useEffect(() => {
    if (!collapsible || openSignal === undefined) return;
    setPanelOpen(true);
  }, [collapsible, openSignal]);

  return (
    <section className={cn("min-w-0 rounded-md border bg-background transition-colors", className, active && EDITOR_ACTIVE_PANEL_CLASS)}>
      <div
        data-panel-region="header"
        className={cn("flex min-w-0 flex-wrap items-center gap-2 p-2 transition-colors", active && EDITOR_ACTIVE_HEADER_CLASS)}
        onContextMenu={onHeaderContextMenu}
      >
        {collapsible ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setPanelOpen((current) => !current)}
            aria-label={open ? "Collapse panel" : "Expand panel"}
            aria-expanded={open}
            className="size-8 shrink-0"
          >
            {open ? <ChevronDown /> : <ChevronRight />}
          </Button>
        ) : null}
        {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left sm:min-w-36">
          <span className="block max-w-full truncate text-sm font-semibold">{title}</span>
          {subtitle ? <span className="block max-w-full truncate text-xs text-muted-foreground">{subtitle}</span> : null}
        </div>
        {actions ? <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
      {open ? (
        <div data-panel-region="body" className={cn("min-w-0 border-t p-3", bodyClassName)}>
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
  subActions?: InsertionAction[];
  onClick: () => void;
}

export function ContentInsertionActions({
  buttonLabel = "Add",
  className,
  centered = false,
  solutionMode = false,
  spaceActionLabel = "Space",
  spaceActionTooltip,
  onAddText,
  onAddChoices,
  onAddTable,
  onAddDiagram,
  diagramActions = [],
  onAddColumns,
  onAddSpace,
  extraActions = [],
}: {
  buttonLabel?: "Add";
  className?: string;
  centered?: boolean;
  solutionMode?: boolean;
  spaceActionLabel?: string;
  spaceActionTooltip?: string;
  onAddText?: () => void;
  onAddChoices?: () => void;
  onAddTable?: () => void;
  onAddDiagram?: () => void;
  diagramActions?: InsertionAction[];
  onAddColumns?: () => void;
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
  const [openSubmenuIndex, setOpenSubmenuIndex] = useState<number | null>(null);
  const actionVerb = buttonLabel;
  const solutionLabel = (label: string) => insertionActionLabel(label, solutionMode);
  const solutionTooltip = (label: string, fallback: string) => insertionActionTooltip({ actionVerb, label, fallback, solutionMode });
  const actions: InsertionAction[] = [
    onAddText
      ? {
          label: solutionLabel("Text"),
          tooltip: solutionTooltip("text block", `${actionVerb} a text block here`),
          icon: <Type className="size-4" aria-hidden="true" />,
          onClick: onAddText,
        }
      : null,
    onAddChoices
      ? {
          label: solutionLabel("Choice list"),
          tooltip: solutionTooltip("choice list", `${actionVerb} answer choices such as i, ii, iii`),
          icon: <ListOrdered className="size-4" aria-hidden="true" />,
          onClick: onAddChoices,
        }
      : null,
    onAddTable
      ? {
          label: solutionLabel("Table"),
          tooltip: solutionTooltip("table", `${actionVerb} a table with LaTeX-ready cells`),
          icon: <Table2 className="size-4" aria-hidden="true" />,
          onClick: onAddTable,
        }
      : null,
    onAddDiagram
      ? {
          label: solutionLabel("Diagram"),
          tooltip: solutionTooltip("diagram block", `${actionVerb} a diagram block here`),
          icon: <ImagePlus className="size-4" aria-hidden="true" />,
          subActions: diagramActions,
          onClick: onAddDiagram,
        }
      : null,
    onAddColumns
      ? {
          label: solutionLabel("Columns"),
          tooltip: solutionTooltip("columns block", `${actionVerb} a 2-column content container`),
          icon: <Columns3 className="size-4" aria-hidden="true" />,
          onClick: onAddColumns,
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
        setOpenSubmenuIndex(null);
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
      setOpenSubmenuIndex(null);
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
          setOpenSubmenuIndex(null);
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
              } else {
                setOpenSubmenuIndex(null);
              }
              return nextOpen;
            })
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setOpenSubmenuIndex(null);
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
            className="absolute left-0 top-full z-[100] mt-2 min-w-52 overflow-visible rounded-md border border-border bg-card p-1 text-card-foreground shadow-2xl ring-1 ring-slate-900/5 dark:ring-blue-300/10"
          >
            {actions.map((action, index) => {
              const subActions = action.subActions?.filter((subAction) => !subAction.disabled || subAction.subActions?.length) ?? [];
              const hasSubmenu = subActions.length > 0;
              const submenuOpen = openSubmenuIndex === index;
              return (
                <div
                  key={`${action.label}-${index}`}
                  className="relative"
                  onMouseEnter={() => {
                    if (!hasSubmenu) setOpenSubmenuIndex(null);
                  }}
                  onMouseLeave={() => {
                    if (hasSubmenu) setOpenSubmenuIndex((current) => (current === index ? null : current));
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup={hasSubmenu ? "menu" : undefined}
                    aria-expanded={hasSubmenu ? submenuOpen : undefined}
                    disabled={action.disabled}
                    onFocus={() => {
                      if (!hasSubmenu) setOpenSubmenuIndex(null);
                    }}
                    onKeyDown={(event) => {
                      if (hasSubmenu && (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        setOpenSubmenuIndex(index);
                      }
                    }}
                    onClick={() => {
                      if (action.disabled) return;
                      if (hasSubmenu) {
                        setOpenSubmenuIndex((current) => (current === index ? null : index));
                        return;
                      }
                      setOpen(false);
                      setOpenSubmenuIndex(null);
                      action.onClick();
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {action.icon ?? <PlusCircle className="size-4" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">{action.label}</span>
                    {hasSubmenu ? <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
                  </button>
                  {hasSubmenu && submenuOpen ? (
                    <div
                      role="menu"
                      className="absolute left-full top-0 z-[110] min-w-56 overflow-hidden rounded-md border border-border bg-card p-1 text-card-foreground shadow-2xl ring-1 ring-slate-900/5 dark:ring-blue-300/10"
                    >
                      {subActions.map((subAction, subIndex) => (
                        <button
                          key={`${subAction.label}-${subIndex}`}
                          type="button"
                          role="menuitem"
                          disabled={subAction.disabled}
                          onClick={() => {
                            if (subAction.disabled) return;
                            setOpen(false);
                            setOpenSubmenuIndex(null);
                            subAction.onClick();
                          }}
                          className="flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {subAction.icon ?? <PlusCircle className="size-4" aria-hidden="true" />}
                          <span>{subAction.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
