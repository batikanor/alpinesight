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

  // Process tracking
  const processedToolCalls = useRef<Set<string>>(new Set());
  const lastAssistantMessageId = useRef<string | null>(null);
  const satelliteCloseIssuedForMessage = useRef<boolean>(false);

  // Satellite fallback
  const pendingSatelliteIntent = useRef<{ text: string; locationGuess?: string; lat?: number; lng?: number } | null>(null);
  const satelliteFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syntheticSatelliteShown = useRef<boolean>(false);

  // Location fallback (for repeated globe requests where model skips tool call)
  const pendingLocationIntent = useRef<{ text: string; location: string; markerColor?: string } | null>(null);
  const locationFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Model selection
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  useEffect(() => {
    const model = localStorage.getItem("selected_model");
    setSelectedModel(model || "google/gemini-2.0-flash-exp:free");
  }, []);

  const { messages, setMessages, sendMessage, status, stop } = useChat({
    id: chatId,
    onError: (error: Error) => {
      console.error("Chat error:", error);
      if (error.message.match(/Too many requests|429|rate-limited/i)) {
        toast.error("Rate limit reached. Please wait or use a different model.", { duration: 5000 });
      } else if (error.message.match(/API|fetch/i)) {
        toast.error("Connection error. Check your network and retry.", { duration: 5000 });
      } else if (error.message.match(/model|Provider/i)) {
        toast.error(error.message, { duration: 5000 });
      } else {
        toast.error(`Error: ${error.message}`, { duration: 5000 });
      }
    },
  });

  // Intent detection
  const hasSatelliteIntent = (text: string) => {
    const t = text.toLowerCase();
    return t.includes("satellite") || t.includes("historical imagery") || t.includes("historical satellite") || t.includes("wayback") || t.includes("imagery");
  };

  const hasLocationIntent = (text: string) => {
    const t = text.toLowerCase();
    return /(show|find|locate|display|put|mark).+\b(map|globe)?/i.test(t) || /show me /.test(t);
  };

  const extractLocationFromText = (text: string) => {
    // naive: remove leading verbs
    return text.replace(/^(show|find|locate|display|put|mark)\s+(me\s+)?/i, "").replace(/\bon the map\b|\bon the globe\b|\bmap\b|\bglobe\b/gi, "").trim();
  };

  const parseLatLngFromText = (text: string): { lat: number; lng: number } | null => {
    const dirPattern = /(-?\d+(?:\.\d+)?)\s*°?\s*([NS])\s*[ ,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])/i;
    const simplePattern = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;
    const m1 = text.match(dirPattern);
    if (m1) {
      let lat = parseFloat(m1[1]);
      const ns = m1[2].toUpperCase();
      let lng = parseFloat(m1[3]);
      const ew = m1[4].toUpperCase();
      if (ns === "S") lat = -Math.abs(lat); else lat = Math.abs(lat);
      if (ew === "W") lng = -Math.abs(lng); else lng = Math.abs(lng);
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

  // Cancel helpers
  const cancelSatelliteFallback = () => {
    if (satelliteFallbackTimer.current) clearTimeout(satelliteFallbackTimer.current);
    satelliteFallbackTimer.current = null;
    pendingSatelliteIntent.current = null;
  };
  const cancelLocationFallback = () => {
    if (locationFallbackTimer.current) clearTimeout(locationFallbackTimer.current);
    locationFallbackTimer.current = null;
    pendingLocationIntent.current = null;
  };

  // Satellite synthetic message
  const triggerSatelliteFallback = async () => {
    const pending = pendingSatelliteIntent.current;
    if (!pending || syntheticSatelliteShown.current) return;
    let { lat, lng } = pending;
    let locationName = pending.locationGuess || "Selected location";
    if ((lat == null || lng == null) && markers.length) {
      const last = markers[markers.length - 1];
      lat = last.lat; lng = last.lng; locationName = last.label || locationName;
    }
    if (lat == null || lng == null) {
      try { const r = await geocodeLocation(locationName); lat = r.lat; lng = r.lng; locationName = r.name || locationName; } catch {}
    }
    if (lat == null || lng == null) { toast.error("Couldn't determine location for satellite imagery."); return; }
    if (isGlobeOpen) setIsGlobeOpen(false); clearMarkers();
    const syntheticMessage: UIMessage = {
      id: `assistant-synth-${Date.now()}` as any,
      role: "assistant",
      parts: [
        { type: "tool-get_satellite_timeline", toolCallId: `synth-sat-${Date.now()}`, state: "output-available", output: { status: "success", action: "show_satellite_timeline", location: locationName, latitude: lat, longitude: lng, message: `Fetching satellite imagery timeline for ${locationName}` } } as any
      ]
    };
    setMessages(prev => [...prev, syntheticMessage]); syntheticSatelliteShown.current = true; cancelSatelliteFallback();
  };

  // Location synthetic message (globe display)
  const triggerLocationFallback = async () => {
    const pending = pendingLocationIntent.current; if (!pending) return;
    const { location, markerColor } = pending;
    try {
      const result = await geocodeLocation(location);
      clearMarkers(); setIsGlobeOpen(true);
      setTimeout(() => {
        addMarker({ id: `synth-loc-${Date.now()}`, lat: result.lat, lng: result.lng, label: result.name, color: markerColor || "red", size: 35 });
        flyToLocation(result.lat, result.lng, 0.45);
        toast.success(`Showing ${result.name} on the globe`);
      }, 400);
      const syntheticMessage: UIMessage = {
        id: `assistant-synth-loc-${Date.now()}` as any,
        role: "assistant",
        parts: [ { type: "tool-show_location_on_globe", toolCallId: `synth-show-${Date.now()}`, state: "output-available", output: { status: "success", action: "displayed_location", location: result.name, marker_color: markerColor || "red", message: `Opened interactive globe and displayed ${result.name}` } } as any ]
      };
      setMessages(prev => [...prev, syntheticMessage]);
    } catch (e) {
      toast.error(`Could not find location: ${location}`);
    } finally { cancelLocationFallback(); }
  };

  // Effect: handle assistant tool parts
  useEffect(() => {
    const latestMessage = messages[messages.length - 1] as any;
    if (!latestMessage || latestMessage.role !== "assistant") return;
    if (lastAssistantMessageId.current !== latestMessage.id) {
      lastAssistantMessageId.current = latestMessage.id;
      processedToolCalls.current.clear();
      satelliteCloseIssuedForMessage.current = false;
      syntheticSatelliteShown.current = false;
    }
    const parts = latestMessage.parts as any[] | undefined; if (!parts?.length) return;
    let sawSatellite = false; let sawLocation = false;
    parts.forEach(async part => {
      if (!part.type?.startsWith("tool-")) return;
      const toolName = part.type.replace("tool-", "");
      const state = part.state;
      const toolCallId = part.toolCallId;
      if (toolName === "get_satellite_timeline") sawSatellite = true;
      if (toolName === "show_location_on_globe") sawLocation = true;
      if (toolName === "get_satellite_timeline" && (state === "input-available" || state === "input-streaming") && !satelliteCloseIssuedForMessage.current) {
        satelliteCloseIssuedForMessage.current = true; setIsGlobeOpen(false); clearMarkers(); cancelSatelliteFallback(); return;
      }
      if (state !== "output-available") return;
      if (!toolCallId || processedToolCalls.current.has(toolCallId)) return;
      processedToolCalls.current.add(toolCallId);
      const input = part.input;
      if (toolName === "show_location_on_globe") {
        try {
          const result = await geocodeLocation(input.location);
          clearMarkers(); setIsGlobeOpen(true);
          setTimeout(() => {
            addMarker({ id: toolCallId, lat: result.lat, lng: result.lng, label: result.name, color: input.markerColor || "red", size: 35 });
            flyToLocation(result.lat, result.lng, 0.45);
            toast.success(`Showing ${result.name} on the globe`);
          }, 400);
        } catch { toast.error(`Could not find location: ${input.location}`); }
      } else if (toolName === "close_globe") { setIsGlobeOpen(false); clearMarkers(); }
      else if (toolName === "get_satellite_timeline") { setIsGlobeOpen(false); clearMarkers(); cancelSatelliteFallback(); }
    });
    if (sawSatellite) cancelSatelliteFallback();
    if (sawLocation) cancelLocationFallback();
  }, [messages, setIsGlobeOpen, addMarker, clearMarkers, flyToLocation]);

  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const [input, setInput] = React.useState("");
  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (!input.trim() || !selectedModel) return; const text = input.trim();
    // Satellite flow
    if (hasSatelliteIntent(text)) {
      const coords = parseLatLngFromText(text); pendingSatelliteIntent.current = { text, locationGuess: text, lat: coords?.lat, lng: coords?.lng };
      setIsGlobeOpen(false); clearMarkers();
      if (satelliteFallbackTimer.current) clearTimeout(satelliteFallbackTimer.current);
      satelliteFallbackTimer.current = setTimeout(triggerSatelliteFallback, 2500);
    }
    // Location flow fallback prep
    if (hasLocationIntent(text)) {
      const locationPhrase = extractLocationFromText(text);
      pendingLocationIntent.current = { text, location: locationPhrase };
      if (locationFallbackTimer.current) clearTimeout(locationFallbackTimer.current);
      // If assistant doesn't call tool within 2s, synthesize
      locationFallbackTimer.current = setTimeout(triggerLocationFallback, 2000);
    }
    sendMessage({ role: "user", parts: [{ type: "text", text }] } as any, { body: { model: selectedModel } } as any); setInput("");
  };

  // Helpers to determine message content
  const hasToolParts = (m: UIMessage) => !!(m as any).parts?.some((p: any) => p.type?.startsWith("tool-"));
  const isAssistantTextOnly = (m: UIMessage) => {
    if (m.role !== "assistant") return false;
    const parts = (m as any).parts || [];
    if (parts.length === 0) return true;
    return parts.every((p: any) => p.type === "text" && typeof p.text === "string");
  };

  // Compute messages to render: hide assistant text-only messages if immediately followed by assistant tool message
  const messagesToRender = React.useMemo(() => {
    const arr = messages as UIMessage[];
    const out: UIMessage[] = [];
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (isAssistantTextOnly(m)) {
        const next = arr[i + 1];
        if (next && next.role === "assistant" && hasToolParts(next)) {
          // Skip this ephemeral assistant text message
          continue;
        }
      }
      out.push(m);
    }
    return out;
  }, [messages]);

  return (
    <div className="flex flex-col min-w-0 h-full relative z-20">
      <div ref={messagesContainerRef} className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4">
        {messagesToRender.length === 0 && <Overview />}
        {messagesToRender.map((message: UIMessage, index: number) => (
          <PreviewMessage key={message.id} chatId={chatId} message={message} isLoading={isLoading && messagesToRender.length - 1 === index} setMessages={setMessages} />
        ))}
        {isLoading && messagesToRender.length > 0 && messagesToRender[messagesToRender.length - 1].role === "user" && <ThinkingMessage />}
        <div ref={messagesEndRef} className="shrink-0 min-w-[24px] min-h-[24px]" />
      </div>
      <form className="flex mx-auto px-4 pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <MultimodalInput chatId={chatId} input={input} setInput={setInput} handleSubmit={handleSubmit} isLoading={isLoading} stop={stop} messages={messages} setMessages={setMessages} />
      </form>
    </div>
  );
}
