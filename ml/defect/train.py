"""Step 4: train the defect classifier. Never touches the test split.

Full run (from repo root):
  python ml/defect/train.py                      # ResNet-18, 5 classes
  python ml/defect/train.py --arch mobilenet     # lighter model
  python ml/defect/train.py --groups3            # fallback: surface / corrosion / structural

The best epoch (highest validation macro-F1) is saved to ml/defect/artifacts/best.pt.
"""
import argparse
import csv
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import f1_score
from torch.utils.data import DataLoader, Dataset

from common import (CLASSES, GROUPS3, build_model, eval_transform, to_groups3,
                    train_transform)

HERE = Path(__file__).resolve().parent
THRESHOLD = 0.5


class PatchDataset(Dataset):
    """Reads a split CSV. Each item = (image tensor, vector of 0/1 labels)."""

    def __init__(self, csv_path, data_dir, transform, groups3=False, subset=None, seed=42):
        with open(csv_path) as f:
            rows = list(csv.DictReader(f))
        if subset:  # tiny random subset, only for the smoke test
            rows = random.Random(seed).sample(rows, min(subset, len(rows)))
        self.paths = [Path(data_dir) / r["path"] for r in rows]
        labels = [[int(r[c]) for c in CLASSES] for r in rows]
        if groups3:
            labels = [to_groups3(y) for y in labels]
        self.labels = np.array(labels, dtype=np.float32)
        self.transform = transform

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        img = Image.open(self.paths[i]).convert("RGB")
        return self.transform(img), torch.from_numpy(self.labels[i])


def pick_device():
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def get_probs(model, loader, device):
    """Run the model on a loader, return (sigmoid scores, true labels) as numpy arrays."""
    model.eval()
    probs, truth = [], []
    with torch.no_grad():
        for x, y in loader:
            probs.append(torch.sigmoid(model(x.to(device))).cpu().numpy())
            truth.append(y.numpy())
    return np.concatenate(probs), np.concatenate(truth)


def macro_f1(probs, truth):
    return f1_score(truth, probs >= THRESHOLD, average="macro", zero_division=0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arch", choices=["resnet18", "mobilenet"], default="resnet18")
    ap.add_argument("--groups3", action="store_true", help="fallback: 3 grouped outputs")
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--subset", type=int, default=None, help="use N train patches (smoke test)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--data-dir", type=Path, default=HERE.parents[1] / "datasets" / "codebrim")
    ap.add_argument("--out", type=Path, default=HERE / "artifacts" / "best.pt")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    random.seed(args.seed)
    device = pick_device()
    names = list(GROUPS3) if args.groups3 else CLASSES
    splits = HERE / "splits"

    train_ds = PatchDataset(splits / "train.csv", args.data_dir, train_transform(),
                            args.groups3, args.subset, args.seed)
    val_ds = PatchDataset(splits / "val.csv", args.data_dir, eval_transform(),
                          args.groups3, args.subset and max(args.subset // 2, 8), args.seed)
    train_dl = DataLoader(train_ds, args.batch_size, shuffle=True, num_workers=args.workers)
    val_dl = DataLoader(val_ds, args.batch_size, num_workers=args.workers)

    # Rare classes get a bigger weight: pos_weight = negatives / positives (capped at 10).
    pos = train_ds.labels.sum(axis=0)
    neg = len(train_ds) - pos
    pos_weight = torch.tensor(np.clip(neg / np.maximum(pos, 1), 1.0, 10.0), dtype=torch.float32)

    model = build_model(args.arch, len(names)).to(device)
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=pos_weight.to(device))  # sigmoid per class, not softmax
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)

    print(f"device={device} arch={args.arch} outputs={names} train={len(train_ds)} val={len(val_ds)}")
    best_f1, best_probs, best_truth = -1.0, None, None
    args.out.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, args.epochs + 1):
        model.train()
        total = 0.0
        for x, y in train_dl:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = loss_fn(model(x), y)
            loss.backward()
            opt.step()
            total += loss.item() * len(x)
        probs, truth = get_probs(model, val_dl, device)
        f1 = macro_f1(probs, truth)
        is_best = f1 > best_f1
        if is_best:  # keep the best epoch by validation macro-F1
            best_f1, best_probs, best_truth = f1, probs, truth
            torch.save({"state_dict": model.state_dict(), "arch": args.arch, "classes": names,
                        "epoch": epoch, "val_macro_f1": f1}, args.out)
        print(f"epoch {epoch:02d}/{args.epochs}  loss {total / len(train_ds):.3f}  "
              f"val_macroF1 {f1:.3f}{'  *best' if is_best else ''}")

    # Small closing table: per-class validation F1 of the best epoch.
    per_class = f1_score(best_truth, best_probs >= THRESHOLD, average=None, zero_division=0)
    print("\nbest val F1 per class (threshold 0.5)")
    for n, v in zip(names, per_class):
        print(f"  {n:<16}{v:.3f}")
    print(f"  {'macro':<16}{best_f1:.3f}\nsaved {args.out}")


if __name__ == "__main__":
    main()
