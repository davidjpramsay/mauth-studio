# File Storage

The app uses file-backed storage for authored tests. Browser `localStorage` is only a convenience cache and emergency fallback.

## Storage Locations

By default, the FastAPI app writes files under:

```text
storage/
  tests/
  autosave/current-test.json
  backups/tests/
```

These paths are ignored by Git because they contain local authored-test data.

You can override the storage root with:

```bash
MATH_APP_STORAGE_ROOT=/path/to/math-app-storage pnpm dev:api
```

Run that command from the project root. If you are already inside `apps/api`, use the equivalent direct API command:

```bash
MATH_APP_STORAGE_ROOT=/path/to/math-app-storage uv run uvicorn app.main:app --reload --reload-dir app --reload-dir ../../packages --reload-dir ../../configs --host 0.0.0.0 --port 8000
```

## Saved Tests

Saved tests are JSON files in `storage/tests`. A saved file includes:

- `id`
- `name`
- `frontMatter`
- `questions`
- optional `logo`
- `createdAt`
- `updatedAt`

The backend writes these files atomically by writing a temporary file first and then replacing the destination file. Before overwriting or deleting a saved test, the backend copies the previous file into `storage/backups/tests`.

## Autosave

The editor autosaves the current working document to `storage/autosave/current-test.json` through the API after a short debounce. If the editor is currently attached to a named saved test, the same autosave also updates that saved test file in `storage/tests`.

On startup the web app asks the API for disk saves and disk autosave first, then falls back to browser storage if the API is unavailable.

## API

```text
GET    /api/storage/tests
GET    /api/storage/tests/{test_id}
POST   /api/storage/tests
PUT    /api/storage/tests/{test_id}
DELETE /api/storage/tests/{test_id}

GET    /api/storage/tests/autosave
POST   /api/storage/tests/autosave
```

## Moving The Project Folder

If the default storage root is used, moving the whole `math-app` folder also moves saved tests because they live inside `math-app/storage`.

If `MATH_APP_STORAGE_ROOT` is used, move that external storage folder as well or keep the environment variable pointing at the same location.
