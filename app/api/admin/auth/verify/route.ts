import { handle, json } from "@/lib/api";
import { adminSessionCookie, isAdmin } from "@/lib/admin";
import { checkCode } from "@/lib/email-codes";
import { rateLimited } from "@/lib/rate-limit";
import { adminVerifySchema } from "@/lib/schemas";

/** Checks the emailed code and starts an admin session (HttpOnly cookie). */
export const POST = handle(async (req: Request) => {
  if (rateLimited(req, "admin-verify", 10)) return json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  const { email, code } = adminVerifySchema.parse(await req.json());
  if (!isAdmin(email) || !(await checkCode("admin", email, code))) {
    return json({ error: "That code is wrong or has expired." }, { status: 400 });
  }
  return json({ ok: true }, { headers: { "set-cookie": adminSessionCookie(email) } });
});
