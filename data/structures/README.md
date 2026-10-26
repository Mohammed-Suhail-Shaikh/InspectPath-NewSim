# Structures

## kw51_layout.json

Geometry of railway bridge KW51 (Leuven, Belgium), derived from the KU Leuven
finite element model.

- Source: Finite element model of railway bridge KW51, by K. Maes,
  M. van de Velde, and G. Lombaert, KU Leuven, Department of Civil Engineering,
  Structural Mechanics Section.
- DOI: https://doi.org/10.5281/zenodo.17366772
- License: CC BY-NC-SA 4.0. This derived file carries the same license and must
  credit the source. Non-commercial use only; share-alike.

This file is **derived geometry, not the original model**. It was produced by
`tools/kw51_geometry/extract_layout.py`, a Python port of only the node,
element, and sensor-position construction in `model_kw51.m` and
`select_sensors.m`. No finite element analysis (stiffness, mass, solvers) is
reproduced. Units are metres.

The original model files are kept locally under `data/external/kw51_fem/`
(gitignored, not redistributed). If you use this geometry, cite the KU Leuven
model and the Stabil toolbox as requested in the model's readme.

## Verified against overview.pdf

The extracted geometry was compared by eye against `overview.pdf` (side and plan
views) and matches. Recorded cross-checks (see `cross_checks` in the JSON):

- Track-to-side mapping (from the plan view): Track B runs along side A (South,
  y=0), Track A along side C (North, y=11.750). So `diags_box` codes 10xx/20xx =
  side A, 30xx/40xx = side C.
- Diagonal numbering: diagonal 1 is at the Leuven end (high x, ~105 m) and 16 at
  the Brussels end (low x, ~11 m), matching overview.pdf.
- Bearing span 114.198 m matches the drawing label "Overspanning 11419.8 cm".
- Arch crown ~19.5 m (arch centerline) vs 19.63 m on the drawing
  (44.728 - 25.094); small offset expected because the model uses the arch
  neutral axis.
