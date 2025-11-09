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
  const { isGlobeOpen, setIsGlobeOpen, addMarker, clearMarkers, flyToLocation } = useGlobe();

  // Process tracking
  const processedToolCalls = useRef<Set<string>>(new Set());
  const lastAssistantMessageId = useRef<string | null>(null);
  const satelliteCloseIssuedForMessage = useRef<boolean>(false);

  // Model selection
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  useEffect(() => {
    const model = localStorage.getItem("selected_model");
    setSelectedModel(model || "google/gemini-2.0-flash-exp:free");
  }, []);

  const { messages, setMessages, sendMessage, status, stop } = useChat({
    id: chatId,
    onError: (error: Error) => {
      // Log all errors to console, but don't show toast notifications to user
      console.error("❌ Chat error:", error);

      // Suppress synthetic tool call errors (these are fallback behaviors and expected)
      if (error.message.includes('synth-')) {
        console.warn("⚠️ Synthetic tool call error (expected, suppressed):", error.message.substring(0, 200));
        return;
      }

      // Log error details without showing toast
      if (error.message.match(/Too many requests|429|rate-limited/i)) {
        console.error("⚠️ Rate limit reached. Please wait or use a different model.");
      } else if (error.message.match(/API|fetch/i)) {
        console.error("⚠️ Connection error. Check your network and retry.");
      } else if (error.message.match(/model|Provider/i)) {
        console.error("⚠️ Model error:", error.message);
      } else {
        console.error("⚠️ Error:", error.message);
      }

      // Don't show toast notifications for errors - only log to console
    },
  });

  // Effect: handle assistant tool parts
  useEffect(() => {
    const latestMessage = messages[messages.length - 1] as any;
    if (!latestMessage || latestMessage.role !== "assistant") return;

    // Reset tracking if this is a new assistant message
    if (lastAssistantMessageId.current !== latestMessage.id) {
      lastAssistantMessageId.current = latestMessage.id;
      processedToolCalls.current.clear();
      satelliteCloseIssuedForMessage.current = false;
    }

    const parts = latestMessage.parts as any[] | undefined;
    if (!parts?.length) return;

    parts.forEach(async (part) => {
      if (!part.type?.startsWith("tool-")) return;
      const toolName = part.type.replace("tool-", "");
      const state = part.state;
      const toolCallId = part.toolCallId;

      // Handle satellite view: close globe as soon as the tool *starts* streaming
      if (toolName === "get_satellite_timeline" && (state === "input-available" || state === "input-streaming") && !satelliteCloseIssuedForMessage.current) {
        satelliteCloseIssuedForMessage.current = true;
        setIsGlobeOpen(false);
        clearMarkers();
        return; // Don't process this part further
      }

      // Only process completed tool outputs
      if (state !== "output-available") return;

      // Ensure we don't process the same tool call multiple times
      if (!toolCallId || processedToolCalls.current.has(toolCallId)) return;
      processedToolCalls.current.add(toolCallId);

      const input = part.input;

      // --- Handle Tool Actions ---

      if (toolName === "show_location_on_globe") {
        const locationToFind = input?.location; // Check for undefined input
        if (!locationToFind) {
          console.warn("⚠️ show_location_on_globe called but input.location is missing");
          return;
        }
        try {
          const result = await geocodeLocation(locationToFind);
          clearMarkers();
          setIsGlobeOpen(true);
          // Delay to ensure globe is open before flying
          setTimeout(() => {
            addMarker({ id: toolCallId, lat: result.lat, lng: result.lng, label: result.name, color: input.markerColor || "red", size: 35 });
            flyToLocation(result.lat, result.lng, 0.45);
            toast.success(`Showing ${result.name} on the globe`);
          }, 400);
        } catch (error) {
          toast.error(`Could not find location: ${input?.location || 'unknown'}`);
        }
      } else if (toolName === "close_globe") {
        setIsGlobeOpen(false);
        clearMarkers();
      } else if (toolName === "get_satellite_timeline") {
        // This will run when the *output* is available, after the input-streaming check
        setIsGlobeOpen(false);
        clearMarkers();
        // The satellite component itself will handle the output,
        // we just need to ensure the globe is closed.
      }
    });
  }, [messages, setIsGlobeOpen, addMarker, clearMarkers, flyToLocation]);

  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const [input, setInput] = React.useState("");
  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (!input.trim() || !selectedModel) return;
    const text = input.trim();

    // No fallback logic, just send the message
    sendMessage({ role: "user", parts: [{ type: "text", text }] } as any, { body: { model: selectedModel } } as any);
    setInput("");
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