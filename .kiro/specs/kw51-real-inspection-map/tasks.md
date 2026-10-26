# Tasks — KW51 Real Inspection Map

Order: contract and data first, then the planner and its generated plan files,
then the dashboard, then tests, then docs. Each task is small and reviewable on
its own, names the files it touches, and states how it is verified. Tasks that
change or remove an existing test are flagged **[TEST CHANGE]**.

A note carried from design review: the design supersedes requirements.md
Requirement 6.7 (the "naive exceeds budget, optimized fits" demonstration). On
KW51 the per-level sweep (405.9 m) and the planned route (399.8 m) are within
~1.5%, so an honest wedge budget does not exist. The budget is instead a plain
demonstration cap under which both plans finish. Task 1 records this supersession
in the contract so the requirement and the shipped behavior do not silently
disagree.

---

## A. Contract and data

### 1. Add metric structure/plan v2 to the contract; mark grid v1 superseded
- **Files:** `docs/contract.md`
- **Do:** Add "Structure input (metric, v2)" and "Planner output (metric, v2)"
  sections matching design.md (nodes/members/diagonal_connections/sensors/
  provenance for structure; `plan_type` `naive|optimized`, ordered `stops` with
  x/y/z, and the `stats` object for plan). Define `plan_type` values honestly:
  `naive` = per-level manual sweep; `optimized` = nearest-neighbor heuristic with
  2-opt improvement, not guaranteed shortest. Retitle the existing grid sections
  "… (grid, v1 — superseded)" with a one-line pointer to v2; remove nothing.
  Add a short note that the battery budget is a demonstration cap set so both
  plans finish (superseding the earlier "naive fails / optimized fits" wording),
  and that stats never depend on an alert location.
- **Do NOT:** touch contract section 1 (defect API) or section 2 (trigger replay).
- **Verify:** `git diff docs/contract.md` shows only additions plus the two
  retitles; grep confirms the old grid text still present and the new v2 blocks
  exist. Requirements 1.1–1.4.

### 2. Confirm the KW51 layout is served under the data base path
- **Files:** `web/scripts/copy-data.mjs` (read/verify), `data/structures/kw51_layout.json` (read only)
- **Do:** Confirm the copy step already places `data/structures/kw51_layout.json`
  under the served `/data` path and that it is NOT in `data/external/`. If the
  copy script excludes `structures/`, add it (geometry only, no images).
- **Verify:** `node web/scripts/copy-data.mjs` (or `npm run predev` equivalent),
  then confirm `kw51_layout.json` appears under the served data dir. Requirement
  2.1, 10.3 (no images/external files copied).

---

## B. Planner and generated plan files

### 3. Make planner distance 3D
- **Files:** `firmware_esp32/planner.py`
- **Do:** Change `distance(a, b)` from `math.hypot(x_m, y_m)` to
  `sqrt(dx^2 + dy^2 + dz^2)` over `x_m, y_m, z_m`, tolerating a missing `z_m` as
  0.0 for the legacy `bridge_layout.json` path.
- **Verify:** new planner test (task 7) for known 3D points; existing planner run
  on `bridge_layout.json` still produces a report. Requirement 5.1–5.3.

### 4. Add a KW51 planning mode: all-34 stops, naive + optimized, budget cut-off
- **Files:** `firmware_esp32/planner.py`
- **Do:**
  - Add an adapter that reads `data/structures/kw51_layout.json` and builds the
    34-stop list from `diagonal_connections.distinct_locations`
    (location_id, x, y, z, side, end). Shared diagonal ends collapse to one stop.
  - Add `LAUNCH = {x:0, y:-10, z:0}` (labeled assumed), `ENERGY_PER_METER = 1.0`,
    `BATTERY_BUDGET = 600.0` (demonstration cap; both plans finish).
  - Naive route = per-level sweep: A deck asc x, A arch desc x, C arch asc x,
    C deck desc x.
  - Optimized route = existing `nearest_neighbor_order` from launch, then a new
    `two_opt(order)` improvement pass (reverse segments while total shortens;
    untuned, standard local search).
  - Budget cut-off: accumulate `battery_used = cumulative_length *
    energy_per_meter`; once it exceeds the budget mark remaining stops
    `reachable=false` and stop adding length; `coverage_pct = reachable_count/34`.
  - Do not touch the generic warning/alarm near/far `plan_route` path used by
    `bridge_layout.json`.
- **Verify:** planner tests (task 7); a manual run (task 6) prints the four route
  lengths so they can be checked against design.md (533.2 / 405.9 / 408.9 /
  399.8 m; naive uses per-level 405.9, optimized uses 2-opt 399.8). Requirements
  4.3, 5, 6.1–6.3, 6.6, 7.1.

### 5. Planner writes both Plan v2 files
- **Files:** `firmware_esp32/planner.py`
- **Do:** Add a `--kw51-plans --layout … --out-dir data/plans` mode that writes
  `data/plans/kw51_naive.json` and `data/plans/kw51_optimized.json` in the Plan
  v2 shape (plan_type, units "m", ordered stops with x/y/z/order/reachable, full
  `stats` with the route-length and battery notes). Each plan file also includes
  the same `provenance` block as `kw51_layout.json` (source, DOI,
  CC BY-NC-SA 4.0) plus `"derivation": "derived"`, since the plans are derived
  from the KU Leuven model. The planner is the single source of truth; the
  dashboard never computes a plan.
- **Verify:** run task 6; confirm both files validate against the Plan v2
  validator (task 8) and that `stats.route_length_m` matches the printed lengths.
  Requirement 1.2, 6.

### 6. Generate the committed plan files
- **Files (new):** `data/plans/kw51_naive.json`, `data/plans/kw51_optimized.json`
- **Do:** Run
  `python firmware_esp32/planner.py --kw51-plans --layout data/structures/kw51_layout.json --out-dir data/plans`
  and commit the two output files. Confirm each is well under 50 MB (they are a
  few KB) and neither lives under `data/external/`.
- **Verify:** `python -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['plan_type'], d['stats']['route_length_m'], len(d['stops']))" data/plans/kw51_optimized.json`
  prints `optimized 399.8 34`; the naive file prints `naive 405.9 34`. Both have
  `coverage_pct == 1.0`, every stop `reachable`, and a `provenance` block
  matching `kw51_layout.json` with `"derivation": "derived"`. Requirement 6, 10.

### 7. Planner tests
- **Files (new):** `firmware_esp32/test_planner_kw51.py`
- **Do:** Add stdlib `unittest` tests for: 3D distance on known points; `two_opt`
  result length <= its nearest-neighbor input length; all-34 routing (34 stops,
  shared ends collapse to one); budget cut-off with a **small test-only budget**
  (stops past the cap `reachable=false`, length stops accumulating, coverage < 1);
  both real KW51 plans finish under the demonstration budget (coverage 1.0).
- **Verify:** `python -m unittest firmware_esp32/test_planner_kw51.py` passes.
  Requirement 5, 6.6, 9.

---

## C. Dashboard — data layer (ADDITIVE ONLY)

Every commit in this group must build and pass tests. The grid→metric type
switch spans groups C and D: the grid types are consumed by the inspection
components and the report, which are not changed until group D. So group C only
ADDS the metric types, validators, mocks, and source methods ALONGSIDE the
existing grid ones. Nothing grid-related is removed or rewired in group C; the
existing `getStructure`/`getPlan` keep working unchanged. Group D switches the
consumers to the metric methods and then deletes the grid code.

### 8. Add metric types and validators (grid types kept)
- **Files:** `web/src/data/types.ts`, `web/src/data/validators.ts`
- **Do:** ADD metric `MetricStructure` and `MetricPlan` types
  (nodes/members/distinct_locations/sensors/provenance for structure; plan
  `stops` + `stats` + provenance) and `validateMetricStructure` /
  `validateMetricPlan`. Do NOT remove or change the existing grid `Structure`,
  `Plan`, `Waypoint`, `PlanStats` or their validators — they still have callers.
- **Verify:** `npx tsc --noEmit` clean; validator tests (group E). Requirement
  1, 2.2–2.3.

### 9. Add metric source methods (existing methods untouched)
- **Files:** `web/src/data/source.ts`, `web/src/data/realSource.ts`,
  `web/src/data/mockSource.ts`, `web/src/data/activeSource.ts` (as needed)
- **Do:** ADD `getMetricStructure()` and `getMetricPlan(type)` to the
  `DataSource` interface and both implementations. Real: read
  `kw51_layout.json` and `data/plans/kw51_naive.json` / `kw51_optimized.json`,
  validate, and on absent/invalid file fall back to the metric sample AND raise a
  data warning via the existing `dataWarnings` mechanism. Mock: return the metric
  sample structure/plans. The dashboard never computes a plan. Do NOT rewire or
  remove the existing `getStructure`/`getPlan`.
- **Verify:** `npx tsc --noEmit`; build; metric source/validator tests (group E).
  Requirement 2.1–2.3, 6.

### 10. Add metric sample mock files (grid mocks kept)
- **Files (new):** `web/src/mocks/structure_kw51_sample.json`,
  `web/src/mocks/plan_kw51_naive_sample.json`,
  `web/src/mocks/plan_kw51_optimized_sample.json`
- **Do:** Author a tiny valid metric structure and two tiny metric plans that
  satisfy the v2 validators, for the metric-sample fallback. Keep the existing
  grid mocks (`structure_bridge-a.json`, `plan_naive.json`, `plan_optimized.json`)
  in place; they are removed in group D once no caller remains.
- **Verify:** metric validators accept the samples (group E); build. Requirement
  2.3.

---

## D. Dashboard — rendering and panels (and grid removal)

### 11. ElevationMap + SideToggle (new; GridMap removed at end of group D)
- **Files (new):** `web/src/features/inspection/ElevationMap.tsx`,
  `web/src/features/inspection/SideToggle.tsx`
- **Do:** `ElevationMap` projects (x, z) at equal scale; draws girder line, arch
  polyline, diagonals, the 34 stop markers and 26 sensors filtered to the
  selected side. `SideToggle` switches A/C; both views keep Brussels on the left;
  each labeled e.g. "Side A (South), viewed from the south". Technical-drawing
  style from `.kiro/steering/design.md`; color for meaning only; keep focus/
  contrast/reduced-motion rules. No alert-zone circle anywhere. (GridMap and
  mapLayout are NOT deleted yet — see task 13b.)
- **Verify:** `npx tsc --noEmit`; component tests (group E); build. Requirements
  2.4–2.5, 3, 4.1–4.2, 7.1–7.3.

### 12. Update CoverageLayer, RobotMarker, PlanToggle, StatsPanel, FindingPin, InspectionView
- **Files:** `web/src/features/inspection/CoverageLayer.tsx`,
  `RobotMarker.tsx`, `useRobotRun.ts`, `PlanToggle.tsx`, `StatsPanel.tsx`,
  `FindingPin.tsx`, `FindingDetail.tsx`, `InspectionView.tsx`
- **Do:**
  - CoverageLayer: replace grid-cell shading with "visited stop" highlighting.
  - RobotMarker/useRobotRun: animate along the plan's ordered metric stops on the
    current side; add a "route continues on side C" note when the next stop is on
    the other side.
  - PlanToggle labels: "Manual sweep (per level)" and "Planned route
    (nearest-neighbor + 2-opt)"; show route length + battery used for both; add
    the comparison note: "On KW51, a sensible manual sweep is within about 1.5% of
    the planned route. Planning matters more for partial inspections or
    multi-flight missions."
  - StatsPanel: coverage % (visited/34), route length + straight-line/ignores-
    obstacles note, battery used vs budget + demonstration-value label, assumed-
    launch note. Remove "priority coverage"; add no secondary coverage stat.
  - FindingPin/FindingDetail: keep per-finding "mock" marker and simulated
    scores/images; position pins in metric coordinates.
  - InspectionView: on Warning/Alarm show exactly "Frequency shift detected.
    Location unknown: inspecting all connection locations."; render ElevationMap +
    SideToggle; show the geometry-real/findings-simulated caption and a visible
    provenance credit (DOI + CC BY-NC-SA 4.0).
- **Verify:** `npx tsc --noEmit`; component tests (task 13); build. Requirements
  3, 4.1, 5.4, 6.1–6.5, 7.2–7.5, 10.1.

### 13. Report wording only (logic unchanged) **[TEST CHANGE]**
- **Files:** `web/src/features/report/*` as needed for wording;
  `web/src/data/` report builder if wording lives there
- **Do:** Where the report implied a located alert, change the text to state the
  frequency shift is global and all connection locations were inspected. Do not
  change how findings/stats/history drive the report. No invented numbers.
- **Verify:** `web/src/test/ruleBasedReport.test.ts` updated (wording assertions
  only; all numeric assertions unchanged) and passing. Requirement 8.

### 13b. Remove all grid code once no caller remains (final group D task)
- **Files (removed):** `web/src/features/inspection/GridMap.tsx`,
  `web/src/features/inspection/mapLayout.ts`; grid shading in
  `web/src/features/inspection/CoverageLayer.tsx` (replaced by visited-stop
  highlighting); grid mocks `web/src/mocks/structure_bridge-a.json`,
  `web/src/mocks/plan_naive.json`, `web/src/mocks/plan_optimized.json`
- **Files (edited):** `web/src/data/types.ts` (remove grid `Structure`, `Plan`,
  `Waypoint`, `PlanStats`), `web/src/data/validators.ts` (remove
  `validateStructure`/`validatePlan`/`validateWaypoint`/`validateStats` grid
  versions), `web/src/data/source.ts`, `realSource.ts`, `mockSource.ts` (remove
  the old `getStructure`/`getPlan` and grid mock imports)
- **Do:** Only after tasks 11–13 have switched every component and the report to
  the metric methods. Delete the grid types, validators, mocks, old source
  methods, `GridMap`, `mapLayout`, and CoverageLayer's grid shading.
- **Verify:** `npx tsc --noEmit` clean; `npm run build` and `npm test` pass; and
  a search proving no grid type or method remains anywhere in `web/src/`
  (`grep -r "\.grid\b|Waypoint|priority_coverage|getStructure\b|getPlan\b|GridMap|mapLayout|capture_spacing|alert_zone" web/src`
  returns nothing). Requirement 2.5, 9.

### Group D stop — required evidence
In addition to the usual report, show a search over `web/src/` proving no grid
types or methods remain (the command above, returning no matches).

---

## E. Tests

### 14. Update contract/mock and component tests **[TEST CHANGE]**
- **Files:** `web/src/test/mocks.contract.test.ts`,
  `web/src/test/components.test.tsx`, `web/src/test/validators.test.ts`,
  `web/src/test/dataProvenance.test.tsx`
- **Do (each change listed with reason):**
  - `mocks.contract.test.ts` — was validating grid cells (0/1/2). **Change:**
    validate the metric sample (nodes/members/stops/sensors, units "m"). *Reason:*
    the mock moved from grid to metric; the old format no longer exists.
  - `components.test.tsx` — had assertions on `GridMap`/grid cells and a
    "priority coverage" stat. **Change/replace:** assert `ElevationMap` renders
    stops/sensors and the stats panel shows coverage/route/battery (no priority
    coverage). *Reason:* renderer and stat set changed per the contract.
  - `validators.test.ts` — had grid-validator cases. **Change:** test the metric
    structure/plan validators (valid + invalid samples); drop grid-validator cases
    whose validators were removed. *Reason:* validators changed with the contract.
  - `dataProvenance.test.tsx` — **Change (if needed):** assert the KW51 provenance
    credit (DOI + CC BY-NC-SA 4.0) renders. *Reason:* Requirement 10.1.
  - **Removed test:** any assertion of the form "naive route length > budget >
    optimized route length". *Reason:* superseded 6.7; on KW51 the two plans are
    ~1.5% apart so no honest wedge exists; removed rather than tuned.
- **Do NOT** weaken or delete a test to hide a real failure; each removal is an
  obsolete-behavior replacement listed above.
- **Verify:** `npm test` in `web/` passes. Requirement 9.

### 15. Add new dashboard tests
- **Files (new):** `web/src/test/metricContract.test.ts` (or extend
  `validators.test.ts`), plus a plan-stats test
- **Do:** metric structure/plan validator (valid + invalid); plan stats sanity
  (coverage_pct = visited/34; battery_used = length × energy_per_meter;
  within_budget true for both KW51 plans); stops = 34 and shared diagonal ends
  collapse to one.
- **Verify:** `npm test` in `web/` passes. Requirement 6, 7.1, 9.

---

## F. Docs

### 16. Document the regeneration command and provenance in README
- **Files:** `README.md`
- **Do:** Add the plan regeneration command
  (`python firmware_esp32/planner.py --kw51-plans --layout data/structures/kw51_layout.json --out-dir data/plans`),
  note the committed plan files, and keep the KW51 geometry provenance/license
  visible. Plain language; no banned words; keep the standing disclaimer.
- **Verify:** `git diff README.md` reads clearly; the command matches what the
  planner accepts. Requirement 10.

---

## G. Final verification

### 17. Full build, tests, planner tests, and change summary
- **Do (run and report output, do not edit tests to pass):**
  - `npm run build` in `web/`
  - `npm test` in `web/`
  - `python -m unittest firmware_esp32/test_planner_kw51.py`
- **Then:** give a summary of every file changed (added / modified / removed),
  grouped by area, and confirm: no `data/external/`, `CONTEXT-HANDOFF.md`,
  dataset images, `.env`, or >50 MB file is staged; branch is
  `suhail/kw51-real-geometry`; the four route lengths in the generated plan files
  match design.md (533.2 / 405.9 / 408.9 / 399.8 m, with naive = 405.9 and
  optimized = 399.8).
- **Verify:** all three commands succeed with the real output pasted, not
  summarized. Requirement 9.
