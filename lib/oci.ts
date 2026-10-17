import "server-only";
import * as common from "oci-common";

export const ociConfigured = () =>
  Boolean(
    process.env.OCI_TENANCY_OCID &&
      process.env.OCI_USER_OCID &&
      process.env.OCI_FINGERPRINT &&
      process.env.OCI_PRIVATE_KEY &&
      process.env.OCI_REGION,
  );

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
