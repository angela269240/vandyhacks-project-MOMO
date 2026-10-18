"use client";

import { Headphones, LogOut, Maximize2, MessageSquare, Mic, MicOff, WifiOff } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGraph } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { cn } from "@/lib/utils";
import { useRoomConnection } from "./RoomConnection";

const button =
  "flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-ring/70 [&_svg]:size-4";

/** The live room, minimized onto the map: still connected, mic still controllable. */
export function MinimizedRoomWidget({ onRestore }: { onRestore: () => void }) {
  const { session, voice, toggleMic, leave, unread } = useRoomConnection();
  const { data: graph } = useGraph();
  const { identity } = useMe();
  const group = session?.group ?? null;
  const members = useRoomPresence(group?.id ?? null);
  if (!session || !group) return null;

  const color = group.color;
  const speakerId = [...voice.speaking][0];
  const speaker = !speakerId
    ? null
    : speakerId === identity?.userId
      ? "You"
      : (graph?.users.find((u) => u.id === speakerId)?.name.split(" ")[0] ?? "Someone");
  const problem = session.status === "failed" || session.status === "reconnecting";
  const micLabel = voice.micOn ? "Mute" : voice.micJoined ? "Unmute" : "Join voice";

  return (
    <motion.aside
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      aria-label={`Live room: ${group.name}`}
      className="glass fixed right-4 bottom-4 z-30 w-[300px] max-w-[calc(100vw-32px)] rounded-2xl p-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.85)]"
      style={{ borderColor: `${color}55`, boxShadow: `0 0 34px -16px ${color}, 0 20px 60px -20px rgba(0,0,0,0.85)` }}
    >
      <button onClick={onRestore} className="flex w-full items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
        <span className="relative flex size-3 shrink-0">
          <span className="absolute inset-0 animate-ping rounded-full opacity-50 motion-reduce:animate-none" style={{ background: color }} />
          <span className="relative size-3 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-heading text-sm font-semibold">{group.name}</span>
          <span className="block truncate text-xs text-muted-foreground" aria-live="polite">
            {problem ? (
              <span className="inline-flex items-center gap-1 text-[#FBBF24]">
                <WifiOff className="size-3" /> {session.status === "failed" ? "Disconnected" : "Reconnecting…"}
              </span>
            ) : (
              <>
                {members.length} here now · {speaker ? `${speaker} ${speaker === "You" ? "are" : "is"} speaking` : "quiet right now"}
              </>
            )}
          </span>
        </span>
        {unread > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-[#F472B6]/15 px-2 py-0.5 text-[11px] font-semibold text-[#F9A8D4]">
            <MessageSquare className="size-3" aria-hidden /> {unread}
          </span>
        )}
      </button>

      <div className="mt-3 flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={toggleMic}
                aria-pressed={voice.micOn}
                aria-label={micLabel}
                className={cn(button, voice.micOn ? "bg-[#22D3EE]/15 text-[#22D3EE]" : "bg-white/5 text-foreground/85 hover:bg-white/10")}
              />
            }
          >
            {voice.micOn ? <Mic /> : voice.micJoined ? <MicOff /> : <Headphones />}
            {micLabel}
          </TooltipTrigger>
          <TooltipContent>{voice.micOn ? "Mute your microphone" : "Turn on your microphone"}</TooltipContent>
        </Tooltip>
        <button onClick={onRestore} className={cn(button, "flex-1 bg-white/5 text-foreground hover:bg-white/10")}>
          <Maximize2 /> Restore
        </button>
        <button
          onClick={async () => {
            await leave();
            toast(`You left ${group.name}`);
          }}
          className={cn(button, "text-[#FB7185] hover:bg-[#FB7185]/12")}
        >
          <LogOut /> Leave
        </button>
      </div>
    </motion.aside>
  );
}
