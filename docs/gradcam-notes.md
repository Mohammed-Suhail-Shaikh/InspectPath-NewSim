# Grad-CAM for the defect model — design notes (future work, not built yet)

Recorded so the constraints are not forgotten when the Grad-CAM feature is built
on its own branch. Grad-CAM would add a saliency overlay to the defect image in
the finding detail, showing which image regions most influenced the model's
prediction. It is NOT defect localization (the model is a multi-label image
classifier with no detection/segmentation head; see `ml/defect/common.py`
`build_model` — a single `nn.Linear` head over 5 sigmoid outputs).

## Hard constraints (must honor when implementing)

1. **Eval mode, gradients only.** Keep the model in `eval()` the whole time and
   enable gradients only for the Grad-CAM pass (`torch.enable_grad()` + hooks on
   the target conv layer). NEVER switch the model to `train()` mode: that changes
   BatchNorm to use batch statistics instead of the running statistics, which
   alters the outputs. `/predict` runs under `no_grad`; `/explain` needs grads but
   must stay in eval.

2. **The map is coarse.** ResNet-18's `layer4` activation is 7x7 at a 224x224
   input, so the raw CAM is a 7x7 grid upsampled to 224x224. It will look blocky.
   The on-screen label and the overlay styling should set that expectation (a
   smooth/soft heatmap, clearly a region hint, not a crisp outline).

3. **Align to the padded square the model actually saw.** The eval transform is
   pad-to-square then resize to 224 (`common.py` `PadToSquare` + `eval_transform`).
   The CAM is produced in that 224x224 padded space. The overlay must be composed
   onto the SAME padded square image (not the raw, differently-aspect crop), or it
   will be misaligned. Easiest correct approach: render the overlay on the padded
   224x224 image and show that image in the UI.

## Shape of the work (for later)

- New endpoint `POST /explain` in `ml/defect/api/main.py` (separate from
  `/predict`): same image input, optional `class` (default = top-scoring class),
  returns the heatmap (base64 PNG over the padded square) plus the explained class
  and its score.
- Implementable with the current venv (`torch`, `numpy`, `pillow`) in ~40 lines of
  hooks; no new packages. Do NOT install `pytorch-grad-cam`/`captum` without asking.
- On-screen label (agreed wording): "Heatmap shows the image regions that most
  influenced the model's prediction for this defect class. It is not the location
  or outline of a defect, and not a measurement on the bridge."
- CPU cost is roughly one forward + one partial backward through ResNet-18 at
  224x224 (~0.1-0.5 s per image, estimate), computed on demand.
