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
  const { setIsGlobeOpen, addMarker, clearMarkers, flyToLocation, showSatelliteTimeline } = useGlobe();

  // Track processed tool calls to avoid duplicates
  const processedToolCalls = useRef<Set<string>>(new Set());

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

  // Watch for tool calls in messages and execute globe actions
  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== "assistant") return;

    // Get parts array from message
    const parts = (latestMessage as any).parts;
    if (!parts || parts.length === 0) return;

    // Process each part to find tool calls
    parts.forEach(async (part: any) => {
      // Check if this is a tool call part that has completed
      if (!part.type?.startsWith("tool-")) return;
      if (part.state !== "output-available") return;

      // Check if we've already processed this tool call
      const toolCallId = part.toolCallId;
      if (processedToolCalls.current.has(toolCallId)) return;
      processedToolCalls.current.add(toolCallId);

      const toolName = part.type.replace("tool-", "");
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
          }, 500);
        } catch (error: any) {
          console.error("Error showing location:", error);
          toast.error(`Could not find location: ${input.location}`);
        }
      } else if (toolName === "close_globe") {
        setIsGlobeOpen(false);
        clearMarkers();
      } else if (toolName === "get_satellite_timeline") {
        console.log("Executing get_satellite_timeline for:", input.location);
        // Trigger the satellite timeline with the coordinates
        showSatelliteTimeline(input.location, input.latitude, input.longitude);
        toast.success(`Loading satellite imagery for ${input.location}`);
      }
    });
  }, [messages, setIsGlobeOpen, addMarker, clearMarkers, flyToLocation, showSatelliteTimeline]);

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  const [input, setInput] = React.useState("");

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (input.trim() && selectedModel) {
      // Send message - useChat handles the formatting
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: input }],
      } as any, {
        body: {
          model: selectedModel,
        },
      } as any);
      setInput("");
    }
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
