# Tasks

- [x] 0. Branch `zaiba/defect-model` from origin/main, ignore rules in place
- [x] 1. Write spec (requirements, design, tasks)
- [x] 2. Inspect the CODEBRIM data, summarize, wait for OK
- [x] 3. `prepare_data.py`: split by source photo, CSVs, overlap assert, `test_files.txt`
- [x] 4. `common.py` + `train.py`: smoke test only (1 epoch, tiny subset); hand full command to Zaiba
- [x] 5. (written, runs after training) `evaluate.py`: test run at 0.5, generates `results.md` (after Zaiba trains)
- [x] 6. `tier.py` + unit tests for every rule row
- [x] 7. `api/main.py` + mock mode + pytest + one save hook
- [x] 8. (results table waits for results.md) `docs/readme/defect.md` (under 250 words)
