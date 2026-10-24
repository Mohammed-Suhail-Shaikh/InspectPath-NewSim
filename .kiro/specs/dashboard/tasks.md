# Tasks — InspectPath Dashboard

Implementation plan for the dashboard in `web/` (React + Vite). Tasks are ordered so the
**end-to-end demo path works first on mocks**: monitor view → Warning banner → Dispatch →
inspection map with robot animation. Findings, report, and polish come after.

Rules carried from steering/contract:
- Every screen runs on mock data in `web/src/mocks/` matching `docs/contract.md` before real
  data is connected.
- Each task is scoped to be completed and committed in under ~30 minutes.
- Do not add features outside this list. Keep text plain-language; never claim safe/unsafe.
- Commit after each task. Suggested commit messages are in parentheses.

Each task lists the requirements it satisfies (see `requirements.md`).

---

## Phase 0 — Project scaffold

- [ ] 1. Scaffold the Vite + React app in `web/`
  - Initialize React + Vite (TypeScript) in `web/`, with `index.html`, `src/main.tsx`,
    `src/App.tsx` rendering a placeholder layout (header + empty view area + footer slot).
  - Add `.gitignore` entries for `node_modules`, `dist`, and `.env`; add `.env.example` with an
    LLM key placeholder only.
  - Verify `npm install` and the dev server start cleanly.
  - _(commit: "Scaffold web app")_
  - _Requirements: foundation for all_

- [ ] 2. Add the footer disclaimer and base layout
  - Implement `components/Footer.tsx` with the exact text: "Simulation with real bridge data.
    Alerts and severity are estimates, not engineering ratings."
  - Wire it into `App.tsx` so it shows on every view; make layout responsive (laptop + phone).
  - _(commit: "Add footer disclaimer and layout")_
  - _Requirements: 6.1, 6.2_

- [ ] 3. Add the data-access seam and types
  - Create `src/data/source.ts` with the `DataSource` interface and TypeScript types for the
    contract shapes (`TriggerRecord` §2, `Structure` §3, `Plan`/`Waypoint`/`PlanStats` §4,
    `ImageMap` §5, `DefectScores`/`DefectTier` §1) and the dashboard-internal shapes (`Finding`,
    `AlertHistoryEntry`, `ViewState`, `InspectionReport`).
  - Add `src/data/mockSource.ts` returning data from `src/mocks/` (files added in later tasks).
  - _(commit: "Add data source interface and types")_
  - _Requirements: foundation for 1–5_

---

## Phase 1 — Demo path: monitor → banner → dispatch → inspection

- [ ] 4. Add the Z24 replay mock
  - Create `src/mocks/replay_z24.json` as a `TriggerRecord[]` (contract §2) that progresses
    `normal -> watch -> warning -> alarm` in timestamp order and includes at least one
    `degraded` window. Values example-only; `alert_level` consistent with the demo residual
    thresholds.
  - Wire `mockSource.getReplay`.
  - _(commit: "Add Z24 replay mock")_
  - _Requirements: 1.1, 1.8_

- [ ] 5. Replay engine with speed controls
  - Implement `features/monitor/useReplay.ts`: advance `replayCursor` through the array in
    timestamp order; default ~2 records/sec with 1x / 5x / 20x multipliers; stop and hold on the
    last record (no wraparound). Track `replaySpeed`/`replayRunning` in view state.
  - _(commit: "Add replay engine")_
  - _Requirements: 1.1, 1.7_

- [ ] 6. Readings panel + alert and quality badges
  - `ReadingsPanel.tsx`: show measured `frequency_hz` vs `predicted_frequency_hz`,
    `residual_pct`, `temperature_c` with plain labels/units.
  - `AlertBadge.tsx` with `data/alertLevels.ts` mapping normal/watch/warning/alarm to distinct
    colors; `QualityBadge.tsx` showing "node degraded" only when `quality === "degraded"`.
  - Assemble `MonitorView.tsx` and make it the default view.
  - _(commit: "Add monitor readings and badges")_
  - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [ ] 7. Frequency chart (Recharts)
  - Add Recharts; implement `FrequencyChart.tsx` plotting recent measured vs predicted frequency
    over the replay history. Add the 1x/5x/20x speed control UI bound to `replaySpeed`.
  - _(commit: "Add frequency chart")_
  - _Requirements: 1.6_

- [ ] 8. Escalation banner + dispatch
  - `EscalationBanner.tsx`: visible only when current `alert_level` is `warning` or `alarm`,
    colored to match; plain-language text (never "unsafe"). Add a "Dispatch inspection" button
    that sets `activeView = "inspection"`.
  - _(commit: "Add escalation banner and dispatch")_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 9. Structure + plan mocks
  - Add `src/mocks/structure_bridge-a.json` (contract §3) with an `alert_zone`, and
    `plan_naive.json` + `plan_optimized.json` (contract §4) for `bridge-a`. Wire
    `mockSource.getStructure` and `getPlan`.
  - _(commit: "Add structure and plan mocks")_
  - _Requirements: 3.1, 3.7_

- [ ] 10. Grid map with alert zone
  - `GridMap.tsx`: render the SVG grid from `Structure.grid` (0 surface / 1 obstacle / 2
    priority), origin top-left, `x`=column/`y`=row; highlight `alert_zone` when present. Scaffold
    `InspectionView.tsx` to host it.
  - _(commit: "Add grid map")_
  - _Requirements: 3.1, 3.2_

- [ ] 11. Robot animation along waypoints
  - `RobotMarker.tsx`: animate a robot icon through the selected plan's `waypoints` in order.
  - _(commit: "Add robot animation")_
  - _Requirements: 3.3_

  > At the end of this task the core demo path works end to end on mocks:
  > monitor → Warning/Alarm banner → Dispatch → inspection map with the robot moving.

---

## Phase 2 — Inspection completeness

- [ ] 12. Coverage shading
  - `CoverageLayer.tsx`: shade cells covered by the route up to the robot's current position;
    update as the robot advances.
  - _(commit: "Add coverage shading")_
  - _Requirements: 3.4_

- [ ] 13. Stats panel
  - `StatsPanel.tsx`: show `coverage_pct`, `priority_coverage_pct`, and `battery_used` vs
    `battery_budget` from `PlanStats`, as plain-language labeled values.
  - _(commit: "Add stats panel")_
  - _Requirements: 3.5_

- [ ] 14. Naive vs optimized toggle
  - `PlanToggle.tsx`: switch `selectedPlan`; map, robot path, coverage, and stats all re-derive
    from the selected plan.
  - _(commit: "Add plan toggle")_
  - _Requirements: 3.6_

---

## Phase 3 — Findings

- [ ] 15. Findings + image-map + defect mocks
  - Add `src/mocks/image_map.json` (contract §5), `defect_responses.json` (contract §1, covering
    high/medium/low/none), and `findings.json` (dashboard-internal) for `bridge-a`. Wire
    `mockSource.getImageMap` and `getFindings`.
  - _(commit: "Add findings and image mocks")_
  - _Requirements: 4.6_

- [ ] 16. Finding pins colored by tier
  - `FindingPin.tsx`: render one pin per finding at `(x, y)`, colored high=red / medium=amber /
    low=yellow (`none` not pinned). Clicking sets `selectedFindingId`.
  - _(commit: "Add finding pins")_
  - _Requirements: 4.1, 4.2_

- [ ] 17. Finding detail with image, scores, close-up
  - `FindingDetail.tsx`: on selection, show the full image via `ImageMap[structureId][image_key]`,
    the per-class `scores` and `tier`; when `has_closeup`, also show the `<image_key>_closeup`
    image; otherwise show only the full image. Handle missing images with a placeholder.
  - _(commit: "Add finding detail")_
  - _Requirements: 4.3, 4.4, 4.5_

---

## Phase 4 — Report

- [ ] 18. Mock report response + alert history
  - Add `src/mocks/report_demo.json` (dashboard-internal) and ensure `alertHistory` accumulates
    on alert-level changes during replay. Wire `mockSource.getDemoReport`.
  - _(commit: "Add report mock and alert history")_
  - _Requirements: 5.5_

- [ ] 19. Report panel with LLM client + fallback
  - `llmClient.ts` reads the key from `import.meta.env` (never hardcoded). `useReport.ts` builds
    a `ReportRequest` from findings + alertHistory. `ReportPanel.tsx` has a "Generate report"
    button; on success show the LLM text, on failure/missing key fall back to the mock with a
    clear message. Prompt enforces plain language, no invented metrics, no safe/unsafe claims.
  - _(commit: "Add report panel")_
  - _Requirements: 5.1, 5.2, 5.6, 5.7, 5.8_

- [ ] 20. Copy and download
  - Add "Copy" (copies report text) and "Download" (saves report as a text file) actions.
  - _(commit: "Add report copy and download")_
  - _Requirements: 5.3, 5.4_

---

## Phase 5 — Verification and polish

- [ ] 21. Mock-vs-contract validation check
  - Add a small check/test that each contract-shaped mock has the correct fields and value sets
    (§1–§5), so mocks stay contract-accurate.
  - _(commit: "Add mock contract validation")_
  - _Requirements: 1.8, 3.7, 4.6_

- [ ] 22. Feature component tests
  - Tests using the mock `DataSource`: replay advances and badges toggle; banner only on
    warning/alarm; dispatch switches view; plan toggle swaps stats/path; pin click opens correct
    image/scores; close-up only when present; report copy/download and mock fallback.
  - _(commit: "Add component tests")_
  - _Requirements: 1–5 (behavioral coverage)_

- [ ] 23. Responsive pass
  - Verify every view is usable on a laptop and readable on a phone; fix overflow/wrapping;
    confirm the footer disclaimer stays visible at both widths.
  - _(commit: "Responsive polish")_
  - _Requirements: 6.2, and laptop/phone rule across 1–5_
