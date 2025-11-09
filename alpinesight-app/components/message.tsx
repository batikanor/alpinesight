"use client";

import type { UIMessage } from "@ai-sdk/react";
import { motion } from "framer-motion";

import { SparklesIcon } from "./icons";
import { Markdown } from "./markdown";
import { PreviewAttachment } from "./preview-attachment";
import { cn } from "@/lib/utils";
import { Weather } from "./weather";
import { ToolResult } from "./tool-result";
import { SatelliteImageViewer } from "./satellite-image-viewer";
import { TimelineChart } from "./timeline-chart";

export const PreviewMessage = ({
  message,
  chatId,
  isLoading,
  setMessages,
}: {
  chatId: string;
  message: UIMessage;
  isLoading: boolean;
  setMessages?: React.Dispatch<React.SetStateAction<UIMessage[]>>;
}) => {
  const parts = message.parts || [];
  const hasToolParts = parts.some((p: any) => p.type?.startsWith("tool-"));

  // Determine if this message will actually render any visible content
  const hasRenderableParts = parts.some((part: any) => {
    if (part.type === "text") {
      // If there are tool parts, suppress assistant free text
      if (hasToolParts) return false;
      return Boolean(part.text && part.text.trim() !== "");
    }
    if (part.type === "file") return true;
    if (part.type?.startsWith("tool-")) {
      const toolName = part.type.replace("tool-", "");
      // We render tool outputs when output-available
      if (part.state === "output-available" && part.output) return true;
      // We render loading placeholders for weather and satellite timeline
      if (
        (part.state === "input-streaming" || part.state === "input-available") &&
        (toolName === "get_current_weather" || toolName === "get_satellite_timeline")
      )
        return true;
    }
    return false;
  });

  // If assistant message has nothing to show, skip rendering to avoid empty SparklesIcon rows
  if (message.role === "assistant" && !hasRenderableParts) return null;

  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      data-role={message.role}
      data-chat={chatId}
    >
      <div
        className={cn(
          "group-data-[role=user]/message:bg-primary group-data-[role=user]/message:text-primary-foreground flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl",
          { "opacity-70": isLoading && message.role === "assistant" }
        )}
      >
        {message.role === "assistant" && (
          <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
            <SparklesIcon size={14} />
          </div>
        )}

        <div className="flex flex-col gap-2 w-full">
          {parts.map((part: any, index: number) => {
            if (part.type === "text") {
              // Suppress assistant free text when tool parts are present
              if (hasToolParts) return null;
              return (
                <div key={index} className="flex flex-col gap-4">
                  <Markdown>{part.text}</Markdown>
                </div>
              );
            }
            // Support custom chart render part
            if (part.type === "chart-satellite-counts" && part.data?.points) {
              return (
                <div key={`chart-${index}`} className="space-y-2">
                  <div className="text-sm text-muted-foreground">Detected vehicles over time</div>
                  <TimelineChart points={part.data.points} title="Vehicles per date" />
                </div>
              );
            }
            // Handle tool calls - type is "tool-{toolName}" in AI SDK v5
            if (part.type?.startsWith("tool-")) {
              const { toolCallId, state, output } = part;
              const toolName = part.type.replace("tool-", "");

              // Show tool outputs with appropriate components
              if (state === "output-available" && output) {
                if (toolName === "get_current_weather") {
                  return (
                    <div key={toolCallId}>
                      <Weather weatherAtLocation={output} />
                    </div>
                  );
                }
                if (toolName === "get_satellite_timeline") {
                  // Show the satellite image viewer inline in the chat
                  return (
                    <div key={toolCallId} className="space-y-2">
                      <ToolResult result={output} />
                      <SatelliteImageViewer
                        location={output.location}
                        latitude={output.latitude}
                        longitude={output.longitude}
                        onAnalysisComplete={(data) => {
                          if (!setMessages) return;
                          const msg: UIMessage = {
                            id: `assistant-analysis-${Date.now()}` as any,
                            role: "assistant",
                            parts: [
                              {
                                type: "text",
                                text: `Here is a summary graph showing the number of vehicles detected across ${data.points.length} satellite images over time.`,
                              } as any,
                              {
                                type: "chart-satellite-counts",
                                data,
                              } as any,
                            ],
                          };
                          setMessages((prev) => [...prev, msg]);
                        }}
                      />
                    </div>
                  );
                }
                if (toolName === "show_location_on_globe" || toolName === "close_globe") {
                  return (
                    <div key={toolCallId}>
                      <ToolResult result={output} />
                    </div>
                  );
                }
              }
              // Show loading state while tool is executing
              if (
                state === "input-streaming" || state === "input-available"
              ) {
                if (toolName === "get_current_weather") {
                  return (
                    <div key={toolCallId} className="skeleton">
                      <Weather />
                    </div>
                  );
                }
                if (toolName === "get_satellite_timeline") {
                  return (
                    <div key={toolCallId} className="text-sm text-muted-foreground py-2">
                      Fetching satellite imagery...
                    </div>
                  );
                }
              }
            }
            if (part.type === "file") {
              return (
                <PreviewAttachment
                  key={index}
                  attachment={part}
                />
              );
            }
            return null;
          })}
        </div>
      </div>
    </motion.div>
  );
};

export const ThinkingMessage = () => {
  const role = "assistant";

  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message "
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cn(
          "flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl",
          {
            "group-data-[role=user]/message:bg-muted": true,
          }
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Thinking...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
