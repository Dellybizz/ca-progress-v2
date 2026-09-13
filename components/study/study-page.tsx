import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { PageHeader } from "@/components/ui/page-header";
import type { StudyPageModel } from "@/lib/study/types";
import { StudyFocusWorkspace } from "./study-focus-workspace";

export function StudyPage({ model, initialSubjectId = null, initialChapterId = null, initialTaskId = null }: { model: StudyPageModel; initialSubjectId?: string | null; initialChapterId?: string | null; initialTaskId?: string | null }) {
  if (model.mode === "guest") {
    return (
      <div className="phase6-page study-page">
        <PageHeader preview={false} eyebrow="Focus" title="Focus without losing your rhythm." description="Explore Focus as a guest. Sign in when you want to start a timer and save sessions to your account." />
        <LoginRequired next="/study" title="Sign in to start and save study sessions"/>
      </div>
    );
  }

  if (model.mode === "setup") {
    return (
      <div className="phase6-page study-page">
        <PageHeader
          preview={false}
          eyebrow="Focus"
          title={`Set up Focus, ${model.viewerName}.`}
          description="Choose your CA level, group and attempt first so sessions can be linked to the right subjects."
        />
        <Link href="/settings/profile" className="ui-button ui-button--primary">Complete study setup</Link>
      </div>
    );
  }

  return (
    <div className="phase6-page study-page academic-index-study">
      <StudyFocusWorkspace model={model} initialSubjectId={initialSubjectId ?? undefined} initialChapterId={initialChapterId ?? undefined} initialTaskId={initialTaskId ?? undefined}/>
    </div>
  );
}
