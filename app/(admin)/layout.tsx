import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdminAreaPageAccess } from "@/lib/authorization/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminAreaPageAccess();
  return <AppShell area="admin">{children}</AppShell>;
}
