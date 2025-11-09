#!/usr/bin/env python3
"""
ONNX Runtime inference wrapper for YOLOv8 models.

This module provides a drop-in replacement for ultralytics YOLO class
using ONNX Runtime for inference. It maintains compatibility with existing
detection code while using the lightweight ONNX Runtime (~50 MB) instead
of PyTorch (~571 MB).

Usage:
    from api.utils.object_detection.onnx_detector import YOLO_ONNX

    model = YOLO_ONNX("api/models/yolov8n.onnx")
    results = model.predict(source="image.jpg", conf=0.25)
"""

import os
from pathlib import Path
from typing import Union, List, Tuple

import cv2
import numpy as np
import onnxruntime as ort


class ONNXDetectionResult:
    """
    Mimics ultralytics Results object structure.
    Provides compatibility with existing detection code.
    """

    def __init__(self, boxes_data, names, orig_shape):
        self.boxes = ONNXBoxes(boxes_data) if boxes_data is not None else None
        self.names = names
        self.orig_shape = orig_shape
        self.obb = None  # OBB not supported in this basic implementation

    def __len__(self):
        return len(self.boxes) if self.boxes is not None else 0


class ONNXBoxes:
    """
    Mimics ultralytics Boxes object structure.
    Stores detection boxes in xyxy format with confidence and class.
    """

    def __init__(self, boxes_data):
        """
        boxes_data: numpy array of shape (N, 6) with [x1, y1, x2, y2, conf, cls]
        """
        self.data = boxes_data

    @property
    def xyxy(self):
        """Returns boxes in xyxy format as numpy array."""
        if self.data is None or len(self.data) == 0:
            return np.array([]).reshape(0, 4)
        return self.data[:, :4]

    @property
    def conf(self):
        """Returns confidence scores as numpy array."""
        if self.data is None or len(self.data) == 0:
            return np.array([])
        return self.data[:, 4]

    @property
    def cls(self):
        """Returns class indices as numpy array."""
        if self.data is None or len(self.data) == 0:
            return np.array([])
        return self.data[:, 5]

    def __len__(self):
        return len(self.data) if self.data is not None else 0

    def __getitem__(self, idx):
        """Allow iteration over boxes."""
        class Box:
            def __init__(self, data):
                self._data = data
                self.xyxy = [data[:4]]
                self.conf = [data[4]]
                self.cls = [data[5]]

        return Box(self.data[idx])


class YOLO_ONNX:
    """
    ONNX Runtime wrapper for YOLOv8 models.
    Provides ultralytics-compatible interface.
    """

    # COCO dataset class names (YOLOv8 default)
    COCO_NAMES = {
        0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 4: 'airplane',
        5: 'bus', 6: 'train', 7: 'truck', 8: 'boat', 9: 'traffic light',
        10: 'fire hydrant', 11: 'stop sign', 12: 'parking meter', 13: 'bench',
        14: 'bird', 15: 'cat', 16: 'dog', 17: 'horse', 18: 'sheep', 19: 'cow',
        20: 'elephant', 21: 'bear', 22: 'zebra', 23: 'giraffe', 24: 'backpack',
        25: 'umbrella', 26: 'handbag', 27: 'tie', 28: 'suitcase', 29: 'frisbee',
        30: 'skis', 31: 'snowboard', 32: 'sports ball', 33: 'kite',
        34: 'baseball bat', 35: 'baseball glove', 36: 'skateboard',
        37: 'surfboard', 38: 'tennis racket', 39: 'bottle', 40: 'wine glass',
        41: 'cup', 42: 'fork', 43: 'knife', 44: 'spoon', 45: 'bowl',
        46: 'banana', 47: 'apple', 48: 'sandwich', 49: 'orange', 50: 'broccoli',
        51: 'carrot', 52: 'hot dog', 53: 'pizza', 54: 'donut', 55: 'cake',
        56: 'chair', 57: 'couch', 58: 'potted plant', 59: 'bed',
        60: 'dining table', 61: 'toilet', 62: 'tv', 63: 'laptop', 64: 'mouse',
        65: 'remote', 66: 'keyboard', 67: 'cell phone', 68: 'microwave',
        69: 'oven', 70: 'toaster', 71: 'sink', 72: 'refrigerator', 73: 'book',
        74: 'clock', 75: 'vase', 76: 'scissors', 77: 'teddy bear',
        78: 'hair drier', 79: 'toothbrush'
    }

    def __init__(self, model_path: str):
        """
        Initialize ONNX model.

        Args:
            model_path: Path to .onnx model file
        """
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"ONNX model not found: {model_path}")

        # Create ONNX Runtime session
        self.session = ort.InferenceSession(
            model_path,
            providers=['CPUExecutionProvider']  # Use CPU, can add CoreMLExecutionProvider for Mac
        )

        # Get model input/output info
        self.input_name = self.session.get_inputs()[0].name
        self.output_names = [output.name for output in self.session.get_outputs()]

        # Get input shape (usually [1, 3, 640, 640] for YOLOv8)
        input_shape = self.session.get_inputs()[0].shape
        self.input_height = input_shape[2]
        self.input_width = input_shape[3]

        # Class names
        self.names = self.COCO_NAMES

        print(f"✅ ONNX model loaded: {model_path}")
        print(f"   Input shape: {input_shape}")
        print(f"   Input size: {self.input_width}x{self.input_height}")

    def preprocess(self, image: np.ndarray) -> Tuple[np.ndarray, Tuple[int, int]]:
        """
        Preprocess image for YOLO inference.

        Args:
            image: BGR image from cv2.imread

        Returns:
            Preprocessed image tensor and original shape
        """
        orig_shape = image.shape[:2]  # (height, width)

        # Resize to model input size (letterbox with padding)
        img = self._letterbox(image, (self.input_height, self.input_width))

        # Convert BGR to RGB
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Normalize to [0, 1]
        img = img.astype(np.float32) / 255.0

        # HWC to CHW format
        img = np.transpose(img, (2, 0, 1))

        # Add batch dimension
        img = np.expand_dims(img, axis=0)

        return img, orig_shape

    def _letterbox(self, img: np.ndarray, new_shape: Tuple[int, int]) -> np.ndarray:
        """
        Resize image with padding to maintain aspect ratio.
        Similar to ultralytics letterbox preprocessing.
        """
        shape = img.shape[:2]  # current shape [height, width]

        # Scale ratio (new / old)
        r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])

        # Compute padding
        new_unpad = (int(round(shape[1] * r)), int(round(shape[0] * r)))
        dw = new_shape[1] - new_unpad[0]  # width padding
        dh = new_shape[0] - new_unpad[1]  # height padding

        dw /= 2  # divide padding into 2 sides
        dh /= 2

        if shape[::-1] != new_unpad:  # resize
            img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)

        top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
        left, right = int(round(dw - 0.1)), int(round(dw + 0.1))

        img = cv2.copyMakeBorder(
            img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114)
        )

        return img

    def postprocess(
        self,
        outputs: np.ndarray,
        orig_shape: Tuple[int, int],
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45
    ) -> np.ndarray:
        """
        Post-process ONNX outputs to get final detections.

        Args:
            outputs: Raw ONNX model outputs
            orig_shape: Original image shape (height, width)
            conf_threshold: Confidence threshold
            iou_threshold: IoU threshold for NMS

        Returns:
            Array of detections [x1, y1, x2, y2, conf, cls]
        """
        # YOLOv8 output format: (1, 84, 8400) where 84 = 4 (bbox) + 80 (classes)
        # Transpose to (8400, 84)
        predictions = outputs[0].transpose(0, 2, 1)[0]  # (8400, 84)

        # Extract boxes and scores
        boxes = predictions[:, :4]  # (8400, 4) - x_center, y_center, width, height
        scores = predictions[:, 4:]  # (8400, 80) - class scores

        # Get max class score and class index for each detection
        class_scores = np.max(scores, axis=1)  # (8400,)
        class_ids = np.argmax(scores, axis=1)  # (8400,)

        # Filter by confidence
        mask = class_scores > conf_threshold
        boxes = boxes[mask]
        class_scores = class_scores[mask]
        class_ids = class_ids[mask]

        if len(boxes) == 0:
            return np.array([]).reshape(0, 6)

        # Convert from xywh to xyxy format
        x_center, y_center, width, height = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
        x1 = x_center - width / 2
        y1 = y_center - height / 2
        x2 = x_center + width / 2
        y2 = y_center + height / 2

        boxes_xyxy = np.stack([x1, y1, x2, y2], axis=1)

        # Scale boxes to original image size
        boxes_xyxy = self._scale_boxes(boxes_xyxy, orig_shape)

        # Apply NMS
        indices = self._nms(boxes_xyxy, class_scores, iou_threshold)

        # Combine boxes, scores, and class IDs
        detections = np.hstack([
            boxes_xyxy[indices],
            class_scores[indices].reshape(-1, 1),
            class_ids[indices].reshape(-1, 1)
        ])

        return detections

    def _scale_boxes(self, boxes: np.ndarray, orig_shape: Tuple[int, int]) -> np.ndarray:
        """
        Scale boxes from model input size to original image size.
        """
        # Calculate scale and padding
        gain = min(self.input_height / orig_shape[0], self.input_width / orig_shape[1])
        pad_x = (self.input_width - orig_shape[1] * gain) / 2
        pad_y = (self.input_height - orig_shape[0] * gain) / 2

        # Remove padding and scale
        boxes[:, [0, 2]] = (boxes[:, [0, 2]] - pad_x) / gain  # x coordinates
        boxes[:, [1, 3]] = (boxes[:, [1, 3]] - pad_y) / gain  # y coordinates

        # Clip to image bounds
        boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, orig_shape[1])
        boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, orig_shape[0])

        return boxes

    def _nms(self, boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> List[int]:
        """
        Non-Maximum Suppression.
        """
        x1 = boxes[:, 0]
        y1 = boxes[:, 1]
        x2 = boxes[:, 2]
        y2 = boxes[:, 3]

        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]

        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)

            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])

            w = np.maximum(0.0, xx2 - xx1)
            h = np.maximum(0.0, yy2 - yy1)
            inter = w * h

            iou = inter / (areas[i] + areas[order[1:]] - inter)

            inds = np.where(iou <= iou_threshold)[0]
            order = order[inds + 1]

        return keep

    def predict(
        self,
        source: Union[str, np.ndarray],
        conf: float = 0.25,
        iou: float = 0.45,
        imgsz: int = 640,
        verbose: bool = True
    ) -> List[ONNXDetectionResult]:
        """
        Run inference on image(s).

        Args:
            source: Image path or numpy array
            conf: Confidence threshold
            iou: IoU threshold for NMS
            imgsz: Input image size (not used, model size is fixed)
            verbose: Print verbose output

        Returns:
            List of detection results (compatible with ultralytics)
        """
        # Load image if path provided
        if isinstance(source, (str, Path)):
            image = cv2.imread(str(source))
            if image is None:
                raise ValueError(f"Failed to load image: {source}")
        else:
            image = source

        # Preprocess
        input_tensor, orig_shape = self.preprocess(image)

        # Run inference
        outputs = self.session.run(self.output_names, {self.input_name: input_tensor})

        # Postprocess
        detections = self.postprocess(outputs, orig_shape, conf, iou)

        # Create result object
        result = ONNXDetectionResult(detections, self.names, orig_shape)

        if verbose and len(result) > 0:
            print(f"Detected {len(result)} objects")

        return [result]

    def export(self, *args, **kwargs):
        """Dummy method for compatibility - model is already exported."""
        raise NotImplementedError("Model is already in ONNX format")


def load_onnx_model(model_path: str = "api/models/yolov8n.onnx") -> YOLO_ONNX:
    """
    Convenience function to load ONNX YOLO model.

    Args:
        model_path: Path to ONNX model file

    Returns:
        YOLO_ONNX model instance
    """
    return YOLO_ONNX(model_path)


if __name__ == "__main__":
    # Test the ONNX model
    import sys

    model_path = "api/models/yolov8n.onnx"
    if not os.path.exists(model_path):
        print(f"❌ ONNX model not found: {model_path}")
        print("Please run: python scripts/export_yolo_to_onnx.py")
        sys.exit(1)

    model = YOLO_ONNX(model_path)
    print(f"\n✅ ONNX model loaded successfully")
    print(f"Model supports {len(model.names)} classes")
    print(f"Sample classes: {list(model.names.values())[:10]}")
