"use client";

import { useGlobe } from "@/contexts/globe-context";
import { detectAerialObjects, Detection } from "@/lib/yolo-aerial-client";
import { detectVehiclesWithVision } from "@/lib/multimodal-detection";
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
  const [detectionMode, setDetectionMode] = useState<"yolo" | "multimodal">("multimodal");
  const [visionProvider, setVisionProvider] = useState<"anthropic" | "openai">("openai");
  const [liveDetectionResult, setLiveDetectionResult] = useState<string | null>(null);

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

        try {
          let boxes: BoundingBox[] = [];

          if (detectionMode === "yolo") {
            // YOLO detection mode
            setLiveDetectionResult("🔍 Analyzing with YOLO...");

            const img = document.createElement("img");
            img.crossOrigin = "anonymous";
            img.src = timeline[index].tileUrl;
            await img.decode();

            const detections = await detectAerialObjects(img);

            console.log(
              `🔍 YOLO detections for ${timeline[index].releaseDate}:`,
              detections
            );

            // Convert YOLO detections to bounding boxes (percentage-based)
            boxes = detections.map((det: Detection) => ({
              left: (det.bbox[0] / img.width) * 100,
              top: (det.bbox[1] / img.height) * 100,
              width: ((det.bbox[2] - det.bbox[0]) / img.width) * 100,
              height: ((det.bbox[3] - det.bbox[1]) / img.height) * 100,
              class: det.class,
              confidence: det.confidence,
            }));

            console.log(
              `🚗 YOLO detected ${boxes.length} vehicles in ${timeline[index].releaseDate}`
            );

            setLiveDetectionResult(`✅ Found ${boxes.length} vehicle${boxes.length !== 1 ? 's' : ''}`);
          } else {
            // Multimodal AI detection mode
            setLiveDetectionResult(`🤖 Analyzing with ${visionProvider === 'anthropic' ? 'Claude' : 'GPT-5 mini'}...`);

            console.log(
              `🤖 Using ${visionProvider} vision for ${timeline[index].releaseDate}`
            );

            const result = await detectVehiclesWithVision(
              timeline[index].tileUrl,
              visionProvider
            );

            console.log(
              `🚗 Vision detected ${result.vehicleCount} vehicles (confidence: ${result.confidence}):`,
              result.description
            );

            // Show live result with AI's description
            setLiveDetectionResult(
              `✅ Found ${result.vehicleCount} vehicle${result.vehicleCount !== 1 ? 's' : ''}: ${result.description}`
            );

            // For vision mode, we don't have bounding boxes, just a count
            // We'll create empty boxes array and store count in description
            boxes = [];
            // Store the count in the annotation for chart purposes
            setAnnotationData((prev) => {
              if (prev.find((p) => p.date === timeline[index].releaseDate))
                return prev;
              return [
                ...prev,
                {
                  date: timeline[index].releaseDate,
                  boxes: Array(result.vehicleCount).fill({
                    left: 0,
                    top: 0,
                    width: 0,
                    height: 0,
                    class: "vehicle",
                    confidence: result.confidence,
                  }),
                },
              ];
            });

            if (index < timeline.length - 1) {
              autoplayRef.current = setTimeout(() => play(index + 1), 2000); // Longer delay for API calls
            } else {
              setAutoplayDone(true);
              setLiveDetectionResult(null); // Clear when done
            }
            return; // Skip the normal box setting below
          }

          setAnnotationData((prev) => {
            if (prev.find((p) => p.date === timeline[index].releaseDate))
              return prev;
            return [
              ...prev,
              { date: timeline[index].releaseDate, boxes },
            ];
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
          setLiveDetectionResult(null); // Clear when done
        }
      };

      play(0);
    }
  }, [timeline, autoplayDone, detectionMode, visionProvider]);

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

      {/* Detection Mode Selector */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Detection:
          </span>
          <button
            onClick={() => {
              setDetectionMode("multimodal");
              if (autoplayDone) {
                setAutoplayDone(false);
              }
            }}
            disabled={!autoplayDone}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              detectionMode === "multimodal"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Multimodal AI
          </button>
          <button
            onClick={() => {
              setDetectionMode("yolo");
              if (autoplayDone) {
                setAutoplayDone(false);
              }
            }}
            disabled={!autoplayDone}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              detectionMode === "yolo"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            YOLO
          </button>
        </div>

        {detectionMode === "multimodal" && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-medium text-muted-foreground">
              Provider:
            </span>
            <button
              onClick={() => {
                setVisionProvider("anthropic");
                if (autoplayDone) {
                  setAutoplayDone(false);
                }
              }}
              disabled={!autoplayDone}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                visionProvider === "anthropic"
                  ? "bg-primary/80 text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Claude
            </button>
            <button
              onClick={() => {
                setVisionProvider("openai");
                if (autoplayDone) {
                  setAutoplayDone(false);
                }
              }}
              disabled={!autoplayDone}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                visionProvider === "openai"
                  ? "bg-primary/80 text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              GPT-5 mini
            </button>
          </div>
        )}
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

        {/* Live Detection Result */}
        {liveDetectionResult && (
          <div className="absolute bottom-2 left-2 right-2 px-3 py-2 rounded-md bg-black/80 backdrop-blur-sm border border-white/20">
            <p className="text-white text-sm font-medium">
              {liveDetectionResult}
            </p>
          </div>
        )}

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
