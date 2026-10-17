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
        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5), transparent 60%), ${color}`,
        boxShadow: `0 0 ${size / 3}px ${color}88`,
        color: "rgba(3,5,12,0.85)",
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
