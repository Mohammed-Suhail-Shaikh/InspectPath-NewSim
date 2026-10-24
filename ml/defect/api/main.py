"""Step 7: defect model API.

Run (from ml/defect/):  uvicorn api.main:app --port 8000
Fake answers for frontend work:  MOCK_MODEL=1 uvicorn api.main:app --port 8000

Settings come from environment variables (see .env.example):
  MOCK_MODEL            "1" = return deterministic fake scores, no model needed
  MODEL_PATH            path to best.pt (default: ml/defect/artifacts/best.pt)
  CONFIDENCE_THRESHOLD  score needed to count as detected (default 0.5)
  CORS_ORIGINS          comma-separated allowed origins (default "*", fine for a local demo only)

NOTE: this API has no login or API key. Run it locally / on a trusted network only.
"""
import base64
import binascii
import hashlib
import io
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

# Make `common` and `tier` importable whether we start from ml/defect/ or ml/defect/api/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import CLASSES, load_checkpoint, predict_scores  # noqa: E402
from tier import tier  # noqa: E402

DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "best.pt"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # reject anything over 10 MB

state = {}  # holds the model, loaded once at startup


def mock_mode():
    return os.getenv("MOCK_MODEL", "0") == "1"


def threshold():
    return float(os.getenv("CONFIDENCE_THRESHOLD", "0.5"))


@asynccontextmanager
async def lifespan(app):
    # Load the model ONE time when the server starts, not on every request.
    if mock_mode():
        state["model"] = None
    else:
        model, names = load_checkpoint(os.getenv("MODEL_PATH", str(DEFAULT_MODEL_PATH)))
        if names != CLASSES:
            raise RuntimeError(f"Checkpoint outputs are {names}. The API only supports the 5-class "
                               "model until the API shape for --groups3 is decided.")
        state["model"] = model
    yield
    state.clear()


app = FastAPI(title="InspectPath defect model", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


def mock_scores(image_bytes):
    """Same image bytes -> same fake scores, every time. Different images give varied results."""
    digest = hashlib.sha256(image_bytes).digest()
    return {c: round(digest[i] / 255, 4) for i, c in enumerate(CLASSES)}


def real_scores(image):
    row = predict_scores(state["model"], [image])[0]
    return {c: round(float(s), 4) for c, s in zip(CLASSES, row)}


async def read_image_bytes(request: Request):
    """Accept a multipart file ("file"), a multipart field ("image_base64") or a JSON body."""
    ctype = request.headers.get("content-type", "")
    b64 = None
    if ctype.startswith(("multipart/form-data", "application/x-www-form-urlencoded")):
        form = await request.form()
        upload = form.get("file")
        if upload is not None and hasattr(upload, "read"):
            return await upload.read()
        b64 = form.get("image_base64")
    elif ctype.startswith("application/json"):
        try:
            body = await request.json()
        except ValueError:
            raise HTTPException(400, "Body is not valid JSON.")
        b64 = body.get("image_base64") if isinstance(body, dict) else None
    if not isinstance(b64, str) or not b64:
        raise HTTPException(400, 'Send an image file in field "file" or base64 in "image_base64".')
    if b64.startswith("data:"):  # allow "data:image/png;base64,...."
        b64 = b64.split(",", 1)[-1]
    try:
        return base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "image_base64 is not valid base64.")


@app.get("/health")
def health():
    return {"status": "ok", "mock": mock_mode()}


@app.post("/predict")
async def predict(request: Request):
    data = await read_image_bytes(request)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Image is larger than 10 MB.")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(400, "Could not read the image. Use PNG or JPEG.")

    scores = mock_scores(data) if mock_mode() else await run_in_threadpool(real_scores, image)
    limit = threshold()
    detected = [c for c in CLASSES if scores[c] >= limit]
    return {"scores": scores, "detected": detected, "tier": tier(detected), "threshold": limit}
