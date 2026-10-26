# Requirements — KW51 Real Inspection Map

## Introduction

The dashboard's inspection view currently renders a mock grid-based bridge map.
This feature replaces it with the real geometry of railway bridge KW51, rendered
at true metric scale as a side elevation (x-z) with a side A / side C toggle. The
geometry comes from `data/structures/kw51_layout.json` (derived from the KU Leuven
finite element model, CC BY-NC-SA 4.0). The real planner
(`firmware_esp32/planner.py`) produces the inspection route from that geometry.

This changes the shared data contract: structure and plan move from a grid-based
format to a metric format. The contract (`docs/contract.md`) is versioned to
reflect this. Suhail owns all folders; this is an approved, deliberate contract
change.

### What this feature must respect (honesty and scope)

- The trigger model watches natural frequency, a global property of the whole
  bridge. It detects **that** something changed, not **where**. The dashboard must
  never draw an alert zone around a single location or claim a located alert.
- Defect findings and images remain simulated (CODEBRIM is concrete imagery; KW51
  is steel; real steel-defect imagery is future work). This must be labeled.
- Thresholds, tiers, and any energy/battery figure are demonstration values, not
  engineering limits. The system helps prioritize; it never states a bridge is
  safe or unsafe.
- Geometry is real and attributed; the map must credit the source and license.

### Explicitly unchanged by this feature

The monitor view, the KW51 replay engine, the trigger logic, and the rule-based
report logic stay as they are, with one exception: report wording that would
otherwise claim an alert location is corrected (Requirement 8). The redesign's
design tokens, accessibility rules, and honesty features (degraded badge, data
warnings, per-finding mock markers, footer disclaimer) are preserved.

---

## Requirement 1 — Metric contract for structure and plan

**User story:** As the maintainer, I want the structure and plan contracts to
describe real metric geometry, so the dashboard can render KW51 at true scale
instead of quantizing it to a grid.

#### Acceptance criteria

1. THE contract (`docs/contract.md`) SHALL define a new metric structure format
   (versioned) with: id, name, units ("m"), a coordinate-system description, and
   references to the real geometry fields (nodes, members, diagonal connection
   locations, sensors) sourced from `data/structures/kw51_layout.json`.
2. THE contract SHALL define a new metric plan format (versioned) with:
   `plan_type` (`naive` | `optimized`), an ordered list of stops with metric
   coordinates (x, y, z in meters), and a `stats` object defined in Requirement 6.
3. THE contract SHALL retain the old grid-based structure/plan definitions as a
   clearly labeled previous version, or mark them superseded, so history is not
   silently rewritten.
4. THE contract change SHALL NOT alter contract section 1 (defect API) or
   section 2 (trigger replay); those remain as they are.

## Requirement 2 — Load and validate the real KW51 layout

**User story:** As an inspector, I want the map to use the real KW51 geometry, so
what I see matches the actual bridge.

#### Acceptance criteria

1. THE dashboard SHALL load geometry from `data/structures/kw51_layout.json`
   through the existing data-source layer (served under the data base path).
2. WHEN the layout file is present and valid THE dashboard SHALL use its real
   nodes, members, 34 distinct connection locations, and 26 sensors.
3. WHEN the layout file is absent or fails validation THE dashboard SHALL fall
   back to a small metric sample (in the new metric format, NOT the old grid
   format) and surface a data warning naming the problem, consistent with the
   existing data-warning behavior.
4. THE dashboard SHALL treat all coordinates as meters and SHALL NOT quantize
   them to integer grid cells.
5. THE grid rendering path (the old grid-based map) SHALL be removed from the
   code; only the metric elevation renderer remains.

## Requirement 3 — Side elevation map (x-z) with A / C toggle

**User story:** As an inspector, I want a side elevation per arch, so I can tell
deck connections from arch connections, which a plan view cannot show.

#### Acceptance criteria

1. THE inspection map SHALL render a side elevation in the x-z plane at true
   metric scale (equal x and z scaling), showing the girder line, the arch curve,
   the diagonals, and the connection locations for the selected side.
2. THE map SHALL provide a side toggle that switches between side A (South, y=0)
   and side C (North, y=11.750).
3. BOTH side elevations SHALL keep the same x direction (Brussels on the left,
   Leuven on the right), so the two views are directly comparable.
4. EACH view SHALL be labeled with its side and viewing direction, for example
   "Side A (South), viewed from the south" and "Side C (North), viewed from the
   north".
5. THE map SHALL draw the geometry in the technical-drawing style defined in
   `.kiro/steering/design.md` (light lines, neutral base), reserving color for
   meaning only.
6. THE map SHALL remain readable on a laptop and on a phone, and SHALL meet the
   accessibility rules in the design tokens (focus, contrast, reduced motion).

## Requirement 4 — No invented alert location

**User story:** As an inspector, I must not be shown a false "alert zone," because
the trigger only knows something changed, not where.

#### Acceptance criteria

1. WHEN the alert level is Warning or Alarm THE dashboard SHALL state exactly:
   "Frequency shift detected. Location unknown: inspecting all connection
   locations." and SHALL NOT highlight any single location as the alert source.
2. THE map SHALL NOT render an alert-zone circle or any per-location alert
   highlight derived from a single node.
3. THE planner SHALL plan a route through ALL 34 distinct connection locations
   (not a subset near an assumed alert).
4. THE spec and UI SHALL note that locating the change would require distributed
   sensor nodes, recorded as future work.

## Requirement 5 — 3D route planning

**User story:** As an inspector, I want route length and energy to reflect real 3D
travel, since deck and arch connections differ by ~19 m vertically and the two
sides by 11.750 m.

#### Acceptance criteria

1. THE planner SHALL compute distances using x, y, and z (3D Euclidean), not a 2D
   projection.
2. Route length SHALL be the sum of 3D segment lengths along the visited order.
3. Both the naive and optimized plans SHALL use the same 3D distance function.
4. Route length SHALL be a straight-line 3D estimate that ignores obstacles
   (deck, bracing). The UI SHALL state this next to the route length (for
   example "straight-line estimate, ignores obstacles").
5. Obstacle-aware path planning SHALL be recorded as future work for the Gazebo
   simulation stage.

## Requirement 6 — Honest stats

**User story:** As an inspector, I want stats whose definitions are truthful and do
not depend on an alert location.

#### Acceptance criteria

1. `coverage_pct` SHALL be defined as distinct connection locations visited
   divided by 34.
2. `battery_used` SHALL be computed as route length (meters) multiplied by an
   energy-per-meter value stored in a config field, and the UI SHALL label it as
   an estimate (a demonstration value, like the alert thresholds).
3. The naive plan SHALL be a simple end-to-end sweep of all 34 locations; the
   optimized plan SHALL be the planner's route. The stats SHALL be computed the
   same way for both so they are comparable.
4. "Priority coverage" SHALL be removed, and no secondary coverage stat SHALL be
   added. The naive-vs-optimized comparison is route length and battery used.
   No stat SHALL depend on an alert location.
5. Battery budget SHALL be a config value, labeled in the UI as a demonstration
   value (like the alert thresholds).
6. WHEN a plan's cumulative `battery_used` would exceed the battery budget, the
   plan SHALL stop at the last reachable location, and `coverage_pct` SHALL
   reflect only the locations actually visited.
7. THE demonstration battery budget SHALL be a chosen demonstration cap that
   BOTH plans finish within, and the spec and UI SHALL state that it is a
   demonstration value. The budget cut-off logic (criterion 6.6) SHALL still
   exist and SHALL be exercised by a test using a small test-only budget.
   (This supersedes the earlier version of 6.7, which required a budget the naive
   sweep could not finish while the optimized route could. On KW51 the per-level
   naive sweep and the planned route are within ~1.5% of each other, so no honest
   budget separates them; forcing one would require tuning the numbers.)

## Requirement 7 — Inspection stops, sensors, and simulated findings

**User story:** As an inspector, I want the 34 connection locations as stops and
the 26 real sensors shown, while defect results are clearly marked simulated.

#### Acceptance criteria

1. THE inspection stops SHALL be the 34 distinct connection locations from
   `diagonal_connections.distinct_locations`; shared diagonal ends SHALL count as
   one stop.
2. THE map SHALL place a marker at each stop on the correct side's elevation, and
   SHALL show which diagonal ends share that location when the stop is selected.
3. THE map SHALL show the 26 real sensors at their true (x, z) positions on the
   relevant side, distinguished by type (strain, acceleration, displacement) with
   a text label or icon, never by color alone.
4. Defect findings (scores, tiers, images) SHALL remain simulated, and each
   finding SHALL keep its per-finding "mock" marker.
5. THE map SHALL display the label: "Geometry: real KW51 (KU Leuven FEM,
   CC BY-NC-SA 4.0). Defect findings and images: simulated."

## Requirement 8 — Report wording corrected, logic unchanged

**User story:** As an engineer reading the report, I want it to reflect that the
alert location is unknown, without changing how the report is generated.

#### Acceptance criteria

1. THE rule-based report logic (how it is built from findings, stats, and alert
   history) SHALL remain unchanged in computation.
2. WHERE the report previously implied a specific alert location, the wording
   SHALL be corrected to state that the frequency shift is global and all
   connection locations were inspected.
3. THE report SHALL NOT invent numbers and SHALL NOT claim the bridge is safe or
   unsafe.

## Requirement 9 — Tests stay green; changes are listed

**User story:** As the maintainer, I want the test suite to keep passing, with any
contract-driven changes documented.

#### Acceptance criteria

1. THE existing test suite SHALL pass after this feature (build and tests green).
2. WHERE a test must change because the structure/plan contract changed, the
   change SHALL be limited to what the contract change requires, and every changed
   test SHALL be listed in the spec with the reason.
3. No test SHALL be weakened or deleted to hide a real failure; a genuinely
   obsolete test (asserting the removed grid/priority-coverage behavior) MAY be
   replaced by an equivalent test for the new behavior, and that replacement SHALL
   be listed and justified.

## Requirement 10 — Provenance and licensing on screen

**User story:** As a viewer, I want the real geometry credited and its license
visible, as the CC BY-NC-SA 4.0 terms require.

#### Acceptance criteria

1. THE map SHALL credit the KU Leuven KW51 model (DOI and CC BY-NC-SA 4.0) in a
   visible, accessible place.
2. THE footer disclaimer SHALL remain present and unchanged in meaning.
3. No dataset images or external model files SHALL be committed; only the derived
   geometry already in `data/structures/` is used.

---

## Out of scope

- Localizing the frequency shift to a specific connection (needs distributed
  sensors; future work).
- Replacing simulated concrete defect imagery with real steel-defect imagery
  (a later plan step, pending license checks).
- Changes to contract section 1 (defect API) or section 2 (trigger replay).
- Any change to the monitor view, replay engine, trigger model, or the
  rule-based report's computation.
