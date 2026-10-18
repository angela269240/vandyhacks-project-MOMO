"use client";

import { Headphones, Loader2, LogOut, MessageSquare, Mic, MicOff, MonitorUp, MonitorX } from "lucide-react";
import { motion } from "motion/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type DockAction = {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  active?: boolean;
  /** shown but explains why it won't do anything right now */
  blocked?: boolean;
  tone?: "default" | "danger";
  badge?: number;
  onClick: () => void;
};

/**
 * The room's four primary controls in a floating glass pill. It sits in a reserved footer under the
 * stage, so chat and screen sharing never cover it.
 */
export function RoomDock({
  chatOpen,
  unread,
  micOn,
  micJoined,
  screenOn,
  otherSharer,
  connecting,
  onChat,
  onMic,
  onScreen,
  onLeave,
}: {
  chatOpen: boolean;
  unread: number;
  micOn: boolean;
  micJoined: boolean;
  screenOn: boolean;
  /** first name of someone else who is sharing, if any */
  otherSharer: string | null;
  connecting: boolean;
  onChat: () => void;
  onMic: () => void;
  onScreen: () => void;
  onLeave: () => void;
}) {
  const micLabel = micOn ? "Mute" : micJoined ? "Unmute" : "Join voice";
  const actions: DockAction[] = [
    {
      id: "chat",
      label: "Chat",
      hint: chatOpen ? "Close chat" : "Open chat",
      icon: <MessageSquare />,
      active: chatOpen,
      badge: chatOpen ? 0 : unread,
      onClick: onChat,
    },
    {
      id: "mic",
      label: micLabel,
      hint: connecting ? "Connecting voice…" : micOn ? "Mute your microphone" : micJoined ? "Unmute your microphone" : "Turn on your microphone to talk",
      icon: connecting ? <Loader2 className="animate-spin" /> : micOn ? <Mic /> : micJoined ? <MicOff /> : <Headphones />,
      active: micOn,
      blocked: connecting,
      onClick: onMic,
    },
    {
      id: "screen",
      label: screenOn ? "Stop sharing" : "Share",
      hint: screenOn ? "Stop sharing your screen" : otherSharer ? `${otherSharer} is sharing` : "Share your screen",
      icon: screenOn ? <MonitorX /> : <MonitorUp />,
      active: screenOn,
      blocked: !screenOn && (!!otherSharer || connecting),
      onClick: onScreen,
    },
    { id: "leave", label: "Leave", hint: "Leave the room", icon: <LogOut />, tone: "danger", onClick: onLeave },
  ];

  return (
    <motion.nav
      aria-label="Room controls"
      initial={{ y: 28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.35, type: "spring", stiffness: 260, damping: 24 }}
      className="glass flex h-[72px] items-center gap-1 rounded-full px-2 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.8)] sm:gap-1.5 sm:px-3"
    >
      {actions.map((a) => (
        <Tooltip key={a.id}>
          <TooltipTrigger
            render={
              <button
                onClick={a.onClick}
                aria-label={a.hint}
                aria-pressed={a.tone === "danger" || a.id === "chat" ? undefined : Boolean(a.active)}
                aria-expanded={a.id === "chat" ? chatOpen : undefined}
                aria-disabled={a.blocked || undefined}
                className={cn(
                  "relative flex h-14 w-[68px] flex-col items-center justify-center gap-1 rounded-full text-[11px] font-medium transition-[background-color,color,box-shadow] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:w-[84px] [&_svg]:size-5",
                  a.tone === "danger"
                    ? "text-[#FB7185] hover:bg-[#FB7185]/12 hover:shadow-[0_0_22px_-4px_rgba(251,113,133,0.6)]"
                    : a.active
                      ? "bg-[#22D3EE]/12 text-[#22D3EE] shadow-[0_0_22px_-6px_rgba(34,211,238,0.7)]"
                      : "text-foreground/85 hover:bg-white/8 hover:text-foreground",
                  a.blocked && "opacity-55",
                )}
              />
            }
          >
            {a.icon}
            <span className="max-w-full truncate px-1">{a.label}</span>
            {a.badge ? (
              <span className="absolute top-0.5 right-3 flex size-[18px] items-center justify-center rounded-full bg-[#F472B6] text-[10px] font-bold text-black shadow-[0_0_10px_#F472B6] sm:right-5">
                {a.badge > 9 ? "9+" : a.badge}
              </span>
            ) : null}
          </TooltipTrigger>
          <TooltipContent side="top">{a.hint}</TooltipContent>
        </Tooltip>
      ))}
    </motion.nav>
  );
}
