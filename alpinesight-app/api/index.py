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
from .utils.object_detection.detect import load_model


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


# Initialize YOLO OBB model once for better satellite image detection
try:
    yolo_model = load_model("yolo11n-obb.pt")
except Exception as e:
    yolo_model = None
    print("[YOLO] Failed to load model:", e)

class DetectRequest(BaseModel):
    image_url: str
    conf_thres: float | None = 0.1
    classes: list[str] | None = None  # e.g., ["car"]
    return_image: bool = False  # if True, return base64 encoded annotated image

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

        # Run YOLO OBB detection with parameters optimized for satellite imagery
        # Use higher imgsz for small objects and lower confidence threshold
        results = yolo_model.predict(
            source=img,
            conf=req.conf_thres or 0.02,  # Lower threshold for satellite images
            imgsz=1280,  # Higher resolution for small vehicle detection
            verbose=False,
            iou=0.5,
            agnostic_nms=False,
        )

        if not results:
            return {
                "boxes": [],
                "total": 0,
                "per_class": {},
                "width": int(img.shape[1]) if img is not None else 0,
                "height": int(img.shape[0]) if img is not None else 0,
            }

        result = results[0]

        # Handle OBB (Oriented Bounding Box) results
        if result.obb is None or len(result.obb) == 0:
            return {
                "boxes": [],
                "total": 0,
                "per_class": {},
                "width": int(img.shape[1]),
                "height": int(img.shape[0]),
            }

        # Extract OBB detections
        boxes = result.obb.xyxy.cpu().numpy()  # axis-aligned boxes from oriented boxes
        scores = result.obb.conf.cpu().numpy()
        classes = result.obb.cls.cpu().numpy().astype(int)
        names = result.names

        # Filter for vehicle-like labels (DOTA dataset style)
        def is_vehicle_label(name: str) -> bool:
            name = name.lower()
            return (
                "small-vehicle" in name
                or "large-vehicle" in name
                or "vehicle" in name
                or "car" in name
                or "truck" in name
            )

        # Build boxes and counts
        h, w = img.shape[:2]
        per_class: dict[str, int] = {}
        boxes_list = []

        for (x1, y1, x2, y2), conf, cls_id in zip(boxes, scores, classes):
            cls_name = names.get(int(cls_id), str(cls_id))

            # Skip non-vehicle detections
            if not is_vehicle_label(cls_name):
                continue

            # Optionally filter to provided classes
            if req.classes and cls_name not in req.classes:
                continue

            per_class[cls_name] = per_class.get(cls_name, 0) + 1
            boxes_list.append({
                "cls": cls_name,
                "conf": float(conf),
                "x1": int(x1),
                "y1": int(y1),
                "x2": int(x2),
                "y2": int(y2),
            })

        response = {
            "boxes": boxes_list,
            "total": len(boxes_list),
            "per_class": per_class,
            "width": int(w),
            "height": int(h),
        }

        # Optionally return annotated image
        if req.return_image and boxes_list:
            import base64
            vis = img.copy()
            for box in boxes_list:
                x1, y1, x2, y2 = box["x1"], box["y1"], box["x2"], box["y2"]
                cls_name = box["cls"]
                conf = box["conf"]

                # Draw rectangle
                cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 255, 0), 2)

                # Draw label
                label = f"{cls_name} {conf:.2f}"
                cv2.putText(
                    vis,
                    label,
                    (x1, max(0, y1 - 5)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.4,
                    (0, 255, 0),
                    1,
                    cv2.LINE_AA,
                )

            # Encode to base64
            _, buffer = cv2.imencode('.jpg', vis)
            img_base64 = base64.b64encode(buffer).decode('utf-8')
            response["annotated_image"] = f"data:image/jpeg;base64,{img_base64}"

        return response
    except Exception as e:
        return {"error": str(e)}
