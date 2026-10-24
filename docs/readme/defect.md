## Defect model

Looks at a concrete patch and says which of 5 defects are present: crack, spallation, exposed bars, efflorescence, corrosion stain. A simple rule turns that into an urgency tier.

**Dataset.** CODEBRIM: Mundt et al., "Meta-learning Convolutional Neural Architectures for Multi-target Concrete Defect Classification with the COncrete DEfect BRidge IMage Dataset", CVPR 2019. It is non-commercial research data and is NOT redistributed in this repo. Download it yourself into `datasets/codebrim/`.

**Method**
- Pretrained ResNet-18 with 5 independent yes/no outputs (sigmoid), since one patch can show several defects.
- Rare classes get a higher loss weight.
- Thin patches are padded to square, then resized.
- Split by source photo, so test photos are never seen in training.
- Best epoch chosen on validation data. Test data used once.

**Results (test set, threshold 0.5)**

628 test patches from 135 photos. Copied from `ml/defect/results.md`.

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| crack | 0.843 | 0.860 | 0.851 | 150 |
| spallation | 0.751 | 0.907 | 0.822 | 150 |
| exposed_bars | 0.932 | 0.913 | 0.923 | 150 |
| efflorescence | 0.846 | 0.812 | 0.829 | 149 |
| corrosion_stain | 0.739 | 0.867 | 0.798 | 150 |
| **macro average** | 0.822 | 0.872 | **0.844** | 749 |

**Reproduce**
```bash
python3 ml/defect/prepare_data.py
python3 ml/defect/train.py
python3 ml/defect/evaluate.py
cd ml/defect && uvicorn api.main:app --port 8000
```
Use `MOCK_MODEL=1` to run the API without a trained model.

**Limits**
- One dataset only.
- Patches, not full photos.
- Overlapping defects make labels hard.
- The tier rule is a team decision, not an engineering standard.
