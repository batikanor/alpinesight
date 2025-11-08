"use client";

import { useGlobe } from "@/contexts/globe-context";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";

// Dynamically import GlobeModal to avoid SSR issues with react-globe.gl
const GlobeModal = dynamic(() => import("./globe-modal").then(mod => ({ default: mod.GlobeModal })), {
  ssr: false,
});

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const { isGlobeOpen, setIsGlobeOpen } = useGlobe();

  return (
    <div className="relative w-full h-[calc(100dvh-52px)] overflow-hidden">
      {/* Globe Panel */}
      <GlobeModal isOpen={isGlobeOpen} onClose={() => setIsGlobeOpen(false)} />

      {/* Main Content - Animated to shift when globe is open */}
      <motion.div
        className="absolute inset-0 h-full"
        animate={{
          left: isGlobeOpen ? "80%" : "0%",
          width: isGlobeOpen ? "20%" : "100%",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
