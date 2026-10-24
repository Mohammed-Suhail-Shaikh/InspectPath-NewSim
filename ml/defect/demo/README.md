# Demo patches

Patches come from the CODEBRIM test split only and were chosen by TRUE label (not model output). Paths are relative to the CODEBRIM folder; no images are committed.
`pool_check.md` lists every miss (low_01, low_03, high_03_closeup); none were swapped out of the pool.
`low_01` is left out of the demo map (`--exclude low_01`): the model over-triaged a crack as high.
`image_map.provisional.json` is built from the mock plan. Regenerate it with `assign_to_plan.py` when the real plan lands.
Real model accuracy is in `ml/defect/results.md`. The demo pool is hand-picked, so it is not a measure of accuracy.
