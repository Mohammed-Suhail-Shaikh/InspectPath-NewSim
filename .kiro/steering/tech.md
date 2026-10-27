# Tech rules

- Follow docs/contract.md exactly. Never change a shared contract without telling the team.
- Frontend: React + Vite in web/. ML: Python, PyTorch, FastAPI.
- Prefer the simplest working solution. Do not add features outside the spec.
- Every screen must work with fake data that matches docs/contract.md before real data is connected. Keep mock data in web/src/mocks/.
- Never hardcode API keys or secrets. Use .env and keep .env out of git. Commit only .env.example.
- Never commit datasets, dataset images, or files over 50 MB.
- UI text must be plain language for non-specialists.
- The UI must work on a laptop screen and stay readable on a phone.
- Include the disclaimer: "Simulation with real bridge data. Alerts and severity are estimates, not engineering ratings."
