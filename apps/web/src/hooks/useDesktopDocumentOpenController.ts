import { useEffect, useRef } from "react";
import { createDocumentOpenQueue } from "@/lib/documentOpenQueue";

export function useDesktopDocumentOpenController(openDocument: (filePath: string) => Promise<unknown>, ready = true) {
  const openRef = useRef(openDocument);
  openRef.current = openDocument;
  const queueRef = useRef<ReturnType<typeof createDocumentOpenQueue> | null>(null);
  if (!queueRef.current)
    queueRef.current = createDocumentOpenQueue(
      (path) => openRef.current(path),
      (error) => console.error("Document open failed", error),
    );
  useEffect(() => {
    queueRef.current?.setReady(ready);
    return () => queueRef.current?.setReady(false);
  }, [ready]);
  useEffect(() => {
    const desktop = window.mauthDesktop;
    if (!desktop) return;
    return desktop.onOpenDocument((filePath) => queueRef.current?.enqueue(filePath));
  }, []);
}
