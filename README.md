# InspectPath

Continuous bridge monitoring plus targeted AI inspection, built as a one-day
hackathon project (Hackachusetts 2026, Robotics track). Everything runs in
simulation on real public datasets; there is no physical sensor node or drone.

## 1. The problem

Many bridges are rated poor yet are inspected only about every two years, so
damage can develop and worsen between visits. When an inspection does happen, it
produces far more imagery than anyone can review carefully, and the most
important defects can be lost in the volume.

## 2. What InspectPath does

InspectPath links continuous monitoring to a focused inspection:

1. **Monitor** — a sensor node streams structural and environmental readings.
2. **Trigger** — a model compares natural frequency against a
   temperature-corrected baseline and raises Watch, Warning, or Alarm.
3. **Dispatch** — a Warning or Alarm prompts an inspection, prioritizing the
   zone near the alert.
4. **Inspect** — an inspection route captures images; a defect model classifies
   each image and assigns an urgency tier.
5. **Ranked report** — the dashboard and a plain-language report give one
   prioritized list of what to look at first.

## 3. How it works

### Sensor node (Varun)
A low-cost node that measures vibration, tilt, strain, water level, and
temperature. In this project the node is simulated, not deployed. Detailed
firmware/hardware spec: TBD (not in this repo).

### Trigger model on KW51 (Komal)
Fits a linear model of mode-6 natural frequency against steel temperature on a
known-healthy period, then alerts on the temperature-corrected residual.
Produces replay JSON (`data/trigger/replay_kw51.json` and a short demo window)
that the dashboard plays back as if live.

### Defect model on CODEBRIM (Zaiba)
A ResNet-18 with five sigmoid outputs (crack, spallation, exposed bars,
efflorescence, corrosion stain). Serves `POST /predict` (image file or base64)
and returns per-class scores, detected classes, and an urgency tier. The tier
rule (high if exposed_bars or spallation; medium if corrosion_stain; low for
crack/efflorescence) is a team decision, not an engineering standard.

### Dashboard and rule-based report (Suhail)
A React + Vite app (`web/`) that replays the monitor data, shows the alert
level, dispatches the inspection view (grid map, animated route, coverage and
battery stats), pins defect findings by tier, and generates a deterministic,
rule-based inspection report from the findings, plan stats, and alert history.
An optional LLM "AI summary" is available only when its backend is reachable.

## 4. Results

Numbers below are copied from the measured results files in the repo.

### Defect model — test split (`ml/defect/results.md`)
628 patches from 135 source photos. Threshold 0.5. Epoch chosen on validation
macro-F1 (0.829).

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| crack | 0.843 | 0.860 | 0.851 | 150 |
| spallation | 0.751 | 0.907 | 0.822 | 150 |
| exposed_bars | 0.932 | 0.913 | 0.923 | 150 |
| efflorescence | 0.846 | 0.812 | 0.829 | 149 |
| corrosion_stain | 0.739 | 0.867 | 0.798 | 150 |
| **macro average** | 0.822 | 0.872 | **0.844** | 749 |

### Trigger model — KW51 (`ml/trigger/results.md`)
- Compensation model: slope -0.001, intercept 2.934, R-squared 0.409.
- Healthy-period false alarms: naive baseline 129, compensation model 67.
- After-period detections (compensation model): 2546.

Note: the trigger model uses alert thresholds of 0.75 / 1.5 / 2.0 on absolute
residual, which differ from the shared contract's 2.0 / 5.0 / 8.0. This is
recorded as an open decision in `ml/trigger/results.md`; the contract is
unchanged pending team agreement.

## 5. How we used Kiro

- **Contract and steering first.** We wrote `docs/contract.md` (the shared data
  shapes) and `.kiro/steering/` (product, tech, structure) before building, so
  components agreed on interfaces up front.
- **One spec per component, reviewed stage by stage.** Each component has a spec
  under `.kiro/specs/` (requirements → design → tasks) that we reviewed at each
  stage rather than all at once.
- **Kiro paused instead of inventing schemas.** When the contract was missing at
  the start, Kiro stopped and asked rather than guessing data shapes.
- **It caught its own bug.** During dashboard task 11, a wiring change to the
  inspection view didn't reach disk; Kiro detected the gap and fixed it instead
  of moving on.
- **It flagged risks.** Kiro raised the frontend API-key exposure (leading to a
  server-side report backend) and folder-ownership boundaries from the steering
  rules.
- **It caught a Windows path bug** in the data-copy script that would have leaked
  licensed CODEBRIM images into a public build, and fixed the licensing skip.
- **Content-type checks** were added so the Vite dev-server HTML fallback for a
  missing file is treated as "file missing" rather than real data.
- **Deterministic report.** The default inspection report is rule-based and built
  only from measured values, to avoid hallucinated numbers in a safety-adjacent
  report.

## 6. Team and roles

| Area | Owner |
|---|---|
| Dashboard, report, docs, `.kiro/` | Suhail |
| Sensor node / firmware | Varun |
| Planner (`web/src/planner/`), structures | Varun |
| Trigger model (`ml/trigger/`, `data/trigger/`) | Komal |
| Defect model (`ml/defect/`) | Zaiba |

## 7. Limitations

- Simulation only: no physical sensor node or drone.
- The sensor simulation uses synthetic fault data.
- Alert thresholds and urgency tiers are demonstration values, not engineering
  limits. The system helps prioritize; it never states a bridge is safe or
  unsafe.
- KW51 and CODEBRIM are European bridges; results may not transfer to others.
- MPU6050-class sensors carry noise that a real deployment would have to handle.
- Trained model weights (`ml/defect/artifacts/best.pt`, ~43 MB) are included for
  non-commercial use under the CODEBRIM license (derived weights, no images).

## 8. How to run

See **[docs/demo-run.md](docs/demo-run.md)** for the full step-by-step checklist
(images, defect API on 8001, optional report API on 8000, dashboard, and how to
confirm real vs mock in the UI).

## 9. Data and citations

- **CODEBRIM** — Mundt, Majumder, Murali, Panetsos, Ramesh, "Meta-learning
  Convolutional Neural Architectures for Multi-target Concrete Defect
  Classification with the COncrete DEfect BRidge IMage Dataset," CVPR 2019.
  Non-commercial research use; see `license.md`.
- **KW51** — Maes and Lombaert, monitoring of the KW51 railway bridge,
  *Journal of Bridge Engineering*.

No dataset images are included in this repository. CODEBRIM images must be
obtained separately and placed locally (`data/images/`, which is gitignored);
the license forbids redistribution.
