"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGlobe } from "@/contexts/globe-context";
import GlobeGl from "react-globe.gl";

// Type-safe Globe component
const Globe = GlobeGl as any;

interface GlobeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Marker SVG
const markerSvg = `<svg viewBox="-4 0 36 36">
  <path fill="currentColor" d="M14,0 C21.732,0 28,5.641 28,12.6 C28,23.963 14,36 14,36 C14,36 0,24.064 0,12.6 C0,5.641 6.268,0 14,0 Z"></path>
  <circle fill="black" cx="14" cy="14" r="7"></circle>
</svg>`;

export function GlobeModal({ isOpen, onClose }: GlobeModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeInstanceRef = useRef<any>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const { markers, pointOfView } = useGlobe();

  // Store the camera position as state that we pass as props to Globe
  const [cameraPov, setCameraPov] = useState({ lat: 20, lng: 0, altitude: 2.5 });

  // Handle camera movement when pointOfView changes
  useEffect(() => {
    if (pointOfView && globeInstanceRef.current) {
      console.log("🌍 Flying to location:", pointOfView);
      const globe = globeInstanceRef.current;

      console.log("🌍 Globe ref type:", typeof globe);
      console.log("🌍 Globe has pointOfView method:", typeof globe.pointOfView);
      console.log("🌍 Globe has controls method:", typeof globe.controls);

      try {
        // Try to call pointOfView method
        if (typeof globe.pointOfView === 'function') {
          globe.pointOfView(pointOfView, 3000);
          console.log("🌍 ✅ pointOfView() called successfully!");
        }

        // Try to disable auto-rotate
        if (typeof globe.controls === 'function') {
          const controls = globe.controls();
          if (controls) {
            controls.autoRotate = false;
            console.log("🌍 ✅ Auto-rotate disabled!");
          }
        }
      } catch (e) {
        console.log("🌍 ❌ Error:", e);
      }
    }
  }, [pointOfView]);

  // Handle ESC key to close panel
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <>
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            key="globe-modal"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute left-0 top-0 bottom-0 w-[80%] z-30 bg-gradient-to-br from-slate-950 via-slate-900 to-black shadow-2xl border-r border-white/10"
          >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-sm group"
            aria-label="Close globe"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="group-hover:rotate-90 transition-transform duration-300"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          {/* Title */}
          <div className="absolute top-4 left-4 z-10">
            <motion.h2
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold text-white drop-shadow-lg"
            >
              Interactive Globe
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-sm text-white/70 mt-1"
            >
              Drag to rotate • Scroll to zoom
            </motion.p>
          </div>

          {/* Globe container */}
          <div ref={containerRef} className="w-full h-full overflow-hidden">
            <Globe
              ref={(ref: any) => {
                if (ref) {
                  console.log("🌍 Ref callback fired with:", ref);
                  console.log("🌍 Ref has pointOfView:", typeof ref.pointOfView);
                  console.log("🌍 Ref has controls:", typeof ref.controls);
                  globeInstanceRef.current = ref;
                }
              }}
              globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
              bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
              // Markers
              htmlElementsData={markers}
              htmlElement={(d: any) => {
                const el = document.createElement('div');
                el.innerHTML = markerSvg;
                el.style.color = d.color || 'red';
                el.style.width = `${d.size || 30}px`;
                el.style.transition = 'opacity 250ms';
                el.style.pointerEvents = 'auto';
                el.style.cursor = 'pointer';
                el.title = d.label;
                return el;
              }}
              htmlTransitionDuration={1000}
              // Tile engine configuration
              tilesData={[]}
              tileAltitude={0.01}
              tileWidth={1}
              tileHeight={1}
              tileLat={(d: any) => d.lat}
              tileLng={(d: any) => d.lng}
              // Custom tile URL using OpenStreetMap
              globeTileEngineUrl={(x: number, y: number, l: number) =>
                `https://tile.openstreetmap.org/${l}/${x}/${y}.png`
              }
              animateIn={true}
              waitForGlobeReady={true}
              onGlobeReady={() => {
                console.log("🌍 Globe is ready!");
                console.log("🌍 Current ref has pointOfView:", typeof globeInstanceRef.current?.pointOfView);
                console.log("🌍 Current ref has controls:", typeof globeInstanceRef.current?.controls);
                setGlobeReady(true);
              }}
            />
          </div>

          {/* Loading indicator */}
          {!globeReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-white text-sm">Loading globe...</p>
              </div>
            </div>
          )}
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
