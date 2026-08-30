import type { Metadata } from "next";
import { StudyPage } from "@/components/study/study-page";
import { getStudyPageModel } from "@/lib/study/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Study | CA Progress" };
export default async function Page() { return <StudyPage model={await getStudyPageModel()}/>; }
