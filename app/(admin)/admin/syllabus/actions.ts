"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminCapability } from "@/lib/authorization/server";
import { dismissAcademicQuarantine, resolveAcademicQuarantine } from "@/lib/academic/consistency";

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

export async function resolveQuarantineAction(formData: FormData) {
  const actor = await requireAdminCapability("academic.edit");
  let destination: { levelId:string;groupId:string;subjectId:string;syllabusVersionId:string;moduleId?:string|null;chapterId?:string|null };
  try { destination = JSON.parse(required(formData,"destination")); }
  catch { throw new Error("Select one valid canonical destination."); }
  await resolveAcademicQuarantine({
    quarantineId: required(formData,"quarantineId"), levelId: destination.levelId,
    attemptId: String(formData.get("attemptId") ?? "").trim() || null, groupId: destination.groupId,
    subjectId: destination.subjectId, syllabusVersionId: destination.syllabusVersionId,
    moduleId: destination.moduleId ?? null, chapterId: destination.chapterId ?? null,
    reason: required(formData,"reason"), actorUserId: actor.user.id, actorRole: actor.role,
  });
  revalidatePath("/admin/syllabus");
  redirect("/admin/syllabus?notice=Canonical+mapping+saved");
}

export async function dismissQuarantineAction(formData: FormData) {
  const actor = await requireAdminCapability("academic.edit");
  await dismissAcademicQuarantine({ quarantineId: required(formData,"quarantineId"), reason: required(formData,"reason"), actorUserId: actor.user.id, actorRole: actor.role });
  revalidatePath("/admin/syllabus");
  redirect("/admin/syllabus?notice=Quarantine+item+dismissed");
}
