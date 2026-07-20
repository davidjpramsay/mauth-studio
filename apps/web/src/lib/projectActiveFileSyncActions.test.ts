import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectFileSummary } from "@mauth-studio/shared";

import { activeProjectFileSyncPlan, runActiveProjectFileSyncAttempt } from "./projectActiveFileSync.ts";

const fileSummary: ProjectFileSummary = {
  id: "file-exam",
  projectId: "local-project",
  parentId: null,
  parentPath: null,
  path: "tests/Exam.test.json",
  name: "Exam.test.json",
  kind: "file",
  fileType: "test",
  metadata: {},
  sortOrder: 0,
  revision: 6,
  sizeBytes: 1024,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

test("active file sync plans current, reload, conflict, and missing states", () => {
  assert.deepEqual(activeProjectFileSyncPlan({ summary: fileSummary, localRevision: 6, dirty: false }), {
    kind: "current",
    remoteRevision: 6,
  });
  assert.deepEqual(activeProjectFileSyncPlan({ summary: fileSummary, localRevision: 5, dirty: false }), {
    kind: "reload",
    remoteRevision: 6,
  });
  assert.deepEqual(activeProjectFileSyncPlan({ summary: fileSummary, localRevision: 5, dirty: true }), {
    kind: "conflict",
    remoteRevision: 6,
  });
  assert.deepEqual(activeProjectFileSyncPlan({ summary: undefined, localRevision: 5, dirty: false }), { kind: "missing" });
});

test("active file sync attempts absorb unavailable errors and report recovery", async () => {
  const unavailable = await runActiveProjectFileSyncAttempt({
    wasUnavailable: false,
    sync: async () => {
      throw new Error("drive unavailable");
    },
  });
  assert.equal(unavailable.outcome, "unavailable");
  assert.equal(unavailable.unavailable, true);
  assert.equal(unavailable.becameUnavailable, true);
  assert.match(String(unavailable.error), /drive unavailable/);

  const recovered = await runActiveProjectFileSyncAttempt({
    wasUnavailable: unavailable.unavailable,
    sync: async () => "current",
  });
  assert.deepEqual(recovered, {
    outcome: "current",
    unavailable: false,
    becameUnavailable: false,
    recovered: true,
  });
});

test("non-availability file errors do not masquerade as a reconnect", async () => {
  const conflict = await runActiveProjectFileSyncAttempt({
    wasUnavailable: true,
    sync: async () => "conflict",
  });
  assert.deepEqual(conflict, {
    outcome: "conflict",
    unavailable: false,
    becameUnavailable: false,
    recovered: false,
  });

  const skipped = await runActiveProjectFileSyncAttempt({
    wasUnavailable: true,
    sync: async () => "skipped",
  });
  assert.equal(skipped.unavailable, true);
  assert.equal(skipped.recovered, false);
});
