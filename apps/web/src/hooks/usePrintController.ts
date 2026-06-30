import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";

interface UsePrintControllerOptions {
  resolvePrintTitle: () => string;
  setPrintPreviewMounted: (mounted: boolean) => void;
}

export function usePrintController({ resolvePrintTitle, setPrintPreviewMounted }: UsePrintControllerOptions) {
  const originalDocumentTitleRef = useRef<string | null>(null);

  const setPrintDocumentTitle = useCallback(() => {
    if (originalDocumentTitleRef.current === null) {
      originalDocumentTitleRef.current = document.title;
    }
    document.title = resolvePrintTitle();
  }, [resolvePrintTitle]);

  const printDocument = useCallback(() => {
    setPrintDocumentTitle();
    flushSync(() => setPrintPreviewMounted(true));
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
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
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [setPrintDocumentTitle, setPrintPreviewMounted]);

  return printDocument;
}
