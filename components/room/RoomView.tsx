"use client";

import { ChevronLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { useGraph } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { useConfig, useSseChannel } from "@/hooks/useRealtime";
import { api, fetcher, loadIdentity } from "@/lib/client/api";
import { useGroupColor } from "@/lib/client/groupHues";
import { scene } from "@/lib/client/scene";
import type { ChatHour, Group, RoomEvent } from "@/lib/types";
import { ChatSheet } from "./ChatSheet";
import { Dock } from "./Dock";
import { LiveKitMedia, LocalMedia, type Media } from "./media";
import { ScreenSharePanel } from "./ScreenSharePanel";

const SCROLL_THRESHOLD = 160; // px of upward scroll to zoom back out to the map
const HINT_KEY = "sm.hint.scroll";

const groupApi = (name: string, action: string) => `/api/groups/${encodeURIComponent(name)}/${action}`;

/** Leaving survives unmounts (browser back) and React StrictMode's mount/unmount/mount. */
let pendingLeave: { name: string; timer: ReturnType<typeof setTimeout> } | null = null;

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

/** After a scroll-out commits, swallow trackpad momentum so it doesn't also zoom the map. */
function swallowWheel(ms: number) {
  const block = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("wheel", block, { capture: true, passive: false });
  setTimeout(() => window.removeEventListener("wheel", block, { capture: true }), ms);
}

function appendChat(hours: ChatHour[], payload: Extract<RoomEvent, { type: "chat" }>["payload"]): ChatHour[] {
  const { hourStart, message } = payload;
  const existing = hours.find((h) => h.hourStart === hourStart);
  if (existing?.messages.some((m) => m.ts === message.ts && m.userId === message.userId)) return hours;
  if (!existing) return [...hours, { hourStart, messages: [message], summary: null }];
  return hours.map((h) => (h === existing ? { ...h, messages: [...h.messages, message] } : h));
}

/**
 * Inside a bubble. The map underneath *is* the room (zoomed in, everyone where they were);
 * this component only layers the controls on top: header, dock, chat, screen shares, and scroll-out.
 */
export function RoomView() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params.name);
  const router = useRouter();
  const config = useConfig();
  const { ready, identity, me } = useMe();
  const { data: graph, mutate: mutateGraph } = useGraph();
  const groupColor = useGroupColor();

  const [joined, setJoined] = useState<Group | null>(null);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [mediaEnabled, setMediaEnabled] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [closing, setClosing] = useState(false);
  const [hint, setHint] = useState(false);
  const exiting = useRef(false);
  const chatOpenRef = useRef(chatOpen);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  });

  // Voice levels feed the map so speakers' circles tremble in place.
  useEffect(() => {
    scene.levels = media?.levels.current ?? new Map();
    return () => {
      scene.levels = new Map();
    };
  }, [media]);

  // ---- join (and leave on unmount, e.g. browser back) ----
  useEffect(() => {
    if (!ready) return;
    if (!identity) {
      router.replace("/");
      return;
    }
    if (pendingLeave?.name === name) {
      clearTimeout(pendingLeave.timer);
      pendingLeave = null;
    }
    let cancelled = false;
    api<Group>(groupApi(name, "join"), { method: "POST" })
      .then((g) => {
        if (cancelled) return;
        setJoined(g);
        mutateGraph();
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e.status === 404 ? "That group has faded away" : (e as Error).message);
        router.replace("/");
      });
    const onPageHide = () => sendLeave(name, true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      if (!exiting.current) {
        pendingLeave = { name, timer: setTimeout(() => ((pendingLeave = null), sendLeave(name)), 250) };
      }
    };
  }, [ready, identity, name, router, mutateGraph]);

  // ---- LiveKit token once we're in ----
  useEffect(() => {
    if (!joined || config?.realtime !== "livekit") return;
    let cancelled = false;
    api<{ token: string }>("/api/livekit/token", { body: { room: joined.name } })
      .then((r) => !cancelled && setLkToken(r.token))
      .catch((e) => toast.error("Voice unavailable", { description: (e as Error).message }));
    return () => {
      cancelled = true;
    };
  }, [joined, config?.realtime]);

  // ---- chat: history from the API, live messages from LiveKit data or SSE ----
  const chatKey = joined ? groupApi(joined.name, "chat") : null;
  const { data: hours = [], mutate: mutateChat } = useSWR<ChatHour[]>(chatKey, fetcher, { revalidateOnFocus: false });
  const onRoomEvent = useCallback(
    (e: RoomEvent) => {
      if (e.type !== "chat") return;
      mutateChat((prev) => appendChat(prev ?? [], e.payload), { revalidate: false });
      if (!chatOpenRef.current && e.payload.message.userId !== identity?.userId) setUnread((n) => n + 1);
    },
    [mutateChat, identity?.userId],
  );
  useSseChannel<RoomEvent>(joined ? `g-${joined.id}` : null, onRoomEvent);

  // ---- leaving: you stay in the bubble (as "away"); the view just zooms back out ----
  const exitRoom = useCallback(
    (how: "leave" | "scroll" | "esc") => {
      if (exiting.current) return;
      exiting.current = true;
      setChatOpen(false);
      setClosing(true);
      sendLeave(name);
      setMediaEnabled(false);
      if (how === "scroll") swallowWheel(1100);
      setTimeout(() => router.push("/"), 220);
    },
    [name, router],
  );

  // ---- scroll up (or pinch out) to zoom back out to the map: scrubbed, commits past a threshold ----
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let acc = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let pinchStart = 0;
    const inPanel = (t: EventTarget | null) =>
      Boolean((t as Element | null)?.closest?.('[data-scroll-region],[data-slot="sheet-content"],[data-slot="dialog-content"]'));

    const setProgress = (progress: number) => {
      if (!reduced) scene.mapApi?.scrub(progress);
      if (progress >= 1) exitRoom("scroll");
    };
    const springBack = () => {
      acc = 0;
      pinchStart = 0;
      if (!exiting.current) scene.mapApi?.scrub(0);
    };

    const onWheel = (e: WheelEvent) => {
      if (inPanel(e.target)) return;
      e.preventDefault();
      if (exiting.current) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dy = e.deltaY * unit;
      // Plain scroll up counts toward exiting (down rewinds). A trackpad pinch arrives as ctrl+wheel,
      // where deltaY > 0 is the "zoom out" direction.
      const delta = e.ctrlKey ? dy * 4 : -dy;
      acc = Math.max(0, Math.min(SCROLL_THRESHOLD, acc + delta));
      setProgress(acc / SCROLL_THRESHOLD);
      clearTimeout(idle);
      if (!exiting.current) idle = setTimeout(springBack, 250);
    };

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2 && !inPanel(e.target)) pinchStart = dist(e.touches);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchStart || exiting.current) return;
      e.preventDefault();
      setProgress(Math.max(0, Math.min(1, (1 - dist(e.touches) / pinchStart) / 0.4)));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchStart) springBack();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      clearTimeout(idle);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [exitRoom]);

  // Esc zooms back out (unless a sheet, dialog or card is open; those close first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[data-slot="sheet-content"],[data-slot="dialog-content"]')) return;
      exitRoom("esc");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitRoom]);

  // First visit: a gentle "Scroll up to zoom out" hint.
  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, "1");
    } catch {}
    const show = setTimeout(() => setHint(true), 900);
    const hide = setTimeout(() => setHint(false), 3900);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  const groupId = joined?.id ?? null;
  const people = useMemo(() => new Map((graph?.users ?? []).map((u) => [u.id, u])), [graph]);
  const here = (graph?.users ?? []).filter((u) => u.groupId === groupId && u.inRoom).length;
  const roomGroup = joined ?? graph?.groups.find((g) => g.name.toLowerCase() === name.toLowerCase()) ?? { id: -1, name };
  const color = groupColor(roomGroup);
  const meId = identity?.userId ?? null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: 0.25 }}
      className="pointer-events-none fixed inset-0 z-10"
    >
      {/* soft vignette so the bubble reads as a room */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 50%, transparent 45%, var(--room-veil) 100%)` }}
      />

      {mediaEnabled && meId && joined && config?.realtime === "livekit" && config.livekitUrl && lkToken && (
        <LiveKitMedia serverUrl={config.livekitUrl} token={lkToken} meId={meId} onRoomEvent={onRoomEvent} onChange={setMedia} />
      )}
      {mediaEnabled && meId && joined && config?.realtime === "sse" && <LocalMedia meId={meId} onChange={setMedia} />}

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="pointer-events-auto fixed top-4 left-4 z-20 flex items-center gap-2"
      >
        <button
          onClick={() => exitRoom("leave")}
          className="glass flex h-10 items-center gap-1 rounded-full pr-4 pl-2.5 text-sm text-foreground/85 transition hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Map
        </button>
        <div className="glass flex h-10 items-center gap-2.5 rounded-full px-4">
          <span className="size-2.5 rounded-full" style={{ background: color }} />
          <span className="max-w-[40vw] truncate font-heading font-semibold">{joined?.name ?? name}</span>
          {joined && <span className="hidden text-xs text-muted-foreground sm:inline">{joined.category}</span>}
          <span className="text-xs text-muted-foreground">{here} here</span>
        </div>
      </motion.header>

      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass fixed bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full px-4 py-2 text-xs text-foreground/80"
          >
            Scroll up to zoom out
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto">
        <AnimatePresence>
          {media?.screens.map((s, i) => (
            <ScreenSharePanel key={s.id} share={s} index={i} ownerName={people.get(s.ownerId)?.name ?? me?.name ?? "Someone"} />
          ))}
        </AnimatePresence>
      </div>

      <div className="pointer-events-auto">
        <Dock
          chatOpen={chatOpen}
          unread={unread}
          micOn={media?.micOn ?? false}
          screenOn={media?.screenOn ?? false}
          onChat={() => {
            setChatOpen((o) => !o);
            setUnread(0);
          }}
          onMic={() => (media ? media.toggleMic() : toast("Connecting voice…"))}
          onScreen={() => (media ? media.toggleScreen() : toast("Connecting voice…"))}
          onLeave={() => exitRoom("leave")}
        />
      </div>

      {joined && (
        <ChatSheet
          open={chatOpen}
          onOpenChange={(o) => {
            setChatOpen(o);
            if (o) setUnread(0);
          }}
          groupName={joined.name}
          hours={hours}
          people={people}
          color={color}
        />
      )}
    </motion.div>
  );
}
