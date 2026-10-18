"use client";

import { Loader2, SendHorizontal, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Avatar } from "@/components/profile/Avatar";
import { useGraph } from "@/hooks/useGraph";
import { dmPath, useDm } from "@/hooks/useDm";
import { useMe } from "@/hooks/useMe";
import { api, fetcher } from "@/lib/client/api";
import { hueVar, identityColor } from "@/lib/colors";
import type { ChatMessage, DirectChat } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIZE_KEY = "orbit.dmSize";
const DEFAULT_SIZE = { w: 340, h: 440 };
const MIN_SIZE = { w: 280, h: 300 };
/** Gap kept between the window and the viewport edges. */
const MARGIN = 16;

type Size = { w: number; h: number };
type Edge = "top" | "right" | "corner";

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

function loadSize(): Size {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    const s = raw ? (JSON.parse(raw) as Size) : null;
    if (s && Number.isFinite(s.w) && Number.isFinite(s.h)) return s;
  } catch {}
  return DEFAULT_SIZE;
}

function saveSize(size: Size) {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(size));
  } catch {
    // storage blocked: the size lasts until reload
  }
}

/** Mounts the window while a chat is open. Lives in Providers, above the map and room overlays. */
export function DirectChatWindow() {
  const { peerId, focusNonce, closeChat } = useDm();
  const { signedIn } = useMe();
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>{signedIn && peerId && <ChatWindow key="dm" peerId={peerId} focusNonce={focusNonce} onClose={closeChat} />}</AnimatePresence>
    </MotionConfig>
  );
}

/**
 * The chat with one person, docked bottom-left. Drag the top edge, right edge or top-right corner to resize; the
 * size is remembered on this device. Enter sends, Shift+Enter is a newline. New messages arrive through the lobby
 * `dm` event (Providers revalidates this chat); the 15s poll is a safety net.
 */
function ChatWindow({ peerId, focusNonce, onClose }: { peerId: string; focusNonce: number; onClose: () => void }) {
  const { me } = useMe();
  const { data: graph } = useGraph();
  const { data: chat, mutate } = useSWR<DirectChat>(dmPath(peerId), fetcher, { refreshInterval: 15_000 });
  const graphPeer = graph?.users.find((u) => u.id === peerId);
  // Someone not on the map right now (e.g. their group expired) still has a profile.
  const { data: fetchedPeer } = useSWR(graphPeer ? null : `/api/users/${peerId}`, fetcher<{ name: string; avatarUrl: string | null; interestIds: number[] }>);
  const peer = graphPeer ?? fetchedPeer;

  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  useEffect(() => setSize(loadSize()), []); // eslint-disable-line react-hooks/set-state-in-effect -- storage is only readable after mount

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messages = chat?.messages ?? [];

  // A new person: start at their latest message with the composer focused.
  const pinned = useRef(true);
  useEffect(() => {
    pinned.current = true;
    setDraft(""); // eslint-disable-line react-hooks/set-state-in-effect -- a draft belongs to one conversation
    inputRef.current?.focus({ preventScroll: true });
  }, [peerId]);
  // Asked to open the chat that's already open: no new window, just bring the composer back into focus.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [focusNonce]);
  // Stick to the bottom as messages arrive, unless the reader scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, peerId]);
  // Grow the composer with its content, up to about five lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { message } = await api<{ message: ChatMessage }>(dmPath(peerId), { body: { text } });
      await mutate(
        (c) => ({ key: c?.key ?? "", messages: c?.messages.some((m) => m.id === message.id) ? c.messages : [...(c?.messages ?? []), message] }),
        { revalidate: false },
      );
      setDraft("");
      pinned.current = true;
    } catch (err) {
      toast.error("Message not sent", { description: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  // ---- resizing: anchored bottom-left, so the top and right edges move ----
  const drag = useRef<{ edge: Edge; x: number; y: number; size: Size } | null>(null);
  const startResize = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { edge: e.currentTarget.dataset.edge as Edge, x: e.clientX, y: e.clientY, size };
  };
  const onResize = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const maxW = window.innerWidth - 2 * MARGIN;
    const maxH = window.innerHeight - 2 * MARGIN;
    setSize({
      w: d.edge === "top" ? d.size.w : Math.round(Math.min(maxW, Math.max(MIN_SIZE.w, d.size.w + e.clientX - d.x))),
      h: d.edge === "right" ? d.size.h : Math.round(Math.min(maxH, Math.max(MIN_SIZE.h, d.size.h - (e.clientY - d.y)))),
    });
  };
  const endResize = () => {
    if (!drag.current) return;
    drag.current = null;
    saveSize(size);
  };

  const name = peer?.name ?? "Someone";
  const color = peer ? identityColor(peer) : hueVar("stone");

  return (
    <motion.div
      role="dialog"
      aria-label={`Chat with ${name}`}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      style={{
        width: size.w,
        height: size.h,
        maxWidth: `calc(100vw - ${2 * MARGIN}px)`,
        maxHeight: `calc(100dvh - ${2 * MARGIN}px)`,
        transformOrigin: "bottom left",
      }}
      className="elevated fixed bottom-4 left-4 z-50 flex flex-col border border-border bg-popover text-popover-foreground backdrop-blur-xl rounded-2xl"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      data-scroll-region
    >
      {/* resize handles: top edge, right edge, top-right corner. They overhang the edge a little and the window
          doesn't clip (no overflow-hidden), or the rounded corner would cut the corner handle's hit area. */}
      {(["top", "right", "corner"] as const).map((edge) => (
        <div
          key={edge}
          aria-hidden
          data-edge={edge}
          onPointerDown={startResize}
          onPointerMove={onResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className={cn(
            "absolute touch-none",
            edge === "top" && "inset-x-4 -top-1 z-10 h-2.5 cursor-ns-resize",
            edge === "right" && "inset-y-4 -right-1 z-10 w-2.5 cursor-ew-resize",
            edge === "corner" && "-top-1 -right-1 z-20 size-5 cursor-nesw-resize",
          )}
        >
          {edge === "corner" && <span className="absolute top-2 right-2 size-2 rounded-tr-[5px] border-t-2 border-r-2 border-foreground/25" />}
        </div>
      ))}

      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border pr-3 pl-4">
        <Avatar name={name} url={peer?.avatarUrl} color={color} size={26} />
        <span className="min-w-0 truncate font-heading text-sm font-semibold">{name}</span>
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="ml-auto rounded-md p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          <X className="size-4" />
        </button>
      </header>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
        aria-live="polite"
      >
        {!chat ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            No messages yet. Say hi to {name.split(" ")[0]}!
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {messages.map((m, i) => {
              const mine = m.userId === me?.id;
              const prev = messages[i - 1];
              const newDay = !prev || !sameDay(prev.ts, m.ts);
              const grouped = !newDay && prev.userId === m.userId;
              return (
                <li key={m.id ?? `${m.ts}-${m.userId}`} className={cn("flex flex-col", !grouped && "mt-2")}>
                  {newDay && (
                    <div className="my-2 flex items-center gap-3 text-[10px] tracking-wider text-muted-foreground uppercase">
                      <span className="h-px flex-1 bg-border" />
                      {dayLabel(m.ts)}
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div
                    title={timeLabel(m.ts)}
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap",
                      mine ? "self-end rounded-br-md bg-primary text-primary-foreground" : "self-start rounded-bl-md bg-foreground/[0.07] text-foreground/90",
                    )}
                  >
                    {m.text}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex shrink-0 items-end gap-2 border-t border-border p-3"
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={`Message ${name.split(" ")[0]}`}
          aria-label="Message"
          className="max-h-[120px] min-h-10 flex-1 resize-none rounded-xl border border-input bg-input/30 px-3 py-2 text-sm leading-snug outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send message"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
        </button>
      </form>
    </motion.div>
  );
}
