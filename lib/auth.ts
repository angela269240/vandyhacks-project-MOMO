import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "./store";

/**
 * Demo-grade identity: no accounts. Creating a profile returns a random device key the browser keeps;
 * writes must present it. Stops casual impersonation, nothing more.
 */
export const newDeviceKey = () => randomBytes(24).toString("base64url");
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export class AuthError extends Error {}

export async function requireUser(req: Request, fallback?: { userId?: string; deviceKey?: string }) {
  const userId = req.headers.get("x-user-id") ?? fallback?.userId;
  const key = req.headers.get("x-device-key") ?? fallback?.deviceKey;
  if (!userId || !key) throw new AuthError("Missing identity");
  const stored = await getStore().getDeviceKeyHash(userId);
  const given = Buffer.from(hashKey(key));
  if (!stored || stored.length !== given.length || !timingSafeEqual(Buffer.from(stored), given)) {
    throw new AuthError("Unknown user");
  }
  return userId;
}
