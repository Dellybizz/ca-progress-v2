import { AppShell } from "@/components/shell/app-shell";
import { TimezoneSync } from "@/components/study/timezone-sync";
import { StudentContextProvider } from "@/components/academic/student-context-provider";
import { getStudentContext } from "@/lib/academic/student-context";
import { OfflineRuntime } from "@/components/offline/offline-runtime";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const context = await getStudentContext();
  return <StudentContextProvider value={context}><AppShell area="student"><TimezoneSync/><OfflineRuntime/>{children}</AppShell></StudentContextProvider>;
}
