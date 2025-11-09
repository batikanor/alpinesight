import os
from typing import List
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi import FastAPI, Query, Request as FastAPIRequest, Body
from fastapi.responses import StreamingResponse
from openai import OpenAI
from .utils.prompt import ClientMessage, convert_to_openai_messages
from .utils.stream import patch_response_with_headers, stream_text
from .utils.tools import AVAILABLE_TOOLS, TOOL_DEFINITIONS
from vercel import oidc
from vercel.headers import set_headers
import requests
import numpy as np
import cv2
from .utils.object_detection.detect import load_model, filter_vehicle_detections


load_dotenv(".env.local")

app = FastAPI()


@app.middleware("http")
async def _vercel_set_headers(request: FastAPIRequest, call_next):
    set_headers(dict(request.headers))
    return await call_next(request)


def get_openai_client():
    """Get OpenAI client with appropriate configuration for environment."""
    # Check if running in Vercel environment
    if os.environ.get("VERCEL"):
        # Use Vercel AI Gateway with OIDC token
        return OpenAI(
            api_key=oidc.get_vercel_oidc_token(),
            base_url="https://ai-gateway.vercel.sh/v1"
        ), "google/gemini-2.0-flash-exp:free"

    # For local development, prefer OpenRouter
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    if openrouter_key:
        # Default to Gemini 2.0 Flash (free and fast)
        model = os.environ.get("MODEL_NAME", "google/gemini-2.0-flash-exp:free")
        return OpenAI(
            api_key=openrouter_key,
            base_url="https://openrouter.ai/api/v1"
        ), model

    # Fallback to regular OpenAI
    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        model = os.environ.get("MODEL_NAME", "gpt-4o-mini")
        return OpenAI(api_key=openai_key), model

    raise ValueError(
        "No API key found. Please set OPENROUTER_API_KEY, OPENAI_API_KEY in .env.local, "
        "or deploy to Vercel for OIDC authentication."
    )


class Request(BaseModel):
    messages: List[ClientMessage]
    model: str | None = None


@app.post("/api/chat")
async def handle_chat_data(request: Request, protocol: str = Query('data')):
    messages = request.messages
    openai_messages = convert_to_openai_messages(messages)

    # Get model from request or use default
    requested_model = request.model
    client, model = get_openai_client()

    # Override with requested model if provided
    if requested_model:
        model = requested_model

    response = StreamingResponse(
        stream_text(client, openai_messages, TOOL_DEFINITIONS, AVAILABLE_TOOLS, protocol, model),
        media_type="text/event-stream",
    )
    return patch_response_with_headers(response, protocol)


# Initialize YOLO model once
try:
    yolo_model = load_model("yolov8n.pt")
except Exception as e:
    yolo_model = None
    print("[YOLO] Failed to load model:", e)

class DetectRequest(BaseModel):
    image_url: str
    conf_thres: float | None = 0.1
    classes: list[str] | None = None  # e.g., ["car"]

@app.post("/api/detect_vehicles")
async def detect_vehicles(req: DetectRequest):
    """Single image vehicle detection endpoint - used by frontend for real-time detection"""
    if yolo_model is None:
        return {"error": "YOLO model not available on server"}
    try:
        resp = requests.get(req.image_url, timeout=25)
        resp.raise_for_status()
        data = np.frombuffer(resp.content, dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if img is None:
            return {"error": "Failed to decode image"}

        # Run YOLO detection
        results = yolo_model.predict(source=img, conf=req.conf_thres or 0.25, verbose=False)
        if not results:
            return {
                "boxes": [],
                "total": 0,
                "per_class": {},
                "width": int(img.shape[1]) if img is not None else 0,
                "height": int(img.shape[0]) if img is not None else 0,
            }

        result = results[0]
        detections = filter_vehicle_detections(result)

        # Optionally filter to provided classes
        if req.classes:
            keep = set(req.classes)
            detections = [d for d in detections if d[0] in keep]

        # Build boxes and counts
        h, w = img.shape[:2]
        per_class: dict[str, int] = {}
        boxes = []

        for cls_name, conf, x1, y1, x2, y2 in detections:
            per_class[cls_name] = per_class.get(cls_name, 0) + 1
            boxes.append({
                "cls": cls_name,
                "conf": float(conf),
                "x1": int(x1),
                "y1": int(y1),
                "x2": int(x2),
                "y2": int(y2),
            })

        return {
            "boxes": boxes,
            "total": sum(per_class.values()),
            "per_class": per_class,
            "width": int(w),
            "height": int(h),
        }
    except Exception as e:
        return {"error": str(e)}
