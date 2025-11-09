import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

interface VisionRequest {
  imageUrl: string;
  provider: "anthropic" | "openai";
}

async function detectWithClaude(imageUrl: string) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  // Fetch the image and convert to base64
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString("base64");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: `Analyze this satellite/aerial image and count the number of vehicles (cars, trucks, vans) visible.

Please respond in this exact JSON format:
{
  "vehicleCount": <number>,
  "confidence": <0.0 to 1.0>,
  "description": "<brief description of what you see>"
}

Be conservative - only count objects you're reasonably confident are vehicles. The image may be blurry or low quality.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse JSON from Claude response");
  }

  return JSON.parse(jsonMatch[0]);
}

async function detectWithOpenAI(imageUrl: string) {
  // Use OpenRouter if available (same as chat API), otherwise fall back to direct fetch
  const apiKey = OPENROUTER_API_KEY;
  const baseUrl = OPENROUTER_API_KEY
    ? "https://openrouter.ai/api/v1"
    : "https://api.openai.com/v1";
  const model = OPENROUTER_API_KEY
    ? "openai/gpt-5-mini"
    : "gpt-5-mini";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured. Vision detection requires OpenRouter API key for now.");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this satellite/aerial image and count the number of vehicles (cars, trucks, vans) visible.

Please respond in this exact JSON format:
{
  "vehicleCount": <number>,
  "confidence": <0.0 to 1.0>,
  "description": "<brief description of what you see>"
}

Be conservative - only count objects you're reasonably confident are vehicles. The image may be blurry or low quality.`,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse JSON from OpenAI response");
  }

  return JSON.parse(jsonMatch[0]);
}

export async function POST(request: NextRequest) {
  try {
    const body: VisionRequest = await request.json();
    const { imageUrl, provider } = body;

    console.log(`🔍 Vision detection request: ${provider} for ${imageUrl}`);

    let result;
    if (provider === "anthropic") {
      result = await detectWithClaude(imageUrl);
    } else {
      result = await detectWithOpenAI(imageUrl);
    }

    console.log(`✅ Vision detection result:`, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("❌ Vision detection error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
