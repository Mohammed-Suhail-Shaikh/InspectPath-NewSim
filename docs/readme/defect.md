## Defect model

Says which of 5 defects (crack, spallation, exposed bars, efflorescence, corrosion stain) a concrete patch shows, then maps them to an urgency tier. High or medium tier triggers close-ups. API threshold: 0.5.

**Dataset.** CODEBRIM: Mundt et al., "Meta-learning Convolutional Neural Architectures for Multi-target Concrete Defect Classification with the COncrete DEfect BRidge IMage Dataset", CVPR 2019. Non-commercial research data, NOT redistributed here. Put it in `datasets/codebrim/`.

**Method**
- Pretrained ResNet-18, 5 independent sigmoid outputs.
- Rare classes get a higher loss weight.
- Thin patches padded to square, then resized.
- Split by source photo. 52 unlabeled patches left out (train 43, val 5, test 4).
- Best epoch picked on validation; test used once.

**Results** (628 test patches, from `results.md`)

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| crack | 0.843 | 0.860 | 0.851 | 150 |
| spallation | 0.751 | 0.907 | 0.822 | 150 |
| exposed_bars | 0.932 | 0.913 | 0.923 | 150 |
| efflorescence | 0.846 | 0.812 | 0.829 | 149 |
| corrosion_stain | 0.739 | 0.867 | 0.798 | 150 |
| **macro** | 0.822 | 0.872 | **0.844** | 749 |

**Reproduce**
```bash
python3 ml/defect/prepare_data.py
python3 ml/defect/train.py
python3 ml/defect/evaluate.py
cd ml/defect && uvicorn api.main:app --port 8000
```
`MOCK_MODEL=1` runs the API without a model.

**Limits**
- One dataset.
- Patches, not full photos.
- Overlapping defects make labels hard.
- Tier rule is a team decision, not a standard.
