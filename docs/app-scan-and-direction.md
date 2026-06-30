# App Scan And Direction

This scan reflects the current Mauth Studio architecture after the first controller extractions from `apps/web/src/App.tsx`.

## Current Health

- The full quality gate passes: formatting, ESLint, Ruff, pytest, web action tests, Plotly tests, TypeScript, and Vite build.
- The running API exposes `/api/system/status`, which reports the API version/start time, repo root, active documents folder, default project, git branch/commit, and browser bridge sessions. The web header now has a System status panel and marks the API as stale when this route is missing.
- `pnpm dev:launch` starts or validates the local API/web stack through `/api/system/status`, warns if an older API is occupying port 8000, and opens the web app unless `--no-open` is supplied.
- `pnpm macos:install-launcher` installs a local `Mauth Studio.app` into `~/Applications` with the Mauth app icon. Double-clicking it opens a clearly labelled Terminal session and runs `pnpm dev:launch` from the repo, so the desktop entry point still uses the same status checks.
- `pnpm smoke:external-folder-autosave` starts an isolated API/web stack, opens a temporary external documents folder, proves legacy/browser files are not silently imported, and proves a stale browser draft cannot overwrite a newer disk revision.
- The running API exposes the current local agent browser bridge endpoints, including `/api/agent/current/browser/register`. If those requests return `404`, check the System status panel first; the likely cause is a stale API process.
- File, folder, backup/import, close-file, save-as, restore-version, and solution-slot line-count workflows now use Mauth-owned dialogs rather than native `window.prompt`, `window.confirm`, or `window.alert`. Close-file decisions now support explicit Save, Don't Save, and Cancel paths.
- Document persistence, close/open decisions, active-file sync, and file-conflict recovery/reload actions are now composed through a document-session controller rather than wired separately in `App.tsx`.
- Browser smoke passes for the main editor load and the Files drawer interaction. The page renders meaningful content, opens the drawer, and produces no console warnings or errors in the checked flow.
- The app has strong tests around API storage, agent bridge endpoints, Mauth action contracts, graph domains, diagram inspection, and Plotly statistics charts.

## Main Risks

1. `apps/web/src/App.tsx` is still too large.

   The file remains the central risk for regressions because toolbar actions, drag/drop, and rendering orchestration still meet there. The latest cleanup moved document state, document-session orchestration, file operations, autosave, bridge handling, print control, preview zoom, editor selection, editor/preview navigation, context-menu state, global delete handling, action proposal state, and solution-validation fixes into focused hooks, but the shell should keep shrinking.

2. File and folder state has too many overlapping concepts.

   The current model has visible project files, recent files, legacy migration, autosave, revision snapshots, and the selected external folder. Those are all valid, but the UI needs to make the active source of truth obvious. The safest direction is: one visible documents folder, explicit recents, explicit recovery, and no silent importing or copying when a teacher opens another folder. The external-folder/autosave smoke now guards the highest-risk part of that path.

3. Document lifecycle choices are still too simple.

   Native browser prompts have been replaced with shared Mauth dialogs, close now supports explicit save, discard, and cancel choices, and open/close/save/sync are composed through a document-session controller. File conflicts now expose recovery-copy and reload-from-disk controls, but conflict handling can still become more unified and test-covered.

4. Render-heavy modules need boundaries.

   `FunctionGraph.tsx`, `SelectionInspector.tsx`, and graph editors are the next largest frontend risks. Graph rendering should keep moving toward pure geometry/domain helpers plus thin React adapters.

5. The app can still feel stale when the user is running an older dev process.

   The header now checks `/api/system/status` and shows stale/unavailable API state. The launcher also refuses to reuse an API process that responds to `/api/health` but not `/api/system/status`.

## Direction

Mauth should stay agent-native first, with a polished human editor on top.

The product should not return to a provider-backed in-house chat as the main architecture. The better model is:

```text
structured document state
-> deterministic actions and dry runs
-> validation and preview inspection
-> browser verification
-> optional AI assistant that uses those same contracts
```

An in-app assistant can come back later, but it should be a client for the same local action/bridge layer that Codex, Claude Code, and future MCP tools use. It should not become a separate hidden editing pathway.

## Recommended Roadmap

### 1. Stabilise The Local App

- Use `/api/system/status` as the launcher and support contract for process, folder, file, revision, autosave, and bridge diagnostics.
- Keep the macOS launcher as a thin wrapper around `pnpm dev:launch` until the app is stable enough for a Tauri/Electron shell.
- Keep external folder opening read-only until the user explicitly creates, saves, duplicates, imports, or moves files.
- Keep save, close, delete, rename, restore, folder selection, and solution-slot configuration on structured Mauth dialogs; deepen the document-session controller so recovery and conflict choices use the same save/discard/cancel model.

### 2. Finish The Editor Shell Split

- Extract the remaining toolbar and document mutation orchestration from `App.tsx`.
- Continue tightening recovery and conflict handling inside the document-session controller, including stronger tests for stale-file decision paths.
- Extract the remaining preview page segmentation and render orchestration into a preview/document-render controller.
- Extract question/page-flow mutation orchestration into action-facing controllers.
- Keep `App.tsx` as composition only: state providers, controllers, layout, and component wiring.

### 3. Make Manual Solutions A First-Class Layer

- Keep Student/Solutions mode.
- Let teachers edit solution-only content in place.
- Keep solution annotations on the same surfaces students use: table cells, graph features, ticks, circled choices, and drawn marks.
- Keep AI as "draft solutions", not the source of truth.

### 4. Strengthen Agent Contracts

- Add more high-level actions for common teacher requests: add/replace question, add completed solution table, add graph solution annotations, run layout check, and export print sets.
- Make validation output more teacher-readable and agent-readable.
- Add smoke tests for every agent-facing workflow that previously caused stale or hidden-state issues.

### 5. Package Later

A standalone app is worth doing, but only after the storage and bridge contracts are stable.

Best staged path:

1. Keep the current web plus FastAPI dev setup while the authoring model is changing quickly.
2. Use `pnpm macos:install-launcher` for a local Finder/desktop entry point while the app is still changing quickly.
3. Package the launcher with Tauri or Electron if the local workflow is stable.
4. Consider a true macOS-native Swift app only if Mauth needs deep Finder, print, iCloud Drive, or Apple classroom workflow integration that a web shell cannot provide.

For now, Tauri/Electron around the current web app is a more pragmatic native path than rewriting the editor in Swift.

## Strategic Call

The next major investment should be reliability and explicit contracts, not chat UI.

Mauth becomes much more useful when a teacher or agent can always answer:

- Which file is open?
- Where is it stored?
- Is it saved?
- What changed?
- What validation failed?
- What will print?
- What action will be applied before it is committed?

Once that is solid, a Codex-backed in-app assistant becomes straightforward because it can operate through the same transparent actions as every other editor surface.
