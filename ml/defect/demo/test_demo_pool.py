"""Checks the committed demo_pool.json. No dataset or model needed."""
import json
from pathlib import Path

DEMO = Path(__file__).resolve().parent
pool = json.loads((DEMO / "demo_pool.json").read_text())
test_files = set((DEMO.parent / "splits" / "test_files.txt").read_text().split())


def entries():
    yield from pool["clean"]
    for p in pool["planted"]:
        yield p
        yield p["closeup"]


def test_counts():
    groups = [p["group"] for p in pool["planted"]]
    assert len(pool["clean"]) == 12
    assert (groups.count("high"), groups.count("medium"), groups.count("low")) == (4, 3, 3)


def test_every_patch_is_in_test_split_and_unique():
    paths = [e["path"] for e in entries()]
    assert len(paths) == len(set(paths)) == 32
    assert all(Path(p).name in test_files for p in paths)
    assert not any(Path(p).is_absolute() for p in paths)


def test_closeup_has_same_labels_as_its_patch():
    for p in pool["planted"]:
        assert p["closeup"]["labels"] == p["labels"]
        assert p["closeup"]["path"] != p["path"]
