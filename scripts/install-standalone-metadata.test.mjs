import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateLegacyStandaloneMetadata } from "./install-standalone-metadata.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mauth-metadata-migration-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacyMetadata = path.join(root, "legacy");
  fs.mkdirSync(legacyMetadata);
  fs.writeFileSync(path.join(legacyMetadata, "current-test.json"), "older draft");
  return { root, legacyMetadata, copy: (from, to) => fs.cpSync(from, to, { recursive: true }) };
}

test("installing an update preserves populated recovery without workspace.json", (t) => {
  const setup = fixture(t);
  const standaloneMetadata = path.join(setup.root, "shared");
  fs.mkdirSync(standaloneMetadata);
  const draft = path.join(standaloneMetadata, "current-test.json");
  fs.writeFileSync(draft, "current teacher draft");
  assert.equal(
    migrateLegacyStandaloneMetadata({ ...setup, standaloneMetadata, copy: () => assert.fail("must not merge legacy state") }),
    false,
  );
  assert.equal(fs.readFileSync(draft, "utf8"), "current teacher draft");
  assert.deepEqual(fs.readdirSync(standaloneMetadata), ["current-test.json"]);
});

test("first installation migrates legacy state to absent or empty shared roots", (t) => {
  const setup = fixture(t);
  for (const empty of [false, true]) {
    const standaloneMetadata = path.join(setup.root, empty ? "empty" : "absent");
    if (empty) fs.mkdirSync(standaloneMetadata);
    assert.equal(migrateLegacyStandaloneMetadata({ ...setup, standaloneMetadata }), true);
    assert.equal(fs.readFileSync(path.join(standaloneMetadata, "current-test.json"), "utf8"), "older draft");
  }
});

test("missing legacy state does not create a recovery root", (t) => {
  const setup = fixture(t);
  const standaloneMetadata = path.join(setup.root, "new");
  assert.equal(migrateLegacyStandaloneMetadata({ ...setup, legacyMetadata: path.join(setup.root, "missing"), standaloneMetadata }), false);
  assert.equal(fs.existsSync(standaloneMetadata), false);
});
