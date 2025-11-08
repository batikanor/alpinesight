"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";

export interface GlobeMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color?: string;
  size?: number;
}

export interface GlobePointOfView {
  lat: number;
  lng: number;
  altitude: number;
}

interface GlobeContextType {
  isGlobeOpen: boolean;
  setIsGlobeOpen: (open: boolean) => void;
  markers: GlobeMarker[];
  addMarker: (marker: GlobeMarker) => void;
  clearMarkers: () => void;
  pointOfView: GlobePointOfView | null;
  setPointOfView: (pov: GlobePointOfView) => void;
  flyToLocation: (lat: number, lng: number, altitude?: number) => void;
}

const GlobeContext = createContext<GlobeContextType | undefined>(undefined);

export function GlobeProvider({ children }: { children: ReactNode }) {
  const [isGlobeOpen, setIsGlobeOpen] = useState(false);
  const [markers, setMarkers] = useState<GlobeMarker[]>([]);
  const [pointOfView, setPointOfView] = useState<GlobePointOfView | null>(null);

  const addMarker = useCallback((marker: GlobeMarker) => {
    setMarkers((prev) => {
      // Remove existing marker with same id if exists
      const filtered = prev.filter((m) => m.id !== marker.id);
      return [...filtered, marker];
    });
  }, []);

  const clearMarkers = useCallback(() => {
    setMarkers([]);
  }, []);

  const flyToLocation = useCallback((lat: number, lng: number, altitude: number = 1.5) => {
    setPointOfView({ lat, lng, altitude });
  }, []);

  return (
    <GlobeContext.Provider
      value={{
        isGlobeOpen,
        setIsGlobeOpen,
        markers,
        addMarker,
        clearMarkers,
        pointOfView,
        setPointOfView,
        flyToLocation,
      }}
    >
      {children}
    </GlobeContext.Provider>
  );
}

export function useGlobe() {
  const context = useContext(GlobeContext);
  if (context === undefined) {
    throw new Error("useGlobe must be used within a GlobeProvider");
  }
  return context;
}
