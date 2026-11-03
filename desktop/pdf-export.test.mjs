import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPdfExportService, pdfFileName } from "./pdf-export.mjs";

test("desktop PDF exports are immutable, private, native and readable only by artifact id", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-pdf-test-"));
  let options;
  const bytes = Buffer.from("%PDF-1.7\nfixture\n%%EOF");
  const frame = {};
  const contents = {
    mainFrame: frame,
    printToPDF: async (value) => {
      options = value;
      return bytes;
    },
  };
  const event = { sender: contents, senderFrame: frame };
  const service = createPdfExportService({ directory, getWindow: () => ({ isDestroyed: () => false, webContents: contents }) });
  try {
    await assert.rejects(service.export({ sender: {}, senderFrame: frame }), /main editor/);
    await assert.rejects(service.export({ sender: contents, senderFrame: {} }), /main editor/);
    const a = await service.export(event, { title: "../Test/Student" });
    const b = await service.export(event, { title: "../Test/Student" });
    assert.notEqual(a.path, b.path);
    assert.equal(a.sha256, b.sha256);
    assert.equal(options.preferCSSPageSize, true);
    assert.equal(options.displayHeaderFooter, false);
    assert.equal(options.printBackground, true);
    assert.deepEqual(await fs.readFile(a.path), bytes);
    if (process.platform !== "win32") assert.equal((await fs.stat(a.path)).mode & 0o777, 0o600);
    assert.equal(Buffer.from((await service.read(event, a.id)).blob, "base64").toString(), bytes.toString());
    await assert.rejects(service.read(event, "../../etc/passwd"), /Invalid/);
    assert.equal(pdfFileName("sample.pdf"), "sample.pdf");
    assert.ok(Buffer.byteLength(pdfFileName("📚".repeat(200)), "utf8") < 255);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("native export rejects overlap and releases its lock after a failure", async () => {
  let reject;
  const pending = new Promise((_, fail) => {
    reject = fail;
  });
  const contents = { mainFrame: {}, printToPDF: () => pending };
  const event = { sender: contents, senderFrame: contents.mainFrame };
  const service = createPdfExportService({ directory: "/unused", getWindow: () => ({ isDestroyed: () => false, webContents: contents }) });
  const first = service.export(event);
  await assert.rejects(service.export(event), /already in progress/);
  reject(new Error("Print failed"));
  await assert.rejects(first, /Print failed/);
  contents.printToPDF = async () => Buffer.from("invalid");
  await assert.rejects(service.export(event), /invalid/);
});
