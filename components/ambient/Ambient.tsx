import { NeonParticles } from "./NeonParticles";

const AURAS = [
  { color: "#22D3EE", top: "8%", left: "12%", size: "42vmax", delay: "0s", duration: "70s" },
  { color: "#A78BFA", top: "55%", left: "62%", size: "48vmax", delay: "-20s", duration: "85s" },
  { color: "#F472B6", top: "68%", left: "8%", size: "36vmax", delay: "-40s", duration: "95s" },
  { color: "#60A5FA", top: "-10%", left: "58%", size: "40vmax", delay: "-10s", duration: "75s" },
];

/** Always-on layer behind everything: drifting color auras plus floating neon lights. */
export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {AURAS.map((a) => (
        <div
          key={a.color}
          className="absolute rounded-full blur-3xl"
          style={{
            top: a.top,
            left: a.left,
            width: a.size,
            height: a.size,
            background: `radial-gradient(circle, ${a.color} 0%, transparent 65%)`,
            opacity: "var(--aura-opacity, 0.08)",
            animation: `aura-drift ${a.duration} ease-in-out ${a.delay} infinite`,
          }}
        />
      ))}
      <NeonParticles />
    </div>
  );
}
