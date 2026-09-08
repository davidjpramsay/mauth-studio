import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ContextMenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  actions: ContextMenuAction[];
}

export function ContextMenu({
  menu,
  onClose,
  ariaLabel = "Context actions",
}: {
  menu: ContextMenuState | null;
  onClose: () => void;
  ariaLabel?: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu?.x ?? 0, top: menu?.y ?? 0 });

  useLayoutEffect(() => {
    if (!menu) return;
    const rect = menuRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 288;
    const height = rect?.height ?? 240;
    const margin = 8;
    setPosition({
      left: Math.min(Math.max(margin, menu.x), Math.max(margin, window.innerWidth - width - margin)),
      top: Math.min(Math.max(margin, menu.y), Math.max(margin, window.innerHeight - height - margin)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      className="fixed z-[100] w-60 overflow-hidden rounded-md border bg-card text-card-foreground shadow-xl"
      style={{ left: position.left, top: position.top }}
      data-context-menu
    >
      <div className="py-1">
        {menu.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            className={cn(
              "flex h-9 w-full min-w-0 items-center gap-2 px-3 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-45",
              action.destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent hover:text-accent-foreground",
            )}
            onClick={() => {
              onClose();
              action.onSelect();
            }}
          >
            {action.icon ? <span className="flex size-4 shrink-0 items-center justify-center">{action.icon}</span> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{action.label}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
