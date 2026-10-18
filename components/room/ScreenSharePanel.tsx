"use client";

import { GripHorizontal, MonitorUp } from "lucide-react";
import { motion, useDragControls } from "motion/react";
import type { ScreenShare } from "./media";

/** Floating window for a shared screen: drag by the title bar, resize from the corner. */
export function ScreenSharePanel({ share, ownerName, index }: { share: ScreenShare; ownerName: string; index: number }) {
  const controls = useDragControls();
  return (
    <motion.div
      drag
      dragListener={false}
      dragControls={controls}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      data-scroll-region
      className="glass fixed z-20 flex flex-col overflow-hidden rounded-xl elevated"
      style={{
        top: 80 + index * 28,
        right: 24 + index * 28,
        width: 420,
        height: 260,
        resize: "both",
        minWidth: 240,
        minHeight: 160,
        maxWidth: "calc(100vw - 48px)",
      }}
    >
      <div
        onPointerDown={(e) => controls.start(e)}
        className="flex cursor-grab touch-none items-center gap-2 border-b border-foreground/10 px-3 py-1.5 text-xs text-muted-foreground select-none active:cursor-grabbing"
      >
        <MonitorUp className="size-3.5" /> {ownerName}&apos;s screen
        <GripHorizontal className="ml-auto size-3.5 opacity-60" />
      </div>
      <div className="min-h-0 flex-1 bg-black/60">{share.node}</div>
    </motion.div>
  );
}
