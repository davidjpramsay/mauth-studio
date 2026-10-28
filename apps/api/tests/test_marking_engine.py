from marking_engine.engine import MarkingEngine

from app.bootstrap import CONFIG_ROOT


def test_equivalent_answer_awards_accuracy_mark():
    engine = MarkingEngine(CONFIG_ROOT / "marking")

    result = engine.mark_answer(
        expected="(x + 1)^2",
        submitted="x^2 + 2*x + 1",
        submitted_steps=["expand", "simplify"],
    )

    assert result["equivalent"] is True
    assert result["awarded"] == result["available"]


def test_step_validation_can_withhold_method_marks():
    engine = MarkingEngine(CONFIG_ROOT / "marking")

    result = engine.mark_answer(
        expected="x^2 + 2*x + 1",
        submitted="x^2 + 2*x + 1",
        submitted_steps=["expand"],
    )

    assert result["equivalent"] is True
    assert result["awarded"] == 2
    assert result["available"] == 3


def test_marking_rejects_executable_expected_and_submitted_expressions(tmp_path):
    marker = tmp_path / "executed"
    payload = f'__import__("pathlib").Path("{marker}").write_text("unexpected")'
    assert not MarkingEngine.equivalent(payload, "1")
    assert not MarkingEngine.equivalent("1", payload)
    assert not MarkingEngine.equivalent(payload, payload)
    assert not MarkingEngine.equivalent("(", "(")
    assert MarkingEngine.equivalent("f(x)", "f(x)")
    assert MarkingEngine.equivalent("3!", "6")
    assert not marker.exists()
