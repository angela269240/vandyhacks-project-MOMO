import { cn } from "@/lib/utils";
import { initials } from "@/lib/colors";

export function Avatar({
  name,
  url,
  color,
  size = 40,
  className,
}: {
  name: string;
  url?: string | null;
  /** any CSS color, usually a theme-following palette var */
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08), var(--elev-sm)",
        color: "var(--map-node-ink)",
        fontSize: size * 0.36,
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar from object storage
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
