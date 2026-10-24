"""Shared pieces used by training, evaluation and the API.

Keeping the class list, the image transform and the model builder in ONE place means
training and serving always see images the same way (no train/serve mismatch).
"""
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms

# The 5 defect classes. Order matters: it is the order of the model outputs and CSV columns.
CLASSES = ["crack", "spallation", "exposed_bars", "efflorescence", "corrosion_stain"]

# Fallback grouping (--groups3): a group is "on" if any of its members is on.
GROUPS3 = {
    "surface": ["crack", "efflorescence"],
    "corrosion": ["corrosion_stain"],
    "structural": ["spallation", "exposed_bars"],
}

IMG_SIZE = 224
MEAN = (0.485, 0.456, 0.406)  # ImageNet values, because the backbone was pretrained on ImageNet
STD = (0.229, 0.224, 0.225)
PAD_COLOR = tuple(int(m * 255) for m in MEAN)  # grey-ish fill so padding is not a strong signal


def to_groups3(labels5):
    """Turn a length-5 0/1 label (CLASSES order) into a length-3 label (GROUPS3 order)."""
    by_name = dict(zip(CLASSES, labels5))
    return [max(by_name[c] for c in members) for members in GROUPS3.values()]


class PadToSquare:
    """Pad the short side so the patch becomes square. Keeps the shape, avoids stretching."""

    def __call__(self, img):
        w, h = img.size
        side = max(w, h)
        canvas = Image.new("RGB", (side, side), PAD_COLOR)
        canvas.paste(img, ((side - w) // 2, (side - h) // 2))
        return canvas


def eval_transform():
    """THE one transform for validation, evaluation and the API. Do not make a second copy."""
    return transforms.Compose([
        PadToSquare(),
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])


def train_transform():
    """Same as eval, plus light random changes (flips, colour) to reduce overfitting."""
    return transforms.Compose([
        PadToSquare(),
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(),
        transforms.ColorJitter(brightness=0.2, contrast=0.2),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])


def build_model(arch, n_outputs, pretrained=True):
    """Backbone with a fresh head of n_outputs raw scores (logits). Sigmoid is applied later."""
    if arch == "resnet18":
        weights = models.ResNet18_Weights.DEFAULT if pretrained else None
        model = models.resnet18(weights=weights)
        model.fc = nn.Linear(model.fc.in_features, n_outputs)
    elif arch == "mobilenet":
        weights = models.MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
        model = models.mobilenet_v3_small(weights=weights)
        model.classifier[3] = nn.Linear(model.classifier[3].in_features, n_outputs)
    else:
        raise ValueError(f"Unknown arch: {arch}")
    return model


def load_checkpoint(path, device="cpu"):
    """Load best.pt saved by train.py. Returns (model in eval mode, class_names)."""
    ckpt = torch.load(path, map_location=device, weights_only=True)
    model = build_model(ckpt["arch"], len(ckpt["classes"]), pretrained=False)
    model.load_state_dict(ckpt["state_dict"])
    model.to(device).eval()
    return model, ckpt["classes"]


@torch.no_grad()
def predict_scores(model, images, device="cpu"):
    """PIL images -> numpy array (n_images, n_classes) of sigmoid scores in 0..1."""
    tf = eval_transform()
    batch = torch.stack([tf(im.convert("RGB")) for im in images]).to(device)
    return torch.sigmoid(model(batch)).cpu().numpy().astype(np.float64)
