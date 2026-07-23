import { useEffect } from "react";

export function useDesktopDocumentOpenController(openDocument: (filePath: string) => void | Promise<void>) {
  useEffect(() => {
    const desktop = window.mauthDesktop;
    if (!desktop) return;
    return desktop.onOpenDocument((filePath) => void openDocument(filePath));
  }, [openDocument]);
}
