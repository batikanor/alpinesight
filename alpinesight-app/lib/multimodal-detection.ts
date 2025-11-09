/**
 * Multimodal AI-based vehicle detection for satellite imagery
 * Uses Claude Vision or GPT-4 Vision to count vehicles in images
 */

export interface VisionDetection {
  vehicleCount: number;
  confidence: number;
  description: string;
}

export async function detectVehiclesWithVision(
  imageUrl: string,
  provider: "anthropic" | "openai" = "anthropic"
): Promise<VisionDetection> {
  try {
    const response = await fetch("/api/vision-detect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageUrl,
        provider,
      }),
    });

    if (!response.ok) {
      throw new Error(`Vision API failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("❌ Vision detection failed:", error);
    throw error;
  }
}
