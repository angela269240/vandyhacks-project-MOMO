import "server-only";
import type { ChatMessage } from "./types";

/**
 * PLACEHOLDER for OCI Generative AI.
 *
 * Intended implementation: `GenerativeAiInferenceClient.chat` from `oci-generativeaiinference`
 * (auth via `ociAuth()` in lib/oci.ts, model from OCI_GENAI_MODEL_ID, compartment from OCI_COMPARTMENT_OCID),
 * with the prompt:
 *   "Summarize this study-group chat in ≤2 friendly sentences for someone who missed it.
 *    Mention topics, not people's private info."
 * 8s timeout; on any failure return null so the cron just skips that hour.
 *
 * Until then this returns a deterministic stand-in so the UI's recap cards have something to show.
 */
export async function summarizeHour(messages: ChatMessage[]): Promise<string | null> {
  if (messages.length === 0) return null;
  const words = messages
    .flatMap((m) => m.text.toLowerCase().match(/[a-z][a-z'-]{4,}/g) ?? [])
    .filter((w) => !STOP.has(w));
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
  const topics = top.length ? ` Topics that came up: ${top.join(", ")}.` : "";
  return `[AI recap placeholder] ${messages.length} messages this hour.${topics}`;
}

const STOP = new Set(["about", "there", "their", "which", "would", "could", "should", "anyone", "really", "these", "those", "think", "thing", "going"]);
