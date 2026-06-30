from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from queue import Empty, Queue
from threading import Event, Lock
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Body, Header, Query
from fastapi.responses import JSONResponse, PlainTextResponse

REQUEST_TIMEOUT_SECONDS = 20
BROWSER_POLL_TIMEOUT_SECONDS = 25
SESSION_TTL_SECONDS = 75
EVENT_LOG_LIMIT = 500

agent_router = APIRouter()
agent_discovery_router = APIRouter()
JSON_BODY: Any = Body(default_factory=dict)
IDEMPOTENCY_KEY_HEADER: Any = Header(default=None, alias="Idempotency-Key")


@dataclass
class PendingAgentRequest:
    request_id: str
    kind: str
    payload: dict[str, Any]
    created_at: str
    response_ready: Event = field(default_factory=Event)
    response_status: int | None = None
    response_body: dict[str, Any] | None = None


@dataclass
class BrowserEditorSession:
    session_id: str
    label: str
    connected_at: datetime
    last_seen: datetime
    requests: Queue[PendingAgentRequest] = field(default_factory=Queue)


@dataclass
class IdempotencyCacheEntry:
    request_hash: str
    status_code: int
    body: dict[str, Any]
    created_at: datetime


_lock = Lock()
_sessions: dict[str, BrowserEditorSession] = {}
_pending_requests: dict[str, PendingAgentRequest] = {}
_idempotency_cache: dict[str, IdempotencyCacheEntry] = {}
_presence: dict[str, dict[str, Any]] = {}
_comments: dict[str, dict[str, Any]] = {}
_suggestions: dict[str, dict[str, Any]] = {}
_events: list[dict[str, Any]] = []
_next_event_id = 1


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _now().isoformat()


def _append_event_unlocked(
    event_type: str,
    *,
    actor: str | None = None,
    message: str | None = None,
    request_id: str | None = None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    global _next_event_id
    event = {
        "id": _next_event_id,
        "type": event_type,
        "actor": actor,
        "message": message,
        "requestId": request_id,
        "at": _iso_now(),
        "data": data or {},
    }
    _next_event_id += 1
    _events.append(event)
    del _events[:-EVENT_LOG_LIMIT]
    return event


def _error_body(code: str, error: str, *, setup_link: str | None = "/agent-docs", **extra: Any) -> dict[str, Any]:
    body = {"success": False, "code": code, "error": error}
    if setup_link:
        body["setupLink"] = setup_link
    body.update(extra)
    return body


def _json_response(status_code: int, body: dict[str, Any]) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=body)


def _prune_sessions_unlocked() -> None:
    cutoff = _now() - timedelta(seconds=SESSION_TTL_SECONDS)
    stale_session_ids = [session_id for session_id, session in _sessions.items() if session.last_seen < cutoff]
    for session_id in stale_session_ids:
        del _sessions[session_id]
        _append_event_unlocked(
            "editor.disconnected",
            actor=session_id,
            message="Browser editor session expired.",
        )


def _active_sessions_unlocked() -> list[BrowserEditorSession]:
    _prune_sessions_unlocked()
    return sorted(_sessions.values(), key=lambda session: session.last_seen, reverse=True)


def _request_hash(body: dict[str, Any]) -> str:
    encoded = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _validate_action_payload(
    body: dict[str, Any], *, require_base_snapshot: bool = False
) -> tuple[int, dict[str, Any]] | None:
    actions = body.get("actions")
    if not isinstance(actions, list):
        return (
            400,
            _error_body("INVALID_REQUEST", "Payload must include actions as an array."),
        )
    if require_base_snapshot and not isinstance(body.get("baseSnapshotId"), str):
        return (
            400,
            _error_body("INVALID_REQUEST", "actions.apply requires baseSnapshotId."),
        )
    return None


def _active_editor_error_unlocked() -> tuple[int, dict[str, Any]] | None:
    active_sessions = _active_sessions_unlocked()
    if not active_sessions:
        return (
            503,
            _error_body(
                "APP_NOT_CONNECTED",
                "Open Mauth Studio in a browser at the web URL printed by pnpm dev:web before using the local agent bridge.",
            ),
        )
    if len(active_sessions) > 1:
        return (
            409,
            _error_body(
                "MULTIPLE_ACTIVE_EDITORS",
                "Close extra Mauth browser tabs so the local bridge has exactly one active editor session.",
                sessionCount=len(active_sessions),
            ),
        )
    return None


def browser_bridge_status() -> dict[str, Any]:
    with _lock:
        active_sessions = _active_sessions_unlocked()
        return {
            "available": True,
            "activeSessionCount": len(active_sessions),
            "pendingRequestCount": len(_pending_requests),
            "sessions": [
                {
                    "sessionId": session.session_id,
                    "label": session.label,
                    "connectedAt": session.connected_at.isoformat(),
                    "lastSeen": session.last_seen.isoformat(),
                }
                for session in active_sessions
            ],
            "routes": {
                "browserRegister": "/api/agent/current/browser/register",
                "browserRequests": "/api/agent/current/browser/requests",
                "browserRespond": "/api/agent/current/browser/respond",
            },
        }


def _validate_review_target(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("target must be an object when provided.")
    kind = value.get("kind")
    if kind not in {"document", "question", "part", "subpart", "module", "textRange"}:
        raise ValueError("target.kind must be document, question, part, subpart, module, or textRange.")
    target = {"kind": kind}
    for key in ("questionId", "partId", "subpartId", "blockId", "label"):
        if isinstance(value.get(key), str):
            target[key] = value[key]
    for key in ("start", "end"):
        if isinstance(value.get(key), int):
            target[key] = value[key]
    return target


def _review_actor(payload: dict[str, Any]) -> str | None:
    actor = payload.get("actor") or payload.get("agentId")
    return actor if isinstance(actor, str) and actor else None


def _comment_from_payload(payload: dict[str, Any]) -> tuple[int, dict[str, Any]] | dict[str, Any]:
    body = payload.get("body")
    if not isinstance(body, str) or not body.strip():
        return 400, _error_body("INVALID_REQUEST", "Comment body is required.")
    severity = payload.get("severity") if payload.get("severity") in {"note", "warning", "error"} else "note"
    try:
        target = _validate_review_target(payload.get("target"))
    except ValueError as error:
        return 400, _error_body("INVALID_REQUEST", str(error))
    now = _iso_now()
    return {
        "id": payload.get("id")
        if isinstance(payload.get("id"), str) and payload.get("id")
        else f"comment_{uuid4().hex}",
        "actor": _review_actor(payload),
        "body": body.strip(),
        "severity": severity,
        "target": target,
        "snapshotId": payload.get("snapshotId") if isinstance(payload.get("snapshotId"), str) else None,
        "status": "open",
        "createdAt": now,
        "updatedAt": now,
    }


def _suggestion_from_payload(payload: dict[str, Any]) -> tuple[int, dict[str, Any]] | dict[str, Any]:
    body = payload.get("body")
    if not isinstance(body, str) or not body.strip():
        return 400, _error_body("INVALID_REQUEST", "Suggestion body is required.")
    actions = payload.get("actions")
    if actions is not None and not isinstance(actions, list):
        return 400, _error_body("INVALID_REQUEST", "Suggestion actions must be an array when provided.")
    replacement_text = payload.get("replacementText")
    if replacement_text is not None and not isinstance(replacement_text, str):
        return 400, _error_body("INVALID_REQUEST", "replacementText must be a string when provided.")
    try:
        target = _validate_review_target(payload.get("target"))
    except ValueError as error:
        return 400, _error_body("INVALID_REQUEST", str(error))
    now = _iso_now()
    return {
        "id": payload.get("id")
        if isinstance(payload.get("id"), str) and payload.get("id")
        else f"suggestion_{uuid4().hex}",
        "actor": _review_actor(payload),
        "title": payload.get("title") if isinstance(payload.get("title"), str) else None,
        "body": body.strip(),
        "target": target,
        "actions": actions,
        "replacementText": replacement_text,
        "snapshotId": payload.get("snapshotId") if isinstance(payload.get("snapshotId"), str) else None,
        "status": "proposed",
        "createdAt": now,
        "updatedAt": now,
    }


def _dispatch_to_browser(kind: str, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    request = PendingAgentRequest(
        request_id=f"agent_req_{uuid4().hex}",
        kind=kind,
        payload=payload,
        created_at=_iso_now(),
    )

    with _lock:
        active_sessions = _active_sessions_unlocked()
        if not active_sessions:
            _append_event_unlocked(
                "request.rejected",
                message="No active browser editor session.",
                request_id=request.request_id,
                data={"kind": kind, "code": "APP_NOT_CONNECTED"},
            )
            return (
                503,
                _error_body(
                    "APP_NOT_CONNECTED",
                    "Open Mauth Studio in a browser at the web URL printed by pnpm dev:web before using the local agent bridge.",
                ),
            )
        if len(active_sessions) > 1:
            _append_event_unlocked(
                "request.rejected",
                message="Multiple active browser editor sessions.",
                request_id=request.request_id,
                data={"kind": kind, "code": "MULTIPLE_ACTIVE_EDITORS", "sessionCount": len(active_sessions)},
            )
            return (
                409,
                _error_body(
                    "MULTIPLE_ACTIVE_EDITORS",
                    "Close extra Mauth browser tabs so the local bridge has exactly one active editor session.",
                    sessionCount=len(active_sessions),
                ),
            )

        session = active_sessions[0]
        _pending_requests[request.request_id] = request
        session.requests.put(request)
        _append_event_unlocked(
            "request.queued",
            actor=session.session_id,
            request_id=request.request_id,
            data={"kind": kind},
        )

    if not request.response_ready.wait(timeout=REQUEST_TIMEOUT_SECONDS):
        with _lock:
            _pending_requests.pop(request.request_id, None)
            _append_event_unlocked(
                "request.timeout",
                request_id=request.request_id,
                data={"kind": kind, "code": "BRIDGE_TIMEOUT"},
            )
        return (
            504,
            _error_body("BRIDGE_TIMEOUT", "Timed out waiting for the browser editor session to respond."),
        )

    with _lock:
        _pending_requests.pop(request.request_id, None)
        _append_event_unlocked(
            "request.completed",
            request_id=request.request_id,
            data={"kind": kind, "status": request.response_status or 500},
        )

    return request.response_status or 500, request.response_body or _error_body(
        "ACTION_FAILED", "Browser bridge returned no response."
    )


@agent_router.post("/browser/register")
def register_browser_editor(payload: dict[str, Any] = JSON_BODY) -> dict[str, Any]:
    requested_session_id = payload.get("sessionId")
    session_id = (
        requested_session_id
        if isinstance(requested_session_id, str) and requested_session_id
        else f"editor_{uuid4().hex}"
    )
    label = payload.get("label") if isinstance(payload.get("label"), str) else "Mauth web editor"
    now = _now()

    with _lock:
        existing = _sessions.get(session_id)
        if existing:
            existing.last_seen = now
            existing.label = label
        else:
            _sessions[session_id] = BrowserEditorSession(
                session_id=session_id, label=label, connected_at=now, last_seen=now
            )
            _append_event_unlocked(
                "editor.connected",
                actor=session_id,
                message="Browser editor session connected.",
            )
        _prune_sessions_unlocked()

    return {
        "success": True,
        "sessionId": session_id,
        "pollUrl": f"/api/agent/current/browser/requests?sessionId={session_id}",
        "respondUrl": "/api/agent/current/browser/respond",
    }


@agent_router.get("/browser/requests")
def poll_browser_requests(
    session_id: str = Query(alias="sessionId"),
    timeout_seconds: float = Query(
        default=BROWSER_POLL_TIMEOUT_SECONDS, alias="timeoutSeconds", ge=0, le=BROWSER_POLL_TIMEOUT_SECONDS
    ),
) -> JSONResponse:
    with _lock:
        session = _sessions.get(session_id)
        if not session:
            return _json_response(
                404,
                _error_body("APP_NOT_CONNECTED", "Browser editor session is not registered.", setup_link=None),
            )
        session.last_seen = _now()
        request_queue = session.requests

    try:
        request = request_queue.get(timeout=timeout_seconds)
    except Empty:
        return _json_response(200, {"request": None})

    with _lock:
        if session_id in _sessions:
            _sessions[session_id].last_seen = _now()
        _append_event_unlocked(
            "request.delivered",
            actor=session_id,
            request_id=request.request_id,
            data={"kind": request.kind},
        )

    return _json_response(
        200,
        {
            "request": {
                "requestId": request.request_id,
                "kind": request.kind,
                "payload": request.payload,
                "createdAt": request.created_at,
            }
        },
    )


@agent_router.post("/browser/respond")
def respond_to_agent_request(payload: dict[str, Any] = JSON_BODY) -> JSONResponse:
    session_id = payload.get("sessionId")
    request_id = payload.get("requestId")
    response_status = payload.get("status")
    response_body = payload.get("body")
    if not isinstance(session_id, str) or not isinstance(request_id, str):
        return _json_response(
            400, _error_body("INVALID_REQUEST", "Browser response requires sessionId and requestId.", setup_link=None)
        )
    if not isinstance(response_status, int):
        response_status = 200
    if not isinstance(response_body, dict):
        response_body = {}

    with _lock:
        session = _sessions.get(session_id)
        if session:
            session.last_seen = _now()
        request = _pending_requests.get(request_id)
        if not request:
            return _json_response(
                404, _error_body("BRIDGE_TIMEOUT", "Agent request is no longer pending.", setup_link=None)
            )
        request.response_status = response_status
        request.response_body = response_body
        request.response_ready.set()
        _append_event_unlocked(
            "request.responded",
            actor=session_id,
            request_id=request_id,
            data={"status": response_status},
        )

    return _json_response(200, {"success": True})


@agent_router.get("/snapshot")
def get_current_snapshot() -> JSONResponse:
    status_code, body = _dispatch_to_browser("snapshot", {})
    return _json_response(status_code, body)


@agent_router.post("/actions/preview")
def preview_current_actions(payload: dict[str, Any] = JSON_BODY) -> JSONResponse:
    invalid = _validate_action_payload(payload)
    if invalid:
        status_code, body = invalid
        return _json_response(status_code, body)
    status_code, body = _dispatch_to_browser("actions.preview", payload)
    return _json_response(status_code, body)


@agent_router.post("/actions/apply")
def apply_current_actions(
    payload: dict[str, Any] = JSON_BODY,
    idempotency_key: str | None = IDEMPOTENCY_KEY_HEADER,
) -> JSONResponse:
    if not idempotency_key:
        return _json_response(400, _error_body("INVALID_REQUEST", "actions.apply requires an Idempotency-Key header."))

    invalid = _validate_action_payload(payload, require_base_snapshot=True)
    if invalid:
        status_code, body = invalid
        return _json_response(status_code, body)

    request_hash = _request_hash(payload)
    with _lock:
        cached = _idempotency_cache.get(idempotency_key)
        if cached:
            if cached.request_hash != request_hash:
                return _json_response(
                    409,
                    _error_body(
                        "IDEMPOTENCY_KEY_REUSED",
                        "That Idempotency-Key was already used for a different actions.apply payload.",
                    ),
                )
            _append_event_unlocked(
                "request.replayed",
                request_id=idempotency_key,
                data={"kind": "actions.apply", "status": cached.status_code},
            )
            return _json_response(cached.status_code, cached.body)

    status_code, body = _dispatch_to_browser("actions.apply", payload)
    if status_code not in {503, 504}:
        with _lock:
            _idempotency_cache[idempotency_key] = IdempotencyCacheEntry(
                request_hash=request_hash,
                status_code=status_code,
                body=body,
                created_at=_now(),
            )
    return _json_response(status_code, body)


@agent_router.post("/validation/run")
def run_current_validation(payload: dict[str, Any] = JSON_BODY) -> JSONResponse:
    status_code, body = _dispatch_to_browser("validation.run", payload)
    return _json_response(status_code, body)


@agent_router.post("/presence")
def set_agent_presence(payload: dict[str, Any] = JSON_BODY) -> JSONResponse:
    agent_id = payload.get("id") if isinstance(payload.get("id"), str) else payload.get("agentId")
    if not isinstance(agent_id, str) or not agent_id:
        agent_id = f"agent_{uuid4().hex}"
    status = payload.get("status") if isinstance(payload.get("status"), str) else "active"
    presence = {
        "id": agent_id,
        "name": payload.get("name") if isinstance(payload.get("name"), str) else None,
        "status": status,
        "details": payload.get("details") if isinstance(payload.get("details"), str) else None,
        "at": _iso_now(),
    }
    with _lock:
        _presence[agent_id] = presence
        _append_event_unlocked(
            "presence.updated",
            actor=agent_id,
            message=presence["details"],
            data={"status": status, "name": presence["name"]},
        )
    return _json_response(200, {"success": True, "presence": presence})


@agent_router.get("/events")
def read_agent_events(after: int = Query(default=0, ge=0)) -> dict[str, Any]:
    with _lock:
        events = [event for event in _events if event["id"] > after]
        presence = list(_presence.values())
    return {"success": True, "events": events, "presence": presence}


@agent_router.get("/comments")
def read_agent_comments(status: str | None = Query(default=None)) -> dict[str, Any]:
    with _lock:
        comments = list(_comments.values())
    if status:
        comments = [comment for comment in comments if comment.get("status") == status]
    return {"success": True, "comments": sorted(comments, key=lambda comment: comment["createdAt"])}


@agent_router.post("/comments")
def create_agent_comment(payload: dict[str, Any] = JSON_BODY) -> JSONResponse:
    with _lock:
        active_error = _active_editor_error_unlocked()
        if active_error:
            status_code, body = active_error
            return _json_response(status_code, body)

    comment = _comment_from_payload(payload)
    if isinstance(comment, tuple):
        status_code, body = comment
        return _json_response(status_code, body)

    with _lock:
        _comments[comment["id"]] = comment
        _append_event_unlocked(
            "comment.created",
            actor=comment.get("actor"),
            message=comment["body"],
            data={"commentId": comment["id"], "target": comment.get("target"), "snapshotId": comment.get("snapshotId")},
        )
    return _json_response(200, {"success": True, "comment": comment})


@agent_router.post("/comments/{comment_id}/resolve")
def resolve_agent_comment(comment_id: str, payload: dict[str, Any] = JSON_BODY) -> JSONResponse:
    with _lock:
        comment = _comments.get(comment_id)
        if not comment:
            return _json_response(404, _error_body("INVALID_REQUEST", "Comment was not found.", setup_link=None))
        comment = {**comment, "status": "resolved", "updatedAt": _iso_now()}
        _comments[comment_id] = comment
        _append_event_unlocked(
            "comment.resolved",
            actor=_review_actor(payload),
            message=payload.get("details") if isinstance(payload.get("details"), str) else None,
            data={"commentId": comment_id},
        )
    return _json_response(200, {"success": True, "comment": comment})


@agent_router.get("/suggestions")
def read_agent_suggestions(status: str | None = Query(default=None)) -> dict[str, Any]:
    with _lock:
        suggestions = list(_suggestions.values())
    if status:
        suggestions = [suggestion for suggestion in suggestions if suggestion.get("status") == status]
    return {"success": True, "suggestions": sorted(suggestions, key=lambda suggestion: suggestion["createdAt"])}


@agent_router.post("/suggestions")
def create_agent_suggestion(payload: dict[str, Any] = JSON_BODY) -> JSONResponse:
    with _lock:
        active_error = _active_editor_error_unlocked()
        if active_error:
            status_code, body = active_error
            return _json_response(status_code, body)

    suggestion = _suggestion_from_payload(payload)
    if isinstance(suggestion, tuple):
        status_code, body = suggestion
        return _json_response(status_code, body)

    with _lock:
        _suggestions[suggestion["id"]] = suggestion
        _append_event_unlocked(
            "suggestion.created",
            actor=suggestion.get("actor"),
            message=suggestion["body"],
            data={
                "suggestionId": suggestion["id"],
                "target": suggestion.get("target"),
                "snapshotId": suggestion.get("snapshotId"),
            },
        )
    return _json_response(200, {"success": True, "suggestion": suggestion})


def _mark_suggestion(suggestion_id: str, status: str, payload: dict[str, Any]) -> JSONResponse:
    with _lock:
        suggestion = _suggestions.get(suggestion_id)
        if not suggestion:
            return _json_response(404, _error_body("INVALID_REQUEST", "Suggestion was not found.", setup_link=None))
        suggestion = {**suggestion, "status": status, "updatedAt": _iso_now()}
        _suggestions[suggestion_id] = suggestion
        _append_event_unlocked(
            f"suggestion.{status}",
            actor=_review_actor(payload),
            message=payload.get("details") if isinstance(payload.get("details"), str) else None,
            data={"suggestionId": suggestion_id},
        )
    return _json_response(200, {"success": True, "suggestion": suggestion})


@agent_router.post("/suggestions/{suggestion_id}/accept")
def accept_agent_suggestion(suggestion_id: str, payload: dict[str, Any] = JSON_BODY) -> JSONResponse:
    return _mark_suggestion(suggestion_id, "accepted", payload)


@agent_router.post("/suggestions/{suggestion_id}/reject")
def reject_agent_suggestion(suggestion_id: str, payload: dict[str, Any] = JSON_BODY) -> JSONResponse:
    return _mark_suggestion(suggestion_id, "rejected", payload)


@agent_discovery_router.get("/.well-known/mauth-agent.json")
def mauth_agent_discovery() -> dict[str, Any]:
    return {
        "name": "Mauth Studio Local Agent Bridge",
        "version": "0.1.0",
        "localOnly": True,
        "requiresActiveEditor": True,
        "canonicalContract": "http",
        "docs": "/agent-docs",
        "endpoints": {
            "snapshot": "/api/agent/current/snapshot",
            "actionsPreview": "/api/agent/current/actions/preview",
            "actionsApply": "/api/agent/current/actions/apply",
            "validationRun": "/api/agent/current/validation/run",
            "presence": "/api/agent/current/presence",
            "events": "/api/agent/current/events?after=0",
            "comments": "/api/agent/current/comments",
            "suggestions": "/api/agent/current/suggestions",
        },
        "mcp": {
            "command": "pnpm",
            "args": ["agent:mcp"],
        },
    }


@agent_discovery_router.get("/agent-docs")
def mauth_agent_docs() -> PlainTextResponse:
    docs_path = Path(__file__).resolve().parents[4] / "docs" / "agent-docs.md"
    if docs_path.exists():
        return PlainTextResponse(docs_path.read_text(encoding="utf-8"), media_type="text/markdown")
    return PlainTextResponse(
        "Mauth Studio local agent bridge docs are not available in this checkout.\n",
        status_code=404,
        media_type="text/plain",
    )


def _reset_agent_bridge_for_tests() -> None:
    global _next_event_id
    with _lock:
        _sessions.clear()
        _pending_requests.clear()
        _idempotency_cache.clear()
        _presence.clear()
        _comments.clear()
        _suggestions.clear()
        _events.clear()
        _next_event_id = 1
