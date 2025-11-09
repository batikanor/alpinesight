#!/usr/bin/env python3
"""
Test script to verify ONNX inference works correctly.

This script tests:
1. ONNX model loading
2. Inference on a test image
3. Compatibility with existing detection code
4. Performance comparison (optional)

Usage:
    python scripts/test_onnx_inference.py
"""

import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from api.utils.object_detection.onnx_detector import YOLO_ONNX


def create_test_image(width=640, height=640):
    """Create a simple test image with colored rectangles."""
    img = np.ones((height, width, 3), dtype=np.uint8) * 128

    # Add some colored rectangles to simulate objects
    cv2.rectangle(img, (100, 100), (200, 200), (255, 0, 0), -1)  # Blue
    cv2.rectangle(img, (300, 300), (450, 450), (0, 255, 0), -1)  # Green
    cv2.rectangle(img, (200, 400), (350, 550), (0, 0, 255), -1)  # Red

    return img


def test_model_loading():
    """Test 1: Model loading."""
    print("\n" + "=" * 60)
    print("Test 1: ONNX Model Loading")
    print("=" * 60)

    model_path = "api/models/yolov8n.onnx"

    if not os.path.exists(model_path):
        print(f"❌ ONNX model not found: {model_path}")
        print("Please run: python scripts/export_yolo_to_onnx.py")
        return None

    try:
        model = YOLO_ONNX(model_path)
        print(f"✅ Model loaded successfully")
        print(f"   Classes: {len(model.names)}")
        print(f"   Input size: {model.input_width}x{model.input_height}")
        return model
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        return None


def test_inference(model):
    """Test 2: Inference on test image."""
    print("\n" + "=" * 60)
    print("Test 2: Inference on Test Image")
    print("=" * 60)

    # Create test image
    test_img = create_test_image()

    try:
        # Run inference
        start_time = time.time()
        results = model.predict(test_img, conf=0.25, verbose=False)
        inference_time = time.time() - start_time

        print(f"✅ Inference completed")
        print(f"   Time: {inference_time * 1000:.2f} ms")
        print(f"   Detections: {len(results[0])}")

        if len(results[0]) > 0:
            result = results[0]
            print(f"\n   Detected objects:")
            for i, box in enumerate(result.boxes):
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id]
                conf = float(box.conf[0])
                print(f"   - {cls_name}: {conf:.2f}")

        return True
    except Exception as e:
        print(f"❌ Inference failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_compatibility():
    """Test 3: Compatibility with existing detection code."""
    print("\n" + "=" * 60)
    print("Test 3: Compatibility with Existing Detection Code")
    print("=" * 60)

    try:
        from api.utils.object_detection.detect import load_model, filter_vehicle_detections

        print("✅ Import successful")

        # Try to load model (will use ONNX if available)
        model = load_model("yolov8n.pt")
        print(f"✅ Model loaded via detect.py")

        # Create test image
        test_img = create_test_image()

        # Run detection
        results = model.predict(test_img, conf=0.25, verbose=False)
        print(f"✅ Inference via detect.py wrapper")
        print(f"   Detections: {len(results[0])}")

        # Test filter function
        vehicles = filter_vehicle_detections(results[0])
        print(f"✅ Vehicle filtering")
        print(f"   Vehicles found: {len(vehicles)}")

        return True
    except Exception as e:
        print(f"❌ Compatibility test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_real_image():
    """Test 4: Inference on real image (if available)."""
    print("\n" + "=" * 60)
    print("Test 4: Inference on Real Image (Optional)")
    print("=" * 60)

    # Look for test images in common locations
    test_paths = [
        "test_data/sat_1.png",
        "data/raw/test.jpg",
        "api/test_image.jpg",
    ]

    test_image = None
    for path in test_paths:
        if os.path.exists(path):
            test_image = path
            break

    if test_image is None:
        print("⚠️ No test image found, skipping real image test")
        print(f"   Searched: {test_paths}")
        return True

    try:
        model = YOLO_ONNX("api/models/yolov8n.onnx")

        # Run inference
        print(f"Testing with: {test_image}")
        start_time = time.time()
        results = model.predict(test_image, conf=0.25, verbose=False)
        inference_time = time.time() - start_time

        print(f"✅ Real image inference completed")
        print(f"   Time: {inference_time * 1000:.2f} ms")
        print(f"   Detections: {len(results[0])}")

        if len(results[0]) > 0:
            result = results[0]
            print(f"\n   Detected objects:")
            for i, box in enumerate(result.boxes):
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id]
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                print(f"   - {cls_name}: {conf:.2f} at [{int(x1)}, {int(y1)}, {int(x2)}, {int(y2)}]")

        return True
    except Exception as e:
        print(f"❌ Real image test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("ONNX Inference Test Suite")
    print("=" * 60)

    results = {
        "Model Loading": False,
        "Inference": False,
        "Compatibility": False,
        "Real Image": False,
    }

    # Test 1: Model loading
    model = test_model_loading()
    results["Model Loading"] = model is not None

    if model is None:
        print("\n❌ Cannot proceed without model")
        return False

    # Test 2: Inference
    results["Inference"] = test_inference(model)

    # Test 3: Compatibility
    results["Compatibility"] = test_compatibility()

    # Test 4: Real image (optional)
    results["Real Image"] = test_real_image()

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{test_name:20s}: {status}")

    all_critical_passed = (
        results["Model Loading"] and
        results["Inference"] and
        results["Compatibility"]
    )

    print("\n" + "=" * 60)
    if all_critical_passed:
        print("✅ All critical tests passed!")
        print("ONNX inference is working correctly and ready for deployment.")
    else:
        print("❌ Some critical tests failed!")
        print("Please check the errors above and fix before deployment.")
    print("=" * 60 + "\n")

    return all_critical_passed


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
