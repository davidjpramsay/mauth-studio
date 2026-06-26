# File Storage

The app uses file-backed storage for authored tests. Browser `localStorage` is only a convenience cache and emergency fallback.

## Storage Locations

By default, the FastAPI app writes authored documents under a visible local workspace:

```text
~/Documents/Mauth/
  Documents/
    ...
  .mauth/
    project.json
    autosave/current-test.json
    assets/logos/
    assets/logos/files/
    versions/
    backups/
```

The `Documents/` folder contains the normal files teachers can browse, back up, and organise. The `.mauth/` folder contains revision metadata, autosave recovery data, reusable logos, version snapshots, and backup metadata.

You can override the visible workspace root with:

```bash
MAUTH_DOCUMENTS_ROOT=/path/to/Mauth pnpm dev:api
```

Run that command from the project root. If you are already inside `apps/api`, use the equivalent direct API command:

```bash
MAUTH_DOCUMENTS_ROOT=/path/to/Mauth uv run uvicorn app.main:app --reload --reload-dir app --reload-dir ../../packages --reload-dir ../../configs --host 0.0.0.0 --port 8000
```

`MATH_APP_STORAGE_ROOT=/path/to/storage` is still supported as a legacy/test override. When it is set, the API uses the older app-managed storage layout under that root instead of the visible workspace layout.

## Legacy Saved Tests

Legacy saved tests are JSON files in `.mauth/tests` after workspace migration, or `storage/tests` in older checkouts. They remain readable so older local data can be migrated into the Files drawer, but the current user-facing save/open workflow writes through project files backed by `~/Documents/Mauth/Documents`. New frontend work should not overwrite or delete legacy saved-test files.

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

Logos are managed as a reusable library, independent of saved tests. A test chooses a logo through `frontMatter.logoId`; it should not create a one-off logo id just because the test was saved. Logo metadata is stored in `storage/assets/logos/*.json`, and uploaded logo image bytes are stored under `storage/assets/logos/files/`. The optional `logo` field in a saved test is a portability fallback copy of the selected library logo, so a custom logo can be recovered if the shared logo library is missing.

The school name belongs with the logo. Selecting a logo applies that logo's saved school name, and the editor's Update Logo action saves logo-name/school-name changes back to the reusable logo entry. The app seeds the starter logo list once for new or migrated browsers, but after that every logo is editable and removable. There are no permanent built-in logos. The editor keeps at least one logo in the library so the title page always has a valid selectable logo.

The backend writes these legacy files atomically by writing a temporary file first and then replacing the destination file. Before overwriting or deleting a legacy saved test, the backend copies the previous file into `storage/backups/tests`. Before overwriting or deleting a logo metadata record, the backend copies the previous record into `storage/backups/logos`.

## Autosave

The editor autosaves the current working document to `.mauth/autosave/current-test.json` through the API after a short debounce. Autosave is a recovery draft, not a project-file save. The draft includes front matter, questions, formatting config, the active project file path, the active file revision that was last loaded/saved, and a portability copy of the selected logo. When the draft belongs to an opened file, it stores `activeProjectFilePath` and `activeProjectFileRevision` so startup can restore the working document and still know which project file/revision it came from.

On startup the web app asks the API for disk autosave first, then falls back to browser storage if the API is unavailable. The header separates project-file state from draft-backup state: opened project files show `Saved to file · time` or `Unsaved file changes · draft backed up...`, while documents without a project file show `New file not saved · draft backed up...`. The header tooltip includes the active project path, whether the project file has unsaved changes, and the draft backup state. A draft backup is only recovery protection; the project file is not up to date until the header says `Saved to file`.

## Project Files

The project/file storage slice is file-backed. In normal runtime it stores user-facing document content under `~/Documents/Mauth/Documents` and project metadata under `~/Documents/Mauth/.mauth`. It is intentionally shaped like the future database-backed project system and is now the current user-facing file model.

Each project has:

```text
~/Documents/Mauth/
  Documents/
    Algebra worksheet.test.json
    Revision/
      Chapter 8.test.json
  .mauth/
    project.json
    versions/
```

`project.json` stores project metadata and a flat path-indexed file tree. File content is stored as normal text files under `Documents/`, so `.test.json`, `.mauth.md`, `.diagram.json`, and config files stay inspectable and portable. Parent folders are created in the project index automatically when a nested file is saved.

Project file saves support revision checks. Clients should save with the `baseRevision` they last loaded; if the current server revision has changed, the API returns `409 Conflict` with the current file summary. Passing `baseRevision: null` means "create only"; if a file already exists at that path, the API returns `409 Conflict` instead of overwriting it. Before an existing text file is overwritten, restored, or deleted, the previous content is snapshotted under `versions/`. A restore creates a new current revision rather than deleting version history.

The default local project id is `local-project`. On first startup with the visible workspace, older repo-local data under `storage/` is copied into `~/Documents/Mauth` if the workspace has not already been initialized. Current saved tests remain legacy migration inputs; this project-file layer must not delete or mutate legacy saved-test files.

The web Files drawer presents normal document filenames and folders under the user-facing `Documents` area while storing them through the project-file API under the internal `tests/` path for compatibility with existing files. The drawer shows the real local documents folder path so teachers and agents know where the files live. The current slice supports opening `.test.json` documents, saving the current editor document, creating folders, renaming, duplicating, dragging/dropping moves, multi-select operations, deleting files/folders, listing previous versions, previewing version snapshots, and restoring a previous version. File rows support Shift-click ranges, Cmd/Ctrl-click toggles, Cmd/Ctrl-A select-all in the current folder, Escape clear, Enter open, and Delete/Backspace delete. Drag selected items onto folders, breadcrumbs, the Back target, or an empty folder pane to move them. Opening a file silently saves the currently opened project file first if it has unsaved changes, then closes the Files drawer after the new file loads. If that pre-open save is blocked because the current file revision is missing or stale, the editor saves the current draft as a timestamped recovery copy under `Documents/Recovery/` and then continues opening the selected file. Moving, renaming, or duplicating the currently open file/folder also writes any unsaved editor changes first so the file operation uses the latest document content. A restore writes a new current revision; if the restored file is open in the editor, the editor is reloaded to that restored content. The header turns red and blocks normal Save when the active file revision is missing or stale, so a browser autosave draft cannot overwrite a project file that was changed by Codex/direct disk edits. With the API and web app running, `pnpm smoke:file-manager` seeds a temporary file tree, exercises these key drawer workflows in Chromium, verifies storage through the API, and then removes its temporary files.

Programmatic edits to user files should go through the project-file API rather than writing only the content file on disk. This keeps `.mauth/project.json` metadata, revision checks, size, timestamps, and version snapshots consistent. If a programmatic edit updates the same file currently referenced by `.mauth/autosave/current-test.json` through `activeProjectFilePath`, update the autosave draft through `/api/storage/tests/autosave` as well; otherwise startup may restore the older in-memory draft over the freshly edited project file.

The product goal is that save/revision safety feels automatic, not chatty. The app/API should quietly do safe maintenance work in the background: save the current dirty file before opening or moving another file, refresh file listings after file operations, carry the loaded revision through autosave, and update the active autosave draft after API-level programmatic edits. Only interrupt the teacher when the system cannot choose safely without risking data loss. In that case, present a short choice such as reload the changed file or save the current draft as a copy.

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
```

## Moving The Project Folder

If the default visible workspace is used, moving the code repo does not move documents. Move or back up `~/Documents/Mauth` separately because it contains visible document files, `.mauth` metadata, autosave drafts, reusable logos, and version snapshots.

If `MAUTH_DOCUMENTS_ROOT` is used, move that external workspace folder as well or keep the environment variable pointing at the same location. If `MATH_APP_STORAGE_ROOT` is used for legacy/test storage, move that folder too.
