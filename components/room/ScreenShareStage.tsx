"use client";

import { VideoTrack } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Loader2, Maximize, MonitorUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Share } from "./RoomConnection";

/** The shared screen as the main stage: the real LiveKit track (or your local preview), aspect ratio preserved. */
export function ScreenShareStage({
  share,
  ownerName,
  isMine,
  color,
}: {
  share: Share;
  ownerName: string;
  isMine: boolean;
  color: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const title = isMine ? "You're sharing your screen" : `${ownerName} is sharing their screen`;
  const subscribed = share.stream || share.publication?.track;

  return (
    <section
      aria-label={title}
      className="glass relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl"
      style={{ borderColor: `${color}55`, boxShadow: `0 0 40px -18px ${color}` }}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-3 text-sm">
        <MonitorUp className="size-4" style={{ color }} aria-hidden />
        <span className="truncate font-medium">{title}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={() => frameRef.current?.requestFullscreen?.()}
                aria-label="View shared screen fullscreen"
                className="ml-auto rounded-md p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              />
            }
          >
            <Maximize className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Fullscreen</TooltipContent>
        </Tooltip>
      </header>
      <div ref={frameRef} className="relative min-h-0 flex-1 bg-[#02040a]">
        {share.stream ? (
          <StreamVideo stream={share.stream} onLoaded={() => setLoaded(true)} />
        ) : share.participant && share.publication && subscribed ? (
          <VideoTrack
            trackRef={{ participant: share.participant, publication: share.publication, source: Track.Source.ScreenShare }}
            onLoadedData={() => setLoaded(true)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : null}
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Loading {isMine ? "your" : `${ownerName}'s`} screen…
          </div>
        )}
      </div>
    </section>
  );
}

function StreamVideo({ stream, onLoaded }: { stream: MediaStream; onLoaded: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      onLoadedData={onLoaded}
      className={cn("absolute inset-0 h-full w-full object-contain")}
    />
  );
}
