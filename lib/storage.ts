import "server-only";
import { ObjectStorageClient, models } from "oci-objectstorage";
import { ociAuth, ociConfigured } from "./oci";

/**
 * OCI Object Storage for avatars and expired-group chat archives.
 * Without OCI credentials, avatars live in process memory (local dev only) and archives are just logged.
 */
const storageConfigured = () => ociConfigured() && Boolean(process.env.OCI_OS_NAMESPACE && process.env.OCI_OS_BUCKET);

let client: ObjectStorageClient | null = null;
const os = () => (client ??= new ObjectStorageClient({ authenticationDetailsProvider: ociAuth() }));
const endpoint = () => `https://objectstorage.${process.env.OCI_REGION}.oraclecloud.com`;
const bucketRef = () => ({ namespaceName: process.env.OCI_OS_NAMESPACE!, bucketName: process.env.OCI_OS_BUCKET! });

/** URL a browser can GET the object from: a bucket-level read PAR if provided, else the (public bucket) URL. */
function publicUrl(objectName: string) {
  const readPar = process.env.OCI_OS_READ_PAR_URL;
  if (readPar) return `${readPar.replace(/\/?$/, "/")}${encodeURIComponent(objectName)}`;
  const { namespaceName, bucketName } = bucketRef();
  return `${endpoint()}/n/${namespaceName}/b/${bucketName}/o/${encodeURIComponent(objectName)}`;
}

// ---- local fallback ----
const g = globalThis as unknown as { __socialMapperBlobs?: Map<string, { type: string; body: Uint8Array }> };
export const localBlobs = (g.__socialMapperBlobs ??= new Map());

export async function createAvatarUpload(userId: string): Promise<{ uploadUrl: string; publicUrl: string }> {
  const objectName = `avatars/${userId}-${Date.now()}.jpg`;
  if (!storageConfigured()) {
    const key = encodeURIComponent(objectName);
    return { uploadUrl: `/api/avatars/local/${key}`, publicUrl: `/api/avatars/local/${key}` };
  }
  const res = await os().createPreauthenticatedRequest({
    ...bucketRef(),
    createPreauthenticatedRequestDetails: {
      name: `avatar-upload-${userId}-${Date.now()}`,
      objectName,
      accessType: models.CreatePreauthenticatedRequestDetails.AccessType.ObjectWrite,
      timeExpires: new Date(Date.now() + 10 * 60_000),
    },
  });
  return { uploadUrl: `${endpoint()}${res.preauthenticatedRequest.accessUri}`, publicUrl: publicUrl(objectName) };
}

export async function archiveJson(objectName: string, data: unknown) {
  const body = JSON.stringify(data, null, 2);
  if (!storageConfigured()) {
    console.info(`[storage] OCI not configured; skipped archive ${objectName} (${body.length} bytes)`);
    return;
  }
  await os().putObject({
    ...bucketRef(),
    objectName,
    putObjectBody: body,
    contentLength: Buffer.byteLength(body),
    contentType: "application/json",
  });
}
