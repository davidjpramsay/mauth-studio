import subprocess
import sys

from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.models.schemas import (
    AutosaveRequest,
    LogoAssetRequest,
    ProjectFileRequest,
    ProjectRequest,
    ProjectWorkspaceRequest,
    SavedTestRequest,
)
from app.services.storage import (
    FileLogoStorage,
    FileProjectStorage,
    FileTestStorage,
    StorageConflictError,
    StorageNotFoundError,
    StorageValidationError,
)

router = APIRouter()
storage_service = FileTestStorage()
logo_storage_service = FileLogoStorage()
project_storage_service = FileProjectStorage()


def storage_http_error(error: Exception) -> HTTPException:
    if isinstance(error, StorageConflictError):
        detail: dict = {"message": str(error)}
        if error.current is not None:
            detail["current"] = error.current
        return HTTPException(status_code=409, detail=detail)
    if isinstance(error, StorageValidationError):
        return HTTPException(status_code=400, detail=str(error))
    if isinstance(error, StorageNotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    return HTTPException(status_code=500, detail="Storage error")


@router.get("/tests")
def list_saved_tests() -> dict:
    return {"tests": storage_service.list_tests()}


@router.get("/tests/autosave")
def get_autosave() -> dict:
    autosave = storage_service.get_autosave()
    return {"autosave": autosave}


@router.post("/tests/autosave")
def save_autosave(request: AutosaveRequest) -> dict:
    autosave = storage_service.save_autosave(request.model_dump())
    return {"autosave": autosave}


@router.get("/tests/{test_id}")
def get_saved_test(test_id: str) -> dict:
    saved_test = storage_service.get_test(test_id)
    if saved_test is None:
        raise HTTPException(status_code=404, detail="Saved test not found")
    return saved_test


@router.post("/tests")
def save_saved_test(request: SavedTestRequest) -> dict:
    return storage_service.save_test(request.model_dump())


@router.put("/tests/{test_id}")
def update_saved_test(test_id: str, request: SavedTestRequest) -> dict:
    payload = request.model_dump()
    payload["id"] = test_id
    return storage_service.save_test(payload)


@router.delete("/tests/{test_id}", status_code=204)
def delete_saved_test(test_id: str) -> Response:
    deleted = storage_service.delete_test(test_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Saved test not found")
    return Response(status_code=204)


@router.get("/logos")
def list_logos() -> dict:
    return {"logos": logo_storage_service.list_logos()}


@router.post("/logos")
def save_logo(request: LogoAssetRequest) -> dict:
    return logo_storage_service.save_logo(request.model_dump())


@router.put("/logos/{logo_id}")
def update_logo(logo_id: str, request: LogoAssetRequest) -> dict:
    payload = request.model_dump()
    payload["id"] = logo_id
    return logo_storage_service.save_logo(payload)


@router.delete("/logos/{logo_id}", status_code=204)
def delete_logo(logo_id: str) -> Response:
    deleted = logo_storage_service.delete_logo(logo_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Logo not found")
    return Response(status_code=204)


@router.get("/projects")
def list_projects() -> dict:
    return {"projects": project_storage_service.list_projects()}


@router.get("/projects/default")
def get_default_project() -> dict:
    try:
        return project_storage_service.get_or_create_default_project()
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.post("/projects/default/documents-folder")
def open_default_project_documents_folder(request: ProjectWorkspaceRequest) -> dict:
    try:
        return project_storage_service.open_documents_folder(request.path)
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.post("/projects/default/documents-folder/choose")
def choose_default_project_documents_folder() -> dict:
    if sys.platform != "darwin":
        raise storage_http_error(StorageValidationError("Native folder picker is only available on macOS"))

    script = """
set chosenFolder to choose folder with prompt "Choose a Mauth documents folder"
POSIX path of chosenFolder
"""
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as error:
        raise storage_http_error(StorageValidationError("Native folder picker is unavailable")) from error

    if result.returncode != 0:
        stderr = result.stderr.strip().lower()
        if "user canceled" in stderr:
            return {"cancelled": True}
        raise storage_http_error(StorageValidationError(result.stderr.strip() or "Folder picker failed"))

    folder_path = result.stdout.strip()
    if not folder_path:
        return {"cancelled": True}

    try:
        project = project_storage_service.open_documents_folder(folder_path)
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error
    return {"cancelled": False, "path": folder_path, "project": project}


@router.post("/projects/default/documents-folder/reset")
def reset_default_project_documents_folder() -> dict:
    try:
        return project_storage_service.reset_documents_folder()
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.post("/projects")
def create_project(request: ProjectRequest) -> dict:
    try:
        return project_storage_service.create_project(request.model_dump())
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.get("/projects/{project_id}")
def get_project(project_id: str) -> dict:
    project = project_storage_service.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/projects/{project_id}")
def update_project(project_id: str, request: ProjectRequest) -> dict:
    try:
        return project_storage_service.update_project(project_id, request.model_dump(exclude_unset=True))
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: str) -> Response:
    deleted = project_storage_service.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return Response(status_code=204)


@router.get("/projects/{project_id}/files")
def list_project_files(project_id: str) -> dict:
    try:
        return {"files": project_storage_service.list_files(project_id)}
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.get("/projects/{project_id}/backup")
def export_project_backup(project_id: str) -> Response:
    try:
        filename, content = project_storage_service.export_backup(project_id)
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/projects/{project_id}/backup/import")
async def import_project_backup(project_id: str, request: Request) -> dict:
    try:
        content = await request.body()
        return project_storage_service.import_backup(project_id, content)
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.get("/projects/{project_id}/versions")
def list_project_file_versions(project_id: str, path: str = Query(...)) -> dict:
    try:
        return {"versions": project_storage_service.list_versions(project_id, path)}
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.post("/projects/{project_id}/versions/{version_id}/restore")
def restore_project_file_version(project_id: str, version_id: str, path: str = Query(...)) -> dict:
    try:
        return project_storage_service.restore_version(project_id, path, version_id)
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.get("/projects/{project_id}/files/{file_path:path}")
def get_project_file(project_id: str, file_path: str) -> dict:
    try:
        return project_storage_service.get_file(project_id, file_path)
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.put("/projects/{project_id}/files/{file_path:path}")
def save_project_file(project_id: str, file_path: str, request: ProjectFileRequest) -> dict:
    try:
        return project_storage_service.save_file(project_id, file_path, request.model_dump(exclude_unset=True))
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error


@router.delete("/projects/{project_id}/files/{file_path:path}", status_code=204)
def delete_project_file(
    project_id: str,
    file_path: str,
    base_revision: int | None = Query(None, alias="baseRevision"),
) -> Response:
    try:
        deleted = project_storage_service.delete_file(project_id, file_path, base_revision=base_revision)
    except (StorageConflictError, StorageNotFoundError, StorageValidationError) as error:
        raise storage_http_error(error) from error
    if not deleted:
        raise HTTPException(status_code=404, detail="Project file not found")
    return Response(status_code=204)
