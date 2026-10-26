# Design — KW51 Real Inspection Map

## Overview

The inspection view switches from a mock grid map to a true-scale metric side
elevation (x-z) of railway bridge KW51, with a side A / side C toggle. Geometry
comes from `data/structures/kw51_layout.json` (derived KU Leuven FEM,
CC BY-NC-SA 4.0). The real planner (`firmware_esp32/planner.py`) produces the
route through all 34 distinct diagonal-connection locations, using 3D distance.
The shared contract (`docs/contract.md`) gains a versioned metric structure and
plan format; the old grid format stays as a labeled previous version, but the
grid rendering code is removed.

Design intent follows `.kiro/steering/design.md`: light technical-drawing base,
color reserved for meaning, never color alone, accessible, honest labeling.

### What does NOT change
Monitor view, replay engine (`useReplay`), trigger model, and the rule-based
report computation. Only report wording that implied an alert location changes
(Requirement 8). Design tokens, accessibility rules, and honesty features stay.

---

## Data contract changes (`docs/contract.md`)

### Structure — metric format v2

Add a new section (or sub-section) "Structure input (metric, v2)". The dashboard
consumes a subset of `kw51_layout.json`:

```jsonc
{
  "id": "kw51",
  "name": "Railway bridge KW51, Leuven, Belgium",
  "units": "m",
  "coordinate_system": "x longitudinal (Brussels ~0, Leuven ~115); y transverse, side A=0, side C=11.750; z up.",
  "nodes":   [ { "id", "part", "x", "y", "z" } ],
  "members": [ { "id", "part", "element_type", "nodes": [n1, n2] } ],
  "diagonal_connections": {
    "distinct_location_count": 34,
    "distinct_locations": [
      { "location_id", "node_id", "side": "A|C", "end": "deck|arch",
        "x", "y", "z", "diagonal_ends": [ { "diagonal", "end" } ] }
    ]
  },
  "sensors": [ { "label", "type": "strain|acceleration|displacement", "part", "x", "y", "z" } ],
  "provenance": { "source", "doi", "license" }
}
```

The dashboard reads `distinct_locations` (the inspection stops), `sensors`,
`nodes`/`members` (for drawing girder, arch, diagonals), and `provenance` (for the
on-screen credit). It does not need the full node/member set for anything but
drawing, so it tolerates the file's other fields (omitted_parts, cross_checks,
retrofit_zones, diags_box_scheme) by ignoring them.

### Plan — metric format v2

```jsonc
{
  "plan_type": "naive" | "optimized",
  "units": "m",
  "stops": [
    { "location_id", "x", "y", "z", "order": 0, "reachable": true }
  ],
  "stats": {
    "locations_total": 34,
    "locations_visited": 34,
    "coverage_pct": 1.0,
    "route_length_m": 399.8,
    "route_length_note": "straight-line 3D estimate, ignores obstacles (deck, bracing)",
    "energy_per_meter": 1.0,
    "battery_used": 399.8,
    "battery_budget": 600.0,
    "battery_budget_note": "demonstration cap, not an engineering limit; set so both plans finish",
    "within_budget": true
  }
}
```

- `plan_type` enum stays `"naive" | "optimized"` (unchanged for contract
  stability). The contract defines the two values honestly:
  - `"naive"` — a per-level manual sweep a pilot could fly by hand.
  - `"optimized"` — a nearest-neighbor heuristic with 2-opt improvement; a good
    short route, **not guaranteed to be the shortest**.
- `stops` are ordered; each carries a `reachable` flag (false once the budget is
  exhausted, Requirement 6.6).
- `stats` contains ONLY: totals, coverage_pct, route length (+ note), energy and
  battery (+ notes), within_budget. No priority coverage, no alert-dependent stat.

### Old grid format
Keep the existing grid-based structure (section 3) and plan (section 4) in
`docs/contract.md`, retitled "Structure input (grid, v1 — superseded)" and
"Planner output (grid, v1 — superseded)", with a one-line note pointing to v2.
Nothing removed from the file; history preserved.

---

## Config

Config values live in the planner (the single source of truth) and are echoed
into each Plan v2 file's `stats` so the dashboard displays them without owning
them:

```
LAUNCH           = { x: 0.0, y: -10.0, z: 0.0 }   # ASSUMED launch position, off the south side
ENERGY_PER_METER = 1.0                             # battery units per metre (demo value)
BATTERY_BUDGET   = 600.0                            # battery units (demo cap, both plans finish)
```

The launch position is an assumption (there is no real robot); it is labeled
"assumed launch position" in both the data and the UI.

### Route lengths (measured, not tuned)

All four candidates were computed over the real 34 stops in `kw51_layout.json`,
using the same 3D distance and starting from the launch. Nothing was tuned to
make the planner win.

| Route | Definition | 3D length |
|---|---|---|
| x-order lawnmower | side A ascending x, then side C descending x | 533.2 m |
| per-level sweep | A deck asc x, A arch desc x, C arch asc x, C deck desc x | 405.9 m |
| nearest-neighbor | greedy nearest-neighbor from launch over all 34 | 408.9 m |
| nearest-neighbor + 2-opt | nearest-neighbor, then 2-opt improvement | 399.8 m |

The honest picture: on KW51 a sensible manual sweep (405.9 m) is within about
1.5% of the planned route (399.8 m). We do not know the true shortest route —
2-opt is a heuristic, not guaranteed optimal — so we compare against the planned
route, not an unknown optimum. The 2-opt route beats the per-level sweep by
6.2 m (1.5%) and the plain nearest-neighbor by 9.1 m (2.2%). The large number
(533.2 m) belongs only to the x-order lawnmower, and that extra length is NOT a
real planning saving — it comes from climbing between the deck and the arch
(about 19 m apart vertically) at almost every stop, because sorting purely by x
interleaves deck and arch ends. A pilot flying a sensible sweep would never do
that; the per-level sweep avoids it and lands at 405.9 m.

### Naive baseline and demonstration budget

- **Naive = per-level sweep (405.9 m).** This is the fair "what a careful pilot
  flies by hand" baseline: finish one level before changing height, so vertical
  travel is minimized. We rejected the x-order lawnmower as the naive baseline
  because its length is an artifact of needless climbing, not of lacking a
  planner.
- **Planned = nearest-neighbor + 2-opt (399.8 m),** labeled "planned route
  (nearest-neighbor + 2-opt)". It is a heuristic, not a guaranteed shortest
  route, and is never called "optimal".

Because the manual sweep and the planned route are within ~1.5% of each other on
this bridge, there is no honest "naive runs out of battery, planned finishes"
demonstration — forcing one would mean tuning the numbers, which we will not do.
So the battery budget is a simple cap, labeled a demonstration value, set high
enough that **both** plans finish (e.g. `BATTERY_BUDGET = 600`). The budget
cut-off logic (mark stops unreachable once the cap is exceeded, lower
`coverage_pct`) still exists and is exercised by a test that passes a small
test-only budget; it just does not gate either real KW51 plan.

In the UI, both plans show their route length and battery used, plus a
plain-language note:

> On KW51, a sensible manual sweep is within about 1.5% of the planned route.
> Planning matters more for partial inspections or multi-flight missions.

---

## Planner changes (`firmware_esp32/planner.py`)

The planner stays the route authority. Changes, all small:

1. **3D distance.** `distance(a, b)` currently uses `math.hypot(x_m, y_m)` (2D).
   Change to 3D: `sqrt(dx^2 + dy^2 + dz^2)` over `x_m, y_m, z_m`. The launch and
   every stop carry a `z_m`.
2. **Stops = all 34 locations.** Add a mode that ignores any single alert node
   and plans over all 34 distinct connection locations (Requirement 4.3). The
   existing warning/alarm "near/far" split is NOT used for KW51, because the
   trigger cannot localize. Keep the old behavior available for the generic
   `bridge_layout.json` path, but the KW51 path routes through all stops.
3. **Naive (per-level sweep) and planned (nearest-neighbor + 2-opt).** Naive =
   per-level sweep: A deck ascending x, A arch descending x, C arch ascending x,
   C deck descending x (finish each level before changing height). Planned =
   nearest-neighbor from launch over all 34 stops (the existing
   `nearest_neighbor_order`), followed by a **2-opt improvement pass** that
   repeatedly reverses route segments while that shortens the total, until no
   improving swap remains. Both use the same 3D distance. The 2-opt pass is a
   standard, untuned local search — no bridge-specific tweaks. In the UI the
   second plan is labeled "planned route (nearest-neighbor + 2-opt)", NOT
   "optimal" — it is a heuristic, not a guaranteed shortest route. (`plan_type`
   stays `naive` | `optimized` as the contract enum value; the UI label is the
   honest wording.)
4. **Budget cut-off (kept, but not gating KW51).** Accumulate `battery_used =
   cumulative_length * energy_per_meter`; mark stops `reachable=false` once the
   budget is exceeded and stop adding length past that point. `coverage_pct =
   reachable_count / 34`. With the demonstration cap set so both plans finish,
   every stop is reachable for both KW51 plans; the cut-off path is exercised by a
   test that passes a small test-only budget.
5. **Output: the planner is the single source of truth for plans.** It writes
   BOTH plans as Plan v2 JSON files: `data/plans/kw51_naive.json` and
   `data/plans/kw51_optimized.json`. The dashboard reads these files; it does NOT
   compute plans itself. The planner may also still write its existing
   `inspection_report.json` if wanted; that is separate.

The planner remains standard-library-only. A small adapter converts
`kw51_layout.json` -> the planner's stop list (location_id, x, y, z); this is a
clean metric->metric mapping, no quantization.

Regeneration command (documented in README):
`python firmware_esp32/planner.py --layout data/structures/kw51_layout.json
--kw51-plans --out-dir data/plans` (exact flags finalized in tasks.md; the
command writes both Plan v2 files).

---

## Dashboard changes (`web/src/`)

### Data layer
- `types.ts`: add metric `Structure2` and `Plan2` types (names TBD) matching the
  contract v2 shapes; keep old types only if still referenced, otherwise remove
  with the grid renderer. `Finding` is unchanged (still simulated, keeps
  `defect_source`).
- `realSource` / `mockSource`: `getStructure` returns the metric structure from
  `kw51_layout.json` (real) or the small metric sample (mock). `getPlan(type)`
  reads the planner-produced Plan v2 file (`data/plans/kw51_naive.json` or
  `kw51_optimized.json`); the dashboard does NOT compute the plan. On absent/
  invalid plan file it falls back to a small metric sample plan and raises a data
  warning. The mock sample is metric, never grid.
- Contract validators: add metric structure/plan validators; retire the grid
  validators that no longer apply (listed in Tests below).

### Rendering (replaces GridMap)
- New `ElevationMap` component: projects (x, z) to screen at equal scale, draws
  the girder line, the arch polyline (from `nodes`/`members` of the selected
  side), the diagonals, the 34 stop markers (filtered to the selected side), and
  the sensors for that side. Uses design tokens; route drawn in the single purple;
  stop markers and finding pins keep the tier letter + color rules.
- `SideToggle`: A / C. Both views share x direction (Brussels left). Each labeled
  "Side A (South), viewed from the south" / "Side C (North), viewed from the
  north".
- The robot animates along the plan's ordered `stops` on the current side; stops
  on the other side are reachable in the route but shown when that side is
  selected (the route is 3D across both arches; the elevation shows one side at a
  time, with a note that the full route spans both sides).
- Remove `GridMap`, `mapLayout` grid helpers, `CoverageLayer`'s grid-cell shading
  (replace with "visited stop" highlighting), and any grid-cell code.

### Panels and labels
- Plan toggle labels: "Manual sweep (per level)" and "Planned route
  (nearest-neighbor + 2-opt)". The second is never called "optimal". Both show
  their route length and battery used.
- A plain-language comparison note sits with the toggle: "On KW51, a sensible
  manual sweep is within about 1.5% of the planned route. Planning matters more
  for partial inspections or multi-flight missions."
- Stats panel shows: coverage % (visited / 34), route length with the
  straight-line/ignores-obstacles note, battery used vs budget with the
  demonstration-value label, and the assumed-launch note. No priority coverage.
- Alert handling: on Warning/Alarm the banner reads exactly "Frequency shift
  detected. Location unknown: inspecting all connection locations." No alert-zone
  circle anywhere.
- Map caption: "Geometry: real KW51 (KU Leuven FEM, CC BY-NC-SA 4.0). Defect
  findings and images: simulated." Plus a visible provenance credit (DOI +
  license).
- Finding detail keeps the per-finding "mock" marker and simulated scores/images.

### Report wording (logic unchanged)
`ruleBasedReport.ts`: only change the text that implied a located alert. New
wording states the frequency shift is global and all connection locations were
inspected. No change to how findings/stats/history drive the report.

---

## Behavior: alert -> inspection (honest)

1. Monitor replay reaches Warning or Alarm (unchanged trigger logic).
2. Dispatch shows the inspection view with the global-shift banner (no location).
3. The planner routes through all 34 stops in 3D; the manual sweep and the
   planned route differ only slightly in length / battery on KW51; both finish
   under the demonstration budget.
4. The elevation map shows stops, sensors, the route, and simulated findings,
   labeled geometry-real / findings-simulated.

### Future work (noted in UI and spec)

- **Localized alerts.** The trigger watches one global natural frequency, so it
  cannot say where a shift originates. Pinpointing the affected zone needs
  distributed sensor nodes along the span; until then the honest behavior is to
  inspect all connection locations.
- **Multi-flight planning under battery limits.** On KW51 a single sweep already
  fits comfortably, so planning gains are small. Planning matters when a mission
  must be split across several battery-limited flights or when only part of the
  bridge is inspected; that is where the route optimizer earns its keep.
- **Obstacle-aware paths.** Route lengths here are straight-line 3D estimates that
  ignore the deck and bracing; collision-aware paths are a Gazebo-stage task.

---

## Testing strategy and the exact test changes

Goal: build + tests green (Requirement 9). The structure/plan contract change
forces specific test updates. Every change is listed with its reason. (Test files
will be re-read at implementation time to confirm exact assertions; this is the
planned change set.)

- `web/src/test/mocks.contract.test.ts` — currently validates the grid mock
  (grid cells 0/1/2, grid structure). **Update**: validate the new metric sample
  (nodes/members/stops/sensors shapes, units "m"). Reason: the mock moved from
  grid to metric; the old assertions describe a format that no longer exists.
- `web/src/test/components.test.tsx` — any assertions tied to `GridMap` /
  grid-cell rendering or to a stats panel showing "priority coverage".
  **Update/replace**: assert the `ElevationMap` renders stops/sensors and that the
  stats panel shows coverage/route/battery (no priority coverage). Reason: the
  renderer and the stats set changed per the contract.
- `web/src/test/ruleBasedReport.test.ts` — if it asserts report wording that
  implies an alert location. **Update**: assert the corrected global-shift wording;
  keep all numeric assertions unchanged. Reason: Requirement 8 wording fix only.
- Add new tests:
  - metric structure/plan validator tests (valid + invalid samples);
  - 3D distance (sqrt(dx^2+dy^2+dz^2), not 2D) on known points;
  - **budget cut-off with a small test-only budget**: feed a budget below the
    route length and assert that stops past the cap are marked `reachable=false`,
    length stops accumulating, and `coverage_pct = reachable_count / 34 < 1.0`.
    This exercises the cut-off path without touching the real KW51 demonstration
    budget;
  - both real KW51 plans finish under the demonstration budget (every stop
    reachable, `coverage_pct = 1.0`);
  - stops = 34 and shared diagonal ends collapse to one stop.
- **Removed**: the earlier "naive route length > budget > planned route length"
  guard test. It assumed a budget wedged between the two plans; with the honest
  per-level naive (405.9 m) and planned (399.8 m) only ~1.5% apart, no such wedge
  exists, so that assertion can no longer hold and is dropped rather than tuned.
- No other test is weakened or deleted to hide a failure. A grid-specific test
  that asserts removed behavior is replaced by an equivalent metric test, listed
  above.

Planner: add Python tests (or extend existing) for 3D distance, the 2-opt pass
(result is no longer than the nearest-neighbor input), all-34 routing, and the
budget cut-off (small test-only budget).

---

## Resolved decisions

1. Launch point `{x:0, y:-10, z:0}` — approved; labeled "assumed launch position"
   in the data and UI.
2. `energy_per_meter = 1.0`, `battery_budget = 600` — a simple demonstration cap
   set so BOTH plans finish (per-level 405.9 m, planned 399.8 m). No "naive fails
   / planned succeeds" demo, because on KW51 the two are within ~1.5% and forcing
   a gap would require tuning. The cut-off logic stays and is tested with a small
   test-only budget.
3. Plans are produced ONLY by `planner.py` (single source of truth), written as
   `data/plans/kw51_naive.json` and `kw51_optimized.json`; the dashboard reads
   them and never computes a plan. Regeneration command documented in README.
4. Naive = per-level sweep (A deck asc x, A arch desc x, C arch asc x, C deck
   desc x). Planned = nearest-neighbor + 2-opt, labeled "planned route
   (nearest-neighbor + 2-opt)", never "optimal". Route lengths are reported
   honestly side by side: x-lawnmower 533.2 m, per-level 405.9 m, NN 408.9 m,
   NN+2-opt 399.8 m.
5. Route across sides: per-side elevation with a "route continues on side C" note
   plus the A/C toggle (no both-sides locator).
