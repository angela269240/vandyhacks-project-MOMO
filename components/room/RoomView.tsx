"use client";

import { ChevronLeft } from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { EditProfileSheet } from "@/components/profile/ProfileDialogs";
import { useGraph } from "@/hooks/useGraph";
import { useMe } from "@/hooks/useMe";
import { useConfig, useSseChannel } from "@/hooks/useRealtime";
import { api, fetcher, loadIdentity } from "@/lib/client/api";
import { sceneEvents } from "@/lib/client/scene";
import type { ChatHour, Group, GraphUser, RoomEvent } from "@/lib/types";
import { ChatSheet } from "./ChatSheet";
import { Dock } from "./Dock";
import { LiveKitMedia, LocalMedia, type Media } from "./media";
import { RoomStage } from "./RoomStage";
import { ScreenSharePanel } from "./ScreenSharePanel";

const SCROLL_THRESHOLD = 160; // px of upward scroll to zoom back out to the map
const HINT_KEY = "sm.hint.scroll";
const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.55, 0, 0.75, 0.3] as const;
const emptyLevels = { current: new Map<string, number>() };

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

export function RoomView() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params.name);
  const router = useRouter();
  const config = useConfig();
  const { ready, identity, me } = useMe();
  const { data: graph, mutate: mutateGraph } = useGraph();

  const [joined, setJoined] = useState<Group | null>(null);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [mediaEnabled, setMediaEnabled] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [selected, setSelected] = useState<{ user: GraphUser; x: number; y: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [meExiting, setMeExiting] = useState(false);
  const [hint, setHint] = useState(false);
  const exiting = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const chatOpenRef = useRef(chatOpen);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  });

  // ---- reveal: the room expands out of the blob the map just zoomed into ----
  const open = useMotionValue(0);
  const clipPath = useTransform(open, (v) => `circle(${Math.max(v, 0) * 80}% at 50% 47%)`);
  const scale = useTransform(open, [0, 1], [0.88, 1]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const controls = animate(open, 1, {
      duration: reduced ? 0 : 0.7,
      ease: EASE_OUT,
      onComplete: () => sceneEvents.emit("map-pause"),
    });
    return () => {
      controls.stop();
      sceneEvents.emit("map-resume");
    };
  }, [open]);

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

  // ---- leaving: my circle slides out, edges fade, the room collapses back into the map ----
  const exitRoom = useCallback(
    async (how: "leave" | "scroll" | "esc") => {
      if (exiting.current) return;
      exiting.current = true;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setChatOpen(false);
      setSelected(null);
      setMeExiting(true);
      sceneEvents.emit("map-resume");
      sendLeave(name);
      setMediaEnabled(false);
      if (how === "scroll") swallowWheel(1100);
      await new Promise((r) => setTimeout(r, reduced ? 0 : how === "scroll" ? 150 : 420));
      await animate(open, 0, { duration: reduced ? 0 : 0.45, ease: EASE_IN });
      router.push("/");
    },
    [name, open, router],
  );

  // ---- scroll up (or pinch out) to zoom back out to the map: scrubbed, commits past a threshold ----
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let acc = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let revealing = false;
    let pinchStart = 0;

    const setProgress = (progress: number) => {
      if (progress > 0 && !revealing) {
        revealing = true;
        sceneEvents.emit("map-resume");
      }
      if (!reduced) open.set(1 - progress * 0.45);
      if (progress >= 1) exitRoom("scroll");
    };
    const springBack = () => {
      acc = 0;
      pinchStart = 0;
      if (exiting.current) return;
      animate(open, 1, { type: "spring", stiffness: 320, damping: 30 });
      if (revealing) {
        revealing = false;
        sceneEvents.emit("map-pause");
      }
    };

    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-scroll-region]")) return;
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
      if (e.touches.length === 2) pinchStart = dist(e.touches);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchStart || exiting.current) return;
      e.preventDefault();
      setProgress(Math.max(0, Math.min(1, (1 - dist(e.touches) / pinchStart) / 0.4)));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchStart) springBack();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      clearTimeout(idle);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [open, exitRoom]);

  // Esc zooms back out (unless a sheet or dialog is open; those close first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[data-slot="sheet-content"],[data-slot="dialog-content"]')) return;
      if (selected) setSelected(null);
      else exitRoom("esc");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitRoom, selected]);

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

  // ---- who's in the room ----
  const groupId = joined?.id ?? null;
  const people = useMemo(() => new Map((graph?.users ?? []).map((u) => [u.id, u])), [graph]);
  const members = useMemo(() => {
    if (groupId === null) return [];
    const list = (graph?.users ?? []).filter((u) => u.groupId === groupId && u.inRoom && u.id !== me?.id);
    if (me && !meExiting) {
      const fromGraph = people.get(me.id);
      list.push({ ...(fromGraph ?? { ...me, away: false }), ...me, groupId, inRoom: true, away: false } as GraphUser);
    }
    return list;
  }, [graph, groupId, me, meExiting, people]);

  const color = joined?.color ?? graph?.groups.find((g) => g.name.toLowerCase() === name.toLowerCase())?.color ?? "#22D3EE";
  const meId = identity?.userId ?? null;

  const cardPos = selected
    ? {
        x: selected.x + 300 + 40 > window.innerWidth ? Math.max(12, selected.x - 40 - 300) : selected.x + 40,
        y: Math.max(72, Math.min(selected.y - 120, window.innerHeight - 320)),
      }
    : null;

  return (
    <motion.div
      ref={overlayRef}
      style={{ clipPath, WebkitClipPath: clipPath, scale }}
      className="fixed inset-0 z-10 touch-none overflow-hidden bg-[radial-gradient(ellipse_at_50%_45%,rgba(10,18,48,0.9),rgba(3,5,12,0.94)_70%)] backdrop-blur-[6px]"
      onClick={() => setSelected(null)}
    >
      {mediaEnabled && meId && joined && config?.realtime === "livekit" && config.livekitUrl && lkToken && (
        <LiveKitMedia serverUrl={config.livekitUrl} token={lkToken} meId={meId} onRoomEvent={onRoomEvent} onChange={setMedia} />
      )}
      {mediaEnabled && meId && joined && config?.realtime === "sse" && <LocalMedia meId={meId} onChange={setMedia} />}

      <RoomStage
        members={members}
        edges={graph?.edges ?? []}
        color={color}
        meId={meId}
        selectedId={selected?.user.id ?? null}
        levels={media?.levels ?? emptyLevels}
        onSelect={(user, p) => setSelected({ user, ...p })}
      />

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="fixed top-4 left-4 z-20 flex items-center gap-2"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            exitRoom("leave");
          }}
          className="glass flex h-10 items-center gap-1 rounded-full pr-4 pl-2.5 text-sm text-foreground/85 transition hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Map
        </button>
        <div className="glass flex h-10 items-center gap-2.5 rounded-full px-4">
          <span className="size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
          <span className="max-w-[40vw] truncate font-heading font-semibold">{joined?.name ?? name}</span>
          <span className="text-xs text-muted-foreground">{members.length} here</span>
        </div>
      </motion.header>

      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass pointer-events-none fixed bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full px-4 py-2 text-xs text-foreground/80"
          >
            Scroll up to zoom out
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {media?.screens.map((s, i) => (
          <ScreenSharePanel key={s.id} share={s} index={i} ownerName={people.get(s.ownerId)?.name ?? me?.name ?? "Someone"} />
        ))}
      </AnimatePresence>

      <div onClick={(e) => e.stopPropagation()}>
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

      <AnimatePresence>
        {selected && cardPos && (
          <ProfileCard
            key={selected.user.id}
            user={people.get(selected.user.id) ?? selected.user}
            groupName={joined?.name}
            style={{ transform: `translate3d(${cardPos.x}px, ${cardPos.y}px, 0)` }}
            onClose={() => setSelected(null)}
            onEditProfile={() => {
              setSelected(null);
              setEditOpen(true);
            }}
          />
        )}
      </AnimatePresence>

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
      <EditProfileSheet open={editOpen} onOpenChange={setEditOpen} />
    </motion.div>
  );
}
