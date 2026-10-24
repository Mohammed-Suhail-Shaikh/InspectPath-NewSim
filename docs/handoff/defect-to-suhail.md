# Defect API handoff (Zaiba to Suhail)
Run from `ml/defect/`. Real model: `MODEL_PATH=artifacts/best.pt uvicorn api.main:app --port 8000`
Mock (no model needed): `MOCK_MODEL=1 uvicorn api.main:app --port 8000`
`GET /health` returns `{"status":"ok","mock":false}`. `POST /predict` takes a file (field `file`) or base64 (`image_base64`).
Response (scores 0 to 1, `detected` = score >= `threshold`):
`{"scores":{"crack":0.0,"spallation":0.0,"exposed_bars":0.0,"efflorescence":0.0,"corrosion_stain":0.0},"detected":[],"tier":"none","threshold":0.5}`
Tier: `high` if exposed_bars or spallation; else `medium` if corrosion_stain; else `low` if crack or efflorescence; else `none`.
Close-ups trigger on tier `high` or `medium`. No crack-score cutoff any more. The tier rule is a team decision, not a standard.
Config env vars: `MOCK_MODEL`, `MODEL_PATH`, `CONFIDENCE_THRESHOLD` (default 0.5), `CORS_ORIGINS` (default `*`). No login on the API: local use only.
`best.pt` is not in git yet. Ask Zaiba for it, or use mock mode until it is committed.
Please update the data-contract steering file (`docs/contract.md`) to this shape, and add `datasets/` and `ml/defect/artifacts/` to the root `.gitignore`.
