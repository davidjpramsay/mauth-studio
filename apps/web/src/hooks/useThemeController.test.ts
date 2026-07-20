import assert from "node:assert/strict";
import test from "node:test";

import { nextThemeMode, normalizeThemeMode, resolvedInitialThemeMode } from "./useThemeController.ts";

test("normalizeThemeMode accepts only supported modes", () => {
  assert.equal(normalizeThemeMode("light"), "light");
  assert.equal(normalizeThemeMode("dark"), "dark");
  assert.equal(normalizeThemeMode("system"), null);
  assert.equal(normalizeThemeMode(null), null);
});

test("resolvedInitialThemeMode prefers stored theme before system preference", () => {
  assert.equal(resolvedInitialThemeMode("light", true), "light");
  assert.equal(resolvedInitialThemeMode("dark", false), "dark");
  assert.equal(resolvedInitialThemeMode(undefined, true), "dark");
  assert.equal(resolvedInitialThemeMode("invalid", false), "light");
});

test("nextThemeMode toggles between light and dark", () => {
  assert.equal(nextThemeMode("light"), "dark");
  assert.equal(nextThemeMode("dark"), "light");
});
