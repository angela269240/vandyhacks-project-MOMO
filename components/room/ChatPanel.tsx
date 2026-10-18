"use client";

import { Download, Loader2, SendHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/profile/Avatar";
import type { NoteTakerStatus } from "@/hooks/useNoteTaker";
import { api } from "@/lib/client/api";
import { hueVar, identityColor } from "@/lib/colors";
import type { ChatHour, GraphUser, GroupNotes } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NotesPanel, downloadNotes } from "./NotesPanel";
import { type PanelTab, groupApi, messageKey } from "./RoomConnection";

const hourLabel = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const iconButton =
  "rounded-md p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-35";

export type ChatNotes = {
  notes: GroupNotes | undefined;
  save: (content: string, version: number) => Promise<GroupNotes>;
  refresh: () => void;
  notetakingOn: boolean;
  setNotetakingOn: (on: boolean) => void;
  status: NoteTakerStatus;
  micOn: boolean;
};

/**
 * The room's side panel: Chat and Notes, switched by tabs across the top (the dock opens it on either).
 * Chat is hour buckets and a composer (Enter sends, Shift+Enter is a newline); the draft lives in the room
 * connection, so it survives minimizing and reconnects. The sparkle button summarizes the last 100 messages;
 * on the Notes tab the header downloads the notes instead.
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
  notes,
  canSummarize,
  tab,
  onTab,
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
  notes: ChatNotes;
  canSummarize: boolean;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
}) {
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<{ text: string; count: number } | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const count = hours.reduce((n, h) => n + h.messages.length, 0);

  // Stick to the bottom as messages arrive, unless the reader scrolled up.
  const pinned = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [count]);
  // The message list remounts when coming back from the notes: start at the latest message, or at a new summary.
  useEffect(() => {
    if (tab !== "chat") return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    inputRef.current?.focus({ preventScroll: true });
  }, [tab]);
  useEffect(() => {
    if (summary && listRef.current) listRef.current.scrollTop = 0;
  }, [summary]);

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

  const summarize = async () => {
    if (summarizing) return;
    setSummarizing(true);
    try {
      const res = await api<{ summary: string | null; count: number }>(groupApi(groupName, "summary"), { method: "POST" });
      if (!res.summary) return void toast("Nothing to summarize yet");
      setSummary({ text: res.summary, count: res.count });
      onTab("chat");
    } catch (err) {
      toast.error("Couldn't summarize", { description: (err as Error).message });
    } finally {
      setSummarizing(false);
    }
  };

  const notesContent = notes.notes?.content ?? "";
  const listening = notes.status === "listening";

  return (
    <div className="flex h-full min-h-0 flex-col" data-scroll-region>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <div role="tablist" aria-label={`${groupName} panel`} className="flex items-center gap-0.5 rounded-lg bg-foreground/[0.05] p-0.5">
          {(["chat", "notes"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              id={`room-tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`room-tabpanel-${t}`}
              onClick={() => onTab(t)}
              className={cn(
                "relative rounded-md px-2.5 py-1 font-heading text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "chat" ? "Chat" : "Notes"}
              {t === "notes" && listening && (
                <span
                  className="absolute top-1 right-0.5 size-1.5 animate-pulse rounded-full bg-(--hue-sage)"
                  aria-label="AI is listening"
                />
              )}
            </button>
          ))}
        </div>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{groupName}</span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {tab === "chat" && canSummarize && (
            <button
              onClick={summarize}
              disabled={summarizing || count === 0}
              aria-label="Summarize the last 100 messages"
              title="Summarize the last 100 messages"
              className={iconButton}
            >
              {summarizing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            </button>
          )}
          {tab === "notes" && (
            <button
              onClick={() => downloadNotes(groupName, notesContent)}
              disabled={!notesContent.trim()}
              aria-label="Download notes"
              title="Download notes"
              className={iconButton}
            >
              <Download className="size-4" />
            </button>
          )}
          <button onClick={onClose} aria-label="Close panel" className={iconButton}>
            <X className="size-4" />
          </button>
        </div>
      </header>

      {tab === "notes" ? (
        <div role="tabpanel" id="room-tabpanel-notes" aria-labelledby="room-tab-notes" className="flex min-h-0 flex-1 flex-col">
          <NotesPanel
            notes={notes.notes}
            onSave={notes.save}
            onRefresh={notes.refresh}
            notetakingOn={notes.notetakingOn}
            setNotetakingOn={notes.setNotetakingOn}
            status={notes.status}
            micOn={notes.micOn}
          />
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            role="tabpanel"
            id="room-tabpanel-chat"
            aria-labelledby="room-tab-chat"
            onScroll={(e) => {
              const el = e.currentTarget;
              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2"
            aria-live="polite"
          >
            {summary && (
              <section className="mt-2 mb-3 rounded-xl border border-border bg-foreground/[0.04] px-3 py-2.5" aria-label="Summary">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">
                  <Sparkles className="size-3" />
                  Summary of the last {summary.count} messages
                  <button onClick={() => setSummary(null)} aria-label="Dismiss summary" className={cn(iconButton, "ml-auto p-0.5")}>
                    <X className="size-3" />
                  </button>
                </div>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">{summary.text}</p>
              </section>
            )}
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
        </>
      )}
    </div>
  );
}
