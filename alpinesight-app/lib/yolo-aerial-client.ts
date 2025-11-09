/**
 * Client-side YOLO-OBB detection for aerial/satellite imagery
 * Uses YOLOv8-OBB model trained on DOTA dataset
 */

import * as ort from 'onnxruntime-web';

export interface Detection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  angle?: number; // rotation angle for OBB
}

// DOTA dataset classes (aerial imagery) - official DOTA v1.0 order
const DOTA_CLASSES = [
  'plane',                // 0
  'ship',                 // 1
  'storage-tank',         // 2
  'baseball-diamond',     // 3
  'tennis-court',         // 4
  'basketball-court',     // 5
  'ground-track-field',   // 6
  'harbor',               // 7
  'bridge',               // 8
  'large-vehicle',        // 9
  'small-vehicle',        // 10
  'helicopter',           // 11
  'roundabout',           // 12
  'soccer-ball-field',    // 13
  'swimming-pool'         // 14
];

class YOLOOBBDetector {
  private session: ort.InferenceSession | null = null;
  private modelLoaded = false;

  async loadModel(modelUrl: string = '/models/yolo11n-obb.onnx'): Promise<void> {
    if (this.modelLoaded) return;

    console.log('🔄 Loading YOLO11-OBB aerial model from:', modelUrl);

    try {
      const executionProviders: string[] = [];

      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        executionProviders.push('webgpu');
        console.log('✅ WebGPU available');
      }

      executionProviders.push('wasm');

      this.session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: executionProviders as any,
      });

      this.modelLoaded = true;
      console.log('✅ YOLO11-OBB aerial model loaded successfully');
      console.log('   Input/Output:', this.session.inputNames, this.session.outputNames);
    } catch (error) {
      console.error('❌ Failed to load YOLO-OBB model:', error);
      throw error;
    }
  }

  private preprocessImage(
    imageData: ImageData,
    targetWidth = 640,
    targetHeight = 640
  ): { tensor: ort.Tensor; scale: number; padX: number; padY: number } {
    const { width, height } = imageData;

    const scale = Math.min(targetWidth / width, targetHeight / height);
    const scaledWidth = Math.round(width * scale);
    const scaledHeight = Math.round(height * scale);
    const padX = Math.floor((targetWidth - scaledWidth) / 2);
    const padY = Math.floor((targetHeight - scaledHeight) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);

    ctx.drawImage(
      tempCanvas,
      0, 0, width, height,
      padX, padY, scaledWidth, scaledHeight
    );

    const resizedData = ctx.getImageData(0, 0, targetWidth, targetHeight);

    const tensorData = new Float32Array(3 * targetHeight * targetWidth);
    const pixels = resizedData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const pixelIndex = i / 4;
      const r = pixels[i] / 255.0;
      const g = pixels[i + 1] / 255.0;
      const b = pixels[i + 2] / 255.0;

      tensorData[pixelIndex] = r;
      tensorData[targetHeight * targetWidth + pixelIndex] = g;
      tensorData[2 * targetHeight * targetWidth + pixelIndex] = b;
    }

    const tensor = new ort.Tensor('float32', tensorData, [1, 3, targetHeight, targetWidth]);

    return { tensor, scale, padX, padY };
  }

  private nms(
    boxes: number[][],
    scores: number[],
    iouThreshold: number
  ): number[] {
    const indices: number[] = [];
    const sortedIndices = scores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.idx);

    while (sortedIndices.length > 0) {
      const current = sortedIndices.shift()!;
      indices.push(current);

      const currentBox = boxes[current];

      sortedIndices.splice(0, sortedIndices.length, ...sortedIndices.filter(idx => {
        const box = boxes[idx];
        const iou = this.calculateIoU(currentBox, box);
        return iou <= iouThreshold;
      }));
    }

    return indices;
  }

  private calculateIoU(box1: number[], box2: number[]): number {
    const [x1_1, y1_1, x2_1, y2_1] = box1;
    const [x1_2, y1_2, x2_2, y2_2] = box2;

    const x1 = Math.max(x1_1, x1_2);
    const y1 = Math.max(y1_1, y1_2);
    const x2 = Math.min(x2_1, x2_2);
    const y2 = Math.min(y2_1, y2_2);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = (x2_1 - x1_1) * (y2_1 - y1_1);
    const area2 = (x2_2 - x1_2) * (y2_2 - y1_2);
    const union = area1 + area2 - intersection;

    return intersection / union;
  }

  async detect(
    imageData: ImageData,
    confThreshold = 0.25,
    iouThreshold = 0.45
  ): Promise<Detection[]> {
    if (!this.session) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    const { tensor, scale, padX, padY } = this.preprocessImage(imageData);

    const startTime = performance.now();
    const results = await this.session.run({ images: tensor });
    const inferenceTime = performance.now() - startTime;
    console.log(`⚡ Aerial inference time: ${inferenceTime.toFixed(2)}ms`);

    // OBB output format: [1, 20, 8400] - [batch, (x, y, w, h, angle, class scores...), anchors]
    const output = results.output0.data as Float32Array;
    const outputShape = results.output0.dims; // [1, 20, 8400]
    const numClasses = 15; // DOTA has 15 classes

    const detections: Detection[] = [];
    const boxes: number[][] = [];
    const scores: number[] = [];
    const classIds: number[] = [];

    // Parse detections
    for (let i = 0; i < outputShape[2]; i++) {
      let maxScore = 0;
      let maxClass = 0;

      // Class scores start at index 5 (after x, y, w, h, angle)
      for (let c = 0; c < numClasses; c++) {
        const score = output[i + (5 + c) * outputShape[2]];
        if (score > maxScore) {
          maxScore = score;
          maxClass = c;
        }
      }

      if (maxScore < confThreshold) continue;

      // Get box (xywh format, plus angle)
      const cx = output[i];
      const cy = output[i + outputShape[2]];
      const w = output[i + 2 * outputShape[2]];
      const h = output[i + 3 * outputShape[2]];
      // const angle = output[i + 4 * outputShape[2]]; // rotation angle (not used for now)

      const x1 = (cx - w / 2 - padX) / scale;
      const y1 = (cy - h / 2 - padY) / scale;
      const x2 = (cx + w / 2 - padX) / scale;
      const y2 = (cy + h / 2 - padY) / scale;

      boxes.push([x1, y1, x2, y2]);
      scores.push(maxScore);
      classIds.push(maxClass);
    }

    const keepIndices = this.nms(boxes, scores, iouThreshold);

    console.log(`🔍 Before NMS: ${boxes.length} detections`);
    console.log(`🔍 After NMS: ${keepIndices.length} detections`);

    // Log class distribution
    const classCounts: { [key: string]: number } = {};
    for (const idx of keepIndices) {
      const className = DOTA_CLASSES[classIds[idx]] || `class_${classIds[idx]}`;
      classCounts[className] = (classCounts[className] || 0) + 1;

      detections.push({
        class: className,
        confidence: scores[idx],
        bbox: boxes[idx] as [number, number, number, number],
      });
    }

    console.log(`✅ Found ${detections.length} aerial objects:`, classCounts);
    return detections;
  }
}

let detector: YOLOOBBDetector | null = null;

export async function getYOLOAerialDetector(): Promise<YOLOOBBDetector> {
  if (!detector) {
    detector = new YOLOOBBDetector();
    await detector.loadModel();
  }
  return detector;
}

export async function detectAerialObjects(
  image: HTMLImageElement | HTMLCanvasElement,
  confThreshold = 0.15,
  iouThreshold = 0.3
): Promise<Detection[]> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const detector = await getYOLOAerialDetector();
  return detector.detect(imageData, confThreshold, iouThreshold);
}
