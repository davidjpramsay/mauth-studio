from __future__ import annotations

from threading import Thread

from fastapi.testclient import TestClient

from app.api.agent import _reset_agent_bridge_for_tests
from app.main import app

client = TestClient(app)


def setup_function() -> None:
    _reset_agent_bridge_for_tests()


def test_snapshot_without_editor_returns_setup_error() -> None:
    response = client.get("/api/agent/current/snapshot")

    assert response.status_code == 503
    assert response.json()["code"] == "APP_NOT_CONNECTED"


def test_packaged_bridge_requires_the_per_launch_bearer_token(monkeypatch) -> None:
    token = "test-packaged-agent-token-that-is-at-least-32-characters"
    monkeypatch.setenv("MAUTH_AGENT_TOKEN", token)

    missing = client.get("/api/agent/current/snapshot")
    wrong = client.get("/api/agent/current/snapshot", headers={"Authorization": "Bearer wrong-token"})
    authenticated = client.get("/api/agent/current/snapshot", headers={"Authorization": f"Bearer {token}"})
    private_api = client.get("/api/storage/projects")
    discovery = client.get("/.well-known/mauth-agent.json")
    system_status = client.get("/api/system/status")

    assert missing.status_code == 401
    assert missing.json()["code"] == "AGENT_AUTH_REQUIRED"
    assert missing.headers["www-authenticate"] == "Bearer"
    assert wrong.status_code == 401
    assert authenticated.status_code == 503
    assert authenticated.json()["code"] == "APP_NOT_CONNECTED"
    assert private_api.status_code == 401
    assert private_api.json()["code"] == "API_AUTH_REQUIRED"
    assert discovery.status_code == 200
    assert system_status.status_code == 200


def test_broker_dispatches_request_and_returns_browser_response() -> None:
    session_id = client.post("/api/agent/current/browser/register", json={"sessionId": "test-editor"}).json()[
        "sessionId"
    ]
    result: dict[str, object] = {}

    def request_snapshot() -> None:
        result["response"] = client.get("/api/agent/current/snapshot")

    thread = Thread(target=request_snapshot)
    thread.start()

    browser_request = client.get(
        "/api/agent/current/browser/requests",
        params={"sessionId": session_id, "timeoutSeconds": 2},
    ).json()["request"]
    assert browser_request["kind"] == "snapshot"

    client.post(
        "/api/agent/current/browser/respond",
        json={
            "sessionId": session_id,
            "requestId": browser_request["requestId"],
            "status": 200,
            "body": {"success": True, "snapshotId": "snap_test"},
        },
    )
    thread.join(timeout=3)

    response = result["response"]
    assert response.status_code == 200
    assert response.json()["snapshotId"] == "snap_test"


def test_unregister_removes_browser_session() -> None:
    client.post("/api/agent/current/browser/register", json={"sessionId": "test-editor"})

    response = client.post("/api/agent/current/browser/unregister", json={"sessionId": "test-editor"})

    assert response.status_code == 200
    assert response.json() == {"success": True, "removed": True}
    snapshot_response = client.get("/api/agent/current/snapshot")
    assert snapshot_response.status_code == 503
    assert snapshot_response.json()["code"] == "APP_NOT_CONNECTED"


def test_unregister_accepts_query_session_for_page_beacon() -> None:
    client.post("/api/agent/current/browser/register", json={"sessionId": "test-editor"})

    response = client.post("/api/agent/current/browser/unregister?sessionId=test-editor")

    assert response.status_code == 200
    assert response.json() == {"success": True, "removed": True}


def test_unregister_releases_pending_browser_request() -> None:
    session_id = client.post("/api/agent/current/browser/register", json={"sessionId": "test-editor"}).json()[
        "sessionId"
    ]
    result: dict[str, object] = {}

    def request_snapshot() -> None:
        result["response"] = client.get("/api/agent/current/snapshot")

    thread = Thread(target=request_snapshot)
    thread.start()
    browser_request = client.get(
        "/api/agent/current/browser/requests",
        params={"sessionId": session_id, "timeoutSeconds": 2},
    ).json()["request"]
    assert browser_request["kind"] == "snapshot"

    client.post("/api/agent/current/browser/unregister", json={"sessionId": session_id})
    thread.join(timeout=3)

    response = result["response"]
    assert response.status_code == 503
    assert response.json()["code"] == "APP_NOT_CONNECTED"


def test_presence_and_events_are_recorded() -> None:
    response = client.post(
        "/api/agent/current/presence",
        json={"agentId": "codex-local", "name": "Codex", "status": "active", "details": "Running bridge smoke test"},
    )
    assert response.status_code == 200

    events_response = client.get("/api/agent/current/events?after=0")
    assert events_response.status_code == 200
    payload = events_response.json()
    assert payload["presence"][0]["id"] == "codex-local"
    assert payload["events"][0]["type"] == "presence.updated"


def test_comments_and_suggestions_are_recorded_as_review_state() -> None:
    client.post("/api/agent/current/browser/register", json={"sessionId": "test-editor"})

    comment_response = client.post(
        "/api/agent/current/comments",
        json={
            "actor": "codex-local",
            "body": "Check this wording before publishing.",
            "severity": "warning",
            "snapshotId": "snap_a",
            "target": {"kind": "question", "questionId": "q1"},
        },
    )
    assert comment_response.status_code == 200
    comment = comment_response.json()["comment"]
    assert comment["status"] == "open"
    assert comment["target"]["questionId"] == "q1"

    comments_response = client.get("/api/agent/current/comments?status=open")
    assert comments_response.status_code == 200
    assert comments_response.json()["comments"][0]["id"] == comment["id"]

    resolve_response = client.post(
        f"/api/agent/current/comments/{comment['id']}/resolve",
        json={"actor": "teacher"},
    )
    assert resolve_response.status_code == 200
    assert resolve_response.json()["comment"]["status"] == "resolved"

    suggestion_response = client.post(
        "/api/agent/current/suggestions",
        json={
            "actor": "codex-local",
            "title": "Tighten prompt",
            "body": "Replace the prompt with a more direct instruction.",
            "actions": [{"type": "question.update", "questionId": "q1", "patch": {"text": "Simplify."}}],
            "target": {"kind": "question", "questionId": "q1"},
        },
    )
    assert suggestion_response.status_code == 200
    suggestion = suggestion_response.json()["suggestion"]
    assert suggestion["status"] == "proposed"
    assert suggestion["actions"][0]["type"] == "question.update"

    reject_response = client.post(
        f"/api/agent/current/suggestions/{suggestion['id']}/reject",
        json={"actor": "teacher", "details": "Not needed"},
    )
    assert reject_response.status_code == 200
    assert reject_response.json()["suggestion"]["status"] == "rejected"

    events = client.get("/api/agent/current/events?after=0").json()["events"]
    assert [event["type"] for event in events] == [
        "editor.connected",
        "comment.created",
        "comment.resolved",
        "suggestion.created",
        "suggestion.rejected",
    ]


def test_apply_requires_idempotency_key() -> None:
    response = client.post(
        "/api/agent/current/actions/apply",
        json={"baseSnapshotId": "snap_a", "actions": []},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_REQUEST"


def test_apply_idempotency_replays_same_response_and_rejects_mismatch() -> None:
    session_id = client.post("/api/agent/current/browser/register", json={"sessionId": "test-editor"}).json()[
        "sessionId"
    ]
    payload = {"baseSnapshotId": "snap_a", "actions": [{"type": "document.validation.run"}]}
    result: dict[str, object] = {}

    def request_apply() -> None:
        result["response"] = client.post(
            "/api/agent/current/actions/apply",
            json=payload,
            headers={"Idempotency-Key": "apply-once"},
        )

    thread = Thread(target=request_apply)
    thread.start()
    browser_request = client.get(
        "/api/agent/current/browser/requests",
        params={"sessionId": session_id, "timeoutSeconds": 2},
    ).json()["request"]
    client.post(
        "/api/agent/current/browser/respond",
        json={
            "sessionId": session_id,
            "requestId": browser_request["requestId"],
            "status": 200,
            "body": {"success": True, "result": {"changedIds": []}},
        },
    )
    thread.join(timeout=3)

    first_response = result["response"]
    assert first_response.status_code == 200
    assert first_response.json()["result"]["changedIds"] == []

    replay_response = client.post(
        "/api/agent/current/actions/apply",
        json=payload,
        headers={"Idempotency-Key": "apply-once"},
    )
    assert replay_response.status_code == 200
    assert replay_response.json() == first_response.json()

    mismatch_response = client.post(
        "/api/agent/current/actions/apply",
        json={"baseSnapshotId": "snap_b", "actions": []},
        headers={"Idempotency-Key": "apply-once"},
    )
    assert mismatch_response.status_code == 409
    assert mismatch_response.json()["code"] == "IDEMPOTENCY_KEY_REUSED"
