"use client";

import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/client/api";
import { identityColor } from "@/lib/colors";
import type { ChatHour, GraphUser } from "@/lib/types";
import { Avatar } from "../profile/Avatar";

const hourLabel = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function ChatSheet({
  open,
  onOpenChange,
  groupName,
  hours,
  people,
  color,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  hours: ChatHour[];
  people: Map<string, GraphUser>;
  color: string;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = hours.reduce((n, h) => n + h.messages.length, 0);

  useEffect(() => {
    if (open) requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
  }, [open, count]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await api(`/api/groups/${encodeURIComponent(groupName)}/chat`, { body: { text: body } });
      setText("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md" data-scroll-region>
        <SheetHeader className="border-b border-foreground/10 p-4">
          <SheetTitle className="flex items-center gap-2 font-heading">
            <span className="size-2.5 rounded-full" style={{ background: color }} />
            {groupName}
          </SheetTitle>
          <SheetDescription>Chat is kept by the hour.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-scroll-region>
          {hours.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Break the ice!</p>
          )}
          {hours.map((h) => (
            <section key={h.hourStart} className="mb-4">
              <div className="my-3 flex items-center gap-3 text-[11px] tracking-wider text-muted-foreground uppercase">
                <span className="h-px flex-1 bg-foreground/10" />
                {hourLabel(h.hourStart)}
                <span className="h-px flex-1 bg-foreground/10" />
              </div>
              <ul className="flex flex-col gap-2.5">
                {h.messages.map((m) => {
                  const who = people.get(m.userId);
                  const c = identityColor(who ?? { interestIds: [] });
                  return (
                    <li key={`${m.ts}-${m.userId}`} className="flex gap-2.5">
                      <Avatar name={who?.name ?? "?"} url={who?.avatarUrl} color={c} size={28} className="mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">{who?.name ?? "Someone"}</span>
                          <span className="text-[11px] text-muted-foreground">{timeLabel(m.ts)}</span>
                        </div>
                        <p className="text-sm leading-relaxed break-words text-foreground/90">{m.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-foreground/10 p-3">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message ${groupName}`}
            maxLength={1000}
            aria-label="Message"
          />
          <Button type="submit" size="icon-lg" disabled={sending || !text.trim()} aria-label="Send">
            <SendHorizontal />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
