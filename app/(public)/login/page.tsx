import { LoginPanel } from "@/components/auth/login-panel";
import { sanitizeReturnPath } from "@/lib/auth/navigation";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  google_unavailable: "Google sign-in is not configured for this staging project yet.",
  linkedin_unavailable: "LinkedIn sign-in is not configured for this staging project yet.",
  missing_auth_code: "The sign-in callback was missing its authorization code. Please try again.",
  auth_callback_failed: "We could not complete that sign-in. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = sanitizeReturnPath(typeof params.next === "string" ? params.next : null);
  const errorKey = typeof params.error === "string" ? params.error : "";
  return <LoginPanel next={next} initialError={errors[errorKey] ?? null}/>;
}
