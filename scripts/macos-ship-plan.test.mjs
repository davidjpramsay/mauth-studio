import assert from "node:assert/strict";
import test from "node:test";

import {
  macReleaseArtifactNames,
  macReleaseTag,
  macShipPreflightProblems,
  macUpdateMetadataProblems,
  remoteReleaseAssetProblems,
} from "./macos-ship-plan.mjs";

const ready = {
  version: "0.1.1",
  branch: "main",
  clean: true,
  head: "abc123",
  originMain: "abc123",
  notesExist: true,
  existingRelease: null,
  remoteTagCommit: null,
};

test("mac release names use the package version", () => {
  assert.equal(macReleaseTag("0.1.1"), "v0.1.1");
  assert.deepEqual(macReleaseArtifactNames("0.1.1"), {
    dmg: "Mauth-Studio-0.1.1-arm64.dmg",
    zip: "Mauth-Studio-0.1.1-arm64.zip",
    metadata: "latest-mac.yml",
  });
});

test("ship preflight accepts clean current main and a resumable matching draft", () => {
  assert.deepEqual(macShipPreflightProblems(ready), []);
  assert.deepEqual(
    macShipPreflightProblems({
      ...ready,
      existingRelease: { isDraft: true, targetCommitish: "abc123" },
      remoteTagCommit: "abc123",
    }),
    [],
  );
});

test("ship preflight rejects unsafe or ambiguous release state", () => {
  const problems = macShipPreflightProblems({
    ...ready,
    version: "alpha",
    branch: "feature",
    clean: false,
    originMain: "def456",
    notesExist: false,
    existingRelease: { isDraft: false, targetCommitish: "def456" },
    remoteTagCommit: "def456",
  });
  assert.equal(problems.length, 7);
  assert.match(problems.join("\n"), /valid release version/);
  assert.match(problems.join("\n"), /already publicly released/);
});

test("remote asset verification checks required names, sizes, digests, and extras", () => {
  const local = [{ name: "Mauth.zip", size: 100, sha256: "abc" }];
  assert.deepEqual(remoteReleaseAssetProblems(local, [{ name: "Mauth.zip", size: 100, digest: "sha256:abc" }]), []);
  assert.deepEqual(
    remoteReleaseAssetProblems(local, [
      { name: "Mauth.zip", size: 99, digest: "sha256:def" },
      { name: "extra.txt", size: 1, digest: null },
    ]),
    ["size mismatch for Mauth.zip", "digest mismatch for Mauth.zip", "unexpected remote asset extra.txt"],
  );
});

test("mac updater metadata must point to the exact ZIP bytes", () => {
  const zip = { name: "Mauth-Studio-0.1.1-arm64.zip", size: 100, sha512: "abc" };
  const metadata = {
    path: "Mauth-Studio-0.1.1-arm64.zip",
    sha512: "abc",
    files: [{ url: "Mauth-Studio-0.1.1-arm64.zip", size: 100, sha512: "abc" }],
  };
  assert.deepEqual(macUpdateMetadataProblems(metadata, zip), []);
  assert.deepEqual(
    macUpdateMetadataProblems(
      {
        path: "Wrong.zip",
        sha512: "wrong",
        files: [{ url: "Mauth-Studio-0.1.1-arm64.zip", size: 99, sha512: "wrong" }],
      },
      zip,
    ),
    [
      "metadata SHA-512 does not match Mauth-Studio-0.1.1-arm64.zip",
      "metadata size does not match Mauth-Studio-0.1.1-arm64.zip",
      "metadata path does not reference Mauth-Studio-0.1.1-arm64.zip",
      "metadata top-level SHA-512 does not match Mauth-Studio-0.1.1-arm64.zip",
    ],
  );
});
