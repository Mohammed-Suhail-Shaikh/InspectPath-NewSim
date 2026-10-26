# Demo run checklist (Windows laptop)

Run the whole system from a fresh pull of `main`. Commands are PowerShell, run
from the repo root unless noted. Dataset images are **not** in git, so step 1 is
required for real defect findings.

## 1. Put the CODEBRIM demo images in place

The dashboard serves images from `data/images/` (gitignored; never committed).
Copy the demo crops so the paths in `data/image_map.json` resolve:

```
data/images/test/background/...   <- full capture crops
data/images/test/defects/...      <- defect + close-up crops
```

Each path in `data/image_map.json` is `images/test/<...>.png`, loaded by the UI
as `/data/images/test/<...>.png`. If the folder is missing, findings still work
but show mock results (labeled "mock").

## 2. Start the defect API on port 8001

No `ml/defect/requirements.txt` exists yet, so install deps explicitly.

```powershell
cd ml\defect
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install fastapi "uvicorn[standard]" pillow torch torchvision numpy python-multipart
# Real model (uses artifacts\best.pt):
uvicorn api.main:app --port 8001
# OR no-model fallback (deterministic fake scores, no torch needed):
#   $env:MOCK_MODEL="1"; uvicorn api.main:app --port 8001
```

Leave this running in its own terminal. CORS allows `http://localhost:5173` by
default. Check it: open <http://localhost:8001/health> → `{"status":"ok",...}`.

## 3. (Optional) Start the report API on port 8000

Enables the "AI summary" button. The dashboard works without it (rule-based
report is the default).

```powershell
cd api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # then set GEMINI_API_KEY in .env
uvicorn main:app --port 8000
```

## 4. Start the dashboard

```powershell
cd web
npm install
npm run dev     # predev copies data\ into web\public\data\ automatically
```

Open the printed URL (default <http://localhost:5173/>).

## 5. Confirm each piece: real vs mock

| Piece | Real when… | How to confirm in the UI |
|---|---|---|
| Replay | `data/trigger/replay_kw51_demo.json` present | Monitor subtitle reads "Replaying sensor node readings as if live (KW51 replay)" and footer says "Simulation with real bridge data…". Mock shows "Replaying sample sensor data (mock)" + "Sample data for demonstration…". Use the **Dataset** dropdown (KW51 demo / KW51 full / Mock). |
| Structure | `data/structures/<id>.json` present | Grid map matches the real structure. Not shipped yet → mock grid (Bridge Section A). |
| Plan | `web/src/planner/` module present | Route/stats from the planner. Not shipped yet → mock naive/optimized plans. |
| Defects | Defect API up on 8001 **and** images in `data/images/` | Open a finding pin: if the detail has **no** "mock" note, it came from `/predict`. A yellow "Defect result is a mock…" note means that waypoint fell back. |

Any contract-validation problem (a file present but malformed) shows a yellow
**Data warning** banner above the views, naming the exact bad field; that piece
then falls back to mock. No banner = no contract warnings.
