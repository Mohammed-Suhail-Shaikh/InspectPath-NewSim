# Implementation Plan: Trigger_Model

## Overview

Implement `ml/trigger/trigger_model.py` as a single, explainable Python pipeline that fits a temperature-compensation model on the KW51 healthy period, classifies temperature-corrected residuals against named thresholds, compares against a naive baseline, and emits two plots, a measured-numbers `results.md`, and two contract-format replay JSON files. Tasks build incrementally: scaffolding and constants first, then each pure pipeline function with its unit and property tests, then rendering, the report, replay/demo construction, and finally `main()` orchestration and end-to-end integration. Property-based tests (hypothesis) cover design Properties 1–13 at ≥100 examples each; example, edge, rendering, and smoke tests cover the glue and static artifacts. All writable paths stay within `ml/trigger/`, `data/trigger/`, and the repo-root `.gitignore`.

The design document specifies Python (`numpy`, `pandas`, `scipy`, `matplotlib`), so no implementation-language selection is required.

## Tasks

- [x] 1. Scaffold project files, constants, and the test harness
  - [x] 1.1 Create pinned runtime dependency file
    - Create `ml/trigger/requirements.txt` listing `numpy`, `pandas`, `scipy`, `matplotlib`, each pinned with `==` to an exact resolvable version
    - Do NOT add `pytest` or `hypothesis` (dev-only tools) to this runtime file
    - _Requirements: 2.1, 2.2_

  - [x] 1.2 Create the script skeleton with top-of-file named constants
    - Create `ml/trigger/trigger_model.py` with module imports and all top-of-file constants: `WATCH_THRESHOLD=0.75`, `WARNING_THRESHOLD=1.5`, `ALARM_THRESHOLD=2.0`; `HEALTHY_END="2019-05-15"`, `RETROFIT_END="2019-09-27"`; `NODE_ID="node-1"`, `QUALITY="ok"`, `SOURCE="KW51 replay"`; path constants `RAW_PATH`, `PLOTS_DIR`, `RESULTS_PATH`, `REPLAY_PATH`, `DEMO_PATH`, `GITIGNORE_PATH`, `GITIGNORE_ENTRIES=["ml/trigger/raw/", "__pycache__/", ".venv/"]`
    - Add a `__main__` guard that calls `main()` and exits with its return code
    - Leave pipeline functions as stubs to be filled by later tasks
    - _Requirements: 6.1, 14.1_

  - [x] 1.3 Create the test module skeleton and synthetic fixtures
    - Create `ml/trigger/tests/test_trigger_model.py` using `pytest` + `hypothesis`
    - Add a fixture that builds a tiny synthetic `.mat` via `scipy.io.savemat` with a `modes` struct containing `sdn`, `f` (≥6 columns), and `env` (≥1 column) so `load_modes` can be exercised without the real raw dataset
    - Add in-memory DataFrame fixtures of synthetic readings (timestamp/temperature_c/frequency_hz) for pipeline-stage tests
    - _Requirements: 14.1_

- [x] 2. Implement `.gitignore` configuration
  - [x] 2.1 Implement `ensure_gitignore(path, entries)`
    - Create `.gitignore` with exactly the three entries (each newline-terminated) when absent
    - When present, append only entries missing as exact full-line matches; preserve all existing lines; insert a newline first if the file lacks a trailing newline; no-op when all three are present
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

  - [ ]* 2.2 Write property test for `.gitignore` idempotency and preservation
    - **Property 13: .gitignore append is idempotent and preserving**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
    - Generate arbitrary starting content with random subsets of the three entries; assert all three present as full-line matches, existing lines preserved, no concatenation, second application identical

- [x] 3. Implement dataset loading, extraction, and cleaning
  - [x] 3.1 Implement `load_modes(path)` and `clean(df)`
    - `loadmat(path, squeeze_me=True, struct_as_record=False)["modes"]`; convert `sdn` via `pd.to_datetime(sdn - 719529, unit="D")`; extract `frequency_hz` from `f[:,5]` and `temperature_c` from `env[:,0]`; build a tidy DataFrame
    - `clean` drops rows with null/NaN timestamp, temperature, or frequency and retains all others
    - Abort (raise/report) if the file is missing/unreadable or has no `modes` struct; abort with a "no usable data" message if no readings remain after cleaning
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 3.2 Write property test for NaN cleaning
    - **Property 5: NaN cleaning drops exactly the incomplete readings**
    - **Validates: Requirements 3.5, 3.7**
    - Inject random NaNs; assert no retained reading has a null required field and every fully-present reading is retained

  - [ ]* 3.3 Write example and edge tests for loading/extraction
    - Assert `sdn` datenum converts to the known expected date (3.2); assert `f[:,5]`/`env[:,0]` extraction on the synthetic `.mat` fixture (3.3, 3.4)
    - Assert a missing `.mat` and a struct-less `.mat` both abort (3.6); assert all-NaN input aborts with a no-usable-data error (3.7)
    - _Requirements: 3.2, 3.3, 3.4, 3.6, 3.7_

- [x] 4. Implement period segmentation
  - [x] 4.1 Implement `segment(df)`
    - Add a `period` column labeling each reading `healthy` (strictly before `HEALTHY_END` 00:00:00), `retrofit` (`HEALTHY_END` 00:00:00 through `RETROFIT_END` 23:59:59 inclusive), or `after` (strictly after `RETROFIT_END` 23:59:59)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 4.2 Write property test for period partitioning
    - **Property 4: period segmentation partitions all readings**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - Generate timestamps straddling both boundaries; assert each reading gets exactly one period and the three periods jointly cover all retained readings

- [x] 5. Implement the compensation model, prediction, and residual
  - [x] 5.1 Implement `fit_compensation(healthy_df)` and `predict(df, slope, intercept)`
    - OLS of `frequency_hz` on `temperature_c` over healthy readings via `scipy.stats.linregress`; return `slope`, `intercept`, `r_squared = rvalue ** 2`
    - Abort before fitting if the healthy period has fewer than 2 readings
    - `predict` computes `slope * temperature_c + intercept` for every reading (all periods)
    - _Requirements: 5.1, 5.2, 5.3, 11.2_

  - [ ]* 5.2 Write example and edge tests for the fit
    - Known-line healthy points recover the expected slope/intercept with non-healthy rows excluded from the fit (5.1, 5.3)
    - Healthy period with 0 and with 1 reading both abort before fitting (5.2)
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.3 Implement `compute_residual_pct(df)`
    - `(actual - predicted) / predicted * 100`, signed; set `NaN` (undefined) where `predicted == 0`
    - _Requirements: 5.4, 5.5_

  - [ ]* 5.4 Write property tests for residual sign and undefined exclusion
    - **Property 2: residual sign matches actual-minus-predicted**
    - **Validates: Requirements 5.4**
    - Generate actual/predicted pairs with predicted > 0; assert sign of `residual_pct` equals sign of `(actual - predicted)` and is zero exactly when equal
    - **Property 3: undefined residuals are excluded from classification**
    - **Validates: Requirements 5.5, 6.6**
    - Generate rows with predicted == 0; assert residual is undefined and the reading receives no corrected `alert_level`

- [x] 6. Implement classification and the naive baseline
  - [x] 6.1 Implement `classify(abs_metric)`
    - Half-open intervals using the constants: `[0,0.75)→normal`, `[0.75,1.5)→watch`, `[1.5,2.0)→warning`, `[2.0,∞)→alarm`; `None`/NaN input is excluded (no level)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.3_

  - [ ]* 6.2 Write property test for classify boundaries and monotonicity
    - **Property 1: classify is boundary-correct and monotonic**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 7.3**
    - Generate metric floats spanning the boundaries including exact 0.75/1.5/2.0; assert correct level per interval and that severity never decreases as `|m|` increases

  - [ ]* 6.3 Write example test for threshold constants
    - Assert the imported constants equal 0.75/1.5/2.0 exactly
    - _Requirements: 6.1_

  - [x] 6.4 Implement `compute_naive(df, healthy_mean)`
    - `(frequency_hz - healthy_mean) / healthy_mean * 100` per reading; classify naive values with the same `classify`/thresholds
    - Abort before computing if there are 0 healthy readings or `healthy_mean == 0`
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 6.5 Write example and edge tests for the naive baseline
    - Known mean/freq produces the expected naive value (7.1); empty or zero healthy mean aborts before computing the naive metric (7.2)
    - _Requirements: 7.1, 7.2_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement comparison metrics
  - [x] 8.1 Implement `count_false_alarms(df, method)` and `count_detections(df)`
    - `count_false_alarms` counts healthy readings above `normal` for the given method (naive or corrected), as a non-negative integer
    - `count_detections` counts after-period readings above `normal` under the corrected model
    - Report 0 for any counted period with 0 readings
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 8.2 Write example and edge tests for the counts
    - Small labeled frames produce the expected false-alarm and detection counts (8.1–8.3); empty periods yield 0 (8.4)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 9. Implement the diagnostic plots
  - [x] 9.1 Implement `make_comparison_plot(df, path)`
    - Two stacked panels over time (naive upper, corrected lower); ± threshold lines at 0.75/1.5/2.0 on each panel; gray shading over the retrofit span
    - Abort identifying the plot path if the file cannot be written; preserve any existing file
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 9.2 Implement `make_fit_plot(healthy_df, slope, intercept, path)`
    - Scatter of healthy `frequency_hz` vs `temperature_c`; overlay the fitted line across the healthy temperature range
    - Abort identifying the plot path if the file cannot be written; preserve any existing file
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 9.3 Write rendering and write-failure tests for the plots
    - Assert `make_comparison_plot` creates the file with two stacked axes, threshold lines, and retrofit shading (9.1–9.4); assert `make_fit_plot` creates the file with scatter plus fitted line (10.1–10.3)
    - Patch `savefig`/`open` to raise and assert each plot function aborts identifying the target and preserves existing state (9.5, 10.4, 1.6)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 1.6_

- [x] 10. Implement the measured results report
  - [x] 10.1 Implement `write_results(stats, counts, path)`
    - Write `results.md` with slope/intercept/R² (3 dp), healthy false-alarm counts (naive and corrected), after-period detection count, and an **Open Decisions** section carrying the Requirement 15 note (thresholds 0.75/1.5/2.0 vs contract 2.0/5.0/8.0; source `"KW51 replay"` vs `"Z24 replay"`; working assumption pending team confirmation)
    - Emit only values computed from the current run; never templated or stand-in magnitudes; do NOT modify `docs/contract.md`
    - Abort identifying the target if the file cannot be written; preserve existing state
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 15.2, 15.3, 15.4, 15.5, 1.6_

  - [ ]* 10.2 Write measured-numbers-discipline tests for the report
    - Assert `results.md` contains the slope/intercept/R² at 3 dp and the counts, and that each equals the stats/counts passed into `write_results` rather than any hardcoded literal (11.1–11.5)
    - Assert both discrepancy statements and the working-assumption note are present (15.2, 15.3)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 15.2, 15.3_

- [x] 11. Implement replay record construction and serialization
  - [x] 11.1 Implement `build_replay_records(df)` and `write_json(records, path)`
    - One record per analyzed reading (undefined-residual readings excluded), ascending timestamp; exactly the nine fields in order; fixed `node_id`/`quality`/`source`; ISO-8601 UTC with trailing `Z`; numeric fields rounded to ≤3 decimals; `residual_pct` signed; `alert_level` from the enum
    - `write_json` serializes a record list to a JSON array; empty list → `[]`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 15.1_

  - [ ]* 11.2 Write property tests for replay record schema and fields
    - **Property 6: every replay record has exactly the nine contract fields**
    - **Validates: Requirements 12.3, 15.1**
    - **Property 7: fixed replay fields hold constant values**
    - **Validates: Requirements 12.4**
    - **Property 9: alert_level is always one of the four enum strings**
    - **Validates: Requirements 12.6**
    - Generate synthetic analyzed reading sets; assert the exact nine-key set, the fixed values, and the alert_level enum membership

  - [ ]* 11.3 Write property tests for timestamp format, rounding, and ordering
    - **Property 8: replay timestamps are ISO-8601 UTC with trailing Z**
    - **Validates: Requirements 12.5**
    - **Property 10: replay numeric fields are rounded to at most 3 decimals**
    - **Validates: Requirements 12.7**
    - **Property 11: the full replay is ordered and complete**
    - **Validates: Requirements 12.1, 12.2**
    - Assert timestamps match the `...Z` pattern and parse back to the source instant; assert numeric fields equal their 3-dp rounding with residual sign retained; assert ascending-timestamp ordering, one record per analyzed reading, and `[]` for empty input

- [x] 12. Implement demo-window selection
  - [x] 12.1 Implement `select_demo_window(records)`
    - Select a contiguous run of consecutive readings (no interior reading omitted) spanning 1–7 days inclusive that transitions from an earlier `normal` to a later `warning`/`alarm`
    - Report an error if no qualifying window exists
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ]* 12.2 Write property and edge tests for the demo window
    - **Property 12: the demo window is contiguous and crosses into alert**
    - **Validates: Requirements 13.2, 13.3**
    - Generate a series containing a constructed normal→alarm run; assert the window is contiguous, 1–7 days, and crosses from `normal` to `warning`/`alarm`
    - Edge: a series with no normal→alert transition triggers the no-demo-window error (13.4)

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement `main()` orchestration and wire the pipeline together
  - [x] 14.1 Implement `main()`
    - Orchestrate the full pipeline in order: `ensure_gitignore` → `load_modes` → `clean` → `segment` → `fit_compensation` → `predict` → `compute_residual_pct` → `compute_naive` → `classify` (corrected + naive) → `count_false_alarms`/`count_detections` → `make_comparison_plot` + `make_fit_plot` → `write_results` → `build_replay_records` → `write_json` (full) → `select_demo_window` → `write_json` (demo)
    - Return 0 on full success; on any abort, print a clear message to stderr, leave existing outputs untouched, and return non-zero; wire so there is no orphaned function
    - _Requirements: 14.1, 14.2, 14.3_

  - [ ]* 14.2 Write end-to-end integration and smoke tests
    - Run `main()` on the synthetic `.mat` fixture; assert exit status 0 and all five artifacts written (14.1, 14.2); inject a failure and assert a non-zero exit (14.3)
    - Smoke-check `requirements.txt` lists `numpy`/`pandas`/`scipy`/`matplotlib`, each pinned with `==` (2.1, 2.2)
    - Static-assert the write-path constant set lies within `ml/trigger/`, `data/trigger/`, and the repo-root `.gitignore`, and excludes `docs/contract.md` (1.5, 15.4, 15.5)
    - _Requirements: 14.1, 14.2, 14.3, 2.1, 2.2, 1.5, 15.4, 15.5_

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (test-related) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references the specific requirement clauses it implements for traceability.
- Property-based tests use `hypothesis` at ≥100 examples each and carry the comment tag `# Feature: trigger-model, Property {number}: {property_text}`; `pytest` and `hypothesis` stay out of the runtime `requirements.txt`.
- Checkpoints provide incremental validation points across the pipeline.
- Measured-numbers discipline (11.5): report tests assert values equal the computed stats passed in, never pinned to invented magnitudes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "4.2", "5.1", "6.2", "6.3", "6.4"] },
    { "id": 3, "tasks": ["5.2", "5.3", "6.5", "8.1", "9.1", "9.2"] },
    { "id": 4, "tasks": ["5.4", "8.2", "9.3", "10.1", "11.1", "12.1"] },
    { "id": 5, "tasks": ["10.2", "11.2", "11.3", "12.2", "14.1"] },
    { "id": 6, "tasks": ["14.2"] }
  ]
}
```
