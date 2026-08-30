import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubjectDetail } from "@/components/academic/subject-detail";
import { getSubjectBySlug } from "@/lib/academic/query";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ subjectSlug: string }> }): Promise<Metadata> {
  const { subjectSlug } = await params;
  return { title: `${subjectSlug.replaceAll("-", " ")} | CA Progress` };
}

export default async function SubjectPage({ params, searchParams }: { params: Promise<{ subjectSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ subjectSlug }, query] = await Promise.all([params, searchParams]);
  const attempt = typeof query.attempt === "string" ? query.attempt : null;
  const subject = await getSubjectBySlug(subjectSlug, attempt);
  if (!subject) notFound();
  return <SubjectDetail subject={subject}/>;
}
