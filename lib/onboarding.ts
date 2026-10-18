import "server-only";
import { AIServiceSpeechClient } from "oci-aispeech";
import { GenerativeAiInferenceClient } from "oci-generativeaiinference";
import { INTERESTS } from "./interests";
import { ociAuth, ociConfigured } from "./oci";

/**
 * Voice onboarding: OCI Speech (realtime) turns the intro into text in the browser, then at most one
 * OCI Generative AI call turns that text into 3-5 interests and a short bio. Keyword matching stands in
 * when GenAI isn't configured or fails, so onboarding never blocks on AI.
 */

export const MIN_MATCH = 3;
export const MAX_MATCH = 5;
/** Longest transcript we'll send to the model (a ~60s intro is well under this). */
const MAX_TRANSCRIPT = 1500;

export const speechConfigured = () => ociConfigured() && Boolean(process.env.OCI_COMPARTMENT_OCID);

let speech: AIServiceSpeechClient | null = null;

/** Short-lived token the browser uses to open the realtime speech websocket directly (no audio passes through us). */
export async function createSpeechSession() {
  speech ??= new AIServiceSpeechClient({ authenticationDetailsProvider: ociAuth() });
  const compartmentId = process.env.OCI_COMPARTMENT_OCID!;
  const res = await speech.createRealtimeSessionToken({ createRealtimeSessionTokenDetails: { compartmentId } });
  return {
    token: res.realtimeSessionToken.token,
    compartmentId,
    endpoint: `wss://realtime.aiservice.${process.env.OCI_REGION}.oci.oraclecloud.com/ws/transcribe/stream`,
  };
}

export type ProfileSuggestion = { interestIds: number[]; bio: string | null; source: "ai" | "keywords" };

export async function suggestProfile(transcript: string): Promise<ProfileSuggestion> {
  const text = transcript.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT);
  const fromKeywords = matchKeywords(text);
  if (ociConfigured() && process.env.OCI_GENAI_MODEL_ID && process.env.OCI_COMPARTMENT_OCID) {
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

let genai: GenerativeAiInferenceClient | null = null;

const PREAMBLE = `You set up profiles for Orbit, a campus app. From a student's spoken self-introduction, return JSON:
{"interests": [3-5 names copied exactly from the list], "bio": "first-person bio, at most 200 characters, no filler words"}
Only pick interests the student actually mentioned or clearly implied. List: ${INTERESTS.map((i) => i.name).join(", ")}.`;

async function askModel(transcript: string): Promise<{ interestIds: number[]; bio: string | null } | null> {
  genai ??= new GenerativeAiInferenceClient({ authenticationDetailsProvider: ociAuth() });
  const res = await withTimeout(
    genai.chat({
      chatDetails: {
        compartmentId: process.env.OCI_COMPARTMENT_OCID!,
        servingMode: { servingType: "ON_DEMAND", modelId: process.env.OCI_GENAI_MODEL_ID! },
        chatRequest: {
          apiFormat: "COHERE",
          preambleOverride: PREAMBLE,
          message: transcript,
          responseFormat: { type: "JSON_OBJECT" },
          maxTokens: 160,
          temperature: 0,
        } as never,
      },
    }),
    10_000,
  );
  if (!res || !("chatResult" in res)) return null;
  const raw = (res.chatResult.chatResponse as { text?: string }).text ?? "";
  const parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/gm, "").trim()) as { interests?: unknown; bio?: unknown };
  const names = Array.isArray(parsed.interests) ? parsed.interests.map((n) => String(n).toLowerCase()) : [];
  const interestIds = INTERESTS.filter((i) => names.includes(i.name.toLowerCase())).map((i) => i.id);
  const bio = typeof parsed.bio === "string" && parsed.bio.trim() ? parsed.bio.trim().slice(0, 280) : null;
  return { interestIds, bio };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("GenAI timed out")), ms))]);
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
