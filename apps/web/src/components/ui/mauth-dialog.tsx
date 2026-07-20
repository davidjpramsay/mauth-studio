import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MauthDialogProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  className?: string;
}

const FOCUSABLE_DIALOG_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableDialogElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_DIALOG_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && !element.getAttribute("aria-hidden"),
  );
}

export function MauthDialog({ title, description, children, footer, onClose, className }: MauthDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogElement = dialogRef.current;

    const focusTimer = window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (!dialogElement || (activeElement instanceof HTMLElement && dialogElement.contains(activeElement))) return;
      const [firstFocusable] = focusableDialogElements(dialogElement);
      (firstFocusable ?? dialogElement).focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (!dialogElement) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = focusableDialogElements(dialogElement);
      if (!focusableElements.length) {
        event.preventDefault();
        dialogElement.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement && document.contains(previousActiveElement)) {
        previousActiveElement.focus();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={cn("w-full max-w-lg rounded-xl border bg-background text-foreground shadow-2xl", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <h3 id={titleId} className="truncate text-base font-semibold">
              {title}
            </h3>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="icon" title="Close" aria-label="Close dialog" onClick={onClose}>
            <X />
          </Button>
        </header>
        {children ? <div className="p-4">{children}</div> : null}
        <footer className="flex justify-end gap-2 border-t p-4">{footer}</footer>
      </section>
    </div>
  );
}
