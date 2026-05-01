from fastapi import APIRouter, HTTPException, Response

from app.models.schemas import AutosaveRequest, SavedTestRequest
from app.services.storage import FileTestStorage

router = APIRouter()
storage_service = FileTestStorage()


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
