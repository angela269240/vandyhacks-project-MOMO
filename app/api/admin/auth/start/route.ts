import { handle, json } from "@/lib/api";
import { isAdmin } from "@/lib/admin";
import { sendCode } from "@/lib/email-codes";
import { rateLimited } from "@/lib/rate-limit";
import { adminStartSchema } from "@/lib/schemas";

/** Emails a sign-in code if the address is an admin. Answers the same either way, so it can't list admins. */
export const POST = handle(async (req: Request) => {
  if (rateLimited(req, "admin-code", 5)) return json({ error: "Too many codes requested. Wait a minute and try again." }, { status: 429 });
  const { email } = adminStartSchema.parse(await req.json());
  if (isAdmin(email)) await sendCode("admin", email);
  return json({ ok: true });
});
