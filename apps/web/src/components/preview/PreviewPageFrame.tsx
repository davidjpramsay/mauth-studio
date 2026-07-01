import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function A4PreviewPageFrame({ children, last = false }: { children: ReactNode; last?: boolean }) {
  return <div className={cn("a4-page-frame", last && "a4-page-frame-last")}>{children}</div>;
}
