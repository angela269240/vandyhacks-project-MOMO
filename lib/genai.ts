import "server-only";
import { GenerativeAiInferenceClient } from "oci-generativeaiinference";
import { ociAuth, ociConfigured } from "./oci";

/** OCI Generative AI (Cohere chat API) for onboarding suggestions, room notes and chat summaries. */
export const genaiConfigured = () =>
  ociConfigured() && Boolean(process.env.OCI_GENAI_MODEL_ID && process.env.OCI_COMPARTMENT_OCID);

let client: GenerativeAiInferenceClient | null = null;

/** One chat turn. Returns the model's text, or null if the response had none. */
export async function chatText(opts: {
  preamble: string;
  message: string;
  maxTokens: number;
  json?: boolean;
  timeoutMs?: number;
}): Promise<string | null> {
  client ??= new GenerativeAiInferenceClient({ authenticationDetailsProvider: ociAuth() });
  const res = await withTimeout(
    client.chat({
      chatDetails: {
        compartmentId: process.env.OCI_COMPARTMENT_OCID!,
        servingMode: { servingType: "ON_DEMAND", modelId: process.env.OCI_GENAI_MODEL_ID! },
        chatRequest: {
          apiFormat: "COHERE",
          preambleOverride: opts.preamble,
          message: opts.message,
          ...(opts.json ? { responseFormat: { type: "JSON_OBJECT" } } : {}),
          maxTokens: opts.maxTokens,
          temperature: 0,
        } as never,
      },
    }),
    opts.timeoutMs ?? 10_000,
  );
  if (!res || !("chatResult" in res)) return null;
  return (res.chatResult.chatResponse as { text?: string }).text ?? null;
}

/** Parses a JSON reply, tolerating a ```json fence around it. */
export const parseJson = <T,>(raw: string) => JSON.parse(raw.replace(/^```(?:json)?|```$/gm, "").trim()) as T;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("GenAI timed out")), ms))]);
}
