"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import type { NoteTakerStatus } from "@/hooks/useNoteTaker";
import { ApiError } from "@/lib/client/api";
import { mergeNotes } from "@/lib/notes";
import type { GroupNotes } from "@/lib/types";
import { cn } from "@/lib/utils";

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

const STATUS_TEXT: Record<NoteTakerStatus, string> = {
  off: "Turn on your mic and AI notes will pick out events and key points as you talk.",
  unavailable: "AI notetaking isn't set up on this server.",
  waiting: "Waiting for you to speak.",
  listening: "Listening. Speech is turned into notes, then thrown away.",
  error: "Couldn't reach the transcriber. Trying again shortly.",
};

/** Saves a text file through the browser, which puts it in the Downloads folder by default. */
export function downloadNotes(groupName: string, content: string) {
  const slug = groupName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "room";
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-notes-${new Date().toLocaleDateString("en-CA")}.md`; // local YYYY-MM-DD
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The room's shared notes file: AI lines arrive live (events at the top, topic notes at the bottom), and anyone in the
 * room can edit it by hand. Unsaved edits are never replaced by incoming lines; a save that races one is caught.
 */
export function NotesPanel({
  notes,
  onSave,
  onRefresh,
  notetakingOn,
  setNotetakingOn,
  status,
  micOn,
}: {
  notes: GroupNotes | undefined;
  onSave: (content: string, version: number) => Promise<GroupNotes>;
  /** refetch the notes (after a save lost a race) */
  onRefresh: () => void;
  notetakingOn: boolean;
  setNotetakingOn: (on: boolean) => void;
  status: NoteTakerStatus;
  micOn: boolean;
}) {
  const content = notes?.content ?? "";
  const version = notes?.version ?? 0;
  const [draft, setDraft] = useState(content);
  const [base, setBase] = useState({ content, version });
  const [saving, setSaving] = useState(false);
  /** someone (or the AI) saved while we were editing; `notes` now holds their version */
  const [conflict, setConflict] = useState(false);
  const dirty = draft !== base.content;

  // New notes from the room: take them unless we're mid-edit (then the save catches the race).
  if (version !== base.version && !dirty) {
    setBase({ content, version });
    setDraft(content);
  }

  const save = async (text = draft, against = base.version) => {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await onSave(text, against);
      setBase({ content: saved.content, version: saved.version });
      setDraft(saved.content);
      setConflict(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        onRefresh();
      } else toast.error("Notes not saved", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const takeTheirs = () => {
    setBase({ content, version });
    setDraft(content);
    setConflict(false);
  };

  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => areaRef.current?.focus({ preventScroll: true }), []);

  const dot =
    status === "listening"
      ? "bg-(--hue-sage) animate-pulse"
      : status === "error"
        ? "bg-(--hue-ochre)"
        : notetakingOn
          ? "bg-foreground/40"
          : "bg-foreground/15";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-4 py-2.5">
        <label className="flex items-center gap-2 text-xs">
          <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
          <span className="font-medium">AI notetaking</span>
          <Switch
            size="sm"
            className="ml-auto"
            checked={notetakingOn}
            disabled={status === "unavailable"}
            onCheckedChange={(on) => setNotetakingOn(on)}
            aria-label="AI notetaking"
          />
        </label>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {notetakingOn && !micOn && status !== "unavailable" ? STATUS_TEXT.off : notetakingOn ? STATUS_TEXT[status] : "Off. Nothing you say is transcribed."}
        </p>
      </div>

      {conflict && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--hue-ochre)/25 bg-(--hue-ochre)/10 px-4 py-2 text-[11px]">
          <span className="mr-auto">The notes changed while you were editing.</span>
          <button onClick={takeTheirs} className="rounded px-1.5 py-0.5 font-medium hover:bg-foreground/10">
            Use theirs
          </button>
          <button
            onClick={() => {
              // keep my edits and add the lines that arrived meanwhile, against the version we've now been shown
              const merged = mergeNotes(base.content, draft, content);
              setDraft(merged);
              save(merged, version);
            }}
            className="rounded px-1.5 py-0.5 font-medium hover:bg-foreground/10"
          >
            Merge both
          </button>
        </div>
      )}

      <textarea
        ref={areaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl+S saves
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            if (dirty) save();
          }
        }}
        spellCheck
        placeholder={"Events go at the top, key points at the bottom.\nYou can also type here."}
        aria-label="Room notes"
        className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[12.5px] leading-relaxed outline-none placeholder:text-muted-foreground"
      />

      <div className="flex h-10 shrink-0 items-center gap-2 border-t border-border px-4 text-[11px] text-muted-foreground">
        <span className="mr-auto truncate">
          {notes?.expiresAt ? `Deleted on ${dayLabel(notes.expiresAt)}` : "Kept for 60 days from the first note"}
        </span>
        {dirty && (
          <>
            <button onClick={takeTheirs} className="rounded px-2 py-1 hover:bg-foreground/10 hover:text-foreground">
              Discard
            </button>
            <button
              onClick={() => save()}
              disabled={saving}
              className="flex items-center gap-1 rounded bg-primary px-2 py-1 font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-50"
            >
              {saving && <Loader2 className="size-3 animate-spin" />}
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}
