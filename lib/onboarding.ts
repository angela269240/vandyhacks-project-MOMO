import "server-only";
import { chatText, genaiConfigured, parseJson } from "./genai";
import { INTERESTS } from "./interests";

/**
 * Voice onboarding: OCI Speech (realtime) turns the intro into text in the browser, then at most one
 * OCI Generative AI call turns that text into 3-5 interests and a short bio. Keyword matching stands in
 * when GenAI isn't configured or fails, so onboarding never blocks on AI.
 */

export const MIN_MATCH = 3;
export const MAX_MATCH = 5;
/** Longest transcript we'll send to the model (a ~60s intro is well under this). */
const MAX_TRANSCRIPT = 1500;

export type ProfileSuggestion = { interestIds: number[]; bio: string | null; source: "ai" | "keywords" };

export async function suggestProfile(transcript: string): Promise<ProfileSuggestion> {
  const text = transcript.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT);
  const fromKeywords = matchKeywords(text);
  if (genaiConfigured()) {
    const ai = await askModel(text).catch((e) => {
      console.error("[onboarding] GenAI failed, using keywords", e);
      return null;
    });
    if (ai) {
      // top up from keywords if the model was stingy
      const ids = [...new Set([...ai.interestIds, ...fromKeywords])].slice(0, MAX_MATCH);
      return { interestIds: ids, bio: ai.bio, source: "ai" };
    }
  }
  return { interestIds: fromKeywords.slice(0, MAX_MATCH), bio: null, source: "keywords" };
}

// ---- GenAI ----

const PREAMBLE = `You set up profiles for Orbit, a campus app. From a student's spoken self-introduction, return JSON:
{"interests": [3-5 names copied exactly from the list], "bio": "first-person bio, at most 200 characters, no filler words"}
Only pick interests the student actually mentioned or clearly implied. List: ${INTERESTS.map((i) => i.name).join(", ")}.`;

async function askModel(transcript: string): Promise<{ interestIds: number[]; bio: string | null } | null> {
  const raw = await chatText({ preamble: PREAMBLE, message: transcript, maxTokens: 160, json: true });
  if (!raw) return null;
  const parsed = parseJson<{ interests?: unknown; bio?: unknown }>(raw);
  const names = Array.isArray(parsed.interests) ? parsed.interests.map((n) => String(n).toLowerCase()) : [];
  const interestIds = INTERESTS.filter((i) => names.includes(i.name.toLowerCase())).map((i) => i.id);
  const bio = typeof parsed.bio === "string" && parsed.bio.trim() ? parsed.bio.trim().slice(0, 280) : null;
  return { interestIds, bio };
}

// ---- keyword fallback ----

const KEYWORDS: Record<string, string[]> = {
  CS3251: ["cs3251", "cs 3251", "3251", "intermediate software", "software design"],
  Badminton: ["badminton", "shuttlecock"],
  "Baby Bio": ["baby bio", "intro bio", "biology", "bio class"],
  "Machine Learning": ["machine learning", "ml", "ai", "artificial intelligence", "neural", "deep learning", "data science"],
  Startups: ["startup", "start-up", "founder", "entrepreneur", "venture"],
  "Pre-Med": ["pre-med", "premed", "pre med", "medical school", "med school", "doctor", "mcat"],
  "Linear Algebra": ["linear algebra", "matrices", "matrix", "vectors"],
  Hackathons: ["hackathon", "hack", "hacking"],
  Robotics: ["robot", "robotics", "arduino"],
  "Game Dev": ["game dev", "game design", "unity", "unreal", "making games", "video game"],
  Photography: ["photography", "photo", "camera"],
  Film: ["film", "movie", "cinema", "filmmaking"],
  Jazz: ["jazz", "saxophone", "sax", "trumpet"],
  Chess: ["chess"],
  Debate: ["debate", "model un", "mock trial"],
  Philosophy: ["philosophy", "ethics", "existential"],
  "Rock Climbing": ["climbing", "bouldering", "climb"],
  Running: ["running", "run", "marathon", "cross country", "jogging"],
  Cooking: ["cooking", "cook", "baking", "bake", "recipes", "food"],
  Spanish: ["spanish", "español", "espanol"],
};

/** Interest ids ordered by how many of their keywords appear (whole words, plurals allowed). */
export function matchKeywords(text: string): number[] {
  const lower = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ")} `;
  return INTERESTS.map((i) => ({
    id: i.id,
    hits: (KEYWORDS[i.name] ?? [i.name.toLowerCase()]).filter((k) =>
      new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?\\b`, "u").test(lower),
    ).length,
  }))
    .filter((m) => m.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((m) => m.id);
}
