"use client";

import { useEffect, useRef } from "react";
import { HUES, rgba } from "@/lib/colors";

type AuthMode = "login" | "register";
type Node = {
  x: number;
  y: number;
  z: number;
  /** ring: the community color, as on the map */
  color: string;
  /** fill: the person's own color */
  fill: string;
  phase: [number, number, number];
  speed: [number, number, number];
};
type Point = { x: number; y: number; z: number };

/** The login screen is always on cream, so it uses the map's light-theme values (lib/colors HUES / globals.css). */
const COLORS = HUES.map((h) => h.swatch);
const CREAM = "#f6efe2";
const GOLD = "#d4a63c";
const EDGE_FAR = "#bcae9d";
const EDGE_NEAR = "#8c7b68";
const NODE_EDGE = "#fffaf3"; // --map-node-edge (light)
const SHADOW = "rgba(60, 40, 20, 0.22)"; // --map-shadow (light)
const SELECTED = 0;
/** ring width as a share of the radius, as on the map (min ~2.5px, max 40%) */
const NODE_RING = 0.25;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smooth(value: number) {
  return value <= 0 ? 0 : value >= 1 ? 1 : value * value * (3 - 2 * value);
}

function mixHex(from: string, to: string, amount: number) {
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `#${((1 << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).slice(1)}`;
}

function makeNetwork() {
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  // personal colors come from their own sequence, so the network's layout stays exactly as it was
  let fillSeed = 29;
  const fillRandom = () => {
    fillSeed = (fillSeed * 16807) % 2147483647;
    return (fillSeed - 1) / 2147483646;
  };
  const personal = (ring: string) => {
    // most people's own color differs from their community's, like on the map
    const pick = COLORS[Math.floor(fillRandom() * COLORS.length)];
    return pick === ring ? COLORS[(COLORS.indexOf(pick) + 3) % COLORS.length] : pick;
  };
  const nodes: Node[] = [
    {
      x: 0.3,
      y: 0.02,
      z: 0.35,
      color: COLORS[0],
      fill: personal(COLORS[0]),
      phase: [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2],
      speed: [0.6, 0.6, 0.6],
    },
  ];

  for (let tries = 0; nodes.length < 34 && tries < 20000; tries++) {
    const x = random() * 2 - 1;
    const z = random() * 2 - 1;
    const y = (random() * 2 - 1) * 0.42;
    if (x * x + z * z + (y / 0.42) ** 2 > 1) continue;
    if (nodes.some((node) => (node.x - x) ** 2 + (node.y - y) ** 2 + (node.z - z) ** 2 < 0.09)) continue;
    const color = COLORS[nodes.length % COLORS.length];
    nodes.push({
      x,
      y,
      z,
      color,
      fill: personal(color),
      phase: [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2],
      speed: [0.4 + 0.4 * random(), 0.4 + 0.4 * random(), 0.4 + 0.4 * random()],
    });
  }

  const edges: [number, number][] = [];
  const addEdge = (a: number, b: number) => {
    if (!edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) edges.push([a, b]);
  };
  nodes.forEach((node, index) => {
    const nearest = nodes
      .map((other, otherIndex) => [otherIndex, (other.x - node.x) ** 2 + (other.y - node.y) ** 2 + (other.z - node.z) ** 2] as const)
      .filter(([otherIndex]) => otherIndex !== index)
      .sort((a, b) => a[1] - b[1]);
    addEdge(index, nearest[0][0]);
    if (index % 4 === 0) addEdge(index, nearest[1][0]);
    if (index % 7 === 0) addEdge(index, nearest[2][0]);
    if (index === SELECTED) {
      addEdge(index, nearest[1][0]);
      addEdge(index, nearest[2][0]);
    }
  });
  return { nodes, edges };
}

const NETWORK = makeNetwork();

/**
 * A decorative, draggable 3D network adapted from the provided Orbit auth concept. People are flat two-tone discs
 * like the map's (ring = community color, fill = their own color). On the register step the camera eases onto one
 * person, who grows, gets a gold ring and bounces.
 */
export function PreviewGraph({ mode, dim }: { mode: AuthMode; dim: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  const dimRef = useRef(dim);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    dimRef.current = dim;
  }, [dim]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let yaw = 0.6;
    /** the user's own tilt from dragging, on top of the slow automatic sway */
    let pitchOffset = 0;
    let clock = 0;
    let focusProgress = 0;
    /** seconds since the register zoom settled, driving the selected node's bounce */
    let bounceClock = 0;
    let lastFrame = 0;
    let frame = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const project = (x: number, y: number, z: number, radiusX: number, radiusY: number, centerX: number, centerY: number): Point => {
      const pitch = 0.5 + (reducedMotion ? 0 : 0.08 * Math.sin(clock * 0.11)) + pitchOffset;
      const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
      const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
      const y1 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
      const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
      const scale = 3.4 / (3.4 - z2);
      return { x: centerX + x1 * radiusX * scale, y: centerY + y1 * radiusY * scale, z: z2 };
    };

    /** smooth drift: two slow sines per axis, so nodes wander a little and never jitter */
    const drift = (node: Node, axis: 0 | 1 | 2, amplitude: number) =>
      reducedMotion
        ? 0
        : amplitude *
          (Math.sin(clock * node.speed[axis] * 0.45 + node.phase[axis]) * 0.7 +
            Math.sin(clock * node.speed[axis] * 0.85 + node.phase[axis] * 2.3) * 0.3);

    const drawLine = (a: Point, b: Point, color: string, lineWidth: number) => {
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    };

    /** a flat disc like the map's: soft drop shadow, own color inside, community color as a ring, thin paper rim */
    const drawDisc = (point: Point, radius: number, fill: string, ring: string, squash: number) => {
      context.save();
      context.translate(point.x, point.y);
      if (squash !== 1) context.scale(1 + (1 - squash) * 0.6, squash);
      const ringWidth = Math.min(radius * 0.4, Math.max(radius * NODE_RING, 2.5));
      context.shadowColor = SHADOW;
      context.shadowBlur = 5;
      context.shadowOffsetY = 1.5;
      context.fillStyle = fill;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowColor = "transparent";
      context.beginPath();
      context.arc(0, 0, radius - ringWidth / 2, 0, Math.PI * 2);
      context.lineWidth = ringWidth;
      context.strokeStyle = ring;
      context.stroke();
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.lineWidth = 1.5;
      context.strokeStyle = rgba(NODE_EDGE, 0.85);
      context.stroke();
      context.restore();
    };

    const draw = (delta: number) => {
      if (!width || !height) return;
      const isMobile = width <= 760;
      const sceneHeight = isMobile ? height * 0.34 : height;
      const panelWidth = isMobile ? 0 : Math.min(520, width * 0.44);
      const target = modeRef.current === "register" ? 1 : 0;
      focusProgress = clamp(focusProgress + (target - focusProgress) * Math.min(1, delta * 1.4), 0, 1);
      const focus = smooth(focusProgress);
      const zoom = 1 + 0.8 * focus;
      const centerX = width / 2;
      const centerY = sceneHeight / 2;
      bounceClock = focusProgress > 0.9 ? bounceClock + delta : 0;

      if (!reducedMotion && !dragging) yaw += 0.07 * delta * (1 - focus * 0.5);

      context.clearRect(0, 0, width, height);
      context.fillStyle = CREAM;
      context.fillRect(0, 0, width, height);

      const radiusX = width * (isMobile ? 0.43 : 0.44);
      const radiusY = sceneHeight * (isMobile ? 0.42 : 0.46);
      const projected = NETWORK.nodes.map((node) =>
        project(
          node.x + drift(node, 0, 0.04),
          node.y + drift(node, 1, 0.028),
          node.z + drift(node, 2, 0.04),
          radiusX,
          radiusY,
          centerX,
          centerY,
        ),
      );

      const targetX = centerX + ((width - panelWidth) / 2 - centerX) * focus;
      const selectedX = centerX + (projected[SELECTED].x - centerX) * focus;
      const selectedY = centerY + (projected[SELECTED].y - centerY) * focus;
      const points = projected.map((point) => ({
        x: targetX + (point.x - selectedX) * zoom,
        y: centerY + (point.y - selectedY) * zoom,
        z: point.z,
      }));

      const baseRadius = clamp(Math.min(width, sceneHeight) * 0.036, 9, 24);
      const radii = points.map((point, index) => {
        const depth = clamp((point.z + 1) / 2, 0, 1);
        const depthScale = 0.82 + 0.36 * depth;
        return baseRadius * depthScale * (1 + (zoom - 1) * 0.3) * (index === SELECTED ? 1 + 0.9 * focus : 1);
      });

      // Register step: the chosen person hops in place under gravity: a quick parabola, a squash on landing, repeat.
      let squash = 1;
      if (!reducedMotion && bounceClock > 0) {
        const PERIOD = 0.9;
        const p = (bounceClock % PERIOD) / PERIOD;
        const hop = 4 * p * (1 - p);
        const settle = Math.min(1, bounceClock / 0.4);
        points[SELECTED] = { ...points[SELECTED], y: points[SELECTED].y - hop * radii[SELECTED] * 1.1 * settle };
        squash = 1 - 0.14 * settle * Math.max(0, 1 - p / 0.12) - 0.14 * settle * Math.max(0, (p - 0.88) / 0.12);
      }

      // far nodes (and, on the register step, everyone but the chosen one) fade into the paper; they stay flat
      const tintOf = (index: number) => {
        const depth = clamp((points[index].z + 1) / 2, 0, 1);
        return index === SELECTED ? 0.22 * (1 - depth) * (1 - focus) : 0.22 * (1 - depth) * (1 - focus) + 0.6 * focus;
      };

      const lineWidth = clamp(Math.min(width, sceneHeight) * 0.0032, 1.5, 3.2) * (1 + (zoom - 1) * 0.3);
      NETWORK.edges.forEach(([start, end]) => {
        const averageDepth = clamp(((points[start].z + points[end].z) / 2 + 1) / 2, 0, 1);
        let color = mixHex(EDGE_FAR, EDGE_NEAR, averageDepth);
        color = start === SELECTED || end === SELECTED ? mixHex(color, EDGE_NEAR, focus) : mixHex(color, CREAM, 0.5 * focus);
        drawLine(points[start], points[end], color, lineWidth);
      });

      const order = NETWORK.nodes.map((_, index) => index).sort((a, b) => points[a].z - points[b].z);
      if (focus > 0.2) {
        order.splice(order.indexOf(SELECTED), 1);
        order.push(SELECTED);
      }
      order.forEach((index) => {
        const node = NETWORK.nodes[index];
        const tint = tintOf(index);
        if (index === SELECTED && focus > 0.02) {
          context.strokeStyle = mixHex(CREAM, GOLD, 0.55 * focus);
          context.lineWidth = 2.5;
          context.beginPath();
          context.arc(points[index].x, points[index].y, radii[index] * 1.3, 0, Math.PI * 2);
          context.stroke();
        }
        drawDisc(
          points[index],
          radii[index],
          mixHex(node.fill, CREAM, tint),
          mixHex(node.color, CREAM, tint),
          index === SELECTED ? squash : 1,
        );
      });

      if (dimRef.current) {
        context.fillStyle = "rgba(246, 239, 226, 0.06)";
        context.fillRect(0, 0, width, height);
      }
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      draw(0);
    };
    const loop = (now: number) => {
      const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0.016;
      lastFrame = now;
      clock += delta;
      draw(delta);
      frame = requestAnimationFrame(loop);
    };
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      yaw += (event.clientX - lastX) * 0.008;
      pitchOffset = clamp(pitchOffset + (event.clientY - lastY) * 0.006, -0.9, 0.9);
      lastX = event.clientX;
      lastY = event.clientY;
      if (reducedMotion) draw(0);
    };
    const onPointerUp = () => {
      dragging = false;
      canvas.style.cursor = "grab";
    };
    const onVisibility = () => {
      lastFrame = 0;
    };

    resize();
    if (!reducedMotion) frame = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  return (
    <div aria-hidden className="fixed inset-0 z-0 bg-[#f6efe2]">
      <canvas ref={canvasRef} className="h-full w-full touch-none cursor-grab" />
    </div>
  );
}
