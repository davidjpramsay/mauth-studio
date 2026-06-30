import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const WEB_SRC_ROOT = join(process.cwd(), "apps/web/src");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const NATIVE_BROWSER_DIALOG_RE = /\b(?:window|globalThis|self)\s*\.\s*(?:prompt|confirm|alert)\s*\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return sourceFiles(fullPath);
    if (!stat.isFile()) return [];
    return SOURCE_EXTENSIONS.has(fullPath.slice(fullPath.lastIndexOf("."))) ? [fullPath] : [];
  });
}

test("web source does not call native browser prompt, confirm, or alert APIs", () => {
  const offenders = sourceFiles(WEB_SRC_ROOT).flatMap((filePath) => {
    const source = readFileSync(filePath, "utf8");
    const matches = Array.from(source.matchAll(NATIVE_BROWSER_DIALOG_RE));
    return matches.map((match) => `${relative(WEB_SRC_ROOT, filePath)}:${source.slice(0, match.index).split("\n").length}`);
  });

  assert.deepEqual(offenders, []);
});
