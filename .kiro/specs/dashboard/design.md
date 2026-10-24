# Design — InspectPath Dashboard

## Overview

The dashboard is a single-page React + Vite app in `web/`. It renders four feature areas —
Bridge monitor, Inspection view (map + stats + findings), Report, and a persistent footer —
plus an escalation banner that links monitoring to inspection.

The guiding constraint from the steering files and `docs/contract.md`: every screen must run
on fake data in `web/src/mocks/` that matches the shared contract *before* real data is
connected. This design therefore treats the contract shapes as fixed inputs and isolates all
I/O behind a thin data-access layer so the mock source can later be swapped for a real one
without touching the views.

### Data shape policy (applies throughout this document)

Every data shape below is labeled exactly one of:

- **[contract §N]** — defined by `docs/contract.md`. The dashboard consumes it as-is and must
  not redefine or change it. Field names and value sets mirror the contract.
- **[dashboard-internal, not part of the shared contract]** — a shape the dashboard needs for
  its own findings list, alert history, or UI state. It is owned by `web/` (Suhail) and lives
  only in the dashboard. It is NOT added to `docs/contract.md`.

No shape in this dashboard is left unlabeled.

---

## Architecture

### High-level structure

```
web/
  index.html
  vite.config.*
  .env.example                 # LLM key placeholder only; .env is gitignored
  src/
    main.tsx                   # app bootstrap
    App.tsx                    # layout: header, active view, banner, footer
    app/
      viewState.ts             # UI state store (dashboard-internal)
    data/
      source.ts                # DataSource interface (mock now, real later)
      mockSource.ts            # reads from src/mocks/*
      alertLevels.ts           # alert-level -> label/color mapping
      tiers.ts                 # tier -> color mapping
    features/
      monitor/                 # Requirement 1 + banner (Requirement 2)
        MonitorView.tsx
        useReplay.ts           # replay clock over trigger array
        ReadingsPanel.tsx
        FrequencyChart.tsx
        AlertBadge.tsx
        QualityBadge.tsx
        EscalationBanner.tsx
      inspection/              # Requirements 3 + 4
        InspectionView.tsx
        GridMap.tsx
        RobotMarker.tsx
        CoverageLayer.tsx
        StatsPanel.tsx
        PlanToggle.tsx
        FindingPin.tsx
        FindingDetail.tsx
      report/                  # Requirement 5
        ReportPanel.tsx
        useReport.ts
        llmClient.ts
    components/
      Footer.tsx               # Requirement 6 (disclaimer)
    mocks/
      replay_z24.json          # [contract §2] normal->watch->warning->alarm, >=1 degraded window
      structure_bridge-a.json  # [contract §3] includes alert_zone
      plan_naive.json          # [contract §4] naive plan for bridge-a
      plan_optimized.json      # [contract §4] optimized plan for bridge-a
      image_map.json           # [contract §5]
      defect_responses.json    # [contract §1] samples covering high/medium/low/none
      findings.json            # [dashboard-internal]
      report_demo.json         # [dashboard-internal] mock LLM report (works without a key)
```

### Data flow

```
mocks/*.json ──► DataSource (mockSource) ──► feature hooks ──► views
                                   │
            viewState store ◄──────┘ (active view, selected plan, selected finding,
                                      replay cursor, alert history)
```

- Views never import mock JSON directly. They call the `DataSource` interface. Today the only
  implementation is `mockSource`; a `realSource` can be added later with no view changes.
- Replay, plan selection, selected finding, and alert history live in the `viewState` store so
  the monitor, banner, and inspection view stay in sync.

### Rendering approach

- Grid map, robot, coverage shading, and pins render as a single SVG (or absolutely-positioned
  divs) sized from the structure's `width`/`height` and grid dimensions. SVG keeps pins and the
  robot aligned to grid cells and scales cleanly from laptop to phone.
- The frequency chart uses **Recharts** (line chart) showing recent measured vs. predicted
  values.
- Layout is responsive (CSS fl/grid) per the steering rule: usable on a laptop, readable on a
  phone.

---

## Components and data shapes

### 1. Data-access layer

`DataSource` is the single seam between the dashboard and its data.

```ts
interface DataSource {
  getReplay(dataset: string): Promise<TriggerRecord[]>;   // [contract §2]
  getStructure(id: string): Promise<Structure>;           // [contract §3]
  getPlan(type: "naive" | "optimized"): Promise<Plan>;    // [contract §4]
  getImageMap(): Promise<ImageMap>;                        // [contract §5]
  getFindings(structureId: string): Promise<Finding[]>;    // [dashboard-internal]
  getDemoReport(): Promise<InspectionReport>;              // [dashboard-internal]
}
```

`mockSource` resolves each call from `src/mocks/`. Field names in the mock JSON match the
contract exactly so the same files would validate against the real producers' output.

---

### Contract-defined shapes (consumed as-is)

#### TriggerRecord — [contract §2]

One record per measurement window, from a `data/trigger/replay_<dataset>.json` array.

```ts
interface TriggerRecord {
  node_id: string;
  timestamp: string;              // ISO 8601
  temperature_c: number;
  frequency_hz: number;
  predicted_frequency_hz: number;
  residual_pct: number;
  alert_level: "normal" | "watch" | "warning" | "alarm";
  quality: "ok" | "degraded";
  source: string;
}
```

Used by: Requirement 1 (readings, chart, alert badge, quality badge) and Requirement 2 (banner
trigger). Demo thresholds (2% watch / 5% warning / 8% alarm on absolute residual) already
determine `alert_level` in the data; the dashboard displays the given `alert_level` and does
not recompute it.

#### Structure — [contract §3]

```ts
interface Structure {
  id: string;
  name: string;
  width: number;
  height: number;
  grid: number[][];               // 0 surface, 1 obstacle/no-fly, 2 priority
  start: { x: number; y: number };
  battery_budget: number;
  capture_spacing: number;
  alert_zone?: { x: number; y: number; radius: number };
}
```

Used by: Requirement 3 (grid map, alert-zone highlight, battery budget reference). Origin
(0,0) top-left; `x` = column, `y` = row, matching the contract.

#### Plan — [contract §4]

```ts
interface Waypoint {
  id: string;
  x: number;
  y: number;
  capture: boolean;
  closeup: boolean;
  zone?: string;                  // e.g. "priority"
}

interface PlanStats {
  coverage_pct: number;
  priority_coverage_pct: number;
  path_length: number;
  battery_used: number;
  battery_budget: number;
}

interface Plan {
  plan_type: "naive" | "optimized";
  waypoints: Waypoint[];
  stats: PlanStats;
}
```

Used by: Requirement 3 (robot animation along `waypoints`, coverage shading, stats panel,
naive/optimized toggle). The dashboard only reads plans; the planner (`web/src/planner/`,
Varun) produces them and owns `addInspection`. The dashboard does not implement re-planning.

#### ImageMap — [contract §5]

```ts
type ImageMap = {
  [structureId: string]: {
    [key: string]: string;        // e.g. "w2" and "w2_closeup" -> local image path
  };
};
```

Used by: Requirement 4 (resolve a finding's full image and, when present, its `<waypoint>_closeup`
entry). Images are local-only and never committed; mocks may point to placeholder paths.

#### Defect scores / tier — [contract §1]

Produced by the defect model's `POST /predict`. The dashboard does not call this API for the
findings view; instead each finding (dashboard-internal, below) carries the already-produced
`scores`, `detected`, and `tier`. The shapes of those fields match contract §1 exactly:

```ts
interface DefectScores {                 // field set per [contract §1]
  crack: number;
  spallation: number;
  exposed_bars: number;
  efflorescence: number;
  corrosion_stain: number;
}
type DefectTier = "high" | "medium" | "low" | "none";   // [contract §1] tier values
```

Tier rules and colors — the color mapping is a dashboard presentation choice; the tier *values*
are from the contract:

| tier    | source           | pin color      |
|---------|------------------|----------------|
| high    | [contract §1]    | red            |
| medium  | [contract §1]    | amber          |
| low     | [contract §1]    | yellow         |
| none    | [contract §1]    | not pinned     |

---

### Dashboard-internal shapes (owned by web/, NOT in the shared contract)

The contract (§6) explicitly delegates these to this design doc.

#### Finding — [dashboard-internal, not part of the shared contract]

Links a map location to a captured image and the defect result for that capture. It composes
contract §1 field shapes but the `Finding` wrapper itself is dashboard-only.

```ts
interface Finding {
  id: string;                    // dashboard-internal id
  waypoint_id: string;           // references a Waypoint.id from the plan [contract §4]
  x: number;                     // grid column (matches structure coordinate system §3)
  y: number;                     // grid row
  tier: DefectTier;              // value set per [contract §1]
  scores: DefectScores;          // field set per [contract §1]
  detected: string[];            // per [contract §1]
  image_key: string;             // key into ImageMap[structureId] [contract §5]
  has_closeup: boolean;          // whether an "<image_key>_closeup" entry exists [contract §5]
}
```

Rationale: the contract defines the defect-model *response* (§1) and the image *map* (§5) but
not a combined "finding" record that the map UI pins and the report summarizes. That join is a
dashboard concern, so it lives here.

#### AlertHistoryEntry — [dashboard-internal, not part of the shared contract]

A compact record of alert transitions observed during replay, used by the banner context and
the LLM report input.

```ts
interface AlertHistoryEntry {
  timestamp: string;             // from the TriggerRecord that caused the change [contract §2]
  alert_level: TriggerRecord["alert_level"];
  residual_pct: number;          // carried from the triggering record [contract §2]
  quality: TriggerRecord["quality"];
}
```

Rationale: the contract defines per-window records (§2) but not an accumulated history. The
dashboard derives this from the replay stream; it is not shared.

#### ViewState — [dashboard-internal, not part of the shared contract]

UI state only. No measurement or domain data is defined here.

```ts
interface ViewState {
  activeView: "monitor" | "inspection";
  replayCursor: number;                 // index into TriggerRecord[]
  replayRunning: boolean;
  replaySpeed: 1 | 5 | 20;              // speed multiplier; default 1 (~2 records/sec)
  selectedPlan: "naive" | "optimized";
  selectedFindingId: string | null;
  alertHistory: AlertHistoryEntry[];
}
```

#### InspectionReport — [dashboard-internal, not part of the shared contract]

The report feature's request and response envelope.

```ts
interface ReportRequest {
  findings: Finding[];                  // dashboard-internal
  alertHistory: AlertHistoryEntry[];    // dashboard-internal
}

interface InspectionReport {
  text: string;                         // plain-language report body
  generatedAt: string;                  // ISO 8601
  source: "llm" | "mock";               // which path produced it
}
```

Rationale: the LLM report is entirely a dashboard feature; no contract covers it.

---

## Feature behavior

### Bridge monitor (Requirement 1)

- `useReplay` holds a timer that advances `replayCursor` through the `TriggerRecord[]` in
  timestamp order. Replay speed is configurable with a default of ~2 records/sec and 1x / 5x /
  20x controls (base interval ≈ 500 ms at 1x, divided by the speed multiplier). On each tick it
  updates the current record and appends to `alertHistory` only when `alert_level` changes.
- `ReadingsPanel` shows measured `frequency_hz` vs `predicted_frequency_hz`, `residual_pct`,
  and `temperature_c`, each with a plain-language label and unit.
- `FrequencyChart` plots the last N records' measured vs predicted frequency using Recharts.
- A speed control exposes 1x / 5x / 20x (default 1x, ~2 records/sec) bound to
  `viewState.replaySpeed`.
- `AlertBadge` maps `alert_level` to a label + color via `alertLevels.ts`
  (normal/watch/warning/alarm, each a distinct color).
- `QualityBadge` renders "node degraded" when `quality === "degraded"`, hidden when `"ok"`.
- At end of array, the timer stops and holds the final record (no wraparound unless restarted).

### Escalation banner + dispatch (Requirement 2)

- `EscalationBanner` shows only when the current `alert_level` is `warning` or `alarm`, colored
  to match. It renders a "Dispatch inspection" button that sets `activeView = "inspection"`.
- Hidden for `normal`/`watch`. Text is plain language and never asserts the bridge is unsafe.

### Inspection view (Requirement 3)

- `GridMap` draws cells from `Structure.grid` (0/1/2 styles) and highlights `alert_zone` when
  present.
- `PlanToggle` switches `selectedPlan` between the naive and optimized `Plan` mocks; the map,
  robot path, coverage, and stats all re-derive from the selected plan.
- `RobotMarker` animates along the selected plan's `waypoints` in order.
- `CoverageLayer` shades cells covered by the route up to the robot's current position.
- `StatsPanel` shows `coverage_pct`, `priority_coverage_pct`, and `battery_used` vs
  `battery_budget` from `PlanStats`, as plain-language labeled values.

### Findings (Requirement 4)

- `FindingPin` renders one pin per `Finding` at its `(x, y)`, colored by `tier`
  (high=red, medium=amber, low=yellow; `none` not pinned).
- Clicking a pin sets `selectedFindingId`. `FindingDetail` resolves the image via
  `ImageMap[structureId][finding.image_key]`, shows `scores` and `tier`, and when
  `has_closeup` is true also shows `ImageMap[structureId]["<image_key>_closeup"]`. If no
  close-up, it shows only the full image.

### Report (Requirement 5)

- `ReportPanel` has a "Generate report" button. `useReport` builds a `ReportRequest` from the
  current `findings` + `alertHistory` and calls `llmClient`.
- `llmClient` reads the LLM key from `import.meta.env` (Vite env). The key comes from `.env`
  (gitignored); only `.env.example` is committed. No key is hardcoded.
- On success it returns an `InspectionReport` with `source: "llm"`. On failure or missing key,
  it falls back to the `report_demo.json` mock (`source: "mock"`) and shows a clear message
  rather than crashing — so the feature works before a real endpoint exists.
- "Copy" copies `report.text`; "Download" saves it as a text file.
- The report prompt instructs plain language, no invented metrics, and no safe/unsafe claims.

### Footer disclaimer (Requirement 6)

- `Footer` renders the exact required text on every view and stays readable on laptop and phone:
  "Simulation with real bridge data. Alerts and severity are estimates, not engineering ratings."

---

## Error handling

- Missing/short replay data: monitor shows an empty-state message; no crash.
- Missing structure or plan mock: inspection view shows a clear message instead of a broken map.
- Missing image in `ImageMap`: finding detail shows a placeholder and omits the close-up.
- LLM failure or missing key: fall back to mock report with a visible notice (Requirement 5.6).
- All degraded-quality windows are labeled "node degraded", never "bridge unsafe"
  (steering + contract §2).

## Testing strategy

- Component tests per feature using the mock `DataSource`: monitor advances and badges toggle;
  banner appears only on warning/alarm; plan toggle swaps stats and path; pin click opens the
  correct image and scores; close-up shown only when present; report copy/download and mock
  fallback.
- A validation check that each mock JSON matches its contract shape (field names and value
  sets) so mocks stay contract-accurate.
- Responsive smoke check at laptop and phone widths.

## Resolved decisions

1. **Replay speed** — configurable; default ~2 records/sec with 1x / 5x / 20x controls, bound to
   `viewState.replaySpeed`.
2. **Charts** — use Recharts for the frequency chart (not hand-rolled SVG).
3. **Mocks shipped in `web/src/mocks/`:**
   - `replay_z24.json` — one Z24-style replay that progresses `normal -> watch -> warning ->
     alarm` and includes at least one `degraded` window. [contract §2]
   - `structure_bridge-a.json` — structure `bridge-a` with an `alert_zone`. [contract §3]
   - `plan_naive.json` and `plan_optimized.json` — naive and optimized plans for `bridge-a`.
     [contract §4]
   - `defect_responses.json` — defect responses covering `high`, `medium`, `low`, and `none`
     tiers. [contract §1]
   - `image_map.json` — maps capture waypoints and close-ups for `bridge-a`. [contract §5]
   - `findings.json` — dashboard findings joining locations, images, and defect results.
     [dashboard-internal]
   - `report_demo.json` — mock LLM report so the report screen works without an API key.
     [dashboard-internal]
