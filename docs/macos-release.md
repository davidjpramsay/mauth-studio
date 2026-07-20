# macOS Release Process

This is the distribution contract for sharing Mauth Studio outside the development Mac. Normal local development remains ad-hoc signed; external releases must be Developer ID signed, Hardened Runtime enabled, notarized by Apple, and verified after packaging.

## Current Support

- macOS on Apple Silicon (`arm64`).
- Standalone Electron app with packaged FastAPI and Penrose runtimes.
- No Python, Node.js, repo checkout, or Terminal window is required for ordinary use.
- Codex, Claude Code, and MCP clients remain supported through the authenticated local bridge.

Intel support is not currently built. Do not label an artifact universal until the Electron app, PyInstaller sidecar, and every native dependency have been built and tested for both architectures.

## One-Time Apple Setup

1. Join or use an Apple Developer Program team.
2. Install a **Developer ID Application** certificate in the login keychain.
3. Store notarization credentials without putting secrets in the repo. For a local keychain profile:

```bash
xcrun notarytool store-credentials "mauth-notary" \
  --apple-id "your-apple-id" \
  --team-id "YOURTEAMID" \
  --password "your-app-specific-password"
```

Then set the profile name for the release command:

```bash
export APPLE_KEYCHAIN_PROFILE=mauth-notary
```

App Store Connect API-key environment variables are also supported by electron-builder. Never commit certificates, `.p8` files, passwords, or exported keychains.

## Build A Release

For a local signed/notarized release bundle, run from the repo root:

```bash
pnpm macos:release
```

The command deliberately fails before building when it cannot find:

- an installed `Developer ID Application` identity; or
- notarization credentials through a keychain profile, Apple ID variables, or App Store Connect API-key variables.

When those prerequisites exist, it builds the web app, FastAPI sidecar, and Penrose runtime; signs the complete app with Hardened Runtime; creates arm64 DMG and ZIP artifacts; notarizes and staples the app; then signs, notarizes, staples, and Gatekeeper-validates the final DMG before running distribution verification. It preserves `latest-mac.yml` and generated blockmaps, and verifies that the metadata hash and size match the signed ZIP used by the updater.

This command does not publish anything. It is useful for inspecting a release bundle, but the normal public-release path is the guarded ship command below.

## Ship A Release

Prepare a new release in one traceable source change:

1. bump `package.json` to a version that has never been publicly released;
2. add `docs/releases/v<version>.md`;
3. run `pnpm check`;
4. commit and push the change to `main`; and
5. ensure `gh auth status` and the Apple credentials above are valid.

Inspect the release boundary without building or publishing:

```bash
pnpm macos:ship --preflight
```

Then build, notarize, upload, verify, and publish with:

```bash
pnpm macos:ship
```

`macos:ship` fails closed unless the current branch is clean `main`, `HEAD` exactly matches `origin/main`, release notes exist, the version/tag is unused or belongs to a resumable draft targeting the same commit, and Apple/GitHub credentials are available. It runs the full quality gate before the release build, creates a draft GitHub prerelease, uploads the DMG, ZIP, `latest-mac.yml`, and blockmaps, verifies remote names, sizes, and available SHA-256 digests, and only then publishes the prerelease. A failed build or upload leaves no public partial release; an upload failure after draft creation leaves a resumable draft.

## Verification

For the local hardened development bundle:

```bash
pnpm macos:verify
```

For a release bundle:

```bash
node scripts/verify-macos-app.mjs --distribution
```

Before sharing a release, also test the downloaded artifact on a clean Apple Silicon Mac:

1. Download it through a browser so macOS applies quarantine metadata.
2. Open it normally without Control-click or command-line quarantine removal.
3. Confirm Gatekeeper identifies the developer and accepts the app.
4. Create, save, close, reopen, print, and export a disposable document.
5. Open an external documents folder and confirm no unrelated files are copied.
6. Run `pnpm agent:doctor` from a Mauth source checkout when testing Codex/Claude integration.
7. Confirm an unauthenticated request to `/api/agent/current/snapshot` is rejected.

## Agent Authentication

Every desktop launch generates a new random bridge token. The app:

1. passes the token privately to the FastAPI sidecar;
2. injects it into the Electron editor's private `/api/*` requests;
3. writes it beside the dynamic URL in `~/Library/Application Support/Mauth Studio/runtime.json` with mode `0600`; and
4. removes the runtime manifest when the owning app quits.

`pnpm agent:doctor`, `pnpm agent:mcp`, and `pnpm smoke:agent-bridge` discover the URL and token automatically. Claude/Codex users do not paste or persist the token. Fixed-port development runtimes remain unauthenticated unless `MAUTH_AGENT_TOKEN` is explicitly set.

## Updates And Rollback

Version `0.1.0` predates the updater. The first updater-enabled release after it must still be downloaded and installed manually. Once that build is installed, packaged Mauth Studio checks the public GitHub prerelease channel once shortly after launch and exposes **Mauth Studio > Check for Updates…**. It asks before downloading and again before restart/install. Development builds do not check for updates.

The app does not silently downgrade. Alpha rollback means quitting Mauth, reinstalling a previously signed/notarized DMG, and retaining the teacher's selected documents folder and Application Support state. Back up important work before testing a release.

Every shared build needs a version bump, signed/notarized artifacts, matching updater metadata, release notes, a source commit/tag that identifies what produced it, and clean-machine verification.

Signing and notarization are release operations, not routine development steps:

- use `pnpm macos:dev` during implementation;
- use `pnpm macos:build` and `pnpm macos:install` for deliberate local installed-app checkpoints; and
- use `pnpm macos:release` only to build a versioned signed/notarized artifact set; and
- use `pnpm macos:ship` only to publish a new external release from clean, pushed `main`.

## Publish A GitHub Release

Do not upload a DMG built from an untraceable dirty worktree and do not manually publish a partial updater release. Use `pnpm macos:ship`; its draft-first boundary ensures the DMG, ZIP, metadata, and blockmaps become public together. After publication:

1. keep README and GitHub Pages download links pinned to the same version;
2. download the public DMG through a browser and complete the clean-Mac checks above; and
3. from the previous updater-enabled app, confirm the new alpha is offered, downloads only after approval, and installs only after restart approval.

Release notes must state the supported architecture, alpha status, signing/notarization status, update behavior, and known limitations.
