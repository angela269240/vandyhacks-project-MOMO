"use client";

import { RoomContext } from "@livekit/components-react";
import { Loader2, RotateCw, UserPlus, WifiOff } from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { EditProfileSheet } from "@/components/profile/ProfileDialogs";
import { useGraph } from "@/hooks/useGraph";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMe } from "@/hooks/useMe";
import { useRoomFriendships } from "@/hooks/useRoomFriendships";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { roomUIState } from "@/hooks/useRoomUIState";
import { identityColor, hueVar } from "@/lib/colors";
import { useGroupColor } from "@/lib/client/groupHues";
import { sceneEvents } from "@/lib/client/scene";
import type { Group, GraphUser } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { ParticipantCarousel } from "./ParticipantCarousel";
import { useRoomConnection } from "./RoomConnection";
import { RoomDock } from "./RoomDock";
import { RoomHeader } from "./RoomHeader";
import type { StageMember } from "./RoomMember";
import { RoomStage } from "./RoomStage";
import { ScreenShareStage } from "./ScreenShareStage";

const SCROLL_THRESHOLD = 160; // px of upward scroll to minimize back to the map
const HINT_KEY = "orbit.hint.minimize";
const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.55, 0, 0.75, 0.3] as const;
const CARD_W = 300;

const sameRoom = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** After a scroll-out commits, swallow trackpad momentum so it doesn't also zoom the map. */
function swallowWheel(ms: number) {
  const block = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("wheel", block, { capture: true, passive: false });
  setTimeout(() => window.removeEventListener("wheel", block, { capture: true }), ms);
}

/**
 * The full room screen. The connection itself lives in RoomConnectionProvider, so this page can unmount
 * (Minimize, browser back) without dropping voice; only the dock's Leave ends participation.
 */
export function RoomView() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params.name);
  const router = useRouter();
  const conn = useRoomConnection();
  const { enter, leave, session, voice } = conn;
  const { identity, friends } = useMe();
  const { data: graph } = useGraph();
  const groupColor = useGroupColor();
  const meId = identity?.userId ?? null;
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isWide = useMediaQuery("(min-width: 1180px)");

  const [leaving, setLeaving] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ user: GraphUser; rect: DOMRect } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const exiting = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Join (or restore) this room. Switching from another live room happens inside enter().
  useEffect(() => enter(name), [name, enter]);

  const mine = session && sameRoom(session.name, name) ? session : null;
  useEffect(() => {
    if (!mine?.missing) return;
    toast.error("That group has faded away");
    leave();
    router.replace("/");
  }, [mine?.missing, leave, router]);

  // Keep showing the room while the leave animation plays (the session is already gone by then).
  const [lastGroup, setLastGroup] = useState<Group | null>(null);
  if (mine?.group && mine.group !== lastGroup) setLastGroup(mine.group);
  const group = mine?.group ?? (leaving ? lastGroup : null);

  // ---- who's here, and how they're connected ----
  const present = useRoomPresence(group?.id ?? null, { includeMe: !leaving });
  const presentIds = useMemo(() => present.map((u) => u.id), [present]);
  const { friendsOf } = useRoomFriendships(presentIds);
  const myFriends = useMemo(
    () => new Set([...friends.friends, ...(meId ? (friendsOf.get(meId) ?? []) : [])]),
    [friends.friends, friendsOf, meId],
  );
  const members = useMemo<StageMember[]>(
    () =>
      present.map((u) => ({
        user: u,
        color: identityColor(u),
        isMe: u.id === meId,
        isFriend: u.id !== meId && myFriends.has(u.id),
        mic:
          voice.mode === "livekit"
            ? voice.micStates.has(u.id)
              ? voice.micStates.get(u.id)
                ? "on"
                : "off"
              : "none"
            : u.id === meId
              ? voice.micOn
                ? "on"
                : "off"
              : "none",
        speaking: voice.speaking.has(u.id),
        sharing: voice.shares.some((s) => s.ownerId === u.id),
      })),
    [present, meId, myFriends, voice],
  );

  const share = voice.shares[0] ?? null;
  const people = useMemo(() => new Map((graph?.users ?? []).map((u) => [u.id, u])), [graph]);
  const firstName = (id: string) => (id === meId ? "You" : (people.get(id)?.name.split(" ")[0] ?? "Someone"));
  const ui = roomUIState({
    status: mine?.status ?? null,
    leaving,
    chatOpen: conn.chatOpen,
    shareCount: voice.shares.length,
    memberCount: members.length,
  });
  const roomGroup = group ?? graph?.groups.find((g) => sameRoom(g.name, name)) ?? null;
  const color = roomGroup ? groupColor(roomGroup) : hueVar("stone");

  // ---- reveal: the room expands out of the bubble the map just zoomed into ----
  const open = useMotionValue(0);
  const clipPath = useTransform(open, (v) => `circle(${Math.max(v, 0) * 80}% at 50% 47%)`);
  const scale = useTransform(open, [0, 1], [0.9, 1]);
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

  // ---- minimize: the room contracts back into its bubble; the connection stays up ----
  const minimize = useCallback(
    async (how: "button" | "scroll" | "esc" = "button") => {
      if (exiting.current) return;
      exiting.current = true;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setSelected(null);
      sceneEvents.emit("map-resume");
      if (how === "scroll") swallowWheel(1100);
      await animate(open, 0, { duration: reduced ? 0 : 0.42, ease: EASE_IN });
      router.push("/");
    },
    [open, router],
  );

  // Clicking the map background while in a room minimizes it (the overlay usually covers the map, but not always).
  useEffect(() => sceneEvents.on("exit-room", () => minimize()), [minimize]);

  // ---- leave: media stops and presence ends right away; my node slides out, then the room contracts ----
  const leaveRoom = useCallback(async () => {
    if (exiting.current) return;
    exiting.current = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLeaving(true);
    setSelected(null);
    sceneEvents.emit("map-resume");
    const done = leave();
    await new Promise((r) => setTimeout(r, reduced ? 0 : 450));
    await animate(open, 0, { duration: reduced ? 0 : 0.45, ease: EASE_IN });
    await done;
    router.push("/");
  }, [leave, open, router]);

  // ---- scroll up (or pinch out) to minimize: scrubbed, commits past a threshold ----
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
      if (progress >= 1) minimize("scroll");
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
      // Plain scroll up counts toward minimizing (down rewinds); a trackpad pinch-out is ctrl+wheel with deltaY > 0.
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
  }, [open, minimize]);

  // Esc closes the profile card first, then minimizes (dialogs and popovers handle their own Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[data-slot="sheet-content"],[data-slot="dialog-content"],[data-slot="popover-content"]')) return;
      if (selected) setSelected(null);
      else minimize("esc");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [minimize, selected]);

  // First visit: a short "Scroll up to minimize" hint.
  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, "1");
    } catch {}
    const show = setTimeout(() => setHint(true), 1100);
    const hide = setTimeout(() => setHint(false), 4600);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  const select = useCallback((user: GraphUser, rect: DOMRect) => setSelected({ user, rect }), []);
  const cardPos = selected
    ? {
        x:
          selected.rect.right + 12 + CARD_W < window.innerWidth
            ? selected.rect.right + 12
            : Math.max(12, selected.rect.left - 12 - CARD_W),
        y: Math.max(76, Math.min(selected.rect.top - 40, window.innerHeight - 360)),
      }
    : null;

  const chatWidth = isWide ? 352 : 312;
  const chat = group && (
    <ChatPanel
      groupName={group.name}
      hours={conn.hours}
      people={people}
      meId={meId}
      color={color}
      draft={conn.draft}
      setDraft={conn.setDraft}
      onSend={conn.sendChat}
      onClose={() => conn.setChatOpen(false)}
    />
  );

  return (
    <motion.div
      ref={overlayRef}
      style={{ clipPath, WebkitClipPath: clipPath, scale }}
      className="fixed inset-0 z-10 touch-none overflow-hidden backdrop-blur-[6px]"
      onClick={() => setSelected(null)}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 45%, color-mix(in srgb, ${color} 7%, transparent), transparent 55%), radial-gradient(ellipse at 50% 40%, var(--bg-1), var(--bg-0) 72%)`,
        }}
      />
      <RoomContext.Provider value={conn.room ?? undefined}>
        <div className="relative flex h-full flex-col">
          <RoomHeader
            name={name}
            group={group}
            color={color}
            members={members}
            sharerName={share ? firstName(share.ownerId) : null}
            ui={ui}
            error={mine?.error ?? null}
            voiceMode={voice.mode}
            onRetry={conn.retry}
            onMinimize={() => minimize("button")}
            onSelect={select}
          />

          <div className="flex min-h-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col" aria-label="Room">
              <div className="relative min-h-0 flex-1">
                <AnimatePresence mode="popLayout" initial={false}>
                  {ui.presenting && share ? (
                    <motion.div
                      key="presentation"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.3, ease: EASE_OUT }}
                      className="absolute inset-0 flex flex-col gap-3 px-3 pt-1 sm:px-6"
                    >
                      <ScreenShareStage share={share} ownerName={firstName(share.ownerId)} isMine={share.ownerId === meId} color={color} />
                      <ParticipantCarousel members={members} sharerId={share.ownerId} friendsOf={friendsOf} onSelect={select} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="radial"
                      initial={{ opacity: 0, scale: 1.03 }}
                      animate={{ opacity: ui.phase === "failed" ? 0.45 : 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.03 }}
                      transition={{ duration: 0.3, ease: EASE_OUT }}
                      className="absolute inset-0"
                    >
                      <RoomStage
                        members={members}
                        friendsOf={friendsOf}
                        color={color}
                        meId={meId}
                        hoveredId={hoveredId}
                        onHover={setHoveredId}
                        onSelect={select}
                        getLevel={conn.getLevel}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <StageNotice ui={ui} error={mine?.error ?? null} onRetry={conn.retry} />

                <AnimatePresence>
                  {hint && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="glass pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs text-foreground/80"
                    >
                      Scroll up to minimize · you stay in the room
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* mobile: chat takes part of the stage's height, above the dock */}
              <AnimatePresence initial={false}>
                {!isDesktop && ui.chatOpen && (
                  <motion.section
                    key="chat-sheet"
                    aria-label="Chat"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "46dvh", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT }}
                    className="glass mx-2 shrink-0 overflow-hidden rounded-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {chat}
                  </motion.section>
                )}
              </AnimatePresence>

              <div className="flex h-[96px] shrink-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <RoomDock
                  chatOpen={ui.chatOpen}
                  unread={conn.unread}
                  micOn={voice.micOn}
                  micJoined={voice.micJoined}
                  screenOn={voice.screenOn}
                  otherSharer={share && share.ownerId !== meId ? firstName(share.ownerId) : null}
                  connecting={ui.phase === "connecting" || ui.phase === "reconnecting"}
                  onChat={() => conn.setChatOpen(!conn.chatOpen)}
                  onMic={conn.toggleMic}
                  onScreen={conn.toggleScreen}
                  onLeave={leaveRoom}
                />
              </div>
            </main>

            {/* desktop: chat is a column; the stage narrows and the bubble eases to its new size */}
            <AnimatePresence initial={false}>
              {isDesktop && ui.chatOpen && (
                <motion.aside
                  key="chat-panel"
                  aria-label="Chat"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: chatWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  className="shrink-0 overflow-hidden border-l border-border bg-card/85"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="h-full" style={{ width: chatWidth }}>
                    {chat}
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </div>
        </div>
      </RoomContext.Provider>

      <AnimatePresence>
        {selected && cardPos && (
          <ProfileCard
            key={selected.user.id}
            user={people.get(selected.user.id) ?? selected.user}
            groupName={group?.name}
            style={{ transform: `translate3d(${cardPos.x}px, ${cardPos.y}px, 0)` }}
            onClose={() => setSelected(null)}
            onEditProfile={() => {
              setSelected(null);
              setEditOpen(true);
            }}
          />
        )}
      </AnimatePresence>
      <EditProfileSheet open={editOpen} onOpenChange={setEditOpen} />
    </motion.div>
  );
}

/** Overlaid status for the stage: joining, alone in the room, or a lost connection with a way back. */
function StageNotice({
  ui,
  error,
  onRetry,
}: {
  ui: ReturnType<typeof roomUIState>;
  error: string | null;
  onRetry: () => void;
}) {
  const content =
    ui.phase === "failed" ? (
      <div role="alert" className="glass pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm">
        <WifiOff className="size-4 shrink-0 text-[var(--hue-ochre)]" aria-hidden />
        <span>{error ?? "Lost connection to the room."} Your chat draft is kept.</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/15"
        >
          <RotateCw className="size-3.5" aria-hidden /> Reconnect
        </button>
      </div>
    ) : ui.phase === "connecting" || ui.phase === "reconnecting" ? (
      <div className="glass flex items-center gap-2 rounded-full px-4 py-2 text-xs text-foreground/80" aria-live="polite">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> {ui.phase === "reconnecting" ? "Reconnecting…" : "Joining the room…"}
      </div>
    ) : ui.alone && !ui.presenting && ui.phase === "live" ? (
      <div className="glass flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm text-foreground/85">
        <UserPlus className="size-4 shrink-0 text-primary" aria-hidden />
        <span>
          You&apos;re the first one here. Your bubble is visible on the map, so friends can find you.
        </span>
      </div>
    ) : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-4">
      <AnimatePresence>
        {content && (
          <motion.div key={ui.phase + String(ui.alone)} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
