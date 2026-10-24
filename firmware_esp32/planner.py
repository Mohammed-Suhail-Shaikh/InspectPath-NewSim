"""
InspectPath inspection planner
==============================
Owner: Varun. Standard library only (no pip install needed).

Pipeline (brief section 2):
    trigger records  ->  find the alert that dispatches an inspection
                     ->  plan a route that visits the zone near the alert first
                     ->  "capture" an image at each waypoint (from image_map.json)
                     ->  send it to Zaiba's POST /predict
                     ->  if the tier is high or medium, take a close-up too
                     ->  write one ranked report for Suhail's dashboard

Usage examples:
    python planner.py --records sample_records.json --mock
    python planner.py --records ../data/trigger/replay_kw51.json --images ../data/image_map.json \
                      --api http://localhost:8000/predict
    python planner.py --records node_serial_log.txt --mock      # lines starting @trigger / @status
"""

import argparse
import hashlib
import json
import math
import mimetypes
import os
import urllib.request
import uuid
from datetime import datetime, timezone

LEVELS = ["normal", "watch", "warning", "alarm"]          # brief 6.5
TIERS = ["none", "low", "medium", "high"]                  # brief 5.5
DEFECTS = ["crack", "spallation", "exposed_bars", "efflorescence", "corrosion_stain"]
DISPATCH_LEVELS = {"warning", "alarm"}                     # brief section 2: "Warning or Alarm"


# ---------------------------------------------------------------------------
# 1. Reading inputs
# ---------------------------------------------------------------------------
def load_records(path):
    """Load trigger/status records from a JSON array, JSON lines, or a node serial log."""
    with open(path, encoding="utf-8-sig") as f:   # utf-8-sig also handles files saved by Notepad
        text = f.read().strip()
    try:
        data = json.loads(text)          # a JSON array, like Komal's replay files
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass                             # not one JSON document: read it line by line
    records, broken = [], 0
    for line in text.splitlines():
        line = line.strip()
        # Find the prefix anywhere, so timestamps added by a serial monitor don't matter
        for prefix in ("@trigger ", "@status "):
            if prefix in line:
                line = line[line.index(prefix) + len(prefix):]
        if line.startswith("{"):
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                broken += 1              # usually a line cut off while copying
    if broken:
        print(f"Skipped {broken} incomplete JSON line(s), probably cut off while copying.")
    if not records:
        lines = text.splitlines()
        print(f"Read {len(lines)} lines from {path} but none were @trigger / @status records.")
        if any("Bridge monitoring node starting" in ln for ln in lines):
            print("This log is from the OLD firmware, which prints no JSON records. Use firmware v2.")
        elif not any("=====" in ln for ln in lines):
            print("No window reports found. Wait until the baseline finishes before copying.")
    return records


def level_of(record):
    """Alert level of a record. A status record's overall_alert counts too (scour, tilt, strain)."""
    levels = [record.get("alert_level", "normal"), record.get("overall_alert", "normal")]
    return max(levels, key=lambda lv: LEVELS.index(lv) if lv in LEVELS else 0)


def find_dispatch(records):
    """First good-quality record at Warning or Alarm, in time order. Returns None if none."""
    good = [r for r in records if r.get("quality", "ok") == "ok"]
    good.sort(key=lambda r: r.get("timestamp", ""))
    for r in good:
        if level_of(r) in DISPATCH_LEVELS:
            return r
    return None


# ---------------------------------------------------------------------------
# 2. Route planning
# ---------------------------------------------------------------------------
def distance(a, b):
    return math.hypot(a["x_m"] - b["x_m"], a["y_m"] - b["y_m"])


def nearest_neighbor_order(start, points):
    """Visit points by always flying to the closest unvisited one. Simple and good enough here."""
    remaining = list(points)
    order, current = [], start
    while remaining:
        nxt = min(remaining, key=lambda p: distance(current, p))
        order.append(nxt)
        remaining.remove(nxt)
        current = nxt
    return order


def plan_route(layout, node_id, level):
    """Warning: inspect only the zone near the node. Alarm: that zone first, then the whole bridge."""
    node = layout["nodes"][node_id]
    radius = layout.get("priority_radius_m", 20.0)
    waypoints = layout["waypoints"]

    near = [w for w in waypoints if distance(w, node) <= radius]
    far = [w for w in waypoints if distance(w, node) > radius]

    # Go straight to the waypoint closest to the alert, then sweep the rest of the zone
    first = min(near, key=lambda w: distance(w, node))
    priority = [first] + nearest_neighbor_order(first, [w for w in near if w is not first])
    route = priority
    if level == "alarm":
        route = route + nearest_neighbor_order(priority[-1], far)

    length, current = 0.0, layout["launch"]
    for w in route:
        length += distance(current, w)
        current = w
    return route, length, node


# ---------------------------------------------------------------------------
# 3. Defect model calls
# ---------------------------------------------------------------------------
def tier_from_detected(detected):
    """Same rule as brief 5.5, used if the API response has no tier."""
    if "exposed_bars" in detected or "spallation" in detected:
        return "high"
    if "corrosion_stain" in detected:
        return "medium"
    if "crack" in detected or "efflorescence" in detected:
        return "low"
    return "none"


def predict_api(image_path, api_url):
    """POST the image as multipart form data (field name 'file') and return the JSON response."""
    boundary = uuid.uuid4().hex
    mime = mimetypes.guess_type(image_path)[0] or "application/octet-stream"
    with open(image_path, "rb") as f:
        data = f.read()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(image_path)}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(api_url, data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def predict_mock(key, threshold=0.5):
    """Fake but repeatable scores (same key -> same answer), in the 5.4 format, for testing only."""
    digest = hashlib.sha256(key.encode()).digest()
    # Cubing pushes most scores low, so mock results look like a real mix of tiers
    scores = {d: round((digest[i] / 255) ** 3, 2) for i, d in enumerate(DEFECTS)}
    detected = [d for d, s in scores.items() if s >= threshold]
    return {"scores": scores, "detected": detected, "tier": tier_from_detected(detected), "threshold": threshold}


def run_predict(image_path, key, args):
    if args.mock:
        return predict_mock(key)
    result = predict_api(image_path, args.api)
    result.setdefault("tier", tier_from_detected(result.get("detected", [])))
    return result


# ---------------------------------------------------------------------------
# 4. Inspection and ranking
# ---------------------------------------------------------------------------
def inspect(route, node, image_map, args):
    steps, findings = [], []
    for w in route:
        dist = round(distance(w, node), 1)
        steps.append({"order": len(steps) + 1, "waypoint": w["id"], "action": "capture",
                      "element": w["element"], "zone": w["zone"], "distance_from_alert_m": dist})
        images = image_map.get(w["id"], {})
        capture_img = images.get("capture")
        if not args.mock and not capture_img:
            findings.append({"waypoint": w["id"], "zone": w["zone"], "element": w["element"],
                             "distance_from_alert_m": dist, "tier": "none", "status": "no_image"})
            continue

        result = run_predict(capture_img, w["id"] + ":capture", args)
        finding = {"waypoint": w["id"], "zone": w["zone"], "element": w["element"],
                   "distance_from_alert_m": dist, "status": "inspected",
                   "capture": {"image": capture_img, **result}, "closeup": None, "tier": result["tier"]}

        # Close-up rule (brief 5.5): high or medium tier -> go back for a closer look
        if result["tier"] in ("high", "medium"):
            steps.append({"order": len(steps) + 1, "waypoint": w["id"], "action": "closeup",
                          "element": w["element"], "zone": w["zone"], "distance_from_alert_m": dist})
            closeup_img = images.get("closeup")
            if args.mock or closeup_img:
                close = run_predict(closeup_img, w["id"] + ":closeup", args)
                finding["closeup"] = {"image": closeup_img, **close}
                finding["tier"] = max(result["tier"], close["tier"], key=TIERS.index)

        shots = [finding["capture"]] + ([finding["closeup"]] if finding["closeup"] else [])
        finding["detected"] = sorted(set(finding["capture"]["detected"]) |
                                     set((finding["closeup"] or {}).get("detected", [])))
        finding["max_score"] = max(max(shot["scores"].values()) for shot in shots)   # best of both images
        findings.append(finding)

    # Rank: worst tier first, then highest score, then closest to the alert
    findings.sort(key=lambda f: (-TIERS.index(f["tier"]), -f.get("max_score", 0), f["distance_from_alert_m"]))
    for i, f in enumerate(findings, 1):
        f["rank"] = i
    return steps, findings


# ---------------------------------------------------------------------------
# 5. Main
# ---------------------------------------------------------------------------
def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="InspectPath inspection planner")
    ap.add_argument("--records", required=True, help="trigger/status records (JSON array, JSON lines or serial log)")
    ap.add_argument("--layout", default=os.path.join(here, "bridge_layout.json"))
    ap.add_argument("--images", default=None, help="image_map.json (not needed with --mock)")
    ap.add_argument("--api", default="http://localhost:8000/predict", help="Zaiba's /predict URL")
    ap.add_argument("--mock", action="store_true", help="fake defect scores, for testing without the model")
    ap.add_argument("--out", default=os.path.join(here, "output", "inspection_report.json"))
    args = ap.parse_args()

    with open(args.layout, encoding="utf-8") as f:
        layout = json.load(f)
    image_map = {}
    if args.images:
        with open(args.images, encoding="utf-8") as f:
            image_map = json.load(f).get("waypoints", {})

    records = load_records(args.records)
    alert = find_dispatch(records)
    if alert is None:
        print(f"No good-quality Warning or Alarm in {len(records)} records. No inspection dispatched.")
        return

    node_id = alert["node_id"]
    if node_id not in layout["nodes"]:
        raise SystemExit(f"{node_id} is not in {args.layout}. Add its position under 'nodes'.")
    level = level_of(alert)
    route, length, node = plan_route(layout, node_id, level)
    steps, findings = inspect(route, node, image_map, args)

    report = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "bridge_id": layout["bridge_id"],
        "defect_model": "mock (test data, not real predictions)" if args.mock else args.api,
        "dispatch": {"node_id": node_id, "timestamp": alert.get("timestamp"), "level": level,
                     "scope": "full bridge, alert zone first" if level == "alarm" else "alert zone only",
                     "record": alert},
        "route_length_m": round(length, 1),
        "route": steps,
        "findings": findings,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"Dispatch: {node_id} {level.upper()} at {alert.get('timestamp')} -> {report['dispatch']['scope']}")
    print(f"Route: {' -> '.join(s['waypoint'] + ('*' if s['action'] == 'closeup' else '') for s in steps)}"
          f"  ({report['route_length_m']} m, * = close-up)")
    print("Ranked findings:")
    for f in findings:
        print(f"  {f['rank']:>2}. {f['waypoint']:<6} {f['tier']:<6} {', '.join(f.get('detected', [])) or '-'}")
    print(f"Report written to {args.out}")


if __name__ == "__main__":
    main()
