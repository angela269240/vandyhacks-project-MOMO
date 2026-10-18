import "server-only";
import { signToken, verifyToken } from "./tokens";

/** Proof that a .edu address passed its emailed code, handed back to POST /api/users. */
const AUD = "signup-email";
/** Long enough to finish the welcome page (voice intro, interests) after verifying. */
const TTL_MS = 60 * 60 * 1000;

export const verifiedEmailToken = (email: string) => signToken(email, AUD, TTL_MS);
export const verifiedEmail = (token: string) => verifyToken(token, AUD);
