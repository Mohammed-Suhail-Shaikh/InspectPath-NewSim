"""API tests. They run in mock mode, so no trained model is needed."""
import base64
import io
import os

import pytest
from fastapi.testclient import TestClient
from PIL import Image

os.environ["MOCK_MODEL"] = "1"
from api.main import app  # noqa: E402  (import after setting the env var)

CLASSES = ["crack", "spallation", "exposed_bars", "efflorescence", "corrosion_stain"]


def png_bytes(color=(120, 90, 60), size=(40, 20)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def client():
    with TestClient(app) as c:  # "with" runs the startup code
        yield c


def check_shape(body):
    assert set(body) == {"scores", "detected", "tier", "threshold"}
    assert list(body["scores"]) == CLASSES
    assert all(isinstance(v, float) and 0 <= v <= 1 for v in body["scores"].values())
    assert body["threshold"] == 0.5
    assert body["detected"] == [c for c in CLASSES if body["scores"][c] >= 0.5]
    assert body["tier"] in {"high", "medium", "low", "none"}


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_predict_file(client):
    r = client.post("/predict", files={"file": ("p.png", png_bytes(), "image/png")})
    assert r.status_code == 200
    check_shape(r.json())


def test_predict_base64_json(client):
    b64 = base64.b64encode(png_bytes()).decode()
    r = client.post("/predict", json={"image_base64": b64})
    assert r.status_code == 200
    check_shape(r.json())


def test_predict_base64_form_with_data_url(client):
    b64 = "data:image/png;base64," + base64.b64encode(png_bytes()).decode()
    r = client.post("/predict", data={"image_base64": b64})
    assert r.status_code == 200
    check_shape(r.json())


def test_mock_is_deterministic(client):
    files = {"file": ("p.png", png_bytes(), "image/png")}
    assert client.post("/predict", files=files).json() == client.post("/predict", files=files).json()


def test_mock_varies_between_images(client):
    a = client.post("/predict", files={"file": ("a.png", png_bytes((1, 2, 3)), "image/png")}).json()
    b = client.post("/predict", files={"file": ("b.png", png_bytes((200, 9, 99)), "image/png")}).json()
    assert a["scores"] != b["scores"]


def test_tier_comes_from_detected(client):
    from tier import tier
    body = client.post("/predict", files={"file": ("p.png", png_bytes(), "image/png")}).json()
    assert body["tier"] == tier(body["detected"])


def test_bad_inputs_return_400(client):
    assert client.post("/predict", json={}).status_code == 400
    assert client.post("/predict", json={"image_base64": "not base64!!"}).status_code == 400
    bad = base64.b64encode(b"this is not an image").decode()
    assert client.post("/predict", json={"image_base64": bad}).status_code == 400
