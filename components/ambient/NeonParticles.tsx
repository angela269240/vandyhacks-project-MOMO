"use client";

import { useEffect, useRef } from "react";
import { NEON } from "@/lib/colors";

type Particle = { x: number; y: number; vx: number; vy: number; r: number; color: number; phase: number; speed: number };

/** Little floating neon lights with a diffused glow. Pre-rendered glow sprites keep it cheap. */
export function NeonParticles({ count = 40 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const sprites = NEON.map((hex) => {
      const s = document.createElement("canvas");
      s.width = s.height = 64;
      const c = s.getContext("2d")!;
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.12, hex);
      g.addColorStop(0.4, hex + "55");
      g.addColorStop(1, hex + "00");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      return s;
    });

    let w = 0;
    let h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12 - 0.03,
      r: 1 + Math.random() * 2,
      color: Math.floor(Math.random() * NEON.length),
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.8,
    }));

    let raf = 0;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of particles) {
        if (!reduced) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -20) p.x = w + 20;
          if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20;
          if (p.y > h + 20) p.y = -20;
        }
        const twinkle = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t / 1000 * p.speed + p.phase));
        const size = p.r * 10;
        ctx.globalAlpha = twinkle;
        ctx.drawImage(sprites[p.color], p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [count]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />;
}
