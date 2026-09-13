import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireAdminAreaPageAccess } from "@/lib/authorization/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireAdminAreaPageAccess();
  const label = actor.user.displayName || actor.user.email || "Administrator";
  return <AppShell area="admin" viewer={{ authenticated: true, label, initial: label.charAt(0).toUpperCase(), avatarUrl: actor.user.avatarUrl, role: actor.role }}>{children}</AppShell>;
}
