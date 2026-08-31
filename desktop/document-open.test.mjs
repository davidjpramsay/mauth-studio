import assert from "node:assert/strict";
import test from "node:test";

import { canDispatchDocumentOpen, isMauthDocumentPath, mauthDocumentPathsFromCommandLine } from "./document-open.mjs";

test("recognizes canonical and legacy structured Mauth documents", () => {
  assert.equal(isMauthDocumentPath("/Documents/Exam.mauth"), true);
  assert.equal(isMauthDocumentPath("/Documents/Exam.TEST.JSON"), true);
  assert.equal(isMauthDocumentPath("/Documents/Notes.mauth.md"), false);
  assert.equal(isMauthDocumentPath("/Documents/Exam.pdf"), false);
});

test("extracts unique document paths from an Electron command line", () => {
  const paths = mauthDocumentPathsFromCommandLine(["Mauth Studio", "--flag", "/Documents/Exam.mauth", "/Documents/Exam.mauth"]);
  assert.deepEqual(paths, ["/Documents/Exam.mauth"]);
});

test("document-open events wait for the editor rather than the loading page", () => {
  assert.equal(canDispatchDocumentOpen({ windowAvailable: false, editorReady: false, loadingMainFrame: false }), false);
  assert.equal(canDispatchDocumentOpen({ windowAvailable: true, editorReady: false, loadingMainFrame: false }), false);
  assert.equal(canDispatchDocumentOpen({ windowAvailable: true, editorReady: true, loadingMainFrame: true }), false);
  assert.equal(canDispatchDocumentOpen({ windowAvailable: true, editorReady: true, loadingMainFrame: false }), true);
});
