import type { Metadata } from "next";
import { SyllabusExplorer } from "@/components/academic/syllabus-explorer";
import { getAcademicCatalog } from "@/lib/academic/query";
import { academicSelectionFromProfile } from "@/lib/academic/profile-selection";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Syllabus Explorer | CA Progress" };

export default async function SyllabusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await optionalUser();
  const profile = user ? await getProfileForUser(user.id) : null;
  const preferred = academicSelectionFromProfile(profile);
  const catalog = await getAcademicCatalog({
    level: typeof params.level === "string" ? params.level : preferred.level,
    group: typeof params.group === "string" ? params.group : preferred.group,
    attempt: typeof params.attempt === "string" ? params.attempt : preferred.attempt,
  });
  return <SyllabusExplorer catalog={catalog}/>;
}
