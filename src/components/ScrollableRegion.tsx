"use client";

import { useState, useRef, useLayoutEffect, type CSSProperties, type ReactNode } from "react";

// Custom scroll indicator — native scrollbars (even styled ones) stay
// hidden until hover/scroll on macOS when "overlay scrollbars" are on, and
// no CSS can override that OS-level behavior. This draws its own always-
// visible thumb instead, so scrollability is obvious without interaction.
// `outerClassName`/`outerStyle` participate in the parent flex/grid layout
// (same role the scrollable element used to play); `innerClassName` holds
// the actual overflow + padding that used to live on that single element.
export function ScrollableRegion({
  outerClassName,
  outerStyle,
  innerClassName,
  innerStyle,
  children,
}: {
  outerClassName: string;
  outerStyle?: CSSProperties;
  innerClassName: string;
  innerStyle?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);

  function update() {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - clientHeight <= 1) {
      setThumb(null);
      return;
    }
    const thumbHeight = Math.max(20, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - thumbHeight;
    const thumbTop = (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    setThumb({ top: thumbTop, height: thumbHeight });
  }

  useLayoutEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    // The thumb sits 2–6px in from the edge (2px margin + 4px wide). Reserve
    // 9px of padding so text ends with a clear 3px gap before the thumb,
    // not just before the panel edge — regardless of each call site's own
    // padding.
    <div className={`relative overflow-hidden ${outerClassName}`} style={{ ...outerStyle, paddingRight: 9 }}>
      <div
        ref={ref}
        onScroll={update}
        className={`hide-native-scrollbar h-full overflow-y-auto ${innerClassName}`}
        style={innerStyle}
      >
        {children}
      </div>
      {thumb && (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{ top: thumb.top, height: thumb.height, right: 2, width: 4, backgroundColor: "#C4A882" }}
        />
      )}
    </div>
  );
}
