# Requirements — InspectPath Dashboard

## Introduction

The InspectPath dashboard is the operator-facing web app (React + Vite, in `web/`) that
turns continuous bridge-monitoring data and targeted AI inspection results into one
prioritized, plain-language view for bridge inspectors and engineers.

This spec covers exactly six capabilities: a live-replay bridge monitor, an escalation
banner with dispatch, an inspection view with an animated robot and stats, a findings
map with pins, an LLM-generated report, and a footer disclaimer.

Everything must run against fake data in `web/src/mocks/` that matches `docs/contract.md`
before any real data source is connected. Data shapes that the dashboard needs but that
are not in the shared contract (findings list, alert history, UI state) are defined in
`design.md` and marked "dashboard-internal, not part of the shared contract."

### Scope boundary

In scope: exactly the six numbered capabilities below. Out of scope: anything else,
including the planner algorithm itself (owned in `web/src/planner/`, consumed here via its
contract), the defect model, data collection, authentication, routing to a backend, and
persistence. The dashboard consumes contract-shaped data and renders it.

### Honesty and presentation rules (from steering, apply to every requirement)

- Alert thresholds and urgency tiers are demonstration values, never engineering limits.
- The UI never states a bridge is safe or unsafe; it helps prioritize.
- Degraded data is shown as "node degraded", never as "bridge unsafe".
- UI text is plain language for non-specialists.
- The UI works on a laptop screen and stays readable on a phone.
- No invented metrics; only values present in the data are shown.

---

## Requirement 1 — Bridge monitor view (live replay)

**User story:** As a bridge inspector, I want to watch the sensor node's readings replay as
if live, so that I can see the bridge's current condition and alert level at a glance.

#### Acceptance criteria

1. WHEN the monitor view loads THEN the dashboard SHALL replay trigger records from a
   `data/trigger/replay_<dataset>.json`-shaped array (contract §2) in timestamp order,
   advancing one record at a time as if live.
2. WHILE replay is running THE dashboard SHALL display, for the current record,
   `frequency_hz` (measured) alongside `predicted_frequency_hz`, the `residual_pct`,
   and `temperature_c`, each with a plain-language label and unit.
3. THE dashboard SHALL display the current `alert_level` as one of Normal, Watch, Warning,
   Alarm, using a distinct, clearly distinguishable color per level.
4. WHEN the current record's `quality` is `degraded` THE dashboard SHALL show a "node
   degraded" badge, and SHALL NOT present degraded data as a statement about bridge safety.
5. WHEN `quality` is `ok` THE dashboard SHALL NOT show the degraded badge.
6. THE dashboard SHALL show frequency vs. predicted frequency over time (recent history of
   the replay), so the trend leading to the current reading is visible.
7. WHEN the replay reaches the end of the array THE dashboard SHALL stop advancing and hold
   on the final record (no error, no wraparound unless the user restarts).
8. THE monitor view SHALL function entirely from mock data in `web/src/mocks/` with no
   network dependency.

---

## Requirement 2 — Escalation banner and dispatch

**User story:** As an inspector, when readings escalate to a serious level, I want a clear
prompt to launch an inspection, so that I can act without hunting through the UI.

#### Acceptance criteria

1. WHEN the current `alert_level` is `warning` OR `alarm` THE dashboard SHALL display a
   prominent banner indicating the escalation, colored to match the alert level.
2. WHEN the banner is shown THE dashboard SHALL display a "Dispatch inspection" button.
3. WHEN the user activates "Dispatch inspection" THE dashboard SHALL open the inspection
   view (Requirement 3).
4. WHILE `alert_level` is `normal` OR `watch` THE dashboard SHALL NOT show the banner or the
   dispatch button.
5. THE banner text SHALL be plain language and SHALL NOT assert that the bridge is unsafe.

---

## Requirement 3 — Inspection view

**User story:** As an inspector, I want to see the planned inspection run on a map of the
structure with live coverage and budget stats, so that I can judge how thorough and
efficient the route is.

#### Acceptance criteria

1. THE inspection view SHALL render a grid map from a structure input (contract §3),
   drawing each cell by type: inspectable surface (`0`), obstacle/no-fly (`1`), and
   priority zone (`2`), with (0,0) at top-left, `x` = column, `y` = row.
2. WHEN the structure defines an `alert_zone` THE inspection view SHALL highlight that zone
   on the map.
3. THE inspection view SHALL render a robot icon that animates along the planner's
   `waypoints` (contract §4) in order.
4. WHILE the robot advances THE inspection view SHALL apply coverage shading to cells that
   have been covered by the route so far.
5. THE inspection view SHALL show a stats panel with coverage % (`coverage_pct`), priority
   coverage % (`priority_coverage_pct`), and battery used vs. budget (`battery_used` /
   `battery_budget`), each rendered as plain-language labeled values.
6. THE inspection view SHALL provide a naive vs. optimized toggle that switches between a
   `plan_type: "naive"` plan and a `plan_type: "optimized"` plan, updating the map, robot
   path, coverage shading, and stats to match the selected plan.
7. THE inspection view SHALL function entirely from mock structure and plan data in
   `web/src/mocks/` with no network dependency.

---

## Requirement 4 — Findings on the map

**User story:** As an inspector, I want defect findings pinned on the inspection map and
color-coded by urgency, so that I can quickly see what needs attention and review the
evidence.

#### Acceptance criteria

1. THE inspection view SHALL render a pin on the map at the location of each finding.
2. THE dashboard SHALL color each pin by its tier: high = red, medium = amber, low = yellow.
3. WHEN the user clicks a pin THE dashboard SHALL show the captured image for that finding,
   the per-class defect scores (contract §1 `scores`), and the detected tier.
4. WHEN a close-up image exists for that finding (per the image map, contract §5) THE
   dashboard SHALL show the close-up alongside the full image.
5. WHEN no close-up exists THE dashboard SHALL show only the full image without error.
6. THE findings feature SHALL function entirely from mock findings and image-map data in
   `web/src/mocks/`.

---

## Requirement 5 — LLM inspection report

**User story:** As an engineer, I want a plain-language report generated from the findings
and alert history, so that I can share and record a prioritized summary.

#### Acceptance criteria

1. THE report feature SHALL provide a button that sends the current findings plus the alert
   history to an LLM and requests a plain-language inspection report.
2. WHEN the report is generated THE dashboard SHALL display the report text in readable,
   plain language for non-specialists.
3. THE dashboard SHALL provide a "Copy" action that copies the report text.
4. THE dashboard SHALL provide a "Download" action that downloads the report text.
5. THE report SHALL work in a demo mode driven by mock data, so the feature functions
   before a real LLM endpoint is connected.
6. WHEN the LLM request fails OR no key is configured THE dashboard SHALL show a clear
   message and fall back to the mock report rather than crashing.
7. THE LLM API key SHALL be read from environment configuration and SHALL NOT be hardcoded;
   only `.env.example` is committed.
8. THE report SHALL NOT invent metrics and SHALL NOT claim the bridge is safe or unsafe.

---

## Requirement 6 — Footer disclaimer

**User story:** As a viewer of the dashboard, I want a persistent disclaimer, so that I
never mistake the simulation's estimates for engineering ratings.

#### Acceptance criteria

1. THE dashboard SHALL display, in the footer on every view, the exact text:
   "Simulation with real bridge data. Alerts and severity are estimates, not engineering
   ratings."
2. THE disclaimer SHALL remain visible and readable on both laptop and phone widths.
