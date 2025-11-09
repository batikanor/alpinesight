#!/usr/bin/env python3
"""
Export YOLOv8 model to ONNX format for Vercel deployment.

This script converts the PyTorch YOLOv8 model to ONNX format,
which is much smaller and works within Vercel's 250 MB limit.

Usage:
    python scripts/export_yolo_to_onnx.py
"""

from ultralytics import YOLO
import os
from pathlib import Path

def export_yolo_to_onnx(
    model_name: str = "yolov8n.pt",  # nano model (smallest)
    output_dir: str = "api/models",
    simplify: bool = True,
    opset: int = 12,
):
    """
    Export YOLO model to ONNX format.

    Args:
        model_name: YOLOv8 model name (yolov8n.pt, yolov8s.pt, etc.)
        output_dir: Directory to save the ONNX model
        simplify: Whether to simplify the ONNX model (recommended)
        opset: ONNX opset version (12 is stable)
    """
    print(f"🔄 Loading YOLOv8 model: {model_name}")

    # Load the YOLOv8 model
    model = YOLO(model_name)

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"📦 Exporting to ONNX format...")
    print(f"   - Simplify: {simplify}")
    print(f"   - Opset: {opset}")

    # Export to ONNX
    # This will create a .onnx file in the same directory as the model
    success = model.export(
        format="onnx",
        simplify=simplify,
        opset=opset,
        dynamic=False,  # Static shapes for better performance
        imgsz=640,      # Input image size
    )

    # Move the exported file to our models directory
    model_base = model_name.replace('.pt', '')
    source_onnx = f"{model_base}.onnx"
    dest_onnx = output_path / f"{model_base}.onnx"

    if os.path.exists(source_onnx):
        os.rename(source_onnx, dest_onnx)
        print(f"✅ ONNX model exported to: {dest_onnx}")

        # Print file size comparison
        if os.path.exists(model_name):
            pt_size = os.path.getsize(model_name) / (1024 * 1024)
            onnx_size = os.path.getsize(dest_onnx) / (1024 * 1024)
            print(f"\n📊 Size Comparison:")
            print(f"   PyTorch (.pt):  {pt_size:.2f} MB")
            print(f"   ONNX (.onnx):   {onnx_size:.2f} MB")
            print(f"   Reduction:      {((pt_size - onnx_size) / pt_size * 100):.1f}%")

        return dest_onnx
    else:
        print(f"❌ Export failed: {source_onnx} not found")
        return None


if __name__ == "__main__":
    # Export the nano model (smallest, fastest)
    export_yolo_to_onnx(
        model_name="yolov8n.pt",
        output_dir="api/models",
        simplify=True,
    )

    print("\n✨ Next steps:")
    print("1. Update requirements.txt to use onnxruntime instead of ultralytics")
    print("2. Update your detection code to use ONNX Runtime")
    print("3. Deploy to Vercel!")
