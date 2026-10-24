"""Build the demo patch pool from the CODEBRIM TEST split only.

Patches are chosen by their TRUE labels (from the CODEBRIM XML files), never by model output.
Nothing is copied: demo_pool.json stores paths RELATIVE to the CODEBRIM folder, so the same file
works on every laptop that has the dataset at <repo>/datasets/codebrim (or --data-dir).

Pool contents (seeded, so the same seed always gives the same pool):
  12 clean background patches
   4 high   planted patches (2 exposed_bars-only, 2 spallation-only)
   3 medium planted patches (corrosion_stain-only)
   3 low    planted patches (2 crack-only, 1 efflorescence-only)
  + 1 close-up per planted patch: a DIFFERENT patch with the SAME true label set.
All planted patches and close-ups come from different source photos.

Usage (from ml/defect/):
  python demo/build_demo_pool.py            # write demo_pool.json
  python demo/build_demo_pool.py --check    # also run every patch through the REAL API
                                            # and write pool_check.md (MOCK_MODEL is ignored)
"""
import argparse
import json
import os
import random
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

DEMO = Path(__file__).resolve().parent
DEFECT_DIR = DEMO.parent
sys.path.insert(0, str(DEFECT_DIR))
from tier import tier  # noqa: E402

SEED = 42
XML_TAGS = {"Crack": "crack", "Spallation": "spallation", "ExposedBars": "exposed_bars",
            "Efflorescence": "efflorescence", "CorrosionStain": "corrosion_stain"}

N_CLEAN = 12
# (group, exact true label set). One row per planted patch.
PLANTED_SPEC = (
    [("high", ("exposed_bars",))] * 2 + [("high", ("spallation",))] * 2
    + [("medium", ("corrosion_stain",))] * 3
    + [("low", ("crack",))] * 2 + [("low", ("efflorescence",))]
)


def photo_of(filename):
    return filename.split("_crop_")[0]


def read_labels(data_dir):
    """{filename: (background_flag, frozenset of defect classes)} from both XML files."""
    out = {}
    for xml_file in ("defects.xml", "background.xml"):
        for item in ET.parse(data_dir / "metadata" / xml_file).getroot():
            tags = {child.tag: int(child.text) for child in item}
            out[item.get("name")] = (
                tags["Background"], frozenset(v for t, v in XML_TAGS.items() if tags[t]))
    return out


def take(rng, candidates, used_photos):
    """Pick one candidate (seeded) whose source photo is not used yet."""
    pool = [c for c in candidates if photo_of(c) not in used_photos]
    if not pool:
        raise SystemExit("Not enough patches from distinct photos for this selection.")
    pick = rng.choice(pool)
    used_photos.add(photo_of(pick))
    return pick


def build(data_dir):
    test_files = set((DEFECT_DIR / "splits" / "test_files.txt").read_text().split())
    labels = read_labels(data_dir)
    rng = random.Random(SEED)

    def listing(sub):
        names = sorted(p.name for p in (data_dir / "test" / sub).glob("*.png"))
        return [n for n in names if n in test_files]

    background = [n for n in listing("background")
                  if labels[n][0] == 1 and not labels[n][1]]
    defects = listing("defects")
    by_set = {}
    for n in defects:
        bg, classes = labels[n]
        if bg == 0 and classes:
            by_set.setdefault(classes, []).append(n)

    def entry(pid, group, sub, name):
        classes = sorted(labels[name][1])
        return {"id": pid, "group": group, "path": f"test/{sub}/{name}",
                "labels": classes or ["background"], "true_tier": tier(classes)}

    used = set()
    clean = [entry(f"clean_{i + 1:02d}", "clean", "background", take(rng, background, used))
             for i in range(N_CLEAN)]

    planted, counters, picked = [], {}, set()
    for group, label_set in PLANTED_SPEC:
        counters[group] = counters.get(group, 0) + 1
        cands = [n for n in by_set[frozenset(label_set)] if n not in picked]
        name = take(rng, cands, used)
        picked.add(name)
        planted.append(entry(f"{group}_{counters[group]:02d}", group, "defects", name))
    for p in planted:  # close-ups only after all planted patches are fixed
        cands = [n for n in by_set[frozenset(p["labels"])] if n not in picked]
        name = take(rng, cands, used)
        picked.add(name)
        p["closeup"] = entry(f"{p['id']}_closeup", f"{p['group']}_closeup", "defects", name)

    pool = {
        "_note": ("Demo patch pool. Test split only, chosen by TRUE label. Paths are relative to "
                  "the CODEBRIM folder. No images are stored in the repo (CODEBRIM license)."),
        "seed": SEED,
        "clean": clean,
        "planted": planted,
    }
    all_paths = [e["path"] for e in all_entries(pool)]
    assert len(all_paths) == len(set(all_paths)), "A patch was used twice."
    for path in all_paths:
        assert Path(path).name in test_files, f"{path} is not in test_files.txt"
        assert (data_dir / path).is_file(), f"{path} not found on disk"
    return pool


def all_entries(pool):
    for e in pool["clean"]:
        yield e
    for p in pool["planted"]:
        yield p
        yield p["closeup"]


def check(pool, data_dir):
    """Send every patch through the REAL model API and write pool_check.md."""
    os.environ.pop("MOCK_MODEL", None)  # the check must use the real model
    from fastapi.testclient import TestClient
    from api.main import app

    rows, stats = [], {}
    with TestClient(app) as client:
        assert client.get("/health").json()["mock"] is False, "API is in mock mode"
        for e in all_entries(pool):
            with open(data_dir / e["path"], "rb") as f:
                res = client.post("/predict", files={"file": (Path(e["path"]).name, f, "image/png")})
            res.raise_for_status()
            body = res.json()
            match = body["tier"] == e["true_tier"]
            kind = ("clean" if e["group"] == "clean"
                    else "closeup" if e["group"].endswith("_closeup") else "planted")
            s = stats.setdefault(kind, [0, 0])
            s[0] += match
            s[1] += 1
            rows.append((e["group"], e["id"], ", ".join(e["labels"]),
                         body["tier"], ", ".join(body["detected"]) or "-", "yes" if match else "NO"))

    p, c, k = stats["planted"], stats["closeup"], stats["clean"]
    lines = [
        "# Demo pool check (real model, test split)", "",
        f"{p[0]} of {p[1]} planted patches matched; {c[0]} of {c[1]} close-ups matched; "
        f"{k[0]} of {k[1]} clean patches matched.", "",
        "Match = predicted tier equals the tier of the TRUE labels. Patches were not swapped.", "",
        "| group | patch | true labels | predicted tier | detected | match |",
        "|---|---|---|---|---|---|",
    ] + [f"| {' | '.join(r)} |" for r in rows]
    (DEMO / "pool_check.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines[2:3]))
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--data-dir", type=Path, default=DEFECT_DIR.parents[1] / "datasets" / "codebrim")
    ap.add_argument("--check", action="store_true", help="run every patch through the real API")
    args = ap.parse_args()

    pool = build(args.data_dir)
    (DEMO / "demo_pool.json").write_text(json.dumps(pool, indent=2) + "\n")
    n = sum(1 for _ in all_entries(pool))
    print(f"Wrote demo_pool.json ({n} patches: {len(pool['clean'])} clean, "
          f"{len(pool['planted'])} planted + {len(pool['planted'])} close-ups)")
    if args.check:
        check(pool, args.data_dir)


if __name__ == "__main__":
    main()
