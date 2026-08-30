import type { Database } from "@/lib/supabase/database.types";
import type { AcademicSelection } from "./types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export function academicSelectionFromProfile(profile: Profile | null): AcademicSelection {
  if (!profile) return {};
  const group = profile.group_choice === "both" || profile.group_choice === "not_applicable" ? "all" : profile.group_choice;
  return {
    level: profile.ca_level,
    group,
    attempt: profile.attempt_key && profile.attempt_key !== "undecided" ? profile.attempt_key : null,
  };
}
