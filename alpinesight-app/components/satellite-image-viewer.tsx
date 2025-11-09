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
      const play = (index: number) => {
        setCurrentIndex(index);
        // Single random red square
        const box = {
          left: Math.random() * 80 + 5, // percent
          top: Math.random() * 80 + 5,
          size: 30,
        };
        setAnnotationData((prev) => {
          if (prev.find((p) => p.date === timeline[index].releaseDate)) return prev;
          return [...prev, { date: timeline[index].releaseDate, boxes: [box] }];
        });
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
    if (autoplayDone && annotationData.length === timeline.length && onAnalysisComplete && !analysisSentRef.current) {
      analysisSentRef.current = true;
      const points = annotationData.map((e) => ({ date: e.date, count: e.boxes.length }));
      onAnalysisComplete({ points });
    }
  }, [autoplayDone, annotationData, timeline.length, onAnalysisComplete]);

  // Cleanup timer
  useEffect(() => () => { if (autoplayRef.current) clearTimeout(autoplayRef.current); }, []);

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
          <p className="text-white text-sm font-semibold">{currentImage.releaseDate}</p>
          <p className="text-xs text-white/70">{currentImage.provider}</p>
        </div>

        {/* Random red square overlay */}
        {annotationData.find((p) => p.date === currentImage.releaseDate) && (
          <div className="absolute inset-0 pointer-events-none">
            {annotationData.find((p) => p.date === currentImage.releaseDate)!.boxes.map((b, i) => (
              <div
                key={i}
                className="absolute border-2 border-red-500"
                style={{ left: `${b.left}%`, top: `${b.top}%`, width: `${b.size}px`, height: `${b.size}px` }}
              />
            ))}
          </div>
        )}

        {/* Autoplay progress indicator */}
        {!autoplayDone && (
          <div className="absolute bottom-2 left-2 right-2 h-1 bg-white/20">
            <div
              className="h-full bg-red-500 transition-all"
              style={{ width: `${((annotationData.length - 1) / Math.max(timeline.length - 1, 1)) * 100}%` }}
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
