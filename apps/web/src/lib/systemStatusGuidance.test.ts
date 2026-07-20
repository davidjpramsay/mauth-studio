import test from "node:test";
import assert from "node:assert/strict";

import { systemStatusActiveFileLabel, systemStatusLauncherGuidance, systemStatusRevisionLabel } from "./systemStatusGuidance.ts";

test("ready guidance promotes the desktop launcher and server controls", () => {
  const guidance = systemStatusLauncherGuidance({
    state: "ready",
    workspace: {
      isExternalDocumentsFolder: false,
      documentsPath: "/Users/teacher/Documents/Mauth/Documents",
      defaultDocumentsPath: "/Users/teacher/Documents/Mauth/Documents",
    },
  });

  assert.equal(guidance.title, "Launcher commands");
  assert.deepEqual(guidance.primaryCommand, { label: "Start desktop launcher", command: "pnpm dev:launch:desktop" });
  assert.deepEqual(
    guidance.commands.map((command) => command.command),
    ["pnpm dev:status", "pnpm dev:stop", "pnpm dev:launch:replace", "pnpm macos:install-launcher --reveal"],
  );
  assert.match(guidance.folderNote, /default documents folder/);
});

test("stale API guidance points to a clean launcher restart", () => {
  const guidance = systemStatusLauncherGuidance({
    state: "stale-api",
    workspace: {
      isExternalDocumentsFolder: true,
      documentsPath: "/Shared/Test 4 - Exam",
      defaultDocumentsPath: "/Users/teacher/Documents/Mauth/Documents",
    },
  });

  assert.equal(guidance.title, "Restart with the launcher");
  assert.deepEqual(guidance.primaryCommand, { label: "Clean restart", command: "pnpm dev:launch:replace" });
  assert.match(guidance.summary, /not the current Mauth API/);
  assert.match(guidance.folderNote, /external documents folder: \/Shared\/Test 4 - Exam/);
});

test("unavailable API guidance tells the user to start Mauth", () => {
  const guidance = systemStatusLauncherGuidance({ state: "unavailable" });

  assert.equal(guidance.title, "Start Mauth");
  assert.deepEqual(guidance.primaryCommand, { label: "Start desktop launcher", command: "pnpm dev:launch:desktop" });
  assert.deepEqual(
    guidance.commands.map((command) => command.command),
    ["pnpm dev:status", "pnpm macos:install-launcher --reveal"],
  );
  assert.equal(guidance.folderNote, "Folder state is not available yet.");
});

test("error and loading guidance use status checks before restart", () => {
  assert.deepEqual(systemStatusLauncherGuidance({ state: "error" }).primaryCommand, {
    label: "Check running servers",
    command: "pnpm dev:status",
  });
  assert.deepEqual(systemStatusLauncherGuidance({ state: "loading" }).primaryCommand, {
    label: "Check running servers",
    command: "pnpm dev:status",
  });
});

test("active file status respects closed editor state", () => {
  assert.equal(
    systemStatusActiveFileLabel({
      editorDocumentOpen: false,
      currentFileName: "Old Exam",
      activeProjectPathLabel: "Documents/Old Exam.test.json",
    }),
    "No file open",
  );
  assert.equal(systemStatusRevisionLabel({ editorDocumentOpen: false, activeProjectFileRevision: 12 }), "No file open");
});

test("active file status prefers the project path for open saved files", () => {
  assert.equal(
    systemStatusActiveFileLabel({
      editorDocumentOpen: true,
      currentFileName: "Year 10 Exam",
      activeProjectPathLabel: "Documents/Year 10 Exam.test.json",
    }),
    "Documents/Year 10 Exam.test.json",
  );
  assert.equal(systemStatusRevisionLabel({ editorDocumentOpen: true, activeProjectFileRevision: 7 }), "7");
});
