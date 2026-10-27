# InspectPath

Continuous bridge monitoring that dispatches an inspection and returns a ranked list of what to look at first. It began as a Hackachusetts 2026 build (Robotics & Hardware track) and was extended afterwards on a real bridge, railway bridge KW51 in Leuven, Belgium.

Everything runs in simulation on real public datasets. There is no physical sensor node or drone.

## 1. The problem and who benefits

Many bridges are rated poor yet are inspected only about every two years, so damage can develop between visits. When an inspection does happen, it produces more imagery than an engineer can review carefully, and the defects that matter most can be buried in the volume.

The people who benefit are the inspectors and bridge engineers who have to decide, with limited time, which structures to visit and where to look once they get there.

From Varun's analysis of the 2022 National Bridge Inventory for Massachusetts, counting each bridge by its lowest condition rating: 435 bridges are rated poor or worse, and 179 or more of those cross a river or brook, where scour is a risk. The poor bridges have a median build year of 1954, and 293 of the 435 are steel. These numbers are the motivation for continuous monitoring between inspections.

## 2. What it does

1. Monitor: a sensor node streams structural and environmental readings. On KW51, the dashboard replays recorded 2019 monitoring data.
2. Trigger: a model compares natural frequency against a temperature-corrected baseline and raises Watch, Warning, or Alarm.
3. Dispatch: a Warning or Alarm offers an inspection. A frequency change does not say where the change is, so on KW51 the inspection visits all 34 diagonal connections.
4. Inspect: the route captures images, and a defect model classifies each image and assigns an urgency tier.
5. Ranked report: the dashboard and a plain-language report give one prioritized list of what to inspect first.

## 3. Project history

### 3.1 Hackathon build (Hackachusetts 2026)

A team of four built the first end-to-end version in one day:

- Suhail: product lead, dashboard, report, integration.
- Varun: sensor node and the planner (`firmware_esp32/planner.py`).
- Zaiba: defect model.
- Komal: trigger model.

At the end of the hackathon the dashboard drew a sample grid bridge, because the planner's metric layout and the dashboard's grid format did not match yet.

### 3.2 Post-hackathon work (Suhail)

After the hackathon, Suhail took over all folders and moved the inspection side onto KW51:

- Real KW51 geometry. `data/structures/kw51_layout.json` is derived from the KU Leuven finite element model of KW51: nodes, members, the 34 diagonal connection locations, and 26 sensor positions.
- Metric planner. The KW51 path extends Varun's `planner.py`; it is not a separate planner. It writes two plans, a manual per-level sweep and a nearest-neighbor + 2-opt route, and the route was compared against three baselines (section 5.3).
- Real defect scores. The dashboard sends CODEBRIM held-out test images placed at 4 connections to the real defect model and shows its actual output.
- Inspection map. A side elevation of KW51 drawn to scale, with the route, a side A / side C toggle, a plan toggle, and an imaged-connections strip with expandable images.
- Two-layer monitor. A plain-language summary on top (status, current reading, drift from expected, time above normal) and an engineering section below (residual, temperature model, thresholds, persistence, sensor health).
- Honesty and data-integrity fixes. The battery figure was removed from the UI and report, the dispatch banner states that the location is unknown, mock data is labeled as mock, and view error boundaries keep one failing view from blanking the page.

## 4. How it works

### Sensor node (Varun)

A low-cost ESP32 node, simulated in Wokwi, that measures the four failure-relevant quantities and reports whether the structure behaves as it did at install. Sensors:

- MPU6050 (accelerometer and gyroscope): vibration for natural frequency, and tilt for pier settlement.
- DHT22: air temperature and humidity. Temperature corrects the frequency and ultrasonic readings.
- HC-SR04: ultrasonic distance to the water surface, for water level and scour risk.
- HX711 with a strain gauge: beam strain under traffic. A load cell stands in under simulation.

The node runs data-quality checks on every reading: range, stuck value, rate of change, dropout, timing jitter, and a temperature cross-check. A window with more than 5% flagged samples is excluded, and the node is reported as degraded rather than the bridge being called unsafe. It raises graded alerts and combines parameters, so a frequency drop with rising strain and new tilt is treated differently from a frequency drop during a heat wave.

The firmware's residual thresholds are 2 / 5 / 8 percent, because its simulated MPU6050 is noisier than the professional sensors behind the KW51 data (section 7). Full detail is in [`docs/hardware-spec.md`](docs/hardware-spec.md). Live simulation: [Varun's ESP32 sensor node in Wokwi](https://wokwi.com/projects/478798310961586177).

<img width="1152" height="971" alt="ESP32 sensor node circuit" src="https://github.com/user-attachments/assets/4afccc9e-e074-431f-b674-a60b70e9584a" />

### Trigger model on KW51 (Komal)

A bridge's natural frequency drops when it loses stiffness, but temperature also shifts frequency, often by more than damage does. A plain threshold would raise a false alarm with every cold snap. The trigger model learns how frequency depends on temperature during a healthy period, then flags readings that do not fit.

It fits a linear baseline of mode-6 natural frequency against steel temperature on the healthy period (before May 15, 2019). For each reading it computes the residual, the percent difference between measured and predicted frequency, and assigns an alert level on the absolute residual: 0.75% watch, 1.5% warning, 2.0% alarm. It exports the result as replay data that the dashboard plays back. Code is in `ml/trigger/`, replay data in `data/trigger/`.

### Defect model on CODEBRIM (Zaiba)

The defect model looks at a concrete patch and says which of five defects are present: crack, spallation, exposed bars, efflorescence, corrosion stain.

It is a pretrained ResNet-18 with five independent sigmoid outputs, since one patch can show several defects at once. Rare classes get a higher loss weight. Thin patches are padded to square and resized. The data is split by source photo, so test photos are never seen in training. The best epoch is chosen on validation, and the test set is used once.

It serves `POST /predict` (an image file or base64) and returns per-class scores, the detected classes (score at or above 0.5), and a tier. The tier rule is a team decision, not an engineering standard: high if exposed_bars or spallation, else medium if corrosion_stain, else low if crack or efflorescence, else none. High and medium tiers trigger a close-up re-inspection.

### Planner (Varun, extended by Suhail)

`firmware_esp32/planner.py` has two paths.

The original firmware path (Varun) reads trigger records and `firmware_esp32/bridge_layout.json`. On a Warning it inspects the zone near the node that raised the alert; on an Alarm it does that zone first, then the rest. It orders waypoints by nearest neighbor, calls the defect model for each image (real API or a repeatable mock), and writes `firmware_esp32/output/inspection_report.json`.

The KW51 path (Suhail) is an extension of the same file, run with `--kw51-plans`. It reads the 34 connection locations from `kw51_layout.json` and writes `data/plans/kw51_naive.json` and `data/plans/kw51_optimized.json`:

- Naive: a per-level sweep a pilot could fly by hand (side A deck ascending x, side A arch descending x, side C arch ascending x, side C deck descending x).
- Optimized: nearest-neighbor from an assumed launch point, then a 2-opt improvement pass. It is a good short route, not guaranteed to be the shortest.

Distances are straight-line 3D and ignore obstacles such as the deck and bracing. The planner is the only thing that writes plans; the dashboard reads them. The file format is in `docs/contract.md` sections 3b and 4b.

### Dashboard and report (Suhail)

A React and Vite app in `web/` with two views, monitor and inspection. The report sits in the inspection view.

The monitor replays KW51 data (a short demo window or the full record, chosen from a dataset picker). The top layer is plain language: the alert level, what it means, the current reading, drift from expected, and time above normal. A Warning or Alarm shows a Dispatch inspection button. The engineering layer below shows the residual chart with threshold lines, the temperature model, and sensor health.

The inspection view draws KW51 in side elevation at true scale, one side at a time. Members are drawn in light gray so the route stands out: purple for what is done, dark gray and dashed for what remains. It shows connections visited, a tier breakdown of findings, and route length. Findings are pinned by tier, with a letter as well as a color, and clicking one shows the image, the per-class scores, and a close-up when one exists.

The report is a deterministic, rule-based summary built only from the findings, plan stats, and alert history, so it does not invent numbers. An optional AI summary uses a separate backend in `api/` and is labeled as a sample when that backend is not reachable.

Both views also work on mock data that matches the contract. Mock data is labeled as mock on screen.

## 5. Results

Measured numbers only, from the results and data files in the repo.

### 5.1 Defect model, test split (`ml/defect/results.md`)

628 patches from 135 source photos. Threshold 0.5. Best epoch chosen on validation macro-F1 of 0.829.

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| crack | 0.843 | 0.860 | 0.851 | 150 |
| spallation | 0.751 | 0.907 | 0.822 | 150 |
| exposed_bars | 0.932 | 0.913 | 0.923 | 150 |
| efflorescence | 0.846 | 0.812 | 0.829 | 149 |
| corrosion_stain | 0.739 | 0.867 | 0.798 | 150 |
| macro average | 0.822 | 0.872 | 0.844 | 749 |

### 5.2 Trigger model, KW51 (`ml/trigger/results.md`)

- Compensation model: slope -0.001, intercept 2.934, R-squared 0.409.
- Healthy-period false alarms: 129 with a naive threshold, 67 with temperature correction.
- After-period detections (compensation model): 2546.

An R-squared of 0.409 means temperature explains part, but not all, of the variation in frequency. The drop from 129 to 67 false alarms is the benefit of temperature correction during a period known to be healthy. The 2546 after-period detections are readings flagged after the documented retrofit, which changed the bridge's behavior.

Observation on the demo window (`data/trigger/replay_kw51_demo.json`, June 22 to 29, 2019): all 165 readings sit above the healthy-period temperature model line, and the single alarm falls inside KW51's retrofit period (May 15 to September 27, 2019, as defined in `ml/trigger/trigger_model.py`). The detected change is consistent with the retrofit. It is not evidence of damage.

### 5.3 Inspection route on KW51

All four routes cover the same 34 connection locations, use the same straight-line 3D distance, and start from the same assumed launch point. Nothing was tuned to make the planner win.

| Route | Definition | Length |
|---|---|---|
| x-order lawnmower | side A ascending x, then side C descending x | 533.2 m |
| per-level manual sweep (naive plan) | finish each side and level before changing height | 405.9 m |
| nearest-neighbor | greedy nearest neighbor from the launch point | 408.9 m |
| nearest-neighbor + 2-opt (optimized plan) | nearest neighbor, then 2-opt improvement | 399.8 m |

The two plan lengths are in `data/plans/kw51_naive.json` and `data/plans/kw51_optimized.json`. The other two are computed by the same planner functions and recorded in `.kiro/specs/kw51-real-inspection-map/design.md`.

On KW51 a sensible manual sweep is within about 1.5% of the planned route: the 2-opt route is 6.2 m shorter than the per-level sweep and 9.1 m shorter than plain nearest neighbor. The large 533.2 m figure comes only from the x-order lawnmower climbing between deck and arch at almost every stop. It is not a real planning saving.

## 6. Datasets and citations

- KW51 railway bridge monitoring data. Maes, K. and Lombaert, G. (2021), "Monitoring railway bridge KW51 before, during, and after retrofitting," Journal of Bridge Engineering, 26(3). Dataset: Zenodo record 3745914 (https://zenodo.org/record/3745914). Only the tracked-modes file is used.
- KW51 finite element model. Maes, K., van de Velde, M., and Lombaert, G., KU Leuven, Department of Civil Engineering, Structural Mechanics Section. DOI: https://doi.org/10.5281/zenodo.17366772. License: CC BY-NC-SA 4.0 (non-commercial, share-alike). The model uses the Stabil toolbox, which its readme asks users to cite. The derived geometry and plans in this repo carry the same license; see `data/structures/README.md`.
- CODEBRIM concrete defect imagery. Mundt, Majumder, Murali, Panetsos, Ramesh, "Meta-learning Convolutional Neural Architectures for Multi-target Concrete Defect Classification with the COncrete DEfect BRidge IMage Dataset," CVPR 2019. Non-commercial research use; see `license.md`.
- FHWA National Bridge Inventory 2022, Massachusetts, used for the motivation figures in section 1.

CODEBRIM images and the original KW51 model files are not redistributed in this repository. You download them yourself and keep them local.

## 7. Data provenance

Real data:

- KW51 replay (`data/trigger/replay_kw51.json` and `replay_kw51_demo.json`): derived from the real KW51 monitoring data. The dashboard replays recorded 2019 times, not live readings.
- CODEBRIM test images: real bridge photos, used locally, never committed. The defect model's results come from this test split.
- NBI figures in section 1: from the 2022 National Bridge Inventory.

Derived from real data:

- KW51 geometry (`data/structures/kw51_layout.json`): extracted from the KU Leuven model by `tools/kw51_geometry/extract_layout.py`. Only the node, element, and sensor positions are reproduced, not the finite element analysis.
- KW51 plans (`data/plans/`): computed by the planner from that geometry.
- Defect findings on the inspection map: real model output on CODEBRIM held-out images placed at 4 of the 34 connections (`data/image_map.json`). The placements are chosen for the demo; they are not detections.

Synthetic or mock data:

- Firmware test logs and sample records (`firmware_esp32/node_log.txt`, `sample_records.json`): generated by the simulated node.
- Mock defect responses: deterministic fake scores the API returns in mock mode.
- Dashboard mocks (`web/src/mocks/`): a KW51-shaped sample structure and plans, sample findings, and a 12-reading sample replay (`replay_z24.json`), used when real data is missing and labeled as mock.
- Simulated sensor node: the ESP32 and its sensors run in Wokwi, not on hardware.
- The launch point for both plans is assumed, since there is no real robot.

Thresholds are set relative to each source's healthy noise, and both are demonstration values rather than engineering limits. KW51's healthy variation is about 0.2 to 0.3%, so the trigger model alerts at 0.75 / 1.5 / 2.0 percent. The simulated node is noisier, about 1%, so its firmware alerts at 2 / 5 / 8 percent.

## 8. How to run it

A short end-to-end checklist is in [`docs/demo-run.md`](docs/demo-run.md). The steps below match the code.

Prerequisites: Python 3, Node.js and npm. The datasets are not in the repo; you fetch them yourself.

1. Python setup. Each Python component has its own dependencies.
   - Trigger: `pip install -r ml/trigger/requirements.txt`
   - Defect API: `pip install fastapi "uvicorn[standard]" pillow torch torchvision numpy python-multipart` (there is no `ml/defect/requirements.txt` yet).
   - Report backend (optional): `pip install -r api/requirements.txt`
2. Get the datasets and place them.
   - KW51 monitoring data: download the tracked-modes file from Zenodo 3745914 to `ml/trigger/raw/trackedmodes.mat`.
   - CODEBRIM: download into `datasets/codebrim/`. `python ml/defect/demo/build_demo_pool.py` builds the held-out demo pool, and `python ml/defect/demo/assign_to_kw51.py` writes `data/image_map.json` and selects which patches to copy into `data/images/`. Both locations are kept out of git.
   - KW51 finite element model (only needed to regenerate the geometry): keep it in `data/external/kw51_fem/`, which is gitignored.
3. Run the trigger model: `python ml/trigger/trigger_model.py`. This writes `data/trigger/replay_kw51.json`, `replay_kw51_demo.json`, and the plots under `ml/trigger/plots/`.
4. The KW51 plans are committed. To regenerate them: `python firmware_esp32/planner.py --kw51-plans --layout data/structures/kw51_layout.json --out-dir data/plans`.
5. Start the defect API from `ml/defect/` on port 8001. It loads `artifacts/best.pt` by default (about 43 MB, committed).
   - Real model: `uvicorn api.main:app --port 8001`
   - Mock mode, no model needed (bash): `MOCK_MODEL=1 uvicorn api.main:app --port 8001`
   - Mock mode, no model needed (PowerShell): `$env:MOCK_MODEL="1"; uvicorn api.main:app --port 8001`
6. Optional report backend: from `api/`, copy `.env.example` to `.env`, set `GEMINI_API_KEY`, then `uvicorn main:app --port 8000`.
7. Start the dashboard from `web/`: `npm install`, then `npm run dev`. A pre-step copies `data/` into `web/public/data/`, and Vite serves the app at http://localhost:5173/. Restart the dev server after any change under `data/`.
8. Wokwi simulation of the sensor node: https://wokwi.com/projects/478798310961586177

There is no hosted demo. Run it locally using the steps above.

## 9. Testing

- Dashboard: from `web/`, `npm run build` and `npm test`. 108 tests run against the mocks and the committed KW51 geometry, plans, and replay; none need the image datasets. This is the main test suite.
- Planner: from `firmware_esp32/`, `python -m unittest test_planner_kw51` (11 tests).
- Trigger model: `python -m pytest ml/trigger/tests` (3 tests).
- Defect tier rule: `python -m pytest ml/defect/tests/test_tier.py` (14 tests, no model or dataset needed).
- Defect API: `python -m pytest ml/defect/tests/test_api.py` (8 tests). These need `torch`, `fastapi`, and `pillow` installed to collect, since the API module imports the model stack at load time.
- Defect demo pool: `python -m pytest ml/defect/demo` (8 tests).

Without the datasets you can still see the system work: start the defect API in mock mode and run the dashboard. It replays the real KW51 demo window and shows the real KW51 map and plans, with mock findings where images are missing. The dashboard labels what is real and what is mock.

## 10. Limitations

- The whole system runs in simulation. There is no physical node or drone, and the sensor node runs in Wokwi.
- KW51 is a European steel railway bridge measured with professional accelerometers. The ESP32's MPU6050 is much noisier, so the trigger work demonstrates the method, not a calibration for Massachusetts bridges.
- The trigger detects a change in natural frequency in either direction, but it does not localize it. A Warning or Alarm says something changed, not where, so the inspection visits all 34 connections. Localizing a change would need distributed sensors.
- The temperature correction is a linear fit with R-squared 0.409. It underfits below freezing, where the bridge stiffens, so most remaining false alarms come from one cold spell.
- The June 2019 demo window falls inside KW51's retrofit period, so the alarm there reflects the retrofit, not damage. The demo shows the method, not a diagnosis.
- The defect model is trained on one dataset of concrete imagery, sees cropped patches rather than full photos, and has to learn from patches that often show several defects at once. KW51 is a steel bridge, so the defect images are placed at its connections for demonstration only.
- Only 4 of the 34 connections have an image. The rest are neither assessed nor cleared.
- Route length is a straight-line 3D estimate that ignores obstacles such as the deck and bracing. The launch point is assumed.
- Alert thresholds and urgency tiers are demonstration values, not engineering limits. The system helps prioritize; it never states that a bridge is safe or unsafe.
- The trained weights (`ml/defect/artifacts/best.pt`, about 43 MB) are shared for non-commercial use under the CODEBRIM license. They are derived weights and contain no images.

## 11. Future work

- Damage simulation: introduce progressive stiffness loss at individual connections in the KU Leuven model and test whether the trigger detects it against real healthy KW51 data, reporting false alarms alongside detections.
- Distributed sensors: use several nodes or mode shapes to localize a change to a region of the bridge.
- Gazebo: obstacle-aware path planning that accounts for the deck and bracing.
- Grad-CAM for the defect model, to show which part of an image drove each score (see `docs/gradcam-notes.md`).
- A steel defect model, since CODEBRIM covers concrete and KW51 is steel.

## 12. How we used Kiro

This section describes the hackathon build. We ran it as spec-driven development with a shared contract, then used short conversational edits for small follow-ups.

Specs. `.kiro/specs/` holds one spec per component, each structured as requirements, then design, then tasks, reviewed stage by stage:

- `dashboard`: the monitor, inspection view, findings, report, and the real-vs-mock data layer.
- `trigger-model`: the KW51 compensation model, thresholds, replay outputs, and plots.
- `defect-model`: the CODEBRIM classifier, tier rule, and API.

Working from a written spec caught things a quick prompt would have missed. The trigger spec recorded the threshold disagreement with the contract as an explicit open decision (Requirement 15) instead of silently picking a number, which is how the team later reconciled on 0.75 / 1.5 / 2.0. For small changes, like relabeling the monitor subtitle or adding a link, we edited directly without a spec.

Steering. `.kiro/steering/` held `product.md`, `tech.md`, and `structure.md`. These kept the agent following the shared data contract, reporting only measured numbers, and editing only the owner's folder for each change.

Hooks. `.kiro/hooks/defect-api-tests.json` is a PostFileSave hook that runs the defect API tests in mock mode when a file under `ml/defect/api/` is saved.

Concrete things it did on this build:

- Paused and asked instead of inventing data shapes when the contract file was missing at the start.
- Caught its own bug when an edit to the inspection view did not reach disk, and fixed it rather than continuing.
- Flagged that the LLM API key would ship in the frontend bundle, which moved the call to a server-side backend that reads the key from a non-public environment variable.
- Found a Windows path bug in the data-copy script that would have copied licensed CODEBRIM images into a public build, and fixed the skip.
- Added a content-type check so the Vite dev server's HTML fallback for a missing file is treated as a missing file, not as real data.
- Refused to merge teammate branches whole when they carried stale copies that would have reverted current dashboard work, and brought in only the intended files instead.
- Scanned every integration merge for secrets, images, and oversized files before committing.

Later work. The post-hackathon KW51 work (section 3.2) used both Kiro and Claude Code. It added a new spec, `.kiro/specs/kw51-real-inspection-map/`, and a design-token steering file, `.kiro/steering/design.md`.

## 13. Team

- Suhail: product lead, dashboard, report, integration, and the post-hackathon KW51 work.
- Varun: sensor node and planner.
- Zaiba: defect model.
- Komal: trigger model.
