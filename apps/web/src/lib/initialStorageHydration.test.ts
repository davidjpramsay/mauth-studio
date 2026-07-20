import assert from "node:assert/strict";
import test from "node:test";

import { hydrateInitialStorage, type InitialStorageHydrationRuntime } from "./initialStorageHydration.ts";

interface LegacySavedTest {
  id: string;
  logo?: LogoAsset;
}

interface LogoAsset {
  id: string;
}

interface AutosaveSnapshot {
  id: string;
  activeProjectFilePath?: string;
  activeProjectFileRevision?: number;
  documentOpen?: boolean;
}

interface StorageConflict {
  filePath: string;
}

function runtime(
  patch: Partial<InitialStorageHydrationRuntime<LegacySavedTest, LogoAsset, AutosaveSnapshot, StorageConflict>> = {},
): InitialStorageHydrationRuntime<LegacySavedTest, LogoAsset, AutosaveSnapshot, StorageConflict> {
  return {
    loadDiskStorage: async () => ({ legacySavedTests: [], logos: [], autosave: null }),
    fallbackLegacySavedTests: [],
    currentLogos: () => [],
    starterLogos: [],
    legacySavedTestLogo: (savedTest) => savedTest.logo,
    shouldSeedStarterLogos: () => false,
    mergeLegacySavedTests: (diskLegacySavedTests, fallbackLegacySavedTests) => [...diskLegacySavedTests, ...fallbackLegacySavedTests],
    buildMergedLogos: ({ diskLogos, localLogos, starterLogos, legacySavedTestLogos }) =>
      [...diskLogos, ...localLogos, ...starterLogos, ...legacySavedTestLogos].filter(Boolean) as LogoAsset[],
    persistMergedStorage: () => undefined,
    saveLogoToDisk: async () => undefined,
    loadBrowserAutosave: () => null,
    newerAutosave: (browserAutosave, diskAutosave) => browserAutosave ?? diskAutosave,
    isClosedAutosave: (autosave) => autosave.documentOpen === false,
    clearAutosaveProjectFile: (autosave) => ({
      ...autosave,
      activeProjectFilePath: undefined,
      activeProjectFileRevision: undefined,
    }),
    autosaveProjectFileRevision: (autosave) => ({
      filePath: autosave.activeProjectFilePath,
      revision: autosave.activeProjectFileRevision,
    }),
    resolveAutosaveAgainstProjectFile: async (autosave) => ({ snapshot: autosave, project: null, cleanFingerprint: null, conflict: null }),
    restoreAutosave: () => undefined,
    setStorageHydrated: () => undefined,
    setDraftAutosaveStatus: () => undefined,
    setDraftAutosaveMessage: () => undefined,
    ...patch,
  };
}

test("hydrateInitialStorage merges legacy data, persists logos, and restores resolved autosave", async () => {
  const savedLogoCalls: string[] = [];
  const restored: Array<{
    autosave: AutosaveSnapshot;
    cleanFingerprint: string | null;
    conflict: StorageConflict | null;
  }> = [];
  const statuses: string[] = [];
  const messages: string[] = [];
  const hydrated: boolean[] = [];

  await hydrateInitialStorage(
    runtime({
      loadDiskStorage: async () => ({
        legacySavedTests: [{ id: "disk", logo: { id: "legacy-logo" } }],
        logos: [{ id: "disk-logo" }],
        autosave: { id: "disk-autosave", activeProjectFilePath: "tests/Exam.test.json", activeProjectFileRevision: 3 },
      }),
      fallbackLegacySavedTests: [{ id: "fallback" }],
      currentLogos: () => [{ id: "local-logo" }],
      starterLogos: [{ id: "starter-logo" }],
      shouldSeedStarterLogos: () => true,
      persistMergedStorage: (legacySavedTests, logos) => {
        assert.deepEqual(
          legacySavedTests.map((savedTest) => savedTest.id),
          ["disk", "fallback"],
        );
        assert.deepEqual(
          logos.map((logo) => logo.id),
          ["disk-logo", "local-logo", "starter-logo", "legacy-logo"],
        );
      },
      saveLogoToDisk: async (logo) => {
        savedLogoCalls.push(logo.id);
      },
      resolveAutosaveAgainstProjectFile: async () => ({
        snapshot: { id: "resolved-autosave", activeProjectFilePath: "tests/Exam.test.json", activeProjectFileRevision: 4 },
        project: null,
        cleanFingerprint: "clean-fingerprint",
        conflict: { filePath: "tests/Exam.test.json" },
      }),
      restoreAutosave: (args) => {
        restored.push(args);
      },
      setDraftAutosaveStatus: (status) => statuses.push(status),
      setDraftAutosaveMessage: (message) => messages.push(message),
      setStorageHydrated: (value) => hydrated.push(value),
    }),
  );

  assert.deepEqual(savedLogoCalls, ["disk-logo", "local-logo", "starter-logo", "legacy-logo"]);
  assert.deepEqual(restored, [
    {
      autosave: { id: "resolved-autosave", activeProjectFilePath: "tests/Exam.test.json", activeProjectFileRevision: 4 },
      project: null,
      cleanFingerprint: "clean-fingerprint",
      conflict: { filePath: "tests/Exam.test.json" },
    },
  ]);
  assert.deepEqual(statuses, ["ready"]);
  assert.deepEqual(messages, ["Draft autosave ready"]);
  assert.deepEqual(hydrated, [true]);
});

test("hydrateInitialStorage clears project-file identity from closed autosaves", async () => {
  let resolveCount = 0;
  const restored: AutosaveSnapshot[] = [];

  await hydrateInitialStorage(
    runtime({
      loadDiskStorage: async () => ({
        legacySavedTests: [],
        logos: [],
        autosave: {
          id: "closed-autosave",
          documentOpen: false,
          activeProjectFilePath: "tests/Closed.test.json",
          activeProjectFileRevision: 8,
        },
      }),
      resolveAutosaveAgainstProjectFile: async (autosave) => {
        resolveCount += 1;
        return { snapshot: autosave, project: null, cleanFingerprint: null, conflict: null };
      },
      restoreAutosave: ({ autosave }) => restored.push(autosave),
    }),
  );

  assert.equal(resolveCount, 0);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, "closed-autosave");
  assert.equal(restored[0].documentOpen, false);
  assert.equal(restored[0].activeProjectFilePath, undefined);
  assert.equal(restored[0].activeProjectFileRevision, undefined);
});

test("hydrateInitialStorage reports unavailable storage when disk hydration fails", async () => {
  const statuses: string[] = [];
  const messages: string[] = [];
  const hydrated: boolean[] = [];

  await hydrateInitialStorage(
    runtime({
      loadDiskStorage: async () => {
        throw new Error("API down");
      },
      restoreAutosave: () => {
        throw new Error("restore should not run");
      },
      setDraftAutosaveStatus: (status) => statuses.push(status),
      setDraftAutosaveMessage: (message) => messages.push(message),
      setStorageHydrated: (value) => hydrated.push(value),
    }),
  );

  assert.deepEqual(statuses, ["unavailable"]);
  assert.deepEqual(messages, ["API unavailable: using browser backup only"]);
  assert.deepEqual(hydrated, [true]);
});

test("hydrateInitialStorage suppresses side effects when cancelled after disk load", async () => {
  const persisted: string[] = [];
  const hydrated: boolean[] = [];

  await hydrateInitialStorage(
    runtime({
      loadDiskStorage: async () => ({ legacySavedTests: [{ id: "disk" }], logos: [], autosave: null }),
      persistMergedStorage: (legacySavedTests) => {
        persisted.push(...legacySavedTests.map((savedTest) => savedTest.id));
      },
      setStorageHydrated: (value) => hydrated.push(value),
      isCancelled: () => true,
    }),
  );

  assert.deepEqual(persisted, []);
  assert.deepEqual(hydrated, []);
});
