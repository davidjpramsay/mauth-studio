const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function macReleaseTag(version) {
  return `v${version}`;
}

export function macReleaseArtifactNames(version) {
  return {
    dmg: `Mauth-Studio-${version}-arm64.dmg`,
    zip: `Mauth-Studio-${version}-arm64.zip`,
    metadata: "latest-mac.yml",
  };
}

export function macShipPreflightProblems({
  version,
  branch,
  clean,
  head,
  originMain,
  notesExist,
  existingRelease = null,
  remoteTagCommit = null,
}) {
  const problems = [];
  if (!VERSION_PATTERN.test(version || "")) problems.push("package.json must contain a valid release version");
  if (branch !== "main") problems.push("macos:ship must run from the main branch");
  if (!clean) problems.push("the Git worktree must be clean");
  if (!head || head !== originMain) problems.push("main must match origin/main exactly");
  if (!notesExist) problems.push(`docs/releases/${macReleaseTag(version)}.md is required`);
  if (remoteTagCommit && remoteTagCommit !== head) problems.push(`${macReleaseTag(version)} already points to another commit`);
  if (existingRelease && !existingRelease.isDraft) problems.push(`${macReleaseTag(version)} is already publicly released`);
  if (existingRelease?.isDraft && existingRelease.targetCommitish !== head) {
    problems.push(`the existing ${macReleaseTag(version)} draft targets another commit`);
  }
  return problems;
}

export function remoteReleaseAssetProblems(localAssets, remoteAssets) {
  const remoteByName = new Map(remoteAssets.map((asset) => [asset.name, asset]));
  const problems = [];
  for (const local of localAssets) {
    const remote = remoteByName.get(local.name);
    if (!remote) {
      problems.push(`missing remote asset ${local.name}`);
      continue;
    }
    if (Number(remote.size) !== local.size) problems.push(`size mismatch for ${local.name}`);
    if (remote.digest && remote.digest !== `sha256:${local.sha256}`) problems.push(`digest mismatch for ${local.name}`);
  }
  for (const remote of remoteAssets) {
    if (!localAssets.some((local) => local.name === remote.name)) problems.push(`unexpected remote asset ${remote.name}`);
  }
  return problems;
}

export function macUpdateMetadataProblems(metadata, zipArtifact) {
  const problems = [];
  const decoded = (value) => {
    try {
      return decodeURIComponent(String(value || ""));
    } catch {
      return String(value || "");
    }
  };
  const entry = Array.isArray(metadata?.files) ? metadata.files.find((candidate) => decoded(candidate?.url) === zipArtifact.name) : null;
  if (!entry) {
    problems.push(`metadata does not reference ${zipArtifact.name}`);
    return problems;
  }
  if (entry.sha512 !== zipArtifact.sha512) problems.push(`metadata SHA-512 does not match ${zipArtifact.name}`);
  if (Number(entry.size) !== zipArtifact.size) problems.push(`metadata size does not match ${zipArtifact.name}`);
  if (decoded(metadata.path) !== zipArtifact.name) problems.push(`metadata path does not reference ${zipArtifact.name}`);
  if (metadata.sha512 !== zipArtifact.sha512) problems.push(`metadata top-level SHA-512 does not match ${zipArtifact.name}`);
  return problems;
}
