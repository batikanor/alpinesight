"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Image from "next/image";

// Type fix for framer-motion v11 AnimatePresence
const FixedAnimatePresence = AnimatePresence as any;

interface TimelineItem {
  releaseNum: number;
  releaseDate: string;
  releaseDatetime: number;
  title: string;
  tileUrl: string;
  provider: string;
}

interface SatelliteTimelineProps {
  location: string;
  latitude: number;
  longitude: number;
  onClose: () => void;
}

export function SatelliteTimeline({
  location,
  latitude,
  longitude,
  onClose,
}: SatelliteTimelineProps) {
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

  return (
    <FixedAnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black via-slate-900 to-slate-900/95 border-t border-white/10 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">
              Satellite Imagery Timeline
            </h3>
            <p className="text-xs text-white/60">
              {location} {loading ? "" : `• ${timeline.length} versions available`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/80 hover:text-white"
            aria-label="Close timeline"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-white/60" />
              <span className="ml-3 text-white/60">Loading satellite imagery...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12 text-red-400">
              <p>Error: {error}</p>
            </div>
          )}

          {!loading && !error && timeline.length === 0 && (
            <div className="flex items-center justify-center py-12 text-white/60">
              <p>No satellite imagery available for this location</p>
            </div>
          )}

          {!loading && !error && timeline.length > 0 && currentImage && (
            <div className="space-y-4">
              {/* Image Viewer */}
              <div className="relative aspect-square max-w-2xl mx-auto bg-black rounded-lg overflow-hidden">
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
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={goToNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>

                {/* Date Label */}
                <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm">
                  <p className="text-white font-semibold">{currentImage.releaseDate}</p>
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
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-white/60">
                  <span>{timeline[timeline.length - 1]?.releaseDate}</span>
                  <span>{currentIndex + 1} / {timeline.length}</span>
                  <span>{timeline[0]?.releaseDate}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </FixedAnimatePresence>
  );
}
