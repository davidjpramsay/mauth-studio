# File Storage

The app uses file-backed storage for authored tests. Browser `localStorage` is only a convenience cache and emergency fallback.

## Desktop File Workflow

The desktop Open button and File > Open use the native document picker. Multiple selections join the existing tab set through the same queued, recovery-safe path as Finder opening. New creates an unsaved template; its first Save opens the native save dialog. Subsequent Save operations use that tab's own folder, path, and revision. Save As chooses a new destination and retargets only that tab after the revision-aware write succeeds. Cancellation leaves the document unchanged.

File > Open Recent uses the operating system's recent documents. Successfully opened and saved files are registered there. Show in Finder reveals the active file. Back Up Folder, Restore Backup, and Version History remain separate File menu actions; the browser keeps its Files drawer.

The save-target API scopes a destination without changing the remembered documents folder. Replacements retain version history and check both the selected revision and a content hash, including files created or edited externally after selection. A destination already open in another tab is refused. Storage outages preserve the original tab and local recovery. The `.mauth` metadata folder remains an internal implementation detail.

## Storage Locations

By default, authored documents remain visible while private macOS app state lives in Application Support:

```text
~/Documents/Mauth/
  Documents/
    ...

~/Library/Application Support/Mauth Studio/
  storage/
    project.json
    workspace.json
    autosave/current-test.json
    autosave/open-documents.json
    assets/logos/
    assets/logos/files/
    versions/
    backups/
```

The `Documents/` folder contains normal files teachers can browse, back up, and organise. `storage/` contains default-project revision metadata, remembered-folder identity, autosave recovery data, reusable logos, version snapshots, and backup metadata. A selected external documents folder keeps its own project metadata and versions in that folder's `.mauth/` directory; global autosave and logo state remain in Application Support.

You can override the visible workspace root with:

```bash
MAUTH_DOCUMENTS_ROOT=/path/to/Mauth pnpm dev:api
```

Run that command from the project root. If you are already inside `apps/api`, use the equivalent direct API command:

```bash
MAUTH_DOCUMENTS_ROOT=/path/to/Mauth uv run uvicorn app.main:app --reload --reload-dir app --reload-dir ../../packages --reload-dir ../../configs --host 0.0.0.0 --port 8000
```

`MATH_APP_STORAGE_ROOT=/path/to/storage` is still supported as a legacy/test override. When it is set, the API uses the older app-managed storage layout under that root instead of the visible workspace layout.

`MAUTH_WORKSPACE_STATE_ROOT=/path/to/state` overrides only the private state location while preserving the visible project-file model. Normal macOS development and the packaged app share the Application Support location so changing runtime does not change the active folder or autosave.

## Legacy Saved Tests

Legacy saved tests are JSON files in the active state root's `tests/` directory after migration, or `storage/tests` in older checkouts. They remain readable so older local data can be migrated into the Files drawer, but the current user-facing save/open workflow writes through visible project files. New frontend work should not overwrite or delete legacy saved-test files.

A legacy saved-test file includes:

- `id`
- `name`
- `frontMatter`
- `questions`
- `formattingConfig`
- optional `logo`
- `createdAt`
- `updatedAt`

`formattingConfig` stores the document styling preset and page settings, including the high-school mathematics test layout, A4 dimensions, margins, mark display options, and page-break visibility. Older files without this field are normalised to the current default formatting config when opened.

Logos are managed as a reusable library, independent of saved tests. A test chooses a logo through `frontMatter.logoId`; it should not create a one-off logo id just because the test was saved. Logo metadata and uploaded bytes are stored under the active private state root's `assets/logos/`. Older repo-local storage roots may still contain `storage/assets/logos/` records as migration input. The optional `logo` field in a saved test is a portability fallback copy.

The school name belongs with the logo. Selecting a logo applies that logo's saved school name, and the editor's Update Logo action saves logo-name/school-name changes back to the reusable logo entry. The app seeds the starter logo list once for new or migrated browsers, but after that every logo is editable and removable. There are no permanent built-in logos. During hydration, Mauth removes a legacy `Logo Only` placeholder only when its exact image is already retained under a normal logo name; old documents that embed the removed id are remapped to the retained asset. The editor keeps at least one logo in the library so the title page always has a valid selectable logo.

The backend writes these legacy files atomically by writing a temporary file first and then replacing the destination file. Before overwriting or deleting a legacy saved test, the backend copies the previous file into `storage/backups/tests`. Before overwriting or deleting a logo metadata record, the backend copies the previous record into `storage/backups/logos`.

## Autosave

The editor autosaves the current working document to `autosave/current-test.json` under the active private state root after a short debounce. Autosave is a recovery draft, not a project-file save. The draft includes front matter, questions, formatting config, the active project file path, the active file revision that was last loaded/saved, and a portability copy of the selected logo.

Draft and open-tab backups do not depend on the cloud project index being available. Each backup stream serializes its writes so an older request cannot finish after and overwrite a newer one. Temporary failures retain browser fallback data, show an unavailable backup status, and retry automatically; draft retry delays increase to a maximum of 30 seconds. Active-file synchronization remains responsible for revision conflicts.

The recoverable multi-document session is stored separately in `autosave/open-documents.json`. Each entry carries the tab's structured document, project/folder identity, path, loaded revision, navigation anchors, save fingerprints, conflict/status state, and dirty flag. Undo/redo stacks are memory-only and deliberately omitted from disk recovery. On startup, Mauth merges the authoritative active `current-test.json` draft into the recovered tab list and restores the active tab's document state, not only its tab header. A draft can reuse a recovered tab id only when it represents the same saved path or the same unsaved tab; unrelated browser state cannot replace a saved tab by borrowing its id. Mauth falls back to the equivalent browser cache only when disk recovery is unavailable. A fresh installation with no recovery draft opens the empty start screen instead of manufacturing an open default Year 10 test; legacy drafts without an explicit `documentOpen` field still reopen, while an explicitly closed snapshot remains closed. Neither recovery file is a substitute for saving the visible `.mauth` project file.

On startup the web app asks the API for disk autosave first, then falls back to browser storage if the API itself is unavailable. The disk draft remains recoverable when its referenced project file cannot be checked because an external folder is temporarily unavailable; Mauth opens the draft, reports the unavailable file state, and does not overwrite it. Browser storage is scoped to a localhost origin and may outlive an older dynamic desktop port, so it never outranks a successfully loaded disk autosave. The header separates project-file state from draft-backup state: opened project files show `Saved to file · time` or `Unsaved file changes · draft backed up...`, while documents without a project file show `New file not saved · draft backed up...`. The header tooltip includes the active project path, whether the project file has unsaved changes, and the draft backup state. A draft backup is only recovery protection; the project file is not up to date until the header says `Saved to file`.

One-time legacy test, autosave, logo, and version directory migration is atomic. Mauth copies into a unique temporary sibling directory and renames the complete tree into place, so concurrent startup requests cannot fail by copying to the same target or read a partially migrated recovery tree.

## Project Files

The project/file storage slice is file-backed. In normal runtime it stores user-facing document content under `~/Documents/Mauth/Documents` and default-project metadata under Application Support. It is intentionally shaped like the future database-backed project system and is the current user-facing file model.

Each project has:

```text
~/Documents/Mauth/
  Documents/
    Algebra worksheet.mauth
    Revision/
      Chapter 8.mauth
~/Library/Application Support/Mauth Studio/storage/
  project.json
  versions/
```

`project.json` stores project metadata and a flat path-indexed file tree. File content is stored as normal text files under `Documents/`. `.mauth` is the canonical structured app document and contains JSON with `format: "mauth-studio-document"` and an integer `schemaVersion`; `.test.json` remains readable for compatibility. `.mauth.md` is Mauthdown, a separate text authoring/interchange format. Diagram and config files remain distinct. Parent folders are created in the project index automatically when a nested file is saved. The native portrait Finder document icon comes from the app bundle, while the Spacebar Quick Look preview derives its read-only summary from that JSON. Neither adds an embedded PDF, thumbnail cache, or preview payload to teacher files.

Project file saves support revision checks. Clients should save with the `baseRevision` they last loaded; if the current server revision has changed, the API returns `409 Conflict` with the current file summary. Passing `baseRevision: null` means "create only"; if a file already exists at that path, the API returns `409 Conflict` instead of overwriting it. Before an existing text file is overwritten, restored, or deleted, the previous content is snapshotted under `versions/`. A restore creates a new current revision rather than deleting version history.

The complete read/check/version/write operation is serialized with a reentrant process lock and a local file lock shared by app processes using the same private state root. This protects concurrent revision saves, including index reconciliation performed by reads. It is not a distributed lock between different computers using Google Drive. Moves use a revision-checked backend operation that preserves file identity and version history; the old path is tombstoned so stale saves cannot recreate it. Open tabs are retargeted by folder and path, including inactive dirty tabs. Deleting a file detaches its open tab as an unsaved draft without erasing its contents.

The default local project id is `local-project`. On first startup with the visible workspace, older repo-local data under `storage/` is copied into `~/Documents/Mauth` if the workspace has not already been initialized. Current saved tests remain legacy migration inputs; this project-file layer must not delete or mutate legacy saved-test files.

The Files drawer can open another local documents folder at runtime. On macOS, **Open folder** uses the native folder picker from the local API process; **Paste path** is kept as a fallback when a path is already known. This switches the default project to that folder, keeps the real document files in place, creates/uses a hidden `.mauth/` folder inside the selected folder for project metadata and versions, and remembers the selected folder for the next server start. Existing `.mauth`, `.test.json`, and `.mauth.md` files in the selected folder are indexed automatically. Resetting the folder returns to `~/Documents/Mauth/Documents`.

### Cloud Folders And File Opening

On macOS, Mauth checks the File Provider `dataless` flag before reading a file. A downloaded assessment does not prove its hidden `.mauth/project.json` index is downloaded. These cases return `503 STORAGE_UNAVAILABLE` with a specific `DOCUMENT_ONLINE_ONLY` or `PROJECT_INDEX_ONLINE_ONLY` reason, the affected path, `retryable: true`, and `MAKE_FOLDER_AVAILABLE_OFFLINE`.

Mauth deliberately does not read a byte to force hydration: cancelling an HTTP request cannot reliably cancel a blocked filesystem read. The teacher should use Finder/Google Drive to make the containing folder available offline, wait for it to download, and choose **Retry**. Failed opens show **Document not opened**, name the requested file, and explicitly distinguish any previously recovered assessment still visible behind the dialog.

Finder requests use `POST /api/storage/projects/default/open-document`. The API validates and reads the requested file and its project index before remembering the folder. Failed requests leave the selected folder unchanged. At cold startup, renderer requests wait for draft and tab hydration; later Finder requests use the same ordered queue. A successful open creates a new tab or activates an existing matching tab without replacing its dirty contents. Opening another file never requires discarding or saving unrelated recovered work.

Project requests carry the owning tab's `documentsPath` alongside its project id. A folder switch therefore cannot redirect an already-running request to another folder with the same internal `local-project` id. Background refresh uses a targeted file summary instead of scanning every file, and validates tab identity, path, revision, and draft fingerprint again after pending reads. A delayed save acknowledges only its original tab and preserves any edits made while saving.

An unavailable folder must not be recreated, reset, populated from fallback data, or silently replaced. Background sync preserves drafts and distinguishes unavailable, missing, and revision-conflict states. Reconnection is reported only after the active file is confirmed current or safely reloaded.

### Files Drawer

The drawer shows normal filenames under the user-facing Documents area; API paths retain the internal `tests/` prefix for compatibility. New saves and recovery copies use `.mauth`; ordinary saves, rename, and duplicate retain an existing legacy extension. Open-file badges include inactive tabs and distinguish the active document.

File rows support range/multi-selection, keyboard navigation, and drag-to-folder moves. Rename/move preserves version history and retargets affected open tabs. Operations that replace the current file, such as restoring a version, retain the save/recovery/cancel guard; cancellation and failed recovery block the operation. Recovery copies are timestamped files under Documents/Recovery. Ordinary file opening adds a tab instead of invoking that replacement workflow.

For isolated regression checks, use `pnpm smoke:document-opening` (cloud failures, cold/running Finder requests, dirty recovery, retry, backup recovery, and compact modal keyboard behavior) and `pnpm smoke:document-tabs` (tab switching, history, restoration, and close). `pnpm smoke:file-manager` exercises mutations against its configured API: always supply a disposable isolated storage root and API URL, never the teacher's active folder.

Programmatic edits to user files should go through the project-file API rather than writing only the content file on disk. This keeps `.mauth/project.json` metadata, revision checks, size, timestamps, and version snapshots consistent. If a programmatic edit updates the same file currently referenced by `.mauth/autosave/current-test.json` through `activeProjectFilePath`, update the autosave draft through `/api/storage/tests/autosave` as well; otherwise startup may restore the older in-memory draft over the freshly edited project file.

The product goal is that save/revision safety feels automatic, not chatty. The app/API should quietly do safe maintenance work in the background: retain the current draft in its own tab when opening another file; guard folder transitions and active-file version restoration; refresh file listings after file operations; carry the loaded revision through autosave; and update the active autosave draft after API-level programmatic edits. Only interrupt the teacher when the system cannot choose safely without risking data loss. The implemented document-transition conflict choice is the reference pattern: save a recovery copy, deliberately continue without saving, or cancel and keep editing. Version restoration uses the same outcome model and never calls the restore endpoint after cancellation or failed recovery.

Agent file operations should go through the local agent bridge when it exists, or through the project-file API or visible Files drawer workflow today. Preserve revision checks: saving the active file must use the loaded revision, not a freshly listed revision, so external edits cannot bypass conflict protection. Autosave records must include `frontMatter`, `questions`, `formattingConfig`, optional `logo`, and the active project file revision so recovered drafts preserve exam/school-test template choice and page formatting.

Direct writes to project content files are recovery and migration tools, not the normal assessment-authoring path. If they are used, repair the project index, version metadata, active autosave draft, and browser state before treating the file as safe to reopen.

## Project Backups

The Files drawer can create and import ZIP backups. This is the supported portable backup path for the file-backed project system.

A backup ZIP contains:

- `mauth-project-backup.json`, a manifest with the backup format/version, export time, project summary, file summaries, and logo summaries.
- `project/project.json`, the project metadata/index.
- `project/files/...`, the current text content for active project files.
- `project/versions/...`, version snapshots for active project files.
- `logos/*.json` and `logos/files/...`, reusable logo metadata and uploaded logo image bytes.

Import is safe-by-default. It validates ZIP member paths, rejects absolute paths and `..`, enforces entry-count and file-size limits, creates missing folders, imports version snapshots, and imports missing logo ids. Existing project files are not overwritten; incoming files with matching names are imported with an ` imported` suffix. Existing logo ids are skipped rather than overwritten. Autosave remains separate from backups.

## API

```text
GET    /api/storage/tests
GET    /api/storage/tests/{test_id}
POST   /api/storage/tests
PUT    /api/storage/tests/{test_id}
DELETE /api/storage/tests/{test_id}

GET    /api/storage/tests/autosave
POST   /api/storage/tests/autosave
GET    /api/storage/editor-session
POST   /api/storage/editor-session

GET    /api/storage/logos
POST   /api/storage/logos
PUT    /api/storage/logos/{logo_id}
DELETE /api/storage/logos/{logo_id}

GET    /api/storage/projects
GET    /api/storage/projects/default
POST   /api/storage/projects/default/open-document
POST   /api/storage/projects
GET    /api/storage/projects/{project_id}
PUT    /api/storage/projects/{project_id}
DELETE /api/storage/projects/{project_id}

GET    /api/storage/projects/{project_id}/file-summary?path=...
POST   /api/storage/projects/{project_id}/move?path=...&target=...&baseRevision=...
GET    /api/storage/projects/{project_id}/files
GET    /api/storage/projects/{project_id}/files/{file_path}
PUT    /api/storage/projects/{project_id}/files/{file_path}
DELETE /api/storage/projects/{project_id}/files/{file_path}?baseRevision=...

GET    /api/storage/projects/{project_id}/versions?path={file_path}
POST   /api/storage/projects/{project_id}/versions/{version_id}/restore?path={file_path}

GET    /api/storage/projects/{project_id}/backup
POST   /api/storage/projects/{project_id}/backup/import

GET    /api/system/status
```

`/api/system/status` is the read-only diagnostic contract used by the web header and launcher. It reports the API version and start time, repo root/cwd, git branch/commit, active documents folder, metadata folder, any cheaply available default-project summary, and browser bridge session count. For an external cloud-backed folder it does not open `.mauth/project.json`; `defaultProject` can therefore be `null` until the normal project API loads metadata. This keeps launcher health independent of cloud placeholder hydration. If the web app cannot read this route but `/api/health` still responds, the user is probably running an older API process.

## Moving The Project Folder

Moving the code repo does not move documents or app state. Back up both the visible selected documents folder and `~/Library/Application Support/Mauth Studio/storage`. External selected folders also carry their own `.mauth` project metadata and versions.

If `MAUTH_DOCUMENTS_ROOT` is used, move that external workspace folder as well or keep the environment variable pointing at the same location. If `MATH_APP_STORAGE_ROOT` is used for legacy/test storage, move that folder too.
