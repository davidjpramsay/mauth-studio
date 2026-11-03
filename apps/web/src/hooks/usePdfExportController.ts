import { useRef, useState, type ComponentProps } from "react";
import { flushSync } from "react-dom";
import type { MauthAgentFileState } from "@mauth-studio/shared";
import type { PaginatedTestPreview } from "@/components/preview/PaginatedTestPreview";
import type { EditorDocumentTab } from "@/lib/editorDocumentTabs";
import type { LogoAsset } from "@/lib/logoLibrary";
import { buildMauthAgentSnapshot } from "@/lib/mauthAgentSnapshot";
import { normalizeDocumentFlow } from "@/lib/editorApplicationRuntime";
import { questionMarks } from "@/lib/editorDocumentToc";
import { investigationTotalMarks } from "@/lib/frontMatterConfig";
import { printFileNameForDocument } from "@/lib/documentFileNaming";
import { printReadinessMessage, waitForPrintPreviewReady } from "@/lib/printReadiness";
import type { MauthAgentBridgeHandlerResult } from "@/lib/useMauthAgentBridge";

const failure = (status: number, code: string, error: string): MauthAgentBridgeHandlerResult => ({
  status,
  body: { success: false, code, error },
});

export function usePdfExportController({
  readTabs,
  activeId,
  readLogos,
}: {
  readTabs: () => EditorDocumentTab[];
  activeId: () => string | null;
  readLogos: () => LogoAsset[];
}) {
  const [preview, setPreview] = useState<ComponentProps<typeof PaginatedTestPreview> | null>(null);
  const busyRef = useRef(false);
  async function exportPdf(payload: Record<string, unknown>): Promise<MauthAgentBridgeHandlerResult> {
    if (!window.mauthDesktop?.exportPdf) return failure(501, "DESKTOP_REQUIRED", "PDF export requires the Mauth desktop app.");
    if (busyRef.current || document.querySelector(".print-preview-stage"))
      return failure(409, "PRINT_BUSY", "Another print or PDF export is in progress.");
    const copy = payload.copy ?? "student";
    if (!["student", "solutions", "teacher"].includes(String(copy))) return failure(400, "INVALID_REQUEST", "Invalid PDF copy.");
    const tab = readTabs().find((item) => item.id === (payload.documentId ?? activeId()));
    if (!tab) return failure(404, "DOCUMENT_NOT_FOUND", "The requested document is not open.");
    if (copy !== "student" && tab.document.frontMatter.titlePageTemplate === "notes")
      return failure(400, "INVALID_REQUEST", "Math Notes have one copy; use student.");
    if (copy === "teacher" && tab.document.frontMatter.titlePageTemplate !== "investigation")
      return failure(400, "INVALID_REQUEST", "Teacher copy is available for investigations; use solutions for a test.");
    // Capture the live tab and shared assets once. Export never activates or edits it.
    const captured = structuredClone(tab.document);
    const logos = structuredClone(readLogos());
    const file: MauthAgentFileState = {
      projectId: tab.project?.id ?? null,
      activePath: tab.filePath,
      activeRevision: tab.revision,
      dirty: tab.dirty,
      saveStatus: tab.dirty ? "dirty" : tab.filePath ? "saved" : "draft",
    };
    const snapshot = buildMauthAgentSnapshot({ document: captured, file, activeDocumentId: tab.id });
    if (payload.baseSnapshotId && payload.baseSnapshotId !== snapshot.snapshotId)
      return failure(409, "STALE_SNAPSHOT", "The document changed; read a fresh snapshot before exporting.");
    busyRef.current = true;
    try {
      const totalMarks =
        captured.frontMatter.titlePageTemplate === "investigation"
          ? investigationTotalMarks(captured.frontMatter.investigation)
          : captured.questions.reduce((sum, question) => sum + questionMarks(question), 0);
      flushSync(() => setPreview({ ...captured, logos, totalMarks, normalizeDocumentFlow, scale: 1, showSolutions: copy !== "student" }));
      const readiness = await waitForPrintPreviewReady();
      if (!readiness.ready) return failure(422, "PRINT_NOT_READY", printReadinessMessage(readiness));
      const stage = document.querySelector(".print-preview-stage");
      const pages = stage?.querySelectorAll(".a4-preview-stack .a4-page").length ?? 0;
      if (!pages) return failure(422, "PRINT_NOT_READY", "The print layout contains no pages.");
      if (stage?.querySelector("[data-mauth-page-overflow]"))
        return failure(422, "PRINT_LAYOUT_OVERFLOW", "A block is taller than its page. Fix the layout before exporting.");
      const title = printFileNameForDocument(captured.frontMatter, tab.title, copy !== "student");
      const contentBytes = new TextEncoder().encode(JSON.stringify({ document: captured, logos }));
      const contentHash = await crypto.subtle.digest("SHA-256", contentBytes);
      const contentSha256 = Array.from(new Uint8Array(contentHash), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const artifact = await window.mauthDesktop.exportPdf({ title });
      return {
        status: 200,
        body: {
          success: true,
          artifact: { ...artifact, pages },
          source: {
            documentId: tab.id,
            snapshotId: snapshot.snapshotId,
            contentSha256,
            path: tab.filePath,
            revision: tab.revision,
            dirty: tab.dirty,
            copy,
          },
        },
      };
    } catch (error) {
      return failure(500, "PDF_EXPORT_FAILED", error instanceof Error ? error.message : "PDF export failed.");
    } finally {
      flushSync(() => setPreview(null));
      busyRef.current = false;
    }
  }
  async function readPdf(payload: Record<string, unknown>): Promise<MauthAgentBridgeHandlerResult> {
    if (!window.mauthDesktop?.readPdf) return failure(501, "DESKTOP_REQUIRED", "PDF retrieval requires the Mauth desktop app.");
    if (typeof payload.id !== "string") return failure(400, "INVALID_REQUEST", "An export id is required.");
    try {
      return { status: 200, body: { success: true, artifact: await window.mauthDesktop.readPdf(payload.id) } };
    } catch {
      return failure(404, "PDF_NOT_FOUND", "The PDF export is unavailable. Export the document again.");
    }
  }
  return { preview, busyRef, exportPdf, readPdf };
}
