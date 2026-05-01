from fastapi import APIRouter, HTTPException

from app.models.schemas import DiagramSpec, PenroseDiagramResponse
from app.services.penrose import render_penrose_diagram

router = APIRouter()


@router.post("/penrose", response_model=PenroseDiagramResponse)
def render_penrose(request: DiagramSpec) -> dict:
    try:
        return render_penrose_diagram(request.model_dump())
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
