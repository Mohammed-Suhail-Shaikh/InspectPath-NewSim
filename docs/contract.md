# InspectPath data contracts

Single source of truth for data passed between components.
Do not change a contract without telling the whole team.
All values shown are examples only.

## 1. Defect model API (owner: Zaiba, ml/defect/)

POST /predict with an image file (or base64 image).

Response:
```json
{
  "scores": {
    "crack": 0.82,
    "spallation": 0.10,
    "exposed_bars": 0.05,
    "efflorescence": 0.31,
    "corrosion_stain": 0.12
  },
  "detected": ["crack", "efflorescence"],
  "tier": "low",
  "threshold": 0.5
}
```

- `detected` lists classes with score >= threshold.
- Tier rule (team decision, not an engineering standard):
  - `high`: exposed_bars or spallation detected
  - `medium`: corrosion_stain detected, no high-tier class
  - `low`: only crack and/or efflorescence detected
  - `none`: nothing detected
- `high` and `medium` trigger a close-up re-inspection.

## 2. Trigger replay data (owner: Komal, ml/trigger/ and data/trigger/)

File: `data/trigger/replay_<dataset>.json`, a JSON array, one record per measurement window.

```json
[
  {
    "node_id": "node-1",
    "timestamp": "2019-06-25T10:00:00Z",
    "temperature_c": -2.4,
    "frequency_hz": 3.91,
    "predicted_frequency_hz": 4.05,
    "residual_pct": -3.5,
    "alert_level": "watch",
    "quality": "ok",
    "source": "KW51 replay"
  }
]
```

- `alert_level`: `normal` | `watch` | `warning` | `alarm`
- Thresholds on absolute residual: 0.75% watch, 1.5% warning, 2.0% alarm. Tuned to KW51, where healthy variation is about 0.2 to 0.3% and the structural change is about 2%; with 2/5/8 nothing would pass watch.
- `quality`: `ok` | `degraded`. Degraded windows are shown as "node degraded", never as "bridge unsafe".
- Files: `replay_kw51.json` (full) and `replay_kw51_demo.json` (June 22 to 29, 2019, normal to alarm).
- `node-1` corresponds to the structure’s `alert_zone` (section 3).
- Timestamps are the dataset’s recorded times; this is replayed historical data, not live.

## 3. Structure input (owner: Varun, data/structures/)

File: `data/structures/<id>.json`

```json
{
  "id": "bridge-a",
  "name": "Bridge Section A (underside)",
  "width": 30,
  "height": 10,
  "grid": [[0, 0, 2, 1], [0, 0, 0, 0]],
  "start": { "x": 0, "y": 0 },
  "battery_budget": 220,
  "capture_spacing": 3,
  "alert_zone": { "x": 12, "y": 4, "radius": 3 }
}
```

- Cells: `0` inspectable surface, `1` obstacle / no-fly, `2` priority zone.
- Origin (0,0) is top-left. `x` = column, `y` = row.
- Movement is 4-directional. Each move costs 1 battery unit; each image capture costs 1.
- `alert_zone` is optional: the area near the sensor node that raised the alert. The optimized planner treats it as top priority.

## 4. Planner output (owner: Varun, web/src/planner/)

```json
{
  "plan_type": "optimized",
  "waypoints": [
    { "id": "w1", "x": 0, "y": 0, "capture": false, "closeup": false },
    { "id": "w2", "x": 2, "y": 0, "capture": true, "closeup": false, "zone": "priority" }
  ],
  "stats": {
    "coverage_pct": 0.94,
    "priority_coverage_pct": 1.0,
    "path_length": 198,
    "battery_used": 214,
    "battery_budget": 220
  }
}
```

- `plan_type`: `naive` (lawnmower) | `optimized` (priority-first).
- Re-plan function: `addInspection(plan, currentIndex, x, y) -> plan`
  - Inserts 2 to 4 close-up capture waypoints at or near (x, y), marked `"closeup": true`.
  - Re-routes the remaining mission within the battery budget, dropping lowest-priority non-priority waypoints first if needed.
  - Returns the same format as above.

## 5. Image map (owner: Komal, data/)

File: `data/image_map.json`

```json
{
  "bridge-a": {
    "w2": "images/bridge-a/w2.jpg",
    "w2_closeup": "images/bridge-a/w2_closeup.jpg"
  }
}
```

- Normal capture waypoints map to full CODEBRIM images; close-ups map to cropped defect patches.
- Demo images come from the defect model's test split only.
- Images are local only and never committed (CODEBRIM license forbids redistribution).

## 6. Dashboard-internal shapes (owner: Suhail, web/)

Shapes used only inside the dashboard (findings list, alert history, UI state) are defined in the dashboard spec's design.md and are not part of this shared contract.
