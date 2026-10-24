"""Minimal FastAPI backend for InspectPath.

Exposes a single endpoint, POST /report, that generates a plain-language
inspection report from findings + alert history. The LLM credentials are read
from a server-side environment variable only (never shipped to the browser).
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="InspectPath API", version="0.1.0")

# Allow the Vite dev server to call the API during local development.
_allowed_origins = os.getenv(
    "INSPECTPATH_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins if o.strip()],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

# Server-side credential. No VITE_ prefix: this never reaches the frontend bundle.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

SYSTEM_PROMPT = (
    "You write short, plain-language bridge inspection summaries for "
    "non-specialists. Use only the findings and alert history provided. Do not "
    "invent measurements or numbers. Never state whether the bridge is safe or "
    "unsafe; the tiers and alert levels are demonstration estimates that help "
    "prioritize, not engineering ratings. Prioritize high-tier findings first."
)


# ---- Request / response models (mirror the payload llmClient.ts builds) ----


class DefectScores(BaseModel):
    crack: float
    spallation: float
    exposed_bars: float
    efflorescence: float
    corrosion_stain: float


class Finding(BaseModel):
    id: str
    waypoint_id: str
    x: int
    y: int
    tier: str
    scores: DefectScores
    detected: list[str]
    image_key: str
    has_closeup: bool


class AlertHistoryEntry(BaseModel):
    timestamp: str
    alert_level: str
    residual_pct: float
    quality: str


class ReportRequest(BaseModel):
    findings: list[Finding]
    alertHistory: list[AlertHistoryEntry]


class ReportResponse(BaseModel):
    text: str


def _build_user_prompt(req: ReportRequest) -> str:
    return "\n".join(
        [
            "Alert history (oldest first):",
            req.model_dump_json(include={"alertHistory"}),
            "",
            "Findings:",
            req.model_dump_json(include={"findings"}),
            "",
            "Write a prioritized, plain-language inspection summary.",
        ]
    )


async def _call_gemini(req: ReportRequest) -> str:
    """Call the LLM provider server-side. Swap this single function to change
    providers. Currently: Google Gemini (generateContent REST API)."""
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent"
    )
    payload: dict[str, Any] = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [
            {"role": "user", "parts": [{"text": _build_user_prompt(req)}]}
        ],
        "generationConfig": {"temperature": 0.3},
    }
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(url, json=payload, headers=headers)
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail="LLM provider request failed")
    data = res.json()
    text = None
    candidates = data.get("candidates")
    if candidates:
        parts = candidates[0].get("content", {}).get("parts")
        if parts:
            text = parts[0].get("text")
    if not text:
        raise HTTPException(status_code=502, detail="LLM provider returned no content")
    return text


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/report", response_model=ReportResponse)
async def report(req: ReportRequest) -> ReportResponse:
    if not GEMINI_API_KEY:
        # No server-side credential configured. Signal unavailable so the
        # frontend uses its mock fallback.
        raise HTTPException(status_code=503, detail="LLM not configured")
    text = await _call_gemini(req)
    return ReportResponse(text=text)
