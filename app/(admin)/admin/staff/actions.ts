"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AppRole } from "@/lib/authorization/roles";
import { requireAdminCapability } from "@/lib/authorization/server";
import { changeStaffRoleWithAudit } from "@/lib/admin/phase1";
import { adminTraceId } from "@/lib/admin/audit";

const VALID_ROLES = new Set<AppRole>(["student", "moderator", "admin", "owner", "parent_owner"]);

export async function changeStaffRole(formData: FormData) {
  const actor = await requireAdminCapability("staff.manage");
  const targetUserId = String(formData.get("userId") ?? "").trim();
  const rawRole = String(formData.get("role") ?? "").trim() as AppRole;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!targetUserId || targetUserId.length > 160 || !VALID_ROLES.has(rawRole)) redirect("/admin/staff?error=Invalid+role+change+request");
  if (reason.length < 3 || reason.length > 1000) redirect("/admin/staff?error=A+reason+is+required");
  try {
    await changeStaffRoleWithAudit({
      actorUserId: actor.user.id,
      actorRole: actor.role,
      targetUserId,
      nextRole: rawRole,
      reason,
      traceId: adminTraceId(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Role change failed.";
    redirect(`/admin/staff?error=${encodeURIComponent(message.slice(0, 180))}`);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/staff");
  revalidatePath("/admin/audit");
  redirect("/admin/staff?notice=Role+updated+and+audited");
}
