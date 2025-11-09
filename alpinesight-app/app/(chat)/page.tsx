"use client";

import { Chat } from "@/components/chat";
import { useEffect } from "react";

export default function Page() {
  // Suppress console errors in production-like environment (only log to console)
  useEffect(() => {
    // Override console.error to prevent React error overlays
    const originalError = console.error;
    console.error = (...args) => {
      // Silently log errors without triggering React error overlay
      originalError.apply(console, args);
    };

    // Global error handler - catch all unhandled errors
    const handleError = (event: ErrorEvent) => {
      event.preventDefault(); // Prevent default error display
      console.error("🔴 Caught error:", event.error || event.message);
    };

    // Catch unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault(); // Prevent default error display
      console.error("🔴 Unhandled rejection:", event.reason);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      console.error = originalError;
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return <Chat />;
}
