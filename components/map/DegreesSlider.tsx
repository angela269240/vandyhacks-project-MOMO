"use client";

import { Slider } from "@/components/ui/slider";

const STEPS = [1, 2, 3, 4, 5, Infinity];
const label = (d: number) => (Number.isFinite(d) ? String(d) : "∞");

/** Bottom bar: how many friendship hops from you to show. */
export function DegreesSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (degrees: number) => void;
  disabled?: boolean;
}) {
  const index = STEPS.indexOf(value);
  return (
    <div className="pointer-events-auto flex w-[min(420px,calc(100vw-32px))] flex-col items-center gap-1.5">
      <div className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
        {disabled ? "Create a profile to filter by connection" : `Show ${label(value)} ${value === 1 ? "degree" : "degrees"} of connection`}
      </div>
      <div className="glass flex w-full items-center gap-3 rounded-full px-4 py-2.5">
        <Slider
          min={0}
          max={STEPS.length - 1}
          step={1}
          value={[index === -1 ? STEPS.length - 1 : index]}
          onValueChange={(v) => onChange(STEPS[Array.isArray(v) ? v[0] : (v as number)])}
          disabled={disabled}
          aria-label="Degrees of connection"
          className="flex-1"
        />
      </div>
      <div className="flex w-full justify-between px-4 text-[10px] text-muted-foreground tabular-nums">
        {STEPS.map((s) => (
          <span key={label(s)}>{label(s)}</span>
        ))}
      </div>
    </div>
  );
}
