import type { Metadata } from "next";
import { ProgressPage } from "@/components/progress/progress-page";
import { getProgressPageModel } from "@/lib/progress/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ subjectSlug: string }> }): Promise<Metadata> {
  const { subjectSlug } = await params;
  return { title: `${subjectSlug.replaceAll("-", " ")} progress | CA Progress` };
}

export default async function SubjectProgressPage({ params }: { params: Promise<{ subjectSlug: string }> }) {
  const { subjectSlug } = await params;
  const model = await getProgressPageModel(subjectSlug);
  return <ProgressPage model={model} subjectLocked/>;
}
