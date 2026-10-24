# Defect model results (test split)

## Setup
- Model: resnet18 pretrained on ImageNet, 5 sigmoid outputs (crack, spallation, exposed_bars, efflorescence, corrosion_stain).
- Best epoch 13 chosen by validation macro-F1 (0.829).
- Test set: 628 patches from 135 source photos, never used in training or epoch choice.
- Threshold: 0.5 for every class (not tuned).
- Split: by source photo, so no photo appears in two splits.

## Per-class results
| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| crack | 0.843 | 0.860 | 0.851 | 150 |
| spallation | 0.751 | 0.907 | 0.822 | 150 |
| exposed_bars | 0.932 | 0.913 | 0.923 | 150 |
| efflorescence | 0.846 | 0.812 | 0.829 | 149 |
| corrosion_stain | 0.739 | 0.867 | 0.798 | 150 |
| **macro average** | 0.822 | 0.872 | **0.844** | 749 |

## Takeaways
- Works best on **exposed_bars** (F1 0.92).
- Hardest class is **corrosion_stain** (F1 0.80).
- **spallation** is over-flagged: it finds most real cases (recall 0.91) but many alarms are wrong (precision 0.75).
- False **corrosion_stain** alarms (46) most often land on patches that really show **spallation** (24 of them).
- 3% of clean background patches got at least one defect flagged.

## Limitations
- One dataset (CODEBRIM). Results may not hold on other bridges, cameras or lighting.
- The model sees cropped patches, not full photos.
- Patches often show several defects at once, which makes the labels harder to learn.
- The threshold is a plain 0.5. The urgency tier rule is a team decision, not an engineering standard.
