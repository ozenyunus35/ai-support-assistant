import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";

export const metadata: Metadata = { title: { default: "Admin console", template: "%s · Relay" } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
