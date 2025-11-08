# file: detect_vehicles.py
import os
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

# Define which classes count as "vehicles" for your use case
VEHICLE_CLASSES = {
    "car",
    "motorcycle",
    "bus",
    "truck",
    "bicycle",    # keep or drop based on your scope
    "train"       # big objects, can unselect if you only want road traffic
}

def load_model(model_name: str = "yolov8n.pt") -> YOLO:
    """
    Use yolov8n for speed or yolov8s/m for better accuracy.
    """
    return YOLO(model_name)

def filter_vehicle_detections(result, vehicle_classes=VEHICLE_CLASSES):
    """
    Takes a single Ultralytics result object.
    Returns list of (cls_name, conf, x1, y1, x2, y2)
    """
    names = result.names
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return []

    out = []
    for box in boxes:
        cls_id = int(box.cls[0])
        cls_name = names[cls_id]
        if cls_name in vehicle_classes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            out.append((cls_name, conf, int(x1), int(y1), int(x2), int(y2)))
    return out

def annotate_and_count_image(model: YOLO, img_path: Path, conf_thres=0.25):
    """
    Runs detection on one image, returns stats and saves an annotated copy.
    """
    results = model.predict(source=str(img_path), conf=conf_thres, verbose=False)
    if not results:
        return {"image": str(img_path), "total": 0, "per_class": {}}

    result = results[0]
    vehicles = filter_vehicle_detections(result)

    # Count per class
    per_class = {}
    for cls_name, conf, *_ in vehicles:
        per_class[cls_name] = per_class.get(cls_name, 0) + 1

    # Draw boxes
    img = cv2.imread(str(img_path))
    if img is None:
        return {"image": str(img_path), "total": 0, "per_class": {}}

    for cls_name, conf, x1, y1, x2, y2 in vehicles:
        label = f"{cls_name} {conf:.2f}"
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            img,
            label,
            (x1, max(0, y1 - 5)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            (0, 255, 0),
            1,
            cv2.LINE_AA,
        )

    out_dir = img_path.parent / "annotated"
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / img_path.name
    cv2.imwrite(str(out_file), img)

    return {
        "image": str(img_path),
        "total": len(vehicles),
        "per_class": per_class,
        "annotated": str(out_file),
    }

def run_on_folder(
    input_folder: str = "data/raw",
    model_name: str = "yolov8n.pt",
    conf_thres: float = 0.25,
):
    model = load_model(model_name)

    input_path = Path(input_folder)
    image_exts = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}

    all_stats = []
    total_overall = 0
    total_by_class = {}

    for img_path in sorted(input_path.iterdir()):
        if img_path.suffix.lower() not in image_exts:
            continue
        stats = annotate_and_count_image(model, img_path, conf_thres)
        all_stats.append(stats)

        total_overall += stats["total"]
        for cls_name, count in stats["per_class"].items():
            total_by_class[cls_name] = total_by_class.get(cls_name, 0) + count

        print(f"{stats['image']}: {stats['total']} vehicles {stats['per_class']}")

    print("\nSummary")
    print("Total vehicles:", total_overall)
    print("By class:", total_by_class)

    return all_stats

def run_single(
    image_path: str = "/Users/lukasbauer/alpinesight/test_data/sat_1.png",
    model_name: str = "yolov8n.pt",
    conf_thres: float = 0.05,
):
    model = load_model(model_name)
    img_path = Path(image_path)
    stats = annotate_and_count_image(model, img_path, conf_thres)
    print(f"Image: {stats['image']}")
    print(f"Total vehicles: {stats['total']}")
    print(f"Per class: {stats['per_class']}")
    print(f"Annotated image: {stats['annotated']}")
    return stats

if __name__ == "__main__":
    run_single()
