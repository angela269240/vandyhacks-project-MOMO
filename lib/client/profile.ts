"use client";

import { api, type Identity } from "./api";
import type { User } from "../types";

/** Uploads the avatar straight to OCI Object Storage via a pre-authenticated URL, then saves its public URL. */
export async function uploadAvatar(identity: Identity, blob: Blob): Promise<User> {
  const { uploadUrl, publicUrl } = await api<{ uploadUrl: string; publicUrl: string }>("/api/avatars/upload-url", {
    method: "POST",
    identity,
  });
  const res = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "content-type": "image/jpeg" } });
  if (!res.ok) throw new Error("Avatar upload failed");
  return api<User>(`/api/users/${identity.userId}`, { method: "PATCH", body: { avatarUrl: publicUrl }, identity });
}
