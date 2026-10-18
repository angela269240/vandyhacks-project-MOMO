"use client";

import { api, type Identity } from "./api";
import type { ProfileInput, User } from "../types";

/** Creates the profile for a verified school email; the photo is optional and a failed upload doesn't undo the profile. */
export async function createProfile(
  values: ProfileInput,
  avatarFile: Blob | null,
  emailToken: string,
): Promise<{ user: User; identity: Identity; avatarFailed: boolean }> {
  const { user, deviceKey } = await api<{ user: User; deviceKey: string }>("/api/users", {
    body: { ...values, emailToken },
    identity: null,
  });
  const identity = { userId: user.id, deviceKey };
  let avatarFailed = false;
  if (avatarFile) await uploadAvatar(identity, avatarFile).catch(() => (avatarFailed = true));
  return { user, identity, avatarFailed };
}

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
