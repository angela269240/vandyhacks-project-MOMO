import { rgba } from "@/lib/colors";

export type BubbleEls = { outline: SVGPathElement; halo: SVGPathElement; glow: SVGCircleElement; rings: SVGGElement };

/** Closed organic outline: a circle with two slow sine wobbles, smoothed with quadratic midpoints. */
export function blobPath(cx: number, cy: number, r: number, t: number) {
  const n = 40;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.022 * Math.sin(3 * a + t * 0.35) + 0.014 * Math.sin(5 * a - t * 0.27 + 1.3);
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]);
  }
  const mid = (p: [number, number], q: [number, number]) => `${((p[0] + q[0]) / 2).toFixed(1)} ${((p[1] + q[1]) / 2).toFixed(1)}`;
  let d = `M ${mid(pts[n - 1], pts[0])}`;
  for (let i = 0; i < n; i++) d += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mid(pts[i], pts[(i + 1) % n])}`;
  return `${d} Z`;
}

/**
 * The room's big glowing bubble, in the group's color. Geometry is written by the room's animation loop
 * (through `register`) so it can breathe and resize smoothly without React re-rendering.
 */
export function RoomBubble({ color, register }: { color: string; register: (els: BubbleEls | null) => void }) {
  const els: Partial<BubbleEls> = {};
  const set = <K extends keyof BubbleEls>(key: K) => (el: BubbleEls[K] | null) => {
    if (el) els[key] = el;
    else delete els[key];
    register(els.outline && els.halo && els.glow && els.rings ? (els as BubbleEls) : null);
  };

  return (
    <g aria-hidden>
      <defs>
        <radialGradient id="room-glow">
          <stop offset="55%" stopColor={rgba(color, 0.12)} />
          <stop offset="100%" stopColor={rgba(color, 0)} />
        </radialGradient>
        <radialGradient id="room-fill" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor={rgba(color, 0.17)} />
          <stop offset="65%" stopColor={rgba(color, 0.07)} />
          <stop offset="100%" stopColor={rgba(color, 0.03)} />
        </radialGradient>
      </defs>
      <circle ref={set("glow")} fill="url(#room-glow)" />
      {/* soft outer glow: a wide faint stroke under a crisp one, no per-frame blur filters */}
      <path ref={set("halo")} fill="none" stroke={rgba(color, 0.14)} strokeWidth={14} />
      <path ref={set("outline")} fill="url(#room-fill)" stroke={rgba(color, 0.55)} strokeWidth={1.5} />
      <g ref={set("rings")}>
        <g className="room-orbit" style={{ animationDuration: "140s" }}>
          <ellipse rx={0.8} ry={0.34} fill="none" stroke={rgba(color, 0.14)} strokeDasharray="2 6" vectorEffect="non-scaling-stroke" transform="rotate(-18)" />
        </g>
        <g className="room-orbit" style={{ animationDuration: "190s", animationDirection: "reverse" }}>
          <ellipse rx={0.62} ry={0.62} fill="none" stroke={rgba(color, 0.08)} vectorEffect="non-scaling-stroke" />
        </g>
      </g>
    </g>
  );
}
