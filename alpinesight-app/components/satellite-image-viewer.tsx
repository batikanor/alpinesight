"use client";

import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Image from "next/image";
import { useGlobe } from "@/contexts/globe-context";

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
  onAnalysisComplete?: (data: { points: { date: string; count: number }[] }) => void;
}

interface AnnotationEntry { date: string; boxes: { left: number; top: number; size: number }[] }
interface DetectionBox { x1: number; y1: number; x2: number; y2: number; cls?: string; conf?: number }
interface ImageDetections {
  date: string;
  width: number;
  height: number;
  boxes: DetectionBox[];
  annotatedImage?: string;  // base64 encoded annotated image
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
  const [detections, setDetections] = useState<Record<number, ImageDetections>>({});
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [autoplayDone, setAutoplayDone] = useState(false);
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


  // Container resize observer
  useEffect(() => {
    if (!imageContainerRef.current) return;
    const el = imageContainerRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Kick off detection autoplay
  useEffect(() => {
    let cancelled = false;
    async function runDetectionsSequentially() {
      if (!timeline.length || autoplayDone) return;
      analysisSentRef.current = false;
      setDetections({});

      for (let i = 0; i < timeline.length; i++) {
        if (cancelled) break;
        setCurrentIndex(i);

        try {
          const resp = await fetch("/api/detect_vehicles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_url: timeline[i].tileUrl,
              conf_thres: 0.02,
              return_image: true  // Request annotated image
            }),
          });
          if (!resp.ok) {
            console.error(`Detection API returned ${resp.status}: ${resp.statusText}`);
            throw new Error(`Detection failed: ${resp.status}`);
          }
          const data = await resp.json();
          console.log(`[Detection ${i}/${timeline.length}]`, {
            url: timeline[i].tileUrl,
            date: timeline[i].releaseDate,
            boxCount: data?.boxes?.length || 0,
            hasAnnotatedImage: !!data?.annotated_image
          });
          if (data && !data.error) {
            setDetections((prev) => ({
              ...prev,
              [i]: {
                date: timeline[i].releaseDate,
                width: data.width || 256,
                height: data.height || 256,
                boxes: (data.boxes || []).map((b: any) => ({ x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, cls: b.cls, conf: b.conf })),
                annotatedImage: data.annotated_image,  // Store annotated image
              },
            }));
          } else if (data?.error) {
            console.error(`Detection error: ${data.error}`);
          }
        } catch (e) {
          console.error(`Detection error at index ${i}:`, e);
        }
        // small delay to keep UI responsive
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!cancelled) setAutoplayDone(true);
    }
    if (timeline.length) {
      runDetectionsSequentially();
    }
    return () => { cancelled = true; };
  }, [timeline]);

  // When detection completes, send analysis
  useEffect(() => {
    if (!autoplayDone || !onAnalysisComplete || analysisSentRef.current) return;
    const totalDone = Object.keys(detections).length;
    if (totalDone !== timeline.length) return;
    const points = Object.keys(detections)
      .map((k) => Number(k))
      .sort((a, b) => a - b)
      .map((i) => ({ date: detections[i].date, count: detections[i].boxes.length }));
    analysisSentRef.current = true;
    onAnalysisComplete({ points });
  }, [autoplayDone, detections, timeline.length, onAnalysisComplete]);


  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 px-4 rounded-lg border border-border/50 bg-muted/30">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mr-2" />
        <span className="text-muted-foreground">Loading satellite imagery...</span>
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
      <div ref={imageContainerRef} className="relative aspect-square max-w-full mx-auto bg-black rounded-lg overflow-hidden">
        {detections[currentIndex]?.annotatedImage ? (
          // Show annotated image with bounding boxes drawn on it
          <Image
            src={detections[currentIndex].annotatedImage!}
            alt={`Detected vehicles on ${currentImage.releaseDate}`}
            fill
            className="object-contain"
            unoptimized
            style={{ zIndex: 10 }}
          />
        ) : (
          // Show original satellite image
          <Image
            src={currentImage.tileUrl}
            alt={`Satellite imagery from ${currentImage.releaseDate}`}
            fill
            className="object-contain"
            unoptimized
            style={{ zIndex: 0 }}
          />
        )}

        {/* Navigation Arrows */}
        <button
          onClick={goToPrevious}
          disabled={!autoplayDone}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors disabled:opacity-40"
          aria-label="Previous image"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={goToNext}
          disabled={!autoplayDone}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors disabled:opacity-40"
          aria-label="Next image"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Date Label */}
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm">
          <p className="text-white text-sm font-semibold">{currentImage.releaseDate}</p>
          <p className="text-xs text-white/70">{currentImage.provider}</p>
        </div>

        {/* Detection Count Badge */}
        {detections[currentIndex] && (
          <div className="absolute top-2 right-2 px-3 py-1.5 rounded-md bg-red-500/90 backdrop-blur-sm">
            <p className="text-white text-sm font-semibold">
              🚗 {detections[currentIndex].boxes.length} {detections[currentIndex].boxes.length === 1 ? 'vehicle' : 'vehicles'}
            </p>
          </div>
        )}


        {/* Autoplay progress indicator */}
        {!autoplayDone && (
          <div className="absolute bottom-2 left-2 right-2 h-1 bg-white/20">
            <div
              className="h-full bg-red-500 transition-all"
              style={{ width: `${((Object.keys(detections).length - 1) / Math.max(timeline.length - 1, 1)) * 100}%` }}
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
          <span className="font-medium">{currentIndex + 1} / {timeline.length}</span>
          <span>{timeline[0]?.releaseDate}</span>
        </div>
      </div>
    </div>
  );
}
