from pathlib import Path
import cv2
from ultralytics import YOLO

def run_yolo11_obb_single(
    image_path="/Users/lukasbauer/alpinesight/test_data/sat_5.jpeg",
    model_path="yolo11n-obb.pt",
    conf_thres=0.02,
):
    img_path = Path(image_path)
    if not img_path.exists():
        raise FileNotFoundError(img_path)

    model = YOLO(model_path)
    img = cv2.imread(str(img_path))
    if img is None:
        raise RuntimeError("Could not read image")

    # direct predict with higher imgsz since objects are small
    results = model.predict(
        source=img,
        conf=conf_thres,
        imgsz=1280,
        verbose=False,
        iou=0.5,          # NMS IoU Schwelle (bei OBB = rotated IoU)
        agnostic_nms=False,
    )

    r = results[0]
    if r.obb is None or len(r.obb) == 0:
        print("No OBB detections")
        return

    boxes = r.obb.xyxy.cpu().numpy()  # axis aligned from oriented boxes
    scores = r.obb.conf.cpu().numpy()
    classes = r.obb.cls.cpu().numpy().astype(int)
    names = r.names

    count = 0
    vis = img.copy()
    for (x1, y1, x2, y2), conf, cls_id in zip(boxes, scores, classes):
        cls_name = names.get(int(cls_id), str(cls_id))
        # pick vehicle like classes from DOTA style labels
        if "vehicle" in cls_name or "car" in cls_name or "truck" in cls_name:
            count += 1
            x1 = int(x1)
            y1 = int(y1)
            x2 = int(x2)
            y2 = int(y2)
            cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 255, 0), 1)
            cv2.putText(
                vis,
                f"{cls_name} {conf:.2f}",
                (x1, max(0, y1 - 3)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.35,
                (0, 255, 0),
                1,
                cv2.LINE_AA,
            )

    out_path = img_path.parent / "sat_1_yolo11_obb.png"
    cv2.imwrite(str(out_path), vis)
    print(f"Vehicle like detections: {count}")
    print(f"Annotated image: {out_path}")
    return count, str(out_path)

if __name__ == "__main__":
    run_yolo11_obb_single()

