import { handle, json } from "@/lib/api";
import { clearAdminCookie } from "@/lib/admin";

export const POST = handle(async () => json({ ok: true }, { headers: { "set-cookie": clearAdminCookie() } }));
