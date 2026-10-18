"use client";

import { Loader2, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/profile/Avatar";
import { hueVar, identityColor } from "@/lib/colors";
import type { ChatHour, GraphUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { messageKey } from "./RoomConnection";

const hourLabel = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Room chat: hour buckets and a composer (Enter sends, Shift+Enter is a newline).
 * The draft lives in the room connection, so it survives minimizing and reconnects.
 */
export function ChatPanel({
  groupName,
  hours,
  people,
  meId,
  color,
  draft,
  setDraft,
  onSend,
  onClose,
}: {
  groupName: string;
  hours: ChatHour[];
  people: Map<string, GraphUser>;
  meId: string | null;
  color: string;
  draft: string;
  setDraft: (text: string) => void;
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const count = hours.reduce((n, h) => n + h.messages.length, 0);

  // Stick to the bottom as messages arrive, unless the reader scrolled up.
  const pinned = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [count]);
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);

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
      await onSend(text);
      setDraft("");
      pinned.current = true;
    } catch (err) {
      toast.error("Message not sent", { description: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-scroll-region>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
        <h2 className="font-heading text-sm font-semibold">Chat</h2>
        <span className="truncate text-xs text-muted-foreground">{groupName}</span>
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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {hours.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hi!</p>}
        {hours.map((h) => (
          <section key={h.hourStart} className="mb-3">
            <div className="my-3 flex items-center gap-3 text-[10px] tracking-wider text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              {hourLabel(h.hourStart)}
              <span className="h-px flex-1 bg-border" />
            </div>
            <ul className="flex flex-col gap-3">
              {h.messages.map((m) => {
                const who = people.get(m.userId);
                const c = who ? identityColor(who) : hueVar("stone");
                const mine = m.userId === meId;
                return (
                  <li key={messageKey(m)} className="flex gap-2.5">
                    <Avatar name={who?.name ?? "?"} url={who?.avatarUrl} color={c} size={28} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className={cn("truncate text-sm font-medium", mine && "text-primary")}>
                          {mine ? "You" : (who?.name ?? "Someone")}
                        </span>
                        <time dateTime={m.ts} className="shrink-0 text-[11px] text-muted-foreground">
                          {timeLabel(m.ts)}
                        </time>
                      </div>
                      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground/90">{m.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
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
          placeholder={`Message ${groupName}`}
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
    </div>
  );
}
