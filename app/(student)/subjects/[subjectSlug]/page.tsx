import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubjectDetail } from "@/components/academic/subject-detail";
import { getSubjectBySlug, getSubjectBySlugForContext } from "@/lib/academic/query";
import { getStudentContext } from "@/lib/academic/student-context";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ subjectSlug: string }> }): Promise<Metadata> {
  const { subjectSlug } = await params;
  return { title: `${subjectSlug.replaceAll("-", " ")} | CA Progress` };
}

export default async function SubjectPage({ params, searchParams }: { params: Promise<{ subjectSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ subjectSlug }, query, context] = await Promise.all([params, searchParams, getStudentContext()]);
  const subject = context.mode === "ready"
    ? await getSubjectBySlugForContext(subjectSlug, context)
    : await getSubjectBySlug(subjectSlug, typeof query.attempt === "string" ? query.attempt : null);
  if (!subject) notFound();
  return <SubjectDetail subject={subject} context={context.selection ? { level: context.selection.level, group: context.selection.group, attempt: context.selection.attemptKey } : { attempt: typeof query.attempt === "string" ? query.attempt : null }}/>;
}
