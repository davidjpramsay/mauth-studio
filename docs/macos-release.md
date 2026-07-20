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

Run from the repo root:

```bash
pnpm macos:release
```

The command deliberately fails before building when it cannot find:

- an installed `Developer ID Application` identity; or
- notarization credentials through a keychain profile, Apple ID variables, or App Store Connect API-key variables.

When those prerequisites exist, it builds the web app, FastAPI sidecar, and Penrose runtime; signs the complete app with Hardened Runtime; creates arm64 DMG and ZIP artifacts; notarizes and staples the app; then signs, notarizes, staples, and Gatekeeper-validates the final DMG before running distribution verification. Generated updater metadata is removed because the current beta uses manual updates and stapling changes the DMG after electron-builder initially calculates those files.

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

## Release Boundary

The first external alpha can remain Apple-Silicon-only and manually updated. Automatic updates are a later product decision, but every shared build still needs a version bump, signed/notarized artifact, release notes, a source commit/tag that identifies what produced it, and clean-machine verification.

Signing and notarization are release operations, not routine development steps:

- use `pnpm macos:dev` during implementation;
- use `pnpm macos:build` and `pnpm macos:install` for deliberate local installed-app checkpoints; and
- use `pnpm macos:release` only for a versioned artifact intended for another person.

## Publish A GitHub Release

Do not upload a DMG built from an untraceable dirty worktree. After the full quality gate passes:

1. commit and push the source state that produced the app;
2. create the version tag on that source state;
3. create a GitHub prerelease while Mauth remains alpha;
4. attach the notarized DMG, and optionally the ZIP for technical testing;
5. keep the README and GitHub Pages download links pinned to the same version; and
6. download the public asset again before clean-machine verification.

The release title and notes must state the supported architecture, alpha status, manual-update policy, signing/notarization status, and any known limitations.
