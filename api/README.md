# InspectPath API

Minimal FastAPI backend. Holds the LLM credential server-side so it never ships
to the browser, and exposes one endpoint used by the dashboard report feature.

## Endpoint

`POST /report`

- Body: `{ "findings": [...], "alertHistory": [...] }` — the same payload the
  dashboard's `llmClient.ts` builds.
- Returns: `{ "text": "<plain-language report>" }`.
- Returns `503` when no server-side credential is configured; the frontend then
  falls back to its built-in mock report.

`GET /health` returns `{ "status": "ok" }`.

## How to run the API locally

From the `api/` folder:

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure credentials
#    Copy the example and fill in your key. api/.env is gitignored.
copy .env.example .env    # Windows
# cp .env.example .env     # macOS/Linux
#    Then edit .env and set GEMINI_API_KEY=...

# 4. Run the server (http://localhost:8000)
uvicorn main:app --reload --port 8000
```

The dashboard dev server (http://localhost:5173) is allowed by CORS out of the
box. The dashboard calls `POST http://localhost:8000/report`; if the API is not
running or no key is set, the dashboard shows its mock report instead.

To point the frontend at a different API URL, set `VITE_API_BASE_URL` in
`web/.env` (defaults to `http://localhost:8000`). Note: this is only a URL, not
a secret — no credentials live in the frontend.

## Swapping the LLM provider

Provider logic is isolated in `_call_gemini()` in `main.py` (currently Google
Gemini). To use another provider (e.g. OpenAI or Amazon Bedrock with Claude),
replace that one function and the corresponding env var(s); the endpoint,
request/response models, and the frontend wiring stay the same.
