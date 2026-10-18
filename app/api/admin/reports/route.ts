import { handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Moderation reports for the admin dashboard, newest first. */
export const GET = handle(async (req: Request) => {
  const email = requireAdmin(req);
  return json({ email, reports: await getStore().listReports(500) });
});
