"use client";

export type Identity = { userId: string; deviceKey: string };

const KEY = "sm.identity";

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: Identity | null) {
  try {
    if (identity) localStorage.setItem(KEY, JSON.stringify(identity));
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: identity lasts for this tab only
  }
}

const SESSION_KEY = "orbit.session";

/** Which saved profile this tab has entered Orbit as. Per tab, so a new tab asks again. */
export function loadSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function saveSession(userId: string | null) {
  try {
    if (userId) sessionStorage.setItem(SESSION_KEY, userId);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // storage blocked: the session lasts until reload
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** fetch wrapper: JSON in/out, adds the demo identity headers, throws ApiError with the server's message. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown; identity?: Identity | null } = {}) {
  const identity = opts.identity === undefined ? loadIdentity() : opts.identity;
  const res = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(identity ? { "x-user-id": identity.userId, "x-device-key": identity.deviceKey } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? res.statusText, res.status);
  return data as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);

export const roomPath = (name: string) => `/g/${encodeURIComponent(name)}`;
