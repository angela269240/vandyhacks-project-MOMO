import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // oracledb and the OCI SDK are Node-only; keep them out of the bundle.
  serverExternalPackages: ["oracledb", "oci-common", "oci-objectstorage", "oci-generativeaiinference"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
