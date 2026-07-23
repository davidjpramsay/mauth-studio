# File Storage

The app uses file-backed storage for authored tests. Browser `localStorage` is only a convenience cache and emergency fallback.

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

The school name belongs with the logo. Selecting a logo applies that logo's saved school name, and the editor's Update Logo action saves logo-name/school-name changes back to the reusable logo entry. The app seeds the starter logo list once for new or migrated browsers, but after that every logo is editable and removable. There are no permanent built-in logos. The editor keeps at least one logo in the library so the title page always has a valid selectable logo.

The backend writes these legacy files atomically by writing a temporary file first and then replacing the destination file. Before overwriting or deleting a legacy saved test, the backend copies the previous file into `storage/backups/tests`. Before overwriting or deleting a logo metadata record, the backend copies the previous record into `storage/backups/logos`.

## Autosave

The editor autosaves the current working document to `autosave/current-test.json` under the active private state root after a short debounce. Autosave is a recovery draft, not a project-file save. The draft includes front matter, questions, formatting config, the active project file path, the active file revision that was last loaded/saved, and a portability copy of the selected logo.

On startup the web app asks the API for disk autosave first, then falls back to browser storage if the API is unavailable. The header separates project-file state from draft-backup state: opened project files show `Saved to file · time` or `Unsaved file changes · draft backed up...`, while documents without a project file show `New file not saved · draft backed up...`. The header tooltip includes the active project path, whether the project file has unsaved changes, and the draft backup state. A draft backup is only recovery protection; the project file is not up to date until the header says `Saved to file`.

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

`project.json` stores project metadata and a flat path-indexed file tree. File content is stored as normal text files under `Documents/`. `.mauth` is the canonical structured app document and contains JSON with `format: "mauth-studio-document"` and an integer `schemaVersion`; `.test.json` remains readable for compatibility. `.mauth.md` is Mauthdown, a separate text authoring/interchange format. Diagram and config files remain distinct. Parent folders are created in the project index automatically when a nested file is saved.

Project file saves support revision checks. Clients should save with the `baseRevision` they last loaded; if the current server revision has changed, the API returns `409 Conflict` with the current file summary. Passing `baseRevision: null` means "create only"; if a file already exists at that path, the API returns `409 Conflict` instead of overwriting it. Before an existing text file is overwritten, restored, or deleted, the previous content is snapshotted under `versions/`. A restore creates a new current revision rather than deleting version history.

The default local project id is `local-project`. On first startup with the visible workspace, older repo-local data under `storage/` is copied into `~/Documents/Mauth` if the workspace has not already been initialized. Current saved tests remain legacy migration inputs; this project-file layer must not delete or mutate legacy saved-test files.

The Files drawer can open another local documents folder at runtime. On macOS, **Open folder** uses the native folder picker from the local API process; **Paste path** is kept as a fallback when a path is already known. This switches the default project to that folder, keeps the real document files in place, creates/uses a hidden `.mauth/` folder inside the selected folder for project metadata and versions, and remembers the selected folder for the next server start. Existing `.mauth`, `.test.json`, and `.mauth.md` files in the selected folder are indexed automatically. Resetting the folder returns to `~/Documents/Mauth/Documents`.

If an external or cloud-backed documents folder is mounted but temporarily stops responding, project-file routes return `503` with `code: "STORAGE_UNAVAILABLE"`. On macOS this includes File Provider files marked `dataless`: Mauth rejects the placeholder before opening it instead of leaving an API request blocked while Google Drive or another provider downloads it. The Files drawer asks the teacher to check the connection and wait for the selected folder to finish downloading, while keeping the selected folder unchanged. Background active-file sync absorbs this outage, preserves the editor draft, and reports recovery only after the active file is confirmed current or safely reloaded; deletion and revision conflict remain separate error states. Mauth must not reset the folder, copy fallback files into it, or treat the outage as permission to overwrite from browser storage.

The web Files drawer presents normal document filenames and folders under the user-facing `Documents` area while storing them through the project-file API under the internal `tests/` path for compatibility with existing files. The drawer shows the real local documents folder path so teachers and agents know where the files live. New saves and recovery copies use `.mauth`; ordinary saves preserve the extension of an already-open legacy `.test.json` file. Rename and duplicate also preserve the source extension, so migration is deliberate rather than silent. An installed macOS build registers `.mauth` with Finder; opening one runs the same save/recovery/cancel transition used by the Files drawer before selecting its containing documents folder and loading the file. The current slice also supports creating folders, dragging/dropping moves, multi-select operations, deleting files/folders, listing previous versions, previewing version snapshots, and restoring a previous version. File rows support Shift-click ranges, Cmd/Ctrl-click toggles, Cmd/Ctrl-A select-all in the current folder, Escape clear, Enter open, and Delete/Backspace delete. Drag selected items onto folders, breadcrumbs, the Back target, or an empty folder pane to move them. Opening a file normally saves the currently opened project file first if it has unsaved changes, then closes the Files drawer after the new file loads. If that save is blocked because the loaded revision is missing or stale, Mauth presents **Save recovery copy and open**, **Open without saving**, and **Cancel**. Recovery copies are timestamped files under `Documents/Recovery/`; cancellation or recovery failure keeps the current document open and blocks the requested file or documents-folder switch. Moving, renaming, or duplicating the currently open file/folder also writes any unsaved editor changes first so the file operation uses the latest document content. A restore writes a new current revision; if the restored file is open in the editor, the editor is reloaded to that restored content. The header turns red and blocks normal Save when the active file revision is missing or stale, so a browser autosave draft cannot overwrite a project file that was changed by Codex/direct disk edits. With the API and web app running, `pnpm smoke:file-manager` seeds a temporary file tree, exercises these key drawer workflows in Chromium, verifies storage through the API, and then removes its temporary files. `pnpm smoke:external-folder-autosave` uses an isolated temporary API/web stack to open an external documents folder, verify only real Mauth files are listed, verify browser legacy files are not imported into that folder, and verify a stale browser autosave draft is shown as a conflict instead of overwriting the newer disk revision. `pnpm smoke:document-session-conflict` uses a separate temporary workspace and legacy-storage root to verify the rendered three-way conflict choice, cancellation, recovery-copy creation, and the allowed open path without touching teacher files.

Programmatic edits to user files should go through the project-file API rather than writing only the content file on disk. This keeps `.mauth/project.json` metadata, revision checks, size, timestamps, and version snapshots consistent. If a programmatic edit updates the same file currently referenced by `.mauth/autosave/current-test.json` through `activeProjectFilePath`, update the autosave draft through `/api/storage/tests/autosave` as well; otherwise startup may restore the older in-memory draft over the freshly edited project file.

The product goal is that save/revision safety feels automatic, not chatty. The app/API should quietly do safe maintenance work in the background: save the current dirty file before opening another file, switching folders, or restoring an active-file version; refresh file listings after file operations; carry the loaded revision through autosave; and update the active autosave draft after API-level programmatic edits. Only interrupt the teacher when the system cannot choose safely without risking data loss. The implemented document-transition conflict choice is the reference pattern: save a recovery copy, deliberately continue without saving, or cancel and keep editing. Version restoration uses the same outcome model and never calls the restore endpoint after cancellation or failed recovery.

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

GET    /api/storage/logos
POST   /api/storage/logos
PUT    /api/storage/logos/{logo_id}
DELETE /api/storage/logos/{logo_id}

GET    /api/storage/projects
GET    /api/storage/projects/default
POST   /api/storage/projects
GET    /api/storage/projects/{project_id}
PUT    /api/storage/projects/{project_id}
DELETE /api/storage/projects/{project_id}

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
