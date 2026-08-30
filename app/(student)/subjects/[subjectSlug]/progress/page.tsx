import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  if (model.mode === "ready" && !model.chapters.length) notFound();
  return <ProgressPage model={model} subjectLocked/>;
}
