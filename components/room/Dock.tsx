"use client";

import { LogOut, MessageSquare, Mic, MicOff, MonitorUp } from "lucide-react";
import { motion } from "motion/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type DockButton = {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  tone?: "default" | "danger";
  badge?: number;
  onClick: () => void;
};

/** Four glass circle buttons along the bottom of a room. */
export function Dock({
  chatOpen,
  unread,
  micOn,
  screenOn,
  onChat,
  onMic,
  onScreen,
  onLeave,
}: {
  chatOpen: boolean;
  unread: number;
  micOn: boolean;
  screenOn: boolean;
  onChat: () => void;
  onMic: () => void;
  onScreen: () => void;
  onLeave: () => void;
}) {
  const buttons: DockButton[] = [
    { label: "Text chat", icon: <MessageSquare />, active: chatOpen, badge: unread, onClick: onChat },
    { label: micOn ? "Mute" : "Voice chat", icon: micOn ? <Mic /> : <MicOff />, active: micOn, onClick: onMic },
    { label: screenOn ? "Stop sharing" : "Share screen", icon: <MonitorUp />, active: screenOn, onClick: onScreen },
    { label: "Leave group", icon: <LogOut />, tone: "danger", onClick: onLeave },
  ];

  return (
    <motion.nav
      aria-label="Room controls"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.35, type: "spring", stiffness: 260, damping: 24 }}
      className="fixed inset-x-0 bottom-6 z-20 flex justify-center gap-4"
    >
      {buttons.map((b) => (
        <Tooltip key={b.label}>
          <TooltipTrigger
            render={
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                onClick={b.onClick}
                aria-label={b.label}
                aria-pressed={b.tone === "danger" ? undefined : Boolean(b.active)}
                className={cn(
                  "glass relative flex size-14 items-center justify-center rounded-full transition-[box-shadow,color,border-color] outline-none focus-visible:ring-3 focus-visible:ring-ring/60 [&_svg]:size-5",
                  b.tone === "danger"
                    ? "text-[#FB7185] hover:border-[#FB7185]/60 hover:shadow-[0_0_24px_rgba(251,113,133,0.45)]"
                    : b.active
                      ? "border-[#22D3EE]/70 text-[#22D3EE] shadow-[0_0_24px_rgba(34,211,238,0.5)]"
                      : "text-foreground/85 hover:text-foreground hover:shadow-[0_0_18px_rgba(120,150,255,0.35)]",
                )}
              />
            }
          >
            {b.icon}
            {b.badge ? (
              <span className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-[#F472B6] text-[10px] font-bold text-black shadow-[0_0_10px_#F472B6]">
                {b.badge > 9 ? "9+" : b.badge}
              </span>
            ) : null}
          </TooltipTrigger>
          <TooltipContent side="top">{b.label}</TooltipContent>
        </Tooltip>
      ))}
    </motion.nav>
  );
}
