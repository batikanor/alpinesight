"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Image from "next/image";

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
}

export function SatelliteImageViewer({
  location,
  latitude,
  longitude,
}: SatelliteImageViewerProps) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="relative aspect-square max-w-full mx-auto bg-black rounded-lg overflow-hidden">
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
      </div>

      {/* Timeline Slider */}
      <div className="space-y-2">
        <input
          type="range"
          min="0"
          max={timeline.length - 1}
          value={currentIndex}
          onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
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

