import type { Metadata } from "next";
import { AdminReports } from "@/components/admin/AdminReports";

export const metadata: Metadata = { title: "Reports · Orbit admin", robots: { index: false, follow: false } };

/** Moderation reports. Outside the (map) group, so no Orbit profile or map is involved; admins sign in by email code. */
export default function AdminPage() {
  return <AdminReports />;
}
