import { useId } from "react";
import { useModalFocus } from "@/hooks/useModalFocus";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MauthDialogProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}

export function MauthDialog({ title, description, children, footer, onClose, className }: MauthDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useModalFocus(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-background text-foreground shadow-2xl",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <h3 id={titleId} className="break-words text-base font-semibold">
              {title}
            </h3>
            {description ? (
              <div id={descriptionId} className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="icon" title="Close" aria-label="Close dialog" onClick={onClose}>
            <X />
          </Button>
        </header>
        {children ? <div className="min-h-0 overflow-y-auto p-4">{children}</div> : null}
        {footer ? <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t p-4">{footer}</footer> : null}
      </section>
    </div>
  );
}
