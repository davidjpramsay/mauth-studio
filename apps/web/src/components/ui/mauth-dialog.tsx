import { useId } from "react";
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

export function MauthDialog({ title, description, children, footer, onClose, className }: MauthDialogProps) {
  const titleId = useId();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={onClose}>
      <section
        className={cn("w-full max-w-lg rounded-xl border bg-background text-foreground shadow-2xl", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <h3 id={titleId} className="truncate text-base font-semibold">
              {title}
            </h3>
            {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
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
