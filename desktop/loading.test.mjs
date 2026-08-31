import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DESKTOP_DIR = path.dirname(fileURLToPath(import.meta.url));

test("startup loading page is local, restrained, and accessible", () => {
  const loadingPage = fs.readFileSync(path.join(DESKTOP_DIR, "loading.html"), "utf8");

  assert.match(loadingPage, /<title>Starting Mauth Studio<\/title>/);
  assert.match(loadingPage, /role="progressbar"/);
  assert.match(loadingPage, /prefers-reduced-motion/);
  assert.doesNotMatch(loadingPage, /(?:src|href)=["']https?:\/\//);
});
