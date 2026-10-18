"use client";

import { useEffect, useRef } from "react";
import { rgba } from "@/lib/colors";

/**
 * Decorative stand-in for the social graph behind the login window. Fixed, made-up data:
 * nothing here is fetched, and the initials belong to nobody.
 */
type Bubble = { label: string; color: string; x: number; y: number; size: number; phase: number };
type Node = { id: string; bubble: number; dx: number; dy: number; initials: string; phase: number };

// Positions are fractions of the viewport, kept to the edges so the labels clear the centered window.
const BUBBLES: Bubble[] = [
  { label: "Machine Learning", color: "#22D3EE", x: 0.15, y: 0.26, size: 1.1, phase: 0.4 },
  { label: "Hackathons", color: "#A78BFA", x: 0.85, y: 0.22, size: 1, phase: 1.9 },
  { label: "Photography", color: "#F472B6", x: 0.13, y: 0.78, size: 0.95, phase: 3.1 },
  { label: "Badminton", color: "#34D399", x: 0.87, y: 0.77, size: 0.9, phase: 4.4 },
  { label: "Algorithms", color: "#60A5FA", x: 0.5, y: 0.06, size: 0.8, phase: 5.2 },
  { label: "Startups", color: "#FBBF24", x: 0.55, y: 0.96, size: 0.85, phase: 2.6 },
];

// Offsets are fractions of the bubble radius.
const NODES: Node[] = [
  { id: "a1", bubble: 0, dx: -0.35, dy: -0.2, initials: "JL", phase: 0.1 },
  { id: "a2", bubble: 0, dx: 0.3, dy: -0.3, initials: "MK", phase: 1.2 },
  { id: "a3", bubble: 0, dx: 0.05, dy: 0.35, initials: "RT", phase: 2.3 },
  { id: "a4", bubble: 0, dx: 0.45, dy: 0.2, initials: "SN", phase: 3.4 },
  { id: "b1", bubble: 1, dx: -0.3, dy: 0.1, initials: "AV", phase: 0.7 },
  { id: "b2", bubble: 1, dx: 0.25, dy: -0.25, initials: "DP", phase: 1.8 },
  { id: "b3", bubble: 1, dx: 0.2, dy: 0.35, initials: "EO", phase: 2.9 },
  { id: "c1", bubble: 2, dx: -0.25, dy: -0.25, initials: "HC", phase: 0.3 },
  { id: "c2", bubble: 2, dx: 0.35, dy: 0.05, initials: "YB", phase: 1.5 },
  { id: "c3", bubble: 2, dx: -0.1, dy: 0.4, initials: "LW", phase: 2.6 },
  { id: "c4", bubble: 2, dx: 0.4, dy: -0.4, initials: "FZ", phase: 4.1 },
  { id: "c5", bubble: 2, dx: -0.45, dy: 0.15, initials: "GM", phase: 5.0 },
  { id: "d1", bubble: 3, dx: -0.3, dy: -0.1, initials: "PR", phase: 0.9 },
  { id: "d2", bubble: 3, dx: 0.3, dy: 0.25, initials: "TA", phase: 2.1 },
  { id: "e1", bubble: 4, dx: -0.3, dy: 0.15, initials: "OJ", phase: 1.1 },
  { id: "e2", bubble: 4, dx: 0.3, dy: 0.2, initials: "NI", phase: 3.3 },
  { id: "e3", bubble: 4, dx: 0, dy: -0.3, initials: "UQ", phase: 4.6 },
  { id: "f1", bubble: 5, dx: -0.35, dy: -0.15, initials: "WE", phase: 0.5 },
  { id: "f2", bubble: 5, dx: 0.3, dy: -0.25, initials: "CX", phase: 2.4 },
  { id: "f3", bubble: 5, dx: 0.1, dy: 0.3, initials: "BV", phase: 3.8 },
];

const EDGES: [string, string][] = [
  ["a1", "a2"], ["a2", "a3"], ["a1", "a3"], ["a3", "a4"],
  ["b1", "b2"], ["b2", "b3"],
  ["c1", "c2"], ["c2", "c3"], ["c1", "c5"], ["c4", "c2"],
  ["d1", "d2"],
  ["e1", "e2"], ["e2", "e3"],
  ["f1", "f2"], ["f2", "f3"],
  // friendships across interests
  ["a2", "e1"], ["e2", "b1"], ["a3", "c1"], ["b3", "d1"], ["c2", "f1"], ["d2", "f2"], ["a4", "b1"],
];

const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

/**
 * `dim` dims and blurs the graph behind the login window; turning it off restores full brightness
 * for the hand-off to the real map. Ignored by assistive tech and pointer input.
 */
export function PreviewGraph({ dim }: { dim: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimTarget = useRef(dim ? 1 : 0);
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    dimTarget.current = dim ? 1 : 0;
    redraw.current?.();
  }, [dim]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim() || "sans-serif";

    let w = 0;
    let h = 0;
    let unit = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      unit = Math.max(70, Math.min(150, Math.min(w, h) * 0.13));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    let dimLevel = dimTarget.current;

    const draw = (ms: number) => {
      const t = reduced ? 0 : ms / 1000;
      ctx.clearRect(0, 0, w, h);

      // bubble centers drift a few pixels over tens of seconds
      const centers = BUBBLES.map((b) => ({
        x: b.x * w + Math.sin(t * 0.05 + b.phase) * 14,
        y: b.y * h + Math.cos(t * 0.04 + b.phase) * 10,
        r: unit * b.size,
      }));
      const pos = new Map(
        NODES.map((n) => {
          const c = centers[n.bubble];
          return [
            n.id,
            { x: c.x + n.dx * c.r + Math.sin(t * 0.9 + n.phase) * 2, y: c.y + n.dy * c.r + Math.cos(t * 0.7 + n.phase) * 3 },
          ];
        }),
      );

      BUBBLES.forEach((b, i) => {
        const c = centers[i];
        ctx.beginPath();
        for (let k = 0; k <= 64; k++) {
          const a = (k / 64) * Math.PI * 2;
          const wobble = 1 + 0.06 * Math.sin(3 * a + b.phase + t * 0.2) + 0.04 * Math.sin(5 * a - b.phase - t * 0.15);
          const x = c.x + Math.cos(a) * c.r * wobble;
          const y = c.y + Math.sin(a) * c.r * wobble;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const fill = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * 1.1);
        fill.addColorStop(0, rgba(b.color, 0.16));
        fill.addColorStop(1, rgba(b.color, 0.04));
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 24;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(b.color, 0.6);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.font = `600 13px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = rgba(b.color, 0.9);
        ctx.fillText(b.label, c.x, c.y - c.r * 1.1 - 6);
      });

      // friendship lines are the first thing to fade when dimmed
      ctx.lineWidth = 1;
      for (const [s, e] of EDGES) {
        const a = pos.get(s)!;
        const z = pos.get(e)!;
        const grad = ctx.createLinearGradient(a.x, a.y, z.x, z.y);
        grad.addColorStop(0, BUBBLES[NODE_BY_ID.get(s)!.bubble].color);
        grad.addColorStop(1, BUBBLES[NODE_BY_ID.get(e)!.bubble].color);
        ctx.globalAlpha = 0.4 - 0.3 * dimLevel;
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(z.x, z.y);
        ctx.stroke();
      }

      const r = Math.max(8, unit * 0.085);
      ctx.globalAlpha = 1 - 0.35 * dimLevel;
      for (const n of NODES) {
        const { x, y } = pos.get(n.id)!;
        const color = BUBBLES[n.bubble].color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.shadowBlur = 0;
        const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
        shine.addColorStop(0, "rgba(255,255,255,0.55)");
        shine.addColorStop(0.65, "rgba(255,255,255,0)");
        ctx.fillStyle = shine;
        ctx.fill();
        ctx.font = `700 ${r * 0.8}px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(3,5,12,0.8)";
        ctx.fillText(n.initials, x, y + r * 0.05);
      }
      ctx.globalAlpha = 1;
    };

    // Reduced motion: one still frame, redrawn only when something changes.
    let raf = 0;
    const loop = (ms: number) => {
      dimLevel += (dimTarget.current - dimLevel) * 0.08;
      draw(ms);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!reduced && !raf) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const drawStill = () => {
      dimLevel = dimTarget.current;
      draw(0);
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => {
      resize();
      if (reduced) drawStill();
    };

    resize();
    if (reduced) {
      drawStill();
      redraw.current = drawStill;
    } else start();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      redraw.current = null;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      aria-hidden
      inert
      className="pointer-events-none fixed inset-0 transition-[filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      style={{ filter: dim ? "blur(5px) brightness(0.6) saturate(0.9)" : "blur(0px) brightness(1) saturate(1)" }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      <div
        className="absolute inset-0 bg-[#03050c] transition-opacity duration-700 motion-reduce:transition-none"
        style={{ opacity: dim ? 0.5 : 0 }}
      />
    </div>
  );
}
