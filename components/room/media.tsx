"use client";

import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useRoomContext, useTracks } from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { RoomEvent as AppRoomEvent } from "@/lib/types";

export type ScreenShare = { id: string; ownerId: string; node: React.ReactNode };

export type Media = {
  mode: "livekit" | "local";
  micOn: boolean;
  screenOn: boolean;
  toggleMic: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  /** identity → current audio level 0..1 (0 when silent); read every frame for the tremble */
  levels: React.RefObject<Map<string, number>>;
  screens: ScreenShare[];
};

type BridgeProps = {
  meId: string;
  onRoomEvent: (e: AppRoomEvent) => void;
  /** receives the current controls (and null on unmount); providers render no visible UI themselves */
  onChange: (media: Media | null) => void;
};

/** Publishes the latest media controls to the parent whenever they change. */
function usePublish(media: Media, onChange: (m: Media | null) => void, deps: unknown[]) {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    latest.current(media);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => latest.current(null), []);
}

/** Real voice + screen share through LiveKit Cloud. Group chat events also arrive on this connection. */
export function LiveKitMedia({ serverUrl, token, ...rest }: BridgeProps & { serverUrl: string; token: string }) {
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      audio={false}
      video={false}
      onError={(e) => toast.error("Voice connection problem", { description: e.message })}
    >
      <RoomAudioRenderer />
      <LiveKitBridge {...rest} />
    </LiveKitRoom>
  );
}

function LiveKitBridge({ onRoomEvent, onChange }: BridgeProps) {
  const room = useRoomContext();
  const levels = useRef(new Map<string, number>());
  const [micOn, setMicOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const onEvent = useRef(onRoomEvent);
  useEffect(() => {
    onEvent.current = onRoomEvent;
  });

  useEffect(() => {
    const onData = (payload: Uint8Array) => {
      try {
        onEvent.current(JSON.parse(new TextDecoder().decode(payload)));
      } catch {}
    };
    const syncLocal = () => {
      setMicOn(room.localParticipant.isMicrophoneEnabled);
      setScreenOn(room.localParticipant.isScreenShareEnabled);
    };
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.LocalTrackPublished, syncLocal);
    room.on(RoomEvent.LocalTrackUnpublished, syncLocal);
    let raf = 0;
    const tick = () => {
      const all = [room.localParticipant, ...room.remoteParticipants.values()];
      for (const p of all) levels.current.set(p.identity, p.isSpeaking ? p.audioLevel : 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.LocalTrackPublished, syncLocal);
      room.off(RoomEvent.LocalTrackUnpublished, syncLocal);
    };
  }, [room]);

  const shareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
  const screens = useMemo<ScreenShare[]>(
    () =>
      shareTracks
        .filter((t) => t.publication)
        .map((t) => ({
          id: `${t.participant.identity}-${t.publication!.trackSid}`,
          ownerId: t.participant.identity,
          node: <VideoTrack trackRef={t as never} className="h-full w-full object-contain" />,
        })),
    [shareTracks],
  );

  const media: Media = {
    mode: "livekit",
    micOn,
    screenOn,
    levels,
    screens,
    toggleMic: async () => {
      try {
        await room.localParticipant.setMicrophoneEnabled(!micOn);
        setMicOn(!micOn);
      } catch (e) {
        toast.error("Couldn't use your microphone", { description: (e as Error).message });
      }
    },
    toggleScreen: async () => {
      try {
        await room.localParticipant.setScreenShareEnabled(!screenOn, { audio: false });
        setScreenOn(!screenOn);
      } catch (e) {
        if ((e as Error).name !== "NotAllowedError") toast.error("Couldn't share your screen");
      }
    },
  };
  usePublish(media, onChange, [micOn, screenOn, screens]);
  return null;
}

/**
 * Fallback without LiveKit: your own mic level (so your circle trembles) and a local screen preview.
 * Nothing leaves the browser.
 */
export function LocalMedia({ meId, onChange }: Omit<BridgeProps, "onRoomEvent">) {
  const levels = useRef(new Map<string, number>());
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const warned = useRef(false);

  const warnOnce = () => {
    if (warned.current) return;
    warned.current = true;
    toast("Local preview only", { description: "Add LiveKit keys to talk and share with others in the room." });
  };

  useEffect(() => {
    if (!mic) return;
    const levelMap = levels.current;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(mic).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      levelMap.set(meId, rms > 0.02 ? Math.min(1, rms * 6) : 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      levelMap.set(meId, 0);
      ctx.close();
    };
  }, [mic, meId]);

  useEffect(() => () => mic?.getTracks().forEach((t) => t.stop()), [mic]);
  useEffect(() => () => screen?.getTracks().forEach((t) => t.stop()), [screen]);

  const toggleMic = useCallback(async () => {
    if (mic) return setMic(null);
    try {
      setMic(await navigator.mediaDevices.getUserMedia({ audio: true }));
      warnOnce();
    } catch (e) {
      toast.error("Couldn't use your microphone", { description: (e as Error).message });
    }
  }, [mic]);  

  const toggleScreen = useCallback(async () => {
    if (screen) return setScreen(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => setScreen(null));
      setScreen(stream);
      warnOnce();
    } catch (e) {
      if ((e as Error).name !== "NotAllowedError") toast.error("Couldn't share your screen");
    }
  }, [screen]);  

  const screens = useMemo<ScreenShare[]>(
    () => (screen ? [{ id: screen.id, ownerId: meId, node: <StreamVideo stream={screen} /> }] : []),
    [screen, meId],
  );
  const media: Media = { mode: "local", micOn: Boolean(mic), screenOn: Boolean(screen), toggleMic, toggleScreen, levels, screens };
  usePublish(media, onChange, [mic, screen, toggleMic, toggleScreen, screens]);
  return null;
}

function StreamVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className="h-full w-full object-contain" />;
}
