import test from "node:test";
import assert from "node:assert/strict";

import {
  browserStorageItem,
  loadBrowserJson,
  newerAutosaveSnapshot,
  persistBrowserSnapshot,
  type BrowserStorageLike,
} from "./browserStorage.ts";

function memoryStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    value(key: string) {
      const stored = values.get(key);
      return stored ? (JSON.parse(stored) as unknown) : null;
    },
  } satisfies BrowserStorageLike & { value(key: string): unknown };
}

test("browserStorageItem reads primary before legacy storage keys", () => {
  const storage = memoryStorage({
    primary: "current",
    legacy: "old",
  });

  assert.equal(browserStorageItem("primary", "legacy", storage), "current");
  assert.equal(browserStorageItem("missing", "legacy", storage), "old");
  assert.equal(browserStorageItem("missing", "none", storage), null);
  assert.equal(browserStorageItem("primary", "legacy", null), null);
});

test("loadBrowserJson parses and normalizes stored JSON safely", () => {
  const storage = memoryStorage({
    good: JSON.stringify({ id: "draft-1" }),
    bad: "{",
  });
  const normalize = (value: unknown) =>
    value && typeof value === "object" && "id" in value ? ({ id: String((value as { id: unknown }).id) } as const) : null;

  assert.deepEqual(loadBrowserJson({ key: "good", normalize, storage }), { id: "draft-1" });
  assert.equal(loadBrowserJson({ key: "bad", normalize, storage }), null);
  assert.equal(loadBrowserJson({ key: "missing", normalize, storage }), null);
  assert.equal(loadBrowserJson({ key: "good", normalize: () => null, storage }), null);
});

test("persistBrowserSnapshot writes an updated timestamp and survives storage failure", () => {
  const storage = memoryStorage();
  assert.equal(persistBrowserSnapshot({ key: "draft", snapshot: { id: "draft-1" }, storage, now: () => "2026-06-30T00:00:00.000Z" }), true);
  assert.deepEqual(storage.value("draft"), {
    id: "draft-1",
    updatedAt: "2026-06-30T00:00:00.000Z",
  });

  assert.equal(
    persistBrowserSnapshot({
      key: "draft",
      snapshot: { id: "draft-2" },
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("full");
        },
      },
    }),
    false,
  );
});

test("newerAutosaveSnapshot prefers real work over blank starters before timestamps", () => {
  const blankOld = { id: "blank-old", blank: true, updatedAt: "2026-06-30T12:00:00.000Z" };
  const workOld = { id: "work-old", blank: false, updatedAt: "2026-06-30T10:00:00.000Z" };
  const workNew = { id: "work-new", blank: false, updatedAt: "2026-06-30T11:00:00.000Z" };
  const isBlank = (snapshot: { blank: boolean }) => snapshot.blank;

  assert.equal(newerAutosaveSnapshot(null, workOld, isBlank), workOld);
  assert.equal(newerAutosaveSnapshot(workOld, null, isBlank), workOld);
  assert.equal(newerAutosaveSnapshot(blankOld, workOld, isBlank), workOld);
  assert.equal(newerAutosaveSnapshot(workOld, blankOld, isBlank), workOld);
  assert.equal(newerAutosaveSnapshot(workOld, workNew, isBlank), workNew);
});
