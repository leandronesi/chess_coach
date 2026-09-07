import { useEffect, type RefObject } from "react";

/**
 * Keeps the current frame of a move strip in view. The strip scrolls
 * horizontally on a phone; without this the "ora" chip can sit half hidden
 * past the right edge while the film plays.
 */
export function useScrollCurrentFrame(strip: RefObject<HTMLElement | null>, currentIndex: number, count: number): void {
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const child = el.children[currentIndex] as HTMLElement | undefined;
    if (!child) return;
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    child.scrollIntoView({ inline: "center", block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [strip, currentIndex, count]);
}
