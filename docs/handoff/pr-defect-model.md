**Title:** Defect model: 5-class CODEBRIM classifier + /predict API
## What
ResNet-18 multi-label classifier (5 sigmoid outputs), a pure tier function, and a FastAPI `/predict` with mock mode (`MOCK_MODEL=1`).

## Results
Macro-F1 0.844 on the held-out test split (628 patches). Reported as measured, see `ml/defect/results.md`.

## Response shape
`{"scores": {...5 classes...}, "detected": [...], "tier": "...", "threshold": 0.5}`

## Needed from reviewer
- (a) Update the data-contract steering file to this shape.
- (b) Add `datasets/` and `ml/defect/artifacts/` to the root `.gitignore`.
- (c) Fix the old "re-plan at crack score 0.6" line in the root README. Close-ups now trigger on tier high or medium.

## Notes
- No dataset files in this PR.
- Weights (`best.pt`) are 43 MB, under the 100 MB limit.
- CODEBRIM is non-commercial research data and is not redistributed.
