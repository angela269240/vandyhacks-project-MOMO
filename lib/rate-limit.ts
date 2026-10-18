import "server-only";

const g = globalThis as unknown as { __orbitRateLimit?: Map<string, number[]> };
const hits = (g.__orbitRateLimit ??= new Map<string, number[]>());

/** Best-effort per-IP limit for unauthenticated endpoints that cost money (per instance, sliding window). */
export function rateLimited(req: Request, bucket: string, perMinute: number): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > perMinute;
}
