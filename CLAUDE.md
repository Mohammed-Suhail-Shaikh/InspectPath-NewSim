# InspectPath: notes for Claude Code

Bridge monitoring (KW51 trigger model) plus targeted AI inspection (CODEBRIM
defect model), shown in a React dashboard. Simulation only, on real public data.

## Read these first (don't duplicate them here)

- `CONTEXT-HANDOFF.md`: local only. Current state, how to run, next planned work.
- `.kiro/steering/`: `product.md` (honesty rules), `tech.md`, `structure.md`,
  `design.md` (design tokens, the single source of truth for the UI).
- `docs/contract.md`: shared data shapes (use the metric v2 sections 3b/4b).
- `README.md`: datasets, citations, provenance, measured results.
- `.kiro/specs/`: per-component requirements, design, and tasks.

## Verify before every commit

- Web: `cd web; npm run build; npm test`. The full-replay (monitorReplay) test
  is slow, so allow several minutes.
- Planner: `cd firmware_esp32; python -m unittest test_planner_kw51`.

## Standing rules

- Work on a feature branch from `main`. Never commit to `main` directly.
- Push only to `origin` (github.com/zaiba6/InspectPath). Never push to `mine`
  unless Suhail says so. Never force push.
- Every commit must build and pass the web tests and planner tests.
- Never commit `data/external/`, `data/images/`, `datasets/`,
  `CONTEXT-HANDOFF.md`, `.env` files, `.venv` folders, or files over 50 MB.
  CODEBRIM images must never be published (license).
- Don't edit a test to make it pass. List every test change with its reason.
- Keep all honesty labels and design tokens. Never invent numbers: every number
  on screen must come from data or the repo.
- Verify from actual command output, not assumptions. Restart the dev server
  after any `data/` change.
- Stop and ask before merging to `main`, installing anything, or deleting files.
