"use client";

import { Info, MicOff, Minus, MonitorUp, RotateCw, Users, Volume2, WifiOff } from "lucide-react";
import { motion } from "motion/react";
import { Avatar } from "@/components/profile/Avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Group, GraphUser } from "@/lib/types";
import type { RoomUIState } from "@/hooks/useRoomUIState";
import type { StageMember } from "./RoomMember";

const iconButton =
  "flex size-10 items-center justify-center rounded-full text-foreground/80 transition hover:bg-foreground/10 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/70 [&_svg]:size-[18px]";

/** Room name and live status on the left; members, info and Minimize on the right. Leaving lives in the dock only. */
export function RoomHeader({
  name,
  group,
  color,
  members,
  sharerName,
  ui,
  error,
  voiceMode,
  onRetry,
  onMinimize,
  onSelect,
}: {
  name: string;
  group: Group | null;
  color: string;
  members: StageMember[];
  sharerName: string | null;
  ui: RoomUIState;
  error: string | null;
  voiceMode: "livekit" | "local" | null;
  onRetry: () => void;
  onMinimize: () => void;
  onSelect: (user: GraphUser, rect: DOMRect) => void;
}) {
  const status =
    ui.phase === "connecting"
      ? "Connecting…"
      : ui.phase === "reconnecting"
        ? "Reconnecting…"
        : ui.phase === "failed"
          ? "Disconnected"
          : null;

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="relative z-20 flex h-[68px] shrink-0 items-center justify-between gap-3 px-4 sm:px-6"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="size-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <div className="min-w-0">
          <h1 className="truncate font-heading text-lg leading-tight font-semibold">{group?.name ?? name}</h1>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground" aria-live="polite">
            {status ? (
              <span className="flex items-center gap-1 text-[var(--hue-ochre)]">
                <WifiOff className="size-3" aria-hidden /> {status}
              </span>
            ) : (
              <span>{members.length} here now</span>
            )}
            {sharerName && (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1 text-primary">
                  <MonitorUp className="size-3" aria-hidden /> {sharerName} {sharerName === "You" ? "are" : "is"} sharing
                </span>
              </>
            )}
          </p>
        </div>
        {ui.phase === "failed" && (
          <button
            onClick={onRetry}
            title={error ?? undefined}
            className="glass ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--hue-ochre)] transition hover:bg-foreground/10"
          >
            <RotateCw className="size-3.5" aria-hidden /> Reconnect
          </button>
        )}
      </div>

      <div className="glass flex shrink-0 items-center gap-0.5 rounded-full p-1">
        <Popover>
          <Tooltip>
            <TooltipTrigger render={<PopoverTrigger render={<button aria-label="People in this room" className={iconButton} />} />}>
              <Users />
            </TooltipTrigger>
            <TooltipContent>Members</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" sideOffset={10} className="w-72 p-2">
            <p className="px-1.5 pt-1 pb-0.5 font-heading text-sm font-semibold">{members.length} here now</p>
            <ul className="flex max-h-80 flex-col overflow-y-auto" data-scroll-region>
              {members.map((m) => (
                <li key={m.user.id}>
                  <button
                    onClick={(e) => onSelect(m.user, e.currentTarget.getBoundingClientRect())}
                    className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-foreground/5"
                  >
                    <Avatar name={m.user.name} url={m.user.avatarUrl} color={m.color} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{m.isMe ? `${m.user.name} (you)` : m.user.name}</span>
                      {m.isFriend && <span className="text-[11px] text-primary">Friend</span>}
                    </span>
                    {m.sharing && <MonitorUp className="size-3.5 text-primary" aria-label="Sharing" />}
                    {m.speaking && <Volume2 className="size-3.5" style={{ color: m.color }} aria-label="Speaking" />}
                    {m.mic === "off" && <MicOff className="size-3.5 text-destructive" aria-label="Muted" />}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <Popover>
          <Tooltip>
            <TooltipTrigger render={<PopoverTrigger render={<button aria-label="About this room" className={iconButton} />} />}>
              <Info />
            </TooltipTrigger>
            <TooltipContent>Room info</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" sideOffset={10} className="w-80 gap-2 p-3.5 text-sm">
            <p className="flex items-center gap-2 font-heading font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
              {group?.name ?? name}
            </p>
            {group && (
              <p className="text-xs text-muted-foreground">
                Created {new Date(group.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
            <p className="text-foreground/85">
              {voiceMode === "local"
                ? "Voice and screen sharing are in local preview mode: add LiveKit keys so others can hear and see you."
                : "Voice, screen sharing and chat run live over LiveKit."}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Minimize keeps you in the room while you look around the map. Leaving keeps you on the map as “away” for
              24 hours. A room left empty for 24 hours fades away.
            </p>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger render={<button onClick={onMinimize} aria-label="Minimize Room" className={iconButton} />}>
            <Minus />
          </TooltipTrigger>
          <TooltipContent>Minimize Room</TooltipContent>
        </Tooltip>
      </div>
    </motion.header>
  );
}
