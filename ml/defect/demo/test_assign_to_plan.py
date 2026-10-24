"""Tests for assign_to_plan.py using a tiny made-up plan and pool (no dataset, no model needed)."""
import json
import sys
from pathlib import Path

import pytest

DEMO = Path(__file__).resolve().parent
sys.path.insert(0, str(DEMO))
import assign_to_plan as atp  # noqa: E402


def fake_pool(n_clean=12):
    def closeup(pid):
        return {"id": pid + "_closeup", "path": f"test/defects/{pid}_closeup.png"}
    planted = [{"id": f"{g}_{i}", "group": g, "path": f"test/defects/{g}_{i}.png",
                "closeup": closeup(f"{g}_{i}")}
               for g, n in (("high", 4), ("medium", 3), ("low", 3)) for i in range(n)]
    clean = [{"id": f"c{i}", "path": f"test/background/c{i}.png"} for i in range(n_clean)]
    return {"clean": clean, "planted": planted}


def fake_plan(n_capture, n_other=3):
    wps = [{"id": f"w{i}", "capture": i % 2 == 0 and i // 2 < n_capture} for i in range(n_capture * 2 + n_other)]
    return {"waypoints": wps}


def test_plants_four_spread_evenly_and_fills_rest_clean():
    plan = fake_plan(8)
    capture = [w["id"] for w in plan["waypoints"] if w["capture"]]
    assert len(capture) == 8
    out = atp.assign(plan, fake_pool(), "bridge-x")["bridge-x"]
    planted = [w for w in capture if f"{w}_closeup" in out]
    assert planted == [capture[1], capture[3], capture[5], capture[7]]
    assert [out[w].split("/")[-1].split("_")[0] for w in planted] == ["high", "medium", "high", "low"]
    for w in capture:
        assert (w in planted) == out[w].startswith("test/defects/")
    assert all(not k.startswith("test/") for k in out)
    non_capture = [w["id"] for w in plan["waypoints"] if not w["capture"]]
    assert not any(w in out for w in non_capture)


def test_clean_patches_do_not_repeat_when_pool_is_big_enough():
    out = atp.assign(fake_plan(10), fake_pool(), "s")["s"]
    clean = [v for v in out.values() if v.startswith("test/background/")]
    assert len(clean) == 6 and len(set(clean)) == 6


def test_too_few_capture_waypoints_is_an_error():
    with pytest.raises(ValueError):
        atp.assign(fake_plan(3), fake_pool(), "s")


def test_cli_writes_note_and_structure_id(tmp_path):
    plan, pool, out = tmp_path / "p.json", tmp_path / "pool.json", tmp_path / "m.json"
    plan.write_text(json.dumps(fake_plan(5)))
    pool.write_text(json.dumps(fake_pool()))
    sys.argv = ["x", "--plan", str(plan), "--pool", str(pool), "--structure-id", "bridge-x",
                "--out", str(out), "--note", "provisional"]
    atp.main()
    data = json.loads(out.read_text())
    assert list(data) == ["_note", "bridge-x"] and data["_note"] == "provisional"
