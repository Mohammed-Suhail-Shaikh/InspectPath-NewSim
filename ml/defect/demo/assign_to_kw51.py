"""Assign CODEBRIM held-out patches to the KW51 inspection findings.

The KW51 inspection map keys findings by connection location_id (e.g.
"A-deck-105020"), not by the old grid waypoint ids. assign_to_plan.py targets
the grid plan, so this adapter targets the metric findings instead.

For each simulated finding in web/src/mocks/findings.json it picks a demo-pool
patch whose TRUE tier matches the finding's tier (so a "high" finding shows a
real exposed-bars/spallation patch, etc.), and, when the finding has a close-up,
the patch's paired close-up. Every patch comes from demo_pool.json, which is
built only from ml/defect/splits/test_files.txt (the model's held-out test set).

No images are copied here; paths are relative to the CODEBRIM folder. The output
is data/image_map.json keyed by "kw51", in the dashboard's image-map shape
(docs/contract.md section 5): { "kw51": { "<location_id>": "test/...png", ... } }.

Usage (from ml/defect/):
  python demo/assign_to_kw51.py
Optional:
  --findings <path>   default: web/src/mocks/findings.json
  --pool <path>       default: demo/demo_pool.json
  --out <path>        default: data/image_map.json
  --structure-id      default: kw51
"""
import argparse
import json
from pathlib import Path

DEMO = Path(__file__).resolve().parent
REPO = DEMO.parents[2]


def by_tier(pool):
    """Group planted pool patches by their true tier."""
    groups = {}
    for p in pool["planted"]:
        groups.setdefault(p["true_tier"], []).append(p)
    return groups


def assign(findings, pool, structure_id):
    planted_by_tier = by_tier(pool)
    clean = pool["clean"]
    used = set()
    clean_i = 0
    entries = {}

    def take_planted(tier):
        for p in planted_by_tier.get(tier, []):
            if p["id"] not in used:
                used.add(p["id"])
                return p
        raise SystemExit(
            f"Demo pool has no unused planted patch for tier '{tier}'. "
            f"Rebuild the pool or reduce findings of that tier."
        )

    # The dashboard loads images as /data/images/test/...; the image map stores
    # paths relative to the data base, i.e. prefixed with "images/".
    def served(path):
        return f"images/{path}"

    for f in findings:
        loc = f["image_key"]
        tier = f["tier"]
        if tier == "none":
            # background patch for a no-defect finding
            patch = clean[clean_i % len(clean)]
            clean_i += 1
            entries[loc] = served(patch["path"])
            continue
        patch = take_planted(tier)
        entries[loc] = served(patch["path"])
        if f.get("has_closeup"):
            entries[f"{loc}_closeup"] = served(patch["closeup"]["path"])

    return {structure_id: entries}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--findings", type=Path,
                    default=REPO / "web" / "src" / "mocks" / "findings.json")
    ap.add_argument("--pool", type=Path, default=DEMO / "demo_pool.json")
    ap.add_argument("--out", type=Path, default=REPO / "data" / "image_map.json")
    ap.add_argument("--structure-id", default="kw51")
    args = ap.parse_args()

    findings = json.loads(args.findings.read_text())
    pool = json.loads(args.pool.read_text())
    result = {
        "_note": (
            "KW51 inspection image map. Patches are CODEBRIM held-out test-split "
            "crops (from demo_pool.json / test_files.txt), matched to each "
            "finding's tier. They are representative concrete images, NOT "
            "photographs of KW51. No images are committed (CODEBRIM license)."
        ),
        **assign(findings, pool, args.structure_id),
    }
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Wrote {args.out}")
    kw = result[args.structure_id]
    print(f"{len(kw)} entries for {args.structure_id}:")
    for k, v in kw.items():
        print(f"  {k} -> {v}")


if __name__ == "__main__":
    main()
