import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ContextMenuAction {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  actions: ContextMenuAction[];
}

export function ContextMenu({ menu, onClose }: { menu: ContextMenuState | null; onClose: () => void }) {
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
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={menu.title}
      className="fixed z-[100] w-72 overflow-hidden rounded-md border bg-card text-card-foreground shadow-xl"
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
              "flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-45",
              action.destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent hover:text-accent-foreground",
            )}
            onClick={() => {
              onClose();
              action.onSelect();
            }}
          >
            {action.icon ? <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">{action.icon}</span> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{action.label}</span>
              {action.description ? <span className="block truncate text-xs text-muted-foreground">{action.description}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
