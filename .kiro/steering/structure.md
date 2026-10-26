# Repo structure and ownership

Suhail owns all folders. InspectPath is now a single-maintainer project; the
earlier per-folder ownership split and the planner/dashboard code freeze no
longer apply. The historical owners below are kept for provenance only.

| Path | Historical author |
|---|---|
| web/ (dashboard, report) | Suhail |
| api/ (report backend) | Suhail |
| web/src/planner/ | Varun |
| web/src/mocks/ | Suhail |
| ml/defect/ | Zaiba |
| ml/trigger/ | Komal |
| data/ | Komal (structures/ by Varun) |
| embedded/ (Wokwi firmware) | Varun |
| firmware_esp32/ (ESP32 firmware + planner) | Varun |
| docs/, README.md, .kiro/ | Suhail |

Rules:
- Dataset files live in local folders (datasets/, data/external/, data/images/)
  that are listed in .gitignore.
- Pull before you start, then commit and push regularly.
