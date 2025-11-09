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

// Concurrency + retry helpers to avoid hammering remote tile server
async function fetchWithRetry(url: string, attempts = 3, delayMs = 250): Promise<ArrayBuffer | null> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.arrayBuffer();
    } catch (err) {
      if (i === attempts) return null;
      await new Promise(r => setTimeout(r, delayMs * i));
    }
  }
  return null;
}

async function dedupeTimelineByImage(timelineRaw: any[], concurrency = 8) {
  const uniqueImageHashes = new Set<string>();
  const uniqueItems: typeof timelineRaw = [];
  const errors: { url: string; error: string }[] = [];
  let index = 0;

  async function worker() {
    while (index < timelineRaw.length) {
      const current = timelineRaw[index++];
      try {
        const buf = await fetchWithRetry(current.tileUrl);
        if (!buf) {
          errors.push({ url: current.tileUrl, error: 'fetch-failed' });
          continue;
        }
        const b64 = Buffer.from(buf).toString('base64');
        if (!uniqueImageHashes.has(b64)) {
          uniqueImageHashes.add(b64);
          uniqueItems.push(current);
        }
      } catch (e: any) {
        errors.push({ url: current.tileUrl, error: e?.message || 'unknown' });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  // Sort chronologically
  uniqueItems.sort(
    (a, b) => new Date(a.releaseDatetime).getTime() - new Date(b.releaseDatetime).getTime()
  );
  return { uniqueItems, errors };
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
    const timelineRaw = waybackItems.map((item) => {
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

    // Concurrency-limited duplicate filtering
    console.log(`🔄 Deduping ${timelineRaw.length} candidate tiles with limited concurrency...`);
    const { uniqueItems, errors } = await dedupeTimelineByImage(timelineRaw, 8);
    console.log(`✅ Deduped to ${uniqueItems.length} unique tiles (errors: ${errors.length})`);

    return NextResponse.json({
      location: { lat, lng },
      zoom,
      tileCoords,
      count: uniqueItems.length,
      timeline: uniqueItems,
      errors,
    });
  } catch (error) {
    console.error("Wayback API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch wayback imagery" },
      { status: 500 }
    );
  }
}
