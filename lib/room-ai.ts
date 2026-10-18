import "server-only";
import { chatText, parseJson } from "./genai";
import type { Group } from "./types";

/**
 * Room AI: turns what someone said into note lines, and summarizes recent chat.
 * Transcripts arrive, get classified and are dropped; only the resulting note lines are stored.
 */

/** Longest transcript chunk we classify in one call. */
export const MAX_TRANSCRIPT = 2000;
/** Most lines one chunk can add, so a rambling stretch can't flood the file. */
const MAX_LINES = 3;
/** How much of the end of the file the model sees, so it doesn't repeat what's already there. */
const NOTES_CONTEXT = 1500;

export type NoteLines = { events: string[]; topics: string[] };

/** "Friday, October 17, 2026" in the speaker's own time zone, so "next Tuesday" resolves the way they meant it. */
function today(now: Date, timeZone: string) {
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone } as const;
  try {
    return now.toLocaleDateString("en-US", opts);
  } catch {
    return now.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  }
}

const notesPreamble = (group: Group, date: string) => `You keep the shared study notes for "${group.name}", a ${group.category} room on Orbit, a campus app.
You get a stretch of one person's speech, transcribed. Today is ${date}.
Return JSON: {"events": [...], "topics": [...]}, each a list of at most ${MAX_LINES} short single-line strings.
- events: a future meeting, deadline, exam or plan someone schedules or mentions. Start with the date and time resolved
  from today (for example "Tue Oct 21, 7 PM: CS3251 review session in Featheringill"). Use "date TBD" if none was said.
- topics: a fact, definition, explanation or key idea related to "${group.name}" or what the room is studying, written as
  a clear standalone note. Skip greetings, small talk, opinions, filler and anything unrelated to the room's subject.
Never invent details. Skip anything already in the existing notes. Return {"events": [], "topics": []} when nothing qualifies.`;

/** Note lines for a transcript chunk. Throws if the model fails; returns empty lists when nothing qualifies. */
export async function noteLines(group: Group, transcript: string, existing: string, now: Date, timeZone: string): Promise<NoteLines> {
  const text = transcript.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT);
  const tail = existing.slice(-NOTES_CONTEXT);
  const raw = await chatText({
    preamble: notesPreamble(group, today(now, timeZone)),
    message: `Existing notes (end of file):\n${tail || "(empty)"}\n\nTranscript:\n${text}`,
    maxTokens: 300,
    json: true,
  });
  if (!raw) return { events: [], topics: [] };
  const parsed = parseJson<{ events?: unknown; topics?: unknown }>(raw);
  const clean = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map((s) => String(s).replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 3)
      .slice(0, MAX_LINES)
      .map((s) => `- ${s.replace(/^[-*•]\s*/, "").slice(0, 300)}`);
  return { events: clean(parsed.events), topics: clean(parsed.topics) };
}

const SUMMARY_PREAMBLE = `You summarize a group chat from Orbit, a campus study app, for someone catching up.
Write at most 5 short bullet points ("- " each): the main topics, any decisions or plans (with dates and times), and open
questions. Use people's first names. Plain text only, no headings, no preamble.`;

/** A few bullets covering the given messages, oldest first. */
export async function summarizeChat(group: Group, lines: { name: string; ts: string; text: string }[]) {
  const transcript = lines.map((l) => `[${l.ts.slice(0, 16).replace("T", " ")}] ${l.name}: ${l.text}`).join("\n");
  const raw = await chatText({
    preamble: SUMMARY_PREAMBLE,
    message: `Room: ${group.name}\n\n${transcript}`,
    maxTokens: 350,
    timeoutMs: 20_000,
  });
  return raw?.trim() || null;
}
