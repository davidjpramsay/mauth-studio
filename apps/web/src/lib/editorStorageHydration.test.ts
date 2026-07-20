import assert from "node:assert/strict";
import test from "node:test";

import { type AutosavedEditorSnapshot, type SavedTest } from "./editorAppPersistence.ts";
import { DEFAULT_FORMATTING_CONFIG } from "./editorFormattingConfig.ts";
import { DEFAULT_FRONT_MATTER } from "./frontMatterConfig.ts";
import { STARTER_LOGOS, type LogoAsset } from "./logoLibrary.ts";
import {
  autosaveProjectFileIdentity,
  autosaveSnapshotFromSavedTest,
  autosaveWithoutProjectFile,
  mergedEditorStorageLogos,
} from "./editorStorageHydration.ts";

const customLogo: LogoAsset = {
  id: "custom",
  name: "Custom School",
  src: "data:image/png;base64,custom",
};

const legacyLogo: LogoAsset = {
  id: "legacy",
  name: "Legacy School",
  src: "data:image/png;base64,legacy",
};

function savedTest(): SavedTest {
  return {
    id: "saved-test",
    name: "Saved Test",
    frontMatter: DEFAULT_FRONT_MATTER,
    questions: [],
    sectionHeadings: [],
    documentFlow: [],
    formattingConfig: DEFAULT_FORMATTING_CONFIG,
    logo: customLogo,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T01:00:00.000Z",
  };
}

test("mergedEditorStorageLogos preserves disk authority and appends missing fallback assets", () => {
  const diskLogo = { ...customLogo, name: "Disk Custom School" };
  const merged = mergedEditorStorageLogos({
    diskLogos: [diskLogo],
    localLogos: [customLogo],
    starterLogos: [STARTER_LOGOS[0]],
    legacySavedTestLogos: [legacyLogo, diskLogo],
  });

  assert.deepEqual(
    merged.map((logo) => [logo.id, logo.name]),
    [
      [diskLogo.id, diskLogo.name],
      [STARTER_LOGOS[0].id, STARTER_LOGOS[0].name],
      [legacyLogo.id, legacyLogo.name],
    ],
  );
});

test("mergedEditorStorageLogos falls back to the local library when disk is empty", () => {
  assert.deepEqual(
    mergedEditorStorageLogos({
      diskLogos: [],
      localLogos: [customLogo],
      starterLogos: [],
      legacySavedTestLogos: [],
    }),
    [customLogo],
  );
});

test("autosaveSnapshotFromSavedTest carries saved content and project identity", () => {
  const source = savedTest();
  const snapshot = autosaveSnapshotFromSavedTest(source, "tests/saved.test.json", 7);

  assert.equal(snapshot.frontMatter, source.frontMatter);
  assert.equal(snapshot.logo, customLogo);
  assert.equal(snapshot.activeProjectFilePath, "tests/saved.test.json");
  assert.equal(snapshot.activeProjectFileRevision, 7);
  assert.equal(snapshot.updatedAt, source.updatedAt);
});

test("autosave identity helpers read and clear project file state", () => {
  const snapshot: AutosavedEditorSnapshot = autosaveSnapshotFromSavedTest(savedTest(), "tests/saved.test.json", 7);
  assert.deepEqual(autosaveProjectFileIdentity(snapshot), {
    filePath: "tests/saved.test.json",
    revision: 7,
  });

  const cleared = autosaveWithoutProjectFile(snapshot);
  assert.deepEqual(autosaveProjectFileIdentity(cleared), { filePath: undefined, revision: undefined });
  assert.equal(cleared.frontMatter, snapshot.frontMatter);
});
