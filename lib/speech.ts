import "server-only";
import { AIServiceSpeechClient } from "oci-aispeech";
import { ociAuth, ociConfigured } from "./oci";

/** OCI Speech realtime: the browser streams mic audio straight to OCI and gets text back; no audio passes through us. */
export const speechConfigured = () => ociConfigured() && Boolean(process.env.OCI_COMPARTMENT_OCID);

let speech: AIServiceSpeechClient | null = null;

/** Short-lived token the browser uses to open the realtime speech websocket directly. */
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
