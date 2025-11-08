# detect_anything_single.py

from pathlib import Path
import cv2
from ultralytics import YOLO

def run_single_anything(
    image_path: str = "/Users/lukasbauer/alpinesight/test_data/sat_2.png",
    model_name: str = "yolov8x.pt",
    conf_thres: float = 0.01
    
):
    img_path = Path(image_path)
    if not img_path.exists():
        raise FileNotFoundError(f"{img_path} not found")

    model = YOLO(model_name)

    results = model.predict(source=str(img_path), conf=conf_thres, verbose=False)
    if not results:
        print("No results from model")
        return

    result = results[0]
    boxes = result.boxes
    names = result.names

    if boxes is None or len(boxes) == 0:
        print("No detections at this threshold")
        return

    img = cv2.imread(str(img_path))
    if img is None:
        raise RuntimeError("Could not read image")

    print(f"Detections for {img_path}:")
    for box in boxes:
        cls_id = int(box.cls[0])
        cls_name = names[cls_id]
        conf = float(box.conf[0])
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        x1, y1, x2, y2 = map(int, (x1, y1, x2, y2))

        print(f"{cls_name:15s} conf={conf:.3f} box=({x1},{y1},{x2},{y2})")

        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        label = f"{cls_name} {conf:.2f}"
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

    out_path = img_path.parent / "annotated_anything.png"
    cv2.imwrite(str(out_path), img)
    print(f"Annotated image saved to {out_path}")

def run_single_yolo11s(
    image_path: str = "/Users/lukasbauer/alpinesight/test_data/sat_2.png",
    conf_thres: float = 0.05
):
    img_path = Path(image_path)
    if not img_path.exists():
        raise FileNotFoundError(img_path)

    model = YOLO("yolov8x.pt")

    results = model.predict(source=str(img_path), conf=conf_thres, verbose=False, imgsz=512*4)
    if not results:
        print("No results")
        return

    result = results[0]
    boxes = result.boxes
    names = result.names

    if boxes is None or len(boxes) == 0:
        print("No detections")
        return

    img = cv2.imread(str(img_path))
    if img is None:
        raise RuntimeError("Image read failed")

    print(f"Detections for {img_path}:")
    for box in boxes:
        cls_id = int(box.cls[0])
        cls_name = names[cls_id]
        conf = float(box.conf[0])
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        x1, y1, x2, y2 = map(int, (x1, y1, x2, y2))
        print(f"{cls_name:15s} conf={conf:.3f} box=({x1},{y1},{x2},{y2})")
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            img,
            f"{cls_name} {conf:.2f}",
            (x1, max(0, y1 - 5)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            (0, 255, 0),
            1,
            cv2.LINE_AA,
        )

    out_path = img_path.parent / "sat_1_yolo11s_annotated.png"
    cv2.imwrite(str(out_path), img)
    print(f"Annotated image saved to {out_path}")

    # print(model.names)
    return out_path

if __name__ == "__main__":
    run_single_yolo11s()
    