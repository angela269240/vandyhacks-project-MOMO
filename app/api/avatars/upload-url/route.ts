import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createAvatarUpload } from "@/lib/storage";

/** Returns a short-lived OCI pre-authenticated PUT URL (or a local stand-in) plus the URL to display the avatar. */
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return json(await createAvatarUpload(userId));
});
