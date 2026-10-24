"""Step 3: build train/val/test CSVs from the CODEBRIM classification data.

Run:  python ml/defect/prepare_data.py
Optional: --data-dir path/to/codebrim   (default: <repo>/datasets/codebrim)

Output (in ml/defect/splits/):
  train.csv, val.csv, test.csv   -> path + 5 binary columns (git-ignored)
  test_files.txt                 -> test filenames only (committed, for the demo image map)

Label rule: all five columns zero = background patch.
Split rule: patches from the same source photo never cross splits.
"""
import argparse
import csv
import random
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
CLASSES = ["crack", "spallation", "exposed_bars", "efflorescence", "corrosion_stain"]
# XML tag name -> our column name
XML_TAGS = {"Crack": "crack", "Spallation": "spallation", "ExposedBars": "exposed_bars",
            "Efflorescence": "efflorescence", "CorrosionStain": "corrosion_stain"}
SPLITS = ["train", "val", "test"]


def source_photo(filename):
    """'image_0000018_crop_0000001.png' -> 'image_0000018' (the photo the patch was cut from)."""
    return filename.split("_crop_")[0]


def read_labels(data_dir):
    """Read both XML files into {filename: {class: 0/1}}."""
    labels = {}
    for xml_file in ("defects.xml", "background.xml"):
        for item in ET.parse(data_dir / "metadata" / xml_file).getroot():
            tags = {child.tag: int(child.text) for child in item}
            labels[item.get("name")] = {XML_TAGS[t]: tags[t] for t in XML_TAGS}
    return labels


def collect_rows(data_dir, labels):
    """Walk the official split folders and return {split: [row, ...]}."""
    rows = {s: [] for s in SPLITS}
    skipped = {s: 0 for s in SPLITS}
    for split in SPLITS:
        for sub in ("defects", "background"):
            for png in sorted((data_dir / split / sub).glob("*.png")):
                if png.name not in labels:
                    raise SystemExit(f"No label found for {png.name}")
                row = {"path": f"{split}/{sub}/{png.name}", **labels[png.name]}
                is_empty = sum(labels[png.name].values()) == 0
                if sub == "background" and not is_empty:
                    raise SystemExit(f"Background folder patch has a defect label: {png.name}")
                # A patch in the defects folder with no defect label and Background=0 is unlabeled.
                # We cannot tell if it is a defect or background, so we leave it out.
                if sub == "defects" and is_empty:
                    skipped[split] += 1
                    continue
                rows[split].append(row)
    print(f"Skipped unlabeled patches (defects folder, all zeros): {skipped}")
    return rows


def photos_by_split(rows):
    return {s: {source_photo(Path(r["path"]).name) for r in rows[s]} for s in SPLITS}


def has_overlap(rows):
    p = photos_by_split(rows)
    return any(p[a] & p[b] for i, a in enumerate(SPLITS) for b in SPLITS[i + 1:])


def regroup_by_photo(rows, seed):
    """Fallback only: pool everything, shuffle whole photos with a fixed seed, split ~80/10/10."""
    by_photo = {}
    for s in SPLITS:
        for r in rows[s]:
            by_photo.setdefault(source_photo(Path(r["path"]).name), []).append(r)
    photos = sorted(by_photo)
    random.Random(seed).shuffle(photos)
    n = len(photos)
    cut = {"train": photos[: int(n * 0.8)], "val": photos[int(n * 0.8): int(n * 0.9)],
           "test": photos[int(n * 0.9):]}
    return {s: [r for p in cut[s] for r in by_photo[p]] for s in SPLITS}


def write_csv(path, rows):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["path"] + CLASSES)
        w.writeheader()
        w.writerows(rows)


def print_table(rows):
    cols = CLASSES + ["background"]
    print(f"{'split':<6}{'patches':>8}{'photos':>8}" + "".join(f"{c[:10]:>12}" for c in cols))
    photos = photos_by_split(rows)
    for s in SPLITS:
        counts = [sum(r[c] for r in rows[s]) for c in CLASSES]
        bg = sum(1 for r in rows[s] if not any(r[c] for c in CLASSES))
        print(f"{s:<6}{len(rows[s]):>8}{len(photos[s]):>8}" + "".join(f"{n:>12}" for n in counts + [bg]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, default=HERE.parents[1] / "datasets" / "codebrim")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rows = collect_rows(args.data_dir, read_labels(args.data_dir))
    if has_overlap(rows):
        print("Official split shares photos across splits -> regrouping by photo.")
        rows = regroup_by_photo(rows, args.seed)

    # Hard check: no photo and no file may appear in two splits.
    photos = photos_by_split(rows)
    for a, b in [("train", "val"), ("train", "test"), ("val", "test")]:
        assert not photos[a] & photos[b], f"Photo overlap between {a} and {b}"
        files_a = {r["path"].split("/")[-1] for r in rows[a]}
        files_b = {r["path"].split("/")[-1] for r in rows[b]}
        assert not files_a & files_b, f"File overlap between {a} and {b}"

    out = HERE / "splits"
    out.mkdir(exist_ok=True)
    for s in SPLITS:
        write_csv(out / f"{s}.csv", rows[s])
    # Filenames only (no images) so the demo image map can be built from the test split.
    names = sorted(Path(r["path"]).name for r in rows["test"])
    (out / "test_files.txt").write_text("\n".join(names) + "\n")

    print_table(rows)
    print("Overlap check passed. Wrote splits/*.csv and splits/test_files.txt")


if __name__ == "__main__":
    main()
