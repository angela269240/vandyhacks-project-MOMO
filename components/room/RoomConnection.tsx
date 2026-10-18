"use client";

import { RoomAudioRenderer } from "@livekit/components-react";
import { Room, RoomEvent, Track, type Participant, type TrackPublication } from "livekit-client";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { refreshGraph, useGraph } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { useConfig, useSseChannel } from "@/hooks/useRealtime";
import { ApiError, api, fetcher, loadIdentity } from "@/lib/client/api";
import type { ChatHour, ChatMessage, Group, RoomEvent as AppRoomEvent } from "@/lib/types";

/**
 * The live room connection lives here, in the map layout, not in the room page: minimizing the room
 * (navigating back to the map) unmounts the page but keeps this provider, so voice, screen share,
 * chat and presence carry on until the user explicitly leaves.
 */

export type RoomStatus = "joining" | "connecting" | "live" | "reconnecting" | "failed";

export type RoomSession = {
  /** the room name as requested (the URL segment) */
  name: string;
  group: Group | null;
  status: RoomStatus;
  error: string | null;
  /** the group no longer exists */
  missing: boolean;
};

export type Share = {
  key: string;
  ownerId: string;
  /** LiveKit: the screen-share publication (track may be undefined until subscribed) */
  participant?: Participant;
  publication?: TrackPublication;
  /** local preview mode: the captured stream */
  stream?: MediaStream;
};

export type Voice = {
  /** "local" = no LiveKit configured: your own mic level and a local screen preview, nothing leaves the browser */
  mode: "livekit" | "local" | null;
  micOn: boolean;
  /** has the mic been switched on at least once this session ("Join voice" vs "Unmute") */
  micJoined: boolean;
  screenOn: boolean;
  /** identity -> publishing an unmuted mic; identities that aren't in the map aren't connected to voice */
  micStates: Map<string, boolean>;
  /** identities LiveKit currently reports as speaking */
  speaking: Set<string>;
  shares: Share[];
};

type RoomConnection = {
  session: RoomSession | null;
  /** the room UI is open (vs. minimized onto the map) */
  roomVisible: boolean;
  voice: Voice;
  room: Room | null;
  /** live audio level 0..1 for an identity; cheap, meant to be read per animation frame */
  getLevel: (identity: string) => number;
  toggleMic: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  hours: ChatHour[];
  sendChat: (text: string) => Promise<void>;
  unread: number;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  draft: string;
  setDraft: (text: string) => void;
  /** join (or switch to) a room; a no-op if already in it */
  enter: (name: string) => void;
  /** stop media, disconnect, end presence */
  leave: () => Promise<void>;
  retry: () => void;
};

const EMPTY_VOICE: Voice = {
  mode: null,
  micOn: false,
  micJoined: false,
  screenOn: false,
  micStates: new Map(),
  speaking: new Set(),
  shares: [],
};

const Ctx = createContext<RoomConnection | null>(null);

export const groupApi = (name: string, action: string) => `/api/groups/${encodeURIComponent(name)}/${action}`;
const sameRoom = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const messageKey = (m: ChatMessage) => m.id ?? `${m.ts}-${m.userId}`;

/** Adds a message to its hour bucket unless it's already there (our own POST response and its broadcast both arrive). */
function appendChat(hours: ChatHour[], hourStart: string, message: ChatMessage): ChatHour[] {
  const key = messageKey(message);
  const existing = hours.find((h) => h.hourStart === hourStart);
  if (existing?.messages.some((m) => messageKey(m) === key)) return hours;
  if (!existing) return [...hours, { hourStart, messages: [message], summary: null }].sort((a, b) => a.hourStart.localeCompare(b.hourStart));
  return hours.map((h) =>
    h === existing ? { ...h, messages: [...h.messages, message].sort((a, b) => a.ts.localeCompare(b.ts)) } : h,
  );
}

/** Tab closing: sendBeacon can't set headers, so the leave route also accepts identity in the body. */
function sendLeave(name: string, beacon = false) {
  const identity = loadIdentity();
  if (!identity) return;
  const url = groupApi(name, "leave");
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([JSON.stringify(identity)], { type: "application/json" }));
    return;
  }
  fetch(url, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json", "x-user-id": identity.userId, "x-device-key": identity.deviceKey },
    body: "{}",
  }).catch(() => {});
}

const mediaErrorMessage = (e: unknown, what: "microphone" | "screen") => {
  const name = (e as Error)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return what === "microphone"
      ? "Microphone access is blocked. Allow it in your browser's site settings, then try again."
      : "Screen sharing was blocked by the browser.";
  if (name === "NotFoundError") return what === "microphone" ? "No microphone found." : "Nothing to share was found.";
  return (e as Error)?.message || `Couldn't start your ${what}.`;
};

export function RoomConnectionProvider({ children }: { children: React.ReactNode }) {
  const config = useConfig();
  const { identity } = useMe();
  const { data: graph } = useGraph();
  const { mutate } = useSWRConfig();
  const pathname = usePathname();
  const meId = identity?.userId ?? null;

  const [target, setTarget] = useState<{ name: string; attempt: number } | null>(null);
  const [session, setSession] = useState<RoomSession | null>(null);
  const [voice, setVoice] = useState<Voice>(EMPTY_VOICE);
  const [room, setRoom] = useState<Room | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef(session);
  const localMic = useRef<MediaStream | null>(null);
  const localScreen = useRef<MediaStream | null>(null);
  const localLevels = useRef(new Map<string, number>());
  const stopAnalyser = useRef<(() => void) | null>(null);
  /** we hold the room's screen-share slot on the server */
  const holdingScreen = useRef(false);
  useEffect(() => {
    sessionRef.current = session;
  });

  const roomVisible = !!session && pathname.startsWith("/g/") && sameRoom(decodeURIComponent(pathname.slice(3)), session.name);
  const nameOf = useCallback(
    (id: string) => (id === meId ? "You" : (graph?.users.find((u) => u.id === id)?.name.split(" ")[0] ?? "Someone")),
    [graph, meId],
  );

  // ---- chat history + live messages ----
  const chatKey = session?.group ? groupApi(session.group.name, "chat") : null;
  const { data: hours = [], mutate: mutateChat } = useSWR<ChatHour[]>(chatKey, fetcher, { revalidateOnFocus: false });

  const live = useRef({ chatOpen, roomVisible, meId });
  useEffect(() => {
    live.current = { chatOpen, roomVisible, meId };
  });
  const onRoomEvent = useCallback(
    (e: AppRoomEvent) => {
      if (e.type !== "chat") return;
      mutateChat((prev) => appendChat(prev ?? [], e.payload.hourStart, e.payload.message), { revalidate: false });
      const { chatOpen: open, roomVisible: visible, meId: me } = live.current;
      if (e.payload.message.userId !== me && !(open && visible)) setUnread((n) => n + 1);
    },
    [mutateChat],
  );
  const onRoomEventRef = useRef(onRoomEvent);
  useEffect(() => {
    onRoomEventRef.current = onRoomEvent;
  });
  useSseChannel<AppRoomEvent>(session?.group && voice.mode === "local" ? `g-${session.group.id}` : null, onRoomEvent);

  const sendChat = useCallback(
    async (text: string) => {
      const group = sessionRef.current?.group;
      if (!group) throw new Error("Not in a room");
      const res = await api<{ hourStart: string; message: ChatMessage }>(groupApi(group.name, "chat"), { body: { text } });
      // Show it right away; the broadcast copy is dropped by id when it arrives.
      mutateChat((prev) => appendChat(prev ?? [], res.hourStart, res.message), { revalidate: false });
    },
    [mutateChat],
  );

  // ---- LiveKit state -> React state (event driven) ----
  const syncFromRoom = useCallback((r: Room) => {
    const everyone: Participant[] = [r.localParticipant, ...r.remoteParticipants.values()];
    const micStates = new Map<string, boolean>();
    const shares: Share[] = [];
    for (const p of everyone) {
      const mic = p.getTrackPublication(Track.Source.Microphone);
      micStates.set(p.identity, !!mic && !mic.isMuted);
      const screen = p.getTrackPublication(Track.Source.ScreenShare);
      if (screen) shares.push({ key: `${p.identity}-${screen.trackSid}`, ownerId: p.identity, participant: p, publication: screen });
    }
    setVoice((v) => ({
      ...v,
      mode: "livekit",
      micOn: r.localParticipant.isMicrophoneEnabled,
      screenOn: r.localParticipant.isScreenShareEnabled,
      micStates,
      speaking: new Set(r.activeSpeakers.map((p) => p.identity)),
      shares,
    }));
  }, []);

  const releaseScreen = useCallback(() => {
    if (!holdingScreen.current) return;
    holdingScreen.current = false;
    const group = sessionRef.current?.group;
    if (group) api(groupApi(group.name, "screen"), { body: { sharing: false } }).catch(() => {});
  }, []);

  /** Stops local capture and disconnects. Doesn't touch server presence. */
  const teardownMedia = useCallback(() => {
    const r = roomRef.current;
    roomRef.current = null;
    if (r) r.disconnect();
    setRoom(null);
    stopAnalyser.current?.();
    stopAnalyser.current = null;
    localMic.current?.getTracks().forEach((t) => t.stop());
    localScreen.current?.getTracks().forEach((t) => t.stop());
    localMic.current = localScreen.current = null;
    localLevels.current.clear();
    holdingScreen.current = false;
    setVoice(EMPTY_VOICE);
  }, []);

  // ---- join + connect whenever the target room changes (or on retry) ----
  useEffect(() => {
    if (!target || !config || !meId) return;
    let cancelled = false;
    const name = target.name;

    const run = async () => {
      setSession({ name, group: null, status: "joining", error: null, missing: false });
      let group: Group;
      try {
        group = await api<Group>(groupApi(name, "join"), { method: "POST" });
      } catch (e) {
        if (cancelled) return;
        const missing = e instanceof ApiError && e.status === 404;
        setSession({ name, group: null, status: "failed", error: missing ? "This group has faded away." : "Couldn't join the room.", missing });
        return;
      }
      if (cancelled) return;
      refreshGraph(mutate);

      if (config.realtime !== "livekit" || !config.livekitUrl) {
        setVoice({ ...EMPTY_VOICE, mode: "local" });
        setSession({ name, group, status: "live", error: null, missing: false });
        return;
      }

      setSession({ name, group, status: "connecting", error: null, missing: false });
      try {
        const { token } = await api<{ token: string }>("/api/livekit/token", { body: { room: group.name } });
        if (cancelled) return;
        const r = new Room({ adaptiveStream: true, dynacast: true });
        const sync = () => roomRef.current === r && syncFromRoom(r);
        r.on(RoomEvent.ParticipantConnected, sync)
          .on(RoomEvent.ParticipantDisconnected, sync)
          .on(RoomEvent.TrackPublished, sync)
          .on(RoomEvent.TrackUnpublished, sync)
          .on(RoomEvent.TrackSubscribed, sync)
          .on(RoomEvent.TrackUnsubscribed, sync)
          .on(RoomEvent.TrackMuted, sync)
          .on(RoomEvent.TrackUnmuted, sync)
          .on(RoomEvent.LocalTrackPublished, sync)
          .on(RoomEvent.ActiveSpeakersChanged, sync)
          .on(RoomEvent.LocalTrackUnpublished, (pub) => {
            // Also fires when the user stops sharing from the browser's own "Stop sharing" bar.
            if (pub.source === Track.Source.ScreenShare) releaseScreen();
            sync();
          })
          .on(RoomEvent.DataReceived, (payload) => {
            try {
              onRoomEventRef.current(JSON.parse(new TextDecoder().decode(payload)));
            } catch {}
          })
          .on(RoomEvent.MediaDevicesError, (e) => {
            toast.error("Media device problem", { description: mediaErrorMessage(e, "microphone") });
            sync();
          })
          .on(RoomEvent.Reconnecting, () => roomRef.current === r && setSession((s) => s && { ...s, status: "reconnecting" }))
          .on(RoomEvent.Reconnected, () => {
            if (roomRef.current !== r) return;
            setSession((s) => s && { ...s, status: "live", error: null });
            mutateChat();
            sync();
          })
          .on(RoomEvent.Disconnected, () => {
            // We clear roomRef before disconnecting on purpose, so this only fires for real drops.
            if (roomRef.current !== r) return;
            setSession((s) => s && { ...s, status: "failed", error: "Lost connection to the room." });
            setVoice((v) => ({ ...v, micOn: false, screenOn: false, speaking: new Set(), micStates: new Map(), shares: [] }));
          });
        roomRef.current = r;
        setRoom(r);
        await r.connect(config.livekitUrl, token);
        if (cancelled || roomRef.current !== r) return;
        syncFromRoom(r);
        setSession({ name, group, status: "live", error: null, missing: false });
        mutateChat(); // catch up on anything sent while connecting
      } catch (e) {
        if (cancelled) return;
        setSession({ name, group, status: "failed", error: `Couldn't connect to voice: ${(e as Error).message}`, missing: false });
      }
    };
    run();

    return () => {
      cancelled = true;
      teardownMedia();
    };
  }, [target, config, meId, mutate, mutateChat, syncFromRoom, teardownMedia, releaseScreen]);

  // Closing the tab ends presence (the LiveKit webhook covers crashes).
  useEffect(() => {
    const name = session?.group?.name;
    if (!name) return;
    const onPageHide = () => sendLeave(name, true);
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [session?.group?.name]);

  // Reading chat in the open room clears the badge.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from route + panel state
    if (chatOpen && roomVisible) setUnread(0);
  }, [chatOpen, roomVisible, hours]);

  // ---- public actions ----
  const enter = useCallback((name: string) => {
    const current = sessionRef.current;
    if (current && sameRoom(current.name, name) && current.status !== "failed") return;
    // Switching rooms: the old connection is torn down by the effect cleanup; joining the new group moves presence.
    if (current && !sameRoom(current.name, name)) {
      setChatOpen(false);
      setUnread(0);
    }
    setTarget((t) => ({ name, attempt: (t?.attempt ?? 0) + 1 }));
  }, []);

  const retry = useCallback(() => setTarget((t) => (t ? { ...t, attempt: t.attempt + 1 } : t)), []);

  const leave = useCallback(async () => {
    const current = sessionRef.current;
    teardownMedia(); // unpublishes mic + screen and disconnects
    if (current?.group) sendLeave(current.group.name); // ends presence (also frees the screen slot server-side)
    setTarget(null);
    setSession(null);
    setChatOpen(false);
    setUnread(0);
    setDraft("");
    await refreshGraph(mutate);
  }, [teardownMedia, mutate]);

  const getLevel = useCallback((id: string) => {
    const r = roomRef.current;
    if (r) {
      const p = id === r.localParticipant.identity ? r.localParticipant : r.remoteParticipants.get(id);
      return p?.isSpeaking ? p.audioLevel : 0;
    }
    return localLevels.current.get(id) ?? 0;
  }, []);

  const toggleMic = useCallback(async () => {
    const r = roomRef.current;
    if (voice.mode === "livekit") {
      if (!r || sessionRef.current?.status !== "live") return void toast("Connecting voice…");
      try {
        await r.localParticipant.setMicrophoneEnabled(!voice.micOn);
        setVoice((v) => ({ ...v, micJoined: true }));
        syncFromRoom(r);
      } catch (e) {
        toast.error("Couldn't use your microphone", { description: mediaErrorMessage(e, "microphone") });
        syncFromRoom(r);
      }
      return;
    }
    if (voice.mode !== "local" || !meId) return void toast("Connecting voice…");
    if (localMic.current) {
      stopAnalyser.current?.();
      localMic.current.getTracks().forEach((t) => t.stop());
      localMic.current = null;
      setVoice((v) => ({ ...v, micOn: false, speaking: new Set(), micStates: new Map([[meId, false]]) }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localMic.current = stream;
      // Local preview: measure our own level so our circle reacts. Speaking flips with a little hysteresis.
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let raf = 0;
      let speaking = false;
      let quietSince = 0;
      const tick = (t: number) => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length);
        const level = rms > 0.02 ? Math.min(1, rms * 6) : 0;
        localLevels.current.set(meId, level);
        if (level > 0 && !speaking) {
          speaking = true;
          setVoice((v) => ({ ...v, speaking: new Set([meId]) }));
        } else if (level === 0 && speaking) {
          quietSince ||= t;
          if (t - quietSince > 400) {
            speaking = false;
            quietSince = 0;
            setVoice((v) => ({ ...v, speaking: new Set() }));
          }
        } else quietSince = 0;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      stopAnalyser.current = () => {
        cancelAnimationFrame(raf);
        localLevels.current.set(meId, 0);
        ctx.close();
      };
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        toast.error("Your microphone stopped");
        stopAnalyser.current?.();
        localMic.current = null;
        setVoice((v) => ({ ...v, micOn: false, speaking: new Set(), micStates: new Map([[meId, false]]) }));
      });
      setVoice((v) => ({ ...v, micOn: true, micJoined: true, micStates: new Map([[meId, true]]) }));
      toast("Local preview only", { description: "Add LiveKit keys to talk with others in the room." });
    } catch (e) {
      toast.error("Couldn't use your microphone", { description: mediaErrorMessage(e, "microphone") });
    }
  }, [voice.mode, voice.micOn, meId, syncFromRoom]);

  const toggleScreen = useCallback(async () => {
    const group = sessionRef.current?.group;
    if (!group || !meId || !voice.mode) return void toast("Connecting…");
    const r = roomRef.current;

    if (voice.screenOn) {
      if (r) await r.localParticipant.setScreenShareEnabled(false).catch(() => {});
      localScreen.current?.getTracks().forEach((t) => t.stop());
      localScreen.current = null;
      releaseScreen();
      if (r) syncFromRoom(r);
      else setVoice((v) => ({ ...v, screenOn: false, shares: [] }));
      return;
    }

    const other = voice.shares.find((s) => s.ownerId !== meId);
    if (other) return void toast(`${nameOf(other.ownerId)} is already sharing`, { description: "One screen at a time." });
    if (voice.mode === "livekit" && sessionRef.current?.status !== "live") return void toast("Connecting voice…");

    // Ask the server for the room's single share slot first, so two people can't both start.
    try {
      await api(groupApi(group.name, "screen"), { body: { sharing: true } });
      holdingScreen.current = true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409)
        return void toast("Someone else just started sharing", { description: "One screen at a time." });
      return void toast.error("Couldn't start sharing", { description: (e as Error).message });
    }

    try {
      if (r) {
        await r.localParticipant.setScreenShareEnabled(true, { audio: false });
        syncFromRoom(r);
      } else {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        localScreen.current = stream;
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          localScreen.current = null;
          releaseScreen();
          setVoice((v) => ({ ...v, screenOn: false, shares: [] }));
        });
        setVoice((v) => ({ ...v, screenOn: true, shares: [{ key: stream.id, ownerId: meId, stream }] }));
        toast("Local preview only", { description: "Add LiveKit keys so others in the room can see your screen." });
      }
    } catch (e) {
      releaseScreen();
      if (r) syncFromRoom(r);
      // Cancelling the browser's picker is not an error worth shouting about.
      if ((e as Error).name !== "NotAllowedError") toast.error("Couldn't share your screen", { description: mediaErrorMessage(e, "screen") });
    }
  }, [voice.mode, voice.screenOn, voice.shares, meId, nameOf, releaseScreen, syncFromRoom]);

  // Signed out / provider gone: drop the connection.
  useEffect(
    () => () => {
      roomRef.current?.disconnect();
    },
    [],
  );

  const value = useMemo<RoomConnection>(
    () => ({
      session,
      roomVisible,
      voice,
      room,
      getLevel,
      toggleMic,
      toggleScreen,
      hours,
      sendChat,
      unread,
      chatOpen,
      setChatOpen,
      draft,
      setDraft,
      enter,
      leave,
      retry,
    }),
    [session, roomVisible, voice, room, getLevel, toggleMic, toggleScreen, hours, sendChat, unread, chatOpen, draft, enter, leave, retry],
  );

  return (
    <Ctx.Provider value={value}>
      {/* Remote voices keep playing while the room is minimized. */}
      {room && <RoomAudioRenderer room={room} />}
      {children}
    </Ctx.Provider>
  );
}

export function useRoomConnection() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRoomConnection outside RoomConnectionProvider");
  return ctx;
}
