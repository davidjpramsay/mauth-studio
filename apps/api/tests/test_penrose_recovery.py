import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event, Lock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import penrose

SPEC = {"type": "geometricConstruction", "options": {"variation": "recovery"}}
RESULT = {"svg": "<svg></svg>", "metadata": {"constraintValidation": {"status": "satisfied"}}}


@pytest.fixture(autouse=True)
def isolated_render_cache():
    penrose._completed.clear()
    penrose._pending.clear()
    yield
    assert not penrose._pending
    penrose._completed.clear()


def test_timeout_has_retryable_response_and_does_not_poison_cache(monkeypatch):
    calls = []

    def run(command, **kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise subprocess.TimeoutExpired(command, kwargs["timeout"])
        return subprocess.CompletedProcess(command, 0, json.dumps(RESULT), "")

    monkeypatch.setattr(penrose.subprocess, "run", run)
    client = TestClient(app)
    response = client.post("/api/diagram/penrose", json=SPEC)
    assert response.status_code == 504
    assert response.json()["detail"]["code"] == "PENROSE_RENDER_TIMEOUT"
    assert "Retry" in response.json()["detail"]["message"]
    assert "Contents/" not in response.text
    assert "svg" not in response.json()
    assert client.post("/api/diagram/penrose", json=SPEC).json() == RESULT
    assert client.post("/api/diagram/penrose", json=SPEC).json() == RESULT
    assert len(calls) == 2
    assert calls[0]["timeout"] > 15


def test_identical_concurrent_requests_share_one_render_and_return_independent_results(monkeypatch):
    start = Barrier(8)
    entered, release = Event(), Event()
    calls = []

    def render(spec):
        calls.append(spec)
        entered.set()
        assert release.wait(5)
        return RESULT

    def request():
        start.wait(timeout=5)
        return penrose.render_penrose_diagram(SPEC)

    monkeypatch.setattr(penrose, "_render_uncached", render)
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(request) for _ in range(8)]
        try:
            assert entered.wait(5)
        finally:
            release.set()
        results = [future.result(timeout=5) for future in futures]
    assert len(calls) == 1
    results[0]["metadata"]["constraintValidation"]["status"] = "changed by caller"
    assert all(result == RESULT for result in results[1:])
    assert penrose.render_penrose_diagram(SPEC) == RESULT


def test_distinct_renders_are_bounded_and_cache_keeps_complete_specs(monkeypatch):
    lock, entered, release = Lock(), Event(), Event()
    active = maximum = 0

    def render(spec):
        nonlocal active, maximum
        with lock:
            active += 1
            maximum = max(maximum, active)
            if active == 2:
                entered.set()
        try:
            assert release.wait(5)
            return {"svg": "<svg></svg>", "metadata": spec["options"]}
        finally:
            with lock:
                active -= 1

    monkeypatch.setattr(penrose, "_render_uncached", render)
    specs = [
        {**SPEC, "options": {"variation": "same-layout", "labelOffsets": {"A.labelText": [i, 0]}}} for i in range(6)
    ]
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(penrose.render_penrose_diagram, spec) for spec in specs]
        try:
            assert entered.wait(5)
        finally:
            release.set()
        results = [future.result(timeout=5) for future in futures]
    assert maximum == 2
    assert [result["metadata"] for result in results] == [spec["options"] for spec in specs]


def test_cache_is_bounded_and_failed_renders_can_be_retried(monkeypatch):
    calls = []

    def render(spec):
        variation = spec["options"]["variation"]
        calls.append(variation)
        if variation == "broken":
            raise RuntimeError("No layout satisfying the geometry constraints")
        return RESULT

    monkeypatch.setattr(penrose, "_render_uncached", render)
    monkeypatch.setattr(penrose, "MAX_CACHED_RENDERS", 2)
    for variation in ["a", "b", "a", "c", "b"]:
        penrose.render_penrose_diagram({**SPEC, "options": {"variation": variation}})
    assert calls == ["a", "b", "c", "b"]
    for _ in range(2):
        with pytest.raises(RuntimeError, match="No layout satisfying"):
            penrose.render_penrose_diagram({**SPEC, "options": {"variation": "broken"}})
    assert calls[-2:] == ["broken", "broken"]


def test_full_queue_is_retryable_and_never_returns_svg(monkeypatch):
    monkeypatch.setattr(penrose, "MAX_PENDING_RENDERS", 0)
    response = TestClient(app).post("/api/diagram/penrose", json=SPEC)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "PENROSE_RENDER_BUSY"
    assert not penrose._completed


def test_empty_output_is_not_cached(monkeypatch):
    calls = []

    def run(command, **kwargs):
        calls.append(kwargs)
        return subprocess.CompletedProcess(command, 0, json.dumps({"svg": " "}), "")

    monkeypatch.setattr(penrose.subprocess, "run", run)
    for _ in range(2):
        with pytest.raises(RuntimeError, match="empty diagram"):
            penrose.render_penrose_diagram(SPEC)
    assert len(calls) == 2
