import { MicOff, MonitorUp, Volume2 } from "lucide-react";
import { forwardRef } from "react";
import { Avatar } from "@/components/profile/Avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GraphUser } from "@/lib/types";
import type { StageMember } from "./RoomMember";

/** Compact person card for the strip under a shared screen. */
export const ParticipantCard = forwardRef<
  HTMLButtonElement,
  { m: StageMember; mutualHere: number; onSelect: (user: GraphUser, rect: DOMRect) => void }
>(function ParticipantCard({ m, mutualHere, onSelect }, ref) {
  const label = m.isMe ? `${m.user.name} (you)` : m.user.name;
  const relation = m.isMe
    ? "You"
    : [m.isFriend ? "Friends with you" : null, mutualHere ? `${mutualHere} mutual friend${mutualHere === 1 ? "" : "s"} here` : null]
        .filter(Boolean)
        .join(" · ") || "Not connected yet";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            ref={ref}
            data-participant={m.user.id}
            onClick={(e) => onSelect(m.user, e.currentTarget.getBoundingClientRect())}
            aria-label={[label, m.speaking && "speaking", m.mic === "off" && "muted", m.sharing && "sharing"].filter(Boolean).join(", ")}
            className={cn(
              "glass relative flex h-[104px] w-[120px] shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-2xl px-2 transition-[box-shadow,border-color,background-color] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              m.speaking ? "bg-white/[0.07]" : "hover:bg-white/[0.05]",
            )}
            style={m.speaking ? { borderColor: m.color, boxShadow: `0 0 18px -4px ${m.color}` } : undefined}
          />
        }
      >
        <span className="relative">
          <Avatar name={m.user.name} url={m.user.avatarUrl} color={m.color} size={44} className={cn(m.isMe && "ring-2 ring-white")} />
          {m.speaking && (
            <span
              aria-hidden
              className="absolute -inset-1.5 animate-ping rounded-full border-2 opacity-60 motion-reduce:animate-none"
              style={{ borderColor: m.color, animationDuration: "1.4s" }}
            />
          )}
        </span>
        <span className={cn("max-w-full truncate text-xs", m.speaking ? "font-semibold text-white" : "text-foreground/85")}>
          {label}
        </span>
        <span className="absolute top-1.5 right-1.5 flex gap-1">
          {m.sharing && <MonitorUp className="size-3.5 text-[#22D3EE]" aria-hidden />}
          {m.speaking && <Volume2 className="size-3.5" style={{ color: m.color }} aria-hidden />}
          {m.mic === "off" && <MicOff className="size-3.5 text-[#FB7185]" aria-hidden />}
        </span>
        {m.isFriend && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-[#A78BFA]/15 px-1.5 text-[9px] font-semibold tracking-wide text-[#C4B5FD] uppercase">
            Friend
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">{relation}</TooltipContent>
    </Tooltip>
  );
});
