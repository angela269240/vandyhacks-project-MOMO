import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * HMAC-signed tokens for the verified-email handoff and the admin session cookie.
 * AUTH_SECRET should be set wherever more than one server instance runs (Vercel); CRON_SECRET is the fallback,
 * then a per-process random secret for local dev.
 */
const g = globalThis as unknown as { __orbitAuthSecret?: string };
function secret() {
  const s = process.env.AUTH_SECRET || process.env.CRON_SECRET;
  if (s) return s;
  return (g.__orbitAuthSecret ??= randomBytes(32).toString("hex"));
}

export const hmac = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");

type Payload = { sub: string; aud: string; exp: number };

/** `sub` (e.g. an email) for one audience, valid for `ttlMs`. */
export function signToken(sub: string, aud: string, ttlMs: number) {
  const body = Buffer.from(JSON.stringify({ sub, aud, exp: Date.now() + ttlMs } satisfies Payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

/** The token's `sub` if it's genuine, unexpired and for `aud`; otherwise null. */
export function verifyToken(token: string | null | undefined, aud: string): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(hmac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    return p.aud === aud && p.exp > Date.now() && typeof p.sub === "string" ? p.sub : null;
  } catch {
    return null;
  }
}
