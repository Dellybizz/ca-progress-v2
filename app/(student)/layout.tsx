import { AppShell } from "@/components/shell/app-shell";
import { TimezoneSync } from "@/components/study/timezone-sync";
import { StudentContextProvider } from "@/components/academic/student-context-provider";
import { getStudentContext } from "@/lib/academic/student-context";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const context = await getStudentContext();
  return <StudentContextProvider value={context}><AppShell area="student"><TimezoneSync/>{children}</AppShell></StudentContextProvider>;
}
