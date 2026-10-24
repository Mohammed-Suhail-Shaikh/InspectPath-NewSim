"""Assign pool patches to the capture waypoints of a plan and write an image map.

Reads demo_pool.json (from build_demo_pool.py) and a planner output JSON
({"waypoints": [{"id": "w4", "capture": true, ...}, ...]}).

  * Takes every waypoint with "capture": true, in plan order.
  * Plants 4 defects spread evenly over those waypoints: high, medium, high, low.
  * Every other capture waypoint gets a clean background patch.
  * Each planted waypoint also gets a "<waypoint>_closeup" entry.
  * Paths are relative to the CODEBRIM folder. No images are copied.

Output format (docs/contract.md section 5):
  {"<structure_id>": {"w4": "test/defects/...png", "w4_closeup": "test/defects/...png", ...}}

Usage (from ml/defect/):
  python demo/assign_to_plan.py --plan <plan.json> --structure <structure.json> --out <file>
The structure id comes from the plan's "structure_id" key, else --structure-id, else the "id" in
the --structure file.
"""
import argparse
import json
import sys
from pathlib import Path

DEMO = Path(__file__).resolve().parent
PLANT_ORDER = ["high", "medium", "high", "low"]  # tier of each planted defect, left to right


def planted_positions(n_capture, n_plant):
    """Indices spread evenly over n_capture slots (centre of each of n_plant equal chunks)."""
    if n_capture < n_plant:
        raise ValueError(f"Plan has {n_capture} capture waypoints, need at least {n_plant}.")
    return [int((i + 0.5) * n_capture / n_plant) for i in range(n_plant)]


def assign(plan, pool, structure_id):
    capture = [w["id"] for w in plan["waypoints"] if w.get("capture")]
    positions = planted_positions(len(capture), len(PLANT_ORDER))

    by_group = {}
    for p in pool["planted"]:
        by_group.setdefault(p["group"], []).append(p)
    for group in set(PLANT_ORDER):
        if len(by_group.get(group, [])) < PLANT_ORDER.count(group):
            raise ValueError(f"Pool has too few '{group}' patches.")

    planted_at, used = {}, {g: 0 for g in by_group}
    for pos, group in zip(positions, PLANT_ORDER):
        planted_at[pos] = by_group[group][used[group]]
        used[group] += 1

    n_clean_needed = len(capture) - len(PLANT_ORDER)
    clean = pool["clean"]
    if n_clean_needed > len(clean):
        print(f"WARNING: plan needs {n_clean_needed} clean patches, pool has {len(clean)}. "
              "Clean patches will repeat.", file=sys.stderr)

    entries, clean_i = {}, 0
    for i, wp in enumerate(capture):
        if i in planted_at:
            p = planted_at[i]
            entries[wp] = p["path"]
            entries[f"{wp}_closeup"] = p["closeup"]["path"]
        else:
            entries[wp] = clean[clean_i % len(clean)]["path"]
            clean_i += 1
    return {structure_id: entries}


def structure_id_for(plan, args):
    if plan.get("structure_id"):
        return plan["structure_id"]
    if args.structure_id:
        return args.structure_id
    if args.structure:
        return json.loads(args.structure.read_text())["id"]
    raise SystemExit("No structure id: give --structure-id or --structure <file> "
                     "(or put structure_id in the plan).")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--plan", type=Path, required=True)
    ap.add_argument("--pool", type=Path, default=DEMO / "demo_pool.json")
    ap.add_argument("--structure", type=Path, help="structure JSON; its 'id' is used")
    ap.add_argument("--structure-id")
    ap.add_argument("--out", type=Path, default=DEMO / "image_map.json")
    ap.add_argument("--note", help='adds a top-level "_note" key to the output')
    args = ap.parse_args()

    plan = json.loads(args.plan.read_text())
    pool = json.loads(args.pool.read_text())
    result = assign(plan, pool, structure_id_for(plan, args))
    if args.note:
        result = {"_note": args.note, **result}
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
