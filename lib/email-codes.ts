import "server-only";
import { randomInt } from "node:crypto";
import { sendEmail } from "./email";
import { getStore } from "./store";
import { hmac } from "./tokens";

/** Six-digit one-time codes, emailed for .edu sign-up and for every admin sign-in. */
export type CodePurpose = "signup" | "admin";

const CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses before a code is thrown away and a new one has to be sent. */
const MAX_ATTEMPTS = 5;

const keyFor = (purpose: CodePurpose, email: string) => `${purpose}:${email.toLowerCase()}`;

const MESSAGES: Record<CodePurpose, (code: string) => { subject: string; text: string }> = {
  signup: (code) => ({
    subject: `${code} is your Orbit verification code`,
    text: `Your Orbit verification code is ${code}.\n\nIt expires in 10 minutes. If you didn't try to join Orbit, you can ignore this email.`,
  }),
  admin: (code) => ({
    subject: `${code} is your Orbit admin sign-in code`,
    text: `Your Orbit admin sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't try to sign in, someone else may be trying to use your account.`,
  }),
};

export async function sendCode(purpose: CodePurpose, email: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const key = keyFor(purpose, email);
  await getStore().saveEmailCode(key, hmac(`${key}:${code}`), new Date(Date.now() + CODE_TTL_MS));
  const { subject, text } = MESSAGES[purpose](code);
  await sendEmail(email, subject, text);
}

/** True once per sent code; wrong, expired or used-up codes are false. */
export async function checkCode(purpose: CodePurpose, email: string, code: string) {
  const key = keyFor(purpose, email);
  return (await getStore().checkEmailCode(key, hmac(`${key}:${code}`), new Date(), MAX_ATTEMPTS)) === "ok";
}
