/** A room's notes file lives this long from its first line, then it's deleted. */
export const NOTES_TTL_MS = 60 * 24 * 60 * 60 * 1000;
/** Longest notes file a manual edit can save. */
export const MAX_NOTES_CHARS = 50_000;

export const notesExpiry = (createdAt: Date) => new Date(createdAt.getTime() + NOTES_TTL_MS);

/** Joins new lines onto the file at the start or end, without blank lines at the seams. */
export function joinNotes(content: string, lines: string[], position: "start" | "end") {
  const add = lines.join("\n");
  if (!content.trim()) return add;
  return position === "start" ? `${add}\n${content.replace(/^\n+/, "")}` : `${content.replace(/\n+$/, "")}\n${add}`;
}

/**
 * Merges lines someone else added since `base` into `mine`. New lines above their first surviving old line go on
 * top (where events land), the rest at the bottom. Their deletions and rewrites lose to mine.
 */
export function mergeNotes(base: string, mine: string, theirs: string) {
  const old = new Set(base.split("\n"));
  const have = new Set(mine.split("\n"));
  const lines = theirs.split("\n");
  const firstOld = lines.findIndex((l) => old.has(l));
  const added = (from: number, to: number) => lines.slice(from, to).filter((l) => l.trim() && !old.has(l) && !have.has(l));
  const top = added(0, firstOld === -1 ? 0 : firstOld);
  const bottom = added(firstOld === -1 ? 0 : firstOld, lines.length);
  return [...top, mine.replace(/^\n+|\n+$/g, ""), ...bottom].filter((l) => l !== "").join("\n");
}
