import { AppShell } from "@/components/shell/app-shell";
import { TimezoneSync } from "@/components/study/timezone-sync";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <AppShell area="student"><TimezoneSync/>{children}</AppShell>;
}
