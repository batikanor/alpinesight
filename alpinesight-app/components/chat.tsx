"use client";

import { PreviewMessage, ThinkingMessage } from "@/components/message";
import { MultimodalInput } from "@/components/multimodal-input";
import { Overview } from "@/components/overview";
import { useGlobe } from "@/contexts/globe-context";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { geocodeLocation } from "@/lib/globe-tools";
import { useChat, type UIMessage } from "@ai-sdk/react";
import React, { useEffect, useRef } from "react";
import { toast } from "sonner";

export function Chat() {
  const chatId = "001";
  const { isGlobeOpen, setIsGlobeOpen, addMarker, clearMarkers, flyToLocation, markers } = useGlobe();

  // Track processed tool calls to avoid duplicates within the same assistant message
  const processedToolCalls = useRef<Set<string>>(new Set());
  // Track assistant message id to reset state only when a new assistant message arrives
  const lastAssistantMessageId = useRef<string | null>(null);
  // Ensure we close the globe only once per assistant message when satellite tool starts
  const satelliteCloseIssuedForMessage = useRef<boolean>(false);

  // Satellite fallback refs
  const pendingSatelliteIntent = useRef<{
    text: string;
    locationGuess?: string;
    lat?: number;
    lng?: number;
  } | null>(null);
  const satelliteFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syntheticSatelliteShown = useRef<boolean>(false);

  // Get selected model from localStorage
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);

  useEffect(() => {
    const model = localStorage.getItem("selected_model");
    setSelectedModel(model || "google/gemini-2.0-flash-exp:free");
  }, []);

  const { messages, setMessages, sendMessage, status, stop } = useChat({
    id: chatId,
    onError: (error: Error) => {
      console.error("Chat error:", error);

      // Handle rate limit errors
      if (
        error.message.includes("Too many requests") ||
        error.message.includes("429") ||
        error.message.includes("rate-limited")
      ) {
        toast.error(
          "Rate limit reached. Please wait a moment or try a different model.",
          { duration: 5000 }
        );
      }
      // Handle API errors
      else if (
        error.message.includes("API") ||
        error.message.includes("fetch")
      ) {
        toast.error(
          "Connection error. Please check your internet and try again.",
          { duration: 5000 }
        );
      }
      // Handle model errors
      else if (
        error.message.includes("model") ||
        error.message.includes("Provider")
      ) {
        toast.error(error.message, { duration: 5000 });
      }
      // Generic error
      else {
        toast.error(`Error: ${error.message}`, { duration: 5000 });
      }
    },
  });

  // Helpers: detect satellite intent and parse coordinates
  const hasSatelliteIntent = (text: string) => {
    const t = text.toLowerCase();
    return (
      t.includes("satellite") ||
      t.includes("historical imagery") ||
      t.includes("historical satellite") ||
      t.includes("wayback") ||
      t.includes("imagery")
    );
  };

  const parseLatLngFromText = (text: string): { lat: number; lng: number } | null => {
    // Matches patterns like: 48.8584 N, 2.2945 E  or -33.86, 151.21  or 48.8584°N 2.2945°E
    const dirPattern = /(-?\d+(?:\.\d+)?)\s*°?\s*([NS])\s*[ ,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])/i;
    const simplePattern = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;

    const m1 = text.match(dirPattern);
    if (m1) {
      let lat = parseFloat(m1[1]);
      const ns = m1[2].toUpperCase();
      let lng = parseFloat(m1[3]);
      const ew = m1[4].toUpperCase();
      if (ns === "S") lat = -Math.abs(lat);
      if (ns === "N") lat = Math.abs(lat);
      if (ew === "W") lng = -Math.abs(lng);
      if (ew === "E") lng = Math.abs(lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }

    const m2 = text.match(simplePattern);
    if (m2) {
      const lat = parseFloat(m2[1]);
      const lng = parseFloat(m2[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }

    return null;
  };

  const extractLocationGuess = (text: string) => {
    // Try to extract name inside parentheses first
    const p = text.match(/\(([^)]+)\)/);
    if (p && p[1]) return p[1];
    // Otherwise fallback to original text trimmed
    return text;
  };

  const cancelSatelliteFallback = () => {
    if (satelliteFallbackTimer.current) {
      clearTimeout(satelliteFallbackTimer.current);
      satelliteFallbackTimer.current = null;
    }
    pendingSatelliteIntent.current = null;
  };

  const triggerSatelliteFallback = async () => {
    const pending = pendingSatelliteIntent.current;
    if (!pending || syntheticSatelliteShown.current) return;

    let lat = pending.lat;
    let lng = pending.lng;
    let locationName = pending.locationGuess || "Selected location";

    // Use last globe marker if coordinates missing
    if ((lat == null || lng == null) && markers && markers.length > 0) {
      const last = markers[markers.length - 1];
      lat = last.lat;
      lng = last.lng;
      locationName = last.label || locationName;
    }

    // If still missing, try geocoding the guess
    if (lat == null || lng == null) {
      try {
        const r = await geocodeLocation(locationName);
        lat = r.lat;
        lng = r.lng;
        locationName = r.name || locationName;
      } catch (e) {
        // As a last resort, do nothing
        console.warn("Satellite fallback: geocoding failed");
      }
    }

    if (lat == null || lng == null) {
      toast.error("Couldn't determine location for satellite imagery.");
      return;
    }

    // Close globe to ensure space for viewer
    if (isGlobeOpen) setIsGlobeOpen(false);
    clearMarkers();

    // Synthesize an assistant message that contains the satellite tool output
    const syntheticMessage: UIMessage = {
      id: `assistant-synth-${Date.now()}` as any,
      role: "assistant",
      parts: [
        {
          type: "tool-get_satellite_timeline",
          toolCallId: `synth-sat-${Date.now()}`,
          state: "output-available",
          output: {
            status: "success",
            action: "show_satellite_timeline",
            location: locationName,
            latitude: lat,
            longitude: lng,
            message: `Fetching satellite imagery timeline for ${locationName}`,
          },
        } as any,
      ],
    };

    setMessages((prev: UIMessage[]) => [...prev, syntheticMessage]);
    syntheticSatelliteShown.current = true;
    cancelSatelliteFallback();
  };

  // Watch for tool calls in messages and execute globe actions
  useEffect(() => {
    const latestMessage = messages[messages.length - 1] as any;
    if (!latestMessage || latestMessage.role !== "assistant") return;

    // If this is a NEW assistant message id, reset guards; otherwise keep them for streaming updates
    if (lastAssistantMessageId.current !== latestMessage.id) {
      lastAssistantMessageId.current = latestMessage.id;
      processedToolCalls.current.clear();
      satelliteCloseIssuedForMessage.current = false;
      // Each new assistant response lets the server lead again
      syntheticSatelliteShown.current = false;
    }

    // Get parts array from message
    const parts = latestMessage.parts as any[] | undefined;
    if (!parts || parts.length === 0) return;

    // Process each part to find tool calls
    let sawSatellite = false;
    parts.forEach(async (part: any) => {
      // Check if this is a tool call part
      if (!part.type?.startsWith("tool-")) return;

      const toolName = part.type.replace("tool-", "");
      const state = part.state as string | undefined;
      const toolCallId: string | undefined = part.toolCallId;

      if (toolName === "get_satellite_timeline") {
        sawSatellite = true;
      }

      // If user requested satellite timeline, close globe immediately when input starts (do this only once per assistant message)
      if (
        toolName === "get_satellite_timeline" &&
        (state === "input-available" || state === "input-streaming") &&
        !satelliteCloseIssuedForMessage.current
      ) {
        satelliteCloseIssuedForMessage.current = true; // guard per message
        setIsGlobeOpen(false);
        clearMarkers();
        // Cancel any pending fallback because the server started the tool
        cancelSatelliteFallback();
        return;
      }

      // Only act on completed tool outputs for side-effects that depend on final values
      if (state !== "output-available") return;

      // Check if we've already processed this tool call
      if (!toolCallId) return; // must have id to dedupe
      if (processedToolCalls.current.has(toolCallId)) return;
      processedToolCalls.current.add(toolCallId);

      const input = part.input;

      console.log("Processing tool:", toolName, "with input:", input);

      if (toolName === "show_location_on_globe") {
        console.log("Executing show_location_on_globe for:", input.location);
        try {
          const result = await geocodeLocation(input.location);
          console.log("Geocoding result:", result);

          // Clear previous markers first (each show_location call replaces old markers)
          clearMarkers();

          // Open the globe FIRST
          setIsGlobeOpen(true);

          // Wait a bit for globe to open and initialize
          setTimeout(() => {
            // Add marker
            addMarker({
              id: toolCallId,
              lat: result.lat,
              lng: result.lng,
              label: result.name,
              color: input.markerColor || "red",
              size: 35,
            });

            // Fly to location with proper altitude for nice zoom
            // Altitude: 0 = surface, 1 = one globe radius away
            // 0.4-0.5 gives a good zoomed-in view
            flyToLocation(result.lat, result.lng, 0.45);

            toast.success(`Showing ${result.name} on the globe`);
          }, 400);
        } catch (error: any) {
          console.error("Error showing location:", error);
          toast.error(`Could not find location: ${input.location}`);
        }
      } else if (toolName === "close_globe") {
        setIsGlobeOpen(false);
        clearMarkers();
      } else if (toolName === "get_satellite_timeline") {
        console.log("Executing get_satellite_timeline for:", input?.location);
        // Ensure globe is closed when satellite imagery is displayed
        setIsGlobeOpen(false);
        clearMarkers();
        // Cancel fallback if any
        cancelSatelliteFallback();
        // Note: The actual satellite timeline will be rendered inline in the message
      }
    });

    // If the assistant message contained the satellite tool, cancel any pending fallback
    if (sawSatellite) {
      cancelSatelliteFallback();
    }
  }, [messages, setIsGlobeOpen, addMarker, clearMarkers, flyToLocation, markers, isGlobeOpen, setMessages]);

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  const [input, setInput] = React.useState("");

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (!input.trim() || !selectedModel) return;

    const text = input.trim();

    // Satellite intent detection & fallback prep
    if (hasSatelliteIntent(text)) {
      const coords = parseLatLngFromText(text);
      const locationGuess = extractLocationGuess(text);
      pendingSatelliteIntent.current = {
        text,
        locationGuess,
        lat: coords?.lat,
        lng: coords?.lng,
      };

      // Close globe immediately to make space while we wait
      setIsGlobeOpen(false);
      clearMarkers();

      // Start fallback timer (2.5s). If the assistant doesn't start satellite tool, we'll synthesize it.
      if (satelliteFallbackTimer.current) clearTimeout(satelliteFallbackTimer.current);
      satelliteFallbackTimer.current = setTimeout(() => {
        triggerSatelliteFallback();
      }, 2500);
    }

    // Send message - useChat handles the formatting
    sendMessage(
      {
        role: "user",
        parts: [{ type: "text", text }],
      } as any,
      {
        body: {
          model: selectedModel,
        },
      } as any
    );
    setInput("");
  };

  return (
    <div className="flex flex-col min-w-0 h-full bg-background relative z-20">
      <div
        ref={messagesContainerRef}
        className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
      >
        {messages.length === 0 && <Overview />}

        {messages.map((message: UIMessage, index: number) => (
          <PreviewMessage
            key={message.id}
            chatId={chatId}
            message={message}
            isLoading={isLoading && messages.length - 1 === index}
          />
        ))}

        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1].role === "user" && <ThinkingMessage />}

        <div
          ref={messagesEndRef}
          className="shrink-0 min-w-[24px] min-h-[24px]"
        />
      </div>

      <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <MultimodalInput
          chatId={chatId}
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          stop={stop}
          messages={messages}
          setMessages={setMessages}
        />
      </form>
    </div>
  );
}
