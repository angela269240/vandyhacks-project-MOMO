"use client";

import { Loader2, LogOut, MessageSquare, Mic, MicOff, MonitorUp, MonitorX, NotebookPen } from "lucide-react";
import { motion } from "motion/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PanelTab } from "./RoomConnection";

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
  /** a small pulsing dot, e.g. the AI notetaker is listening */
  live?: boolean;
  /** opens the side panel on its own tab (aria-expanded instead of aria-pressed) */
  panel?: boolean;
  onClick: () => void;
};

/**
 * The room's primary controls in a floating glass pill. It sits in a reserved footer under the
 * stage, so the side panel and screen sharing never cover it. Chat and Notes open the same side panel,
 * each on its own tab.
 */
export function RoomDock({
  chatOpen,
  panelTab,
  notesListening,
  unread,
  micOn,
  screenOn,
  otherSharer,
  connecting,
  onChat,
  onNotes,
  onMic,
  onScreen,
  onLeave,
}: {
  chatOpen: boolean;
  panelTab: PanelTab;
  /** the AI notetaker is listening */
  notesListening: boolean;
  unread: number;
  micOn: boolean;
  screenOn: boolean;
  /** first name of someone else who is sharing, if any */
  otherSharer: string | null;
  connecting: boolean;
  onChat: () => void;
  onNotes: () => void;
  onMic: () => void;
  onScreen: () => void;
  onLeave: () => void;
}) {
  const chatOn = chatOpen && panelTab === "chat";
  const notesOn = chatOpen && panelTab === "notes";
  const actions: DockAction[] = [
    {
      id: "chat",
      label: "Chat",
      hint: chatOn ? "Close chat" : "Open chat",
      icon: <MessageSquare />,
      active: chatOn,
      panel: true,
      badge: chatOn ? 0 : unread,
      onClick: onChat,
    },
    {
      id: "notes",
      label: "Notes",
      hint: notesOn ? "Close notes" : notesListening ? "Open notes (AI is listening)" : "Open notes",
      icon: <NotebookPen />,
      active: notesOn,
      panel: true,
      live: notesListening,
      onClick: onNotes,
    },
    {
      id: "mic",
      label: micOn ? "Mute" : "Unmute",
      hint: connecting ? "Connecting voice…" : micOn ? "Mute your microphone" : "Unmute your microphone",
      icon: connecting ? <Loader2 className="animate-spin" /> : micOn ? <Mic /> : <MicOff />,
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
      className="glass elevated flex h-[72px] items-center gap-1 rounded-full px-2 sm:gap-1.5 sm:px-3"
    >
      {actions.map((a) => (
        <Tooltip key={a.id}>
          <TooltipTrigger
            render={
              <button
                onClick={a.onClick}
                aria-label={a.hint}
                aria-pressed={a.tone === "danger" || a.panel ? undefined : Boolean(a.active)}
                aria-expanded={a.panel ? Boolean(a.active) : undefined}
                aria-disabled={a.blocked || undefined}
                className={cn(
                  "relative flex h-14 w-[60px] flex-col items-center justify-center gap-1 rounded-full text-[11px] font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:w-[84px] [&_svg]:size-5",
                  a.tone === "danger"
                    ? "text-destructive hover:bg-destructive/12"
                    : a.active
                      ? "border border-primary/35 bg-primary/12 text-primary"
                      : "text-foreground/85 hover:bg-foreground/8 hover:text-foreground",
                  a.blocked && "opacity-55",
                )}
              />
            }
          >
            {a.icon}
            <span className="max-w-full truncate px-1">{a.label}</span>
            {a.badge ? (
              <span className="absolute top-0.5 right-3 flex size-[18px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground sm:right-5">
                {a.badge > 9 ? "9+" : a.badge}
              </span>
            ) : null}
            {a.live && <span className="absolute top-2.5 right-4 size-1.5 animate-pulse rounded-full bg-(--hue-sage) sm:right-6" aria-hidden />}
          </TooltipTrigger>
          <TooltipContent side="top">{a.hint}</TooltipContent>
        </Tooltip>
      ))}
    </motion.nav>
  );
}
