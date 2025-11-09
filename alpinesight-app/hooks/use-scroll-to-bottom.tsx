import { useEffect, useRef, type RefObject } from "react";

export function useScrollToBottom<T extends HTMLElement>(): [
  RefObject<T>,
  RefObject<T>,
] {
  const containerRef = useRef<T>(null);
  const endRef = useRef<T>(null);

  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    if (container && end) {
      const observer = new MutationObserver((mutations) => {
        // Check if any mutation occurred outside of data-no-scroll elements
        const shouldScroll = mutations.some((mutation) => {
          let target = mutation.target as HTMLElement;
          // Walk up the tree to check if we're inside a data-no-scroll element
          while (target && target !== container) {
            if (target.getAttribute?.('data-no-scroll') === 'true') {
              return false; // Ignore mutations inside no-scroll zones
            }
            target = target.parentElement as HTMLElement;
          }
          return true; // This mutation is outside no-scroll zones
        });

        if (shouldScroll) {
          end.scrollIntoView({ behavior: "auto", block: "end" });
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      return () => observer.disconnect();
    }
  }, []);

  return [containerRef, endRef];
}
