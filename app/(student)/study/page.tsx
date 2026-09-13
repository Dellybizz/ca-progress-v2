import type { Metadata } from "next";
import { StudyPage } from "@/components/study/study-page";
import { getStudyPageModel } from "@/lib/study/service";
import { OfflineSnapshot } from "@/components/offline/offline-snapshot";

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
  const reflect = cleanId(params.reflect);
  const model = await getStudyPageModel(new Date(), reflect);
  return <><OfflineSnapshot kind="study" data={model}/><StudyPage
    model={model}
    initialSubjectId={cleanId(params.subjectId)}
    initialChapterId={cleanId(params.chapterId)}
    initialTaskId={cleanId(params.taskId)}
  /></>;
}
