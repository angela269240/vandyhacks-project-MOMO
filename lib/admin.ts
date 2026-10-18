import "server-only";
import { AuthError } from "./auth";
import { signToken, verifyToken } from "./tokens";

/** Accounts allowed into /admin. ADMIN_EMAILS (comma-separated) replaces the default list. */
const DEFAULT_ADMINS = ["eluo.5230@gmail.com"];

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS?.split(",") ?? DEFAULT_ADMINS).map((e) => e.trim().toLowerCase()).filter(Boolean);

export const isAdmin = (email: string) => adminEmails().includes(email.trim().toLowerCase());

const COOKIE = "orbit_admin";
const SESSION_MS = 8 * 60 * 60 * 1000;

/** Set-Cookie for a fresh admin session. Signing in again always needs a new emailed code. */
export function adminSessionCookie(email: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${signToken(email, "admin", SESSION_MS)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure}`;
}

export const clearAdminCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

/** The signed-in admin's email. Re-checks the allow-list, so removing someone ends their session. */
export function requireAdmin(req: Request) {
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`));
  const email = verifyToken(cookie?.slice(COOKIE.length + 1), "admin");
  if (!email || !isAdmin(email)) throw new AuthError("Not signed in");
  return email;
}
