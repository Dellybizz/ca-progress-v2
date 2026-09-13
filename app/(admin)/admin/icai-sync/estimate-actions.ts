"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { recordAdminAuditEvent } from "@/lib/admin/audit";
import { requireAdminCapability } from "@/lib/authorization/server";
import { createD1AdminClient } from "@/lib/data/d1/client";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown provisional date error.";

export async function manageExamDateEstimateAction(formData: FormData) {
  let destination = "/admin/icai-sync/data";
  try {
    const operator = await requireAdminCapability("icai.review");
    const levelCode = String(formData.get("levelCode") ?? "").trim();
    const attemptKey = String(formData.get("attemptKey") ?? "").trim();
    const groupChoice = String(formData.get("groupChoice") ?? "").trim();
    const intent = String(formData.get("intent") ?? "save");
    if (
      !["foundation", "intermediate", "final"].includes(levelCode) ||
      !/^\d{4}-(01|05|09)$/.test(attemptKey) ||
      !["group_1", "group_2", "both", "not_applicable"].includes(groupChoice) ||
      !["save", "remove"].includes(intent)
    )
      throw new Error("Invalid provisional exam-date request.");
    if ((levelCode === "foundation") !== (groupChoice === "not_applicable"))
      throw new Error(
        "Foundation must use All papers; Intermediate and Final must use a group selection.",
      );
    const admin = createD1AdminClient();
    const existing = await admin
      .from("admin_exam_date_estimates")
      .select(
        "level_code,attempt_key,group_choice,estimated_date,estimated_end_date,note,updated_at",
      )
      .eq("level_code", levelCode)
      .eq("attempt_key", attemptKey)
      .eq("group_choice", groupChoice)
      .maybeSingle();
    if (existing.error) throw existing.error;
    const targetId = `${levelCode}:${attemptKey}:${groupChoice}`;
    if (intent === "remove") {
      const removed = await admin
        .from("admin_exam_date_estimates")
        .delete()
        .eq("level_code", levelCode)
        .eq("attempt_key", attemptKey)
        .eq("group_choice", groupChoice);
      if (removed.error) throw removed.error;
      await recordAdminAuditEvent({
        actorUserId: operator.user.id,
        actorRole: operator.role,
        capability: "icai.review",
        action: "icai.exam_estimate.remove",
        targetType: "admin_exam_date_estimate",
        targetId,
        reason: "Remove provisional exam date",
        previousValue: existing.data,
        newValue: null,
        traceId: crypto.randomUUID(),
        reversible: false,
      });
    } else {
      const estimatedDate = String(formData.get("estimatedDate") ?? "").trim();
      const estimatedEndDate = String(
        formData.get("estimatedEndDate") ?? "",
      ).trim();
      const note =
        String(formData.get("note") ?? "")
          .trim()
          .slice(0, 300) || null;
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(estimatedDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(estimatedEndDate) ||
        Number.isNaN(Date.parse(`${estimatedDate}T00:00:00+05:30`)) ||
        Number.isNaN(Date.parse(`${estimatedEndDate}T00:00:00+05:30`)) ||
        estimatedDate.slice(0, 7) !== attemptKey ||
        estimatedEndDate.slice(0, 7) !== attemptKey ||
        estimatedEndDate < estimatedDate
      )
        throw new Error(
          "The provisional date must be a valid day within the selected attempt month.",
        );
      const next = {
        level_code: levelCode,
        attempt_key: attemptKey,
        group_choice: groupChoice,
        estimated_date: estimatedDate,
        estimated_end_date: estimatedEndDate,
        note,
        entered_by: operator.user.id,
        updated_at: new Date().toISOString(),
      };
      const saved = await admin
        .from("admin_exam_date_estimates")
        .upsert(next, { onConflict: "level_code,attempt_key,group_choice" });
      if (saved.error) throw saved.error;
      await recordAdminAuditEvent({
        actorUserId: operator.user.id,
        actorRole: operator.role,
        capability: "icai.review",
        action: "icai.exam_estimate.save",
        targetType: "admin_exam_date_estimate",
        targetId,
        reason: "Publish provisional exam date until ICAI verification",
        previousValue: existing.data,
        newValue: next,
        traceId: crypto.randomUUID(),
        reversible: true,
      });
    }
    updateTag("dashboard-live");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/exam");
    revalidatePath("/admin/icai-sync/data");
    destination = `/admin/icai-sync/data?notice=${encodeURIComponent(intent === "remove" ? "Provisional exam date removed." : "Provisional exam date published. Official ICAI data will take priority automatically.")}`;
  } catch (error) {
    destination = `/admin/icai-sync/data?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(destination);
}
