import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";

import { waitForPrintPreviewReady } from "@/lib/printReadiness";

interface UsePrintControllerOptions {
  resolvePrintTitle: () => string;
  setPrintPreviewMounted: (mounted: boolean) => void;
}

export function usePrintController({ resolvePrintTitle, setPrintPreviewMounted }: UsePrintControllerOptions) {
  const originalDocumentTitleRef = useRef<string | null>(null);
  const printRequestRef = useRef(0);

  const setPrintDocumentTitle = useCallback(() => {
    if (originalDocumentTitleRef.current === null) {
      originalDocumentTitleRef.current = document.title;
    }
    document.title = resolvePrintTitle();
  }, [resolvePrintTitle]);

  const printDocument = useCallback(() => {
    const requestId = ++printRequestRef.current;
    setPrintDocumentTitle();
    flushSync(() => setPrintPreviewMounted(true));
    void waitForPrintPreviewReady().then((readiness) => {
      if (requestId !== printRequestRef.current) return;
      if (readiness.timedOut) {
        console.warn(`Print preview timed out with ${readiness.pending} asynchronous surface(s) still loading.`);
      }
      window.print();
    });
  }, [setPrintDocumentTitle, setPrintPreviewMounted]);

  useEffect(() => {
    const handleBeforePrint = () => {
      setPrintDocumentTitle();
      flushSync(() => setPrintPreviewMounted(true));
    };
    const handleAfterPrint = () => {
      setPrintPreviewMounted(false);
      if (originalDocumentTitleRef.current !== null) {
        document.title = originalDocumentTitleRef.current;
        originalDocumentTitleRef.current = null;
      }
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      printRequestRef.current += 1;
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [setPrintDocumentTitle, setPrintPreviewMounted]);

  return printDocument;
}
