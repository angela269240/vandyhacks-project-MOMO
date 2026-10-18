import { handle, json } from "@/lib/api";
import { checkCode } from "@/lib/email-codes";
import { rateLimited } from "@/lib/rate-limit";
import { emailVerifySchema } from "@/lib/schemas";
import { verifiedEmailToken } from "@/lib/verified-email";

/** Checks the emailed code; on a match returns the token POST /api/users needs. */
export const POST = handle(async (req: Request) => {
  if (rateLimited(req, "email-verify", 10)) return json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  const { email, code } = emailVerifySchema.parse(await req.json());
  if (!(await checkCode("signup", email, code))) {
    return json({ error: "That code is wrong or has expired. Check the email, or send a new code." }, { status: 400 });
  }
  return json({ emailToken: verifiedEmailToken(email) });
});
