import { NextResponse } from "next/server";
import {
  getWaybackItemsWithLocalChanges,
  getWaybackItems,
} from "@esri/wayback-core";

// Helper function to calculate tile coordinates from lat/lng
function latLngToTile(lat: number, lng: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const xTile = Math.floor(n * ((lng + 180) / 360));
  const yTile = Math.floor(
    (n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2
  );
  return { x: xTile, y: yTile, z: zoom };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get("lat") || "0");
    const lng = parseFloat(searchParams.get("lng") || "0");
    const zoom = parseInt(searchParams.get("zoom") || "15");
    const mode = searchParams.get("mode") || "all"; // "changes" or "all"

    console.log("📡 Wayback API Request:", { lat, lng, zoom, mode });

    if (!lat || !lng) {
      return NextResponse.json(
        { error: "Missing latitude or longitude" },
        { status: 400 }
      );
    }

    // Get wayback items based on mode
    let waybackItems;
    if (mode === "all") {
      console.log("🌍 Fetching ALL wayback items...");
      waybackItems = await getWaybackItems();
      console.log(`✅ Received ${waybackItems.length} total wayback items`);
    } else {
      console.log("🔍 Fetching wayback items with LOCAL CHANGES only...");
      waybackItems = await getWaybackItemsWithLocalChanges(
        { latitude: lat, longitude: lng },
        zoom
      );
      console.log(`✅ Received ${waybackItems.length} items with local changes`);
    }

    // Calculate tile coordinates
    const tileCoords = latLngToTile(lat, lng, zoom);
    console.log("🗺️ Tile coordinates:", tileCoords);

    // Build response with tile URLs
    const timeline = waybackItems.map((item) => {
      // Replace template variables in itemURL
      const tileUrl = item.itemURL
        .replace("{level}", tileCoords.z.toString())
        .replace("{row}", tileCoords.y.toString())
        .replace("{col}", tileCoords.x.toString());

      return {
        releaseNum: item.releaseNum,
        releaseDate: item.releaseDateLabel,
        releaseDatetime: item.releaseDatetime,
        title: item.itemTitle,
        tileUrl: tileUrl,
        provider: item.layerIdentifier,
      };
    });

    return NextResponse.json({
      location: { lat, lng },
      zoom,
      tileCoords,
      count: timeline.length,
      timeline,
    });
  } catch (error) {
    console.error("Wayback API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch wayback imagery" },
      { status: 500 }
    );
  }
}
