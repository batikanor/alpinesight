from pathlib import Path
import cv2
from ultralytics import YOLO

def is_vehicle_label(name: str) -> bool:
    name = name.lower()
    return (
        "small-vehicle" in name
        or "large-vehicle" in name
        or "vehicle" in name
    )

def count_vehicles_timeseries_simple(
    image_paths,
    dates,
    model_path="yolo11n-obb.pt",
    conf_thres=0.2,
    imgsz=1280,
):
    """
    image_paths and dates must have same length
    Applies the same logic as your working run_yolo11_obb_single
    Returns:
      annotated_paths: list of output image paths
      counts: list of vehicle counts per image
      details: list of dicts per image
    """
    if len(image_paths) != len(dates):
        raise ValueError("image_paths and dates must have same length")

    model = YOLO(model_path)

    annotated_paths = []
    counts = []
    details = []

    for img_path, date in zip(image_paths, dates):
        img_path = Path(img_path)
        if not img_path.exists():
            raise FileNotFoundError(img_path)

        img = cv2.imread(str(img_path))
        if img is None:
            raise RuntimeError(f"Could not read {img_path}")

        results = model.predict(
            source=img,
            conf=conf_thres,
            imgsz=imgsz,
            verbose=False
        )

        r = results[0]

        if r.obb is None or len(r.obb) == 0:
            print(f"{img_path}: No OBB detections")
            annotated_path = str(img_path.with_name(f"{img_path.stem}_yolo11_obb.png"))
            cv2.imwrite(annotated_path, img)
            annotated_paths.append(annotated_path)
            counts.append(0)
            details.append(
                {
                    "date": date,
                    "image": str(img_path),
                    "annotated_image": annotated_path,
                    "total": 0,
                    "per_class": {},
                    "boxes": [],
                    "avg_conf": 0.0,
                }
            )
            continue

        boxes = r.obb.xyxy.cpu().numpy()
        scores = r.obb.conf.cpu().numpy()
        classes = r.obb.cls.cpu().numpy().astype(int)
        names = r.names

        vis = img.copy()
        total = 0
        per_class = {}
        box_list = []

        for (x1, y1, x2, y2), conf, cls_id in zip(boxes, scores, classes):
            cls_name = names.get(int(cls_id), str(cls_id))
            if not is_vehicle_label(cls_name):
                continue

            total += 1
            per_class[cls_name] = per_class.get(cls_name, 0) + 1

            x1i = int(x1)
            y1i = int(y1)
            x2i = int(x2)
            y2i = int(y2)

            cv2.rectangle(vis, (x1i, y1i), (x2i, y2i), (0, 255, 0), 1)
            cv2.putText(
                vis,
                f"{cls_name} {conf:.2f}",
                (x1i, max(0, y1i - 3)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.35,
                (0, 255, 0),
                1,
                cv2.LINE_AA,
            )

            box_list.append(
                {
                    "x1": float(x1),
                    "y1": float(y1),
                    "x2": float(x2),
                    "y2": float(y2),
                    "conf": float(conf),
                    "label": cls_name,
                }
            )

        out_path = img_path.with_name(f"{img_path.stem}_yolo11_obb.png")
        cv2.imwrite(str(out_path), vis)

        avg_conf = float(sum(b["conf"] for b in box_list) / len(box_list)) if box_list else 0.0

        print(f"{img_path}: {total} vehicle like detections -> {out_path}")

        annotated_paths.append(str(out_path))
        counts.append(total)
        details.append(
            {
                "date": date,
                "image": str(img_path),
                "annotated_image": str(out_path),
                "total": total,
                "per_class": per_class,
                "boxes": box_list,
                "avg_conf": avg_conf,
            }
        )

    return annotated_paths, counts, details

def dummy_run():
    image_paths = [
        "/Users/lukasbauer/alpinesight/test_data/sat_1.png",
        "/Users/lukasbauer/alpinesight/test_data/sat_2.png",
        "/Users/lukasbauer/alpinesight/test_data/sat_3.jpeg",
        "/Users/lukasbauer/alpinesight/test_data/sat_4.jpeg",
    ]
    dates = [
        "2025-11-07",
        "2025-11-08",
        "2025-11-09",
        "2025-11-10",
    ]
    return count_vehicles_timeseries_simple(image_paths, dates)

if __name__ == "__main__":
    annotated_paths, counts, details = dummy_run()
    print(counts)

