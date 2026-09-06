import type { Metadata } from "next";
import { StudyPage } from "@/components/study/study-page";
import { getStudyPageModel } from "@/lib/study/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Study | CA Progress" };

function cleanId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const clean = raw.trim();
  return clean && clean.length <= 160 ? clean : null;
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <StudyPage model={await getStudyPageModel()} initialSubjectId={cleanId(params.subjectId)} initialChapterId={cleanId(params.chapterId)}/>;
}
