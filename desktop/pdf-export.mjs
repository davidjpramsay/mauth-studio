import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const PDF_EXPORT_CHANNEL = "mauth:pdf-export";
export const PDF_READ_CHANNEL = "mauth:pdf-read";
export const MAX_PDF_BYTES = 32 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function pdfFileName(title) {
  let name = String(title || "Mauth export")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\.+$/g, "")
    .trim()
    .slice(0, 150);
  while (Buffer.byteLength(name, "utf8") > 200) name = Array.from(name).slice(0, -1).join("");
  return `${name.replace(/\.pdf$/i, "") || "Mauth export"}.pdf`;
}

export function createPdfExportService({ getWindow, directory }) {
  let busy = false;
  return {
    async export(event, { title } = {}) {
      const window = getWindow();
      if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
        throw new Error("PDF export requires the Mauth main editor.");
      if (busy) throw new Error("A PDF export is already in progress.");
      busy = true;
      try {
        const bytes = await window.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: false,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });
        if (!bytes.length || bytes.length > MAX_PDF_BYTES || bytes.subarray(0, 5).toString() !== "%PDF-")
          throw new Error("The PDF output is empty, invalid or exceeds 32 MiB.");
        const id = randomUUID();
        const folder = path.join(directory, id);
        const filename = pdfFileName(title);
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        await fs.mkdir(folder, { mode: 0o700 });
        const filePath = path.join(folder, filename);
        await fs.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
        return {
          id,
          path: filePath,
          filename,
          mimeType: "application/pdf",
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      } finally {
        busy = false;
      }
    },
    async read(event, id) {
      const window = getWindow();
      if (
        !window ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        typeof id !== "string" ||
        !UUID.test(id)
      )
        throw new Error("Invalid PDF export id or editor.");
      const folder = path.join(directory, id);
      if (!(await fs.lstat(folder)).isDirectory()) throw new Error("Invalid PDF export directory.");
      const entries = await fs.readdir(folder, { withFileTypes: true });
      const file = entries.find((entry) => entry.isFile() && entry.name.endsWith(".pdf"));
      if (!file) throw new Error("PDF export not found.");
      const filePath = path.join(folder, file.name);
      const handle = await fs.open(filePath, "r");
      try {
        const stat = await handle.stat();
        if (stat.size > MAX_PDF_BYTES) throw new Error("PDF exceeds 32 MiB.");
        const bytes = await handle.readFile();
        return { id, filename: file.name, mimeType: "application/pdf", blob: bytes.toString("base64") };
      } finally {
        await handle.close();
      }
    },
  };
}
