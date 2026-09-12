import { AppShell } from "@/components/shell/app-shell";
import { TimezoneSync } from "@/components/study/timezone-sync";
import { StudentContextProvider } from "@/components/academic/student-context-provider";
import { getStudentContext } from "@/lib/academic/student-context";
import { OfflineRuntime } from "@/components/offline/offline-runtime";
import { loadAttemptOptions } from "@/lib/auth/server";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const context = await getStudentContext();
  const attempts = context.mode === "ready" ? await loadAttemptOptions() : [];
  const viewer = { authenticated: context.mode !== "guest", label: context.displayName, initial: context.displayName.charAt(0).toUpperCase() || "S", role: context.role };
  return <StudentContextProvider value={context}><AppShell area="student" viewer={viewer} studentContext={context} attempts={attempts}><TimezoneSync/><OfflineRuntime/>{children}</AppShell></StudentContextProvider>;
}
