import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
import { LangProvider } from "@/lib/i18n";

export const metadata: Metadata = { title: { default: "Admin console", template: "%s · Relay" } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <AdminShell>{children}</AdminShell>
    </LangProvider>
  );
}
