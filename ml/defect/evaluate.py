"""Step 5: evaluate the trained model ONCE on the test split and write results.md.

Run (from repo root, after training):  python ml/defect/evaluate.py

Everything in results.md is computed here from real predictions. Do not edit it by hand.
"""
import argparse
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import precision_recall_fscore_support
from torch.utils.data import DataLoader

from common import CLASSES, GROUPS3, eval_transform, load_checkpoint
from train import PatchDataset, get_probs, pick_device

HERE = Path(__file__).resolve().parent
THRESHOLD = 0.5


def takeaways(names, truth, pred, prec, rec, f1):
    """Plain-language bullet points built only from the measured numbers."""
    out = []
    best, worst = int(np.argmax(f1)), int(np.argmin(f1))
    out.append(f"Works best on **{names[best]}** (F1 {f1[best]:.2f}).")
    out.append(f"Hardest class is **{names[worst]}** (F1 {f1[worst]:.2f}).")

    # Class where precision and recall are furthest apart: it either over-flags or misses.
    gap = int(np.argmax(np.abs(prec - rec)))
    if prec[gap] < rec[gap]:
        out.append(f"**{names[gap]}** is over-flagged: it finds most real cases "
                   f"(recall {rec[gap]:.2f}) but many alarms are wrong (precision {prec[gap]:.2f}).")
    else:
        out.append(f"**{names[gap]}** is under-detected: alarms are mostly right "
                   f"(precision {prec[gap]:.2f}) but many real cases are missed (recall {rec[gap]:.2f}).")

    # What do the false alarms of the weakest-precision class actually contain?
    c = int(np.argmin(prec))
    false_pos = (pred[:, c] == 1) & (truth[:, c] == 0)
    if false_pos.sum() > 0:
        others = truth[false_pos].sum(axis=0)
        others[c] = 0
        n_bg = int((truth[false_pos].sum(axis=1) == 0).sum())
        if others.max() >= n_bg and others.max() > 0:
            top = int(np.argmax(others))
            out.append(f"False **{names[c]}** alarms ({int(false_pos.sum())}) most often land on patches "
                       f"that really show **{names[top]}** ({int(others[top])} of them).")
        else:
            out.append(f"False **{names[c]}** alarms ({int(false_pos.sum())}) mostly land on "
                       f"clean background patches ({n_bg} of them).")

    bg = truth.sum(axis=1) == 0
    if bg.sum() > 0:
        false_alarm = float((pred[bg].sum(axis=1) > 0).mean())
        out.append(f"{false_alarm:.0%} of clean background patches got at least one defect flagged.")
    return out[:5]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", type=Path, default=HERE / "artifacts" / "best.pt")
    ap.add_argument("--data-dir", type=Path, default=HERE.parents[1] / "datasets" / "codebrim")
    ap.add_argument("--out", type=Path, default=HERE / "results.md")
    ap.add_argument("--subset", type=int, default=None, help="plumbing check only (not a real result)")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    device = pick_device()
    model, names = load_checkpoint(args.ckpt, device)
    info = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    groups3 = names == list(GROUPS3)

    ds = PatchDataset(HERE / "splits" / "test.csv", args.data_dir, eval_transform(),
                      groups3=groups3, subset=args.subset)
    probs, truth = get_probs(model, DataLoader(ds, 32, num_workers=args.workers), device)
    pred = (probs >= THRESHOLD).astype(int)
    truth = truth.astype(int)

    prec, rec, f1, support = precision_recall_fscore_support(truth, pred, zero_division=0)
    macro = float(f1.mean())
    photos = len({p.name.split("_crop_")[0] for p in ds.paths})

    lines = [
        "# Defect model results (test split)", "",
        "## Setup",
        f"- Model: {info['arch']} pretrained on ImageNet, {len(names)} sigmoid outputs ({', '.join(names)}).",
        f"- Best epoch {info['epoch']} chosen by validation macro-F1 ({info['val_macro_f1']:.3f}).",
        f"- Test set: {len(ds)} patches from {photos} source photos, never used in training or epoch choice.",
        f"- Threshold: {THRESHOLD} for every class (not tuned).",
        "- Split: by source photo, so no photo appears in two splits.", "",
        "## Per-class results",
        "| Class | Precision | Recall | F1 | Support |", "|---|---|---|---|---|",
    ]
    for i, n in enumerate(names):
        lines.append(f"| {n} | {prec[i]:.3f} | {rec[i]:.3f} | {f1[i]:.3f} | {int(support[i])} |")
    lines += [f"| **macro average** | {prec.mean():.3f} | {rec.mean():.3f} | **{macro:.3f}** | {int(support.sum())} |", "",
              "## Takeaways"]
    lines += [f"- {t}" for t in takeaways(names, truth, pred, prec, rec, f1)]
    lines += ["", "## Limitations",
              "- One dataset (CODEBRIM). Results may not hold on other bridges, cameras or lighting.",
              "- The model sees cropped patches, not full photos.",
              "- Patches often show several defects at once, which makes the labels harder to learn.",
              "- The threshold is a plain 0.5. The urgency tier rule is a team decision, not an engineering standard."]
    if args.subset:
        lines.insert(1, f"> WARNING: plumbing check on {args.subset} patches only. Not a real result.\n")

    args.out.write_text("\n".join(lines) + "\n")
    print(f"{'class':<18}{'prec':>7}{'recall':>8}{'F1':>7}{'support':>9}")
    for i, n in enumerate(names):
        print(f"{n:<18}{prec[i]:>7.3f}{rec[i]:>8.3f}{f1[i]:>7.3f}{int(support[i]):>9}")
    print(f"{'macro-F1':<18}{'':>7}{'':>8}{macro:>7.3f}\nwrote {args.out}")


if __name__ == "__main__":
    main()
