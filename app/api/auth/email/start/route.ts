import { handle, json } from "@/lib/api";
import { sendCode } from "@/lib/email-codes";
import { rateLimited } from "@/lib/rate-limit";
import { emailStartSchema } from "@/lib/schemas";

/** Emails a 6-digit code to a .edu address, the first step of creating a profile. */
export const POST = handle(async (req: Request) => {
  if (rateLimited(req, "email-code", 5)) return json({ error: "Too many codes requested. Wait a minute and try again." }, { status: 429 });
  const { email } = emailStartSchema.parse(await req.json());
  await sendCode("signup", email);
  return json({ ok: true });
});
