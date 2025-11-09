"use client";

import { useGlobe } from "@/contexts/globe-context";
import { detectAerialObjects, Detection } from "@/lib/yolo-aerial-client";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface TimelineItem {
  releaseNum: number;
  releaseDate: string;
  releaseDatetime: number;
  title: string;
  tileUrl: string;
  provider: string;
}

interface SatelliteImageViewerProps {
  location: string;
  latitude: number;
  longitude: number;
  // New: callback to append analysis message
  onAnalysisComplete?: (data: {
    points: { date: string; count: number }[];
  }) => void;
}

interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
  class: string;
  confidence: number;
}

interface AnnotationEntry {
  date: string;
  boxes: BoundingBox[];
}

export function SatelliteImageViewer({
  location,
  latitude,
  longitude,
  onAnalysisComplete,
}: SatelliteImageViewerProps) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [annotationData, setAnnotationData] = useState<AnnotationEntry[]>([]);
  const [autoplayDone, setAutoplayDone] = useState(false);
  const autoplayRef = useRef<NodeJS.Timeout | null>(null);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const analysisSentRef = useRef(false);

  // Ensure globe is closed when the satellite viewer mounts (and clear markers)
  const { setIsGlobeOpen, clearMarkers } = useGlobe();
  useEffect(() => {
    setIsGlobeOpen(false);
    clearMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function fetchTimeline() {
      try {
        setLoading(true);
        const url = `/api/wayback?lat=${latitude}&lng=${longitude}&zoom=18&mode=all`;
        console.log("🛰️ Fetching satellite timeline:", url);

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error("Failed to fetch satellite imagery");
        }

        const data = await response.json();
        console.log("📸 Received satellite data:", data);
        setTimeline(data.timeline);
        setCurrentIndex(0);
        analysisSentRef.current = false; // reset analysis sent when new timeline fetched
      } catch (err) {
        console.error("❌ Error fetching wayback timeline:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchTimeline();
  }, [latitude, longitude]);

  const currentImage = timeline[currentIndex];

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : timeline.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < timeline.length - 1 ? prev + 1 : 0));
  };

  useEffect(() => {
    // Start autoplay once timeline loaded
    if (timeline.length && !autoplayDone) {
      setAnnotationData([]);
      analysisSentRef.current = false; // reset when restarting autoplay
      if (autoplayRef.current) clearTimeout(autoplayRef.current);

      const play = async (index: number) => {
        setCurrentIndex(index);

        // Run YOLO detection on the current image
        const img = document.createElement("img");
        img.crossOrigin = "anonymous";
        img.src = timeline[index].tileUrl;

        try {
          await img.decode();

          // Run aerial detection (YOLO11-OBB trained on DOTA dataset for aerial imagery)
          const detections = await detectAerialObjects(img, 0.000001, 0.3);

          console.log(
            `🔍 Raw detections for ${timeline[index].releaseDate}:`,
            detections
          );

          // Convert YOLO detections to bounding boxes (percentage-based)
          const boxes: BoundingBox[] = detections.map((det: Detection) => ({
            left: (det.bbox[0] / img.width) * 100,
            top: (det.bbox[1] / img.height) * 100,
            width: ((det.bbox[2] - det.bbox[0]) / img.width) * 100,
            height: ((det.bbox[3] - det.bbox[1]) / img.height) * 100,
            class: det.class,
            confidence: det.confidence,
          }));

          // Filter for vehicles only
          const vehicleClasses = ["small-vehicle", "large-vehicle"];
          const vehicles = boxes.filter((b) =>
            vehicleClasses.includes(b.class)
          );
          console.log(
            `🚗 Detected ${boxes.length} total objects (${vehicles.length} vehicles) in ${timeline[index].releaseDate}`
          );

          setAnnotationData((prev) => {
            if (prev.find((p) => p.date === timeline[index].releaseDate))
              return prev;
            return [
              ...prev,
              { date: timeline[index].releaseDate, boxes: vehicles },
            ]; // Only save vehicles!
          });
        } catch (error) {
          console.error("❌ Detection failed:", error);
          // Add empty boxes on error so we don't block progress
          setAnnotationData((prev) => {
            if (prev.find((p) => p.date === timeline[index].releaseDate))
              return prev;
            return [...prev, { date: timeline[index].releaseDate, boxes: [] }];
          });
        }

        if (index < timeline.length - 1) {
          autoplayRef.current = setTimeout(() => play(index + 1), 800);
        } else {
          setAutoplayDone(true);
        }
      };

      play(0);
    }
  }, [timeline, autoplayDone]);

  // When autoplay completes fire analysis callback
  useEffect(() => {
    if (
      autoplayDone &&
      annotationData.length === timeline.length &&
      onAnalysisComplete &&
      !analysisSentRef.current
    ) {
      analysisSentRef.current = true;
      const points = annotationData.map((e) => ({
        date: e.date,
        count: e.boxes.length,
      }));
      onAnalysisComplete({ points });
    }
  }, [autoplayDone, annotationData, timeline.length, onAnalysisComplete]);

  // Cleanup timer
  useEffect(
    () => () => {
      if (autoplayRef.current) clearTimeout(autoplayRef.current);
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 px-4 rounded-lg border border-border/50 bg-muted/30">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mr-2" />
        <span className="text-muted-foreground">
          Loading satellite imagery...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8 px-4 rounded-lg border border-border/50 bg-muted/30 text-red-400">
        <p>Error: {error}</p>
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 px-4 rounded-lg border border-border/50 bg-muted/30 text-muted-foreground">
        <p>No satellite imagery available for this location</p>
      </div>
    );
  }

  if (!currentImage) return null;

  return (
    <div className="space-y-4 p-4 rounded-lg border border-border/50 bg-muted/30">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Satellite Imagery Timeline
          </h4>
          <p className="text-xs text-muted-foreground">
            {location} • {timeline.length} versions available
          </p>
        </div>
      </div>

      {/* Image Viewer */}
      <div
        ref={imageContainerRef}
        className="relative aspect-square max-w-full mx-auto bg-black rounded-lg overflow-hidden"
      >
        <Image
          src={currentImage.tileUrl}
          alt={`Satellite imagery from ${currentImage.releaseDate}`}
          fill
          className="object-contain"
          unoptimized
        />

        {/* Navigation Arrows */}
        <button
          onClick={goToPrevious}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          aria-label="Previous image"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={goToNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          aria-label="Next image"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Date Label */}
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm">
          <p className="text-white text-sm font-semibold">
            {currentImage.releaseDate}
          </p>
          <p className="text-xs text-white/70">{currentImage.provider}</p>
        </div>

        {/* YOLO Detection Overlay */}
        {annotationData.find((p) => p.date === currentImage.releaseDate) && (
          <div className="absolute inset-0 pointer-events-none">
            {annotationData
              .find((p) => p.date === currentImage.releaseDate)!
              .boxes.map((b, i) => (
                <div
                  key={i}
                  className="absolute border-2 border-red-500"
                  style={{
                    left: `${b.left}%`,
                    top: `${b.top}%`,
                    width: `${b.width}%`,
                    height: `${b.height}%`,
                  }}
                  title={`${b.class} (${(b.confidence * 100).toFixed(1)}%)`}
                />
              ))}
          </div>
        )}

        {/* Autoplay progress indicator */}
        {!autoplayDone && (
          <div className="absolute bottom-2 left-2 right-2 h-1 bg-white/20">
            <div
              className="h-full bg-red-500 transition-all"
              style={{
                width: `${
                  ((annotationData.length - 1) /
                    Math.max(timeline.length - 1, 1)) *
                  100
                }%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Timeline Slider (disabled during autoplay) */}
      <div className="space-y-2 opacity-80">
        <input
          type="range"
          min="0"
          max={timeline.length - 1}
          value={currentIndex}
          onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
          disabled={!autoplayDone}
          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{timeline[timeline.length - 1]?.releaseDate}</span>
          <span className="font-medium">
            {currentIndex + 1} / {timeline.length}
          </span>
          <span>{timeline[0]?.releaseDate}</span>
        </div>
      </div>
    </div>
  );
}
