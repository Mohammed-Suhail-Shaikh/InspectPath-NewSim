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
