import "server-only";
import * as common from "oci-common";

/**
 * Oracle Cloud services (Speech, Generative AI, Object Storage) are disconnected: this always reports "not
 * configured", so speech and AI features show as not set up and avatars/archives use the local fallback.
 */
export const ociConfigured = () => false;

let provider: common.SimpleAuthenticationDetailsProvider | null = null;

/** API-key auth from env vars. OCI_PRIVATE_KEY is the PEM with literal "\n" escapes (Vercel-friendly). */
export function ociAuth() {
  provider ??= new common.SimpleAuthenticationDetailsProvider(
    process.env.OCI_TENANCY_OCID!,
    process.env.OCI_USER_OCID!,
    process.env.OCI_FINGERPRINT!,
    process.env.OCI_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    process.env.OCI_PRIVATE_KEY_PASSPHRASE ?? null,
    common.Region.fromRegionId(process.env.OCI_REGION!),
  );
  return provider;
}
