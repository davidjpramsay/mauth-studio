import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";

import { printReadinessMessage, waitForPrintPreviewReady } from "@/lib/printReadiness";
import type { MauthDialogActions } from "@/hooks/useMauthDialogController";

interface UsePrintControllerOptions {
  resolvePrintTitle: () => string;
  setPrintPreviewMounted: (mounted: boolean) => void;
  documentKey: string;
  confirm: MauthDialogActions["confirm"];
}

export function usePrintController({ resolvePrintTitle, setPrintPreviewMounted, documentKey, confirm }: UsePrintControllerOptions) {
  const originalDocumentTitleRef = useRef<string | null>(null);
  const printRequestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  const finishPrint = useCallback(() => {
    setPrintPreviewMounted(false);
    if (originalDocumentTitleRef.current !== null) {
      document.title = originalDocumentTitleRef.current;
      originalDocumentTitleRef.current = null;
    }
  }, [setPrintPreviewMounted]);

  const setPrintDocumentTitle = useCallback(() => {
    if (originalDocumentTitleRef.current === null) {
      originalDocumentTitleRef.current = document.title;
    }
    document.title = resolvePrintTitle();
  }, [resolvePrintTitle]);

  const printDocument = useCallback(() => {
    const requestId = ++printRequestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      while (!controller.signal.aborted) {
        setPrintDocumentTitle();
        flushSync(() => setPrintPreviewMounted(true));
        let message: string;
        try {
          const readiness = await waitForPrintPreviewReady({ signal: controller.signal });
          if (requestId !== printRequestRef.current || readiness.cancelled) return;
          if (readiness.ready) {
            window.print();
            return;
          }
          message = printReadinessMessage(readiness);
        } catch {
          message = "The print preview could not be prepared. Nothing has been printed. Please retry.";
        }
        if (controller.signal.aborted) return;
        finishPrint();
        const retry = await confirmRef.current({
          title: "Print preview not ready",
          description: message,
          confirmLabel: "Retry",
          cancelLabel: "Cancel",
        });
        if (!retry || requestId !== printRequestRef.current) return;
      }
    })();
  }, [finishPrint, setPrintDocumentTitle, setPrintPreviewMounted]);

  useEffect(() => {
    return () => {
      printRequestRef.current += 1;
      abortRef.current?.abort();
      finishPrint();
    };
  }, [documentKey, finishPrint]);

  useEffect(() => {
    const handlePrintShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        printDocument();
      }
    };
    window.addEventListener("keydown", handlePrintShortcut);
    return () => window.removeEventListener("keydown", handlePrintShortcut);
  }, [printDocument]);

  useEffect(() => {
    const handleBeforePrint = () => {
      setPrintDocumentTitle();
      flushSync(() => setPrintPreviewMounted(true));
    };
    const handleAfterPrint = finishPrint;

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      printRequestRef.current += 1;
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [finishPrint, setPrintDocumentTitle, setPrintPreviewMounted]);

  return printDocument;
}
