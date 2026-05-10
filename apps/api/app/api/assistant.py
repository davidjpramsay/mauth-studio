import httpx
from fastapi import APIRouter, HTTPException

from app.models.schemas import AssistantChatRequest, AssistantChatResponse
from app.services.openai_assistant import assistant_configured, assistant_model, create_assistant_response

router = APIRouter()


def provider_error_message(response: httpx.Response) -> str:
    fallback = response.text.strip() or f"OpenAI request failed with status {response.status_code}."
    try:
        data = response.json()
    except ValueError:
        return fallback

    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
        if isinstance(data.get("message"), str):
            return data["message"]
        detail = data.get("detail")
        if isinstance(detail, str):
            return detail
    return fallback


@router.get("/status")
def assistant_status() -> dict:
    return {
        "configured": assistant_configured(),
        "model": assistant_model(),
        "provider": "openai",
        "missingSetting": None if assistant_configured() else "OPENAI_API_KEY",
    }


@router.post("/chat", response_model=AssistantChatResponse)
async def assistant_chat(request: AssistantChatRequest) -> dict:
    try:
        return await create_assistant_response(request)
    except httpx.HTTPStatusError as error:
        raise HTTPException(status_code=502, detail=provider_error_message(error.response)) from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="OpenAI request failed.") from error
