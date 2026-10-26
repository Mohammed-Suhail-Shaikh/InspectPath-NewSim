# InspectPath

Continuous bridge monitoring that dispatches a targeted AI inspection and returns a ranked list of what to look at first. Track: Robotics & Hardware. Built for Hackachusetts 2026. Everything runs in simulation on real public datasets; there is no physical sensor node or drone.

## 1. The problem and who benefits

Many bridges are rated poor yet are inspected only about every two years, so damage can develop between visits. When an inspection does happen, it produces more imagery than an engineer can review carefully, and the defects that matter most can be buried in the volume.

The people who benefit are the inspectors and bridge engineers who have to decide, with limited time, which structures to visit and where to look once they get there.

From Varun's analysis of the 2022 National Bridge Inventory for Massachusetts, counting each bridge by its lowest condition rating: 435 bridges are rated poor or worse, and 179 or more of those cross a river or brook, where scour is a risk. The poor bridges have a median build year of 1954, and 293 of the 435 are steel. These numbers are the motivation for continuous monitoring between inspections.

## 2. What it does

InspectPath connects monitoring to inspection in one flow:

1. Monitor: a sensor node streams structural and environmental readings.
2. Trigger: a model compares natural frequency against a temperature-corrected baseline and raises Watch, Warning, or Alarm.
3. Dispatch: a Warning or Alarm starts an inspection that prioritizes the zone near the alert.
4. Inspect: the route captures images, and a defect model classifies each image and assigns an urgency tier.
5. Ranked report: the dashboard and a plain-language report give one prioritized list of what to inspect first.

## 3. How it works

### Sensor node (Varun)

A low-cost ESP32 node, simulated in Wokwi, that measures the four failure-relevant quantities and reports whether the structure behaves as it did at install. Sensors:

- MPU6050 (accelerometer and gyroscope): vibration for natural frequency, and tilt for pier settlement.
- DHT22: air temperature and humidity. Temperature corrects the frequency and ultrasonic readings.
- HC-SR04: ultrasonic distance to the water surface, for water level and scour risk.
- HX711 with a strain gauge: beam strain under traffic. A load cell stands in under simulation.

The node runs on-device data-quality checks on every reading (range, stuck value, rate of change, dropout, timing jitter, and a temperature cross-check). A window with more than 5% flagged samples is excluded, and the node is reported as degraded rather than the bridge being called unsafe. It raises graded alerts (Normal, Watch, Warning, Alarm) and combines parameters, so a frequency drop with rising strain and new tilt is treated differently from a frequency drop during a heat wave. The firmware's own residual thresholds are 2 / 5 / 8 percent because its simulated MPU6050 is noisier than the professional sensors behind the KW51 data; this is intentional, see section 6. Full detail is in [`docs/hardware-spec.md`](docs/hardware-spec.md). Live simulation: [Varun's ESP32 sensor node simulation in Wokwi](https://wokwi.com/projects/478798310961586177).

<img width="1152" height="971" alt="ESP32 sensor node circuit" src="https://github.com/user-attachments/assets/4afccc9e-e074-431f-b674-a60b70e9584a" />

### Trigger model on KW51 (Komal)

The trigger model decides when the node should raise an alert. A bridge's natural frequency drops when it loses stiffness, but temperature also shifts frequency, often by more than damage does, so a naive threshold raises a false alarm with every cold snap. The model learns how frequency depends on temperature during a healthy period, then flags readings that do not fit.

It fits a linear baseline of mode-6 natural frequency against steel temperature on the healthy period (before May 15, 2019). For each reading it computes the residual, the percent difference between measured and predicted frequency, and assigns an alert level on the absolute residual: 0.75% watch, 1.5% warning, 2.0% alarm. It exports the result as replay data the dashboard plays back as if it were live. Code is in `ml/trigger/`, replay data in `data/trigger/`. Run it with `python ml/trigger/trigger_model.py`.

### Defect model on CODEBRIM (Zaiba)

The defect model looks at a concrete patch and says which of five defects are present: crack, spallation, exposed bars, efflorescence, corrosion stain. A rule turns that into an urgency tier.

It is a pretrained ResNet-18 with five independent sigmoid outputs, since one patch can show several defects at once. Rare classes get a higher loss weight. Thin patches are padded to square and resized. The data is split by source photo, so test photos are never seen in training; the best epoch is chosen on validation, and the test set is used once. It serves `POST /predict` (an image file or base64) and returns per-class scores, the detected classes (score at or above the threshold of 0.5), and a tier. The tier rule, a team decision rather than an engineering standard: high if exposed_bars or spallation, else medium if corrosion_stain, else low if crack or efflorescence, else none. High and medium tiers trigger a close-up re-inspection.

### Planner (Varun)

The planner turns an alert into an inspection route. On a Warning it inspects only the zone near the node that raised the alert; on an Alarm it does that zone first, then sweeps the rest of the bridge. It reads a bridge layout (`firmware_esp32/bridge_layout.json`), orders waypoints by nearest-neighbor from the alert, calls the defect model for each captured image (real API or a repeatable mock), and writes a dispatch-plus-findings report (`firmware_esp32/output/inspection_report.json`). Code is in `firmware_esp32/planner.py`.

Note on integration: the planner uses a real-world metric layout (positions in meters, named waypoints). The dashboard was built to the grid-based structure and plan shapes in `docs/contract.md` sections 3 and 4. These two do not match yet (see section 10), so in the current build the dashboard shows a sample bridge layout rather than the planner's output.

### Dashboard and report (Suhail)

A React and Vite app in `web/` that replays the monitor data, shows the current alert level and a residual chart with the threshold lines, and raises a banner with a manual Dispatch button on Warning or Alarm. The inspection view draws the structure, animates the route, shades coverage, shows coverage and battery stats, and pins defect findings colored by tier; clicking a pin shows the image, the per-class scores, and a close-up when one exists. The report is a deterministic, rule-based summary built only from the findings, plan stats, and alert history, so it never invents numbers. An optional LLM "AI summary" appears only when its backend is reachable, and falls back to a sample if not. Every screen works on mock data that matches the contract, so the dashboard runs before real data is connected.

## 4. Results

Measured numbers only, from the results files in the repo.

### Defect model, test split (`ml/defect/results.md`)

628 patches from 135 source photos. Threshold 0.5. Best epoch chosen on validation macro-F1 of 0.829.

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| crack | 0.843 | 0.860 | 0.851 | 150 |
| spallation | 0.751 | 0.907 | 0.822 | 150 |
| exposed_bars | 0.932 | 0.913 | 0.923 | 150 |
| efflorescence | 0.846 | 0.812 | 0.829 | 149 |
| corrosion_stain | 0.739 | 0.867 | 0.798 | 150 |
| macro average | 0.822 | 0.872 | 0.844 | 749 |

### Trigger model, KW51 (`ml/trigger/results.md`)

- Compensation model: slope -0.001, intercept 2.934, R-squared 0.409.
- Healthy-period false alarms: 129 with a naive threshold, 67 with temperature correction.
- After-period detections (compensation model): 2546.

The R-squared of 0.409 means temperature explains part, but not all, of the variation in frequency, so a residual remains to alert on. The false-alarm drop from 129 to 67 is the benefit of temperature correction over a naive threshold during a period known to be healthy. The 2546 after-period detections are readings flagged above normal after the documented retrofit, which changed the bridge's behavior.

## 5. Datasets and citations

- KW51 railway bridge monitoring data. Maes, K. and Lombaert, G. (2021), "Monitoring railway bridge KW51 before, during, and after retrofitting," Journal of Bridge Engineering, 26(3). Dataset: Zenodo record 3745914 (https://zenodo.org/record/3745914). Only the tracked-modes file is used.
- CODEBRIM concrete defect imagery. Mundt, Majumder, Murali, Panetsos, Ramesh, "Meta-learning Convolutional Neural Architectures for Multi-target Concrete Defect Classification with the COncrete DEfect BRidge IMage Dataset," CVPR 2019. Non-commercial research use; see `license.md`.
- FHWA National Bridge Inventory 2022, Massachusetts, used for the motivation figures in section 1.

CODEBRIM images are not redistributed in this repository. Its license forbids redistribution, so you download the dataset yourself and keep it local.

## 6. Data provenance

Real data:

- KW51 replay (`data/trigger/replay_kw51.json` and `replay_kw51_demo.json`): derived from the real KW51 monitoring dataset. The dashboard replays recorded 2019 times, not live readings.
- CODEBRIM test images: real bridge photos, used locally, never committed. The defect model's measured results come from this test split.
- NBI figures in section 1: real, from the 2022 National Bridge Inventory.

Synthetic or mock data:

- Firmware test logs and sample records (`firmware_esp32/node_log.txt`, `sample_records.json`): generated by the simulated node.
- Mock defect responses: deterministic fake scores the API returns in mock mode, and the dashboard's mock findings, used when the real model or images are not present.
- Simulated sensor node: the ESP32 and its sensors run in Wokwi, not on hardware.
- Sample bridge layout in the dashboard: a representative grid, since the planner's real layout is not yet wired to the dashboard.

Thresholds are set relative to each source's healthy noise, and both are demonstration values rather than engineering limits. KW51's healthy variation is about 0.2 to 0.3%, so the trigger model alerts at 0.75 / 1.5 / 2.0 percent. The simulated node is noisier, about 1%, so its firmware alerts at 2 / 5 / 8 percent. They differ on purpose because the two sources have different noise floors.

## 7. How to run it

A short end-to-end checklist is in [`docs/demo-run.md`](docs/demo-run.md). The steps below match the code.

Prerequisites: Python 3, Node.js and npm. The datasets are not in the repo; you fetch them yourself.

1. Python setup. Each Python component has its own dependencies.
   - Trigger: `pip install -r ml/trigger/requirements.txt`
   - Defect API: `pip install fastapi "uvicorn[standard]" pillow torch torchvision numpy` (there is no `ml/defect/requirements.txt` yet).
   - Report backend (optional): `pip install -r api/requirements.txt`
2. Get the datasets and place them.
   - KW51: download the tracked-modes file from Zenodo 3745914 to `ml/trigger/raw/trackedmodes.mat`.
   - CODEBRIM: download into `datasets/codebrim/`, then place the demo crops under `data/images/` so the dashboard can serve them. `python ml/defect/demo/build_demo_pool.py` builds the held-out demo pool, and `python ml/defect/demo/assign_to_kw51.py` writes `data/image_map.json` and selects which held-out patches to copy into `data/images/`. Both dataset locations are kept out of git. Defect scores are real model output on CODEBRIM held-out images placed at chosen connections for the demo; the placements are not detections, and only a few of the 34 connections are imaged.
3. Run the trigger model: `python ml/trigger/trigger_model.py`. This writes `data/trigger/replay_kw51.json` and `replay_kw51_demo.json` and the plots under `ml/trigger/plots/`.
   - The KW51 inspection plans are committed (`data/plans/kw51_naive.json` and `data/plans/kw51_optimized.json`). To regenerate them from the real geometry: `python firmware_esp32/planner.py --kw51-plans --layout data/structures/kw51_layout.json --out-dir data/plans`. The planner is the only thing that writes plans; the dashboard reads them. Naive is a per-level manual sweep (405.9 m); optimized is nearest-neighbor + 2-opt (399.8 m), a good short route, not guaranteed shortest.
4. Start the defect API from `ml/defect/`. The dashboard expects it on port 8001.
   - Real model (bash): `MODEL_PATH=artifacts/best.pt uvicorn api.main:app --port 8001`
   - Real model (PowerShell): `$env:MODEL_PATH="artifacts/best.pt"; uvicorn api.main:app --port 8001`
   - Mock mode, no model needed (bash): `MOCK_MODEL=1 uvicorn api.main:app --port 8001`
   - Mock mode, no model needed (PowerShell): `$env:MOCK_MODEL="1"; uvicorn api.main:app --port 8001`
   - `best.pt` (about 43 MB) is committed; mock mode needs no datasets.
5. Start the dashboard from `web/`: `npm install`, then `npm run dev`. A pre-step copies `data/` into `web/public/data/`, and Vite serves the app at the printed URL (default http://localhost:5173/).
6. Wokwi simulation of the sensor node: https://wokwi.com/projects/478798310961586177

The optional report backend runs from `api/` with `uvicorn main:app --port 8000` after you copy `.env.example` to `.env` and set `GEMINI_API_KEY`.

## 8. Testing

- Dashboard: from `web/`, `npm run build` and `npm test`. 74 tests run against the sample and the committed real KW51 geometry/plans; none need the image datasets. This is the main test suite.
- Defect tier rule: `python -m pytest ml/defect/tests/test_tier.py` (14 tests, no model or dataset needed). The 8 API tests in `ml/defect/tests/test_api.py` also need `torch`, `fastapi`, and `pillow` installed to collect, since the API module imports the model stack at load time.

A judge without the datasets can still see the system work: start the defect API in mock mode and run the dashboard, which falls back to mock structure, plan, and findings while replaying the real KW51 demo window. The monitor labels whether it is showing real or sample data, so what is real stays clear.

There is no hosted demo. Run it locally using the steps above.

## 9. How we used Kiro

We ran this as spec-driven development with a shared contract, then used short conversational edits for small follow-ups.

Specs. `.kiro/specs/` holds one spec per component, each structured as requirements, then design, then tasks, reviewed stage by stage:

- `dashboard`: the monitor, inspection view, findings, report, and the real-vs-mock data layer.
- `trigger-model`: the KW51 compensation model, thresholds, replay outputs, and plots.
- `defect-model`: the CODEBRIM classifier, tier rule, and API.

Working from a written spec caught things a quick prompt would have missed. The trigger spec recorded the threshold disagreement with the contract as an explicit open decision (Requirement 15) instead of silently picking a number, which is how the team later reconciled on 0.75 / 1.5 / 2.0. For small changes, like relabeling the monitor subtitle or adding a link, we edited directly without a spec.

Steering. `.kiro/steering/` holds `product.md`, `tech.md`, and `structure.md`. These kept the agent following the shared data contract, reporting only measured numbers, and editing only the owner's folder for each change instead of reaching into another person's component.

Hooks. `.kiro/hooks/defect-api-tests.json` is a PostFileSave hook that runs the defect API tests in mock mode when a file under `ml/defect/api/` is saved, so a change to the API is checked against its tests right away without a model or dataset.

Concrete things it did on this build:

- Paused and asked instead of inventing data shapes when the contract file was missing at the start.
- Caught its own bug when an edit to the inspection view did not reach disk, and fixed it rather than continuing.
- Flagged that the LLM API key would ship in the frontend bundle, which moved the call to a server-side backend that reads the key from a non-public environment variable.
- Found a Windows path bug in the data-copy script that would have copied licensed CODEBRIM images into a public build, and fixed the skip.
- Added a content-type check so the Vite dev server's HTML fallback for a missing file is treated as a missing file, not as real data.
- Refused to merge teammate branches whole when they carried stale copies that would have reverted current dashboard work, and brought in only the intended files instead.
- Scanned every integration merge for secrets, images, and oversized files before committing.

## 10. Limitations

- The whole system runs in simulation. There is no physical node or drone, and the sensor node runs in Wokwi.
- KW51 is a European steel railway bridge measured with professional accelerometers; the ESP32's MPU6050 is much noisier. The trigger work demonstrates the method, not a calibration for Massachusetts bridges.
- A linear temperature baseline underfits below freezing, where the bridge stiffens, so most remaining false alarms come from one cold spell.
- The defect model is trained on one dataset, sees cropped patches rather than full photos, and has to learn from patches that often show several defects at once.
- Alert thresholds and urgency tiers are demonstration values, not engineering limits. The system helps prioritize; it never states that a bridge is safe or unsafe.
- The planner's metric layout and the dashboard's grid contract do not match yet, so the dashboard runs on a sample layout rather than the planner's output.
- The trained weights (`ml/defect/artifacts/best.pt`, about 43 MB) are shared for non-commercial use under the CODEBRIM license; they are derived weights and contain no images.

## 11. Team

- Suhail: product lead, dashboard, report, integration.
- Varun: sensor node and planner.
- Zaiba: defect model.
- Komal: trigger model.

## 12. Video

TODO: YouTube or Vimeo video link.
